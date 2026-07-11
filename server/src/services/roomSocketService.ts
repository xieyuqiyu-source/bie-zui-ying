import type { WebSocket } from "@fastify/websocket";
import { roomService } from "./roomService.js";

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

    socket.on("message", (raw: { toString(): string }) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; score?: number };
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
  }
};
