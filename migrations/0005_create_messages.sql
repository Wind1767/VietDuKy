CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  sender     TEXT    NOT NULL,           -- user | admin
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,           -- mili giây UTC
  read_at    INTEGER                     -- lúc bên kia mở xem; NULL = chưa xem
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);
