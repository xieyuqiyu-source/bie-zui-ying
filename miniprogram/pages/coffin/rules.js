// 双人抬棺: track and physics parameters. Units are metres, seconds, m/s.
// x grows to the right (walking direction), y grows up.

const POSES = ["crouch", "half", "stand"];

module.exports = {
  LOBBY_URL: "/pages/coffin/lobby/lobby",
  // Owner carries the front, guest the rear. Same as server/src/games/coffin.ts.
  SIDE_NAMES: { front: "前面", rear: "后面" },
  // Result codes sent to the server; keep in sync with COFFIN_REASONS / COFFIN_BLAME there.
  REASON_CODES: { pit: 1, thrown: 2, tipped: 3, timeout: 4, absent: 5, branch: 6 },
  BLAME_CODES: { none: 0, front: 1, rear: 2 },

  STEP_SECONDS: 1 / 120,
  TIME_LIMIT_SECONDS: 27,
  GRAVITY: 9.8,

  // Team: rear bearer at x = s, front bearer at x = s + BEARER_GAP.
  BEARER_GAP: 1.8,
  WALK_SPEED: 1.3,
  // Shoulders bob with every step, the two bearers out of phase, so the board never sits still.
  STRIDE: 0.7,
  WALK_BOB: 0.015,
  // The team slows down over this distance before stopping at the pit edge.
  BRAKE_DISTANCE: 0.5,

  POSES,
  SHOULDER_HEIGHT: { crouch: 0.6, half: 0.85, stand: 1.1 },
  // Shoulders chase the target height at up to MAX_LIFT_SPEED and brake at MAX_LIFT_ACCEL.
  // A hard brake (more than g) is what makes a sudden stand-up throw the body.
  // SHOULDER_GAIN only smooths the last few centimetres so the shoulder settles.
  SHOULDER_GAIN: 30,
  MAX_LIFT_SPEED: 2.8,
  MAX_LIFT_ACCEL: 60,
  JUMP_EXTRA: 0.7,
  JUMP_SECONDS: 0.32,
  JUMP_LIFT_SPEED: 6,

  // Coffin board runs along the line between the shoulders, overhanging a little.
  COFFIN_HALF: 1.0,
  WALL_HEIGHT: 0.15,
  // The body is a point at its back; its head and feet reach this far along the board.
  BODY_HALF: 0.6,
  // Thickness of the body above the board, for hitting branches.
  BODY_THICKNESS: 0.22,
  FRICTION: 0.05,
  RESTITUTION: 0.2,
  WALL_RESTITUTION: 0.2,
  // Hitting an end wall faster than this tips the body over it.
  WALL_TIP_SPEED: 1.6,
  // A body landing with its middle this far from the centre goes over the wall.
  RIM_AT: 0.8,
  // Past this tilt (radians) a body resting against the low wall rolls over it.
  TIP_ANGLE: 0.25,

  // Track: ground polyline [x, y] for the bearers' feet, plus small bumps.
  GROUND: [
    [-5, 0],
    [3, 0],
    [6.5, 1.27], // uphill, 20 degrees
    [8, 1.27],
    [9.5, 0.77], // short drop into a dip
    [10.3, 0.77],
    [11.3, 1.0], // and straight back out
    [15.5, 1.0],
    [15.8, 1.25], // two steps up
    [16.6, 1.25],
    [16.9, 1.5],
    [18, 1.5],
    [22.5, 0], // long downhill
    [40, 0]
  ],
  BUMPS: [
    { x: 23.3, width: 0.5, height: 0.13 },
    { x: 24.2, width: 0.5, height: 0.13 },
    { x: 25.1, width: 0.5, height: 0.13 }
  ],
  // A low branch over the flat stretch: only clears a coffin both bearers carry crouched.
  BRANCHES: [{ x: 14, width: 0.7, clearance: 0.92 }],
  // Signs drawn ahead of each hazard.
  SIGNS: [
    { x: 2.2, text: "上坡" },
    { x: 7.6, text: "下坑" },
    { x: 12.4, text: "低头" },
    { x: 15.2, text: "台阶" },
    { x: 17.8, text: "下坡" },
    { x: 22.8, text: "颠" }
  ],
  PIT_X: 28.3,
  PIT_WIDTH: 1.6,
  PIT_DEPTH: 1.5,
  // Front bearer stops this far before the pit.
  PIT_MARGIN: 0.05
};
