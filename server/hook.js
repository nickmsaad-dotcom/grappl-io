import {
  HOOK_SPEED, HOOK_RANGE, HOOK_RADIUS,
  HOOK_COOLDOWN, HOOK_FOOD_PULL, HOOK_GATHER_RADIUS,
  SWING_FORCE, SWING_MAX_SPEED, SWING_ROPE_LENGTH_MAX,
  HOOK_PLAYER_PULL, HOOK_MASS_STEAL, HOOK_STEAL_BOOST, HOOK_PLAYER_RADIUS,
  DT
} from './constants.js';
import { checkPointObstacleCollision } from './obstacles.js';
import { Player } from './player.js';

// Helper: find the largest cell in a player's cells array
function getLargestCell(player) {
  let largest = player.cells[0];
  for (let i = 1; i < player.cells.length; i++) {
    if (player.cells[i].mass > largest.mass) largest = player.cells[i];
  }
  return largest;
}

// Fire a hook toward mouseAngle
export function fireHook(player) {
  if (!player.alive) return;
  if (player.hookState !== 'IDLE') return;
  if (player.hookCooldown > 0) return;

  player.hookState = 'FLYING';
  player.hookOriginX = player.x;
  player.hookOriginY = player.y;
  player.hookX = player.x;
  player.hookY = player.y;
  player.hookVx = Math.cos(player.input.mouseAngle) * HOOK_SPEED;
  player.hookVy = Math.sin(player.input.mouseAngle) * HOOK_SPEED;
  player.hookedFood = [];
  player.hookedPlayerId = null;
  player.hookedOwnCells = [];
}

// Retract hook
export function releaseHook(player) {
  player.hookState = 'IDLE';
  player.hookedFood = [];
  player.hookedPlayerId = null;
  player.hookedOwnCells = [];
  player.hookCooldown = HOOK_COOLDOWN;
}

