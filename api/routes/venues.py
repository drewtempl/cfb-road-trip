"""
Venues routes.

GET /venues          — list all venues (optionally filtered by state)
GET /venues/{id}     — single venue detail
GET /venues/{id}/reachable — events reachable from any game at this venue,
                             within a given drive-time window
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from api.deps import get_db_path
from api.routes.events import _get_conn, _row_to_event, _normalize_iso, _day_abbr, _time_slot
from api.schemas import EventOut, VenueOut

router = APIRouter(prefix="/venues", tags=["venues"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_venue(row: sqlite3.Row) -> VenueOut:
    """
    Convert a venues table row to VenueOut.

    The venues table was imported from Venues_filtered.xlsx and has columns:
    ogc_fid, id (int), name, capacity, grass, dome, city, state, zip,
    countrycode, timezone, lat, lng, elevation, constructionyear.
    id is stored as an integer; we serialize it as a string for API consistency.
    """
    v = dict(row)
    return VenueOut(
        id=str(v["id"]),
        name=v["name"],
        city=v.get("city"),
        state=v.get("state"),
        lat=v.get("lat"),
        lng=v.get("lng"),
        capacity=v.get("capacity"),
        country_code=v.get("countrycode"),
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[VenueOut])
def list_venues(
    db_path: Annotated[Path, Depends(get_db_path)],
    state: str | None = Query(None, description="Two-letter state code, e.g. NC"),
    limit: int = Query(500, ge=1, le=1000),
):
    """Return all venues, optionally filtered by state."""
    conn = _get_conn(db_path)
    try:
        if state:
            rows = conn.execute(
                "SELECT * FROM venues WHERE state = ? LIMIT ?", (state.upper(), limit)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM venues LIMIT ?", (limit,)).fetchall()
    finally:
        conn.close()

    return [_row_to_venue(r) for r in rows]


@router.get("/{venue_id}", response_model=VenueOut)
def get_venue(
    venue_id: str,
    db_path: Annotated[Path, Depends(get_db_path)],
):
    """Fetch a single venue by ID."""
    try:
        venue_id_int = int(venue_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found")

    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT * FROM venues WHERE id = ?", (venue_id_int,)).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found")
    return _row_to_venue(row)


@router.get("/{venue_id}/reachable", response_model=list[EventOut])
def reachable_from_venue(
    venue_id: str,
    db_path: Annotated[Path, Depends(get_db_path)],
    season: int = Query(2025),
    week: int = Query(1),
    category: str = Query("cfb"),
    max_drive_hours: float = Query(
        12.0, ge=0.5, le=24.0,
        description="Maximum drive time in hours to consider a game reachable",
    ),
):
    """
    Return all events reachable from any game played at this venue,
    using pre-computed trip edges as the source of truth.

    An event B is 'reachable' if there exists an edge (A → B) in trip_edges
    where A is at the given venue and drive_sec <= max_drive_hours * 3600.
    """
    conn = _get_conn(db_path)
    max_drive_sec = int(max_drive_hours * 3600)

    # venues.id is INTEGER; try numeric lookup
    try:
        venue_id_int = int(venue_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found")

    try:
        # Confirm venue exists
        venue_row = conn.execute(
            "SELECT id FROM venues WHERE id = ?", (venue_id_int,)
        ).fetchone()
        if not venue_row:
            raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found")

        # Find event IDs that are AT this venue in events_1
        source_events = conn.execute(
            """
            SELECT id FROM events_1
            WHERE venueId = ?
              AND season = ?
              AND week = ?
              AND startTimeTBD = 'FALSE'
            """,
            (str(venue_id), str(season), str(week)),
        ).fetchall()

        if not source_events:
            return []

        source_ids = [str(r["id"]) for r in source_events]

        # Query trip_edges for reachable destination events
        placeholders = ",".join("?" * len(source_ids))
        edge_rows = conn.execute(
            f"""
            SELECT DISTINCT to_event
            FROM trip_edges
            WHERE season = ?
              AND week = ?
              AND category = ?
              AND from_event IN ({placeholders})
              AND drive_sec <= ?
            """,
            [season, week, category] + source_ids + [max_drive_sec],
        ).fetchall()

        if not edge_rows:
            return []

        dest_ids = [str(r["to_event"]) for r in edge_rows]
        ph2 = ",".join("?" * len(dest_ids))
        event_rows = conn.execute(
            f"SELECT * FROM events_1 WHERE id IN ({ph2})", dest_ids
        ).fetchall()
    finally:
        conn.close()

    return [_row_to_event(r) for r in event_rows]
