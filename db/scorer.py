"""
scorer.py — Score and rank TripPaths for GameTrip

Scoring formula (higher is better):

    score = (num_games       * GAME_POINTS)
          + (buffer_credit   * BUFFER_PTS_PER_HR)
          - (total_drive_hrs * DRIVE_PTS_PER_HR)
          - (time_span_hrs   * SPAN_PTS_PER_HR)

  - GAME_POINTS is large enough that an extra game always dominates.
  - buffer_credit = min(min_buffer_hrs, MAX_BUFFER_CREDIT_HRS) — caps
    the bonus so arbitrarily long waits don't unfairly inflate a score.
  - drive penalty: total hours driving across all legs.
  - span penalty: hours from first kickoff to last kickoff (rewards
    compact itineraries that don't stretch across a full weekend).

Usage:
    python scorer.py              — Score all paths from DB, print top 20
    python scorer.py --top=50    — Show top 50
    python scorer.py --help      — Show this message
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from graph import Event
    from pathfinder import TripPath

# ── Tuning constants ──────────────────────────────────────────────────────────

# Points per additional game in the trip.
# Must be large enough that 3 games always beats 2, regardless of drive/buffer.
GAME_POINTS: float = 100.0

# Buffer comfort bonus: credited per hour of minimum arrival buffer,
# up to MAX_BUFFER_CREDIT_HRS. Beyond that threshold extra slack isn't valued.
MAX_BUFFER_CREDIT_HRS: float = 3.0
BUFFER_PTS_PER_HR: float = 8.0     # max buffer contribution: +24 pts

# Drive time penalty per hour of total driving across all legs.
DRIVE_PTS_PER_HR: float = 4.0      # 6h driving costs -24 pts

# Time-span penalty per hour from first kickoff to last kickoff.
# Lightly penalises trips that stretch across many hours / days.
SPAN_PTS_PER_HR: float = 0.5       # 24h span costs -12 pts


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class ScoredTrip:
    """A TripPath coupled with its computed score and component breakdown."""
    score: float
    path: "TripPath"
    breakdown: dict = field(default_factory=dict)

    def to_dict(self, events: dict[str, "Event"] | None = None) -> dict:
        d = {
            "score":     round(self.score, 3),
            "num_games": self.path.num_games,
            "event_ids": self.path.event_ids,
            "legs":      self.path.legs,
            "breakdown": self.breakdown,
        }
        if events:
            d["labels"] = [
                events[eid].label
                for eid in self.path.event_ids
                if eid in events
            ]
        return d


# ── Core scoring ──────────────────────────────────────────────────────────────

def score_trip(
    path: "TripPath",
    events: dict[str, "Event"],
) -> ScoredTrip:
    """
    Compute a score for a single TripPath.

    Args:
        path:   Candidate trip with ordered event_ids and leg data.
        events: Mapping of event_id → Event (used for start times).

    Returns:
        ScoredTrip with score and component breakdown.
    """
    num_games        = path.num_games
    total_drive_hrs  = path.total_drive_sec / 3600.0
    min_buffer_hrs   = path.min_buffer_sec  / 3600.0

    # Time span: first kickoff → last kickoff
    try:
        first_start   = events[path.event_ids[0]].start_dt
        last_start    = events[path.event_ids[-1]].start_dt
        time_span_hrs = max(
            (last_start - first_start).total_seconds() / 3600.0, 0.0
        )
    except (KeyError, AttributeError):
        time_span_hrs = 0.0

    buffer_credit = min(min_buffer_hrs, MAX_BUFFER_CREDIT_HRS)

    game_pts   = num_games    * GAME_POINTS
    buffer_pts = buffer_credit * BUFFER_PTS_PER_HR
    drive_pen  = total_drive_hrs * DRIVE_PTS_PER_HR
    span_pen   = time_span_hrs   * SPAN_PTS_PER_HR

    score = game_pts + buffer_pts - drive_pen - span_pen

    breakdown = {
        "game_pts":        round(game_pts,   2),
        "buffer_pts":      round(buffer_pts, 2),
        "drive_pen":       round(drive_pen,  2),
        "span_pen":        round(span_pen,   2),
        "min_buffer_hrs":  round(min_buffer_hrs,  2),
        "total_drive_hrs": round(total_drive_hrs, 2),
        "time_span_hrs":   round(time_span_hrs,   2),
    }

    return ScoredTrip(score=score, path=path, breakdown=breakdown)


def rank_trips(
    paths: list["TripPath"],
    events: dict[str, "Event"],
    top_n: int | None = None,
) -> list[ScoredTrip]:
    """
    Score all paths and return them sorted descending by score.

    Args:
        paths:  All candidate TripPaths from the pathfinder.
        events: Mapping of event_id → Event.
        top_n:  If provided, return only the top-N results.

    Returns:
        ScoredTrips sorted best-first.
    """
    scored = [score_trip(p, events) for p in paths]
    scored.sort(key=lambda s: s.score, reverse=True)
    if top_n is not None:
        scored = scored[:top_n]
    return scored


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

    top_arg = next((a for a in argv if a.startswith("--top=")), None)
    top_n   = int(top_arg.split("=")[1]) if top_arg else 20

    from pathlib import Path
    from graph import build_graph, load_events, load_distance_map, _get_conn
    from pathfinder import enumerate_paths

    db_path = Path(__file__).parent / "gametrip.db"
    conn    = _get_conn(db_path)
    events  = load_events(conn)

    venue_ids    = {e.venue_id for e in events}
    distance_map = load_distance_map(conn, venue_ids)
    conn.close()

    graph = build_graph(events, distance_map)
    paths = list(enumerate_paths(graph, min_games=2, max_games=4))

    print(f"{len(paths):,} paths found — scoring...")
    ranked = rank_trips(paths, graph.events, top_n=top_n)

    print(f"\nTop {min(top_n, len(ranked))} trips:\n")
    hdr = f"  {'#':<4} {'G':<3} {'Score':>8}  {'Drive':>8}  {'Buf':>8}  {'Span':>8}  Route"
    print(hdr)
    print("  " + "─" * (len(hdr) - 2))

    for i, st in enumerate(ranked, 1):
        br    = st.breakdown
        route = " → ".join(
            graph.events[eid].label[:22] for eid in st.path.event_ids
        )
        print(
            f"  {i:<4} {st.path.num_games:<3} {st.score:>8.2f}"
            f"  {_fmt_hrs(br['total_drive_hrs']):>8}"
            f"  {_fmt_hrs(br['min_buffer_hrs']):>8}"
            f"  {_fmt_hrs(br['time_span_hrs']):>8}"
            f"  {route}"
        )


if __name__ == "__main__":
    main()
