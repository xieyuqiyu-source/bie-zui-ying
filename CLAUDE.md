# 别嘴硬 · 开发规范

微信小程序，主打「拉兄弟实时对战 + 互怼战报 + 排行榜/称号」。项目正在从单一玩法（十秒手速）扩展为**多个简单小游戏的合集**：启动页是游戏选择大厅，每个游戏是独立玩法，共用账号、房间、实时通信和战绩体系。

本文件是新会话接手开发的入口。动手前先读完「架构」「加新游戏」「约定」三节。

---

## 1. 目录结构

```text
bie-zui-ying/
  CLAUDE.md                本文件
  README.md                面向人的简介
  docs/                    早期产品/接口草稿（部分已过时，以代码和本文件为准）
  miniprogram/             微信小程序前端（原生 WXML/WXSS/JS，无构建、无 npm）
    app.json               页面注册，第一个页面就是启动页
    app.wxss               全局漫画风样式（.page .brand .comic-panel .primary-button ...）
    utils/
      config.js            API_BASE_URL / WS_BASE_URL / APP_VERSION
      api.js               所有 HTTP 请求封装（wx.request 包一层，失败重试 1 次）
      user.js              ensureUser / saveUser，本地缓存 + 匿名登录
      games.js             游戏注册表，大厅从这里渲染卡片
      roomSocket.js        房间 WebSocket：断线指数退避重连，reconnectNow() 给 onShow 用
      nav.js               backToTapLobby()：回到 大厅 → 十秒手速大厅 的页面栈
    pages/
      hub/                 启动页：游戏选择大厅
      home/                十秒手速 大厅（建房 / 机器人 / 排行榜 / 留名）
      room/                十秒手速 等待房间（准备、分享邀请）
      battle/              十秒手速 对战页（倒计时、点击、实时比分）
      result/              十秒手速 结果页（战报、再来一局、留名弹窗）
      ranking/             排行榜（目前只有十秒手速的数据）
      profile/             个人页（几乎空壳）
  server/                  后端（Node 20+ / TypeScript / Fastify 5）
    src/index.ts           入口：注册插件、路由、WebSocket、启动时建表
    src/config/env.ts      环境变量
    src/data/mysql.ts      连接池 + initDatabase()（CREATE TABLE IF NOT EXISTS，就是迁移）
    src/data/redis.ts      ioredis 客户端
    src/data/store.ts      旧的内存存储，已无人引用，可删
    src/routes/            HTTP 路由，只做参数校验（zod）和调 service
    src/services/
      roomService.ts       房间生命周期、结算、战绩更新（核心业务）
      roomSocketService.ts WebSocket 房间广播、在线状态、实时消息转发
      userService.ts       用户 CRUD、微信登录、排行榜查询
      titleService.ts      称号规则
      trashTalkService.ts  垃圾话文案池
    src/types/domain.ts    User / Room / Match 类型
```

---

## 2. 架构

```text
小程序 ──HTTPS──> Nginx (/bie-zui-ying-api/ → 127.0.0.1:8787) ──> Fastify
       ──WSS───>                                              └─> /ws/rooms/:roomId
Fastify ──> MySQL（用户、战绩、对局记录，永久）
        ──> Redis（房间状态，key=bie-zui-ying:room:<id>，TTL 15 分钟）
```

### 数据归属
- **MySQL `users`**：账号与战绩（wins/losses/draws/streak/bestScore/title）。`kind` 取值 `anonymous | wechat | bot`。
- **MySQL `matches`**：每局一条，结算时写入。
- **Redis 房间**：整个房间对象 JSON 存一个 key。房间是临时的，过期即消失。

### 房间状态机（十秒手速）
```text
waiting ──双方 ready──> countdown（3 秒）──> playing（10 秒）──> finished
```
- `countdown/playing` 由时间戳决定（`playStartAt`、`playEndsAt`），服务端不跑定时器，客户端按时间戳自己计时。
- 双方都提交分数 → 立刻结算。
- 一方没交：`playEndsAt` 后 10 秒（`SUBMIT_GRACE_MS`），**任何人读房间或提交时**惰性结算，缺席按 0 分。双方都没交则结算但不计战绩。
- 机器人房间：玩家提交时服务端顺便生成机器人分数。机器人局不计入排行榜。
- 再来一局：在旧房间记录 `rematchRoomId`，双方同时接受进同一个新房间。

