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
