import {
  MIN_PLAYER_RADIUS, MAX_PLAYER_RADIUS, MIN_MASS,
  INVULN_DURATION, NEON_COLORS, SPAWN_POINTS
} from './constants.js';

let colorIndex = 0;

export class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.color = NEON_COLORS[colorIndex % NEON_COLORS.length];
    colorIndex++;

    // Physics state
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    // Size / mass
    this.mass = MIN_MASS;
    this.radius = MIN_PLAYER_RADIUS;

    // Hook state (targets food, terrain, and players)
    this.hookState = 'IDLE'; // IDLE, FLYING, REELING, ANCHORED, REELING_PLAYER
    this.hookX = 0;
    this.hookY = 0;
    this.hookVx = 0;
    this.hookVy = 0;
    this.hookOriginX = 0;
    this.hookOriginY = 0;
    this.hookCooldown = 0;
    this.hookedFood = [];   // IDs of food being pulled
    this.hookedPlayerId = null; // ID of player being reeled in
    this.anchorX = 0;       // Terrain anchor point
    this.anchorY = 0;
    this.ropeLength = 0;    // Distance to anchor when first attached

    // Combat
    this.score = 0;         // Total mass consumed (for leaderboard)
    this.kills = 0;
    this.deaths = 0;
    this.lastAttackerId = null;
    this.lastAttackerTime = 0;
    this.invulnTimer = 0;
    this.alive = true;
    this.respawnTimer = 0;

    // Input
    this.input = { keys: {}, mouseAngle: 0, fire: false, release: false };

    this.spawn();
  }

  updateRadius() {
    const safeMass = Math.max(MIN_MASS, this.mass);
    this.radius = Math.min(
      MAX_PLAYER_RADIUS,
      MIN_PLAYER_RADIUS * Math.sqrt(safeMass)
    );
  }

  addMass(amount) {
    this.mass += amount;
    this.score += amount;
    this.updateRadius();
  }

  spawn() {
    const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    this.x = sp.x + (Math.random() - 0.5) * 80;
    this.y = sp.y + (Math.random() - 0.5) * 80;
    this.vx = 0;
    this.vy = 0;
    this.mass = MIN_MASS;
    this.radius = MIN_PLAYER_RADIUS;
    this.hookState = 'IDLE';
    this.hookedFood = [];
    this.hookedPlayerId = null;
    this.invulnTimer = INVULN_DURATION;
    this.alive = true;
    this.respawnTimer = 0;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      radius: this.radius,
      mass: this.mass,
      hookState: this.hookState,
      hookX: this.hookX,
      hookY: this.hookY,
      anchorX: this.anchorX,
      anchorY: this.anchorY,
      kills: this.kills,
      deaths: this.deaths,
      score: Math.floor(this.score * 10),
      invuln: this.invulnTimer > 0,
      alive: this.alive,
    };
  }
}
