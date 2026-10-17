// All tuning values live here so playtests can adjust feel in one place.
// World units are logical pixels at a 1280x720 view; y grows downward.

export const VIEW_W = 1280;
export const VIEW_H = 720;

// Speed-dependent values derive from SPEED_SCALE: scaling it slows or speeds
// up the whole simulation without changing any jump's geometry.
export const SPEED_SCALE = 0.85;
const K = SPEED_SCALE;

export const BALL_SCREEN_X = 240; // where the ball sits horizontally on screen
export const LEAD = 540; // world distance from ball to pen tip
export const DX = 4; // terrain sample spacing

export const BALL_R = 11;
export const GRAVITY = 1600 * K * K;
export const DRAG = 3.0e-4; // quadratic air drag coefficient (per unit distance)
export const ROLL = 28 * K * K; // constant rolling resistance while grounded

export const BAND_HALF = 190; // half height of the drawable band
export const PEN_TAU = 0.035; // pen smoothing time constant (seconds)
export const MAX_SLOPE = 2.4; // steepest slope the pen can draw

export const BOUNCE_IMPACT = 350 * K; // normal speed above which a landing bounces back
export const RESTITUTION = 0.35; // share of the excess impact speed returned as a bounce
export const HARD_IMPACT = 600 * K; // impact that gets the heaviest feedback
export const WALL_PEN = 20; // penetration depth that counts as hitting a wall
export const DETACH_EPS = 1.5; // height above ground that counts as airborne
export const LAND_MIN_AIR = 0.12 / K; // airtime before a touchdown counts as a landing
export const FLOW_MIN_AIR = 0.25 / K; // airtime before a landing affects flow

export const PERFECT_LOSS = 0.03;
export const CLEAN_LOSS = 0.1;
export const FLOW_MAX = 8;

export const STALL_SPEED = 70 * K;
export const STALL_TIME = 1.4;
export const FALL_DEPTH = 520; // below band bottom

export const RING_R = 30;
export const RING_BOOST = 90 * K;

export const START_X = 260;
export const START_SPEED = 160 * K;

export const UNITS_PER_METER = 20;
export const SPEED_MULT_BASE = 600 * K; // speed at which the score multiplier starts rising
export const CRUISE_SPEED = 830 * K; // typical speed on the band; used for visuals

export const FIXED_DT = 1 / 120;
