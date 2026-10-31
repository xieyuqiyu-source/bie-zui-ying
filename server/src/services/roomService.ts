import { nanoid } from "nanoid";
import type { RowDataPacket } from "mysql2";
import { db } from "../data/mysql.js";
import { redis } from "../data/redis.js";
import { DEFAULT_GAME_ID, getGame } from "../games/index.js";
import type { GameDefinition, RankingType, RawSubmission, Submission } from "../games/types.js";
import type { Match, Room, RoomPlayer, User } from "../types/domain.js";
import { addMinutesIso, nowIso } from "../utils/time.js";
import { gameStatsService } from "./gameStatsService.js";
import { titleService } from "./titleService.js";
import { trashTalkService } from "./trashTalkService.js";
import { userService } from "./userService.js";

// Countdown before play starts, shared by every game.
const COUNTDOWN_MS = 3000;
// The stats columns on `users` (and the titles derived from them) belong to this game.
// Keep writing them until clients read user_game_stats instead.
const LEGACY_USER_STATS_GAME_ID = DEFAULT_GAME_ID;
const ROOM_TTL_SECONDS = 60 * 15;
// How long after playEndsAt we wait for a player's score before settling without it.
const SUBMIT_GRACE_MS = 10_000;
const roomLocks = new Map<string, Promise<void>>();

