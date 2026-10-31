import type { WebSocket } from "@fastify/websocket";
import { roomService } from "./roomService.js";

// 双人抬棺 live messages. The owner (front bearer) runs the physics and streams numeric
// snapshots; the guest (rear bearer) only sends its pose. See miniprogram/pages/coffin/sync.js.
const COFFIN_POSES = new Set(["crouch", "half", "stand", "jump"]);
const COFFIN_STATE_LENGTH = 10;
const COFFIN_END_LENGTH = 4;

function numberArray(value: unknown, length: number) {
  if (!Array.isArray(value) || value.length !== length) return undefined;
  return value.map((item) => {
    const n = Number(item);
    return Number.isFinite(n) ? Math.round(Math.max(-100000, Math.min(100000, n)) * 1000) / 1000 : 0;
  });
}

type RoomClient = {
  socket: WebSocket;
  userId: string;
};

const roomClients = new Map<string, Map<WebSocket, RoomClient>>();

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastRaw(roomId: string, payload: unknown) {
  const clients = roomClients.get(roomId);
  if (!clients || clients.size === 0) return;

  for (const { socket } of clients.values()) {
    send(socket, payload);
  }
}

function onlineUserIds(roomId: string) {
  const clients = roomClients.get(roomId);
  if (!clients) return [];
  return [...new Set([...clients.values()].map((client) => client.userId))];
}

export const roomSocketService = {
  onlineUserIds,

  join(roomId: string, userId: string, socket: WebSocket) {
    if (!roomClients.has(roomId)) {
      roomClients.set(roomId, new Map());
    }
    roomClients.get(roomId)!.set(socket, { socket, userId });
    // Looked up once; only the coffin messages need it.
    let seat: Promise<Awaited<ReturnType<typeof roomService.seatOf>>> | undefined;
    const seatOf = () => (seat ??= roomService.seatOf(roomId, userId).catch(() => undefined));

    socket.on("message", (raw: { toString(): string }) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; score?: number; d?: number; pose?: string; v?: unknown };

        if (message.type === "coffin:input" || message.type === "coffin:state" || message.type === "coffin:end") {
          const type = message.type;
          seatOf().then((info) => {
            if (!info || info.gameId !== "coffin") return;
            if (type === "coffin:input") {
              if (info.seat !== "guest" || !COFFIN_POSES.has(String(message.pose))) return;
              broadcastRaw(roomId, { type, userId, pose: message.pose, sentAt: Date.now() });
              return;
            }
            if (info.seat !== "owner") return;
            const v = numberArray(message.v, type === "coffin:state" ? COFFIN_STATE_LENGTH : COFFIN_END_LENGTH);
            if (v) broadcastRaw(roomId, { type, userId, v, sentAt: Date.now() });
          });
          return;
        }

        if (message.type === "rematch:invite") {
          broadcastRaw(roomId, {
            type: "rematch:invite",
            fromUserId: userId,
            sentAt: Date.now()
          });
          return;
        }

        if (message.type === "rematch:decline") {
          broadcastRaw(roomId, {
            type: "rematch:decline",
            fromUserId: userId,
            sentAt: Date.now()
          });
          return;
        }

        // 追赶巴士: live distance for drawing the other player. Display only, like battle:score.
        if (message.type === "bus:pos") {
          const d = Math.max(0, Math.min(Math.round((Number(message.d) || 0) * 10) / 10, 100));
          broadcastRaw(roomId, { type: "bus:pos", userId, d, sentAt: Date.now() });
          return;
        }

        if (message.type !== "battle:score") return;

        const score = Math.max(0, Math.min(Math.floor(Number(message.score) || 0), 180));
        broadcastRaw(roomId, {
          type: "battle:score",
          userId,
          score,
          sentAt: Date.now()
        });
      } catch (error) {
        // Ignore malformed client messages.
      }
    });

    socket.on("close", () => {
      const clients = roomClients.get(roomId);
      if (!clients) return;
      clients.delete(socket);
      if (clients.size === 0) {
        roomClients.delete(roomId);
      } else {
        this.broadcast(roomId).catch(() => undefined);
      }
    });
  },

  async broadcast(roomId: string) {
    const clients = roomClients.get(roomId);
    if (!clients || clients.size === 0) return;

    const room = await roomService.getRoom(roomId);
    const payload = {
      type: "room:update",
      room,
      onlineUserIds: onlineUserIds(roomId)
    };

    for (const { socket } of clients.values()) {
      send(socket, payload);
    }
  },

  sendConnected(roomId: string, socket: WebSocket) {
    send(socket, {
      type: "room:connected",
      roomId,
      onlineUserIds: onlineUserIds(roomId)
    });
  },

  broadcastRematchStart(roomId: string, newRoom: unknown) {
    broadcastRaw(roomId, {
      type: "rematch:start",
      room: newRoom,
      sentAt: Date.now()
    });
  }
};
