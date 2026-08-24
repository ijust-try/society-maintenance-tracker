from datetime import datetime, timedelta, timezone
from society_logic import ComplaintStatus, ALLOWED_STATUS_TRANSITIONS, is_overdue
from society_storage import validate_uploaded_photo_url


def test_lifecycle_is_strict():
    assert ALLOWED_STATUS_TRANSITIONS["Open"] == {"In Progress"}
    assert ALLOWED_STATUS_TRANSITIONS["In Progress"] == {"Resolved"}
    assert ALLOWED_STATUS_TRANSITIONS["Resolved"] == set()


def test_overdue_is_server_rule():
    now = datetime.now(timezone.utc)
    assert is_overdue("Open", now - timedelta(days=2), now, 3) is False
    assert is_overdue("Open", now - timedelta(days=4), now, 3) is True
    assert is_overdue("Resolved", now - timedelta(days=100), now, 3) is False


def test_photo_storage_rejects_arbitrary_urls(monkeypatch):
    monkeypatch.setattr("society_storage.CLOUD_NAME", "demo")
    monkeypatch.setattr("society_storage.API_KEY", "key")
    monkeypatch.setattr("society_storage.API_SECRET", "secret")
    validate_uploaded_photo_url("https://res.cloudinary.com/demo/image/upload/v1/society-maintenance/x.jpg", "society-maintenance/x")
    try:
        validate_uploaded_photo_url("https://example.com/x.jpg", "society-maintenance/x")
        assert False, "arbitrary URL should be rejected"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
