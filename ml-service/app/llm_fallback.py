"""
llm_fallback.py
---------------
Vision-model fallback chain for the Plant Leaf ML Service.

Fallback order
--------------
  1. Groq Vision    (llama-4-scout-17b-16e-instruct, or GROQ_MODEL)   ← primary
  2. Gemini Vision  (gemini-2.5-flash, or GEMINI_MODEL)               ← secondary

Each provider is tried in order. If a provider raises RuntimeError
(quota, auth, network, bad response), the next one is tried automatically.
If all providers fail, the caller receives a RuntimeError with a summary.

Why Groq first?
---------------
  - 1,000 requests/day free  (vs Gemini's 20/day)
  - Fastest inference (LPU hardware, 500+ tokens/sec)
  - Same vision quality for leaf identification tasks

Environment variables
---------------------
# Groq (primary fallback)
GROQ_API_KEY            : required for Groq   – get at console.groq.com/keys
GROQ_MODEL              : optional – default meta-llama/llama-4-scout-17b-16e-instruct

# Gemini (secondary fallback)
GEMINI_API_KEY          : required for Gemini – get at aistudio.google.com/app/apikey
GEMINI_MODEL            : optional – default gemini-2.5-flash

# Shared
FALLBACK_CONFIDENCE_THR : optional – confidence threshold to trigger any fallback (default 0.50)
                          (also accepts legacy name GEMINI_CONFIDENCE_THR)
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Groq constants ────────────────────────────────────────────────────────────
GROQ_API_BASE        = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct"

# ── Gemini constants ──────────────────────────────────────────────────────────
GEMINI_API_BASE      = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_DEFAULT_MODEL = "gemini-2.5-flash"

# ── Shared threshold ──────────────────────────────────────────────────────────
DEFAULT_THRESHOLD = 0.50

# ── Shared system prompt (works for both providers) ───────────────────────────
_SYSTEM_PROMPT = """You are a botanist AI assistant specialised in leaf and plant identification.

Given an image of a leaf (or plant), return ONLY a JSON array (no markdown, no explanation)
with up to 5 predictions in descending confidence order.

Each element must have exactly two keys:
  "label"      : the plant scientific name or common name, followed by the local/regional name
                 in brackets (e.g. "Solanum lycopersicum (Tomato)", "Mangifera indica (Mango)")
  "confidence" : a float between 0.0 and 1.0

Example output:
[
  {"label": "Solanum lycopersicum (Tomato)", "confidence": 0.87},
  {"label": "Capsicum annuum (Bell Pepper)",  "confidence": 0.08},
  {"label": "Unknown Leaf",                   "confidence": 0.05}
]

If the image does not appear to contain a leaf or plant, return:
[{"label": "not_a_leaf", "confidence": 1.0}]

Return ONLY the JSON array. No markdown fences, no extra text.
"""


# ═════════════════════════════════════════════════════════════════════════════
# Threshold helper
# ═════════════════════════════════════════════════════════════════════════════

def _confidence_threshold() -> float:
    # Support both new FALLBACK_CONFIDENCE_THR and legacy GEMINI_CONFIDENCE_THR
    val = (
        os.environ.get("FALLBACK_CONFIDENCE_THR")
        or os.environ.get("GEMINI_CONFIDENCE_THR")
        or str(DEFAULT_THRESHOLD)
    )
    try:
        return float(val)
    except ValueError:
        return DEFAULT_THRESHOLD


def should_fallback(predictions: list[dict[str, Any]]) -> bool:
    """Return True if the local model's top confidence is below the threshold."""
    if not predictions:
        return True
    return predictions[0]["confidence"] < _confidence_threshold()


# ═════════════════════════════════════════════════════════════════════════════
# Shared JSON parser (both providers return similar JSON array text)
# ═════════════════════════════════════════════════════════════════════════════

def _parse_predictions(text: str, top_k: int, provider: str) -> list[dict[str, Any]]:
    """
    Extract and validate a JSON predictions array from raw LLM text output.
    Handles markdown fences and truncated responses gracefully.
    """
    # Strip markdown fences
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()

    json_start = text.find("[")
    json_end   = text.rfind("]")

    if json_start == -1:
        # Might be a JSON object wrapper (some models wrap array in an object)
        obj_start = text.find("{")
        if obj_start != -1:
            try:
                obj = json.loads(text[obj_start:])
                for key in ("predictions", "results", "data", "items"):
                    if isinstance(obj.get(key), list):
                        text = json.dumps(obj[key])
                        json_start = 0
                        json_end   = len(text) - 1
                        break
                else:
                    raise RuntimeError(
                        f"{provider} response missing JSON array and no known wrapper key"
                    )
            except json.JSONDecodeError:
                pass

        if json_start == -1:
            logger.error("%s response missing JSON array start: %s", provider, text[:500])
            raise RuntimeError(f"{provider} response missing JSON array")

    text = text[json_start:]

    # Auto-complete truncated JSON
    if json_end == -1 or json_end < json_start:
        logger.warning("%s response appears truncated – attempting auto-complete", provider)
        open_braces   = text.count("{") - text.count("}")
        open_brackets = text.count("[") - text.count("]")
        if text.rstrip().endswith(","):
            text = text.rstrip()[:-1]
        text += "}" * open_braces + "]" * open_brackets
    else:
        text = text[: json_end + 1]

    try:
        parsed: list[dict[str, Any]] = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("%s returned invalid JSON: %s (pos %d)", provider, text[:500], exc.pos)
        raise RuntimeError(f"{provider} returned invalid JSON: {text[:200]}") from exc

    results: list[dict[str, Any]] = []
    for item in parsed[:top_k]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "unknown_leaf")).strip()
        try:
            confidence = float(item.get("confidence", 0.0))
            confidence = max(0.0, min(1.0, confidence))
        except (TypeError, ValueError):
            confidence = 0.0
        if label and label.lower() not in ("", "null", "none"):
            results.append({"label": label, "confidence": round(confidence, 4)})

    if not results:
        logger.warning("%s returned no valid predictions", provider)
        results = [{"label": "unknown_leaf", "confidence": 0.0}]

    return results


