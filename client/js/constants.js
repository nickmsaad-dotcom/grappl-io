// Must match server constants
export const ARENA_WIDTH = 4000;
export const ARENA_HEIGHT = 4000;
export const MIN_PLAYER_RADIUS = 18;
export const FOOD_RADIUS = 5;

// Physics (mirrored from server for client-side prediction)
export const BASE_SPEED = 540;
export const SIZE_SPEED_FACTOR = 0.22;
export const BASE_ACCEL = 3600;
export const FRICTION = 0.82;
export const POWERUP_SPEED_MULT = 1.8;

export const NEON_COLORS = [
  '#00ffff', '#ff00ff', '#00ff66', '#ffff00',
  '#ff3366', '#3399ff', '#ff6600', '#cc33ff',
  '#33ffcc', '#ff3333', '#66ff33', '#ff99cc'
];
