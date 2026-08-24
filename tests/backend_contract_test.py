from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"
ROUTES = (ROOT / 'society_routes.py').read_text()
SCHEMA = (ROOT / 'society_schema.sql').read_text()


def test_required_routes_exist():
    required = [
        '"/uploads/photo"',
        '"/complaints"',
        '"/complaints/{complaint_id}/history"',
        '"/complaints/{complaint_id}/priority"',
        '"/complaints/{complaint_id}/status"',
        '"/admin/dashboard"',
        '"/notices"',
        '"/notices/{notice_id}"',
        '"/admin/notifications/retry"',
    ]
    for route in required:
        assert route in ROUTES


def test_server_side_authorization_is_present():
    assert 'Depends(require_resident)' in ROUTES
    assert 'Depends(require_admin)' in ROUTES
    assert 'resident_id=%s' in ROUTES
    assert 'user["user_id"]' in ROUTES


def test_database_integrity_features_exist():
    assert 'society_complaint_status_history' in SCHEMA
    assert 'CHECK (status IN' in SCHEMA
    assert 'CHECK (priority IN' in SCHEMA
    assert 'REFERENCES users(user_id)' in SCHEMA
    assert 'society_notification_events' in SCHEMA
    assert 'UNIQUE' in SCHEMA
