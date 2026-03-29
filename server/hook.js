import {
  HOOK_SPEED, HOOK_RANGE, HOOK_RADIUS,
  HOOK_COOLDOWN, HOOK_FOOD_PULL, HOOK_GATHER_RADIUS,
  SWING_FORCE, SWING_MAX_SPEED, SWING_ROPE_LENGTH_MAX,
  HOOK_PLAYER_PULL, HOOK_MASS_STEAL, HOOK_STEAL_BOOST, HOOK_PLAYER_RADIUS,
  SIZE_EAT_RATIO, DT
} from './constants.js';
import { checkPointObstacleCollision } from './obstacles.js';

// Fire a hook toward mouseAngle
export function fireHook(player) {
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
}

// Retract hook
export function releaseHook(player) {
  player.hookState = 'IDLE';
  player.hookedFood = [];
  player.hookedPlayerId = null;
  player.hookCooldown = HOOK_COOLDOWN;
}

// Update flying hook — check obstacles, players, and food
export function updateFlyingHook(player, food, players) {
  if (player.hookState !== 'FLYING') return;

  player.hookX += player.hookVx * DT;
  player.hookY += player.hookVy * DT;

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
        if (player.radius > target.radius * SIZE_EAT_RATIO) {
          // Hooker is bigger — reel victim in for easy eat
          player.hookState = 'REELING_PLAYER';
          player.hookedPlayerId = target.id;
          player.hookX = target.x;
          player.hookY = target.y;
          return;
        } else if (target.radius > player.radius * SIZE_EAT_RATIO) {
          // Target is bigger — steal mass and slingshot away
          const stolen = Math.min(target.mass * HOOK_MASS_STEAL, target.mass - 1);
          if (stolen <= 0) { releaseHook(player); return; }
          target.mass -= stolen;
          target.updateRadius();
          player.addMass(stolen);

          // Slingshot boost away from target
          const bx = player.x - target.x;
          const by = player.y - target.y;
          const bDist = Math.sqrt(bx * bx + by * by);
          if (bDist > 1) {
            player.vx += (bx / bDist) * HOOK_STEAL_BOOST;
            player.vy += (by / bDist) * HOOK_STEAL_BOOST;
          }

          releaseHook(player);
          return;
        } else {
          // Similar size — brief tug toward hooker, then release
          const tx = player.x - target.x;
          const ty = player.y - target.y;
          const tDist = Math.sqrt(tx * tx + ty * ty);
          if (tDist > 1) {
            target.vx += (tx / tDist) * 200;
            target.vy += (ty / tDist) * 200;
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

  // Check range
  const dx = player.hookX - player.hookOriginX;
  const dy = player.hookY - player.hookOriginY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > HOOK_RANGE) {
    if (player.hookedFood.length > 0) {
      player.hookState = 'REELING';
    } else {
      releaseHook(player);
    }
  }
}

// Apply swing physics when anchored to terrain
export function updateAnchoredHook(player) {
  if (player.hookState !== 'ANCHORED') return;

  const dx = player.x - player.anchorX;
  const dy = player.y - player.anchorY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return;

  const nx = dx / dist;
  const ny = dy / dist;

  const stretch = dist - player.ropeLength;
  if (stretch > 0) {
    player.x = player.anchorX + nx * player.ropeLength;
    player.y = player.anchorY + ny * player.ropeLength;

    const radialV = player.vx * nx + player.vy * ny;
    if (radialV > 0) {
      player.vx -= radialV * nx;
      player.vy -= radialV * ny;
    }
  }

  const pullStrength = SWING_FORCE * DT;
  player.vx -= nx * pullStrength;
  player.vy -= ny * pullStrength;

  const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  if (speed > SWING_MAX_SPEED && speed > 0.01) {
    player.vx = (player.vx / speed) * SWING_MAX_SPEED;
    player.vy = (player.vy / speed) * SWING_MAX_SPEED;
  }

  player.ropeLength = Math.max(30, player.ropeLength - 60 * DT);
  player.hookX = player.anchorX;
  player.hookY = player.anchorY;
}

// Reel a hooked player toward the hooker
export function updateReelingPlayer(player, players) {
  if (player.hookState !== 'REELING_PLAYER') return;

  const target = players.get(player.hookedPlayerId);
  if (!target || !target.alive) {
    releaseHook(player);
    return;
  }

  // Pull victim toward hooker
  const dx = player.x - target.x;
  const dy = player.y - target.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 1) {
    const nx = dx / dist;
    const ny = dy / dist;
    const pullSpeed = HOOK_PLAYER_PULL;

    // Move victim toward hooker
    target.vx += nx * pullSpeed * DT * 3;
    target.vy += ny * pullSpeed * DT * 3;

    // Slow victim's escape attempts
    target.vx *= 0.95;
    target.vy *= 0.95;
  }

  // Update hook visual to track victim
  player.hookX = target.x;
  player.hookY = target.y;

  // Release if victim gets too far (broke free) or if they died
  if (dist > HOOK_RANGE * 1.5) {
    releaseHook(player);
  }
}

// Reel hooked food toward the player
export function reelHookedFood(player, foodById) {
  if (player.hookState !== 'REELING') return;

  let anyAlive = false;

  for (const foodId of player.hookedFood) {
    const f = foodById.get(foodId);
    if (!f || f.dead) continue;

    anyAlive = true;

    const dx = player.x - f.x;
    const dy = player.y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < player.radius + f.radius) {
      f.dead = true;
      player.addMass(f.mass);
    } else if (dist > 0.1) {
      const nx = dx / dist;
      const ny = dy / dist;
      f.x += nx * HOOK_FOOD_PULL * DT;
      f.y += ny * HOOK_FOOD_PULL * DT;
    }
  }

  const hx = player.hookX - player.x;
  const hy = player.hookY - player.y;
  const hDist = Math.sqrt(hx * hx + hy * hy);
  if (hDist > player.radius) {
    const retractSpeed = HOOK_FOOD_PULL * 1.2;
    player.hookX -= (hx / hDist) * retractSpeed * DT;
    player.hookY -= (hy / hDist) * retractSpeed * DT;
  }

  if (!anyAlive || hDist <= player.radius + 5) {
    releaseHook(player);
  }
}

// Check if player walks over food (passive collection)
export function checkFoodPickup(player, food) {
  if (!player.alive) return;

  for (const f of food) {
    if (f.dead) continue;
    const dx = player.x - f.x;
    const dy = player.y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < player.radius + f.radius) {
      f.dead = true;
      player.addMass(f.mass);
    }
  }
}
