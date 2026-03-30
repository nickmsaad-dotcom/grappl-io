import {
  TICK_RATE, SEND_RATE, DT,
  ARENA_WIDTH, ARENA_HEIGHT,
  FOOD_COUNT, FOOD_RADIUS, FOOD_MASS, FOOD_COLORS,
  MASS_ABSORB_RATIO, MASS_DECAY_RATE, MIN_MASS,
  OBSTACLES, SPAWN_POINTS,
  SPLIT_MIN_MASS, SPLIT_MAX_CELLS, SPLIT_LAUNCH_SPEED, SPLIT_COOLDOWN,
  MERGE_COOLDOWN, MERGE_DRIFT_SPEED, SELF_PUSH_STRENGTH, CELL_MIN_MASS,
  POWERUP_SPAWN_INTERVAL, POWERUP_MAX_ON_MAP, POWERUP_DESPAWN_TIME,
  POWERUP_RADIUS, POWERUP_TYPES, POWERUP_SPEED_MULT,
  POWERUP_MAGNET_RANGE, POWERUP_MAGNET_PULL,
  POWERUP_BOMB_RANGE, POWERUP_BOMB_STEAL
} from './constants.js';
import { Player, nextCellId } from './player.js';
import { applyMovement, applyFriction, integrate } from './physics.js';
// Player is also used for Player.radiusFromMass in eatCell/splitPlayer
import { fireHook, releaseHook, updateFlyingHook, updateAnchoredHook, updateReelingPlayer, reelHookedFood, checkFoodPickup } from './hook.js';
import { resolvePlayerCollisions, applySoftBoundary, applyObstacleCollision } from './collision.js';
import { serializeObstacles, checkCircleObstacleCollision } from './obstacles.js';
import { Round } from './round.js';
import { getBotName, initBotPersonality, updateBotInput } from './bot.js';
import { cleanName } from './profanity.js';
import { submitPlayerStats } from './leaderboard.js';

const MIN_PLAYERS = 16;

export class Game {
  constructor(io, roomKey) {
    this.io = io;
    this.roomKey = roomKey;
    this.players = new Map();
    this.round = new Round();
    this.food = [];
    this.foodById = new Map();
    this.foodIdCounter = 0;
    this.obstacles = serializeObstacles();
    this.powerups = [];
    this.powerupIdCounter = 0;
    this.powerupSpawnTimer = POWERUP_SPAWN_INTERVAL * 0.5; // First spawn sooner
    this.tick = 0;
    this._forceFoodBroadcast = true; // Send full food on next broadcast
    this.botIds = new Set();
    let botCounter = 0;
    this._nextBotId = () => `bot_${botCounter++}`;

    // Spawn initial food
    this.fillFood();

    // Fill with bots
    this.fillBots();

    // Start game loop
    this.interval = setInterval(() => this.update(), 1000 / TICK_RATE);
  }

  destroy() {
    clearInterval(this.interval);
  }

