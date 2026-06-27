import asyncio
import os
from contextlib import asynccontextmanager
from functools import partial
from time import monotonic
import logging

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.model_loader import classifier_from_env, PlantClassifier
from app.llm_fallback import should_fallback, classify_with_fallback_chain

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


# Labels that signal the image is not a leaf/plant
NOT_LEAF_LABELS = {"not_a_leaf", "not a leaf", "no leaf", "not_plant"}

def _is_not_a_leaf(predictions: list[dict]) -> bool:
    """
    Returns True if the top prediction explicitly signals a non-leaf image.
    Handles labels returned by both the local model and LLM fallbacks.
    """
    if not predictions:
        return True
    label_clean = predictions[0]["label"].lower().strip()
    return any(label_clean == nl for nl in NOT_LEAF_LABELS)


NOT_LEAF_RESPONSE = {
    "predictions": [],
    "source": "local_model",
    "error": "not_a_leaf",
    "message": (
        "The uploaded image does not appear to be a leaf or plant. "
        "Please upload a clear image of a leaf."
    ),
}


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


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    gemini_enabled = bool(os.environ.get("GEMINI_API_KEY", "").strip())
    groq_enabled   = bool(os.environ.get("GROQ_API_KEY", "").strip())
    return {
        "status": "ok",
        "model_loaded": _classifier is not None,
        "mock": bool(_classifier and _classifier.mock),
        "gemini_fallback_enabled": gemini_enabled,
        "groq_fallback_enabled": groq_enabled,
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

    # ── Step 1: Run local model ────────────────────────────────────────────────
    # FIX 5: predict_topk is CPU-bound (PyTorch inference + PIL decode).
    # Running it directly in an async def blocks the entire event loop, meaning
    # no other requests can be served while inference runs (~5-8s on free tier).
    # run_in_executor offloads it to a thread so the event loop stays free.
    try:
        loop = asyncio.get_event_loop()
        predictions = await loop.run_in_executor(
            None, partial(_classifier.predict_topk, raw, k)
        )
        logger.info(
            "Local model prediction: %s (confidence: %.2f%%)",
            predictions[0]["label"] if predictions else "none",
            predictions[0]["confidence"] * 100 if predictions else 0,
        )
    except (ValueError, OSError) as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid image payload: {e!s}"
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e!s}") from e

    source = "local_model"

    any_llm_available = bool(
        os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("GROQ_API_KEY", "").strip()
    )

    # ── Step 2: LLM fallback chain (low confidence → try Groq then Gemini) ─────
    # FIX 2: classify_with_fallback_chain is now async (uses httpx.AsyncClient),
    # so we await it instead of calling it synchronously.
    if any_llm_available and should_fallback(predictions):
        logger.info(
            "Local model confidence %.2f%% below threshold — trying LLM fallback chain.",
            predictions[0]["confidence"] * 100 if predictions else 0,
        )
        try:
            predictions, source = await classify_with_fallback_chain(
                image_bytes=raw,
                content_type=file.content_type or "image/jpeg",
                top_k=k,
            )
            logger.info("LLM fallback succeeded via: %s", source)
        except RuntimeError as e:
            # Every LLM provider failed — return local model result with a warning
            logger.warning(
                "All LLM fallbacks failed: %s. Returning local model results.", e
            )
            return {
                "predictions": predictions,
                "source": "local_model_all_fallbacks_failed",
                "warning": f"All vision fallbacks failed: {e!s}",
            }

    # ── Step 3: Not-a-leaf guard (runs on both local and LLM results) ──────────
    if _is_not_a_leaf(predictions):
        logger.info(
            "Image rejected as non-leaf. Top label: %s (source: %s)",
            predictions[0]["label"] if predictions else "none",
            source,
        )
        return {**NOT_LEAF_RESPONSE, "source": source}

    # ── Step 4: Return final predictions ──────────────────────────────────────
    return {
        "predictions": predictions,
        "source": source,
    }