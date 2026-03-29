import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Game } from './game.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve client files
app.use(express.static(join(__dirname, '..', 'client')));

// Initialize game
const game = new Game(io);

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  let hasJoined = false;
  socket.on('join', (name) => {
    if (hasJoined) return; // Prevent duplicate joins
    hasJoined = true;
    const displayName = (name || 'Anon').slice(0, 16);
    game.addPlayer(socket.id, displayName);
    socket.emit('joined', { id: socket.id, obstacles: game.obstacles });
  });

  socket.on('input', (data) => {
    game.handleInput(socket.id, data);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    game.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Grappl.io server running on http://localhost:${PORT}`);
});
