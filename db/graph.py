"""
graph.py — Build directed event graph from events_1 + venue_distances

Nodes: events from events_1 (events with a known start time and venue)
Edges: event A → event B when:
  - A drive route exists from A's venue to B's venue in venue_distances
  - B starts at or after A ends + drive time + min_buffer_sec

Edge weights stored:
  - drive_sec:   seconds of driving from A's venue to B's venue
  - buffer_sec:  spare seconds between arriving at B's venue and B's kickoff

Usage:
    python graph.py              — Build graph, print stats
    python graph.py --store      — Build graph and persist edges to trip_edges
    python graph.py --stats      — Print stats on stored trip_edges rows
    python graph.py --help       — Show this message
"""

import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from pathlib import Path

DB_PATH = Path(__file__).parent / "gametrip.db"

# Default game duration when events_1 has no duration field
DEFAULT_DURATION_HOURS: float = 3.5

# Minimum cushion (seconds) required after arriving before the next game starts.
# 0 = must arrive exactly on time or earlier.
DEFAULT_MIN_BUFFER_SEC: int = 0

# Maximum drive time allowed for an edge. Cross-country drives beyond this are
# excluded regardless of calendar availability.
DEFAULT_MAX_DRIVE_SEC: int = 12 * 3600  # 12 hours


# ── Data classes ──────────────────────────────────────────────────────────────

class Event:
    __slots__ = ("id", "venue_id", "venue_name", "start_dt", "end_dt",
                 "home_team", "away_team", "label")

    def __init__(self, row: dict, duration_hours: float = DEFAULT_DURATION_HOURS):
        self.id = row["id"]
        self.venue_id = row["venueId"]
        self.venue_name = row.get("venue", "")
        self.start_dt = _parse_dt(row["startDate"])
        self.end_dt = self.start_dt + timedelta(hours=duration_hours)
        self.home_team = row.get("homeTeam", "")
        self.away_team = row.get("awayTeam", "")
        self.label = f"{self.away_team} @ {self.home_team}"

    def __repr__(self):
        ts = self.start_dt.strftime("%a %b %d %H:%M UTC")
        return f"<Event {self.id}: {self.label} [{ts}] @ venue {self.venue_id}>"


class Edge:
    __slots__ = ("from_event", "to_event", "drive_sec", "buffer_sec")

    def __init__(self, from_event: str, to_event: str, drive_sec: int, buffer_sec: int):
        self.from_event = from_event
        self.to_event = to_event
        self.drive_sec = drive_sec
        self.buffer_sec = buffer_sec


# ── Graph ─────────────────────────────────────────────────────────────────────

class EventGraph:
    """
    Directed graph where nodes are events and edges represent feasible
    same-trip transitions between events.

    Attributes:
        events  : dict[event_id -> Event]
        edges   : dict[(from_id, to_id) -> Edge]
        adj     : dict[event_id -> list[event_id]]   (adjacency list)
    """

    def __init__(self):
        self.events: dict[str, Event] = {}
        self.edges: dict[tuple[str, str], Edge] = {}
        self.adj: dict[str, list[str]] = defaultdict(list)

    # ── mutation ──────────────────────────────────────────────────────────────

    def add_event(self, event: Event) -> None:
        self.events[event.id] = event

    def add_edge(self, edge: Edge) -> None:
        self.edges[(edge.from_event, edge.to_event)] = edge
        self.adj[edge.from_event].append(edge.to_event)

    # ── queries ───────────────────────────────────────────────────────────────

    def successors(self, event_id: str) -> list[str]:
        """Return IDs of events reachable from event_id."""
        return self.adj.get(event_id, [])

    def edge(self, from_id: str, to_id: str) -> Edge | None:
        return self.edges.get((from_id, to_id))

    def stats(self) -> dict:
        n = len(self.events)
        e = len(self.edges)
        connected = sum(1 for v in self.adj.values() if v)
        return {
            "nodes": n,
            "edges": e,
            "avg_out_degree": round(e / n, 2) if n else 0,
            "nodes_with_successors": connected,
            "isolated_nodes": n - connected,
        }

    # ── export ────────────────────────────────────────────────────────────────

    def to_adjacency_dict(self) -> dict[str, list[str]]:
        """Simple {event_id: [successor_ids]} mapping."""
        return {k: list(v) for k, v in self.adj.items()}


# ── Database helpers ──────────────────────────────────────────────────────────

