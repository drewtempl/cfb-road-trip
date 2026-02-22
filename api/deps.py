"""
Shared dependencies for GameTrip API routes.
"""

import os
import sys
from pathlib import Path

# ── Python path setup ─────────────────────────────────────────────────────────
# db/ modules use bare imports (from graph import ...), so we add db/ to sys.path
# before any route imports trigger them.
_DB_DIR = Path(__file__).parent.parent / "db"
if str(_DB_DIR) not in sys.path:
    sys.path.insert(0, str(_DB_DIR))

# ── DB path ───────────────────────────────────────────────────────────────────
# Override via GAMETRIP_DB environment variable for deployment flexibility.
DB_PATH: Path = Path(os.environ.get("GAMETRIP_DB", str(_DB_DIR / "gametrip.db")))


def get_db_path() -> Path:
    """FastAPI dependency: resolves the SQLite database path."""
    return DB_PATH
