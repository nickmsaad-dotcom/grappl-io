// Client-side movement prediction for the local player
// Mirrors server physics (movement, friction, speed cap, boundary)
// Does NOT predict: hooks, eating, collisions, powerups

import {
  ARENA_WIDTH, ARENA_HEIGHT,
  BASE_SPEED, SIZE_SPEED_FACTOR, BASE_ACCEL, FRICTION, POWERUP_SPEED_MULT
} from './constants.js';

// Predicted local player state
let predicted = null;
let inputHistory = []; // { seq, keys, mouseAngle, dt }
let inputSeq = 0;

// Visual smoothing — absorbs reconciliation corrections over several frames
let smoothX = null;
let smoothY = null;
const SMOOTH_FACTOR = 15; // Higher = snappier, lower = smoother corrections

export function getInputSeq() {
  return ++inputSeq;
}

export function storeInput(seq, keys, mouseAngle, dt) {
  inputHistory.push({ seq, keys, mouseAngle, dt });
  if (inputHistory.length > 120) inputHistory.shift();
}

// Apply one frame of movement physics (mirrors server/physics.js)
function applyMovement(p, keys, dt) {
  let ax = 0, ay = 0;
  if (keys.w || keys.ArrowUp) ay -= 1;
  if (keys.s || keys.ArrowDown) ay += 1;
  if (keys.a || keys.ArrowLeft) ax -= 1;
  if (keys.d || keys.ArrowRight) ax += 1;

  if (ax !== 0 && ay !== 0) {
    const len = Math.sqrt(ax * ax + ay * ay);
    ax /= len; ay /= len;
  }

  if (ax !== 0 && ((ax > 0 && p.vx < 0) || (ax < 0 && p.vx > 0))) p.vx *= 0.7;
  if (ay !== 0 && ((ay > 0 && p.vy < 0) || (ay < 0 && p.vy > 0))) p.vy *= 0.7;

  if (ax === 0 && ay === 0) { p.vx *= 0.88; p.vy *= 0.88; }

  const sizeScale = 1 / (1 + (p.mass - 1) * SIZE_SPEED_FACTOR);
  const speedBuff = p.effects && p.effects.speed ? POWERUP_SPEED_MULT : 1;
  const accel = BASE_ACCEL * sizeScale * speedBuff;

  p.vx += ax * accel * dt;
  p.vy += ay * accel * dt;
}

function applyFriction(p) {
  const friction = p.hookState === 'ANCHORED' ? 0.96 : FRICTION;
  p.vx *= friction;
  p.vy *= friction;

  const sizeScale = 1 / (1 + (p.mass - 1) * SIZE_SPEED_FACTOR);
  const swingBonus = p.hookState === 'ANCHORED' ? 1.8 : 1;
  const speedBuff = p.effects && p.effects.speed ? POWERUP_SPEED_MULT : 1;
  const maxSpeed = BASE_SPEED * sizeScale * swingBonus * speedBuff;

  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > maxSpeed && speed > 0.01) {
    p.vx = (p.vx / speed) * maxSpeed;
    p.vy = (p.vy / speed) * maxSpeed;
  }

  if (Math.abs(p.vx) < 2) p.vx = 0;
  if (Math.abs(p.vy) < 2) p.vy = 0;
}

function applyBoundary(p) {
  const r = p.radius;
  if (p.x - r < 0) { p.x = r; p.vx = Math.abs(p.vx) * 0.5; }
  if (p.x + r > ARENA_WIDTH) { p.x = ARENA_WIDTH - r; p.vx = -Math.abs(p.vx) * 0.5; }
  if (p.y - r < 0) { p.y = r; p.vy = Math.abs(p.vy) * 0.5; }
  if (p.y + r > ARENA_HEIGHT) { p.y = ARENA_HEIGHT - r; p.vy = -Math.abs(p.vy) * 0.5; }
}

function simulateStep(p, input) {
  applyMovement(p, input.keys, input.dt);
  applyFriction(p);
  p.x += p.vx * input.dt;
  p.y += p.vy * input.dt;
  applyBoundary(p);
}

export function getPredictedPlayer(serverPlayer) {
  if (!serverPlayer || !serverPlayer.alive) {
    predicted = null;
    smoothX = null;
    smoothY = null;
    return serverPlayer;
  }

  const lastSeq = serverPlayer.lastSeq || 0;

  // Reconcile: start from server state, replay unacknowledged inputs
  predicted = {
    x: serverPlayer.x,
    y: serverPlayer.y,
    vx: serverPlayer.vx || 0,
    vy: serverPlayer.vy || 0,
    mass: serverPlayer.mass,
    radius: serverPlayer.radius,
    hookState: serverPlayer.hookState,
    effects: serverPlayer.effects,
  };

  // Remove acknowledged inputs
  inputHistory = inputHistory.filter(inp => inp.seq > lastSeq);

  // Replay remaining inputs
  for (const inp of inputHistory) {
    simulateStep(predicted, inp);
  }

  // Visual smoothing: lerp from previous rendered position toward reconciled position
  // This absorbs small server corrections over a few frames instead of snapping
  if (smoothX === null) {
    smoothX = predicted.x;
    smoothY = predicted.y;
  } else {
    const dt = 0.016; // approximate frame time
    const t = 1 - Math.exp(-SMOOTH_FACTOR * dt);
    smoothX += (predicted.x - smoothX) * t;
    smoothY += (predicted.y - smoothY) * t;

    // If the error is very large (teleport, respawn), snap immediately
    const dx = predicted.x - smoothX;
    const dy = predicted.y - smoothY;
    if (dx * dx + dy * dy > 2500) { // > 50px error
      smoothX = predicted.x;
      smoothY = predicted.y;
    }
  }

  return {
    ...serverPlayer,
    x: smoothX,
    y: smoothY,
    vx: predicted.vx,
    vy: predicted.vy,
  };
}
