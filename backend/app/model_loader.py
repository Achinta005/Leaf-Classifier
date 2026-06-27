from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any, Callable

import torch
import torch.nn as nn
import torchvision.transforms as T
from PIL import Image
from torchvision.models import (
    EfficientNet_B0_Weights,
    EfficientNet_B1_Weights,
    EfficientNet_B2_Weights,
    EfficientNet_B3_Weights,
    efficientnet_b0,
    efficientnet_b1,
    efficientnet_b2,
    efficientnet_b3,
)

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"
MODEL_CONFIG_NAME = "model_config.json"

# Match ImageNet-style train (RandomResizedCrop) / eval (resize shorter side + center crop).
EVAL_RESIZE_SHORT = 256
EVAL_CROP_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
LOW_CONFIDENCE_FLOOR = 0.15

# FIX 3: Cap images at this size before processing to avoid loading huge files into memory
IMAGE_MAX_SIDE = 1024

_BACKBONES: dict[str, tuple[Callable[..., nn.Module], Any]] = {
    "b0": (efficientnet_b0, EfficientNet_B0_Weights.IMAGENET1K_V1),
    "b1": (efficientnet_b1, EfficientNet_B1_Weights.IMAGENET1K_V1),
    "b2": (efficientnet_b2, EfficientNet_B2_Weights.IMAGENET1K_V1),
    "b3": (efficientnet_b3, EfficientNet_B3_Weights.IMAGENET1K_V1),
}


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def build_model(num_classes: int, backbone: str = "b2") -> nn.Module:
    key = backbone.strip().lower()
    if key not in _BACKBONES:
        raise ValueError(f"Unknown backbone {backbone!r}; use one of {sorted(_BACKBONES)}")
    fn, weights = _BACKBONES[key]
    model = fn(weights=weights)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


def read_backbone_for_weights(weights_path: Path) -> str:
    """Backbone name for checkpoint: MODEL_BACKBONE env, else model_config.json next to weights, else b0 (legacy)."""
    env = os.environ.get("MODEL_BACKBONE", "").strip().lower()
    if env in _BACKBONES:
        return env
    cfg = weights_path.parent / MODEL_CONFIG_NAME
    if cfg.is_file():
        try:
            with cfg.open("r", encoding="utf-8") as f:
                data = json.load(f)
            b = str(data.get("backbone", "b0")).strip().lower()
            if b in _BACKBONES:
                return b
        except (json.JSONDecodeError, OSError):
            pass
    return "b0"


def load_class_names(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list) or not data:
        raise ValueError("class_names.json must be a non-empty list of strings")
    return [str(x) for x in data]


class PlantClassifier:
    def __init__(
        self,
        weights_path: Path | None,
        class_names_path: Path | None,
        mock: bool,
    ) -> None:
        self.mock = mock
        self.device = _device()
        self.class_names: list[str] = []
        self.model: nn.Module | None = None
        self._use_tta = os.environ.get("PREDICT_TTA", "1").strip().lower() not in (
            "0",
            "false",
            "no",
        )
        self.transform = T.Compose(
            [
                T.Resize(EVAL_RESIZE_SHORT, interpolation=T.InterpolationMode.BICUBIC),
                T.CenterCrop(EVAL_CROP_SIZE),
                T.ToTensor(),
                T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ]
        )

        if mock:
            self.class_names = ["demo_healthy_leaf", "demo_stressed_leaf", "demo_unknown"]
            return

        wp = weights_path or (ARTIFACTS_DIR / "best.pt")
        cp = class_names_path or (ARTIFACTS_DIR / "class_names.json")
        if not wp.is_file() or not cp.is_file():
            raise FileNotFoundError(
                f"Missing artifacts. Expected {wp} and {cp}. Train with train.py or set MOCK_PREDICT=1."
            )
        self.class_names = load_class_names(cp)
        backbone = read_backbone_for_weights(wp)
        model = build_model(len(self.class_names), backbone=backbone)
        state = torch.load(wp, map_location=self.device, weights_only=True)
        model.load_state_dict(state)
        model.to(self.device)
        model.eval()
        if self.device.type == "cuda":
            try:
                model.to(memory_format=torch.channels_last)
            except Exception:
                pass
        self.model = model

    def _forward_logits(self, x: torch.Tensor) -> torch.Tensor:
        if self.model is None:
            raise RuntimeError("Model is not initialized.")
        use_amp = self.device.type == "cuda"
        with torch.amp.autocast(self.device.type, dtype=torch.float16, enabled=use_amp):
            return self.model(x)

    @torch.inference_mode()
    def predict_topk(self, image_bytes: bytes, k: int = 5) -> list[dict[str, Any]]:
        if self.mock:
            return [
                {"label": self.class_names[i], "confidence": 0.5 - i * 0.1}
                for i in range(min(k, len(self.class_names)))
            ]

        if self.model is None:
            raise RuntimeError("Model is not initialized.")

        # FIX 3: Downsample large images before processing.
        # Images up to 8MB can be 4000x3000+; the model only needs 224x224.
        # Thumbnailing before convert("RGB") avoids decoding all those pixels
        # into memory unnecessarily, saving ~0.5-1s and significant RAM on
        # Render's 512MB free tier.
        img = Image.open(BytesIO(image_bytes))
        if max(img.size) > IMAGE_MAX_SIDE:
            img.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE), Image.LANCZOS)
        img = img.convert("RGB")

        x = self.transform(img).unsqueeze(0).to(self.device, non_blocking=self.device.type == "cuda")
        if self.device.type == "cuda":
            x = x.to(memory_format=torch.channels_last)

        logits = self._forward_logits(x).float()
        if self._use_tta:
            xf = torch.flip(x, dims=(3,))
            logits = 0.5 * (logits + self._forward_logits(xf).float())

        probs = torch.softmax(logits, dim=1)[0]
        topk = min(k, probs.numel())
        values, indices = torch.topk(probs, topk)
        out: list[dict[str, Any]] = []
        for conf, idx in zip(values.tolist(), indices.tolist()):
            label = self.class_names[idx] if idx < len(self.class_names) else str(idx)
            out.append({"label": label, "confidence": float(conf)})
        return out


def classifier_from_env() -> PlantClassifier:
    mock = os.environ.get("MOCK_PREDICT", "").strip() in ("1", "true", "True", "yes")
    mp = os.environ.get("MODEL_PATH")
    cp = os.environ.get("CLASS_NAMES_PATH")
    return PlantClassifier(
        Path(mp) if mp else None,
        Path(cp) if cp else None,
        mock=mock,
    )