import { nanoid } from "nanoid";
import type { RowDataPacket } from "mysql2";
import { db } from "../data/mysql.js";
import { redis } from "../data/redis.js";
import type { Match, Room, User } from "../types/domain.js";
import { addMinutesIso, nowIso } from "../utils/time.js";
import { titleService } from "./titleService.js";
import { trashTalkService } from "./trashTalkService.js";
import { userService } from "./userService.js";

const MATCH_SECONDS = 10;
const MAX_REASONABLE_SCORE = 180;
const ROOM_TTL_SECONDS = 60 * 15;
const roomLocks = new Map<string, Promise<void>>();

interface MatchRow extends RowDataPacket {
  id: string;
  room_id: string;
  player_a_id: string;
  player_b_id: string;
  player_a_score: number;
  player_b_score: number;
  winner_id?: string | null;
  result_type: "win" | "draw";
  duration_seconds: number;
  trash_talk: string;
  created_at: Date;
}

function roomKey(roomId: string) {
  return `bie-zui-ying:room:${roomId}`;
}

function publicUser(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    initial: user.nickname.slice(0, 1),
    avatarUrl: user.avatarUrl,
    profileAuthorized: user.profileAuthorized,
    title: user.title,
    wins: user.wins,
    losses: user.losses,
    bestScore: user.bestScore
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    roomId: row.room_id,
    playerAId: row.player_a_id,
    playerBId: row.player_b_id,
    playerAScore: row.player_a_score,
    playerBScore: row.player_b_score,
    winnerId: row.winner_id || undefined,
    resultType: row.result_type,
    durationSeconds: row.duration_seconds,
    trashTalk: row.trash_talk,
    createdAt: row.created_at.toISOString()
  };
}

async function withRoomLock<T>(roomId: string, task: () => Promise<T>) {
  const previous = roomLocks.get(roomId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => current);
  roomLocks.set(roomId, next);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (roomLocks.get(roomId) === next) {
      roomLocks.delete(roomId);
    }
  }
}

async function saveRoom(room: Room) {
  await redis.set(roomKey(room.id), JSON.stringify(room), "EX", ROOM_TTL_SECONDS);
}

async function loadRoom(roomId: string) {
  const raw = await redis.get(roomKey(roomId));
  return raw ? (JSON.parse(raw) as Room) : undefined;
}

async function serializeRoom(room: Room) {
  const owner = await userService.getUser(room.owner.userId);
  const guest = room.guest ? await userService.getUser(room.guest.userId) : undefined;

  if (!owner) throw new Error("OWNER_NOT_FOUND");

  return {
    ...room,
    ownerUser: publicUser(owner),
    guestUser: guest ? publicUser(guest) : undefined
  };
}

function touchUser(user: User) {
  user.title = titleService.resolveTitle(user);
  user.updatedAt = nowIso();
}

function botScore() {
  const botBase = 58 + Math.floor(Math.random() * 42);
  const swing = Math.floor(Math.random() * 19) - 9;
  return Math.max(30, Math.min(MAX_REASONABLE_SCORE, botBase + swing));
}

async function insertMatch(match: Match) {
  await db.execute(
    `INSERT INTO matches (
      id, room_id, player_a_id, player_b_id, player_a_score, player_b_score,
      winner_id, result_type, duration_seconds, trash_talk, created_at
    ) VALUES (
      :id, :roomId, :playerAId, :playerBId, :playerAScore, :playerBScore,
      :winnerId, :resultType, :durationSeconds, :trashTalk, :createdAt
    )`,
    {
      ...match,
      winnerId: match.winnerId ?? null,
      createdAt: new Date(match.createdAt)
    }
  );
}

async function findMatchByRoom(roomId: string) {
  const [rows] = await db.execute<MatchRow[]>("SELECT * FROM matches WHERE room_id = :roomId LIMIT 1", { roomId });
  return rows[0] ? rowToMatch(rows[0]) : undefined;
}

