const api = require("../../utils/api");
const { ensureUser, saveUser } = require("../../utils/user");

// The "留下赫赫威名" dialog: pick an avatar and nickname so you show up on the rankings.
// home and result still have their own copies; new pages should use this component.
Component({
  properties: {
    visible: { type: Boolean, value: false },
    user: { type: Object, value: {} },
    // Shown to users who haven't set a name yet.
    promptTitle: { type: String, value: "这局有点东西，要不要带名上榜？" }
  },

  data: {
    nickname: "",
    avatarTemp: "",
    saving: false
  },

  observers: {
    visible(visible) {
      if (!visible) return;
      const user = this.properties.user || {};
      this.setData({ nickname: user.profileAuthorized ? user.nickname : "", avatarTemp: "", saving: false });
    }
  },

  methods: {
    chooseAvatar(event) {
      this.setData({ avatarTemp: event.detail.avatarUrl });
    },

    inputNickname(event) {
      this.setData({ nickname: event.detail.value });
    },

    close() {
      this.triggerEvent("close");
    },

    async save() {
      if (this.data.saving) return;
      const nickname = (this.data.nickname || "").trim();
      if (!nickname) {
        wx.showToast({ title: "名号不能为空", icon: "none" });
        return;
      }

      this.setData({ saving: true });
      try {
        const user = await ensureUser();
        let avatarUrl = user.avatarUrl;
        if (this.data.avatarTemp) {
          const uploaded = await api.uploadAvatar(user.id, this.data.avatarTemp);
          avatarUrl = uploaded.avatarUrl;
        }
        const result = await api.updateProfile({ userId: user.id, nickname, avatarUrl });
        saveUser(result.user);
        wx.showToast({ title: "已留下威名" });
        this.triggerEvent("saved", { user: result.user });
      } catch (error) {
        wx.showToast({ title: "留名失败，稍后再装", icon: "none" });
      } finally {
        this.setData({ saving: false });
      }
    }
  }
});
