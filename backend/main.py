"""
EconomizaFacil.IA — FastAPI Backend
Entry point for the WhatsApp bot and REST API.
"""
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from app.api.webhook import router as webhook_router
from app.api.prices import router as prices_router
from app.api.analytics import router as analytics_router

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)
settings = get_settings()


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info(f"🚀 {settings.app_name} starting...")

    # Initialize Firebase
    from app.core.firebase import init_firebase
    init_firebase(settings.firebase_credentials_path, settings.firebase_project_id)
    logger.info(f"🔥 Firebase connected to project '{settings.firebase_project_id}'")

    # Ensure Evolution API instance exists
    from app.services.evolution_client import get_evolution_client
    evolution = get_evolution_client()
    created = await evolution.create_instance()
    if created:
        logger.info(f"✅ Evolution API instance '{settings.evolution_instance}' ready")
    else:
        logger.warning("⚠️  Could not verify Evolution API instance")

    logger.info(f"✅ Backend running on {settings.api_host}:{settings.api_port}")
    logger.info("📱 Webhook ready at POST /webhook/whatsapp")

    yield

    logger.info("👋 Shutting down...")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    description="WhatsApp-first grocery price comparison for Brazilian families",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend to call the REST API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(webhook_router)
app.include_router(prices_router)
app.include_router(analytics_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "endpoints": [
            "POST /webhook/whatsapp",
            "GET  /api/v1/prices/products",
            "GET  /api/v1/prices/stores",
            "GET  /api/v1/prices/compare/{product_id}",
            "GET  /api/v1/analytics/summary",
            "GET  /api/v1/analytics/events/recent",
            "GET  /health",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
    )
