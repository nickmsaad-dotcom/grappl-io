import {
  BASE_ACCEL, FRICTION, BASE_SPEED, SIZE_SPEED_FACTOR, DT
} from './constants.js';

// Size-based movement: bigger = slower
export function applyMovement(player) {
  if (!player.alive) return;

  const keys = player.input.keys;
  let ax = 0;
  let ay = 0;

  if (keys.w || keys.ArrowUp) ay -= 1;
  if (keys.s || keys.ArrowDown) ay += 1;
  if (keys.a || keys.ArrowLeft) ax -= 1;
  if (keys.d || keys.ArrowRight) ax += 1;

  // Normalize diagonal movement
  if (ax !== 0 && ay !== 0) {
    const len = Math.sqrt(ax * ax + ay * ay);
    ax /= len;
    ay /= len;
  }

  // Counter-movement braking
  if (ax !== 0) {
    if ((ax > 0 && player.vx < 0) || (ax < 0 && player.vx > 0)) {
      player.vx *= 0.7;
    }
  }
  if (ay !== 0) {
    if ((ay > 0 && player.vy < 0) || (ay < 0 && player.vy > 0)) {
      player.vy *= 0.7;
    }
  }

  // Extra friction when no input
  if (ax === 0 && ay === 0) {
    player.vx *= 0.88;
    player.vy *= 0.88;
  }

  // Scale acceleration by mass (bigger = slower)
  const sizeScale = 1 / (1 + (player.mass - 1) * SIZE_SPEED_FACTOR);
  const accel = BASE_ACCEL * sizeScale;

  player.vx += ax * accel * DT;
  player.vy += ay * accel * DT;
}

// Apply friction and size-based speed cap
export function applyFriction(player) {
  // Reduced friction while swinging on terrain anchor
  const friction = player.hookState === 'ANCHORED' ? 0.96 : FRICTION;
  player.vx *= friction;
  player.vy *= friction;

  // Speed cap scales with size — higher cap while swinging
  const sizeScale = 1 / (1 + (player.mass - 1) * SIZE_SPEED_FACTOR);
  const swingBonus = player.hookState === 'ANCHORED' ? 1.8 : 1;
  const maxSpeed = BASE_SPEED * sizeScale * swingBonus;

  const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  if (speed > maxSpeed && speed > 0.01) {
    player.vx = (player.vx / speed) * maxSpeed;
    player.vy = (player.vy / speed) * maxSpeed;
  }

  if (Math.abs(player.vx) < 2) player.vx = 0;
  if (Math.abs(player.vy) < 2) player.vy = 0;
}

// Integrate position
export function integrate(player) {
  if (!player.alive) return;

  player.x += player.vx * DT;
  player.y += player.vy * DT;

  if (player.hookCooldown > 0) {
    player.hookCooldown -= DT;
  }
  if (player.invulnTimer > 0) {
    player.invulnTimer -= DT;
  }
}
