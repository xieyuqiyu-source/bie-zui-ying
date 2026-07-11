import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { roomService } from "../services/roomService.js";
import { userService } from "../services/userService.js";

const userBodySchema = z.object({
  userId: z.string().optional()
});

const scoreBodySchema = z.object({
  userId: z.string(),
  score: z.number()
});

export async function roomRoutes(app: FastifyInstance) {
  app.post("/api/rooms", async (request) => {
    const body = userBodySchema.parse(request.body ?? {});
    const user = await userService.ensureUser(body.userId);
    const room = await roomService.createRoom(user);
    return { user, room };
  });

  app.post("/api/rooms/bot", async (request) => {
    const body = userBodySchema.parse(request.body ?? {});
    const user = await userService.ensureUser(body.userId);
    const bot = await userService.createBotUser();
    const room = await roomService.createBotRoom(user, bot);
    return { user, room };
  });

  app.get("/api/rooms/:roomId", async (request, reply) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const room = await roomService.getRoom(params.roomId);
    if (!room) return reply.code(404).send({ error: "ROOM_NOT_FOUND" });
    return { room };
  });

  app.post("/api/rooms/:roomId/join", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = userBodySchema.parse(request.body ?? {});
    const user = await userService.ensureUser(body.userId);
    const room = await roomService.joinRoom(params.roomId, user);
    return { user, room };
  });

  app.post("/api/rooms/:roomId/ready", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = z.object({ userId: z.string() }).parse(request.body);
    const room = await roomService.setReady(params.roomId, body.userId);
    return { room };
  });

  app.post("/api/rooms/:roomId/score", async (request) => {
    const params = z.object({ roomId: z.string() }).parse(request.params);
    const body = scoreBodySchema.parse(request.body);
    return roomService.submitScore(params.roomId, body.userId, body.score);
  });
}
