import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { roomService } from "../services/roomService.js";
import { roomSocketService } from "../services/roomSocketService.js";
import { userService } from "../services/userService.js";

const userBodySchema = z.object({
  userId: z.string().optional()
});

const scoreBodySchema = z.object({
  userId: z.string(),
  score: z.coerce.number()
});

export async function roomRoutes(app: FastifyInstance) {
  app.post("/api/rooms", async (request) => {
    const body = userBodySchema.parse(request.body ?? {});
    const user = await userService.ensureUser(body.userId);
    const room = await roomService.createRoom(user);
    await roomSocketService.broadcast(room.id);
    return { user, room, onlineUserIds: roomSocketService.onlineUserIds(room.id) };
  });

  app.post("/api/rooms/bot", async (request) => {
    const body = userBodySchema.parse(request.body ?? {});
    const user = await userService.ensureUser(body.userId);
    const bot = await userService.createBotUser();
    const room = await roomService.createBotRoom(user, bot);
    await roomSocketService.broadcast(room.id);
    return { user, room, onlineUserIds: roomSocketService.onlineUserIds(room.id) };
  });

  app.get("/api/rooms/:roomId", async (request, reply) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const room = await roomService.getRoom(params.roomId);
    if (!room) return reply.code(404).send({ error: "ROOM_NOT_FOUND" });
    const match = room.status === "finished" ? await roomService.getMatch(params.roomId) : undefined;
    return { room, match, onlineUserIds: roomSocketService.onlineUserIds(params.roomId) };
  });

  app.post("/api/rooms/:roomId/join", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = userBodySchema.parse(request.body ?? {});
    const user = await userService.ensureUser(body.userId);
    const room = await roomService.joinRoom(params.roomId, user);
    await roomSocketService.broadcast(params.roomId);
    return { user, room, onlineUserIds: roomSocketService.onlineUserIds(params.roomId) };
  });

  app.post("/api/rooms/:roomId/ready", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = z.object({ userId: z.string() }).parse(request.body);
    const room = await roomService.setReady(params.roomId, body.userId);
    await roomSocketService.broadcast(params.roomId);
    return { room, onlineUserIds: roomSocketService.onlineUserIds(params.roomId) };
  });

  app.post("/api/rooms/:roomId/score", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = scoreBodySchema.parse(request.body);
    const result = await roomService.submitScore(params.roomId, body.userId, body.score);
    await roomSocketService.broadcast(params.roomId);
    return { ...result, onlineUserIds: roomSocketService.onlineUserIds(params.roomId) };
  });

  app.post("/api/rooms/:roomId/rematch", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = z.object({ userId: z.string() }).parse(request.body);
    const room = await roomService.createRematchRoom(params.roomId, body.userId);
    roomSocketService.broadcastRematchStart(params.roomId, room);
    return { room };
  });
}