// Update flying hook — check obstacles, players, and food
export function updateFlyingHook(player, food, players) {
  if (player.hookState !== 'FLYING') return;

  player.hookX += player.hookVx * DT;
  player.hookY += player.hookVy * DT;

  // Update origin to track player movement (for range check)
  player.hookOriginX = player.x;
  player.hookOriginY = player.y;

  // Check obstacle collision first — anchor to terrain
  const obsHit = checkPointObstacleCollision(player.hookX, player.hookY);
  if (obsHit) {
    player.hookState = 'ANCHORED';
    player.anchorX = obsHit.contactX;
    player.anchorY = obsHit.contactY;
    player.hookX = obsHit.contactX;
    player.hookY = obsHit.contactY;

    const dx = player.x - obsHit.contactX;
    const dy = player.y - obsHit.contactY;
    player.ropeLength = Math.min(
      Math.sqrt(dx * dx + dy * dy),
      SWING_ROPE_LENGTH_MAX
    );
    player.hookedFood = [];
    return;
  }

  // Check player collision — grapple combat
  if (players) {
    for (const target of players.values()) {
      if (target.id === player.id || !target.alive) continue;
      if (target.invulnTimer > 0) continue;

      const dx = player.hookX - target.x;
      const dy = player.hookY - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < target.radius + HOOK_PLAYER_RADIUS) {
        // Hook hit a player!
        if (player.mass > target.mass) {
          // Hooker is bigger — reel victim in for easy eat
          player.hookState = 'REELING_PLAYER';
          player.hookedPlayerId = target.id;
          player.hookX = target.x;
          player.hookY = target.y;
          return;
        } else if (target.mass > player.mass) {
          // Target is bigger — steal mass from their largest cell, add to our largest
          const targetCell = getLargestCell(target);
          const stolen = Math.min(targetCell.mass * HOOK_MASS_STEAL, targetCell.mass - 0.5);
          if (stolen <= 0) { releaseHook(player); return; }
          targetCell.mass -= stolen;
          targetCell.radius = Player.radiusFromMass(targetCell.mass);
          target.updateFromCells();
          player.addMass(stolen);

          // Slingshot boost away from target — apply to largest cell
          const myCell = getLargestCell(player);
          if (myCell) {
            const bx = player.x - target.x;
            const by = player.y - target.y;
            const bDist = Math.sqrt(bx * bx + by * by);
            if (bDist > 1) {
              myCell.vx += (bx / bDist) * HOOK_STEAL_BOOST;
              myCell.vy += (by / bDist) * HOOK_STEAL_BOOST;
            }
          }

          releaseHook(player);
          return;
        } else {
          // Similar size — brief tug toward hooker, applied to target's largest cell
          const targetCell = getLargestCell(target);
          if (targetCell) {
            const tx = player.x - target.x;
            const ty = player.y - target.y;
            const tDist = Math.sqrt(tx * tx + ty * ty);
            if (tDist > 1) {
              targetCell.vx += (tx / tDist) * 200;
              targetCell.vy += (ty / tDist) * 200;
            }
          }
          releaseHook(player);
          return;
        }
      }
    }
  }

  // Grab food near hook tip
  for (const f of food) {
    if (f.dead) continue;
    const dx = player.hookX - f.x;
    const dy = player.hookY - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < HOOK_GATHER_RADIUS) {
      if (!player.hookedFood.includes(f.id)) {
        player.hookedFood.push(f.id);
      }
    }
  }

  // Grab own non-largest cells near hook tip (store cell references, not indices)
  if (player.cells.length > 1) {
    const largest = getLargestCell(player);
    for (const cell of player.cells) {
      if (cell === largest) continue;
      if (player.hookedOwnCells.includes(cell)) continue;
      const dx = player.hookX - cell.x;
      const dy = player.hookY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < cell.radius + HOOK_GATHER_RADIUS) {
        player.hookedOwnCells.push(cell);
      }
    }
  }

  // Check range
  const dx = player.hookX - player.hookOriginX;
  const dy = player.hookY - player.hookOriginY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > HOOK_RANGE) {
    if (player.hookedFood.length > 0 || player.hookedOwnCells.length > 0) {
      player.hookState = 'REELING';
    } else {
      releaseHook(player);
    }
  }
}

// Apply swing physics when anchored to terrain — acts on largest cell
export function updateAnchoredHook(player) {
  if (player.hookState !== 'ANCHORED') return;
  if (player.cells.length === 0) return;

  const cell = getLargestCell(player);

  const dx = cell.x - player.anchorX;
  const dy = cell.y - player.anchorY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return;

  const nx = dx / dist;
  const ny = dy / dist;

  const stretch = dist - player.ropeLength;
  if (stretch > 0) {
    cell.x = player.anchorX + nx * player.ropeLength;
    cell.y = player.anchorY + ny * player.ropeLength;

    const radialV = cell.vx * nx + cell.vy * ny;
    if (radialV > 0) {
      cell.vx -= radialV * nx;
      cell.vy -= radialV * ny;
    }
  }

  const pullStrength = SWING_FORCE * DT;
  cell.vx -= nx * pullStrength;
  cell.vy -= ny * pullStrength;

  const speed = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
  if (speed > SWING_MAX_SPEED && speed > 0.01) {
    cell.vx = (cell.vx / speed) * SWING_MAX_SPEED;
    cell.vy = (cell.vy / speed) * SWING_MAX_SPEED;
  }

  player.ropeLength = Math.max(30, player.ropeLength - 60 * DT);
  player.hookX = player.anchorX;
  player.hookY = player.anchorY;
}