def _get_conn(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    # Foreign keys intentionally OFF: events_1 IDs aren't in the 'events' table yet.
    # The trip_edges schema references events(id), but graph.py sources from events_1.
    return conn


def _parse_dt(s: str) -> datetime:
    """Parse ISO 8601 datetime string to UTC-aware datetime."""
    # Handle trailing Z and optional milliseconds
    s = s.rstrip("Z").split(".")[0]
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def load_events(conn: sqlite3.Connection,
                duration_hours: float = DEFAULT_DURATION_HOURS) -> list[Event]:
    """Load schedulable events from events_1 (exclude TBD start times)."""
    rows = conn.execute(
        """
        SELECT id, venueId, venue, startDate, homeTeam, awayTeam
        FROM   events_1
        WHERE  startTimeTBD = 'FALSE'
          AND  venueId IS NOT NULL
          AND  startDate IS NOT NULL
        ORDER  BY startDate
        """
    ).fetchall()
    return [Event(dict(r), duration_hours) for r in rows]


def load_distance_map(conn: sqlite3.Connection,
                      venue_ids: set[str]) -> dict[tuple[str, str], int]:
    """
    Load drive durations (seconds) for all pairs of the given venue IDs.
    Returns {(venue_a_id, venue_b_id): duration_sec}.
    """
    if not venue_ids:
        return {}
    ph = ",".join("?" * len(venue_ids))
    ids = list(venue_ids)
    rows = conn.execute(
        f"""
        SELECT venue_a_id, venue_b_id, duration_sec
        FROM   venue_distances
        WHERE  venue_a_id IN ({ph})
          AND  venue_b_id IN ({ph})
        """,
        ids + ids,
    ).fetchall()
    return {(r["venue_a_id"], r["venue_b_id"]): r["duration_sec"] for r in rows}


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_graph(events: list[Event],
                distance_map: dict[tuple[str, str], int],
                min_buffer_sec: int = DEFAULT_MIN_BUFFER_SEC,
                max_drive_sec: int = DEFAULT_MAX_DRIVE_SEC) -> EventGraph:
    """
    Construct the directed event graph.

    For every ordered pair (A, B) of distinct events:
      1. Look up drive_sec = distance_map[(A.venue_id, B.venue_id)]
      2. Reject if drive_sec > max_drive_sec
      3. Compute available_sec = (B.start - A.end).total_seconds()
      4. Add edge A → B if available_sec - drive_sec >= min_buffer_sec
    """
    graph = EventGraph()
    for event in events:
        graph.add_event(event)

    # Sort events by start time for a slight pruning opportunity:
    # once B's start time is far enough ahead, we can break early.
    sorted_events = sorted(events, key=lambda e: e.start_dt)

    for i, ev_a in enumerate(sorted_events):
        for ev_b in sorted_events:
            if ev_a.id == ev_b.id:
                continue

            # B must start after A ends (even ignoring drive time)
            available_sec = (ev_b.start_dt - ev_a.end_dt).total_seconds()
            if available_sec < 0:
                continue  # B overlaps or ends before A finishes

            # Same venue: no drive needed, edge is always feasible
            if ev_a.venue_id == ev_b.venue_id:
                graph.add_edge(Edge(ev_a.id, ev_b.id, 0, int(available_sec)))
                continue

            drive_sec = distance_map.get((ev_a.venue_id, ev_b.venue_id))
            if drive_sec is None or drive_sec > max_drive_sec:
                continue  # no route data, or drive exceeds limit

            buffer_sec = int(available_sec) - drive_sec
            if buffer_sec >= min_buffer_sec:
                graph.add_edge(Edge(ev_a.id, ev_b.id, drive_sec, buffer_sec))

    return graph


# ── Trip-edges persistence ────────────────────────────────────────────────────

def store_trip_edges(conn: sqlite3.Connection, graph: EventGraph,
                     season: int, week: int, category: str = "cfb") -> int:
    """
    Persist graph edges to the trip_edges table.
    Returns the number of rows upserted.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    rows = [
        (season, week, category,
         edge.from_event, edge.to_event,
         edge.drive_sec, edge.buffer_sec, now)
        for edge in graph.edges.values()
    ]

    conn.executemany(
        """
        INSERT OR REPLACE INTO trip_edges
            (season, week, category, from_event, to_event, drive_sec, buffer_sec, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


# ── CLI helpers ───────────────────────────────────────────────────────────────

def _fmt_hms(seconds: int) -> str:
    h, rem = divmod(abs(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h}h {m:02d}m {s:02d}s"


def print_stats(graph: EventGraph) -> None:
    s = graph.stats()
    print(f"\nGraph stats")
    print(f"  Nodes (events)  : {s['nodes']:,}")
    print(f"  Edges           : {s['edges']:,}")
    print(f"  Avg out-degree  : {s['avg_out_degree']}")
    print(f"  Nodes w/ exits  : {s['nodes_with_successors']:,}")
    print(f"  Isolated nodes  : {s['isolated_nodes']:,}")

    if graph.edges:
        drives = [e.drive_sec for e in graph.edges.values()]
        buffers = [e.buffer_sec for e in graph.edges.values()]
        print(f"\nDrive times")
        print(f"  Min  : {_fmt_hms(min(drives))}")
        print(f"  Max  : {_fmt_hms(max(drives))}")
        print(f"  Avg  : {_fmt_hms(int(sum(drives) / len(drives)))}")
        print(f"\nArrival buffers")
        print(f"  Min  : {_fmt_hms(min(buffers))}")
        print(f"  Max  : {_fmt_hms(max(buffers))}")
        print(f"  Avg  : {_fmt_hms(int(sum(buffers) / len(buffers)))}")


def print_sample_edges(graph: EventGraph, n: int = 10) -> None:
    """Print a sample of short-drive edges for sanity checking."""
    edges = sorted(graph.edges.values(), key=lambda e: e.drive_sec)[:n]
    if not edges:
        print("\nNo edges found.")
        return
    print(f"\nSample edges (shortest drives):")
    fmt = "  {from_:<30s}  →  {to_:<30s}  drive={drive}  buffer={buf}"
    for edge in edges:
        ev_a = graph.events[edge.from_event]
        ev_b = graph.events[edge.to_event]
        print(fmt.format(
            from_=ev_a.label[:30],
            to_=ev_b.label[:30],
            drive=_fmt_hms(edge.drive_sec),
            buf=_fmt_hms(edge.buffer_sec),
        ))


def trip_edges_stats(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM trip_edges").fetchone()[0]
    if count == 0:
        print("trip_edges table is empty.")
        return
    breakdown = conn.execute(
        "SELECT season, week, category, COUNT(*) AS n FROM trip_edges GROUP BY season, week, category ORDER BY season, week"
    ).fetchall()
    print(f"\nStored trip edges: {count:,}")
    print(f"  {'season':<8} {'week':<6} {'category':<10} {'edges':>8}")
    print("  " + "─" * 36)
    for r in breakdown:
        print(f"  {r['season']:<8} {r['week']:<6} {r['category']:<10} {r[3]:>8,}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main(argv: list[str] = sys.argv[1:]) -> None:
    store = "--store" in argv
    show_stats_only = "--stats" in argv

    if "--help" in argv:
        print(__doc__)
        return

    conn = _get_conn()

    if show_stats_only:
        trip_edges_stats(conn)
        conn.close()
        return

    print(f"Loading events from events_1...")
    events = load_events(conn)
    print(f"  {len(events):,} schedulable events loaded")

    venue_ids = {e.venue_id for e in events}
    print(f"  {len(venue_ids):,} unique venue IDs")

    print(f"\nLoading distance map...")
    distance_map = load_distance_map(conn, venue_ids)
    covered = len({vid for pair in distance_map for vid in pair})
    print(f"  {len(distance_map):,} venue pairs  ({covered} venues with route data)")

    max_drive_arg = next((a for a in argv if a.startswith("--max-drive=")), None)
    max_drive_sec = int(max_drive_arg.split("=")[1]) * 3600 if max_drive_arg else DEFAULT_MAX_DRIVE_SEC

    print(f"\nBuilding directed graph (max drive: {max_drive_sec // 3600}h)...")
    graph = build_graph(events, distance_map, max_drive_sec=max_drive_sec)

    print_stats(graph)
    print_sample_edges(graph)

    if store:
        # Infer season/week from the events (use the most common values)
        seasons = [e.start_dt.year for e in events]
        season = max(set(seasons), key=seasons.count)
        # week is not in events_1 as an integer; default to 1 for this initial build
        # Override with --week=N if needed
        week_arg = next((a for a in argv if a.startswith("--week=")), None)
        week = int(week_arg.split("=")[1]) if week_arg else 1

        print(f"\nStoring edges to trip_edges (season={season}, week={week})...")
        stored = store_trip_edges(conn, graph, season=season, week=week)
        print(f"  ✓ {stored:,} edges stored")

    conn.close()
    print()


if __name__ == "__main__":
    main()
