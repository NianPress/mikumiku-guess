CREATE TABLE IF NOT EXISTS daily_scores (
 day TEXT NOT NULL,
 player_id TEXT NOT NULL,
 nickname TEXT NOT NULL,
 attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 10),
 submitted_at TEXT NOT NULL,
 PRIMARY KEY (day, player_id)
);
CREATE INDEX IF NOT EXISTS daily_scores_ranking ON daily_scores(day, attempts, submitted_at);
