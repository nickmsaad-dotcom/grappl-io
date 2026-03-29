// Bot AI: seek food, flee bigger players, chase smaller ones, avoid obstacles

import { ARENA_WIDTH, ARENA_HEIGHT, SIZE_EAT_RATIO, OBSTACLES, SPLIT_MIN_MASS, SPLIT_MAX_CELLS } from './constants.js';
import { Player } from './player.js';

const BOT_NAMES = [
  'Botley', 'NomNom', 'SwingKing', 'GrabBot', 'Chomper',
  'YeetBot', 'Muncher', 'NPC_Andy', 'EzTarget', 'Flingus',
  'Snacker', 'Swoosh', 'Dangles', 'Zippy', 'Bonkers',
];

let botNameIdx = 0;

export function getBotName() {
  const name = BOT_NAMES[botNameIdx % BOT_NAMES.length];
  botNameIdx++;
  return name;
}

// Check if an obstacle blocks the straight-line path from (ax,ay) to (bx,by)
function isPathBlocked(ax, ay, bx, by, margin) {
  for (const obs of OBSTACLES) {
    if (obs.type === 'pillar') {
      // Point-to-circle distance for line segment
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const nx = dx / len;
      const ny = dy / len;
      const ox = obs.x - ax;
      const oy = obs.y - ay;
      const proj = ox * nx + oy * ny;
      if (proj < 0 || proj > len) continue;
      const perpX = ox - proj * nx;
      const perpY = oy - proj * ny;
      const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
      if (perpDist < obs.radius + margin) return true;
    } else if (obs.type === 'wall') {
      // Simple AABB check — is the line's midpoint near the wall?
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      if (mx > obs.x - margin && mx < obs.x + obs.w + margin &&
          my > obs.y - margin && my < obs.y + obs.h + margin) return true;
    }
  }
  return false;
}

// Find nearest obstacle and return avoidance steering vector
function getObstacleAvoidance(bx, by, radius) {
  let avoidX = 0;
  let avoidY = 0;

  for (const obs of OBSTACLES) {
    let dx, dy, dist, danger;

    // Wider avoidance margin for spiked obstacles
    const spikeExtra = obs.spike ? 40 : 0;

    if (obs.type === 'pillar') {
      dx = bx - obs.x;
      dy = by - obs.y;
      dist = Math.sqrt(dx * dx + dy * dy);
      danger = obs.radius + radius + 30 + spikeExtra;
    } else {
      // Closest point on wall to bot
      const cx = Math.max(obs.x, Math.min(bx, obs.x + obs.w));
      const cy = Math.max(obs.y, Math.min(by, obs.y + obs.h));
      dx = bx - cx;
      dy = by - cy;
      dist = Math.sqrt(dx * dx + dy * dy);
      danger = radius + 30 + spikeExtra;
    }

    if (dist < danger && dist > 0.1) {
      // Strength increases as bot gets closer
      const strength = (danger - dist) / danger;
      avoidX += (dx / dist) * strength;
      avoidY += (dy / dist) * strength;
    }
  }

  return { x: avoidX, y: avoidY };
}

function setKeysFromAngle(angle, keys) {
  if (Math.cos(angle) > 0.3) keys.d = true;
  if (Math.cos(angle) < -0.3) keys.a = true;
  if (Math.sin(angle) > 0.3) keys.s = true;
  if (Math.sin(angle) < -0.3) keys.w = true;
}

