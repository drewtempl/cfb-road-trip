"""
Trips routes.

GET  /trips               — ranked trips (3-tier cache fallback)
GET  /trips/{id}          — single trip
POST /trips/compute       — trigger/refresh trip computation for a week
POST /trips/custom        — on-demand trips from user-selected starting events
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from api.deps import get_db_path
from api.routes.events import _get_conn
from api.schemas import ComputeStatus, CustomTripOut, LegOut, ScoreBreakdown, TripOut

router = APIRouter(prefix="/trips", tags=["trips"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _leg_out(raw: dict) -> LegOut:
    drive_sec = int(raw.get("drive_sec", 0))
    buffer_sec = int(raw.get("buffer_sec", 0))
    return LegOut(
        from_event=raw.get("from_event", ""),
        to_event=raw.get("to_event", ""),
        drive_sec=drive_sec,
        buffer_sec=buffer_sec,
        drive_hours=round(drive_sec / 3600, 3),
        buffer_hours=round(buffer_sec / 3600, 3),
        from_label=raw.get("from_label"),
        from_start=raw.get("from_start"),
        to_label=raw.get("to_label"),
        to_start=raw.get("to_start"),
    )


def _row_to_trip(row: sqlite3.Row) -> TripOut:
    r = dict(row)
    event_ids = json.loads(r["event_ids"]) if isinstance(r["event_ids"], str) else r["event_ids"]
    legs_raw = json.loads(r["legs"]) if isinstance(r["legs"], str) else r["legs"]
    return TripOut(
        id=r["id"],
        season=r["season"],
        week=r["week"],
        category=r["category"],
        num_games=r["num_games"],
        score=round(r["score"], 3),
        event_ids=event_ids,
        legs=[_leg_out(l) for l in legs_raw],
        computed_at=r["computed_at"],
    )


def _fetch_computed(
    conn: sqlite3.Connection,
    season: int,
    week: int,
    category: str,
    min_games: int | None,
    max_games: int | None,
    limit: int,
) -> list[TripOut]:
    sql = """
        SELECT * FROM computed_trips
        WHERE season = ? AND week = ? AND category = ?
    """
    params: list = [season, week, category]
    if min_games is not None:
        sql += " AND num_games >= ?"
        params.append(min_games)
    if max_games is not None:
        sql += " AND num_games <= ?"
        params.append(max_games)
    sql += " ORDER BY score DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    return [_row_to_trip(r) for r in rows]


def _run_generate(db_path: Path, season: int, week: int, category: str, top_n: int) -> int:
    """
    Run the full trip-generation pipeline (graph → paths → score → persist).
    Returns the number of trips stored.

    Imports are deferred so the heavy modules aren't loaded at startup.
    """
    from trip_generator import generate_trips  # noqa: PLC0415 (db/ on sys.path)

    ranked, _ = generate_trips(
        season=season,
        week=week,
        category=category,
        dry_run=False,
        top_n=top_n,
        db_path=db_path,
    )
    return len(ranked)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TripOut])
def list_trips(
    db_path: Annotated[Path, Depends(get_db_path)],
    season: int = Query(2025),
    week: int = Query(1),
    category: str = Query("cfb"),
    min_games: int | None = Query(None, ge=2, description="Minimum stops"),
    max_games: int | None = Query(None, le=10, description="Maximum stops"),
    limit: int = Query(20, ge=1, le=200),
    auto_compute: bool = Query(
        False,
        description=(
            "If true and no cached trips exist, run the full generation pipeline "
            "synchronously before returning. Can take 30–120 s for a full week."
        ),
    ),
):
    """
    Return ranked road-trip itineraries.

    Cache strategy
    ──────────────
    Tier 1 — computed_trips table (pre-ranked, instant).
    Tier 2 — generate_trips() pipeline (graph → DFS → score → persist),
             triggered only when auto_compute=true and no cache exists.

    By default (auto_compute=false) an empty list is returned when no
    trips have been computed yet. Call POST /trips/compute to pre-populate.
    """
    conn = _get_conn(db_path)
    try:
        trips = _fetch_computed(conn, season, week, category, min_games, max_games, limit)
    finally:
        conn.close()

    if trips:
        return trips

    if not auto_compute:
        return []

    # Tier 2: synchronous generation
    top_n = max(limit, 100)
    _run_generate(db_path, season, week, category, top_n)

    conn = _get_conn(db_path)
    try:
        trips = _fetch_computed(conn, season, week, category, min_games, max_games, limit)
    finally:
        conn.close()
    return trips


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(
    trip_id: str,
    db_path: Annotated[Path, Depends(get_db_path)],
):
    """Return a single pre-computed trip by its deterministic UUID."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM computed_trips WHERE id = ?", (trip_id,)
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    return _row_to_trip(row)


