CREATE TABLE IF NOT EXISTS society_complaints (
    complaint_id SERIAL PRIMARY KEY,
    resident_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    photo_url TEXT,
    photo_public_id TEXT,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    CONSTRAINT society_complaints_resolved_consistency CHECK (
        (status = 'Resolved' AND resolved_at IS NOT NULL) OR
        (status <> 'Resolved' AND resolved_at IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS society_complaint_status_history (
    history_id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL REFERENCES society_complaints(complaint_id) ON DELETE CASCADE,
    previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('Open','In Progress','Resolved')),
    new_status TEXT NOT NULL CHECK (new_status IN ('Open','In Progress','Resolved')),
    actor_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS society_notices (
    notice_id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    important BOOLEAN NOT NULL DEFAULT FALSE,
    author_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS society_notification_events (
    notification_id SERIAL PRIMARY KEY,
    event_key TEXT NOT NULL UNIQUE,
    recipient_email TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_society_complaints_resident ON society_complaints(resident_id);
CREATE INDEX IF NOT EXISTS idx_society_complaints_status ON society_complaints(status);
CREATE INDEX IF NOT EXISTS idx_society_complaints_category ON society_complaints(category);
CREATE INDEX IF NOT EXISTS idx_society_complaints_created_at ON society_complaints(created_at);
CREATE INDEX IF NOT EXISTS idx_society_complaints_priority ON society_complaints(priority);
CREATE INDEX IF NOT EXISTS idx_society_history_complaint ON society_complaint_status_history(complaint_id, created_at);
CREATE INDEX IF NOT EXISTS idx_society_notices_important_created ON society_notices(important DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_society_notifications_status ON society_notification_events(status, created_at);
