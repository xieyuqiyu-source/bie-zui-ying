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

  const [columns] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = :database
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'profile_authorized'`,
    { database: env.mysql.database }
  );

  if (columns.length === 0) {
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
}