interface MatchRow extends RowDataPacket {
  id: string;
  room_id: string;
  game_id: string;
  player_a_id: string;
  player_b_id: string;
  player_a_score: number;
  player_b_score: number;
  winner_id?: string | null;
  result_type: Match["resultType"];
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
    gameId: row.game_id,
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

function roomGame(room: Room) {
  return getGame(room.gameId ?? DEFAULT_GAME_ID);
}

function submissionOf(player: RoomPlayer | undefined): Submission | undefined {
  if (!player || player.score === undefined) return undefined;
  return { score: player.score, trace: player.trace };
}

function applySubmission(player: RoomPlayer, submission: Submission) {
  player.score = submission.score;
  if (submission.trace) player.trace = submission.trace;
  player.submittedAt = nowIso();
}

// The owner's pick for asymmetric games; the guest always gets the other role.
function ownerRole(game: GameDefinition, requested?: string) {
  if (!game.roles) return undefined;
  if (requested === undefined) return game.roles[0];
  if (!game.roles.includes(requested)) throw new Error("ROLE_NOT_SUPPORTED");
  return requested;
}

function otherRole(game: GameDefinition, role?: string) {
  if (!game.roles) return undefined;
  return game.roles[0] === role ? game.roles[1] : game.roles[0];
}

function playWindow(game: GameDefinition) {
  const playStartAt = new Date(Date.now() + COUNTDOWN_MS).toISOString();
  const playEndsAt = new Date(Date.now() + COUNTDOWN_MS + game.durationSeconds * 1000).toISOString();
  return { playStartAt, playEndsAt };
}

async function insertMatch(match: Match) {
  await db.execute(
    `INSERT INTO matches (
      id, room_id, game_id, player_a_id, player_b_id, player_a_score, player_b_score,
      winner_id, result_type, duration_seconds, trash_talk, created_at
    ) VALUES (
      :id, :roomId, :gameId, :playerAId, :playerBId, :playerAScore, :playerBScore,
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

function isOverdue(room: Room) {
  if (room.status !== "countdown" && room.status !== "playing") return false;
  if (!room.guest || !room.matchId || !room.playEndsAt) return false;
  return Date.now() > new Date(room.playEndsAt).getTime() + SUBMIT_GRACE_MS;
}

async function settleMatch(room: Room, owner: User, guest: User) {
  const game = roomGame(room);
  const guestPlayer = room.guest!;
  const ownerAbsent = room.owner.score === undefined;
  const guestAbsent = guestPlayer.score === undefined;
  const roles = { owner: room.owner.role, guest: guestPlayer.role };

  const judgement = game.judge(submissionOf(room.owner), submissionOf(guestPlayer), roles);
  const { ownerScore, guestScore } = judgement;
  const teamWon = judgement.team === "win";
  const teamLost = judgement.team === "lose";
  const ownerWon = judgement.winner === "owner" || teamWon;
  const guestWon = judgement.winner === "guest" || teamWon;
  const winnerId = judgement.winner === "owner" ? owner.id : judgement.winner === "guest" ? guest.id : undefined;
  const trashTalk = game.trashTalk
    ? game.trashTalk(judgement, roles)
    : winnerId
      ? trashTalkService.win()
      : trashTalkService.draw();

  const match: Match = {
    id: room.matchId!,
    roomId: room.id,
    gameId: game.id,
    playerAId: owner.id,
    playerBId: guest.id,
    playerAScore: ownerScore,
    playerBScore: guestScore,
    winnerId,
    resultType: teamWon ? "coop_win" : teamLost ? "coop_lose" : winnerId ? "win" : "draw",
    durationSeconds: game.durationSeconds,
    trashTalk,
    createdAt: nowIso()
  };

  room.owner.score = ownerScore;
  guestPlayer.score = guestScore;
  room.resultDetail = judgement.detail;
  room.status = "finished";
  room.endedAt = nowIso();

  // A match nobody submitted to says nothing about either player, so it doesn't count.
  const rankedMatch = owner.kind !== "bot" && guest.kind !== "bot" && !(ownerAbsent && guestAbsent);

  const writeLegacyStats = rankedMatch && game.id === LEGACY_USER_STATS_GAME_ID;

  if (writeLegacyStats) {
    for (const user of [owner, guest]) {
      user.totalMatches += 1;
      user.bestScore = Math.max(user.bestScore, user.id === owner.id ? ownerScore : guestScore);
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

  const outcomeOf = (won: boolean, lost: boolean): "win" | "loss" | "draw" => (won ? "win" : lost ? "loss" : "draw");
  const ownerLost = judgement.winner === "guest" || teamLost;
  const guestLost = judgement.winner === "owner" || teamLost;
  const countScore = !game.cooperative || teamWon;

  await insertMatch(match);
  await Promise.all([
    rankedMatch ? gameStatsService.recordResult(owner.id, game.id, outcomeOf(ownerWon, ownerLost), countScore ? ownerScore : null) : undefined,
    rankedMatch ? gameStatsService.recordResult(guest.id, game.id, outcomeOf(guestWon, guestLost), countScore ? guestScore : null) : undefined,
    writeLegacyStats ? userService.saveUserStats(owner) : undefined,
    writeLegacyStats ? userService.saveUserStats(guest) : undefined,
    saveRoom(room)
  ]);

  return match;
}

async function loadPlayers(room: Room) {
  const owner = await userService.getUser(room.owner.userId);
  const guest = room.guest ? await userService.getUser(room.guest.userId) : undefined;
  if (!owner || !guest) throw new Error("PLAYER_NOT_FOUND");
  return { owner, guest };
}

function fillBotScores(room: Room, owner: User, guest: User) {
  const game = roomGame(room);
  if (!game.botSubmission) return;
  if (guest.kind === "bot" && room.guest!.score === undefined) {
    applySubmission(room.guest!, game.botSubmission(room.guest!.role));
  }
  if (owner.kind === "bot" && room.owner.score === undefined) {
    applySubmission(room.owner, game.botSubmission(room.owner.role));
  }
}

// Must be called while holding the room lock.
async function settleIfOverdue(room: Room) {
  if (!isOverdue(room)) return false;
  const { owner, guest } = await loadPlayers(room);
  fillBotScores(room, owner, guest);
  await settleMatch(room, owner, guest);
  return true;
}

export const roomService = {
  async createRoom(owner: User, gameId: string = DEFAULT_GAME_ID, role?: string) {
    const game = getGame(gameId);
    const room: Room = {
      id: nanoid(16),
      gameId: game.id,
      code: nanoid(8),
      status: "waiting",
      owner: { userId: owner.id, ready: false, role: ownerRole(game, role) },
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };
    await saveRoom(room);
    return serializeRoom(room);
  },

  async createBotRoom(owner: User, bot: User, gameId: string = DEFAULT_GAME_ID, role?: string) {
    const game = getGame(gameId);
    if (!game.botSubmission) throw new Error("BOT_NOT_SUPPORTED");
    const { playStartAt, playEndsAt } = playWindow(game);
    const playerRole = ownerRole(game, role);
    const room: Room = {
      id: nanoid(16),
      gameId: game.id,
      code: nanoid(8),
      status: "countdown",
      owner: { userId: owner.id, ready: true, role: playerRole },
      guest: { userId: bot.id, ready: true, role: otherRole(game, playerRole) },
      matchId: nanoid(16),
      countdownStartAt: nowIso(),
      playStartAt,
      playEndsAt,
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };
    // Games with a live view of the opponent (bus) need the bot's run up front to animate it.
    // Bot matches are unranked, so revealing it early costs nothing.
    if (game.roles) fillBotScores(room, owner, bot);
    await saveRoom(room);
    return serializeRoom(room);
  },

  async createRematchRoom(roomId: string, userId: string) {
    return withRoomLock(roomId, async () => {
    const oldRoom = await loadRoom(roomId);
    if (!oldRoom) throw new Error("ROOM_NOT_FOUND");
    if (oldRoom.status !== "finished") throw new Error("REMATCH_NEEDS_FINISHED_ROOM");
    if (!oldRoom.guest) throw new Error("REMATCH_NEEDS_TWO_PLAYERS");
    if (![oldRoom.owner.userId, oldRoom.guest.userId].includes(userId)) throw new Error("PLAYER_NOT_IN_ROOM");

    const owner = await userService.getUser(oldRoom.owner.userId);
    const guest = await userService.getUser(oldRoom.guest.userId);
    if (!owner || !guest) throw new Error("PLAYER_NOT_FOUND");
    if (owner.kind === "bot" || guest.kind === "bot") throw new Error("REMATCH_NEEDS_REAL_PLAYERS");

    // Both players may accept at once; hand them the same room.
    if (oldRoom.rematchRoomId) {
      const existing = await loadRoom(oldRoom.rematchRoomId);
      if (existing) return serializeRoom(existing);
    }

    const game = roomGame(oldRoom);
    const { playStartAt, playEndsAt } = playWindow(game);
    const room: Room = {
      id: nanoid(16),
      gameId: game.id,
      code: nanoid(8),
      status: "countdown",
      // Same roles as last time; to swap, start a new room from the lobby.
      owner: { userId: oldRoom.owner.userId, ready: true, role: oldRoom.owner.role },
      guest: { userId: oldRoom.guest.userId, ready: true, role: oldRoom.guest.role },
      matchId: nanoid(16),
      countdownStartAt: nowIso(),
      playStartAt,
      playEndsAt,
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };

    await saveRoom(room);
    oldRoom.rematchRoomId = room.id;
    await saveRoom(oldRoom);
    return serializeRoom(room);
    });
  },

  async getRoom(roomId: string) {
    let room = await loadRoom(roomId);
    if (room && isOverdue(room)) {
      room = await withRoomLock(roomId, async () => {
        const fresh = await loadRoom(roomId);
        if (fresh) await settleIfOverdue(fresh);
        return fresh;
      });
    }
    return room ? serializeRoom(room) : undefined;
  },

  // Which seat a user holds, for checking who may send which live message. Read once per
  // connection, so it skips the lock and the overdue check.
  async seatOf(roomId: string, userId: string) {
    const room = await loadRoom(roomId);
    if (!room) return undefined;
    const seat = room.owner.userId === userId ? "owner" : room.guest?.userId === userId ? "guest" : undefined;
    return seat ? { seat, gameId: room.gameId ?? DEFAULT_GAME_ID } : undefined;
  },

  async getMatch(roomId: string) {
    return findMatchByRoom(roomId);
  },

  async joinRoom(roomId: string, guest: User) {
    return withRoomLock(roomId, async () => {
    const room = await loadRoom(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.status !== "waiting") throw new Error("ROOM_NOT_JOINABLE");
    if (room.owner.userId === guest.id) return serializeRoom(room);
    if (room.guest && room.guest.userId !== guest.id) throw new Error("ROOM_FULL");
    room.guest = { userId: guest.id, ready: false, role: otherRole(roomGame(room), room.owner.role) };
    await saveRoom(room);
    return serializeRoom(room);
    });
  },

  async setReady(roomId: string, userId: string) {
    return withRoomLock(roomId, async () => {
    const room = await loadRoom(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.owner.userId !== userId && room.guest?.userId !== userId) throw new Error("PLAYER_NOT_IN_ROOM");
    if (room.owner.userId === userId) room.owner.ready = true;
    if (room.guest?.userId === userId) room.guest.ready = true;
    if (!room.guest) {
      await saveRoom(room);
      return serializeRoom(room);
    }

    if (room.owner.ready && room.guest.ready && room.status === "waiting") {
      const countdownStartAt = nowIso();
      const { playStartAt, playEndsAt } = playWindow(roomGame(room));
      room.status = "countdown";
      room.countdownStartAt = countdownStartAt;
      room.playStartAt = playStartAt;
      room.playEndsAt = playEndsAt;
      room.matchId = nanoid(16);
    }

    await saveRoom(room);
    return serializeRoom(room);
    });
  },

  async submitScore(roomId: string, userId: string, raw: RawSubmission) {
    return withRoomLock(roomId, async () => {
    const room = await loadRoom(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (!room.guest || !room.matchId) throw new Error("MATCH_NOT_READY");
    if (![room.owner.userId, room.guest.userId].includes(userId)) throw new Error("PLAYER_NOT_IN_ROOM");

    // Too late to count: settle with whatever was submitted in time.
    if (await settleIfOverdue(room) || room.status === "finished") {
      return { room: await serializeRoom(room), match: await findMatchByRoom(room.id) };
    }

    const player = room.owner.userId === userId ? room.owner : room.guest;
    // First submission wins; a resend after a timeout must not overwrite it.
    if (player.score === undefined) {
      applySubmission(player, roomGame(room).normalizeSubmission(raw, player.role));
    }

    const { owner, guest } = await loadPlayers(room);
    fillBotScores(room, owner, guest);

    if (room.owner.score === undefined || room.guest.score === undefined) {
      room.status = "playing";
      await saveRoom(room);
      return { room: await serializeRoom(room), match: undefined };
    }

    const match = await settleMatch(room, owner, guest);
    return { room: await serializeRoom(room), match };
    });
  },

  async rankings(gameId: string = DEFAULT_GAME_ID, type: RankingType = "wins") {
    const rows = await gameStatsService.rankings(gameId, type);
    // Same shape as before: user.wins/losses/bestScore are this game's numbers.
    return rows.map(({ user, stats }, index) => ({
      rank: index + 1,
      gameId,
      user: {
        id: user.id,
        nickname: user.nickname,
        initial: user.nickname.slice(0, 1),
        avatarUrl: user.avatarUrl,
        profileAuthorized: user.profileAuthorized,
        title: user.title,
        wins: stats.wins,
        losses: stats.losses,
        bestScore: stats.bestScore ?? null
      },
      draws: stats.draws,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      totalMatches: stats.totalMatches
    }));
  }
};
