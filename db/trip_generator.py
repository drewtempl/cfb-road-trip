"""
trip_generator.py — Orchestrate GameTrip computation and caching

Pipeline:
    1. Load events + distance map from DB
    2. Build directed EventGraph
    3. Enumerate all valid paths via DFS
    4. Score and rank paths
    5. Persist top-N results to computed_trips

Usage:
    python trip_generator.py                          — week 1, season 2025, cfb
    python trip_generator.py --season=2025 --week=2  — specify season/week
    python trip_generator.py --top=50                — store top 50 (default 100)
    python trip_generator.py --max-games=5           — allow up to 5-game trips
    python trip_generator.py --dry-run               — score but don't write to DB
    python trip_generator.py --help                  — show this message
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "gametrip.db"

from graph import Event, EventGraph, build_graph, load_events, load_distance_map, _get_conn
from pathfinder import enumerate_paths, DEFAULT_MAX_GAMES
from scorer import ScoredTrip, rank_trips

DEFAULT_TOP_N: int = 100
DEFAULT_SEASON: int = 2025
DEFAULT_WEEK: int = 1
DEFAULT_CATEGORY: str = "cfb"


# ── Leg enrichment ────────────────────────────────────────────────────────────

def _enrich_legs(scored: ScoredTrip, events: dict[str, Event]) -> list[dict]:
    """
    Extend each leg dict with human-readable labels and ISO start times so
    the API / frontend can render trips without extra DB lookups.
    """
    enriched = []
    for leg in scored.path.legs:
        ev_from = events.get(leg["from_event"])
        ev_to   = events.get(leg["to_event"])
        enriched.append({
            **leg,
            "from_label": ev_from.label          if ev_from else leg["from_event"],
            "from_start": ev_from.start_dt.isoformat() if ev_from else None,
            "to_label":   ev_to.label            if ev_to   else leg["to_event"],
            "to_start":   ev_to.start_dt.isoformat()   if ev_to   else None,
        })
    return enriched


# ── Persistence ───────────────────────────────────────────────────────────────

def _trip_id(season: int, week: int, category: str, event_ids: list[str]) -> str:
    """Deterministic UUID derived from the trip's key so re-runs upsert cleanly."""
    key = f"{season}:{week}:{category}:{'|'.join(event_ids)}"
    return str(uuid.uuid5(uuid.NAMESPACE_OID, key))


