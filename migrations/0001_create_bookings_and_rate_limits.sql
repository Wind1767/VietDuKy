CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,              -- mili giây UTC
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  destination TEXT,
  depart_date TEXT,                          -- YYYY-MM-DD
  people      INTEGER,
  message     TEXT,
  source      TEXT    NOT NULL DEFAULT 'contact', -- contact | home
  status      TEXT    NOT NULL DEFAULT 'new',     -- new | called | won | cancelled
  note        TEXT    NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);

CREATE TABLE IF NOT EXISTS rate_limits (
  key    TEXT    NOT NULL,
  window INTEGER NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
