import {
  ARENA_WIDTH, ARENA_HEIGHT, SIZE_EAT_RATIO,
  SPIKE_DAMAGE_RATE, SPIKE_KNOCKBACK, DT, MIN_MASS
} from './constants.js';
import { checkCircleObstacleCollision } from './obstacles.js';

// Size-based player eating: bigger absorbs smaller on contact
export function resolvePlayerCollisions(players, onEat) {
  const list = [...players.values()].filter(p => p.alive);

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const touchDist = a.radius + b.radius;

      if (dist >= touchDist || dist < 0.01) continue;
      if (!a.alive || !b.alive) continue; // Skip if already eaten this tick

      // Check if one can eat the other
      if (a.radius > b.radius * SIZE_EAT_RATIO && b.invulnTimer <= 0) {
        // A eats B
        onEat(a, b);
      } else if (b.radius > a.radius * SIZE_EAT_RATIO && a.invulnTimer <= 0) {
        // B eats A
        onEat(b, a);
      } else {
        // Similar size — gentle push apart
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = touchDist - dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        // Slight velocity nudge
        a.vx -= nx * 30;
        a.vy -= ny * 30;
        b.vx += nx * 30;
        b.vy += ny * 30;
      }
    }
  }
}

// Push players out of obstacles — resolve all overlaps, apply spike damage
export function applyObstacleCollision(player) {
  for (let pass = 0; pass < 3; pass++) {
    const result = checkCircleObstacleCollision(player.x, player.y, player.radius);
    if (!result) break;

    // Push player out
    player.x += result.pushX;
    player.y += result.pushY;

    // Reflect velocity off obstacle surface
    const pushLen = Math.sqrt(result.pushX * result.pushX + result.pushY * result.pushY);
    if (pushLen > 0.01) {
      const nx = result.pushX / pushLen;
      const ny = result.pushY / pushLen;
      const dot = player.vx * nx + player.vy * ny;
      if (dot < 0) {
        player.vx -= 1.5 * dot * nx;
        player.vy -= 1.5 * dot * ny;
      }

      // Spike damage — drain mass and knockback
      if (result.obstacle.spike && player.invulnTimer <= 0) {
        player.mass = Math.max(MIN_MASS, player.mass - SPIKE_DAMAGE_RATE * DT);
        player.updateRadius();

        // Extra knockback away from spikes
        player.vx += nx * SPIKE_KNOCKBACK * DT;
        player.vy += ny * SPIKE_KNOCKBACK * DT;
      }
    }
  }
}

// Soft boundary: bounce players off arena edges
export function applySoftBoundary(player) {
  const r = player.radius;
  const bounce = 0.5;

  if (player.x - r < 0) {
    player.x = r;
    player.vx = Math.abs(player.vx) * bounce;
  }
  if (player.x + r > ARENA_WIDTH) {
    player.x = ARENA_WIDTH - r;
    player.vx = -Math.abs(player.vx) * bounce;
  }
  if (player.y - r < 0) {
    player.y = r;
    player.vy = Math.abs(player.vy) * bounce;
  }
  if (player.y + r > ARENA_HEIGHT) {
    player.y = ARENA_HEIGHT - r;
    player.vy = -Math.abs(player.vy) * bounce;
  }
}
