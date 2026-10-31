const { WS_BASE_URL } = require("./config");

// Opens the room WebSocket and keeps it open: it reconnects with backoff
// until close() is called. onStatus(true/false) reports whether it is usable.
function openRoomSocket({ roomId, userId, onMessage, onStatus }) {
  let task = null;
  let closed = false;
  let retryTimer = null;
  let attempt = 0;

  function setStatus(ready) {
    if (onStatus) onStatus(ready);
  }

  function scheduleRetry() {
    if (closed || retryTimer) return;
    const delay = Math.min(1000 * 2 ** attempt, 8000);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (closed) return;
    const current = wx.connectSocket({
      url: `${WS_BASE_URL}/ws/rooms/${roomId}?userId=${encodeURIComponent(userId)}`
    });
    task = current;

    current.onOpen(() => {
      if (task !== current) return;
      attempt = 0;
      setStatus(true);
    });

    current.onMessage((event) => {
      if (task !== current) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      onMessage(message);
    });

    // onError and onClose can both fire for one failure; only the first one counts.
    const handleDown = () => {
      if (task !== current) return;
      task = null;
      current.close({});
      setStatus(false);
      scheduleRetry();
    };
    current.onClose(handleDown);
    current.onError(handleDown);
  }

  connect();

  return {
    send(payload) {
      if (!task) return false;
      task.send({ data: JSON.stringify(payload) });
      return true;
    },

    // Skip the backoff, e.g. when the page comes back to the foreground.
    reconnectNow() {
      if (closed || task) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      attempt = 0;
      connect();
    },

    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (task) {
        const current = task;
        task = null;
        current.close({ code: 1000 });
      }
    }
  };
}

module.exports = {
  openRoomSocket
};
