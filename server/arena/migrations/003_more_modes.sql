-- Yeni modlar (Mayın Avcısı, Yıldırım): 002'deki mod CHECK kısıtı kaldırılır; mod adı kodda doğrulanır (isMode).
-- SQLite'ta CHECK değiştirilemediği için tablo yeniden kurulur (yabancı anahtarlar geçici olarak kapalı).
PRAGMA foreign_keys = OFF;
CREATE TABLE tables_new (
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
  countdown_ends_at INTEGER,
  mode         TEXT NOT NULL DEFAULT 'classic'
);
INSERT INTO tables_new (id, name, tier, difficulty, board_size, mine_count, entry_fee, max_players, current_players, status, password_hash, created_by, created_at, countdown_ends_at, mode)
  SELECT id, name, tier, difficulty, board_size, mine_count, entry_fee, max_players, current_players, status, password_hash, created_by, created_at, countdown_ends_at, mode FROM tables;
DROP TABLE tables;
ALTER TABLE tables_new RENAME TO tables;
CREATE INDEX idx_tables_status ON tables(status);
PRAGMA foreign_keys = ON;