// Reel a hooked player toward the hooker — apply to target's cells
export function updateReelingPlayer(player, players) {
  if (player.hookState !== 'REELING_PLAYER') return;

  const target = players.get(player.hookedPlayerId);
  if (!target || !target.alive) {
    releaseHook(player);
    return;
  }

  // Pull all victim cells toward hooker
  const dx = player.x - target.x;
  const dy = player.y - target.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 1) {
    const nx = dx / dist;
    const ny = dy / dist;
    const pullSpeed = HOOK_PLAYER_PULL;

    for (const cell of target.cells) {
      cell.vx += nx * pullSpeed * DT * 3;
      cell.vy += ny * pullSpeed * DT * 3;
      // Slow victim's escape attempts
      cell.vx *= 0.95;
      cell.vy *= 0.95;
    }
  }

  // Update hook visual to track victim
  player.hookX = target.x;
  player.hookY = target.y;

  // Release if victim gets too far (broke free) or if they died
  if (dist > HOOK_RANGE * 1.5) {
    releaseHook(player);
  }
}

// Reel hooked food and own cells toward the player's largest cell
export function reelHookedFood(player, foodById) {
  if (player.hookState !== 'REELING') return;

  // Find largest cell (reel target)
  const largest = getLargestCell(player);

  let anyActive = false;

  // Reel food
  for (const foodId of player.hookedFood) {
    const f = foodById.get(foodId);
    if (!f || f.dead) continue;

    anyActive = true;

    const dx = largest.x - f.x;
    const dy = largest.y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < largest.radius + f.radius) {
      f.dead = true;
      largest.mass += f.mass;
      largest.radius = Player.radiusFromMass(largest.mass);
      player.score += f.mass;
    } else if (dist > 0.1) {
      const nx = dx / dist;
      const ny = dy / dist;
      f.x += nx * HOOK_FOOD_PULL * DT;
      f.y += ny * HOOK_FOOD_PULL * DT;
    }
  }

  // Reel own cells toward largest cell (hookedOwnCells stores cell references)
  const pullSpeed = HOOK_FOOD_PULL * 1.5;
  for (let hi = player.hookedOwnCells.length - 1; hi >= 0; hi--) {
    const cell = player.hookedOwnCells[hi];
    // Validate: cell still belongs to this player and isn't the largest
    const ci = player.cells.indexOf(cell);
    if (ci === -1 || cell === largest) {
      player.hookedOwnCells.splice(hi, 1);
      continue;
    }

    anyActive = true;

    const dx = largest.x - cell.x;
    const dy = largest.y - cell.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < largest.radius + cell.radius) {
      // Merge into largest
      largest.mass += cell.mass;
      largest.radius = Player.radiusFromMass(largest.mass);
      player.cells.splice(ci, 1);
      player.hookedOwnCells.splice(hi, 1);
    } else if (dist > 0.1) {
      const nx = dx / dist;
      const ny = dy / dist;
      cell.vx += nx * pullSpeed * DT * 3;
      cell.vy += ny * pullSpeed * DT * 3;
      cell.vx *= 0.92;
      cell.vy *= 0.92;
    }
  }

  // Retract hook visual
  const hx = player.hookX - largest.x;
  const hy = player.hookY - largest.y;
  const hDist = Math.sqrt(hx * hx + hy * hy);
  if (hDist > largest.radius) {
    const retractSpeed = HOOK_FOOD_PULL * 1.2;
    player.hookX -= (hx / hDist) * retractSpeed * DT;
    player.hookY -= (hy / hDist) * retractSpeed * DT;
  }

  if (!anyActive || hDist <= largest.radius + 5) {
    player.updateFromCells();
    releaseHook(player);
  }
}

// Check if any cell walks over food (passive collection)
export function checkFoodPickup(player, food) {
  if (!player.alive) return;

  let ate = false;
  for (const f of food) {
    if (f.dead) continue;
    for (const cell of player.cells) {
      const dx = cell.x - f.x;
      const dy = cell.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < cell.radius + f.radius) {
        f.dead = true;
        cell.mass += f.mass;
        cell.radius = Player.radiusFromMass(cell.mass);
        player.score += f.mass;
        ate = true;
        break;
      }
    }
  }
  if (ate) player.updateFromCells();
}
