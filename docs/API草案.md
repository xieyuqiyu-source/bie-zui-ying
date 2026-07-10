# API 草案

## 健康检查

```text
GET /health
```

## 游客身份

```text
POST /api/auth/anonymous
```

请求：

```json
{
  "userId": "optional"
}
```

## 微信登录

```text
POST /api/auth/wechat-login
```

请求：

```json
{
  "code": "wx.login 返回的 code",
  "nickname": "optional",
  "avatarUrl": "optional"
}
```

## 创建房间

```text
POST /api/rooms
```

请求：

```json
{
  "userId": "user_id"
}
```

## 创建机器人房间

```text
POST /api/rooms/bot
```

请求：

```json
{
  "userId": "user_id"
}
```

用途：

- 创建一个带系统陪练的房间。
- 用于单人测试完整对战流程。
- 可覆盖倒计时、点击、结算、垃圾话、称号等大部分逻辑。

## 获取房间

```text
GET /api/rooms/{roomId}
```

## 加入房间

```text
POST /api/rooms/{roomId}/join
```

请求：

```json
{
  "userId": "user_id"
}
```

## 准备

```text
POST /api/rooms/{roomId}/ready
```

请求：

```json
{
  "userId": "user_id"
}
```

## 提交分数

```text
POST /api/rooms/{roomId}/score
```

请求：

```json
{
  "userId": "user_id",
  "score": 88
}
```

## 排行榜

```text
GET /api/rankings?type=wins
GET /api/rankings?type=streak
GET /api/rankings?type=bestScore
```
