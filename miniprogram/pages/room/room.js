const api = require("../../utils/api");
const { WS_BASE_URL } = require("../../utils/config");
const { ensureUser, saveUser } = require("../../utils/user");

Page({
  data: {
    roomId: "",
    room: {},
    user: {},
    loading: false,
    statusText: "兄弟关系即将重排",
    ownerInitial: "?",
    guestInitial: "?",
    ownerOnline: false,
    guestOnline: false,
    onlineUserIds: [],
    socketReady: false
  },

  async onLoad(query) {
    const user = await ensureUser();
    this.setData({ user, roomId: query.roomId });

    if (query.role !== "owner") {
      const result = await api.joinRoom(query.roomId, user.id);
      saveUser(result.user);
    }

    await this.refreshRoom();
    this.connectRoomSocket();
    this.poller = setInterval(() => this.refreshRoom({ silent: true }), 4000);
  },

  onUnload() {
    if (this.poller) clearInterval(this.poller);
    if (this.socketTask) {
      this.socketTask.close({ code: 1000, reason: "leave room" });
      this.socketTask = null;
    }
  },

  onShareAppMessage() {
    return {
      title: "别嘴硬，10 秒钟见真章。",
      path: `/pages/room/room?roomId=${this.data.roomId}`
    };
  },

  updateRoom(room, onlineUserIds) {
    const nextOnlineUserIds = Array.isArray(onlineUserIds) ? onlineUserIds : this.data.onlineUserIds;
    const onlineSet = new Set(nextOnlineUserIds || []);
    this.setData({
      room,
      statusText: room.guest ? "双方就位，嘴硬冷却中" : "对方还在路上，可能正在热身",
      ownerInitial: (room.ownerUser && room.ownerUser.nickname || "?").slice(0, 1),
      guestInitial: (room.guestUser && room.guestUser.nickname || "?").slice(0, 1),
      onlineUserIds: nextOnlineUserIds,
      ownerOnline: room.owner ? onlineSet.has(room.owner.userId) : false,
      guestOnline: room.guest ? onlineSet.has(room.guest.userId) : false
    });

    if (room.status === "countdown" || room.status === "playing") {
      wx.redirectTo({
        url: `/pages/battle/battle?roomId=${room.id}`
      });
    }
  },

  connectRoomSocket() {
    if (!this.data.roomId || !this.data.user.id) return;
    const socketTask = wx.connectSocket({
      url: `${WS_BASE_URL}/ws/rooms/${this.data.roomId}?userId=${this.data.user.id}`
    });
    this.socketTask = socketTask;

    socketTask.onOpen(() => {
      this.setData({ socketReady: true });
    });

    socketTask.onMessage((event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "room:update" && message.room) {
          this.updateRoom(message.room, message.onlineUserIds);
        }
        if (message.type === "room:connected") {
          const room = this.data.room;
          if (room && room.id) {
            this.updateRoom(room, message.onlineUserIds);
          }
        }
      } catch (error) {
        // Ignore malformed socket messages.
      }
    });

    socketTask.onClose(() => {
      this.setData({ socketReady: false, ownerOnline: false, guestOnline: false });
    });

    socketTask.onError(() => {
      this.setData({ socketReady: false });
    });
  },

  async refreshRoom(options = {}) {
    if (!this.data.roomId) return;
    try {
      const result = await api.getRoom(this.data.roomId);
      this.updateRoom(result.room);
    } catch (error) {
      if (!options.silent) {
        wx.showToast({ title: "房间迷路了", icon: "none" });
      }
    }
  },

  async ready() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const user = await ensureUser();
      const result = await api.ready(this.data.roomId, user.id);
      this.updateRoom(result.room);
      if (result.room.status === "countdown") {
        wx.redirectTo({
          url: `/pages/battle/battle?roomId=${result.room.id}`
        });
      }
    } catch (error) {
      wx.showToast({ title: "准备失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  }
});
