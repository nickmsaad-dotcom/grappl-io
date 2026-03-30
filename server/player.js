import {
  MIN_PLAYER_RADIUS, MAX_PLAYER_RADIUS, MIN_MASS,
  INVULN_DURATION, NEON_COLORS, SPAWN_POINTS, CELL_MIN_MASS
} from './constants.js';

let colorIndex = 0;
let cellIdCounter = 0;

export function nextCellId() {
  return cellIdCounter++;
}

export class Player {
  constructor(id, name, spawnPoint) {
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
    this.hookedOwnCells = []; // References to own cells being reeled in
    this.anchorX = 0;       // Terrain anchor point
    this.anchorY = 0;
    this.ropeLength = 0;    // Distance to anchor when first attached

    // Cells (multi-body split mechanic)
    this.cells = [];
    this.splitCooldown = 0;

    // Combat
    this.score = 0;         // Total mass consumed (for leaderboard)
    this.peakMass = 0;      // Highest total mass reached this life
    this.kills = 0;
    this.deaths = 0;
    this.lastAttackerId = null;
    this.lastAttackerTime = 0;
    this.invulnTimer = 0;
    this.alive = true;
    this.respawnTimer = 0;

    // Kill streaks
    this.killStreak = 0;

    // Active power-up effects (timers in seconds, 0 = inactive)
    this.effects = { speed: 0, shield: 0, magnet: 0, bomb: 0 };

    // Client-side prediction
    this.lastSeq = 0;

    // Input
    this.input = { keys: {}, mouseAngle: 0, fire: false, release: false, split: false };

    this.spawn(spawnPoint);
  }

  static radiusFromMass(mass) {
    return Math.min(MAX_PLAYER_RADIUS, MIN_PLAYER_RADIUS * Math.sqrt(Math.max(CELL_MIN_MASS, mass)));
  }

  updateRadius() {
    const safeMass = Math.max(MIN_MASS, this.mass);
    this.radius = Math.min(
      MAX_PLAYER_RADIUS,
      MIN_PLAYER_RADIUS * Math.sqrt(safeMass)
    );
  }

  addMass(amount) {
    this.score += amount;
    // Add to largest cell
    if (this.cells.length > 0) {
      let largest = this.cells[0];
      for (let i = 1; i < this.cells.length; i++) {
        if (this.cells[i].mass > largest.mass) largest = this.cells[i];
      }
      largest.mass += amount;
      largest.radius = Player.radiusFromMass(largest.mass);
    } else {
      this.mass += amount;
    }
    this.updateFromCells();
  }

  updateFromCells() {
    if (this.cells.length === 0) return;
    // Sync player-level fields from cells
    let largest = this.cells[0];
    let totalMass = 0;
    for (const c of this.cells) {
      totalMass += c.mass;
      if (c.mass > largest.mass) largest = c;
    }
    this.x = largest.x;
    this.y = largest.y;
    this.vx = largest.vx;
    this.vy = largest.vy;
    this.mass = totalMass;
    this.radius = largest.radius;
    if (totalMass > this.peakMass) this.peakMass = totalMass;
  }

  spawn(spawnPoint) {
    const sp = spawnPoint || SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    const sx = sp.x + (Math.random() - 0.5) * 80;
    const sy = sp.y + (Math.random() - 0.5) * 80;
    this.x = sx;
    this.y = sy;
    this.vx = 0;
    this.vy = 0;
    this.mass = MIN_MASS;
    this.radius = MIN_PLAYER_RADIUS;
    this.cells = [{
      id: nextCellId(),
      x: sx, y: sy, vx: 0, vy: 0,
      mass: MIN_MASS,
      radius: MIN_PLAYER_RADIUS,
      mergeTimer: 0,
    }];
    this.splitCooldown = 0;
    this.hookState = 'IDLE';
    this.hookedFood = [];
    this.hookedPlayerId = null;
    this.hookedOwnCells = [];
    this.invulnTimer = INVULN_DURATION;
    this.alive = true;
    this.respawnTimer = 0;
    this.killStreak = 0;
    this.kills = 0;
    this.score = 0;
    this.peakMass = MIN_MASS;
    this.effects = { speed: 0, shield: 0, magnet: 0, bomb: 0 };
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      x: Math.round(this.x),
      y: Math.round(this.y),
      vx: Math.round(this.vx),
      vy: Math.round(this.vy),
      radius: Math.round(this.radius * 10) / 10,
      mass: Math.round(this.mass * 100) / 100,
      hookState: this.hookState,
      hookX: Math.round(this.hookX),
      hookY: Math.round(this.hookY),
      anchorX: Math.round(this.anchorX),
      anchorY: Math.round(this.anchorY),
      kills: this.kills,
      deaths: this.deaths,
      score: Math.floor(this.score * 10),
      displayMass: Math.floor(this.mass * 10),
      invuln: this.invulnTimer > 0,
      alive: this.alive,
      lastSeq: this.lastSeq,
      killStreak: this.killStreak,
      cells: this.cells.map(c => ({
        id: c.id,
        x: Math.round(c.x),
        y: Math.round(c.y),
        vx: Math.round(c.vx),
        vy: Math.round(c.vy),
        radius: Math.round(c.radius * 10) / 10,
        mass: Math.round(c.mass * 100) / 100,
        mergeTimer: Math.round(c.mergeTimer * 10) / 10,
      })),
      effects: {
        speed: this.effects.speed > 0,
        shield: this.effects.shield > 0,
        magnet: this.effects.magnet > 0,
        bomb: this.effects.bomb > 0,
      },
    };
  }
}
