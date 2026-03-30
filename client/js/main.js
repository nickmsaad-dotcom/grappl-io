// Main entry point

import { initInput, getInput, setCameraTransform, isMobile } from './input.js';
import { getPauseQueued } from './touch.js';
import { connect, disconnect, join, sendInput, sendRespawn, getMyId, createRoom, joinRoom, getRoomKey } from './net.js';
import { getInterpolatedState } from './interpolation.js';
import { render, updateHUD, triggerScreenShake, spawnFloatingText, startDeathAnim, triggerHitStop } from './renderer.js';
import { updateParticles, spawnDeathBurst, spawnTrail, spawnStealSparks } from './particles.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

initInput(canvas);

let prevState = null;
let lastTime = performance.now();
let joined = false;

const joinScreen = document.getElementById('join-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-input');
const createBtn = document.getElementById('create-btn');
const roomDisplay = document.getElementById('room-display');
const roomCodeValue = document.getElementById('room-code-value');
const joinError = document.getElementById('join-error');
const hud = document.getElementById('hud');
const deathScreen = document.getElementById('death-screen');
const deathStats = document.getElementById('death-stats');
const renameInput = document.getElementById('rename-input');
const deathRoomInput = document.getElementById('death-room-input');
const retryBtn = document.getElementById('retry-btn');
const deathQuitBtn = document.getElementById('death-quit-btn');
const pauseScreen = document.getElementById('pause-screen');
const pauseCloseBtn = document.getElementById('pause-close-btn');
const pauseRoomInput = document.getElementById('pause-room-input');
const pauseSwitchBtn = document.getElementById('pause-switch-btn');
const pauseQuitBtn = document.getElementById('pause-quit-btn');
let playerName = 'Anon';

function showJoinError(msg) {
  joinError.textContent = msg;
  joinError.classList.remove('hidden');
}

function enterGame() {
  playerName = nameInput.value.trim() || 'Anon';
  join(playerName);
  joinScreen.style.display = 'none';
  hud.classList.remove('hidden');
  joined = true;
  canvas.focus();
}

function doJoin() {
  joinError.classList.add('hidden');
  const code = roomInput.value.trim().toUpperCase();

  if (code) {
    // Join existing room
    joinRoom(code, (err) => {
      if (err) { showJoinError(err); return; }
      enterGame();
    });
  } else {
    // Create new room then enter
    createRoom((err, key) => {
      if (err) { showJoinError('Failed to create room'); return; }
      roomInput.value = key;
      roomDisplay.classList.remove('hidden');
      roomCodeValue.textContent = key;
      enterGame();
    });
  }
}

createBtn.addEventListener('click', () => {
  joinError.classList.add('hidden');
  createRoom((err, key) => {
    if (err) { showJoinError('Failed to create room'); return; }
    roomInput.value = key;
    roomDisplay.classList.remove('hidden');
    roomCodeValue.textContent = key;
  });
});

function doRetry() {
  const newName = renameInput.value.trim();
  if (newName) playerName = newName;
  const newRoom = deathRoomInput.value.trim().toUpperCase();

  if (newRoom && newRoom !== getRoomKey()) {
    // Switch rooms on respawn
    sendRespawn(playerName, newRoom);
  } else {
    sendRespawn(newName || null);
  }
  deathScreen.classList.add('hidden');
  renameInput.value = '';
  deathRoomInput.value = '';
  canvas.focus();
}

retryBtn.addEventListener('click', doRetry);
deathQuitBtn.addEventListener('click', doQuit);
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doRetry();
});
deathRoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doRetry();
});

joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doJoin();
});
roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doJoin();
});

// Esc key menu
function openPauseMenu() {
  if (!joined || joinScreen.style.display !== 'none') return;
  // Don't open if death screen is showing
  if (!deathScreen.classList.contains('hidden')) return;
  pauseRoomInput.value = '';
  pauseScreen.classList.remove('hidden');
}

function closePauseMenu() {
  pauseScreen.classList.add('hidden');
  canvas.focus();
}

function doPauseSwitch() {
  const newRoom = pauseRoomInput.value.trim().toUpperCase();
  if (!newRoom || newRoom === getRoomKey()) {
    closePauseMenu();
    return;
  }
  prevState = null;
  streakAnnouncement = null;
  sendRespawn(playerName, newRoom);
  closePauseMenu();
}

