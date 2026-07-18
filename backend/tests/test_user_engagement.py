"""User engagement streak and weekly task tests."""

from datetime import date, timedelta

from app.services.user_engagement import _checkin_streak, _weekly_storage_key, _active_weekly_task


def test_checkin_streak_empty():
    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self

        def order_by(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def all(self):
            return []

    class FakeDb:
        def query(self, model):
            return FakeQuery()

    assert _checkin_streak(FakeDb(), __import__("uuid").uuid4()) == 0


def test_weekly_storage_key_includes_iso_week():
    key = _weekly_storage_key("weekly_listen_3")
    week = date.today().isocalendar()[1]
    assert key == f"weekly_listen_3_{week}"


def test_active_weekly_task_rotates():
    task = _active_weekly_task()
    assert task["key"] in {
        "weekly_listen_3",
        "weekly_remix_1",
        "weekly_publish_1",
        "weekly_journey_1",
    }
    assert task["credits"] >= 2