export function updateBotInput(bot, players, food, powerups) {
  if (!bot.alive) return;

  const keys = { w: false, a: false, s: false, d: false };
  let mouseAngle = bot._botAngle || 0;
  let fire = false;

  // Check for threats (bigger players nearby)
  let threat = null;
  let threatDist = 300;

  // Check for prey (smaller players nearby)
  let prey = null;
  let preyDist = 250;

  for (const p of players.values()) {
    if (p.id === bot.id || !p.alive) continue;
    const dx = p.x - bot.x;
    const dy = p.y - bot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (p.mass > bot.mass && dist < threatDist) {
      threat = p;
      threatDist = dist;
    }
    if (bot.mass > p.mass && dist < preyDist) {
      prey = p;
      preyDist = dist;
    }
  }

  // Obstacle avoidance — always active, blended with other steering
  const avoid = getObstacleAvoidance(bot.x, bot.y, bot.radius);
  const avoidStrength = Math.sqrt(avoid.x * avoid.x + avoid.y * avoid.y);
  const isStuck = avoidStrength > 0.5;

  // Edge avoidance
  const edgeMargin = 100;
  let avoidEdgeX = 0;
  let avoidEdgeY = 0;
  if (bot.x < edgeMargin) avoidEdgeX = 1;
  if (bot.x > ARENA_WIDTH - edgeMargin) avoidEdgeX = -1;
  if (bot.y < edgeMargin) avoidEdgeY = 1;
  if (bot.y > ARENA_HEIGHT - edgeMargin) avoidEdgeY = -1;
  const nearEdge = avoidEdgeX !== 0 || avoidEdgeY !== 0;

  if (nearEdge) {
    if (avoidEdgeX > 0) keys.d = true;
    if (avoidEdgeX < 0) keys.a = true;
    if (avoidEdgeY > 0) keys.s = true;
    if (avoidEdgeY < 0) keys.w = true;
  } else if (isStuck) {
    // Obstacle avoidance takes priority when close to obstacles
    const avoidAngle = Math.atan2(avoid.y, avoid.x);
    setKeysFromAngle(avoidAngle, keys);
  } else if (threat) {
    // Flee from bigger player
    const dx = bot.x - threat.x;
    const dy = bot.y - threat.y;
    // Blend flee direction with obstacle avoidance
    const fleeAngle = Math.atan2(dy + avoid.y * 2, dx + avoid.x * 2);
    setKeysFromAngle(fleeAngle, keys);
  } else if (prey && preyDist < 200) {
    // Chase smaller player
    const dx = prey.x - bot.x;
    const dy = prey.y - bot.y;
    const angle = Math.atan2(dy + avoid.y * 2, dx + avoid.x * 2);
    mouseAngle = Math.atan2(dy, dx);
    setKeysFromAngle(angle, keys);

    // Hook smaller players to reel them in — but only if path isn't blocked
    if (preyDist > 60 && preyDist < 350 && bot.hookState === 'IDLE' && Math.random() < 0.03) {
      if (!isPathBlocked(bot.x, bot.y, prey.x, prey.y, bot.radius)) {
        fire = true;
      }
    }
  } else if (threat && threatDist < 350 && bot.hookState === 'IDLE' && Math.random() < 0.008) {
    // Occasionally hook bigger player to steal mass
    if (!isPathBlocked(bot.x, bot.y, threat.x, threat.y, 10)) {
      const dx = threat.x - bot.x;
      const dy = threat.y - bot.y;
      mouseAngle = Math.atan2(dy, dx);
      fire = true;
    }
  } else {
    // Check for nearby powerups first
    let nearestPowerup = null;
    let nearestPuDist = 500;
    if (powerups) {
      for (const pu of powerups) {
        const dx = pu.x - bot.x;
        const dy = pu.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestPuDist && !isPathBlocked(bot.x, bot.y, pu.x, pu.y, bot.radius)) {
          nearestPuDist = dist;
          nearestPowerup = pu;
        }
      }
    }
    if (nearestPowerup) {
      const dx = nearestPowerup.x - bot.x;
      const dy = nearestPowerup.y - bot.y;
      const angle = Math.atan2(dy + avoid.y * 2, dx + avoid.x * 2);
      mouseAngle = Math.atan2(dy, dx);
      setKeysFromAngle(angle, keys);
    }

    // Seek nearest food — skip food behind obstacles
    else {
    let nearestFood = null;
    let nearestFoodDist = Infinity;

    for (const f of food) {
      if (f.dead) continue;
      const dx = f.x - bot.x;
      const dy = f.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestFoodDist) {
        // Skip food blocked by obstacles (only check for close food to save CPU)
        if (dist < 300 && isPathBlocked(bot.x, bot.y, f.x, f.y, bot.radius)) {
          continue;
        }
        nearestFoodDist = dist;
        nearestFood = f;
      }
    }

    if (nearestFood) {
      const dx = nearestFood.x - bot.x;
      const dy = nearestFood.y - bot.y;
      const foodAngle = Math.atan2(dy, dx);
      mouseAngle = foodAngle;

      // Blend food direction with obstacle avoidance
      const wobble = Math.sin(Date.now() * 0.002 + bot._botSeed) * 0.3;
      const moveAngle = Math.atan2(
        Math.sin(foodAngle) + avoid.y * 3 + Math.sin(wobble) * 0.3,
        Math.cos(foodAngle) + avoid.x * 3 + Math.cos(wobble) * 0.3
      );
      setKeysFromAngle(moveAngle, keys);

      // Fire hook at food if it's a bit far — only if path is clear
      if (nearestFoodDist > 100 && nearestFoodDist < 400 && bot.hookState === 'IDLE' && Math.random() < 0.015) {
        if (!isPathBlocked(bot.x, bot.y, nearestFood.x, nearestFood.y, 10)) {
          fire = true;
        }
      }

      // Occasionally hook to nearby pillars for slingshot movement
      if (bot.hookState === 'IDLE' && Math.random() < 0.005) {
        for (const obs of OBSTACLES) {
          if (obs.type !== 'pillar') continue;
          const odx = obs.x - bot.x;
          const ody = obs.y - bot.y;
          const oDist = Math.sqrt(odx * odx + ody * ody);
          if (oDist > 100 && oDist < 300) {
            mouseAngle = Math.atan2(ody, odx);
            fire = true;
            break;
          }
        }
      }
    } else {
      // Wander — blend with obstacle avoidance
      bot._botWanderTimer = (bot._botWanderTimer || 0) + 1;
      if (bot._botWanderTimer > 90) {
        bot._botWanderAngle = Math.random() * Math.PI * 2;
        bot._botWanderTimer = 0;
      }
      const wa = bot._botWanderAngle || 0;
      const wanderAngle = Math.atan2(
        Math.sin(wa) + avoid.y * 3,
        Math.cos(wa) + avoid.x * 3
      );
      setKeysFromAngle(wanderAngle, keys);
      mouseAngle = wanderAngle;
    }
    } // close food-seeking else
  }

  // Release hook when anchored after building swing momentum
  let release = false;
  if (bot.hookState === 'ANCHORED') {
    bot._botSwingTimer = (bot._botSwingTimer || 0) + 1;
    if (bot._botSwingTimer > 30 + Math.random() * 30) {
      release = true;
      bot._botSwingTimer = 0;
    }
  } else if (bot.hookState === 'REELING_PLAYER') {
    // Keep reeling — don't release while pulling a player
  } else {
    bot._botSwingTimer = 0;
  }

  // Bots split to chase close prey
  let split = false;
  if (bot.splitCooldown <= 0 && bot.cells.length < SPLIT_MAX_CELLS) {
    // Find largest cell
    let largestMass = 0;
    for (const c of bot.cells) {
      if (c.mass > largestMass) largestMass = c.mass;
    }
    if (largestMass >= SPLIT_MIN_MASS * 2) {
      if (prey && preyDist < 150 && Math.random() < 0.02) {
        // Check if half would be big enough to eat prey
        const halfMass = largestMass / 2;
        if (halfMass > prey.mass) {
          split = true;
        }
      }
    }
  }

  bot._botAngle = mouseAngle;
  bot.input = { keys, mouseAngle, fire, release, split };
}
