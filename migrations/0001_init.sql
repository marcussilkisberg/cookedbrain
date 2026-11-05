CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX sessions_player ON sessions(player_id);
CREATE TABLE magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  from_player TEXT NOT NULL,
  expires INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
-- One row per player, test, version and input class. `recent` is the last 10 scores as JSON.
CREATE TABLE rows (
  player_id TEXT NOT NULL REFERENCES players(id),
  test TEXT NOT NULL,
  version INTEGER NOT NULL,
  input TEXT NOT NULL,
  best REAL NOT NULL,
  median REAL NOT NULL,
  recent TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (player_id, test, version, input)
);
CREATE INDEX rows_pop ON rows(test, version, input, median);
CREATE INDEX rows_best ON rows(test, version, input, best);
-- Every scored round. The seed is the challenge key and is single use per player.
CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  test TEXT NOT NULL,
  version INTEGER NOT NULL,
  input TEXT NOT NULL,
  seed TEXT NOT NULL,
  score REAL NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE UNIQUE INDEX rounds_seed_player ON rounds(seed, player_id);
CREATE INDEX rounds_seed ON rounds(seed);
