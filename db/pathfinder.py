"""
pathfinder.py — DFS path enumeration for GameTrip

Enumerates all valid trip paths from a directed EventGraph.
A valid trip requires at minimum 2 events.

Since edges only connect event A to event B when B starts after A ends,
the graph is a DAG — no visited tracking is needed.

Usage:
    python pathfinder.py              — Build graph from DB, print path stats
    python pathfinder.py --max-games=N  — Cap trip length at N (default: 4)
    python pathfinder.py --sample     — Print a sample of found 2-game paths
    python pathfinder.py --help       — Show this message
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Generator
from pathlib import Path

# graph.py lives in the same directory
from graph import EventGraph, build_graph, load_events, load_distance_map, _get_conn

DB_PATH = Path(__file__).parent / "gametrip.db"

MIN_GAMES: int = 2
DEFAULT_MAX_GAMES: int = 4  # practical cap given branching factor ~30


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class TripPath:
    """An ordered sequence of events connected by feasible drive legs."""
    event_ids: list[str]
    legs: list[dict]  # each: {from_event, to_event, drive_sec, buffer_sec}

    @property
    def num_games(self) -> int:
        return len(self.event_ids)

    @property
    def total_drive_sec(self) -> int:
        return sum(leg["drive_sec"] for leg in self.legs)

    @property
    def min_buffer_sec(self) -> int:
        return min((leg["buffer_sec"] for leg in self.legs), default=0)

    def to_dict(self) -> dict:
        return {
            "event_ids": self.event_ids,
            "legs": self.legs,
            "num_games": self.num_games,
            "total_drive_sec": self.total_drive_sec,
            "min_buffer_sec": self.min_buffer_sec,
        }


# ── Core DFS ──────────────────────────────────────────────────────────────────

def enumerate_paths(
    graph: EventGraph,
    min_games: int = MIN_GAMES,
    max_games: int = DEFAULT_MAX_GAMES,
) -> Generator[TripPath, None, None]:
    """
    DFS over the EventGraph, yielding every valid TripPath.

    Each path is started from a distinct root node, so paths are never
    duplicated — [A, B, C] is only emitted when DFS starts from A.

    Args:
        graph:     Built EventGraph with events and adjacency list.
        min_games: Minimum events per trip (must be >= 2).
        max_games: Maximum events per trip. Higher values grow exponentially;
                   4 is a practical default given typical CFB graph density.

    Yields:
        TripPath for every valid sequence found.
    """
    min_games = max(2, min_games)

    def _dfs(
        current_id: str,
        path_ids: list[str],
        path_legs: list[dict],
    ) -> Generator[TripPath, None, None]:
        # Emit current path if it meets the minimum length
        if len(path_ids) >= min_games:
            yield TripPath(event_ids=list(path_ids), legs=list(path_legs))

        # Prune: don't extend past max depth
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

    for start_id in graph.events:
        yield from _dfs(start_id, [start_id], [])


def find_paths(
    graph: EventGraph,
    min_games: int = MIN_GAMES,
    max_games: int = DEFAULT_MAX_GAMES,
) -> list[TripPath]:
    """
    Collect all paths into a list.

    For large graphs (high branching factor or deep max_games), prefer
    consuming enumerate_paths() directly rather than materialising the list.
    """
    return list(enumerate_paths(graph, min_games=min_games, max_games=max_games))


# ── CLI ───────────────────────────────────────────────────────────────────────

def _fmt_hms(seconds: int) -> str:
    h, rem = divmod(abs(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h}h {m:02d}m {s:02d}s"


def main(argv: list[str] = sys.argv[1:]) -> None:
    if "--help" in argv:
        print(__doc__)
        return

    max_games_arg = next((a for a in argv if a.startswith("--max-games=")), None)
    max_games = int(max_games_arg.split("=")[1]) if max_games_arg else DEFAULT_MAX_GAMES
    show_sample = "--sample" in argv

    print(f"Loading graph from {DB_PATH}...")
    conn = _get_conn(DB_PATH)
    events = load_events(conn)
    venue_ids = {e.venue_id for e in events}
    distance_map = load_distance_map(conn, venue_ids)
    conn.close()

    graph = build_graph(events, distance_map)
    print(f"  {len(graph.events):,} events, {len(graph.edges):,} edges\n")

    print(f"Enumerating paths (min=2, max={max_games} games)...")
    counts: dict[int, int] = {}
    total = 0

    for path in enumerate_paths(graph, min_games=2, max_games=max_games):
        n = path.num_games
        counts[n] = counts.get(n, 0) + 1
        total += 1

    print(f"\nTotal paths found: {total:,}")
    print(f"  {'Games':<8} {'Paths':>10}")
    print("  " + "─" * 20)
    for n in sorted(counts):
        print(f"  {n:<8} {counts[n]:>10,}")

    if show_sample:
        print("\nSample 2-game paths (shortest drive first):")
        two_game = [
            p for p in enumerate_paths(graph, min_games=2, max_games=2)
        ]
        two_game.sort(key=lambda p: p.total_drive_sec)
        for path in two_game[:10]:
            ev_a = graph.events[path.event_ids[0]]
            ev_b = graph.events[path.event_ids[1]]
            leg = path.legs[0]
            print(
                f"  {ev_a.label[:28]:<30} → {ev_b.label[:28]:<30}"
                f"  drive={_fmt_hms(leg['drive_sec'])}"
                f"  buffer={_fmt_hms(leg['buffer_sec'])}"
            )


if __name__ == "__main__":
    main()
