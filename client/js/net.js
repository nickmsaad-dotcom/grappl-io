// Network: Socket.io client wrapper

let socket = null;
let snapshotBuffer = [];
let myId = null;
let obstacles = [];
let onJoinedCallback = null;

export function connect(onJoined) {
  socket = io();
  onJoinedCallback = onJoined;

  socket.on('joined', (data) => {
    myId = data.id;
    if (data.obstacles) obstacles = data.obstacles;
    if (onJoinedCallback) onJoinedCallback(data);
  });

  let lastFood = [];
  socket.on('snapshot', (snapshot) => {
    // Cache food — server only sends it periodically
    if (snapshot.food) {
      lastFood = snapshot.food;
    }
    snapshotBuffer.push({
      ...snapshot,
      food: snapshot.food || lastFood,
      receivedAt: performance.now(),
    });
    // Keep only last 5 snapshots
    if (snapshotBuffer.length > 5) {
      snapshotBuffer.shift();
    }
  });

  return socket;
}

export function join(name) {
  if (socket) socket.emit('join', name);
}

export function sendInput(input) {
  if (socket) socket.emit('input', input);
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