### 并发
- 所有改房间的操作（join / ready / score / rematch / 超时结算）都必须包在 `withRoomLock(roomId, ...)` 里，锁里**重新 loadRoom** 再改。
- 锁是**进程内**的 `Map`，只在单实例部署下成立。后端要多实例时必须先换成 Redis 锁。

### 实时通信（WebSocket）
- 连接：`wss://.../ws/rooms/:roomId?userId=xxx`。房间页、对战页、结果页各自连接，离开页面时关闭。房间页、对战页、结果页都用 `utils/roomSocket.js`（自动重连）。
- 服务端 → 客户端：
  - `room:connected`：连接建立。
  - `room:update`：房间状态变化（任何 HTTP 改房间后都会 `broadcast`），带 `onlineUserIds`。
  - `battle:score`：实时比分（仅展示，不作为结算依据）。
  - `rematch:invite` / `rematch:decline` / `rematch:start`。
- 客户端 → 服务端：`battle:score`、`rematch:invite`、`rematch:decline`。服务端只是转发给房间内所有人。
- 在线状态完全基于 WS 连接，没有心跳；页面切后台时连接可能被微信断开，所以页面 `onShow` 要调 `socket.reconnectNow()`。

### 身份
- 现在**没有鉴权**：所有接口相信请求里的 `userId`。这是已知安全问题（见第 7 节），新接口不要加深这个依赖，但也不要单独给某个接口做一套不同的鉴权。等统一改 token 时一起改。
- 匿名用户首次打开即创建，`userId` 存在小程序本地 storage（key `user`）。`ensureUser` 收到不存在的 id 会新建用户。

---

## 3. 加一个新游戏

目标：新游戏是独立的一组页面，复用账号、房间、WS、留名弹窗和视觉风格，不改动十秒手速的流程。

### 前端
1. 在 `miniprogram/utils/games.js` 的 `GAMES` 里加一项：`id`（英文短名，同时作为后端 gameId）、`name`、`glyph`（一个汉字）、`accent`（卡片图标底色）、`tagline`、`tags`、`entry`（大厅页路径）。没有 `entry` 的会显示「敬请期待」。
2. 页面放在 `miniprogram/pages/<gameId>/<page>/`，例如 `pages/reaction/lobby/`、`pages/reaction/battle/`。在 `app.json` 的 `pages` 里注册，**不要动第一项**（`pages/hub/hub`，它是启动页）。
3. 十秒手速的页面（home/room/battle/result）历史原因放在 `pages/` 根下，不要搬家，新游戏不要再往根下放。
4. 结果页「回首页」用 `wx.reLaunch` 回到 `/pages/hub/hub`，再 `navigateTo` 自己的大厅，保证返回键能回到大厅（参考 `pages/result/result.js` 的 `goHome`）。
5. 能复用的先复用：`utils/api.js` 加函数而不是在页面里直接 `wx.request`；WS 一律用 `utils/roomSocket.js` 的 `openRoomSocket`（参考 `pages/battle/battle.js`），不要再直接 `wx.connectSocket`。接口失败要区分错误码时用 `api.errorCode(error)`。同一段逻辑第二次出现时（例如留名弹窗，已经在 home 和 result 各有一份），抽到 `utils/` 或自定义组件里。

### 后端
目前房间、对局表、排行榜都是十秒手速专用的，**第一个新游戏上线前要先做这一步通用化**：
1. `Room` 加 `gameId` 字段；`matches` 表加 `game_id VARCHAR(32) NOT NULL DEFAULT 'tap'`，在 `initDatabase()` 里用「查 INFORMATION_SCHEMA → 不存在就 ALTER」的方式加列（参考 `profile_authorized` 的写法），这样老库能平滑升级。
2. 战绩按游戏分开：新建 `user_game_stats(user_id, game_id, wins, losses, draws, current_streak, best_streak, best_score, total_matches, updated_at, PRIMARY KEY(user_id, game_id))`。`users` 表上的战绩列保留作为十秒手速的数据，迁移完成前不要删。
3. 排行榜接口加 `gameId` 参数，默认 `tap`。
4. 每个游戏的「怎么算分、怎么判胜负」放在 `src/games/<gameId>.ts`，导出统一形状（建议 `{ id, durationSeconds, normalizeScore(raw), compare(a, b), botScore() }`），`roomService` 只按 `room.gameId` 查表调用，不写 `if (gameId === ...)` 分支。
5. 新的实时消息类型用 `<gameId>:<event>` 命名（如 `reaction:tap`），在 `roomSocketService` 里集中处理；不要让客户端能广播任意类型。