def store_trips(
    conn,
    trips: list[ScoredTrip],
    events: dict[str, Event],
    season: int,
    week: int,
    category: str,
) -> int:
    """Upsert ScoredTrips into computed_trips. Returns number of rows written."""
    now  = datetime.now(timezone.utc).isoformat()
    rows = []
    for st in trips:
        enriched_legs = _enrich_legs(st, events)
        rows.append((
            _trip_id(season, week, category, st.path.event_ids),
            season,
            week,
            category,
            st.path.num_games,
            round(st.score, 6),
            json.dumps(st.path.event_ids),
            json.dumps(enriched_legs),
            now,
        ))

    conn.executemany(
        """
        INSERT OR REPLACE INTO computed_trips
            (id, season, week, category, num_games, score, event_ids, legs, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


# ── Main pipeline ─────────────────────────────────────────────────────────────

def generate_trips(
    season: int = DEFAULT_SEASON,
    week: int = DEFAULT_WEEK,
    category: str = DEFAULT_CATEGORY,
    max_games: int = DEFAULT_MAX_GAMES,
    top_n: int = DEFAULT_TOP_N,
    dry_run: bool = False,
    db_path: Path = DB_PATH,
) -> tuple[list[ScoredTrip], dict[str, Event]]:
    """
    Full pipeline: load → graph → paths → score → (persist).

    Returns:
        (ranked_trips, events_dict) — top-N ScoredTrips best-first, plus the
        events dict so callers can resolve labels without another DB round-trip.
    """
    conn = _get_conn(db_path)

    print(f"Loading events...")
    events_list = load_events(conn)
    if not events_list:
        print("  No schedulable events found — nothing to do.")
        conn.close()
        return [], {}
    print(f"  {len(events_list):,} events loaded")

    venue_ids = {e.venue_id for e in events_list}
    print(f"\nLoading distance map ({len(venue_ids)} venues)...")
    distance_map = load_distance_map(conn, venue_ids)
    print(f"  {len(distance_map):,} venue pairs")

    print(f"\nBuilding graph...")
    graph = build_graph(events_list, distance_map)
    s = graph.stats()
    print(f"  {s['nodes']:,} nodes  {s['edges']:,} edges  avg out-degree {s['avg_out_degree']}")

    events_dict = graph.events  # dict[id -> Event]

    print(f"\nEnumerating paths (min=2, max={max_games})...")
    paths = list(enumerate_paths(graph, min_games=2, max_games=max_games))

    by_n: dict[int, int] = {}
    for p in paths:
        by_n[p.num_games] = by_n.get(p.num_games, 0) + 1
    print(f"  {len(paths):,} total paths")
    for n in sorted(by_n):
        print(f"    {n} games: {by_n[n]:,}")

    print(f"\nScoring and ranking (keeping top {top_n})...")
    ranked = rank_trips(paths, events_dict, top_n=top_n)
    if ranked:
        best = ranked[0]
        print(f"  Best: {best.score:.2f} pts — {best.path.num_games} games")
    else:
        print("  No trips scored.")

    if not dry_run:
        print(f"\nPersisting to computed_trips...")
        stored = store_trips(conn, ranked, events_dict, season, week, category)
        print(f"  ✓ {stored:,} trips stored")
    else:
        print("\n(dry-run: skipping DB write)")

    conn.close()
    return ranked, events_dict


# ── CLI ───────────────────────────────────────────────────────────────────────

def _fmt_hrs(hours: float) -> str:
    total_sec = int(abs(hours) * 3600)
    h, rem    = divmod(total_sec, 3600)
    m, _      = divmod(rem, 60)
    return f"{h}h {m:02d}m"


def main(argv: list[str] = sys.argv[1:]) -> None:
    if "--help" in argv:
        print(__doc__)
        return

    def _arg(prefix: str, default):
        val = next((a for a in argv if a.startswith(prefix)), None)
        if val is None:
            return default
        return type(default)(val.split("=", 1)[1])

    season    = _arg("--season=",    DEFAULT_SEASON)
    week      = _arg("--week=",      DEFAULT_WEEK)
    top_n     = _arg("--top=",       DEFAULT_TOP_N)
    max_games = _arg("--max-games=", DEFAULT_MAX_GAMES)
    dry_run   = "--dry-run" in argv

    print(f"GameTrip generator — season={season}  week={week}  category=cfb")
    print("=" * 60)

    ranked, events_dict = generate_trips(
        season=season,
        week=week,
        max_games=max_games,
        top_n=top_n,
        dry_run=dry_run,
    )

    if not ranked:
        return

    display_n = min(20, len(ranked))
    print(f"\nTop {display_n} trips:")
    print(f"\n  {'#':<4} {'G':<3} {'Score':>7}  {'Drive':>7}  {'Buffer':>7}  {'Span':>7}  Route")
    print("  " + "─" * 85)

    for i, st in enumerate(ranked[:display_n], 1):
        br    = st.breakdown
        route = " → ".join(
            events_dict[eid].label[:20] for eid in st.path.event_ids if eid in events_dict
        )
        print(
            f"  {i:<4} {st.path.num_games:<3} {st.score:>7.1f}"
            f"  {_fmt_hrs(br['total_drive_hrs']):>7}"
            f"  {_fmt_hrs(br['min_buffer_hrs']):>7}"
            f"  {_fmt_hrs(br['time_span_hrs']):>7}"
            f"  {route}"
        )


if __name__ == "__main__":
    main()
