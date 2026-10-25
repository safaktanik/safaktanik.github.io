-- Masa modları: classic (Son Kalan), territory (Bölge Savaşı), treasure (Hazine Avı), chain (Zincir).
ALTER TABLE tables ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic' CHECK (mode IN ('classic','territory','treasure','chain'));
