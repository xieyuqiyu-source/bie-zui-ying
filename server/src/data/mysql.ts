import mysql from "mysql2/promise";
import { env } from "../config/env.js";

export const db = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: "Z"
});

async function columnExists(table: string, column: string) {
  const [columns] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = :database
       AND TABLE_NAME = :table
       AND COLUMN_NAME = :column`,
    { database: env.mysql.database, table, column }
  );
  return columns.length > 0;
}

export async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(32) PRIMARY KEY,
      kind VARCHAR(16) NOT NULL,
      openid VARCHAR(128) NULL UNIQUE,
      unionid VARCHAR(128) NULL,
      nickname VARCHAR(64) NOT NULL,
      avatar_url TEXT NULL,
      profile_authorized BOOLEAN NOT NULL DEFAULT FALSE,
      title VARCHAR(64) NOT NULL DEFAULT '神秘手指',
      total_matches INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      draws INT NOT NULL DEFAULT 0,
      current_streak INT NOT NULL DEFAULT 0,
      best_streak INT NOT NULL DEFAULT 0,
      best_score INT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_users_rank_wins (kind, wins),
      INDEX idx_users_rank_streak (kind, current_streak),
      INDEX idx_users_rank_best_score (kind, best_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  if (!(await columnExists("users", "profile_authorized"))) {
    await db.execute(`
      ALTER TABLE users
      ADD COLUMN profile_authorized BOOLEAN NOT NULL DEFAULT FALSE AFTER avatar_url;
    `);
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id VARCHAR(32) PRIMARY KEY,
      room_id VARCHAR(32) NOT NULL,
      player_a_id VARCHAR(32) NOT NULL,
      player_b_id VARCHAR(32) NOT NULL,
      player_a_score INT NOT NULL,
      player_b_score INT NOT NULL,
      winner_id VARCHAR(32) NULL,
      result_type VARCHAR(16) NOT NULL,
      duration_seconds INT NOT NULL,
      trash_talk TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      INDEX idx_matches_room (room_id),
      INDEX idx_matches_winner (winner_id),
      INDEX idx_matches_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  if (!(await columnExists("matches", "game_id"))) {
    await db.execute(`
      ALTER TABLE matches
      ADD COLUMN game_id VARCHAR(32) NOT NULL DEFAULT 'tap' AFTER room_id;
    `);
  }

  // best_score is NULL until the first ranked match, so "lower is better" games can use LEAST().
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_game_stats (
      user_id VARCHAR(32) NOT NULL,
      game_id VARCHAR(32) NOT NULL,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      draws INT NOT NULL DEFAULT 0,
      current_streak INT NOT NULL DEFAULT 0,
      best_streak INT NOT NULL DEFAULT 0,
      best_score INT NULL,
      total_matches INT NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (user_id, game_id),
      INDEX idx_stats_wins (game_id, wins),
      INDEX idx_stats_streak (game_id, current_streak),
      INDEX idx_stats_best_score (game_id, best_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Carry existing tap stats over from users. INSERT IGNORE keeps rows already written by settlement.
  await db.execute(`
    INSERT IGNORE INTO user_game_stats (
      user_id, game_id, wins, losses, draws, current_streak, best_streak, best_score, total_matches, updated_at
    )
    SELECT id, 'tap', wins, losses, draws, current_streak, best_streak, best_score, total_matches, updated_at
    FROM users
    WHERE kind <> 'bot' AND total_matches > 0;
  `);
}
