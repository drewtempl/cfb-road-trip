"""
Pydantic response models for the GameTrip API.
"""

from __future__ import annotations
from typing import Any
from pydantic import BaseModel


# ─── Venues ──────────────────────────────────────────────────────────────────

class VenueOut(BaseModel):
    id: str            # serialized as string for JSON consistency
    name: str
    city: str | None = None
    state: str | None = None
    lat: float | None = None
    lng: float | None = None
    capacity: int | None = None
    country_code: str | None = None


# ─── Events ──────────────────────────────────────────────────────────────────

class EventOut(BaseModel):
    id: str
    home: str
    away: str
    venue_id: str
    venue_name: str | None = None
    kickoff: str                  # ISO 8601 UTC
    duration: float = 3.5
    day: str | None = None        # "Thu", "Sat", etc.
    time_slot: str | None = None  # "noon" | "afternoon" | "evening"
    conference: str | None = None
    season: int
    week: int
    neutral_site: bool = False
    status: str = "scheduled"


class EventDetail(EventOut):
    """Event with full venue object attached."""
    venue: VenueOut | None = None


# ─── Trips ───────────────────────────────────────────────────────────────────

class LegOut(BaseModel):
    from_event: str
    to_event: str
    drive_sec: int
    buffer_sec: int
    drive_hours: float
    buffer_hours: float
    from_label: str | None = None
    from_start: str | None = None
    to_label: str | None = None
    to_start: str | None = None


class TripOut(BaseModel):
    id: str
    season: int
    week: int
    category: str
    num_games: int
    score: float
    event_ids: list[str]
    legs: list[LegOut]
    computed_at: str


class ScoreBreakdown(BaseModel):
    game_pts: float
    buffer_pts: float
    drive_pen: float
    span_pen: float
    min_buffer_hrs: float
    total_drive_hrs: float
    time_span_hrs: float


class CustomTripOut(BaseModel):
    """On-demand trip result (not persisted)."""
    score: float
    num_games: int
    event_ids: list[str]
    legs: list[LegOut]
    breakdown: ScoreBreakdown


class ReachableEventOut(BaseModel):
    """An event reachable from a prior event, with drive/buffer details."""
    event: EventOut
    drive_sec: int
    buffer_sec: int
    drive_hours: float
    buffer_hours: float
    distance_km: float | None = None


# ─── Misc ────────────────────────────────────────────────────────────────────

class ComputeStatus(BaseModel):
    trips_stored: int
    season: int
    week: int
    category: str
    message: str
