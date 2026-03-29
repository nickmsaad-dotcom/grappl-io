// Bot AI: seek food, flee bigger players, chase smaller ones, avoid obstacles
// Half the bots spawn as "aggressive" — wider awareness, more hooks, better chasing

import { ARENA_WIDTH, ARENA_HEIGHT, OBSTACLES, SPLIT_MIN_MASS, SPLIT_MAX_CELLS } from './constants.js';
import { Player } from './player.js';

const BOT_NAMES = [
  'Botley', 'NomNom', 'SwingKing', 'GrabBot', 'Chomper',
  'YeetBot', 'Muncher', 'NPC_Andy', 'EzTarget', 'Flingus',
  'Snacker', 'Swoosh', 'Dangles', 'Zippy', 'Bonkers',
  'Crusher', 'Fangs', 'Vortex', 'Reaper',
];

let botNameIdx = 0;
let botSpawnCount = 0;

export function getBotName() {
  const name = BOT_NAMES[botNameIdx % BOT_NAMES.length];
  botNameIdx++;
  return name;
}

// Called after bot is created to assign personality
export function initBotPersonality(bot) {
  botSpawnCount++;
  bot._aggressive = botSpawnCount % 2 === 0; // Every other bot is aggressive
}

// Check if an obstacle blocks the straight-line path from (ax,ay) to (bx,by)
function isPathBlocked(ax, ay, bx, by, margin) {
  for (const obs of OBSTACLES) {
    if (obs.type === 'pillar') {
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
    const spikeExtra = obs.spike ? 40 : 0;

    if (obs.type === 'pillar') {
      dx = bx - obs.x;
      dy = by - obs.y;
      dist = Math.sqrt(dx * dx + dy * dy);
      danger = obs.radius + radius + 30 + spikeExtra;
    } else {
      const cx = Math.max(obs.x, Math.min(bx, obs.x + obs.w));
      const cy = Math.max(obs.y, Math.min(by, obs.y + obs.h));
      dx = bx - cx;
      dy = by - cy;
      dist = Math.sqrt(dx * dx + dy * dy);
      danger = radius + 30 + spikeExtra;
    }

    if (dist < danger && dist > 0.1) {
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

  const aggressive = bot._aggressive;

  // Aggressive bots have wider detection, faster reactions
  const THREAT_RANGE = aggressive ? 450 : 300;
  const PREY_RANGE = aggressive ? 400 : 250;
  const CHASE_CLOSE_RANGE = aggressive ? 250 : 200;
  const HOOK_PREY_CHANCE = aggressive ? 0.07 : 0.03;
  const HOOK_THREAT_CHANCE = aggressive ? 0.02 : 0.008;
  const HOOK_FOOD_CHANCE = aggressive ? 0.03 : 0.015;
  const SLING_CHANCE = aggressive ? 0.01 : 0.005;
  const SPLIT_CHANCE = aggressive ? 0.05 : 0.02;
  const SPLIT_PREY_RANGE = aggressive ? 220 : 150;

  const keys = { w: false, a: false, s: false, d: false };
  let mouseAngle = bot._botAngle || 0;
  let fire = false;

  // Check for threats (bigger players nearby)
  let threat = null;
  let threatDist = THREAT_RANGE;

  // Check for prey (smaller players nearby)
  let prey = null;
  let preyDist = PREY_RANGE;

  // Aggressive bots also track second-closest prey for multi-target awareness
  let prey2 = null;
  let prey2Dist = PREY_RANGE;

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
      // Shift previous best prey to second slot
      if (prey) { prey2 = prey; prey2Dist = preyDist; }
      prey = p;
      preyDist = dist;
    } else if (bot.mass > p.mass && dist < prey2Dist) {
      prey2 = p;
      prey2Dist = dist;
    }
  }

  // Obstacle avoidance — always active
  const avoid = getObstacleAvoidance(bot.x, bot.y, bot.radius);
  const avoidStrength = Math.sqrt(avoid.x * avoid.x + avoid.y * avoid.y);
  const isStuck = avoidStrength > 0.5;

  // Edge avoidance
  const edgeMargin = aggressive ? 120 : 100;
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
    const avoidAngle = Math.atan2(avoid.y, avoid.x);
    setKeysFromAngle(avoidAngle, keys);
  } else if (threat && !aggressive) {
    // Passive bots flee from bigger players
    const dx = bot.x - threat.x;
    const dy = bot.y - threat.y;
    const fleeAngle = Math.atan2(dy + avoid.y * 2, dx + avoid.x * 2);
    setKeysFromAngle(fleeAngle, keys);
  } else if (threat && aggressive) {
    // Aggressive bots: flee if threat is much bigger, otherwise stand ground or kite
    const massRatio = threat.mass / bot.mass;
    if (massRatio > 1.5 || threatDist < 120) {
      // Real danger — flee
      const dx = bot.x - threat.x;
      const dy = bot.y - threat.y;
      const fleeAngle = Math.atan2(dy + avoid.y * 2, dx + avoid.x * 2);
      setKeysFromAngle(fleeAngle, keys);
    } else {
      // Kite — move perpendicular to threat while hooking for mass steal
      const dx = threat.x - bot.x;
      const dy = threat.y - bot.y;
      const kiteAngle = Math.atan2(dx + avoid.y * 2, -dy + avoid.x * 2); // perpendicular
      setKeysFromAngle(kiteAngle, keys);
      mouseAngle = Math.atan2(dy, dx);

      if (bot.hookState === 'IDLE' && Math.random() < HOOK_THREAT_CHANCE) {
        if (!isPathBlocked(bot.x, bot.y, threat.x, threat.y, 10)) {
          fire = true;
        }
      }
    }
  } else if (prey && preyDist < CHASE_CLOSE_RANGE) {
    // Chase smaller player
    const dx = prey.x - bot.x;
    const dy = prey.y - bot.y;

    // Aggressive bots predict prey movement for interception
    let targetX = prey.x;
    let targetY = prey.y;
    if (aggressive && prey.vx !== undefined) {
      const predTime = preyDist / 600; // rough intercept time
      targetX += (prey.vx || 0) * predTime;
      targetY += (prey.vy || 0) * predTime;
    }

    const chaseDx = targetX - bot.x;
    const chaseDy = targetY - bot.y;
    const angle = Math.atan2(chaseDy + avoid.y * 2, chaseDx + avoid.x * 2);
    mouseAngle = Math.atan2(dy, dx);
    setKeysFromAngle(angle, keys);

    // Hook smaller players to reel them in
    if (preyDist > 60 && preyDist < 350 && bot.hookState === 'IDLE' && Math.random() < HOOK_PREY_CHANCE) {
      if (!isPathBlocked(bot.x, bot.y, prey.x, prey.y, bot.radius)) {
        fire = true;
      }
    }
  } else if (threat && threatDist < 350 && bot.hookState === 'IDLE' && Math.random() < HOOK_THREAT_CHANCE) {
    // Hook bigger player to steal mass
    if (!isPathBlocked(bot.x, bot.y, threat.x, threat.y, 10)) {
      const dx = threat.x - bot.x;
      const dy = threat.y - bot.y;
      mouseAngle = Math.atan2(dy, dx);
      fire = true;
    }
  } else {
    // Check for nearby powerups first
    let nearestPowerup = null;
    let nearestPuDist = aggressive ? 700 : 500;
    if (powerups) {
      for (const pu of powerups) {
        const dx = pu.x - bot.x;
        const dy = pu.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Aggressive bots prioritize bomb and speed powerups
        const priorityBonus = aggressive && (pu.type === 'bomb' || pu.type === 'speed') ? 200 : 0;
        if (dist - priorityBonus < nearestPuDist && !isPathBlocked(bot.x, bot.y, pu.x, pu.y, bot.radius)) {
          nearestPuDist = dist - priorityBonus;
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

    // Seek nearest food
    else {
    let nearestFood = null;
    let nearestFoodDist = Infinity;

    // Aggressive bots scan more food and pick denser clusters
    const scanLimit = aggressive ? 80 : 40;
    let scanned = 0;

    for (const f of food) {
      if (f.dead) continue;
      scanned++;
      if (scanned > scanLimit && nearestFood) break; // perf cap
      const dx = f.x - bot.x;
      const dy = f.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestFoodDist) {
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

      const wobble = Math.sin(Date.now() * 0.002 + bot._botSeed) * 0.3;
      const moveAngle = Math.atan2(
        Math.sin(foodAngle) + avoid.y * 3 + Math.sin(wobble) * 0.3,
        Math.cos(foodAngle) + avoid.x * 3 + Math.cos(wobble) * 0.3
      );
      setKeysFromAngle(moveAngle, keys);

      // Fire hook at food
      if (nearestFoodDist > 100 && nearestFoodDist < 400 && bot.hookState === 'IDLE' && Math.random() < HOOK_FOOD_CHANCE) {
        if (!isPathBlocked(bot.x, bot.y, nearestFood.x, nearestFood.y, 10)) {
          fire = true;
        }
      }

      // Hook to nearby pillars for slingshot movement
      if (bot.hookState === 'IDLE' && Math.random() < SLING_CHANCE) {
        for (const obs of OBSTACLES) {
          if (obs.type !== 'pillar' || obs.spike) continue; // aggressive bots avoid spiked pillars
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
      // Wander
      bot._botWanderTimer = (bot._botWanderTimer || 0) + 1;
      if (bot._botWanderTimer > (aggressive ? 60 : 90)) {
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
    const swingDuration = aggressive ? 20 + Math.random() * 20 : 30 + Math.random() * 30;
    if (bot._botSwingTimer > swingDuration) {
      release = true;
      bot._botSwingTimer = 0;
    }
  } else if (bot.hookState === 'REELING_PLAYER') {
    // Keep reeling
  } else {
    bot._botSwingTimer = 0;
  }

  // Bots split to chase close prey
  let split = false;
  if (bot.splitCooldown <= 0 && bot.cells.length < SPLIT_MAX_CELLS) {
    let largestMass = 0;
    for (const c of bot.cells) {
      if (c.mass > largestMass) largestMass = c.mass;
    }
    if (largestMass >= SPLIT_MIN_MASS * 2) {
      if (prey && preyDist < SPLIT_PREY_RANGE && Math.random() < SPLIT_CHANCE) {
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
