CREATE TABLE IF NOT EXISTS bug_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, page TEXT, contact TEXT, user_id INTEGER, ua TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status, created_at);
