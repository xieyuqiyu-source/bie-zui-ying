// 追赶巴士 tuning. The server checks submissions against the same numbers in
// server/src/games/bus.ts; change both together.
module.exports = {
  LOBBY_URL: "/pages/bus/lobby/lobby",
  DURATION_MS: 20000,
  SAMPLE_MS: 500,
  SAMPLE_COUNT: 40,
  START_GAP: 15,
  // The server accepts a catch within 1.2 m (it only sees positions every 0.5 s).
  // We end the match at 0.3 m so lag on the other player's position rarely flips the verdict.
  CLIENT_CATCH_GAP: 0.3,

  // Runner: every left/right alternation moves this far, however fast you tap; only the same
  // foot twice in a row kneels you down.
  STEP_METRES: 0.4,
  KNEEL_MS: 600,
  // Taps faster than this are banked and paid out over the next frames instead of dropped,
  // so the trace stays under the server's 5 m/s cap.
  RUNNER_MAX_SPEED: 4.8,

  // Bus: speed follows how fast and how cleanly the wheel is spun.
  BUS_MIN_SPEED: 0.5,
  BUS_MAX_SPEED: 3,
  WHEEL_FULL_SPEED_RPS: 2.5,
  BUS_ACCEL: 1.5,
  BUS_DECEL: 1,

  ROLE_NAMES: {
    bus: "司机",
    runner: "追车的"
  }
};
