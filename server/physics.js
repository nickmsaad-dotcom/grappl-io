import {
  BASE_ACCEL, FRICTION, BASE_SPEED, SIZE_SPEED_FACTOR, DT,
  POWERUP_SPEED_MULT
} from './constants.js';

// Size-based movement: bigger = slower — applied per cell
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

  const speedBuff = player.effects && player.effects.speed > 0 ? POWERUP_SPEED_MULT : 1;

  for (const cell of player.cells) {
    // Counter-movement braking
    if (ax !== 0) {
      if ((ax > 0 && cell.vx < 0) || (ax < 0 && cell.vx > 0)) {
        cell.vx *= 0.7;
      }
    }
    if (ay !== 0) {
      if ((ay > 0 && cell.vy < 0) || (ay < 0 && cell.vy > 0)) {
        cell.vy *= 0.7;
      }
    }

    // Extra friction when no input
    if (ax === 0 && ay === 0) {
      cell.vx *= 0.88;
      cell.vy *= 0.88;
    }

    // Scale acceleration by cell mass
    const sizeScale = 1 / (1 + (cell.mass - 1) * SIZE_SPEED_FACTOR);
    const accel = BASE_ACCEL * sizeScale * speedBuff;

    cell.vx += ax * accel * DT;
    cell.vy += ay * accel * DT;
  }
}

// Apply friction and size-based speed cap — per cell
export function applyFriction(player) {
  for (const cell of player.cells) {
    // Reduced friction while swinging on terrain anchor (applies to all cells)
    const friction = player.hookState === 'ANCHORED' ? 0.96 : FRICTION;
    cell.vx *= friction;
    cell.vy *= friction;

    // Speed cap scales with size
    const sizeScale = 1 / (1 + (cell.mass - 1) * SIZE_SPEED_FACTOR);
    const swingBonus = player.hookState === 'ANCHORED' ? 1.8 : 1;
    const speedBuff = player.effects && player.effects.speed > 0 ? POWERUP_SPEED_MULT : 1;
    const maxSpeed = BASE_SPEED * sizeScale * swingBonus * speedBuff;

    const speed = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
    if (speed > maxSpeed && speed > 0.01) {
      cell.vx = (cell.vx / speed) * maxSpeed;
      cell.vy = (cell.vy / speed) * maxSpeed;
    }

    if (Math.abs(cell.vx) < 2) cell.vx = 0;
    if (Math.abs(cell.vy) < 2) cell.vy = 0;
  }
}

// Integrate position — per cell + player-level timers
export function integrate(player) {
  if (!player.alive) return;

  for (const cell of player.cells) {
    cell.x += cell.vx * DT;
    cell.y += cell.vy * DT;

    // Tick merge timers
    if (cell.mergeTimer > 0) {
      cell.mergeTimer -= DT;
    }
  }

  if (player.hookCooldown > 0) {
    player.hookCooldown -= DT;
  }
  if (player.invulnTimer > 0) {
    player.invulnTimer -= DT;
  }
  if (player.splitCooldown > 0) {
    player.splitCooldown -= DT;
  }
}
