"""Work access helpers — no database required."""

from app.services.work_access import can_remix_work, requires_attribution
from app.models.schemas import Work


def _work(**kwargs) -> Work:
    w = Work(title="Test", owner_id=kwargs.pop("owner_id", None))
    for key, value in kwargs.items():
        setattr(w, key, value)
    return w


def test_can_remix_default():
    assert can_remix_work(_work()) is True


def test_can_remix_explicitly_disabled():
    assert can_remix_work(_work(allow_remix=False)) is False


def test_can_remix_no_derivatives_license():
    assert can_remix_work(_work(license="no_derivatives")) is False


def test_can_remix_no_remix_license():
    assert can_remix_work(_work(license="no_remix")) is False


def test_requires_attribution():
    assert requires_attribution(_work(license="attribution")) is True
    assert requires_attribution(_work(license="allow_remix")) is False
