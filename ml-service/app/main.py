import os
from contextlib import asynccontextmanager
from time import monotonic
import logging

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.model_loader import classifier_from_env, PlantClassifier
from app.gemini_fallback import classify_with_gemini, should_fallback

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}

_classifier: PlantClassifier | None = None
_rate_windows: dict[str, tuple[float, int]] = {}


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "shared"


def _enforce_predict_rate_limit(key: str) -> None:
    limit = int(os.environ.get("PREDICT_RATE_LIMIT", "30"))
    window_sec = int(os.environ.get("PREDICT_RATE_WINDOW_SEC", "60"))
    now = monotonic()
    window_start, count = _rate_windows.get(key, (now, 0))
    if now - window_start >= window_sec:
        _rate_windows[key] = (now, 1)
        return
    if count >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Limit is {limit} per {window_sec}s.",
        )
    _rate_windows[key] = (window_start, count + 1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _classifier
    try:
        _classifier = classifier_from_env()
    except FileNotFoundError as e:
        _classifier = None
        print(f"[ml-service] Model not loaded: {e}")
    yield
    _classifier = None


app = FastAPI(title="Plant Leaf ML Service", lifespan=lifespan)

origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,https://ml-project-nu-olive.vercel.app",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    gemini_enabled = bool(os.environ.get("GEMINI_API_KEY", "").strip())
    return {
        "status": "ok",
        "model_loaded": _classifier is not None,
        "mock": bool(_classifier and _classifier.mock),
        "gemini_fallback_enabled": gemini_enabled,
    }


@app.post("/predict")
async def predict(request: Request, file: UploadFile = File(...), top_k: int = 5):
    _enforce_predict_rate_limit(_client_ip(request))

    if _classifier is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Model not available. Train the model (see README) "
                "or set MOCK_PREDICT=1 for demo responses."
            ),
        )

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported type {file.content_type}. Use JPEG, PNG, or WebP.",
        )

    raw = await file.read()

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 8MB).")
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    k = max(1, min(top_k, 20))

    # ── Step 1: run local model ────────────────────────────────────────────────
    try:
        predictions = _classifier.predict_topk(raw, k=k)
        logger.info("Local model predictions: %s (confidence: %.2f%%)", 
                   predictions[0]["label"] if predictions else "none",
                   predictions[0]["confidence"] * 100 if predictions else 0)
    except (ValueError, OSError) as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid image payload: {e!s}"
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e!s}") from e

    # ── Step 2: Gemini fallback if local model is not confident enough ─────────
    source = "local_model"
    gemini_available = bool(os.environ.get("GEMINI_API_KEY", "").strip())

    if gemini_available and should_fallback(predictions):
        logger.info("Local model confidence %.2f%% below threshold, using Gemini fallback", 
                   predictions[0]["confidence"] * 100 if predictions else 0)
        try:
            gemini_preds = classify_with_gemini(
                image_bytes=raw,
                content_type=file.content_type or "image/jpeg",
                top_k=k,
            )
            logger.info("Gemini fallback predictions: %s", gemini_preds[0] if gemini_preds else "none")
            predictions = gemini_preds
            source = "gemini_fallback"
        except RuntimeError as e:
            # Gemini failed → return the local model's low-confidence result
            # with a warning rather than crashing the whole request.
            logger.warning("Gemini fallback failed: %s. Returning local model results.", e)
            source = "local_model_gemini_failed"
            return {
                "predictions": predictions,
                "source": source,
                "warning": f"Gemini fallback attempted but failed: {e!s}",
            }

    return {
        "predictions": predictions,
        "source": source,
    }