export const roomService = {
  async createRoom(owner: User) {
    const room: Room = {
      id: nanoid(16),
      code: nanoid(8),
      status: "waiting",
      owner: { userId: owner.id, ready: false },
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };
    await saveRoom(room);
    return serializeRoom(room);
  },

  async createBotRoom(owner: User, bot: User) {
    const playStartAt = new Date(Date.now() + 3000).toISOString();
    const playEndsAt = new Date(Date.now() + 3000 + MATCH_SECONDS * 1000).toISOString();
    const room: Room = {
      id: nanoid(16),
      code: nanoid(8),
      status: "countdown",
      owner: { userId: owner.id, ready: true },
      guest: { userId: bot.id, ready: true },
      matchId: nanoid(16),
      countdownStartAt: nowIso(),
      playStartAt,
      playEndsAt,
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };
    await saveRoom(room);
    return serializeRoom(room);
  },

  async createRematchRoom(roomId: string, userId: string) {
    const oldRoom = await loadRoom(roomId);
    if (!oldRoom) throw new Error("ROOM_NOT_FOUND");
    if (oldRoom.status !== "finished") throw new Error("REMATCH_NEEDS_FINISHED_ROOM");
    if (!oldRoom.guest) throw new Error("REMATCH_NEEDS_TWO_PLAYERS");
    if (![oldRoom.owner.userId, oldRoom.guest.userId].includes(userId)) throw new Error("PLAYER_NOT_IN_ROOM");

    const owner = await userService.getUser(oldRoom.owner.userId);
    const guest = await userService.getUser(oldRoom.guest.userId);
    if (!owner || !guest) throw new Error("PLAYER_NOT_FOUND");
    if (owner.kind === "bot" || guest.kind === "bot") throw new Error("REMATCH_NEEDS_REAL_PLAYERS");

    const playStartAt = new Date(Date.now() + 3000).toISOString();
    const playEndsAt = new Date(Date.now() + 3000 + MATCH_SECONDS * 1000).toISOString();
    const room: Room = {
      id: nanoid(16),
      code: nanoid(8),
      status: "countdown",
      owner: { userId: oldRoom.owner.userId, ready: true },
      guest: { userId: oldRoom.guest.userId, ready: true },
      matchId: nanoid(16),
      countdownStartAt: nowIso(),
      playStartAt,
      playEndsAt,
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };

    await saveRoom(room);
    return serializeRoom(room);
  },

  async getRoom(roomId: string) {
    const room = await loadRoom(roomId);
    return room ? serializeRoom(room) : undefined;
  },

  async getMatch(roomId: string) {
    return findMatchByRoom(roomId);
  },

  async joinRoom(roomId: string, guest: User) {
    const room = await loadRoom(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.status !== "waiting") throw new Error("ROOM_NOT_JOINABLE");
    if (room.owner.userId === guest.id) return serializeRoom(room);
    if (room.guest && room.guest.userId !== guest.id) throw new Error("ROOM_FULL");
    room.guest = { userId: guest.id, ready: false };
    await saveRoom(room);
    return serializeRoom(room);
  },

  async setReady(roomId: string, userId: string) {
    const room = await loadRoom(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.owner.userId === userId) room.owner.ready = true;
    if (room.guest?.userId === userId) room.guest.ready = true;
    if (!room.guest) {
      await saveRoom(room);
      return serializeRoom(room);
    }

    if (room.owner.ready && room.guest.ready && room.status === "waiting") {
      const countdownStartAt = nowIso();
      const playStartAt = new Date(Date.now() + 3000).toISOString();
      const playEndsAt = new Date(Date.now() + 3000 + MATCH_SECONDS * 1000).toISOString();
      room.status = "countdown";
      room.countdownStartAt = countdownStartAt;
      room.playStartAt = playStartAt;
      room.playEndsAt = playEndsAt;
      room.matchId = nanoid(16);
    }

    await saveRoom(room);
    return serializeRoom(room);
  },

  async submitScore(roomId: string, userId: string, score: number) {
    return withRoomLock(roomId, async () => {
    const room = await loadRoom(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (!room.guest || !room.matchId) throw new Error("MATCH_NOT_READY");
    if (![room.owner.userId, room.guest.userId].includes(userId)) throw new Error("PLAYER_NOT_IN_ROOM");

    if (room.status === "finished") {
      return { room: await serializeRoom(room), match: await findMatchByRoom(room.id) };
    }

    const normalizedScore = Math.max(0, Math.min(Math.floor(score), MAX_REASONABLE_SCORE));

    if (room.owner.userId === userId) {
      room.owner.score = normalizedScore;
      room.owner.submittedAt = nowIso();
    }
    if (room.guest.userId === userId) {
      room.guest.score = normalizedScore;
      room.guest.submittedAt = nowIso();
    }

    const owner = await userService.getUser(room.owner.userId);
    const guest = await userService.getUser(room.guest.userId);
    if (!owner || !guest) throw new Error("PLAYER_NOT_FOUND");

    if (guest.kind === "bot" && room.guest.score === undefined) {
      room.guest.score = botScore();
      room.guest.submittedAt = nowIso();
    }

    if (owner.kind === "bot" && room.owner.score === undefined) {
      room.owner.score = botScore();
      room.owner.submittedAt = nowIso();
    }

    if (room.owner.score === undefined || room.guest.score === undefined) {
      room.status = "playing";
      await saveRoom(room);
      return { room: await serializeRoom(room), match: undefined };
    }

    const ownerWon = room.owner.score > room.guest.score;
    const guestWon = room.guest.score > room.owner.score;
    const winnerId = ownerWon ? owner.id : guestWon ? guest.id : undefined;
    const trashTalk = winnerId ? trashTalkService.win() : trashTalkService.draw();

    const match: Match = {
      id: room.matchId,
      roomId: room.id,
      playerAId: owner.id,
      playerBId: guest.id,
      playerAScore: room.owner.score,
      playerBScore: room.guest.score,
      winnerId,
      resultType: winnerId ? "win" : "draw",
      durationSeconds: MATCH_SECONDS,
      trashTalk,
      createdAt: nowIso()
    };

    room.status = "finished";
    room.endedAt = nowIso();

    const rankedMatch = owner.kind !== "bot" && guest.kind !== "bot";

    if (rankedMatch) {
      for (const user of [owner, guest]) {
        user.totalMatches += 1;
        user.bestScore = Math.max(user.bestScore, user.id === owner.id ? room.owner.score : room.guest.score);
      }

      if (!winnerId) {
        owner.draws += 1;
        guest.draws += 1;
        owner.currentStreak = 0;
        guest.currentStreak = 0;
      } else {
        const winner = winnerId === owner.id ? owner : guest;
        const loser = winnerId === owner.id ? guest : owner;
        winner.wins += 1;
        winner.currentStreak += 1;
        winner.bestStreak = Math.max(winner.bestStreak, winner.currentStreak);
        loser.losses += 1;
        loser.currentStreak = 0;
      }

      touchUser(owner);
      touchUser(guest);
    }

    await insertMatch(match);
    await Promise.all([
      rankedMatch ? userService.saveUserStats(owner) : undefined,
      rankedMatch ? userService.saveUserStats(guest) : undefined,
      saveRoom(room)
    ]);

    return { room: await serializeRoom(room), match };
    });
  },

  async rankings(type: "wins" | "streak" | "bestScore" = "wins") {
    const users = await userService.rankings(type);
    return users.map((user, index) => ({
      rank: index + 1,
      user: publicUser(user),
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalMatches: user.totalMatches
    }));
  }
};
