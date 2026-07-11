import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { env } from "../config/env.js";
import { userService } from "../services/userService.js";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function extFromMime(mime: string) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/api/uploads/avatar", async (request, reply) => {
    const userId = z.string().min(1).parse((request.query as { userId?: string }).userId);
    const user = await userService.getUser(userId);
    if (!user) return reply.code(404).send({ error: "USER_NOT_FOUND" });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "FILE_REQUIRED" });
    if (!allowedMimeTypes.has(file.mimetype)) {
      return reply.code(400).send({ error: "UNSUPPORTED_IMAGE_TYPE" });
    }

    const dir = path.resolve(env.uploadDir, "avatars");
    await mkdir(dir, { recursive: true });

    const filename = `${userId}-${Date.now()}${extFromMime(file.mimetype)}`;
    const filePath = path.join(dir, filename);
    await pipeline(file.file, createWriteStream(filePath));

    return {
      avatarUrl: `${env.publicApiBaseUrl.replace(/\/$/, "")}/uploads/avatars/${filename}`
    };
  });
}
