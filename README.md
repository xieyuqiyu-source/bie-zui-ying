# 别嘴硬

一个以好友实时对战、搞笑互怼战报、排行榜和称号为核心的微信小程序。

## 项目结构

```text
bie-zui-ying/
  miniprogram/   微信小程序前端
  server/        独立后端服务
  docs/          产品与开发文档
```

## 快速开始

### 后端

```bash
cd server
npm install
npm run dev
```

默认地址：

```text
http://localhost:8787
```

### 小程序

使用微信开发者工具打开 `miniprogram` 目录。

开发阶段可以先在微信开发者工具里关闭“校验合法域名”，后端地址默认配置在：

```text
miniprogram/utils/config.js
```

## 当前版本

当前是 V0.1 骨架版：

- 游客身份
- 微信登录接口占位
- 创建房间
- 加入房间
- 准备
- 倒计时
- 10 秒点击
- 比赛结算
- 结果垃圾话
- 基础排行榜

