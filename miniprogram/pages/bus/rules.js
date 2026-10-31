// 追赶巴士 tuning. The server checks submissions against the same numbers in
// server/src/games/bus.ts; change both together.
module.exports = {
  LOBBY_URL: "/pages/bus/lobby/lobby",
  DURATION_MS: 15000,
  SAMPLE_MS: 500,
  SAMPLE_COUNT: 30,
  START_GAP: 12,
  // The server accepts a catch within 1.2 m (it only sees positions every 0.5 s).
  // We end the match at 0.3 m so lag on the other player's position rarely flips the verdict.
  CLIENT_CATCH_GAP: 0.3,

  // Runner: one correct step moves this far; the same foot twice kneels you down.
  STEP_METRES: 0.5,
  KNEEL_MS: 600,
  // 12 steps/s = 6 m/s, the server's cap.
  MIN_STEP_INTERVAL_MS: 84,

  // Bus: speed follows how fast and how cleanly the wheel is spun.
  BUS_MIN_SPEED: 0.5,
  BUS_MAX_SPEED: 3,
  WHEEL_FULL_SPEED_RPS: 2,
  BUS_ACCEL: 1.5,
  BUS_DECEL: 1,

  ROLE_NAMES: {
    bus: "司机",
    runner: "追车的"
  }
};
