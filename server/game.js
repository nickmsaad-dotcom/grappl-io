import {
  TICK_RATE, SEND_RATE, DT,
  ARENA_WIDTH, ARENA_HEIGHT,
  FOOD_COUNT, FOOD_RADIUS, FOOD_MASS, FOOD_COLORS,
  MASS_ABSORB_RATIO, MASS_DECAY_RATE, MIN_MASS,
  OBSTACLES
} from './constants.js';
import { Player } from './player.js';
import { applyMovement, applyFriction, integrate } from './physics.js';
import { fireHook, releaseHook, updateFlyingHook, updateAnchoredHook, updateReelingPlayer, reelHookedFood, checkFoodPickup } from './hook.js';
import { resolvePlayerCollisions, applySoftBoundary, applyObstacleCollision } from './collision.js';
import { serializeObstacles } from './obstacles.js';
import { Round } from './round.js';
import { getBotName, updateBotInput } from './bot.js';

const MIN_PLAYERS = 10;
let foodIdCounter = 0;

export class Game {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.round = new Round();
    this.food = [];
    this.foodById = new Map();
    this.obstacles = serializeObstacles();
    this.tick = 0;
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

  // --- Food system ---
  createFood() {
    // Retry position if it overlaps an obstacle
    let x, y;
    for (let attempt = 0; attempt < 5; attempt++) {
      x = Math.random() * (ARENA_WIDTH - 40) + 20;
      y = Math.random() * (ARENA_HEIGHT - 40) + 20;
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
      id: foodIdCounter++,
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

  // --- Bot system ---
  fillBots() {
    while (this.players.size < MIN_PLAYERS) {
      const id = this._nextBotId();
      const bot = new Player(id, getBotName());
      bot.isBot = true;
      bot._botSeed = Math.random() * 1000;
      bot._botWanderAngle = Math.random() * Math.PI * 2;
      bot._botWanderTimer = 0;
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
    const player = new Player(id, name);
    this.players.set(id, player);
    if (this.botIds.size > 0 && this.players.size > MIN_PLAYERS) {
      this.removeBots(1);
    }
  }

  removePlayer(id) {
    this.players.delete(id);
    this.botIds.delete(id);
    this.fillBots();
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
  }

  // --- Main game loop ---
  update() {
    this.tick++;

    // Respawn food frequently to keep the map populated
    if (this.tick % 10 === 0) {
      this.fillFood();
    }

    // Update bot AI
    for (const id of this.botIds) {
      const bot = this.players.get(id);
      if (bot) updateBotInput(bot, this.players, this.food);
    }

    for (const player of this.players.values()) {
      if (!player.alive) {
        player.respawnTimer -= DT;
        if (player.respawnTimer <= 0) {
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

      // Movement
      applyMovement(player);

      // Mass decay (keeps big players in check)
      if (player.mass > MIN_MASS) {
        player.mass = Math.max(MIN_MASS, player.mass - player.mass * MASS_DECAY_RATE * DT);
        player.updateRadius();
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

    // Physics
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      applyFriction(player);
      integrate(player);
      applyObstacleCollision(player);
      applySoftBoundary(player);
    }

    // Player eating collisions
    resolvePlayerCollisions(this.players, (eater, victim) => {
      this.eatPlayer(eater, victim);
    });

    // Broadcast state
    if (this.tick % Math.round(TICK_RATE / SEND_RATE) === 0) {
      this.broadcast();
    }
  }

  eatPlayer(eater, victim) {
    victim.alive = false;
    victim.deaths++;
    victim.respawnTimer = 1.0;

    // Transfer mass
    eater.addMass(victim.mass * MASS_ABSORB_RATIO);
    eater.kills++;

    this.round.addKill(eater.name, victim.name);

    // Release victim's hook
    if (victim.hookState !== 'IDLE') {
      releaseHook(victim);
    }
  }

  broadcast() {
    const playerList = [];
    for (const p of this.players.values()) {
      playerList.push(p.serialize());
    }

    // Leaderboard sorted by score (total mass consumed)
    const leaderboard = playerList
      .map(p => ({ name: p.name, score: p.score, color: p.color }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Send full food list every 5th broadcast to save bandwidth
    const sendFood = this.tick % (Math.round(TICK_RATE / SEND_RATE) * 5) === 0;
    const foodList = sendFood
      ? this.food.filter(f => !f.dead).map(f => ({ id: f.id, x: f.x, y: f.y, color: f.color, radius: f.radius }))
      : undefined;

    const snapshot = {
      tick: this.tick,
      players: playerList,
      round: this.round.serialize(),
      leaderboard,
    };
    if (foodList) snapshot.food = foodList;

    this.io.emit('snapshot', snapshot);
  }
}
