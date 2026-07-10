import { nanoid } from "nanoid";
import { store } from "../data/store.js";
import type { Match, Room, User } from "../types/domain.js";
import { addMinutesIso, nowIso } from "../utils/time.js";
import { trashTalkService } from "./trashTalkService.js";
import { resolveTitle } from "./titleService.js";

const MATCH_SECONDS = 10;
const MAX_REASONABLE_SCORE = 180;

function publicUser(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    title: user.title,
    wins: user.wins,
    losses: user.losses,
    bestScore: user.bestScore
  };
}

function serializeRoom(room: Room) {
  return {
    ...room,
    ownerUser: publicUser(store.users.get(room.owner.userId)!),
    guestUser: room.guest ? publicUser(store.users.get(room.guest.userId)!) : undefined
  };
}

function touchUser(user: User) {
  user.title = resolveTitle(user);
  user.updatedAt = nowIso();
}

export const roomService = {
  createRoom(owner: User) {
    const room: Room = {
      id: nanoid(16),
      code: nanoid(8),
      status: "waiting",
      owner: { userId: owner.id, ready: false },
      createdAt: nowIso(),
      expiresAt: addMinutesIso(10)
    };
    store.rooms.set(room.id, room);
    return serializeRoom(room);
  },

  createBotRoom(owner: User, bot: User) {
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
    store.rooms.set(room.id, room);
    return serializeRoom(room);
  },

  getRoom(roomId: string) {
    const room = store.rooms.get(roomId);
    return room ? serializeRoom(room) : undefined;
  },

  joinRoom(roomId: string, guest: User) {
    const room = store.rooms.get(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.status !== "waiting") throw new Error("ROOM_NOT_JOINABLE");
    if (room.owner.userId === guest.id) return serializeRoom(room);
    if (room.guest && room.guest.userId !== guest.id) throw new Error("ROOM_FULL");
    room.guest = { userId: guest.id, ready: false };
    return serializeRoom(room);
  },

  setReady(roomId: string, userId: string) {
    const room = store.rooms.get(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.owner.userId === userId) room.owner.ready = true;
    if (room.guest?.userId === userId) room.guest.ready = true;
    if (!room.guest) return serializeRoom(room);

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

    return serializeRoom(room);
  },

  submitScore(roomId: string, userId: string, score: number) {
    const room = store.rooms.get(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (!room.guest || !room.matchId) throw new Error("MATCH_NOT_READY");
    if (![room.owner.userId, room.guest.userId].includes(userId)) throw new Error("PLAYER_NOT_IN_ROOM");

    const normalizedScore = Math.max(0, Math.min(Math.floor(score), MAX_REASONABLE_SCORE));

    if (room.owner.userId === userId) {
      room.owner.score = normalizedScore;
      room.owner.submittedAt = nowIso();
    }
    if (room.guest.userId === userId) {
      room.guest.score = normalizedScore;
      room.guest.submittedAt = nowIso();
    }

    const owner = store.users.get(room.owner.userId)!;
    const guest = store.users.get(room.guest.userId)!;

    if (guest.kind === "bot" && room.guest.score === undefined) {
      const botBase = 58 + Math.floor(Math.random() * 42);
      const swing = Math.floor(Math.random() * 19) - 9;
      room.guest.score = Math.max(30, Math.min(MAX_REASONABLE_SCORE, botBase + swing));
      room.guest.submittedAt = nowIso();
    }

    if (owner.kind === "bot" && room.owner.score === undefined) {
      const botBase = 58 + Math.floor(Math.random() * 42);
      const swing = Math.floor(Math.random() * 19) - 9;
      room.owner.score = Math.max(30, Math.min(MAX_REASONABLE_SCORE, botBase + swing));
      room.owner.submittedAt = nowIso();
    }

    if (room.owner.score === undefined || room.guest.score === undefined) {
      room.status = "playing";
      return { room: serializeRoom(room), match: undefined };
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

    store.matches.set(match.id, match);
    room.status = "finished";
    room.endedAt = nowIso();

    for (const user of [owner, guest]) {
      if (user.kind !== "bot") {
        user.totalMatches += 1;
        user.bestScore = Math.max(user.bestScore, user.id === owner.id ? room.owner.score : room.guest.score);
      }
    }

    if (!winnerId) {
      if (owner.kind !== "bot") owner.draws += 1;
      if (guest.kind !== "bot") guest.draws += 1;
      owner.currentStreak = 0;
      guest.currentStreak = 0;
    } else {
      const winner = winnerId === owner.id ? owner : guest;
      const loser = winnerId === owner.id ? guest : owner;
      if (winner.kind !== "bot") {
        winner.wins += 1;
        winner.currentStreak += 1;
        winner.bestStreak = Math.max(winner.bestStreak, winner.currentStreak);
      }
      if (loser.kind !== "bot") {
        loser.losses += 1;
        loser.currentStreak = 0;
      }
    }

    touchUser(owner);
    touchUser(guest);

    return { room: serializeRoom(room), match };
  },

  rankings(type: "wins" | "streak" | "bestScore" = "wins") {
    const users = [...store.users.values()].filter((user) => user.kind !== "bot");
    const sorted = users.sort((a, b) => {
      if (type === "streak") return b.currentStreak - a.currentStreak;
      if (type === "bestScore") return b.bestScore - a.bestScore;
      return b.wins - a.wins;
    });

    return sorted.slice(0, 50).map((user, index) => ({
      rank: index + 1,
      user: publicUser(user),
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalMatches: user.totalMatches
    }));
  }
};
