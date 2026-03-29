import {
  ARENA_WIDTH, ARENA_HEIGHT, SIZE_EAT_RATIO,
  SPIKE_DAMAGE_RATE, SPIKE_KNOCKBACK, DT, CELL_MIN_MASS
} from './constants.js';
import { checkCircleObstacleCollision } from './obstacles.js';
import { Player } from './player.js';

// Reusable array to avoid allocation every tick
const _cellList = [];

// Cell-vs-cell cross-player eating: bigger cell absorbs smaller cell on contact
export function resolvePlayerCollisions(players, onEatCell) {
  _cellList.length = 0;
  for (const p of players.values()) {
    if (!p.alive) continue;
    for (const cell of p.cells) {
      _cellList.push({ cell, player: p });
    }
  }
  const list = _cellList;

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];

      // Skip same-player cells
      if (a.player === b.player) continue;

      const dx = b.cell.x - a.cell.x;
      const dy = b.cell.y - a.cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const touchDist = a.cell.radius + b.cell.radius;

      if (dist >= touchDist || dist < 0.01) continue;
      // Skip if either player already dead this tick
      if (!a.player.alive || !b.player.alive) continue;

      // Check if one cell can eat the other (just needs more mass)
      if (a.cell.mass > b.cell.mass &&
          b.player.invulnTimer <= 0 &&
          !(b.player.effects && b.player.effects.shield > 0)) {
        onEatCell(a.player, a.cell, b.player, b.cell);
      } else if (b.cell.mass > a.cell.mass &&
                 a.player.invulnTimer <= 0 &&
                 !(a.player.effects && a.player.effects.shield > 0)) {
        onEatCell(b.player, b.cell, a.player, a.cell);
      } else {
        // Similar size — gentle push apart
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = touchDist - dist;

        a.cell.x -= nx * overlap * 0.5;
        a.cell.y -= ny * overlap * 0.5;
        b.cell.x += nx * overlap * 0.5;
        b.cell.y += ny * overlap * 0.5;

        a.cell.vx -= nx * 30;
        a.cell.vy -= ny * 30;
        b.cell.vx += nx * 30;
        b.cell.vy += ny * 30;
      }
    }
  }
}

// Push player cells out of obstacles — resolve all overlaps, apply spike damage
export function applyObstacleCollision(player) {
  for (let ci = player.cells.length - 1; ci >= 0; ci--) {
    const cell = player.cells[ci];
    for (let pass = 0; pass < 3; pass++) {
      const result = checkCircleObstacleCollision(cell.x, cell.y, cell.radius);
      if (!result) break;

      // Push cell out
      cell.x += result.pushX;
      cell.y += result.pushY;

      // Reflect velocity off obstacle surface
      const pushLen = Math.sqrt(result.pushX * result.pushX + result.pushY * result.pushY);
      if (pushLen > 0.01) {
        const nx = result.pushX / pushLen;
        const ny = result.pushY / pushLen;
        const dot = cell.vx * nx + cell.vy * ny;
        if (dot < 0) {
          cell.vx -= 1.5 * dot * nx;
          cell.vy -= 1.5 * dot * ny;
        }

        // Spike damage — percentage-based (shield blocks)
        if (result.obstacle.spike && player.invulnTimer <= 0 && !(player.effects && player.effects.shield > 0)) {
          const dmg = cell.mass * SPIKE_DAMAGE_RATE * DT;
          cell.mass = Math.max(CELL_MIN_MASS, cell.mass - dmg);
          cell.radius = Player.radiusFromMass(cell.mass);

          // Extra knockback away from spikes
          cell.vx += nx * SPIKE_KNOCKBACK * DT;
          cell.vy += ny * SPIKE_KNOCKBACK * DT;

          // Remove cell if too small
          if (cell.mass <= CELL_MIN_MASS && player.cells.length > 1) {
            player.cells.splice(ci, 1);
            break;
          }
        }
      }
    }
  }
}

// Soft boundary: bounce cells off arena edges
export function applySoftBoundary(player) {
  const bounce = 0.5;

  for (const cell of player.cells) {
    const r = cell.radius;

    if (cell.x - r < 0) {
      cell.x = r;
      cell.vx = Math.abs(cell.vx) * bounce;
    }
    if (cell.x + r > ARENA_WIDTH) {
      cell.x = ARENA_WIDTH - r;
      cell.vx = -Math.abs(cell.vx) * bounce;
    }
    if (cell.y - r < 0) {
      cell.y = r;
      cell.vy = Math.abs(cell.vy) * bounce;
    }
    if (cell.y + r > ARENA_HEIGHT) {
      cell.y = ARENA_HEIGHT - r;
      cell.vy = -Math.abs(cell.vy) * bounce;
    }
  }
}
