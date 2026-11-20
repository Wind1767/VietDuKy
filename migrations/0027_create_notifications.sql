CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT NOT NULL DEFAULT 'admin', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', image TEXT, link TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS notif_reads (user_id INTEGER NOT NULL, notif_id INTEGER NOT NULL, PRIMARY KEY (user_id, notif_id));
