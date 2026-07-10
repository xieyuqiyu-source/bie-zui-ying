const api = require("../../utils/api");
const { ensureUser, saveUser } = require("../../utils/user");

Page({
  data: {
    roomId: "",
    room: {},
    user: {},
    loading: false,
    statusText: "兄弟关系即将重排",
    ownerInitial: "?",
    guestInitial: "?"
  },

  async onLoad(query) {
    const user = await ensureUser();
    this.setData({ user, roomId: query.roomId });

    if (query.role !== "owner") {
      const result = await api.joinRoom(query.roomId, user.id);
      saveUser(result.user);
    }

    await this.refreshRoom();
    this.poller = setInterval(() => this.refreshRoom(), 1200);
  },

  onUnload() {
    if (this.poller) clearInterval(this.poller);
  },

  onShareAppMessage() {
    return {
      title: "别嘴硬，10 秒钟见真章。",
      path: `/pages/room/room?roomId=${this.data.roomId}`
    };
  },

  async refreshRoom() {
    if (!this.data.roomId) return;
    try {
      const result = await api.getRoom(this.data.roomId);
      const room = result.room;
      this.setData({
        room,
        statusText: room.guest ? "双方就位，嘴硬冷却中" : "对方还在路上，可能正在热身",
        ownerInitial: (room.ownerUser && room.ownerUser.nickname || "?").slice(0, 1),
        guestInitial: (room.guestUser && room.guestUser.nickname || "?").slice(0, 1)
      });

      if (room.status === "countdown" || room.status === "playing") {
        wx.redirectTo({
          url: `/pages/battle/battle?roomId=${room.id}`
        });
      }
    } catch (error) {
      wx.showToast({ title: "房间迷路了", icon: "none" });
    }
  },

  async ready() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const user = await ensureUser();
      const result = await api.ready(this.data.roomId, user.id);
      this.setData({ room: result.room });
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

