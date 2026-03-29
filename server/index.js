import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RoomManager } from './room-manager.js';
import { getLeaderboardData } from './leaderboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve client files
app.use(express.static(join(__dirname, '..', 'client')));

// All-time leaderboard API
app.get('/api/leaderboard', (req, res) => {
  res.json(getLeaderboardData());
});

// Initialize room manager
const rooms = new RoomManager(io);

function getGameForSocket(socket) {
  const key = socket.data.roomKey;
  if (!key) return null;
  const entry = rooms.getRoom(key);
  return entry ? entry.game : null;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Rate limit room creation: max 3 per 10 seconds
  let roomCreateTimes = [];

  socket.on('create_room', () => {
    const now = Date.now();
    roomCreateTimes = roomCreateTimes.filter(t => now - t < 10000);
    if (roomCreateTimes.length >= 3) {
      socket.emit('room_error', 'Too many rooms created — slow down');
      return;
    }
    roomCreateTimes.push(now);

    // Leave previous room if any
    if (socket.data.roomKey) {
      const prevGame = getGameForSocket(socket);
      if (prevGame) prevGame.removePlayer(socket.id);
      socket.leave(socket.data.roomKey);
    }
    const key = rooms.createRoom();
    const entry = rooms.getRoom(key);
    socket.data.roomKey = key;
    socket.join(key);
    socket.emit('room_created', { key, obstacles: entry.game.obstacles });
  });

  socket.on('join_room', (key) => {
    if (!key || typeof key !== 'string') {
      socket.emit('room_error', 'Invalid room code');
      return;
    }
    key = key.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
    if (key.length < 1) {
      socket.emit('room_error', 'Invalid room code');
      return;
    }

    // Leave previous room if any
    if (socket.data.roomKey) {
      const prevGame = getGameForSocket(socket);
      if (prevGame) prevGame.removePlayer(socket.id);
      socket.leave(socket.data.roomKey);
    }

    const entry = rooms.getOrCreateRoom(key);
    socket.data.roomKey = key;
    socket.join(key);
    socket.emit('room_joined', { key, obstacles: entry.game.obstacles });
  });

  let hasJoined = false;
  let joinedRoomKey = null;
  socket.on('join', (name) => {
    const game = getGameForSocket(socket);
    if (!game) {
      socket.emit('room_error', 'Join a room first');
      return;
    }
    // Allow re-joining after room switch
    if (hasJoined && joinedRoomKey === socket.data.roomKey && game.players.has(socket.id)) return;
    hasJoined = true;
    joinedRoomKey = socket.data.roomKey;
    const displayName = (name || 'Anon').slice(0, 16);
    game.addPlayer(socket.id, displayName);
    socket.emit('joined', { id: socket.id });
  });

  socket.on('input', (data) => {
    const game = getGameForSocket(socket);
    if (game) game.handleInput(socket.id, data);
  });

  socket.on('respawn', (data) => {
    // Check if switching rooms
    if (data && data.roomKey && typeof data.roomKey === 'string') {
      const newKey = data.roomKey.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
      if (newKey && newKey !== socket.data.roomKey) {
        // Leave old room — properly kill player if alive
        const oldGame = getGameForSocket(socket);
        if (oldGame) {
          const oldPlayer = oldGame.players.get(socket.id);
          if (oldPlayer && oldPlayer.alive) {
            oldPlayer.alive = false;
            oldPlayer.deaths++;
          }
          oldGame.removePlayer(socket.id);
        }
        socket.leave(socket.data.roomKey);

        // Join new room
        const entry = rooms.getOrCreateRoom(newKey);
        socket.data.roomKey = newKey;
        joinedRoomKey = newKey;
        socket.join(newKey);

        const displayName = data.name ? String(data.name).slice(0, 16) : 'Anon';
        entry.game.addPlayer(socket.id, displayName);
        socket.emit('room_joined', { key: newKey, obstacles: entry.game.obstacles });
        socket.emit('joined', { id: socket.id });
        return;
      }
    }

    // Normal respawn in same room
    const game = getGameForSocket(socket);
    if (game) {
      const newName = data && typeof data.name === 'string' ? data.name.slice(0, 16) : null;
      game.respawnPlayer(socket.id, newName);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const game = getGameForSocket(socket);
    if (game) game.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`CircleEatGame.io server running on http://localhost:${PORT}`);
});
