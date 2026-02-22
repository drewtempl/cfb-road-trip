"""
GameTrip API — FastAPI application entry point.

Run locally:
    uvicorn api.main:app --reload --port 8000

Or from this file's directory:
    python -m uvicorn api.main:app --reload --port 8000

Environment variables:
    GAMETRIP_DB      Path to gametrip.db  (default: ../db/gametrip.db)
    ALLOWED_ORIGINS  Comma-separated CORS origins (default: http://localhost:5173)
    RATE_LIMIT       Requests per minute per IP (default: 60)
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

# ── Rate limiter ──────────────────────────────────────────────────────────────

_rate_limit = os.environ.get("RATE_LIMIT", "60")
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{_rate_limit}/minute"])

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="GameTrip API",
    description=(
        "College football road-trip planner. "
        "Query games, venues, and scored multi-game itineraries."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────

_origins_env = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

from api.routes import events, venues, trips  # noqa: E402 (after path setup in deps)

app.include_router(events.router, prefix="/api/v1")
app.include_router(venues.router, prefix="/api/v1")
app.include_router(trips.router, prefix="/api/v1")

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
def health():
    """Liveness probe."""
    return {"status": "ok", "version": app.version}


@app.get("/api/v1", tags=["meta"])
def api_root():
    """API root — summary of available endpoints."""
    return {
        "version": "0.1.0",
        "endpoints": {
            "events":  "/api/v1/events",
            "venues":  "/api/v1/venues",
            "trips":   "/api/v1/trips",
            "docs":    "/docs",
        },
    }
