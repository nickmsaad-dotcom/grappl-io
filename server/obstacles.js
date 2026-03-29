// Obstacle collision detection utilities

import { OBSTACLES } from './constants.js';

// Check if a circle (x,y,r) collides with any obstacle
// Returns { hit, obstacle, pushX, pushY, contactX, contactY } or null
export function checkCircleObstacleCollision(cx, cy, cr) {
  for (const obs of OBSTACLES) {
    if (obs.type === 'pillar') {
      const dx = cx - obs.x;
      const dy = cy - obs.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = cr + obs.radius;

      if (dist < minDist && dist > 0.01) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        return {
          hit: true,
          obstacle: obs,
          pushX: nx * overlap,
          pushY: ny * overlap,
          contactX: obs.x + nx * obs.radius,
          contactY: obs.y + ny * obs.radius,
        };
      }
    } else if (obs.type === 'wall') {
      // Closest point on rectangle to circle center
      const closestX = Math.max(obs.x, Math.min(cx, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(cy, obs.y + obs.h));

      const dx = cx - closestX;
      const dy = cy - closestY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < cr && dist > 0.01) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = cr - dist;
        return {
          hit: true,
          obstacle: obs,
          pushX: nx * overlap,
          pushY: ny * overlap,
          contactX: closestX,
          contactY: closestY,
        };
      }
    }
  }
  return null;
}

// Check if a point (hook tip) collides with any obstacle
// Returns { hit, obstacle, contactX, contactY } or null
export function checkPointObstacleCollision(px, py) {
  for (const obs of OBSTACLES) {
    if (obs.type === 'pillar') {
      const dx = px - obs.x;
      const dy = py - obs.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < obs.radius) {
        const nx = dist > 0.01 ? dx / dist : 1;
        const ny = dist > 0.01 ? dy / dist : 0;
        return {
          hit: true,
          obstacle: obs,
          contactX: obs.x + nx * obs.radius,
          contactY: obs.y + ny * obs.radius,
        };
      }
    } else if (obs.type === 'wall') {
      if (px >= obs.x && px <= obs.x + obs.w &&
          py >= obs.y && py <= obs.y + obs.h) {
        // Find nearest edge for contact point
        const dLeft = px - obs.x;
        const dRight = (obs.x + obs.w) - px;
        const dTop = py - obs.y;
        const dBottom = (obs.y + obs.h) - py;
        const minD = Math.min(dLeft, dRight, dTop, dBottom);

        let contactX = px;
        let contactY = py;
        if (minD === dLeft) contactX = obs.x;
        else if (minD === dRight) contactX = obs.x + obs.w;
        else if (minD === dTop) contactY = obs.y;
        else contactY = obs.y + obs.h;

        return { hit: true, obstacle: obs, contactX, contactY };
      }
    }
  }
  return null;
}

// Serialized obstacle data for clients (sent once on join)
export function serializeObstacles() {
  return OBSTACLES.map(obs => {
    if (obs.type === 'pillar') {
      const o = { type: 'pillar', x: obs.x, y: obs.y, radius: obs.radius };
      if (obs.spike) o.spike = true;
      return o;
    }
    const o = { type: 'wall', x: obs.x, y: obs.y, w: obs.w, h: obs.h };
    if (obs.spike) o.spike = true;
    return o;
  });
}
