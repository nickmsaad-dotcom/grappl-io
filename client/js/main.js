// Main entry point

import { initInput, getInput, setCameraTransform } from './input.js';
import { connect, join, sendInput, getMyId } from './net.js';
import { getInterpolatedState } from './interpolation.js';
import { render, updateHUD, triggerScreenShake } from './renderer.js';
import { updateParticles, spawnDeathBurst, spawnTrail, spawnStealSparks } from './particles.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

initInput(canvas);

let prevState = null;
let lastTime = performance.now();
let joined = false;

const joinScreen = document.getElementById('join-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const hud = document.getElementById('hud');

function doJoin() {
  const name = nameInput.value.trim() || 'Anon';
  join(name);
  joinScreen.style.display = 'none';
  hud.classList.remove('hidden');
  joined = true;
  canvas.focus();
}

joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doJoin();
});

connect((data) => {
  console.log('Joined as', data.id);
});

function loop() {
  requestAnimationFrame(loop);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const state = getInterpolatedState();

  if (joined && state) {
    const myId = getMyId();
    const me = state.players.find(p => p.id === myId);

    if (me) {
      const input = getInput(me.x, me.y);
      sendInput(input);
    }

    if (prevState) {
      detectEvents(prevState, state);
    }

    // Player movement trails
    for (const player of state.players) {
      if (!player.alive) continue;
      const vx = player.vx || 0, vy = player.vy || 0;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 80 && Math.random() < 0.4) {
        spawnTrail(player.x, player.y, player.radius, player.color, speed);
      }
    }

    updateParticles(dt);
  }

  const cam = render(ctx, canvas, state);
  setCameraTransform(cam.offsetX, cam.offsetY, cam.scale);

  if (state) {
    updateHUD(state);
  }

  prevState = state;
}

function detectEvents(prev, curr) {
  const myId = getMyId();
  const prevMap = new Map(prev.players.map(p => [p.id, p]));

  for (const player of curr.players) {
    const prevPlayer = prevMap.get(player.id);
    if (!prevPlayer) continue;

    // Player eaten: was alive, now dead
    if (prevPlayer.alive && !player.alive) {
      spawnDeathBurst(prevPlayer.x, prevPlayer.y, player.color);
      if (player.id === myId) {
        triggerScreenShake(15);
      }
    }

    // Mass stolen: sudden mass drop on a living player
    if (player.alive && prevPlayer.alive && prevPlayer.mass - player.mass > 0.5) {
      spawnStealSparks(player.x, player.y, player.x, player.y - 30, player.color);
      if (player.id === myId) {
        triggerScreenShake(6);
      }
    }
  }
}

requestAnimationFrame(loop);