  get humanCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (!p.isBot) count++;
    }
    return count;
  }

  // --- Food system ---
  createFood() {
    // Retry position if it overlaps an obstacle
    let x, y;
    for (let attempt = 0; attempt < 5; attempt++) {
      // 30% of food spawns near spawn points for better early game
      if (Math.random() < 0.3) {
        const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        x = sp.x + (Math.random() - 0.5) * 800;
        y = sp.y + (Math.random() - 0.5) * 800;
        x = Math.max(20, Math.min(ARENA_WIDTH - 20, x));
        y = Math.max(20, Math.min(ARENA_HEIGHT - 20, y));
      } else {
        x = Math.random() * (ARENA_WIDTH - 40) + 20;
        y = Math.random() * (ARENA_HEIGHT - 40) + 20;
      }
      let blocked = false;
      for (const obs of OBSTACLES) {
        if (obs.type === 'pillar') {
          const dx = x - obs.x;
          const dy = y - obs.y;
          if (dx * dx + dy * dy < (obs.radius + FOOD_RADIUS + 5) ** 2) {
            blocked = true;
            break;
          }
        } else if (obs.type === 'wall') {
          if (x > obs.x - FOOD_RADIUS && x < obs.x + obs.w + FOOD_RADIUS &&
              y > obs.y - FOOD_RADIUS && y < obs.y + obs.h + FOOD_RADIUS) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) break;
    }
    return {
      id: this.foodIdCounter++,
      x, y,
      radius: FOOD_RADIUS,
      mass: FOOD_MASS,
      color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
      dead: false,
    };
  }

  fillFood() {
    // Clean dead food first, then fill
    this.food = this.food.filter(f => !f.dead);
    this.foodById.clear();
    for (const f of this.food) this.foodById.set(f.id, f);
    while (this.food.length < FOOD_COUNT) {
      const f = this.createFood();
      this.food.push(f);
      this.foodById.set(f.id, f);
    }
  }

  // --- Power-up system ---
  spawnPowerup() {
    if (this.powerups.length >= POWERUP_MAX_ON_MAP) return;
    const typeInfo = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    // Find valid position (not inside obstacles)
    let x, y;
    for (let attempt = 0; attempt < 10; attempt++) {
      x = Math.random() * (ARENA_WIDTH - 200) + 100;
      y = Math.random() * (ARENA_HEIGHT - 200) + 100;
      let blocked = false;
      for (const obs of OBSTACLES) {
        if (obs.type === 'pillar') {
          const dx = x - obs.x, dy = y - obs.y;
          if (dx * dx + dy * dy < (obs.radius + POWERUP_RADIUS + 20) ** 2) { blocked = true; break; }
        } else {
          if (x > obs.x - 20 && x < obs.x + obs.w + 20 && y > obs.y - 20 && y < obs.y + obs.h + 20) { blocked = true; break; }
        }
      }
      if (!blocked) break;
    }
    this.powerups.push({
      id: this.powerupIdCounter++,
      x, y,
      type: typeInfo.type,
      color: typeInfo.color,
      duration: typeInfo.duration,
      label: typeInfo.label,
      timeLeft: POWERUP_DESPAWN_TIME,
    });
  }

  updatePowerups() {
    // Despawn timer
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      this.powerups[i].timeLeft -= DT;
      if (this.powerups[i].timeLeft <= 0) {
        this.powerups.splice(i, 1);
      }
    }

    // Spawn timer
    this.powerupSpawnTimer -= DT;
    if (this.powerupSpawnTimer <= 0) {
      this.spawnPowerup();
      this.powerupSpawnTimer = POWERUP_SPAWN_INTERVAL;
    }

    // Collection check — any cell can pick up powerups
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const pu = this.powerups[i];
        let collected = false;
        for (const cell of player.cells) {
          const dx = cell.x - pu.x;
          const dy = cell.y - pu.y;
          if (dx * dx + dy * dy < (cell.radius + POWERUP_RADIUS) ** 2) {
            collected = true;
            break;
          }
        }
        if (collected) {
          this.collectPowerup(player, pu);
          this.powerups.splice(i, 1);
        }
      }
    }

    // Tick player effects
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (player.effects.speed > 0) player.effects.speed -= DT;
      if (player.effects.shield > 0) player.effects.shield -= DT;
      if (player.effects.bomb > 0) player.effects.bomb -= DT;
      if (player.effects.magnet > 0) {
        player.effects.magnet -= DT;
        // Pull nearby food toward each cell
        for (const cell of player.cells) {
          for (const f of this.food) {
            if (f.dead) continue;
            const dx = cell.x - f.x;
            const dy = cell.y - f.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < POWERUP_MAGNET_RANGE && dist > 1) {
              f.x += (dx / dist) * POWERUP_MAGNET_PULL * DT;
              f.y += (dy / dist) * POWERUP_MAGNET_PULL * DT;
            }
          }
        }
      }
    }
  }

  collectPowerup(player, pu) {
    if (pu.type === 'speed') {
      player.effects.speed = pu.duration;
    } else if (pu.type === 'shield') {
      player.effects.shield = pu.duration;
    } else if (pu.type === 'magnet') {
      player.effects.magnet = pu.duration;
    } else if (pu.type === 'bomb') {
      // Instant: steal 30% mass from nearby players (per-cell range check)
      player.effects.bomb = 3; // Display label for 3 seconds
      const bombR2 = POWERUP_BOMB_RANGE ** 2;
      for (const other of this.players.values()) {
        if (other.id === player.id || !other.alive) continue;
        let totalStolen = 0;
        for (const cell of other.cells) {
          // Check each cell individually against each of our cells
          let inRange = false;
          for (const myCell of player.cells) {
            const dx = myCell.x - cell.x;
            const dy = myCell.y - cell.y;
            if (dx * dx + dy * dy < bombR2) { inRange = true; break; }
          }
          if (inRange) {
            const before = cell.mass;
            cell.mass = Math.max(CELL_MIN_MASS, cell.mass - cell.mass * POWERUP_BOMB_STEAL);
            cell.radius = Player.radiusFromMass(cell.mass);
            totalStolen += before - cell.mass;
          }
        }
        if (totalStolen > 0) {
          other.updateFromCells();
          player.addMass(totalStolen);
        }
      }
    }
  }

  // --- Bot system ---
  fillBots() {
    while (this.players.size < MIN_PLAYERS) {
      const id = this._nextBotId();
      const bot = new Player(id, getBotName());
      bot.isBot = true;
      bot._botSeed = Math.random() * 1000;
      bot._botWanderAngle = Math.random() * Math.PI * 2;
      bot._botWanderTimer = 0;
      initBotPersonality(bot);
      this.players.set(id, bot);
      this.botIds.add(id);
    }
  }

  removeBots(count) {
    const toRemove = [...this.botIds].slice(0, count);
    for (const id of toRemove) {
      this.players.delete(id);
      this.botIds.delete(id);
    }
  }

  // --- Player lifecycle ---
  addPlayer(id, name) {
    const player = new Player(id, cleanName(name));
    this.players.set(id, player);
    this._forceFoodBroadcast = true; // Send full food to new player
    // Replace a bot when a human joins (keep total at MIN_PLAYERS)
    if (this.botIds.size > 0 && this.players.size > MIN_PLAYERS) {
      this.removeBots(1);
    }
  }

  get maxHumansReached() {
    return this.humanCount >= 6;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (player && !player.isBot) {
      submitPlayerStats(player.name, player.kills, player.peakMass);
    }
    this.players.delete(id);
    this.botIds.delete(id);
    this.fillBots();
  }

  respawnPlayer(id, newName) {
    const player = this.players.get(id);
    if (!player || player.alive) return;
    // Submit stats before reset (spawn resets kills/score/peakMass)
    if (!player.isBot) {
      submitPlayerStats(player.name, player.kills, player.peakMass);
    }
    if (newName && typeof newName === 'string') {
      player.name = cleanName(newName.slice(0, 16)) || player.name;
    }
    player.spawn();
  }

  handleInput(id, data) {
    const player = this.players.get(id);
    if (!player || !player.alive || typeof data !== 'object' || data === null) return;

    const keys = data.keys;
    if (keys && typeof keys === 'object') {
      player.input.keys = {
        w: !!keys.w, a: !!keys.a, s: !!keys.s, d: !!keys.d,
        ArrowUp: !!keys.ArrowUp, ArrowDown: !!keys.ArrowDown,
        ArrowLeft: !!keys.ArrowLeft, ArrowRight: !!keys.ArrowRight,
      };
    }
    const angle = Number(data.mouseAngle);
    player.input.mouseAngle = Number.isFinite(angle) ? angle : 0;

    if (data.fire) player.input.fire = true;
    if (data.release) player.input.release = true;
    if (data.split) player.input.split = true;

    // Track input seq for client-side prediction reconciliation
    const seq = Number(data.seq);
    if (Number.isFinite(seq)) player.lastSeq = seq;
  }

  // --- Main game loop ---
  update() {
    this.tick++;

    // Respawn food frequently to keep the map populated
    if (this.tick % 3 === 0) {
      this.fillFood();
    }

    // Update bot AI
    for (const id of this.botIds) {
      const bot = this.players.get(id);
      if (bot) updateBotInput(bot, this.players, this.food, this.powerups);
    }

    for (const player of this.players.values()) {
      if (!player.alive) {
        player.respawnTimer -= DT;
        // Only auto-respawn bots; human players wait for input
        if (player.respawnTimer <= 0 && player.isBot) {
          player.spawn();
        }
        continue;
      }

      // Process hook input
      if (player.input.fire) {
        fireHook(player);
        player.input.fire = false;
      }
      if (player.input.release) {
        if (player.hookState !== 'IDLE') {
          releaseHook(player);
        }
        player.input.release = false;
      }

      // Split
      if (player.input.split) {
        this.splitPlayer(player);
        player.input.split = false;
      }

      // Movement (per cell)
      applyMovement(player);

      // Mass decay per cell
      for (let ci = player.cells.length - 1; ci >= 0; ci--) {
        const cell = player.cells[ci];
        if (cell.mass > CELL_MIN_MASS) {
          cell.mass = Math.max(CELL_MIN_MASS, cell.mass - cell.mass * MASS_DECAY_RATE * DT);
          cell.radius = Player.radiusFromMass(cell.mass);
        }
        // Remove decayed min-mass cells (keep at least one)
        if (cell.mass <= CELL_MIN_MASS && player.cells.length > 1) {
          player.cells.splice(ci, 1);
        }
      }
    }

    // Hook updates
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      updateFlyingHook(player, this.food, this.players);
      updateAnchoredHook(player);
      updateReelingPlayer(player, this.players);
      reelHookedFood(player, this.foodById);
      checkFoodPickup(player, this.food);
    }

    // Physics (per cell)
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      applyFriction(player);
      integrate(player);
      applyObstacleCollision(player);
      applySoftBoundary(player);

      // Check if all cells destroyed by spikes
      if (player.cells.length === 0) {
        player.alive = false;
        player.deaths++;
        player.respawnTimer = 1.0;
        if (!player.isBot) submitPlayerStats(player.name, player.kills, player.peakMass);
        if (player.hookState !== 'IDLE') releaseHook(player);
        continue;
      }
    }

    // Self-cell collisions (push apart / merge)
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      this.resolveSelfCellCollisions(player);
      player.updateFromCells();
    }

    // Power-ups (spawn, collect, tick effects)
    this.updatePowerups();

    // Player eating collisions (cell-vs-cell)
    resolvePlayerCollisions(this.players, (eaterPlayer, eaterCell, victimPlayer, victimCell) => {
      this.eatCell(eaterPlayer, eaterCell, victimPlayer, victimCell);
    });

    // Broadcast state
    if (this.tick % Math.round(TICK_RATE / SEND_RATE) === 0) {
      this.broadcast();
    }
  }

  splitPlayer(player) {
    if (player.cells.length >= SPLIT_MAX_CELLS) return;
    if (player.splitCooldown > 0) return;

    // Find largest cell that can split
    let largest = null;
    for (const cell of player.cells) {
      if (cell.mass >= SPLIT_MIN_MASS * 2) {
        if (!largest || cell.mass > largest.mass) largest = cell;
      }
    }
    if (!largest) return;

    const halfMass = largest.mass / 2;
    largest.mass = halfMass;
    largest.radius = Player.radiusFromMass(halfMass);

    const angle = player.input.mouseAngle;
    let spawnX = largest.x + Math.cos(angle) * largest.radius;
    let spawnY = largest.y + Math.sin(angle) * largest.radius;

    // Push spawn position out of obstacles
    const spawnRadius = Player.radiusFromMass(halfMass);
    const obsHit = checkCircleObstacleCollision(spawnX, spawnY, spawnRadius);
    if (obsHit) {
      spawnX += obsHit.pushX;
      spawnY += obsHit.pushY;
    }

    const newCell = {
      id: nextCellId(),
      x: spawnX,
      y: spawnY,
      vx: largest.vx + Math.cos(angle) * SPLIT_LAUNCH_SPEED,
      vy: largest.vy + Math.sin(angle) * SPLIT_LAUNCH_SPEED,
      mass: halfMass,
      radius: spawnRadius,
      mergeTimer: MERGE_COOLDOWN,
    };

    player.cells.push(newCell);
    player.splitCooldown = SPLIT_COOLDOWN;
    player.updateFromCells();
  }

  resolveSelfCellCollisions(player) {
    const cells = player.cells;
    let i = 0;
    while (i < cells.length) {
      let merged = false;
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) continue;

        const touchDist = a.radius + b.radius;

        if (a.mergeTimer <= 0 && b.mergeTimer <= 0) {
          // Both merge-ready: drift together
          const nx = dx / dist;
          const ny = dy / dist;
          a.vx += nx * MERGE_DRIFT_SPEED * DT;
          a.vy += ny * MERGE_DRIFT_SPEED * DT;
          b.vx -= nx * MERGE_DRIFT_SPEED * DT;
          b.vy -= ny * MERGE_DRIFT_SPEED * DT;

          // Merge on overlap
          if (dist < touchDist * 0.5) {
            // Absorb smaller into larger
            if (a.mass >= b.mass) {
              a.mass += b.mass;
              a.radius = Player.radiusFromMass(a.mass);
              cells.splice(j, 1);
              j--;
            } else {
              b.mass += a.mass;
              b.radius = Player.radiusFromMass(b.mass);
              cells.splice(i, 1);
              merged = true; // cell i was removed; don't increment i
              break;
            }
          }
        } else if (dist < touchDist) {
          // Push apart (not merge-ready)
          const overlap = touchDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
          a.vx -= nx * SELF_PUSH_STRENGTH * DT;
          a.vy -= ny * SELF_PUSH_STRENGTH * DT;
          b.vx += nx * SELF_PUSH_STRENGTH * DT;
          b.vy += ny * SELF_PUSH_STRENGTH * DT;
        }
      }
      if (!merged) i++;
    }
  }

  eatCell(eaterPlayer, eaterCell, victimPlayer, victimCell) {
    // Remove victim cell — guard against double-eat
    const idx = victimPlayer.cells.indexOf(victimCell);
    if (idx === -1) return;
    victimPlayer.cells.splice(idx, 1);

    // Transfer mass to eater cell
    const gained = victimCell.mass * MASS_ABSORB_RATIO;
    eaterCell.mass += gained;
    eaterCell.radius = Player.radiusFromMass(eaterCell.mass);
    eaterPlayer.score += gained;

    // If victim has no cells left → death
    if (victimPlayer.cells.length === 0) {
      victimPlayer.alive = false;
      victimPlayer.deaths++;
      victimPlayer.respawnTimer = 1.0;

      eaterPlayer.kills++;
      eaterPlayer.killStreak++;
      this.round.addKill(eaterPlayer.name, victimPlayer.name);

      // Submit both players' stats to all-time leaderboard (skip bots)
      if (!victimPlayer.isBot) {
        submitPlayerStats(victimPlayer.name, victimPlayer.kills, victimPlayer.peakMass);
      }
      if (!eaterPlayer.isBot) {
        submitPlayerStats(eaterPlayer.name, eaterPlayer.kills, eaterPlayer.peakMass);
      }

      if (victimPlayer.hookState !== 'IDLE') {
        releaseHook(victimPlayer);
      }
    }

    eaterPlayer.updateFromCells();
    victimPlayer.updateFromCells();
  }

  broadcast() {
    const playerList = [];
    for (const p of this.players.values()) {
      playerList.push(p.serialize());
    }

    // Leaderboard sorted by current size (displayMass)
    const leaderboard = playerList
      .map(p => ({ id: p.id, name: p.name, score: p.displayMass, color: p.color }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Send full food list every 5th broadcast or when forced (new player joined)
    const sendFood = this._forceFoodBroadcast || this.tick % (Math.round(TICK_RATE / SEND_RATE) * 5) === 0;
    this._forceFoodBroadcast = false;
    const foodList = sendFood
      ? this.food.filter(f => !f.dead).map(f => ({ id: f.id, x: f.x, y: f.y, color: f.color, radius: f.radius }))
      : undefined;

    const powerupList = this.powerups.map(pu => ({
      id: pu.id, x: pu.x, y: pu.y, type: pu.type, color: pu.color, label: pu.label,
    }));

    const snapshot = {
      tick: this.tick,
      players: playerList,
      round: this.round.serialize(),
      leaderboard,
      powerups: powerupList,
    };
    if (foodList) snapshot.food = foodList;

    this.io.to(this.roomKey).emit('snapshot', snapshot);
  }
}
