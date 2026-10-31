// Back to a game's lobby with the hub underneath, so its back button reaches the hub.
function backToLobby(url) {
  wx.reLaunch({
    url: "/pages/hub/hub",
    success: () => wx.navigateTo({ url })
  });
}

function backToTapLobby() {
  backToLobby("/pages/home/home");
}

module.exports = {
  backToLobby,
  backToTapLobby
};