function doQuit() {
  pauseScreen.classList.add('hidden');
  deathScreen.classList.add('hidden');
  hud.classList.add('hidden');
  joinScreen.style.display = '';
  joined = false;
  nameInput.value = playerName !== 'Anon' ? playerName : '';
  roomInput.value = '';
  roomDisplay.classList.add('hidden');
  // Disconnect and reconnect so server cleans up the player
  prevState = null;
  streakAnnouncement = null;
  disconnect();
  connect();
  fetchAlltimeLeaderboards();
  nameInput.focus();
}

pauseCloseBtn.addEventListener('click', closePauseMenu);
pauseSwitchBtn.addEventListener('click', doPauseSwitch);
pauseRoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doPauseSwitch();
});
pauseQuitBtn.addEventListener('click', doQuit);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!pauseScreen.classList.contains('hidden')) {
      closePauseMenu();
    } else {
      openPauseMenu();
    }
  }
});

// All-time leaderboards — fetch and render on homepage
function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

const RANK_CLASSES = ['gold', 'silver', 'bronze'];

function renderAlltimeBoard(containerId, entries) {
  const el = document.getElementById(containerId);
  if (!entries || entries.length === 0) {
    el.innerHTML = '<div class="alltime-empty">No records yet</div>';
    return;
  }
  el.innerHTML = entries.map((e, i) =>
    `<div class="alltime-entry">
      <span class="alltime-rank ${RANK_CLASSES[i] || ''}">${i + 1}.</span>
      <span class="alltime-name">${escapeText(e.name)}</span>
      <span class="alltime-value">${e.value}</span>
    </div>`
  ).join('');
}

function fetchAlltimeLeaderboards() {
  fetch('/api/leaderboard')
    .then(r => r.json())
    .then(data => {
      renderAlltimeBoard('alltime-kills', data.kills);
      renderAlltimeBoard('alltime-score', data.score);
    })
    .catch(() => {}); // Silently fail — boards stay as "No records yet"
}

// Fetch on page load and refresh periodically
fetchAlltimeLeaderboards();
setInterval(fetchAlltimeLeaderboards, 15000); // Refresh every 15 seconds

// Connect socket (no room yet — room selected on PLAY)
connect();

function loop() {
  requestAnimationFrame(loop);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const state = getInterpolatedState();

  // Mobile pause button
  if (isMobile && getPauseQueued()) {
    if (!pauseScreen.classList.contains('hidden')) {
      closePauseMenu();
    } else {
      openPauseMenu();
    }
  }

  if (joined && state) {
    const myId = getMyId();
    const me = state.players.find(p => p.id === myId);

    if (me && pauseScreen.classList.contains('hidden')) {
      const input = getInput(me.x, me.y);
      sendInput(input);
    }

    if (prevState) {
      detectEvents(prevState, state, dt);
    }

    // Player movement trails (per cell)
    for (const player of state.players) {
      if (!player.alive) continue;
      const cells = player.cells && player.cells.length > 0
        ? player.cells
        : [{ x: player.x, y: player.y, vx: player.vx, vy: player.vy, radius: player.radius }];
      for (const cell of cells) {
        const vx = cell.vx || 0, vy = cell.vy || 0;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 80 && Math.random() < 0.4) {
          spawnTrail(cell.x, cell.y, cell.radius, player.color, speed);
        }
      }
    }

    updateParticles(dt);
  }

  const cam = render(ctx, canvas, state, dt);
  setCameraTransform(cam.offsetX, cam.offsetY, cam.scale);

  if (state) {
    updateHUD(state);
  }

  // Draw streak announcement (screen space)
  if (streakAnnouncement && streakAnnouncement.life > 0) {
    streakAnnouncement.life -= dt;
    const sa = streakAnnouncement;
    const alpha = Math.min(1, sa.life * 2); // fade out in last 0.5s
    const scale = 1 + (2.0 - sa.life) * 0.05; // slight grow
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.floor(36 * scale)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000cc';
    ctx.lineWidth = 4;
    const cw = canvas.width / (window.devicePixelRatio || 1);
    const ch = canvas.height / (window.devicePixelRatio || 1);
    ctx.strokeText(sa.text, cw / 2, ch * 0.3);
    ctx.fillStyle = sa.color;
    ctx.fillText(sa.text, cw / 2, ch * 0.3);
    ctx.restore();
    if (sa.life <= 0) streakAnnouncement = null;
  }

  prevState = state;
}

