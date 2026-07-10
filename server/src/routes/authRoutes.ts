import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { userService } from "../services/userService.js";

const anonymousSchema = z.object({
  userId: z.string().optional()
});

const wechatLoginSchema = z.object({
  code: z.string().min(1),
  nickname: z.string().optional(),
  avatarUrl: z.string().optional()
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/anonymous", async (request) => {
    const body = anonymousSchema.parse(request.body ?? {});
    const user = userService.ensureUser(body.userId);
    return { user };
  });

  app.post("/api/auth/wechat-login", async (request) => {
    const body = wechatLoginSchema.parse(request.body);

    if (!env.wechatAppId || !env.wechatAppSecret) {
      return {
        error: "WECHAT_CONFIG_MISSING",
        message: "后端缺少 WECHAT_APP_ID 或 WECHAT_APP_SECRET 环境变量"
      };
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", env.wechatAppId);
    url.searchParams.set("secret", env.wechatAppSecret);
    url.searchParams.set("js_code", body.code);
    url.searchParams.set("grant_type", "authorization_code");

    const wxResponse = await fetch(url);
    const session = (await wxResponse.json()) as {
      openid?: string;
      unionid?: string;
      session_key?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (!session.openid) {
      app.log.warn({ session }, "wechat code2Session failed");
      return {
        error: "WECHAT_LOGIN_FAILED",
        message: session.errmsg || "微信登录失败"
      };
    }

    const user = userService.upsertWechatUser({
      openid: session.openid,
      nickname: body.nickname,
      avatarUrl: body.avatarUrl
    });

    return { user, token: user.id };
  });
}
