// Snapshot interpolation: buffer two snapshots and lerp between them

import { getSnapshots, getMyId } from './net.js';

const INTERP_DELAY = 25; // ms behind latest snapshot (60Hz broadcast)

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpCell(a, b, t) {
  return {
    id: b.id,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
    radius: lerp(a.radius, b.radius, t),
    mass: lerp(a.mass, b.mass, t),
    mergeTimer: b.mergeTimer,
  };
}

function lerpPlayer(a, b, t) {
  // Match cells by ID for stable interpolation across splits/merges
  const cells = b.cells ? b.cells.map((bc) => {
    const ac = a.cells && a.cells.find(c => c.id === bc.id);
    if (!ac) return bc; // New cell from split — no lerp
    return lerpCell(ac, bc, t);
  }) : [];

  // Only lerp hook position if hook state is the same in both frames
  const sameHook = a.hookState === b.hookState;

  return {
    ...b,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
    radius: lerp(a.radius, b.radius, t),
    hookX: sameHook ? lerp(a.hookX, b.hookX, t) : b.hookX,
    hookY: sameHook ? lerp(a.hookY, b.hookY, t) : b.hookY,
    anchorX: b.anchorX,
    anchorY: b.anchorY,
    cells,
  };
}

export function getInterpolatedState() {
  const snapshots = getSnapshots();
  if (snapshots.length === 0) return null;

  if (snapshots.length === 1) {
    return snapshots[0];
  }

  const now = performance.now();
  const renderTime = now - INTERP_DELAY;

  let prev = snapshots[0];
  let next = snapshots[1];

  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i].receivedAt >= renderTime) {
      next = snapshots[i];
      prev = snapshots[i - 1];
      break;
    }
    prev = snapshots[i];
    next = snapshots[i];
  }

  if (renderTime >= next.receivedAt) {
    return next;
  }

  const range = next.receivedAt - prev.receivedAt;
  const t = range > 0 ? Math.max(0, Math.min(1, (renderTime - prev.receivedAt) / range)) : 1;

  const myId = getMyId();
  const interpolatedPlayers = next.players.map((nextPlayer) => {
    const prevPlayer = prev.players.find(p => p.id === nextPlayer.id);
    if (!prevPlayer) return nextPlayer;

    // Local player uses latest server state (camera smoothing handles feel)
    if (nextPlayer.id === myId) {
      return nextPlayer;
    }

    return lerpPlayer(prevPlayer, nextPlayer, t);
  });

  return {
    ...next,
    players: interpolatedPlayers,
  };
}