---

## 4. 约定

### 通用
- 文案、注释、提交信息：用户可见文案中文，代码标识符英文。提交信息英文，祈使句标题。
- 不要做没被要求的重构。顺手发现的问题记到第 7 节或告诉用户。

### 前端（小程序）
- 原生小程序语法，`require/module.exports`，不要引入 npm、TypeScript 或框架。
- 页面里 `async` 方法调接口必须 `try/catch`，失败用 `wx.showToast({ title, icon: "none" })`，文案保持项目的阴阳怪气风格（例：「开局失败」「陪练迟到了」「房间迷路了」）。
- 防重复点击：用 `data.loading/creating` 一类标志，参考 `home.js`。
- 页面离开（`onUnload`）必须清掉自己开的 `setInterval/setTimeout` 和 `socketTask`。
- 尺寸用 `rpx`。

### 视觉风格（必须统一）
- 底色 `#f7d84a`（黄），文字 `#111`，主按钮 `#e33124`（红），卡片白底。
- 粗黑描边 `6rpx solid #111`、圆角 `8rpx`、硬阴影 `10rpx 10rpx 0 #111`（直接用全局 `.comic-panel`）。
- 按钮用全局 `.primary-button`（红）/ `.secondary-button`（白）；标签用 `.tag`。
- 字重偏重：标题 900，正文 700–800。大标题用 `.brand`。
- 游戏专属色只用在 `games.js` 的 `accent` 和该游戏页面的点缀上，不改全局色。

### 后端
- 路由只做 zod 校验和调 service，业务逻辑放 service。
- 改房间的地方一律 `withRoomLock` + 锁内 `loadRoom`。
- 客户端上报的数字一律服务端二次校验（范围、时间窗口），不要信任。
- 业务错误现在用 `throw new Error("ERROR_CODE")`，会变成 HTTP 500；新代码保持同样的错误码风格（大写下划线），统一错误处理以后一起加。
- 数据库：用 `namedPlaceholders`（`:name`）参数化，**禁止拼接用户输入**。排行榜里的 `ORDER BY ${orderBy}` 是白名单映射，照这个模式做。
- 建表/加列只写在 `initDatabase()` 里，必须幂等。

---

## 5. 本地开发

```bash
cd server
cp .env.example .env   # 填 MySQL/Redis；WECHAT_APP_SECRET 不填则微信登录接口返回 WECHAT_CONFIG_MISSING
npm install
npm run dev            # tsx watch，默认 http://localhost:8787
npm run typecheck      # 提交前必须通过
```

- 本地需要 MySQL 8 和 Redis 7。不想动本机库时可以临时起：
  ```bash
  docker run -d --rm --name bzy-mysql -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=bie_zui_ying -p 3317:3306 mysql:8
  redis-server --port 6390 --save "" --daemonize yes
  ```
  然后 `.env` 里指向 3317 / 6390，用 root/test。
- 小程序：微信开发者工具打开 `miniprogram/`，AppID `wxec4361898e7e6ff2`。连本地后端时临时改 `utils/config.js` 为 `http://<局域网IP>:8787` / `ws://...`，并在开发者工具关闭「校验合法域名」。**不要把本地地址提交上去。**
- 没有自动化测试。改了结算/房间流程，至少用脚本跑一遍：建两个匿名用户 → 建房 → 加入 → 同时准备 → 提交分数 → 查房间和排行榜。
- 发版前把 `utils/config.js` 的 `APP_VERSION` 加 1，大厅右上角会显示。

---

