"""Ensure ORM tables exist for integration tests against dev PostgreSQL."""

import app.models.schemas  # noqa: F401 — register models on Base.metadata
import pytest
from sqlalchemy import text

from app.database import Base, engine
from app.migrations import run_migrations


def _db_available() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


_DB_OK = _db_available()


def pytest_configure(config):
    config.addinivalue_line("markers", "requires_db: integration test needs PostgreSQL")


def pytest_collection_modifyitems(config, items):
    if _DB_OK:
        return
    skip = pytest.mark.skip(reason="PostgreSQL not available")
    for item in items:
        if item.get_closest_marker("requires_db"):
            item.add_marker(skip)


@pytest.fixture(scope="session", autouse=True)
def ensure_db_tables():
    if not _DB_OK:
        return
    Base.metadata.create_all(bind=engine)
    run_migrations()


@pytest.fixture
def db():
    if not _DB_OK:
        pytest.skip("PostgreSQL not available")
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
