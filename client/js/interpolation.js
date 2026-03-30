// Snapshot interpolation: buffer two snapshots and lerp between them

import { getSnapshots, getMyId } from './net.js';

const INTERP_DELAY = 25; // ms behind latest snapshot (60Hz broadcast)

// Reusable Maps to avoid per-frame allocation
const _prevPlayerMap = new Map();
const _prevCellMap = new Map();

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
  // Match cells by ID using Map for O(1) lookup instead of O(n) find
  let cells;
  if (b.cells) {
    _prevCellMap.clear();
    if (a.cells) {
      for (let i = 0; i < a.cells.length; i++) {
        _prevCellMap.set(a.cells[i].id, a.cells[i]);
      }
    }
    cells = [];
    for (let i = 0; i < b.cells.length; i++) {
      const bc = b.cells[i];
      const ac = _prevCellMap.get(bc.id);
      if (!ac) {
        cells.push(bc);
      } else {
        cells.push(lerpCell(ac, bc, t));
      }
    }
  } else {
    cells = [];
  }

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

  // Build prev player Map for O(1) lookup instead of O(n) find
  _prevPlayerMap.clear();
  for (let i = 0; i < prev.players.length; i++) {
    _prevPlayerMap.set(prev.players[i].id, prev.players[i]);
  }

  const interpolatedPlayers = [];
  for (let i = 0; i < next.players.length; i++) {
    const nextPlayer = next.players[i];
    const prevPlayer = _prevPlayerMap.get(nextPlayer.id);

    if (!prevPlayer || nextPlayer.id === myId) {
      interpolatedPlayers.push(nextPlayer);
    } else {
      interpolatedPlayers.push(lerpPlayer(prevPlayer, nextPlayer, t));
    }
  }

  return {
    ...next,
    players: interpolatedPlayers,
  };
}
