import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  wechatAppId: process.env.WECHAT_APP_ID ?? "",
  wechatAppSecret: process.env.WECHAT_APP_SECRET ?? "",
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "bie_zui_ying",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "bie_zui_ying"
  },
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
};