@router.post("/compute", response_model=ComputeStatus)
def compute_trips(
    db_path: Annotated[Path, Depends(get_db_path)],
    background_tasks: BackgroundTasks,
    season: int = Query(2025),
    week: int = Query(1),
    category: str = Query("cfb"),
    top_n: int = Query(100, ge=10, le=500),
    async_: bool = Query(
        False,
        alias="async",
        description="Run in background and return immediately (202 Accepted).",
    ),
):
    """
    Trigger (or re-trigger) the full trip-generation pipeline for a given week.

    Use async=true to kick off generation in the background and return
    immediately. Poll GET /trips to see when results appear.
    """
    if async_:
        background_tasks.add_task(_run_generate, db_path, season, week, category, top_n)
        return JSONResponse(
            status_code=202,
            content={
                "message": "Generation started in background — poll GET /trips to see results.",
                "season": season,
                "week": week,
                "category": category,
                "trips_stored": 0,
            },
        )

    stored = _run_generate(db_path, season, week, category, top_n)
    return ComputeStatus(
        trips_stored=stored,
        season=season,
        week=week,
        category=category,
        message=f"Stored {stored} trips for season={season} week={week} category={category}",
    )


@router.post("/custom", response_model=list[CustomTripOut])
def custom_trips(
    db_path: Annotated[Path, Depends(get_db_path)],
    start_event_ids: list[str],
    max_games: int = Query(4, ge=2, le=6),
    limit: int = Query(20, ge=1, le=100),
):
    """
    On-demand trip generation from user-selected starting events.

    Runs DFS only from the provided starting event IDs and returns scored
    trips without persisting them. Useful for building a custom itinerary
    starting from a specific game.

    Body: JSON array of event IDs to use as starting points.
    """
    if not start_event_ids:
        raise HTTPException(status_code=422, detail="Provide at least one start_event_id")

    # Deferred imports (db/ on sys.path via deps.py)
    from graph import build_graph, load_distance_map, load_events, _get_conn as _graph_conn  # noqa: PLC0415
    from pathfinder import TripPath  # noqa: PLC0415
    from scorer import rank_trips  # noqa: PLC0415

    conn = _graph_conn(db_path)
    try:
        all_events = load_events(conn)
        if not all_events:
            raise HTTPException(status_code=503, detail="No schedulable events in DB")
        venue_ids = {e.venue_id for e in all_events}
        distance_map = load_distance_map(conn, venue_ids)
    finally:
        conn.close()

    graph = build_graph(all_events, distance_map)

    # Validate requested start events exist in the graph
    valid_starts = [eid for eid in start_event_ids if eid in graph.events]
    if not valid_starts:
        raise HTTPException(
            status_code=404,
            detail=(
                "None of the provided event IDs were found in the graph. "
                "Check that season/week data is loaded."
            ),
        )

    # Inline DFS from valid_starts only (enumerate_paths iterates all nodes)
    def _dfs(current_id, path_ids, path_legs):
        if len(path_ids) >= 2:
            yield TripPath(event_ids=list(path_ids), legs=list(path_legs))
        if len(path_ids) >= max_games:
            return
        for next_id in graph.successors(current_id):
            edge = graph.edge(current_id, next_id)
            if edge is None:
                continue
            path_ids.append(next_id)
            path_legs.append({
                "from_event": edge.from_event,
                "to_event": edge.to_event,
                "drive_sec": edge.drive_sec,
                "buffer_sec": edge.buffer_sec,
            })
            yield from _dfs(next_id, path_ids, path_legs)
            path_ids.pop()
            path_legs.pop()

    paths = []
    for start_id in valid_starts:
        paths.extend(_dfs(start_id, [start_id], []))

    ranked = rank_trips(paths, graph.events, top_n=limit)

    results: list[CustomTripOut] = []
    for st in ranked:
        legs_out = []
        for leg in st.path.legs:
            drive_sec = int(leg.get("drive_sec", 0))
            buffer_sec = int(leg.get("buffer_sec", 0))
            # Enrich with labels from graph events
            ev_from = graph.events.get(leg["from_event"])
            ev_to = graph.events.get(leg["to_event"])
            legs_out.append(LegOut(
                from_event=leg["from_event"],
                to_event=leg["to_event"],
                drive_sec=drive_sec,
                buffer_sec=buffer_sec,
                drive_hours=round(drive_sec / 3600, 3),
                buffer_hours=round(buffer_sec / 3600, 3),
                from_label=ev_from.label if ev_from else None,
                from_start=ev_from.start_dt.isoformat() if ev_from else None,
                to_label=ev_to.label if ev_to else None,
                to_start=ev_to.start_dt.isoformat() if ev_to else None,
            ))
        bd = st.breakdown
        results.append(CustomTripOut(
            score=round(st.score, 3),
            num_games=st.path.num_games,
            event_ids=st.path.event_ids,
            legs=legs_out,
            breakdown=ScoreBreakdown(
                game_pts=bd["game_pts"],
                buffer_pts=bd["buffer_pts"],
                drive_pen=bd["drive_pen"],
                span_pen=bd["span_pen"],
                min_buffer_hrs=bd["min_buffer_hrs"],
                total_drive_hrs=bd["total_drive_hrs"],
                time_span_hrs=bd["time_span_hrs"],
            ),
        ))

    return results
