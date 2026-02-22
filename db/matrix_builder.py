"""
Distance Matrix Builder for GameTrip
Builds a full NxN venue distance matrix using OSRM Table API.
Chunks requests to stay within OSRM limits (~100 sources/destinations per request).
Rate-limits requests to be respectful of the demo server.
"""

import sqlite3
import requests
import time
import json
import math
from datetime import datetime, timezone
from pathlib import Path

OSRM_BASE = "https://router.project-osrm.org"
CHUNK_SIZE = 50          # sources/destinations per request (conservative for demo server)
REQUEST_DELAY = 1.5      # seconds between requests — be polite to demo server
MAX_RETRIES = 3
DB_PATH = "gametrip.db"


def get_venues(db_path: str = DB_PATH) -> list[dict]:
    """Load all venues with coordinates from the database."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, name, lat, lng FROM venues WHERE lat IS NOT NULL AND lng IS NOT NULL").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def build_coord_string(venues: list[dict]) -> str:
    """Format all venue coordinates as OSRM expects: lng,lat;lng,lat;..."""
    return ";".join(f"{v['lng']},{v['lat']}" for v in venues)


def fetch_osrm_chunk(
    coord_string: str,
    source_indices: list[int],
    dest_indices: list[int],
    retries: int = MAX_RETRIES,
) -> dict | None:
    """
    Call OSRM Table API for a chunk of sources x destinations.
    
    We send ALL coordinates in the URL, but specify which subset
    to use as sources and which as destinations. This lets OSRM
    snap all points to the road network once, then just compute
    the requested subset of the matrix.
    """
    params = {
        "annotations": "duration,distance",
        "sources": ";".join(str(i) for i in source_indices),
        "destinations": ";".join(str(i) for i in dest_indices),
    }

    url = f"{OSRM_BASE}/table/v1/driving/{coord_string}"

    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=60)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok":
                    return data
                else:
                    print(f"  OSRM error: {data.get('code')} — {data.get('message', '')}")
            elif resp.status_code == 429:
                wait = (attempt + 1) * 5
                print(f"  Rate limited. Waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"  HTTP {resp.status_code} on attempt {attempt + 1}")
        except requests.exceptions.Timeout:
            print(f"  Timeout on attempt {attempt + 1}")
        except requests.exceptions.RequestException as e:
            print(f"  Request error: {e}")

        if attempt < retries - 1:
            time.sleep(REQUEST_DELAY * 2)

    return None


def store_results(
    conn: sqlite3.Connection,
    venues: list[dict],
    source_indices: list[int],
    dest_indices: list[int],
    durations: list[list],
    distances: list[list],
):
    """Write a chunk of matrix results to the database."""
    now = datetime.now(timezone.utc).isoformat()
    rows = []

    for i, si in enumerate(source_indices):
        for j, dj in enumerate(dest_indices):
            if si == dj:
                continue  # skip self-pairs

            dur = durations[i][j]
            dist = distances[i][j]

            # OSRM returns null for unreachable pairs
            if dur is None or dist is None:
                continue

            rows.append((
                venues[si]["id"],
                venues[dj]["id"],
                int(dur),
                int(dist),
                now,
            ))

    conn.executemany(
        """
        INSERT OR REPLACE INTO venue_distances 
        (venue_a_id, venue_b_id, duration_sec, distance_m, computed_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def compute_chunk_plan(n_venues: int, chunk_size: int = CHUNK_SIZE) -> list[tuple]:
    """
    Plan all source x destination chunk pairs needed to fill the full matrix.
    
    For 300 venues with chunk_size=50:
      - 6 source chunks × 6 dest chunks = 36 requests
      - Each returns a 50x50 submatrix
      - Together they tile the full 300x300 matrix
    """
    chunks = []
    n_chunks = math.ceil(n_venues / chunk_size)

    for src_chunk in range(n_chunks):
        src_start = src_chunk * chunk_size
        src_end = min(src_start + chunk_size, n_venues)
        source_indices = list(range(src_start, src_end))

        for dst_chunk in range(n_chunks):
            dst_start = dst_chunk * chunk_size
            dst_end = min(dst_start + chunk_size, n_venues)
            dest_indices = list(range(dst_start, dst_end))

            chunks.append((source_indices, dest_indices))

    return chunks


def get_existing_pairs(conn: sqlite3.Connection) -> set:
    """Load already-computed pairs so we can resume interrupted builds."""
    rows = conn.execute("SELECT venue_a_id, venue_b_id FROM venue_distances").fetchall()
    return set((r[0], r[1]) for r in rows)


def chunk_needs_work(
    venues: list[dict],
    source_indices: list[int],
    dest_indices: list[int],
    existing_pairs: set,
) -> bool:
    """Check if this chunk has any pairs not yet in the database."""
    for si in source_indices:
        for dj in dest_indices:
            if si != dj:
                pair = (venues[si]["id"], venues[dj]["id"])
                if pair not in existing_pairs:
                    return True
    return False


def build_matrix(db_path: str = DB_PATH, chunk_size: int = CHUNK_SIZE, resume: bool = True):
    """
    Build the full distance matrix.
    
    - Loads all venues
    - Plans chunk grid
    - Skips already-computed chunks (if resume=True)
    - Fetches each chunk from OSRM with rate limiting
    - Stores results incrementally
    """
    venues = get_venues(db_path)
    n = len(venues)
    print(f"Building distance matrix for {n} venues")
    print(f"Full matrix: {n}x{n} = {n*n:,} pairs (minus {n} self-pairs)")

    coord_string = build_coord_string(venues)
    chunks = compute_chunk_plan(n, chunk_size)
    total_chunks = len(chunks)

    print(f"Chunk size: {chunk_size} → {total_chunks} requests needed")
    est_time = total_chunks * REQUEST_DELAY
    print(f"Estimated time: {est_time/60:.1f} minutes\n")

    conn = sqlite3.connect(db_path)

    # Check what's already done
    existing = get_existing_pairs(conn) if resume else set()
    if existing:
        print(f"Found {len(existing):,} existing pairs in database")

    total_stored = 0
    skipped = 0

    for idx, (source_indices, dest_indices) in enumerate(chunks):
        src_range = f"{source_indices[0]}-{source_indices[-1]}"
        dst_range = f"{dest_indices[0]}-{dest_indices[-1]}"

        # Skip if all pairs in this chunk already exist
        if resume and not chunk_needs_work(venues, source_indices, dest_indices, existing):
            skipped += 1
            continue

        print(f"[{idx+1}/{total_chunks}] sources[{src_range}] × dests[{dst_range}] ({len(source_indices)}×{len(dest_indices)})")

        data = fetch_osrm_chunk(coord_string, source_indices, dest_indices)

        if data is None:
            print(f"  ✗ Failed after {MAX_RETRIES} retries — skipping chunk")
            continue

        stored = store_results(
            conn, venues, source_indices, dest_indices,
            data["durations"], data["distances"],
        )
        total_stored += stored
        print(f"  ✓ Stored {stored} pairs")

        # Rate limit
        time.sleep(REQUEST_DELAY)

    conn.close()

    print(f"\nDone!")
    print(f"  Stored: {total_stored:,} new pairs")
    print(f"  Skipped: {skipped} chunks (already computed)")
    total_expected = n * (n - 1)
    print(f"  Coverage: {(total_stored + len(existing)):,} / {total_expected:,} pairs")


def add_venues_incremental(new_venue_ids: list[str], db_path: str = DB_PATH):
    """
    Compute distances for newly added venues against all existing venues.
    Only computes the rows/columns needed, not the full matrix.
    """
    venues = get_venues(db_path)
    venue_index = {v["id"]: i for i, v in enumerate(venues)}
    coord_string = build_coord_string(venues)

    new_indices = [venue_index[vid] for vid in new_venue_ids if vid in venue_index]
    all_indices = list(range(len(venues)))

    if not new_indices:
        print("No new venues found in database")
        return

    print(f"Computing distances for {len(new_indices)} new venues against {len(venues)} total")

    conn = sqlite3.connect(db_path)

    # New venues as sources → all venues as destinations
    for i in range(0, len(new_indices), CHUNK_SIZE):
        src_chunk = new_indices[i:i + CHUNK_SIZE]
        for j in range(0, len(all_indices), CHUNK_SIZE):
            dst_chunk = all_indices[j:j + CHUNK_SIZE]
            data = fetch_osrm_chunk(coord_string, src_chunk, dst_chunk)
            if data:
                store_results(conn, venues, src_chunk, dst_chunk, data["durations"], data["distances"])
            time.sleep(REQUEST_DELAY)

    # All venues as sources → new venues as destinations (reverse direction)
    for i in range(0, len(all_indices), CHUNK_SIZE):
        src_chunk = all_indices[i:i + CHUNK_SIZE]
        for j in range(0, len(new_indices), CHUNK_SIZE):
            dst_chunk = new_indices[j:j + CHUNK_SIZE]
            data = fetch_osrm_chunk(coord_string, src_chunk, dst_chunk)
            if data:
                store_results(conn, venues, src_chunk, dst_chunk, data["durations"], data["distances"])
            time.sleep(REQUEST_DELAY)

    conn.close()
    print("Incremental update complete")


def matrix_stats(db_path: str = DB_PATH):
    """Print coverage stats for the current distance matrix."""
    conn = sqlite3.connect(db_path)
    n_venues = conn.execute("SELECT COUNT(*) FROM venues WHERE lat IS NOT NULL").fetchone()[0]
    n_pairs = conn.execute("SELECT COUNT(*) FROM venue_distances").fetchone()[0]
    expected = n_venues * (n_venues - 1)

    avg_dur = conn.execute("SELECT AVG(duration_sec) FROM venue_distances").fetchone()[0]
    max_dur = conn.execute("SELECT MAX(duration_sec) FROM venue_distances").fetchone()[0]
    min_dur = conn.execute(
        "SELECT MIN(duration_sec) FROM venue_distances WHERE duration_sec > 0"
    ).fetchone()[0]

    conn.close()

    print(f"Venues:   {n_venues}")
    print(f"Pairs:    {n_pairs:,} / {expected:,} ({n_pairs/expected*100:.1f}%)")
    print(f"Avg drive: {avg_dur/3600:.1f}h")
    print(f"Min drive: {min_dur/3600:.1f}h")
    print(f"Max drive: {max_dur/3600:.1f}h")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        matrix_stats()
    elif len(sys.argv) > 1 and sys.argv[1] == "add":
        # python matrix_builder.py add venue_id_1 venue_id_2
        add_venues_incremental(sys.argv[2:])
    else:
        build_matrix(resume=True)