## 6. 线上环境

| 项 | 值 |
| --- | --- |
| 公网 API | `https://aitools.ccoos.cn/bie-zui-ying-api`（WS 同路径 `wss://`） |
| 服务器 | 腾讯云 `124.223.111.163`，实例 `ins-o4zh0khz`，本机 ssh 别名 `aitools-server` |
| 代码目录 | `/opt/bie-zui-ying/server`（**不是 git 仓库**，是手动拷贝） |
| 进程 | systemd `bie-zui-ying`，`node dist/index.js`，`.env` 在同目录 |
| 反代 | Nginx `/etc/nginx/conf.d/aitools.ccoos.cn.conf`，`/bie-zui-ying-api/` → `127.0.0.1:8787` |
| MySQL | 本机 8.0，库/用户 `bie_zui_ying`；root 凭据在服务器 `/root/.my.cnf` |
| Redis | 本机 6379 |
| 证书 | Let's Encrypt，certbot.timer 自动续期 |

部署（目前是手动；以下步骤是根据服务器目录结构整理的，**还没实际跑过**，第一次用时逐步确认）：
```bash
# 本地
cd server && npm run typecheck
rsync -av --exclude node_modules --exclude dist --exclude .env --exclude uploads ./ aitools-server:/opt/bie-zui-ying/server/
# 服务器
ssh aitools-server 'cd /opt/bie-zui-ying/server && npm ci && npm run build && systemctl restart bie-zui-ying && sleep 3 && curl -s localhost:8787/health'
```
- 部署、重启、改库都是线上操作，**先问用户**。
- `/health` 不查数据库，判断服务是否真的正常要再请求 `/api/rankings`。
- 服务器上同时跑着其他项目（idea-pool、nginx 上其他站点、PostgreSQL、docker 等），不要动它们。
- 2026-10-31：MySQL 原数据盘到期被回收，已在系统盘重建空库；旧盘的 fstab 条目已注释，备份在 `/etc/fstab.bak-20261031`。服务器上**没有数据库备份**。
- 截至 2026-10-31，线上运行的是 `4533b1a`（7 月 11 日）的代码，`1d3c4e6` 之后的提交还没部署。

---

## 7. 已知问题与待办

按优先级排列。处理掉一项就从这里删掉。

**安全**
- 无鉴权，`userId` 就是凭证，排行榜接口又公开了所有人的 id → 可以冒充任何人改资料、提交分数、在 WS 里发消息。修法：登录签发 token（Redis session 或 JWT），HTTP 和 WS 都从 token 取用户。
- 分数完全客户端上报，上限 180（18 次/秒）。没有点击频率/节奏校验。
- 没有限流；`/api/rooms/bot` 每次新建一个 bot 用户，`ensureUser` 收到未知 id 也会新建用户，可被刷库。

**十秒手速逻辑**
- 结算分两步写库（insert match → update users），不在一个事务里，且是整行覆盖写回而不是 `wins = wins + 1`。
- 业务错误全部是 HTTP 500，前端拿不到可读错误码。
- 客户端用本地时钟对比服务端 `playStartAt`，手机时间不准时倒计时会错位；建议接口返回 `serverNow`，客户端算时差。
- 对战页切后台期间错过的点击时间无法补回；回到前台后 WS 会立刻重连，计时按服务端时间戳继续。
- `setReady` 不检查房间状态，`finished` 房间也能被标记 ready（无副作用但多一次广播）。
- 排行榜 `streak` 按 `current_streak` 排序（是否应为 `best_streak` 待产品确认）。

**运维**
- 没有数据库备份（建议 cron 每日 `mysqldump` 到另一块盘或对象存储）。
- 部署靠手动 rsync，服务器目录不是 git 仓库，无法确认线上版本 → 建议部署时写一个 `VERSION` 文件或在 `/health` 返回 commit。
- 头像上传文件不清理。

**代码卫生**
- `server/src/data/store.ts`、`trashTalkService.invite/lose` 未使用。
- 留名弹窗在 `home` 和 `result` 各一份（WXML + JS + WXSS 全重复），加第三个之前抽成组件。
- `docs/` 里的「数据保存在内存」等描述已过时。
