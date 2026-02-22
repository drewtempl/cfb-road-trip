"""
GameTrip Database
SQLite schema, connection helpers, and utilities.

Usage:
    python db.py init        — Create database and tables
    python db.py seed        — Insert sample data for testing
    python db.py reset       — Drop all tables and recreate
    python db.py info        — Print table row counts
    python db.py migrate     — Run pending migrations
"""

import sqlite3
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = "gametrip.db"
SCHEMA_VERSION = 1

# ─── SCHEMA ──────────────────────────────────────────────────────────────────

TABLES = {
    "schema_version": """
        CREATE TABLE IF NOT EXISTS schema_version (
            version     INTEGER PRIMARY KEY,
            applied_at  TEXT NOT NULL
        )
    """,
    "venues": """
        CREATE TABLE IF NOT EXISTS venues (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            city        TEXT,
            state       TEXT,
            lat         REAL,
            lng         REAL,
            venue_type  TEXT DEFAULT 'stadium',
            capacity    INTEGER,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """,
    "events": """
        CREATE TABLE IF NOT EXISTS events (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            category        TEXT NOT NULL DEFAULT 'cfb',
            venue_id        TEXT NOT NULL REFERENCES venues(id),
            start_time      TEXT NOT NULL,
            duration_hours  REAL NOT NULL DEFAULT 3.5,
            season          INTEGER NOT NULL,
            week            INTEGER NOT NULL,
            day_of_week     TEXT,
            time_slot       TEXT,
            home_team       TEXT,
            away_team       TEXT,
            conference      TEXT,
            broadcast       TEXT,
            status          TEXT DEFAULT 'scheduled',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """,
    "venue_distances": """
        CREATE TABLE IF NOT EXISTS venue_distances (
            venue_a_id      TEXT NOT NULL REFERENCES venues(id),
            venue_b_id      TEXT NOT NULL REFERENCES venues(id),
            duration_sec    INTEGER NOT NULL,
            distance_m      INTEGER NOT NULL,
            computed_at     TEXT NOT NULL,
            PRIMARY KEY (venue_a_id, venue_b_id)
        )
    """,
    "trip_edges": """
        CREATE TABLE IF NOT EXISTS trip_edges (
            season      INTEGER NOT NULL,
            week        INTEGER NOT NULL,
            category    TEXT NOT NULL,
            from_event  TEXT NOT NULL REFERENCES events(id),
            to_event    TEXT NOT NULL REFERENCES events(id),
            drive_sec   INTEGER NOT NULL,
            buffer_sec  INTEGER NOT NULL,
            computed_at TEXT NOT NULL,
            PRIMARY KEY (season, week, category, from_event, to_event)
        )
    """,
    "computed_trips": """
        CREATE TABLE IF NOT EXISTS computed_trips (
            id          TEXT PRIMARY KEY,
            season      INTEGER NOT NULL,
            week        INTEGER NOT NULL,
            category    TEXT NOT NULL,
            num_games   INTEGER NOT NULL,
            score       REAL NOT NULL,
            event_ids   TEXT NOT NULL,
            legs        TEXT NOT NULL,
            computed_at TEXT NOT NULL
        )
    """,
}

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_venues_geo ON venues(lat, lng)",
    "CREATE INDEX IF NOT EXISTS idx_venues_state ON venues(state)",
    "CREATE INDEX IF NOT EXISTS idx_events_week ON events(season, week, category)",
    "CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)",
    "CREATE INDEX IF NOT EXISTS idx_distances_a ON venue_distances(venue_a_id)",
    "CREATE INDEX IF NOT EXISTS idx_distances_b ON venue_distances(venue_b_id)",
    "CREATE INDEX IF NOT EXISTS idx_edges_week ON trip_edges(season, week, category)",
    "CREATE INDEX IF NOT EXISTS idx_trips_lookup ON computed_trips(season, week, category, score DESC)",
]

# Future migrations go here
MIGRATIONS = []


# ─── CONNECTION ──────────────────────────────────────────────────────────────

def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def dict_row(row: sqlite3.Row) -> dict:
    return dict(row) if row else None


