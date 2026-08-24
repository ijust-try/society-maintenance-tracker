import os, sys, types
sys.modules['society_db'] = types.SimpleNamespace(get_conn=lambda: None)
sys.modules['bcrypt'] = types.SimpleNamespace(checkpw=lambda *a: True, hashpw=lambda *a: b'')
os.environ['JWT_SECRET'] = 'test-secret-that-is-at-least-32-bytes-long'
from society_security import create_access_token, get_current_user, require_admin, require_resident
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


def test_admin_token_is_admin():
    token = create_access_token('a1', 'admin', 'admin@example.com')
    user = get_current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=token))
    assert user['role'] == 'admin'
    assert require_admin(user)['user_id'] == 'a1'


def test_resident_cannot_use_admin_dependency():
    token = create_access_token('r1', 'resident', 'resident@example.com')
    user = get_current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=token))
    try:
        require_admin(user)
        assert False, 'resident must not pass admin authorization'
    except HTTPException as exc:
        assert exc.status_code == 403
