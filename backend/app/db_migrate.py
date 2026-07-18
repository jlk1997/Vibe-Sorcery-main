"""Run Alembic migrations programmatically."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

log = logging.getLogger("vibe.migrate")


def run_alembic_upgrade() -> None:
    ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    cfg = Config(str(ini))
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:
        log.warning("Alembic upgrade failed (dev fallback may apply): %s", exc)
        raise
