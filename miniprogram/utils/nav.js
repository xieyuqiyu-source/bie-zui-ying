// Back to the tap game's lobby with the hub underneath, so its back button reaches the hub.
function backToTapLobby() {
  wx.reLaunch({
    url: "/pages/hub/hub",
    success: () => wx.navigateTo({ url: "/pages/home/home" })
  });
}

module.exports = {
  backToTapLobby
};
