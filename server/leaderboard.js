// Persistent all-time leaderboards: Top 3 Kills + Top 3 Score
// Saved to a JSON file so data survives server restarts

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'leaderboard-data.json');

const BOARD_SIZE = 3;

let data = {
  kills: [],  // [{ name, value, date }]
  score: [],  // [{ name, value, date }]
};

// Load from disk on startup
function load() {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.kills) data.kills = parsed.kills.slice(0, BOARD_SIZE);
      if (parsed.score) data.score = parsed.score.slice(0, BOARD_SIZE);
    }
  } catch (e) {
    console.warn('Could not load leaderboard data:', e.message);
  }
}

function save() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Could not save leaderboard data:', e.message);
  }
}

load();

// Try to insert an entry into a board. Returns true if it made the board.
function tryInsert(board, name, value) {
  // Check if this beats an existing entry or there's room
  const minOnBoard = board.length >= BOARD_SIZE ? board[board.length - 1].value : -1;
  if (value <= 0 || (board.length >= BOARD_SIZE && value <= minOnBoard)) return false;

  const entry = {
    name: name || 'Anon',
    value,
    date: new Date().toISOString(),
  };

  // Check if same player already on board with lower score — update instead of duplicate
  const existing = board.findIndex(e => e.name === name);
  if (existing !== -1) {
    if (board[existing].value >= value) return false; // Already has a better score
    board.splice(existing, 1);
  }

  board.push(entry);
  board.sort((a, b) => b.value - a.value);
  if (board.length > BOARD_SIZE) board.length = BOARD_SIZE;

  return true;
}

// Called when a player dies or disconnects — check if their stats qualify
export function submitPlayerStats(name, kills, peakMass) {
  let changed = false;
  if (tryInsert(data.kills, name, kills)) changed = true;
  // Store peak mass as display value (×10, matching in-game HUD)
  if (tryInsert(data.score, name, Math.floor(peakMass * 10))) changed = true;
  if (changed) save();
}

// Returns the current leaderboard data for the API
export function getLeaderboardData() {
  return {
    kills: data.kills.map(e => ({ name: e.name, value: e.value })),
    score: data.score.map(e => ({ name: e.name, value: e.value })),
  };
}
