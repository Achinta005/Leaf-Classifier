"""
Fine-tune EfficientNet (B0–B3) on a folder-per-class dataset.

Example:
  python train.py --data-dir ./data/dataset --epochs 15 --batch-size 16 --backbone b2
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import defaultdict
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms

from app.model_loader import (
    ARTIFACTS_DIR,
    EVAL_CROP_SIZE,
    EVAL_RESIZE_SHORT,
    IMAGENET_MEAN,
    IMAGENET_STD,
    MODEL_CONFIG_NAME,
    build_model,
)


def _default_num_workers() -> int:
    if sys.platform == "win32":
        return 0
    return min(8, max(2, (os.cpu_count() or 4) // 2))


def stratified_train_val_indices(
    targets: list[int],
    val_fraction: float,
    seed: int,
) -> tuple[list[int], list[int]]:
    """Per-class split so each class appears in val proportionally (better for imbalanced data)."""
    by_class: dict[int, list[int]] = defaultdict(list)
    for i, t in enumerate(targets):
        by_class[t].append(i)
    rng = random.Random(seed)
    train_indices: list[int] = []
    val_indices: list[int] = []
    for cls in sorted(by_class.keys()):
        idxs = list(by_class[cls])
        rng.shuffle(idxs)
        n = len(idxs)
        if n == 0:
            continue
        if n == 1:
            train_indices.extend(idxs)
            continue
        n_val = int(round(n * val_fraction))
        if n_val < 1:
            n_val = 1
        if n_val >= n:
            n_val = n - 1
        val_indices.extend(idxs[:n_val])
        train_indices.extend(idxs[n_val:])
    return train_indices, val_indices


def make_optimizer(
    model: nn.Module,
    lr: float,
    weight_decay: float,
    backbone_lr_mult: float,
    backbone_only: bool,
) -> torch.optim.AdamW:
    if backbone_only:
        params = list(model.classifier.parameters())
        return torch.optim.AdamW(params, lr=lr * 2.0, weight_decay=weight_decay)
    backbone = list(model.features.parameters())
    head = list(model.classifier.parameters())
    return torch.optim.AdamW(
        [
            {"params": backbone, "lr": lr * backbone_lr_mult, "weight_decay": weight_decay},
            {"params": head, "lr": lr, "weight_decay": weight_decay},
        ]
    )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data-dir", type=Path, required=True, help="Root with one subfolder per class")
    p.add_argument("--backbone", type=str, default="b2", choices=("b0", "b1", "b2", "b3"))
    p.add_argument("--epochs", type=int, default=15)
    p.add_argument("--batch-size", type=int, default=24)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--backbone-lr-mult", type=float, default=0.12, help="LR multiplier for feature extractor vs head")
    p.add_argument("--freeze-backbone-epochs", type=int, default=1, help="Train classifier only for this many epochs")
    p.add_argument("--weight-decay", type=float, default=0.02)
    p.add_argument("--label-smoothing", type=float, default=0.08)
    p.add_argument("--val-fraction", type=float, default=0.15)
    p.add_argument("--out-dir", type=Path, default=ARTIFACTS_DIR)
    p.add_argument("--num-workers", type=int, default=None, help="DataLoader workers (default: 0 on Windows, else CPU-based)")
    p.add_argument("--no-amp", action="store_true", help="Disable mixed precision even on CUDA")
    args = p.parse_args()

    num_workers = args.num_workers if args.num_workers is not None else _default_num_workers()

    data_dir = args.data_dir.resolve()
    if not data_dir.is_dir():
        raise SystemExit(f"data-dir not found: {data_dir}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = device.type == "cuda" and not args.no_amp
    if device.type == "cuda":
        torch.backends.cudnn.benchmark = True

    print(
        f"Using device: {device}  backbone={args.backbone}  AMP={use_amp}  "
        f"num_workers={num_workers}  freeze_backbone_epochs={args.freeze_backbone_epochs}"
    )

    train_tf = transforms.Compose(
        [
            transforms.Resize(EVAL_RESIZE_SHORT),
            transforms.RandomResizedCrop(
                EVAL_CROP_SIZE,
                scale=(0.6, 1.0),
                ratio=(0.85, 1.15),
            ),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomVerticalFlip(p=0.08),
            transforms.RandomRotation(25),
            transforms.RandomApply(
                [transforms.ColorJitter(0.18, 0.18, 0.18, 0.1)],
                p=0.9,
            ),
            transforms.RandomApply(
                [transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.2))],
                p=0.25,
            ),
            transforms.RandAugment(
                num_ops=2,
                magnitude=7,
                interpolation=transforms.InterpolationMode.BILINEAR,
            ),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            transforms.RandomErasing(p=0.22, scale=(0.02, 0.12), ratio=(0.3, 3.3)),
        ]
    )
    val_tf = transforms.Compose(
        [
            transforms.Resize(EVAL_RESIZE_SHORT),
            transforms.CenterCrop(EVAL_CROP_SIZE),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )

    train_full = datasets.ImageFolder(data_dir, transform=train_tf)
    val_full = datasets.ImageFolder(data_dir, transform=val_tf)
    class_names = train_full.classes
    if val_full.classes != class_names:
        raise SystemExit("Inconsistent class order between train/val ImageFolder.")

    n = len(train_full)
    if n < 2:
        raise SystemExit("Need at least 2 images across classes.")

    targets = train_full.targets
    train_indices, val_indices = stratified_train_val_indices(targets, args.val_fraction, seed=42)
    if not train_indices:
        raise SystemExit("Not enough samples for training after stratified val split.")
    if not val_indices:
        raise SystemExit("Not enough samples for validation after stratified split.")

    train_ds = Subset(train_full, train_indices)
    val_ds = Subset(val_full, val_indices)

    loader_kw: dict = dict(num_workers=num_workers, pin_memory=device.type == "cuda")
    if num_workers > 0:
        loader_kw["persistent_workers"] = True
        loader_kw["prefetch_factor"] = 2

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        drop_last=len(train_ds) > args.batch_size,
        **loader_kw,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        **loader_kw,
    )

    num_classes = len(class_names)
    model = build_model(num_classes, backbone=args.backbone).to(device)
    if device.type == "cuda":
        try:
            model.to(memory_format=torch.channels_last)
        except Exception:
            pass

    crit = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)
    scaler = torch.amp.GradScaler(device.type, enabled=use_amp)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    best_acc = -1.0
    best_loss = float("inf")
    best_path = args.out_dir / "best.pt"
    names_path = args.out_dir / "class_names.json"
    config_path = args.out_dir / MODEL_CONFIG_NAME

    with names_path.open("w", encoding="utf-8") as f:
        json.dump(class_names, f, indent=2)
    with config_path.open("w", encoding="utf-8") as f:
        json.dump({"backbone": args.backbone}, f, indent=2)
    print(f"Wrote {names_path} ({num_classes} classes)")
    print(f"Wrote {config_path} (backbone={args.backbone})")

    fe = max(0, min(args.freeze_backbone_epochs, max(0, args.epochs - 1)))
    post = max(1, args.epochs - fe)

    opt: torch.optim.AdamW | None = None
    sched: torch.optim.lr_scheduler.LRScheduler | None = None

    for epoch in range(1, args.epochs + 1):
        if epoch == 1 and fe > 0:
            for p in model.features.parameters():
                p.requires_grad = False
            for p in model.classifier.parameters():
                p.requires_grad = True
            opt = make_optimizer(model, args.lr, args.weight_decay, args.backbone_lr_mult, backbone_only=True)
            sched = torch.optim.lr_scheduler.CosineAnnealingLR(
                opt, T_max=max(1, fe), eta_min=args.lr * 0.05
            )
        elif fe > 0 and epoch == fe + 1:
            for p in model.features.parameters():
                p.requires_grad = True
            opt = make_optimizer(model, args.lr, args.weight_decay, args.backbone_lr_mult, backbone_only=False)
            sched = torch.optim.lr_scheduler.CosineAnnealingLR(
                opt, T_max=post, eta_min=args.lr * 0.01
            )
        elif epoch == 1 and fe == 0:
            for p in model.parameters():
                p.requires_grad = True
            opt = make_optimizer(model, args.lr, args.weight_decay, args.backbone_lr_mult, backbone_only=False)
            sched = torch.optim.lr_scheduler.CosineAnnealingLR(
                opt, T_max=args.epochs, eta_min=args.lr * 0.01
            )

        assert opt is not None and sched is not None

        model.train()
        total_loss = 0.0
        n_train = 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            if device.type == "cuda":
                x = x.to(memory_format=torch.channels_last)
            opt.zero_grad(set_to_none=True)
            with torch.amp.autocast(device.type, dtype=torch.float16, enabled=use_amp):
                logits = model(x)
                loss = crit(logits, y)
            scaler.scale(loss).backward()
            if use_amp:
                scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(
                [p for p in model.parameters() if p.requires_grad],
                max_norm=1.0,
            )
            scaler.step(opt)
            scaler.update()
            total_loss += loss.item() * x.size(0)
            n_train += x.size(0)
        train_loss = total_loss / max(1, n_train)
        sched.step()

        model.eval()
        correct = 0
        total = 0
        val_loss_sum = 0.0
        with torch.inference_mode():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                y = y.to(device, non_blocking=True)
                if device.type == "cuda":
                    x = x.to(memory_format=torch.channels_last)
                with torch.amp.autocast(device.type, dtype=torch.float16, enabled=use_amp):
                    logits = model(x)
                    vloss = crit(logits, y)
                val_loss_sum += vloss.item() * x.size(0)
                pred = logits.float().argmax(dim=1)
                correct += (pred == y).sum().item()
                total += y.numel()
        acc = correct / max(1, total)
        val_loss = val_loss_sum / max(1, total)
        print(
            f"Epoch {epoch}/{args.epochs}  train_loss={train_loss:.4f}  "
            f"val_loss={val_loss:.4f}  val_acc={acc:.4f}  lr={sched.get_last_lr()!s}"
        )

        improved = acc > best_acc or (acc == best_acc and val_loss < best_loss)
        if improved:
            best_acc = acc
            best_loss = val_loss
            torch.save(model.state_dict(), best_path)
            print(f"  saved {best_path}")

    print(f"Done. Best val acc: {best_acc:.4f}  best val loss: {best_loss:.4f}")


if __name__ == "__main__":
    main()