def dict_rows(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


# ─── INIT / RESET / MIGRATE ─────────────────────────────────────────────────

def init_db(db_path: str = DB_PATH):
    conn = get_connection(db_path)
    for name, ddl in TABLES.items():
        conn.execute(ddl)
        print(f"  ✓ {name}")
    for idx in INDEXES:
        conn.execute(idx)
    print(f"  ✓ {len(INDEXES)} indexes")

    existing = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    if existing is None:
        conn.execute(
            "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
            (SCHEMA_VERSION, datetime.now(timezone.utc).isoformat()),
        )
        print(f"  ✓ Schema version {SCHEMA_VERSION}")

    conn.commit()
    conn.close()
    print(f"\nDatabase ready: {db_path}")


def reset_db(db_path: str = DB_PATH):
    conn = sqlite3.connect(db_path)
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]
    for t in tables:
        if t != "sqlite_sequence":
            conn.execute(f"DROP TABLE IF EXISTS {t}")
            print(f"  ✗ Dropped {t}")
    conn.commit()
    conn.close()
    init_db(db_path)


def run_migrations(db_path: str = DB_PATH):
    conn = get_connection(db_path)
    current = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0] or 0
    applied = 0
    for version, desc, statements in MIGRATIONS:
        if version > current:
            print(f"  Migrating to v{version}: {desc}")
            for sql in statements:
                conn.execute(sql)
            conn.execute(
                "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
                (version, datetime.now(timezone.utc).isoformat()),
            )
            applied += 1
    conn.commit()
    conn.close()
    if applied:
        print(f"  ✓ Applied {applied} migrations")
    else:
        print(f"  No pending migrations (current: v{current})")


def db_info(db_path: str = DB_PATH):
    conn = get_connection(db_path)
    tables = ["venues", "events", "venue_distances", "trip_edges", "computed_trips"]
    print(f"\nDatabase: {db_path}")
    print(f"{'Table':<20} {'Rows':>10}")
    print("─" * 32)
    for t in tables:
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            print(f"{t:<20} {count:>10,}")
        except sqlite3.OperationalError:
            print(f"{t:<20} {'(missing)':>10}")
    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    print(f"\nSchema version: {version}")
    conn.close()


# ─── WRITE HELPERS ───────────────────────────────────────────────────────────

def upsert_venue(conn: sqlite3.Connection, venue: dict):
    conn.execute(
        """INSERT INTO venues (id, name, city, state, lat, lng, venue_type, capacity, updated_at)
           VALUES (:id, :name, :city, :state, :lat, :lng, :venue_type, :capacity, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, city=excluded.city, state=excluded.state,
             lat=excluded.lat, lng=excluded.lng, venue_type=excluded.venue_type,
             capacity=excluded.capacity, updated_at=datetime('now')
        """,
        venue,
    )


def upsert_event(conn: sqlite3.Connection, event: dict):
    conn.execute(
        """INSERT INTO events (id, title, category, venue_id, start_time, duration_hours,
             season, week, day_of_week, time_slot, home_team, away_team, conference,
             broadcast, status, updated_at)
           VALUES (:id, :title, :category, :venue_id, :start_time, :duration_hours,
             :season, :week, :day_of_week, :time_slot, :home_team, :away_team,
             :conference, :broadcast, :status, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             title=excluded.title, venue_id=excluded.venue_id, start_time=excluded.start_time,
             duration_hours=excluded.duration_hours, season=excluded.season, week=excluded.week,
             day_of_week=excluded.day_of_week, time_slot=excluded.time_slot,
             home_team=excluded.home_team, away_team=excluded.away_team,
             conference=excluded.conference, broadcast=excluded.broadcast,
             status=excluded.status, updated_at=datetime('now')
        """,
        event,
    )


def clear_trips(conn: sqlite3.Connection, season: int, week: int, category: str = None):
    params = [season, week]
    cat = ""
    if category:
        cat = " AND category = ?"
        params.append(category)
    conn.execute(f"DELETE FROM trip_edges WHERE season = ? AND week = ?{cat}", params)
    conn.execute(f"DELETE FROM computed_trips WHERE season = ? AND week = ?{cat}", params)
    conn.commit()


