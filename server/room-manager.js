import { Game } from './game.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O (avoid confusion with 1/0)
const KEY_LENGTH = 6;
const CLEANUP_INTERVAL = 60000; // 60s
const EMPTY_ROOM_TTL = 120000; // 2 minutes

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // key → { game, createdAt, lastHumanAt }

    // Periodic cleanup of empty rooms
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  generateKey() {
    let key;
    do {
      key = '';
      for (let i = 0; i < KEY_LENGTH; i++) {
        key += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      }
    } while (this.rooms.has(key));
    return key;
  }

  createRoom(key) {
    if (!key) key = this.generateKey();
    key = key.toUpperCase();
    if (this.rooms.has(key)) return key; // Already exists

    const game = new Game(this.io, key);
    this.rooms.set(key, {
      game,
      createdAt: Date.now(),
      lastHumanAt: Date.now(),
    });
    console.log(`Room created: ${key}`);
    return key;
  }

  getRoom(key) {
    return this.rooms.get(key) || null;
  }

  getOrCreateRoom(key) {
    key = key.toUpperCase();
    if (!this.rooms.has(key)) {
      this.createRoom(key);
    }
    return this.rooms.get(key);
  }

  removeRoom(key) {
    const entry = this.rooms.get(key);
    if (!entry) return;
    entry.game.destroy();
    this.rooms.delete(key);
    console.log(`Room removed: ${key}`);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.rooms) {
      const humanCount = entry.game.humanCount;
      if (humanCount > 0) {
        entry.lastHumanAt = now;
      } else if (now - entry.lastHumanAt > EMPTY_ROOM_TTL) {
        this.removeRoom(key);
      }
    }
  }
}
