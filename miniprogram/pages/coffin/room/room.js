const api = require("../../../utils/api");
const { backToLobby } = require("../../../utils/nav");
const { openRoomSocket } = require("../../../utils/roomSocket");
const { ensureUser, saveUser } = require("../../../utils/user");
const { LOBBY_URL, SIDE_NAMES } = require("../rules");

// The countdown is only 3 seconds, so the fallback poll must be well under that.
const POLL_MS = 1000;

const joinErrorText = {
  ROOM_NOT_FOUND: "人已经下葬了，房间可能过期了。",
  ROOM_FULL: "两个人抬就够了，你来晚一步。",
  ROOM_NOT_JOINABLE: "已经抬起来了，下一趟请早。"
};

Page({
  data: {
    roomId: "",
    room: {},
    user: {},
    loading: false,
    statusText: "等兄弟来搭把手",
    ownerRole: "",
    guestRole: "",
    ownerInitial: "?",
    guestInitial: "?",
    ownerOnline: false,
    guestOnline: false,
    onlineUserIds: []
  },

  async onLoad(query) {
    this.setData({ roomId: query.roomId || "" });

    try {
      const user = await ensureUser();
      this.setData({ user });

      if (query.role !== "owner") {
        const result = await api.joinRoom(query.roomId, user.id);
        saveUser(result.user);
      }

      const result = await api.getRoom(query.roomId);
      if (result.room.gameId !== "coffin") {
        this.leaveWithError("这不是双人抬棺的房间。");
        return;
      }
      this.updateRoom(result.room, result.onlineUserIds);
    } catch (error) {
      this.leaveWithError(joinErrorText[api.errorCode(error)] || "房间没连上，网络可能在嘴硬。");
      return;
    }

    this.connectRoomSocket();
    this.poller = setInterval(() => this.refreshRoom(), POLL_MS);
  },

  onShow() {
    if (this.socket) this.socket.reconnectNow();
  },

  onUnload() {
    this.left = true;
    if (this.poller) clearInterval(this.poller);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },

  onShareAppMessage() {
    return {
      title: "我抬前面你抬后面，人掉了算你的。",
      path: `/pages/coffin/room/room?roomId=${this.data.roomId}`
    };
  },

  leaveWithError(content) {
    if (this.left) return;
    this.left = true;
    if (this.poller) clearInterval(this.poller);
    wx.showModal({
      title: "抬不了",
      content,
      showCancel: false,
      confirmText: "回大厅",
      complete: () => backToLobby(LOBBY_URL)
    });
  },

  goBattle(roomId) {
    if (this.left) return;
    this.left = true;
    wx.redirectTo({ url: `/pages/coffin/play/play?roomId=${roomId}` });
  },

  updateRoom(room, onlineUserIds) {
    if (this.left || !room) return;
    const nextOnlineUserIds = Array.isArray(onlineUserIds) ? onlineUserIds : this.data.onlineUserIds;
    const onlineSet = new Set(nextOnlineUserIds || []);
    this.setData({
      room,
      statusText: room.guest ? "两人就位，准备起棺" : "兄弟还没到",
      ownerRole: SIDE_NAMES.front,
      guestRole: SIDE_NAMES.rear,
      ownerInitial: (room.ownerUser && room.ownerUser.nickname || "?").slice(0, 1),
      guestInitial: (room.guestUser && room.guestUser.nickname || "?").slice(0, 1),
      onlineUserIds: nextOnlineUserIds,
      ownerOnline: room.owner ? onlineSet.has(room.owner.userId) : false,
      guestOnline: room.guest ? onlineSet.has(room.guest.userId) : false
    });

    if (room.status === "countdown" || room.status === "playing") {
      this.goBattle(room.id);
    } else if (room.status === "finished") {
      this.leaveWithError("这一趟已经抬完了，你错过了。");
    }
  },

  connectRoomSocket() {
    if (!this.data.roomId || !this.data.user.id) return;
    this.socket = openRoomSocket({
      roomId: this.data.roomId,
      userId: this.data.user.id,
      onStatus: (ready) => {
        if (this.left || ready) return;
        this.setData({ ownerOnline: false, guestOnline: false });
      },
      onMessage: (message) => {
        if (message.type === "room:update" && message.room) {
          this.updateRoom(message.room, message.onlineUserIds);
        } else if (message.type === "room:connected" && this.data.room.id) {
          this.updateRoom(this.data.room, message.onlineUserIds);
        }
      }
    });
  },

  async refreshRoom() {
    if (!this.data.roomId || this.refreshing) return;
    this.refreshing = true;
    try {
      const result = await api.getRoom(this.data.roomId);
      this.updateRoom(result.room, result.onlineUserIds);
    } catch (error) {
      if (api.errorCode(error) === "ROOM_NOT_FOUND") {
        this.leaveWithError("房间过期了，兄弟一直没来。");
      }
      // Network hiccups: keep polling quietly.
    } finally {
      this.refreshing = false;
    }
  },

  async ready() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const user = await ensureUser();
      const result = await api.ready(this.data.roomId, user.id);
      this.updateRoom(result.room, result.onlineUserIds);
    } catch (error) {
      if (api.errorCode(error) === "ROOM_NOT_FOUND") {
        this.leaveWithError("房间过期了，重新开一间吧。");
      } else {
        wx.showToast({ title: "准备失败", icon: "none" });
      }
    } finally {
      if (!this.left) this.setData({ loading: false });
    }
  }
});