# ─── QUERY HELPERS ───────────────────────────────────────────────────────────

def get_venues_list(db_path: str = DB_PATH, state: str = None) -> list[dict]:
    conn = get_connection(db_path)
    if state:
        rows = conn.execute("SELECT * FROM venues WHERE state = ?", (state,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM venues").fetchall()
    conn.close()
    return dict_rows(rows)


def get_events_list(
    db_path: str = DB_PATH,
    season: int = None,
    week: int = None,
    category: str = None,
    day_of_week: str = None,
    time_slot: str = None,
) -> list[dict]:
    conn = get_connection(db_path)
    query = "SELECT * FROM events WHERE 1=1"
    params = []
    if season:
        query += " AND season = ?"; params.append(season)
    if week:
        query += " AND week = ?"; params.append(week)
    if category:
        query += " AND category = ?"; params.append(category)
    if day_of_week:
        query += " AND day_of_week = ?"; params.append(day_of_week)
    if time_slot:
        query += " AND time_slot = ?"; params.append(time_slot)
    query += " ORDER BY start_time"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return dict_rows(rows)


def get_distance(venue_a_id: str, venue_b_id: str, db_path: str = DB_PATH) -> dict | None:
    conn = get_connection(db_path)
    row = conn.execute(
        "SELECT * FROM venue_distances WHERE venue_a_id = ? AND venue_b_id = ?",
        (venue_a_id, venue_b_id),
    ).fetchone()
    conn.close()
    return dict_row(row)


def get_distance_matrix(venue_ids: list[str] = None, db_path: str = DB_PATH) -> dict:
    conn = get_connection(db_path)
    if venue_ids:
        ph = ",".join("?" * len(venue_ids))
        rows = conn.execute(
            f"SELECT * FROM venue_distances WHERE venue_a_id IN ({ph}) AND venue_b_id IN ({ph})",
            venue_ids + venue_ids,
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM venue_distances").fetchall()
    conn.close()
    return {
        f"{r['venue_a_id']}_{r['venue_b_id']}": {
            "duration_sec": r["duration_sec"],
            "distance_m": r["distance_m"],
        }
        for r in rows
    }


def get_computed_trips(
    season: int, week: int, category: str = None,
    limit: int = 20, db_path: str = DB_PATH,
) -> list[dict]:
    conn = get_connection(db_path)
    query = "SELECT * FROM computed_trips WHERE season = ? AND week = ?"
    params = [season, week]
    if category:
        query += " AND category = ?"; params.append(category)
    query += " ORDER BY score DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    trips = []
    for r in rows:
        t = dict(r)
        t["event_ids"] = json.loads(t["event_ids"])
        t["legs"] = json.loads(t["legs"])
        trips.append(t)
    return trips


# ─── SEED DATA ───────────────────────────────────────────────────────────────

def seed_sample_data(db_path: str = DB_PATH):
    conn = get_connection(db_path)

    venues = [
        {"id": "v_gt", "name": "Bobby Dodd Stadium", "city": "Atlanta", "state": "GA", "lat": 33.7726, "lng": -84.3927, "venue_type": "stadium", "capacity": 55000},
        {"id": "v_bama", "name": "Bryant-Denny Stadium", "city": "Tuscaloosa", "state": "AL", "lat": 33.2084, "lng": -87.5504, "venue_type": "stadium", "capacity": 101821},
        {"id": "v_lsu", "name": "Tiger Stadium", "city": "Baton Rouge", "state": "LA", "lat": 30.4120, "lng": -91.1837, "venue_type": "stadium", "capacity": 102321},
        {"id": "v_unc", "name": "Kenan Stadium", "city": "Chapel Hill", "state": "NC", "lat": 35.9271, "lng": -79.0440, "venue_type": "stadium", "capacity": 50500},
        {"id": "v_ncsu", "name": "Carter-Finley Stadium", "city": "Raleigh", "state": "NC", "lat": 35.8017, "lng": -78.7192, "venue_type": "stadium", "capacity": 57583},
        {"id": "v_clem", "name": "Memorial Stadium", "city": "Clemson", "state": "SC", "lat": 34.6786, "lng": -82.8432, "venue_type": "stadium", "capacity": 81500},
        {"id": "v_uga", "name": "Sanford Stadium", "city": "Athens", "state": "GA", "lat": 33.9500, "lng": -83.3733, "venue_type": "stadium", "capacity": 92746},
        {"id": "v_duke", "name": "Wallace Wade Stadium", "city": "Durham", "state": "NC", "lat": 36.0014, "lng": -78.9428, "venue_type": "stadium", "capacity": 40004},
    ]

    events = [
        {"id": "e_gt_thu", "title": "App State @ Georgia Tech", "category": "cfb", "venue_id": "v_gt",
         "start_time": "2025-10-02T23:30:00Z", "duration_hours": 3.5, "season": 2025, "week": 5,
         "day_of_week": "Thu", "time_slot": "evening", "home_team": "Georgia Tech", "away_team": "App State",
         "conference": "ACC", "broadcast": "ESPN", "status": "scheduled"},

        {"id": "e_bama_sat", "title": "Tennessee @ Alabama", "category": "cfb", "venue_id": "v_bama",
         "start_time": "2025-10-04T16:00:00Z", "duration_hours": 3.5, "season": 2025, "week": 5,
         "day_of_week": "Sat", "time_slot": "noon", "home_team": "Alabama", "away_team": "Tennessee",
         "conference": "SEC", "broadcast": "CBS", "status": "scheduled"},

        {"id": "e_lsu_sat", "title": "Auburn @ LSU", "category": "cfb", "venue_id": "v_lsu",
         "start_time": "2025-10-04T23:00:00Z", "duration_hours": 3.5, "season": 2025, "week": 5,
         "day_of_week": "Sat", "time_slot": "evening", "home_team": "LSU", "away_team": "Auburn",
         "conference": "SEC", "broadcast": "ESPN", "status": "scheduled"},

        {"id": "e_unc_sat", "title": "Duke @ UNC", "category": "cfb", "venue_id": "v_unc",
         "start_time": "2025-10-04T16:00:00Z", "duration_hours": 3.5, "season": 2025, "week": 5,
         "day_of_week": "Sat", "time_slot": "noon", "home_team": "UNC", "away_team": "Duke",
         "conference": "ACC", "broadcast": "ACC Network", "status": "scheduled"},

        {"id": "e_ncsu_sat", "title": "Virginia Tech @ NC State", "category": "cfb", "venue_id": "v_ncsu",
         "start_time": "2025-10-04T19:30:00Z", "duration_hours": 3.5, "season": 2025, "week": 5,
         "day_of_week": "Sat", "time_slot": "afternoon", "home_team": "NC State", "away_team": "Virginia Tech",
         "conference": "ACC", "broadcast": "ESPN2", "status": "scheduled"},

        {"id": "e_uga_sat", "title": "Mississippi St @ Georgia", "category": "cfb", "venue_id": "v_uga",
         "start_time": "2025-10-04T16:00:00Z", "duration_hours": 3.5, "season": 2025, "week": 5,
         "day_of_week": "Sat", "time_slot": "noon", "home_team": "Georgia", "away_team": "Mississippi St",
         "conference": "SEC", "broadcast": "SEC Network", "status": "scheduled"},
    ]

    for v in venues:
        upsert_venue(conn, v)
    print(f"  ✓ {len(venues)} venues")

    for e in events:
        upsert_event(conn, e)
    print(f"  ✓ {len(events)} events")

    conn.commit()
    conn.close()
    print("\nSeed data loaded")


# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "init"

    if cmd == "init":
        print("Initializing database...")
        init_db()
    elif cmd == "seed":
        print("Seeding sample data...")
        seed_sample_data()
    elif cmd == "reset":
        print("Resetting database...")
        reset_db()
    elif cmd == "info":
        db_info()
    elif cmd == "migrate":
        print("Running migrations...")
        run_migrations()
    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python db.py [init|seed|reset|info|migrate]")