# ═════════════════════════════════════════════════════════════════════════════
# Groq (PRIMARY fallback)
# ═════════════════════════════════════════════════════════════════════════════

def _groq_api_key() -> str:
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "GROQ_API_KEY not set. Get a free key at https://console.groq.com/keys"
        )
    return key


def _groq_model() -> str:
    return os.environ.get("GROQ_MODEL", GROQ_DEFAULT_MODEL).strip()


def classify_with_groq(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    Call Groq Vision (Llama 4 Scout) and return predictions.
    PRIMARY fallback: 1,000 req/day free, fastest inference on LPU hardware.
    Raises RuntimeError on any failure so the caller can try the next provider.

    Note: Groq base64 requests are limited to 4 MB per image.
    """
    api_key  = _groq_api_key()
    model    = _groq_model()
    mime     = content_type if content_type.startswith("image/") else "image/jpeg"
    b64      = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime};base64,{b64}"

    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 1024,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _SYSTEM_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {
                        "type": "text",
                        "text": (
                            f"Identify the leaf/plant in this image. "
                            f"Return top {top_k} predictions as a JSON array."
                        ),
                    },
                ],
            }
        ],
    }

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                GROQ_API_BASE,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("Groq HTTP error %s: %s", exc.response.status_code, exc.response.text)
        raise RuntimeError(f"Groq API returned {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Groq request error: %s", exc)
        raise RuntimeError("Could not reach Groq API") from exc

    raw = resp.json()
    try:
        text = raw["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        logger.error("Unexpected Groq response structure: %s", raw)
        raise RuntimeError("Unexpected Groq response structure") from exc

    results = _parse_predictions(text, top_k, provider="Groq")
    logger.info(
        "Groq returning %d predictions, top: %s",
        len(results), results[0] if results else None,
    )
    return results


# ═════════════════════════════════════════════════════════════════════════════
# Gemini (SECONDARY fallback)
# ═════════════════════════════════════════════════════════════════════════════

def _gemini_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/app/apikey"
        )
    return key


def _gemini_model() -> str:
    return os.environ.get("GEMINI_MODEL", GEMINI_DEFAULT_MODEL).strip()


def classify_with_gemini(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    Call Gemini Vision and return predictions.
    SECONDARY fallback: only reached when Groq fails or hits quota.
    Raises RuntimeError on any failure so the caller knows all providers failed.
    """
    api_key = _gemini_api_key()
    model   = _gemini_model()
    mime    = content_type if content_type.startswith("image/") else "image/jpeg"
    b64     = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": _SYSTEM_PROMPT},
                    {"inline_data": {"mime_type": mime, "data": b64}},
                    {
                        "text": (
                            f"Identify the leaf/plant in this image. "
                            f"Return top {top_k} predictions as a JSON array."
                        )
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1024,
        },
    }

    url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("Gemini HTTP error %s: %s", exc.response.status_code, exc.response.text)
        raise RuntimeError(f"Gemini API returned {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Gemini request error: %s", exc)
        raise RuntimeError("Could not reach Gemini API") from exc

    raw = resp.json()
    try:
        text = raw["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as exc:
        logger.error("Unexpected Gemini response structure: %s", raw)
        raise RuntimeError("Unexpected Gemini response structure") from exc

    results = _parse_predictions(text, top_k, provider="Gemini")
    logger.info(
        "Gemini returning %d predictions, top: %s",
        len(results), results[0] if results else None,
    )
    return results


# ═════════════════════════════════════════════════════════════════════════════
# Unified fallback chain  ← use this in main.py
# ═════════════════════════════════════════════════════════════════════════════

def classify_with_fallback_chain(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    top_k: int = 5,
) -> tuple[list[dict[str, Any]], str]:
    """
    Try each vision provider in order and return the first successful result.

    Chain order:
        1. Groq   (primary   — 1,000 req/day, fastest LPU inference)
        2. Gemini (secondary — 20 req/day, last safety net)

    Returns
    -------
    (predictions, source)
        source is one of: "groq_fallback", "gemini_fallback"

    Raises
    ------
    RuntimeError
        If every provider in the chain fails.
    """
    groq_available   = bool(os.environ.get("GROQ_API_KEY", "").strip())
    gemini_available = bool(os.environ.get("GEMINI_API_KEY", "").strip())

    errors: list[str] = []

    # ── 1. Groq (primary) ─────────────────────────────────────────────────────
    if groq_available:
        try:
            preds = classify_with_groq(image_bytes, content_type, top_k)
            return preds, "groq_fallback"
        except RuntimeError as exc:
            logger.warning("Groq failed (%s), trying Gemini next.", exc)
            errors.append(f"Groq: {exc}")
    else:
        logger.info("Groq skipped (GROQ_API_KEY not set)")

    # ── 2. Gemini (secondary) ─────────────────────────────────────────────────
    if gemini_available:
        try:
            preds = classify_with_gemini(image_bytes, content_type, top_k)
            return preds, "gemini_fallback"
        except RuntimeError as exc:
            logger.warning("Gemini failed (%s). No more fallbacks.", exc)
            errors.append(f"Gemini: {exc}")
    else:
        logger.info("Gemini skipped (GEMINI_API_KEY not set)")

    raise RuntimeError(
        "All vision fallback providers failed: " + " | ".join(errors)
    )