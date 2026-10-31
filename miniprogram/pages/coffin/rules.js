// 双人抬棺: track and physics parameters. Units are metres, seconds, m/s.
// x grows to the right (walking direction), y grows up.

const POSES = ["crouch", "half", "stand"];

module.exports = {
  LOBBY_URL: "/pages/coffin/lobby/lobby",
  // Owner carries the front, guest the rear. Same as server/src/games/coffin.ts.
  SIDE_NAMES: { front: "前面", rear: "后面" },
  // Result codes sent to the server; keep in sync with COFFIN_REASONS / COFFIN_BLAME there.
  REASON_CODES: { pit: 1, thrown: 2, tipped: 3, timeout: 4, absent: 5 },
  BLAME_CODES: { none: 0, front: 1, rear: 2 },

  STEP_SECONDS: 1 / 120,
  TIME_LIMIT_SECONDS: 25,
  GRAVITY: 9.8,

  // Team: rear bearer at x = s, front bearer at x = s + BEARER_GAP.
  BEARER_GAP: 1.8,
  WALK_SPEED: 1.15,
  // The team slows down over this distance before stopping at the pit edge.
  BRAKE_DISTANCE: 0.5,

  POSES,
  SHOULDER_HEIGHT: { crouch: 0.6, half: 0.85, stand: 1.1 },
  // Shoulders chase the target height at up to MAX_LIFT_SPEED and brake at MAX_LIFT_ACCEL.
  // A hard brake (more than g) is what makes a sudden stand-up throw the body.
  // SHOULDER_GAIN only smooths the last few centimetres so the shoulder settles.
  SHOULDER_GAIN: 30,
  MAX_LIFT_SPEED: 4,
  MAX_LIFT_ACCEL: 60,
  JUMP_EXTRA: 0.4,
  JUMP_SECONDS: 0.25,
  JUMP_LIFT_SPEED: 4.5,

  // Coffin board runs along the line between the shoulders, overhanging a little.
  COFFIN_HALF: 1.0,
  WALL_HEIGHT: 0.18,
  // The body is a point at its back; its head and feet reach this far along the board.
  BODY_HALF: 0.6,
  FRICTION: 0.15,
  RESTITUTION: 0.2,
  WALL_RESTITUTION: 0.2,
  // Hitting an end wall faster than this tips the body over it.
  WALL_TIP_SPEED: 1.6,
  // Past this tilt (radians) a body resting against the low wall rolls over it.
  TIP_ANGLE: 0.25,

  // Track: ground polyline [x, y] for the bearers' feet, plus small bumps.
  GROUND: [
    [-5, 0],
    [4, 0],
    [9, 1.62], // uphill, about 18 degrees
    [11.5, 1.62],
    [16.5, 0], // downhill
    [40, 0]
  ],
  BUMPS: [
    { x: 17.5, width: 0.5, height: 0.14 },
    { x: 19.2, width: 0.5, height: 0.14 }
  ],
  PIT_X: 25,
  PIT_WIDTH: 1.6,
  PIT_DEPTH: 1.5,
  // Front bearer stops this far before the pit.
  PIT_MARGIN: 0.05
};