// Kill streak announcements
const STREAK_NAMES = {
  2: 'DOUBLE KILL',
  3: 'TRIPLE KILL',
  5: 'RAMPAGE',
  7: 'UNSTOPPABLE',
  10: 'GODLIKE',
};
let streakAnnouncement = null; // { text, color, life }

function showStreakAnnouncement(text, color) {
  streakAnnouncement = { text, color, life: 2.0 };
}

// Throttle food score popups — batch small gains
let pendingFoodScore = 0;
let pendingFoodTimer = 0;
const FOOD_BATCH_INTERVAL = 0.4; // seconds

function detectEvents(prev, curr, dt) {
  const myId = getMyId();
  const prevMap = new Map(prev.players.map(p => [p.id, p]));
  const me = curr.players.find(p => p.id === myId);
  const prevMe = prevMap.get(myId);

  for (const player of curr.players) {
    const prevPlayer = prevMap.get(player.id);
    if (!prevPlayer) continue;

    // Player respawned: was dead, now alive — clear streak display
    if (!prevPlayer.alive && player.alive && player.id === myId) {
      streakAnnouncement = null;
    }

    // Player eaten: was alive, now dead
    if (prevPlayer.alive && !player.alive) {
      spawnDeathBurst(prevPlayer.x, prevPlayer.y, player.color);
      startDeathAnim(player.id, prevPlayer.x, prevPlayer.y, prevPlayer.radius, player.color);
      if (player.id === myId) {
        triggerScreenShake(15);
      }
    }

    // Mass stolen: sudden mass drop on a living player
    if (player.alive && prevPlayer.alive && prevPlayer.mass - player.mass > 0.5) {
      spawnStealSparks(player.x, player.y, player.x, player.y - 30, player.color);
      if (player.id === myId) {
        triggerScreenShake(6);
        const lost = Math.floor((prevPlayer.mass - player.mass) * 10);
        spawnFloatingText(player.x, player.y - player.radius, `-${lost} STOLEN!`, '#ff3333');
      }
    }

    // Mass gain via stealing (this player stole from someone)
    if (player.alive && prevPlayer.alive && player.id === myId &&
        player.mass - prevPlayer.mass > 0.5) {
      const gained = Math.floor((player.mass - prevPlayer.mass) * 10);
      spawnFloatingText(player.x, player.y - player.radius, `+${gained} STEAL!`, '#ffff00');
    }
  }

  // Detect kills by local player — check if someone died and local player gained mass
  if (me && prevMe && me.alive) {
    // Check for new kills
    if (me.kills > (prevMe.kills || 0)) {
      spawnFloatingText(me.x, me.y - me.radius - 20, 'DEVOURED!', '#ff00ff');
      triggerHitStop(0.05); // Brief freeze for impact feel
      triggerScreenShake(8);
      // Kill streak announcement
      const streak = me.killStreak || 0;
      if (STREAK_NAMES[streak]) {
        showStreakAnnouncement(STREAK_NAMES[streak], streak >= 7 ? '#ff00ff' : streak >= 5 ? '#ff3333' : '#ffff00');
      }
    }

    // Food score gain — batch small increments
    const scoreDelta = (me.score || 0) - (prevMe.score || 0);
    if (scoreDelta > 0 && scoreDelta < 50) {
      // Small gain = food pickup (not a kill or steal)
      pendingFoodScore += scoreDelta;
    }
  }

  // Flush batched food score
  pendingFoodTimer += dt;
  if (pendingFoodScore > 0 && pendingFoodTimer >= FOOD_BATCH_INTERVAL) {
    if (me && me.alive) {
      spawnFloatingText(me.x + (Math.random() - 0.5) * 30, me.y - me.radius,
        `+${pendingFoodScore}`, '#33ff99');
    }
    pendingFoodScore = 0;
    pendingFoodTimer = 0;
  }
}

requestAnimationFrame(loop);
