-- Mine Duel Arena: ilk şema (SQLite). Para değerleri tam sayıdır (DUEL COIN, sanal puan).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  username_lc   TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  avatar        INTEGER NOT NULL DEFAULT 0,
  account_type  TEXT NOT NULL CHECK (account_type IN ('guest','member')),
  email         TEXT UNIQUE,
  password_hash TEXT,
  level         INTEGER NOT NULL DEFAULT 1,
  experience    INTEGER NOT NULL DEFAULT 0,
  balance       INTEGER NOT NULL CHECK (balance >= 0),
  total_wins    INTEGER NOT NULL DEFAULT 0,
  total_losses  INTEGER NOT NULL DEFAULT 0,
  games_played  INTEGER NOT NULL DEFAULT 0,
  best_weekly_rank INTEGER,
  daily_streak  INTEGER NOT NULL DEFAULT 0,
  last_daily    TEXT,
  last_rescue   TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE tables (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  tier         TEXT NOT NULL,
  difficulty   TEXT NOT NULL,
  board_size   INTEGER NOT NULL,
  mine_count   INTEGER NOT NULL,
  entry_fee    INTEGER NOT NULL CHECK (entry_fee >= 0),
  max_players  INTEGER NOT NULL CHECK (max_players IN (3,4)),
  current_players INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL CHECK (status IN ('waiting','countdown','playing','finished','cancelled')),
  password_hash TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  countdown_ends_at INTEGER
);
CREATE INDEX idx_tables_status ON tables(status);

CREATE TABLE table_players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id      TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  seat_number   INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('seated','playing','left','refunded','finished')),
  entry_fee_paid INTEGER NOT NULL DEFAULT 0,
  joined_at     INTEGER NOT NULL
);
CREATE INDEX idx_tp_table ON table_players(table_id);
CREATE INDEX idx_tp_user ON table_players(user_id);
-- Aynı koltuğa iki oyuncu oturamaz; bir oyuncu aynı anda yalnızca tek masada olabilir.
CREATE UNIQUE INDEX uq_tp_seat ON table_players(table_id, seat_number) WHERE status IN ('seated','playing');
CREATE UNIQUE INDEX uq_tp_active_user ON table_players(user_id) WHERE status IN ('seated','playing');

CREATE TABLE matches (
  id            TEXT PRIMARY KEY,
  table_id      TEXT NOT NULL UNIQUE REFERENCES tables(id), -- bir masa için tek maç
  status        TEXT NOT NULL CHECK (status IN ('active','finished','aborted')),
  current_turn_user_id TEXT,
  board_state   TEXT NOT NULL,
  mine_positions TEXT NOT NULL,
  prize_pool    INTEGER NOT NULL,
  winner_user_id TEXT REFERENCES users(id),
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  turn_ends_at  INTEGER,
  settled       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_matches_status ON matches(status);

CREATE TABLE match_players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  seat_number   INTEGER NOT NULL,
  lives         INTEGER NOT NULL,
  eliminated    INTEGER NOT NULL DEFAULT 0,
  turn_count    INTEGER NOT NULL DEFAULT 0,
  mines_triggered INTEGER NOT NULL DEFAULT 0,
  safe_opened   INTEGER NOT NULL DEFAULT 0,
  final_rank    INTEGER,
  points_delta  INTEGER NOT NULL DEFAULT 0,
  prize         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (match_id, user_id)
);
CREATE INDEX idx_mp_user ON match_players(user_id);

CREATE TABLE wallet_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL REFERENCES users(id),
  transaction_type TEXT NOT NULL,
  amount           INTEGER NOT NULL,
  balance_before   INTEGER NOT NULL,
  balance_after    INTEGER NOT NULL CHECK (balance_after >= 0),
  match_id         TEXT,
  table_id         TEXT,
  idempotency_key  TEXT NOT NULL UNIQUE,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_wt_user ON wallet_transactions(user_id, id);

CREATE TABLE weekly_leaderboard (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id),
  week_start   TEXT NOT NULL,
  points       INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  coins_won    INTEGER NOT NULL DEFAULT 0,
  rank         INTEGER,
  UNIQUE (user_id, week_start)
);
CREATE INDEX idx_wl_week ON weekly_leaderboard(week_start, points DESC);

-- Biten haftalar bir kez arşivlenir ve ödüller dağıtılır.
CREATE TABLE weekly_settlements (
  week_start TEXT PRIMARY KEY,
  settled_at INTEGER NOT NULL
);

CREATE TABLE daily_claims (
  user_id TEXT NOT NULL REFERENCES users(id),
  day     TEXT NOT NULL,
  amount  INTEGER NOT NULL,
  UNIQUE (user_id, day)
);
