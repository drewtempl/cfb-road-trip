"""
Events routes — query games from events_1 (the live import table).

events_1 columns (from CFBw1.csv import):
  id, season, week, seasonType, startDate, startTimeTBD, completed,
  neutralSite, conferenceGame, venueId, venue, homeTeam, homeConference,
  awayTeam, awayConference, ...

The `events` table defined in db.py is currently empty (schema stub only).
All queries here target events_1 until that table is reconciled.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from api.deps import get_db_path
from api.schemas import EventDetail, EventOut, VenueOut

router = APIRouter(prefix="/events", tags=["events"])

DEFAULT_DURATION = 3.5


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_utc(s: str) -> datetime:
    """Parse ISO 8601 datetime string (with optional .000Z suffix) to UTC datetime."""
    s = s.rstrip("Z").split(".")[0]
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def _time_slot(start_date: str) -> str:
    """Classify kickoff UTC time into noon / afternoon / evening."""
    dt = _parse_utc(start_date)
    hour = dt.hour + dt.minute / 60
    if hour <= 17:
        return "noon"
    elif hour <= 22:
        return "afternoon"
    return "evening"


def _day_abbr(start_date: str) -> str:
    dt = _parse_utc(start_date)
    return dt.strftime("%a")  # "Thu", "Sat", etc.


def _normalize_iso(start_date: str) -> str:
    """Trim milliseconds and ensure trailing Z."""
    return start_date.split(".")[0].rstrip("Z") + "Z"


def _row_to_event(row: sqlite3.Row) -> EventOut:
    r = dict(row)
    start = r.get("startDate", "")
    return EventOut(
        id=str(r["id"]),
        home=r.get("homeTeam") or "",
        away=r.get("awayTeam") or "",
        venue_id=str(r.get("venueId") or ""),
        venue_name=r.get("venue"),
        kickoff=_normalize_iso(start) if start else "",
        duration=DEFAULT_DURATION,
        day=_day_abbr(start) if start else None,
        time_slot=_time_slot(start) if start else None,
        conference=r.get("homeConference"),
        season=int(r.get("season") or 0),
        week=int(r.get("week") or 0),
        neutral_site=(r.get("neutralSite") or "").upper() == "TRUE",
        status="completed" if (r.get("completed") or "").upper() == "TRUE" else "scheduled",
    )


def _get_conn(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[EventOut])
def list_events(
    db_path: Annotated[Path, Depends(get_db_path)],
    season: int | None = Query(None, description="Season year, e.g. 2025"),
    week: int | None = Query(None, description="Week number"),
    category: str | None = Query(None, description="Sport category, e.g. 'cfb'"),
    day: str | None = Query(None, description="Day abbreviation: Thu, Sat, etc."),
    time_slot: str | None = Query(None, description="noon | afternoon | evening"),
    tbd_only: bool = Query(False, description="Include TBD-kickoff games"),
    limit: int = Query(500, ge=1, le=2000),
):
    """
    List games from the events_1 import table with optional filters.

    The `category` filter is accepted for API consistency but all current data
    is CFB (the events_1 table contains no category column).
    """
    conn = _get_conn(db_path)
    try:
        sql = "SELECT * FROM events_1 WHERE 1=1"
        params: list = []

        if season is not None:
            sql += " AND season = ?"
            params.append(str(season))
        if week is not None:
            sql += " AND week = ?"
            params.append(str(week))
        if not tbd_only:
            sql += " AND startTimeTBD = 'FALSE'"
        if day is not None:
            # Filter by day abbreviation computed from startDate
            # SQLite doesn't have strftime day-of-week that matches "Thu"/"Sat"
            # so we pull all and filter in Python (dataset is small, ≤2000 rows)
            pass  # handled below
        if time_slot is not None:
            pass  # handled below

        sql += " ORDER BY startDate LIMIT ?"
        params.append(limit * 5 if (day or time_slot) else limit)

        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    events = [_row_to_event(r) for r in rows]

    # Python-side filtering for computed fields
    if day:
        events = [e for e in events if e.day == day]
    if time_slot:
        events = [e for e in events if e.time_slot == time_slot]

    return events[:limit]


@router.get("/{event_id}", response_model=EventDetail)
def get_event(
    event_id: str,
    db_path: Annotated[Path, Depends(get_db_path)],
):
    """Fetch a single event by ID, including full venue details."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM events_1 WHERE id = ?", (event_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

        event = _row_to_event(row)

        # Fetch venue details (venues.id is INTEGER; venueId in events_1 is TEXT)
        try:
            venue_row = conn.execute(
                "SELECT * FROM venues WHERE id = ?", (int(event.venue_id),)
            ).fetchone()
        except (ValueError, TypeError):
            venue_row = None
    finally:
        conn.close()

    detail = EventDetail(**event.model_dump())
    if venue_row:
        from api.routes.venues import _row_to_venue
        detail.venue = _row_to_venue(venue_row)

    return detail
