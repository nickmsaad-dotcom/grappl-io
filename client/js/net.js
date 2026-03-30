// Network: Socket.io client wrapper

let socket = null;
let snapshotBuffer = [];
let myId = null;
let obstacles = [];
let currentRoomKey = null;

export function connect() {
  socket = io();
  return socket;
}

export function disconnect() {
  if (socket) {
    socket.removeAllListeners();
    socket._snapshotBound = false;
    socket.disconnect();
    socket = null;
  }
  snapshotBuffer = [];
  myId = null;
  obstacles = [];
  currentRoomKey = null;
}

export function createRoom(cb) {
  if (!socket) return;
  let handled = false;
  const timeout = setTimeout(() => {
    if (handled) return;
    handled = true;
    socket.off('room_created', handler);
    cb('Server timeout — try again');
  }, 5000);
  const handler = (data) => {
    if (handled) return;
    handled = true;
    clearTimeout(timeout);
    currentRoomKey = data.key;
    if (data.obstacles) obstacles = data.obstacles;
    cb(null, data.key);
  };
  socket.once('room_created', handler);
  socket.emit('create_room');
}

export function findPublicRoom(cb) {
  if (!socket) return;
  let handled = false;
  const timeout = setTimeout(() => {
    if (handled) return;
    handled = true;
    socket.off('room_joined', handler);
    cb('Server timeout — try again');
  }, 5000);
  const handler = (data) => {
    if (handled) return;
    handled = true;
    clearTimeout(timeout);
    currentRoomKey = data.key;
    if (data.obstacles) obstacles = data.obstacles;
    cb(null, data.key);
  };
  socket.once('room_joined', handler);
  socket.emit('find_public');
}

export function joinRoom(key, cb) {
  if (!socket) return;
  // Clean up previous listeners
  socket.off('room_joined');
  socket.off('room_error');

  let handled = false;
  const timeout = setTimeout(() => {
    if (handled) return;
    handled = true;
    socket.off('room_joined', joinHandler);
    socket.off('room_error', errorHandler);
    cb('Server timeout — try again');
  }, 5000);
  const joinHandler = (data) => {
    if (handled) return;
    handled = true;
    clearTimeout(timeout);
    currentRoomKey = data.key;
    if (data.obstacles) obstacles = data.obstacles;
    cb(null, data.key);
  };
  const errorHandler = (msg) => {
    if (handled) return;
    handled = true;
    clearTimeout(timeout);
    cb(msg);
  };
  socket.once('room_joined', joinHandler);
  socket.once('room_error', errorHandler);
  socket.emit('join_room', key);
}

export function getRoomKey() {
  return currentRoomKey;
}

export function join(name) {
  if (!socket) return;

  // Set up snapshot listener (only once)
  if (!socket._snapshotBound) {
    let lastFood = [];
    socket.on('snapshot', (snapshot) => {
      if (snapshot.food) lastFood = snapshot.food;
      snapshotBuffer.push({
        ...snapshot,
        food: snapshot.food || lastFood,
        receivedAt: performance.now(),
      });
      if (snapshotBuffer.length > 5) snapshotBuffer.shift();
    });

    socket.on('joined', (data) => {
      myId = data.id;
    });

    // Handle room switch mid-game (re-set obstacles)
    socket.on('room_joined', (data) => {
      currentRoomKey = data.key;
      if (data.obstacles) obstacles = data.obstacles;
      snapshotBuffer = [];
    });

    socket._snapshotBound = true;
  }

  socket.emit('join', name);
}

export function sendInput(input) {
  if (socket) socket.emit('input', input);
}

export function sendRespawn(name, roomKey) {
  if (socket) socket.emit('respawn', { name: name || undefined, roomKey: roomKey || undefined });
}

export function getSnapshots() {
  return snapshotBuffer;
}

export function getMyId() {
  return myId;
}

export function getObstacles() {
  return obstacles;
}
