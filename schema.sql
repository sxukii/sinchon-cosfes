CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  x_account TEXT DEFAULT '',
  category TEXT NOT NULL,
  days TEXT NOT NULL,
  times TEXT NOT NULL,
  genre TEXT DEFAULT '',
  message TEXT DEFAULT '',
  image_key TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_participants_created_at
ON participants(created_at DESC);
