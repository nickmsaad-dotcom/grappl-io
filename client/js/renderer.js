// Canvas renderer: arena, food, players, hooks, UI

import { ARENA_WIDTH, ARENA_HEIGHT } from './constants.js';
import { drawParticles } from './particles.js';
import { getMyId, getObstacles } from './net.js';

let screenShake = { x: 0, y: 0, intensity: 0 };
let camera = { x: 0, y: 0, scale: 1 };

// Cache text color per player color — black for bright neons, white for dark
const textColorCache = {};
function getTextColor(hexColor) {
  if (textColorCache[hexColor]) return textColorCache[hexColor];
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Perceived luminance (human eye is more sensitive to green)
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  const result = lum > 160 ? '#000000cc' : '#ffffffcc';
  textColorCache[hexColor] = result;
  return result;
}

export function triggerScreenShake(intensity) {
  screenShake.intensity = Math.max(screenShake.intensity, intensity);
}

function updateScreenShake() {
  if (screenShake.intensity > 0.5) {
    screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
    screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
    screenShake.intensity *= 0.88;
  } else {
    screenShake.x = 0;
    screenShake.y = 0;
    screenShake.intensity = 0;
  }
}

export function render(ctx, canvas, state) {
  if (!state) return { offsetX: 0, offsetY: 0, scale: 1 };

  const myId = getMyId();
  const me = state.players.find(p => p.id === myId);
  updateScreenShake();

  // Camera follows local player with zoom based on size
  let camX = ARENA_WIDTH / 2;
  let camY = ARENA_HEIGHT / 2;
  let zoomScale = 1;

  if (me && me.alive) {
    camX = me.x;
    camY = me.y;
    // Zoom out as player grows
    zoomScale = Math.max(0.35, 1 - (me.radius - 18) / 300);
  }

  const baseScale = Math.min(canvas.width, canvas.height) / 800;
  const scale = baseScale * zoomScale;
  const offsetX = canvas.width / 2 - camX * scale + screenShake.x;
  const offsetY = canvas.height / 2 - camY * scale + screenShake.y;

  camera = { x: camX, y: camY, scale };

  // Clear
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw grid
  drawGrid(ctx, camX, camY, canvas.width / scale, canvas.height / scale);

  // Draw arena boundary
  drawArenaBoundary(ctx);

  // Draw obstacles
  drawObstacles(ctx);

  // Draw food
  if (state.food) {
    drawFood(ctx, state.food);
  }

  // Draw hooks (behind players)
  for (const player of state.players) {
    if (player.hookState !== 'IDLE' && player.alive) {
      drawHook(ctx, player, player.id === myId);
    }
  }

  // Draw particles
  drawParticles(ctx);

  // Draw players
  for (const player of state.players) {
    if (player.alive) {
      drawPlayer(ctx, player, player.id === myId);
    }
  }

  ctx.restore();

  return { offsetX, offsetY, scale };
}

function drawGrid(ctx, cx, cy, viewW, viewH) {
  const gridSize = 60;
  const startX = Math.floor((cx - viewW / 2) / gridSize) * gridSize;
  const endX = Math.ceil((cx + viewW / 2) / gridSize) * gridSize;
  const startY = Math.floor((cy - viewH / 2) / gridSize) * gridSize;
  const endY = Math.ceil((cy + viewH / 2) / gridSize) * gridSize;

  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += gridSize) {
    if (x < 0 || x > ARENA_WIDTH) continue;
    ctx.beginPath();
    ctx.moveTo(x, Math.max(0, startY));
    ctx.lineTo(x, Math.min(ARENA_HEIGHT, endY));
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y += gridSize) {
    if (y < 0 || y > ARENA_HEIGHT) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, startX), y);
    ctx.lineTo(Math.min(ARENA_WIDTH, endX), y);
    ctx.stroke();
  }
}

function drawArenaBoundary(ctx) {
  // Pulsing arena boundary
  const pulse = 0.3 + Math.sin(performance.now() * 0.002) * 0.15;
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 15 + pulse * 15;
  ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Corner accents
  const cornerSize = 40;
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(0, 255, 255, ${pulse + 0.2})`;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(0, cornerSize); ctx.lineTo(0, 0); ctx.lineTo(cornerSize, 0);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(ARENA_WIDTH - cornerSize, 0); ctx.lineTo(ARENA_WIDTH, 0); ctx.lineTo(ARENA_WIDTH, cornerSize);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(0, ARENA_HEIGHT - cornerSize); ctx.lineTo(0, ARENA_HEIGHT); ctx.lineTo(cornerSize, ARENA_HEIGHT);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(ARENA_WIDTH - cornerSize, ARENA_HEIGHT); ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT); ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT - cornerSize);
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawFood(ctx, food) {
  // No shadow on food — drawing 200 blurred circles kills FPS
  ctx.shadowBlur = 0;
  const time = performance.now() * 0.003;
  for (const f of food) {
    // Subtle size pulse based on position (cheap hash for variety)
    const pulse = 1 + Math.sin(time + f.x * 0.1 + f.y * 0.1) * 0.15;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx, player, isLocal) {
  const { x, y, radius, color, name, invuln, score } = player;

  let alpha = 1;
  if (invuln) {
    alpha = 0.4 + Math.sin(performance.now() * 0.01) * 0.3;
  }

  ctx.globalAlpha = alpha;

  // Outer glow — bigger glow for bigger players, pulse when moving fast
  const pvx = player.vx || 0;
  const pvy = player.vy || 0;
  const speed = Math.sqrt(pvx * pvx + pvy * pvy);
  const speedGlow = Math.min(15, speed * 0.02);
  ctx.shadowColor = color;
  ctx.shadowBlur = (isLocal ? 25 : Math.min(30, 12 + radius * 0.1)) + speedGlow;

  // Player circle — slight stretch in movement direction for speed feel
  ctx.fillStyle = color;
  ctx.beginPath();
  if (speed > 100) {
    const stretch = Math.min(1.15, 1 + speed * 0.0003);
    const angle = Math.atan2(pvy, pvx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(stretch, 1 / stretch);
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner bright core
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff44';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Local player ring
  if (isLocal) {
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Name label — always white with dark outline for readability
  ctx.shadowBlur = 0;
  const textCol = getTextColor(color);
  const isLightBg = textCol[1] === '0'; // starts with #0 = black text
  const fontSize = Math.max(11, Math.min(16, radius * 0.5));
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#00000088';
  ctx.lineWidth = 3;
  ctx.strokeText(name, x, y - radius - 8);
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(name, x, y - radius - 8);

  // Mass display inside circle (for bigger players)
  if (radius > 25) {
    ctx.font = `bold ${Math.max(10, radius * 0.4)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = isLightBg ? '#00000066' : '#ffffff88';
    if (!isLightBg) {
      ctx.strokeStyle = '#00000066';
      ctx.lineWidth = 2;
      ctx.strokeText(String(score), x, y + radius * 0.15);
    }
    ctx.fillText(String(score), x, y + radius * 0.15);
  }
}

function drawObstacles(ctx) {
  const obstacles = getObstacles();
  if (!obstacles || obstacles.length === 0) return;

  const time = performance.now();

  for (const obs of obstacles) {
    const isSpike = obs.spike;
    const glowColor = isSpike ? '#ff4400' : '#ff0066';
    const borderColor = isSpike ? '#ff440088' : '#ff006666';
    const coreColor = isSpike ? '#2a0a0a' : '#1a1a2e';

    if (obs.type === 'pillar') {
      // Dark core
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
      ctx.fill();

      // Spike triangles around the pillar
      if (isSpike) {
        const spikeCount = Math.max(6, Math.floor(obs.radius * 0.4));
        const spikeLen = 8 + obs.radius * 0.2;
        const pulse = 1 + Math.sin(time * 0.005) * 0.15;
        ctx.fillStyle = '#ff440099';
        for (let i = 0; i < spikeCount; i++) {
          const a = (Math.PI * 2 * i) / spikeCount;
          const aLeft = a - Math.PI / spikeCount * 0.5;
          const aRight = a + Math.PI / spikeCount * 0.5;
          const baseR = obs.radius;
          const tipR = baseR + spikeLen * pulse;
          ctx.beginPath();
          ctx.moveTo(obs.x + Math.cos(aLeft) * baseR, obs.y + Math.sin(aLeft) * baseR);
          ctx.lineTo(obs.x + Math.cos(a) * tipR, obs.y + Math.sin(a) * tipR);
          ctx.lineTo(obs.x + Math.cos(aRight) * baseR, obs.y + Math.sin(aRight) * baseR);
          ctx.fill();
        }
      }

      // Neon border
      const spikePulse = isSpike ? 10 + Math.sin(time * 0.004) * 8 : 0;
      ctx.shadowColor = glowColor + '88';
      ctx.shadowBlur = 15 + spikePulse;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSpike ? 2 : 3;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = (isSpike ? '#ff4400' : '#ff0066') + '33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (obs.type === 'wall') {
      // Dark core
      ctx.fillStyle = coreColor;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

      // Spike ticks along wall edges
      if (isSpike) {
        const pulse = 1 + Math.sin(time * 0.005) * 0.15;
        const spikeLen = 6 * pulse;
        const spacing = 12;
        ctx.fillStyle = '#ff440099';
        if (obs.h > obs.w) {
          // Vertical wall — spikes left and right
          for (let sy = obs.y; sy < obs.y + obs.h; sy += spacing) {
            // Left spike
            ctx.beginPath();
            ctx.moveTo(obs.x, sy); ctx.lineTo(obs.x - spikeLen, sy + spacing / 2); ctx.lineTo(obs.x, sy + spacing);
            ctx.fill();
            // Right spike
            ctx.beginPath();
            ctx.moveTo(obs.x + obs.w, sy); ctx.lineTo(obs.x + obs.w + spikeLen, sy + spacing / 2); ctx.lineTo(obs.x + obs.w, sy + spacing);
            ctx.fill();
          }
        } else {
          // Horizontal wall — spikes top and bottom
          for (let sx = obs.x; sx < obs.x + obs.w; sx += spacing) {
            ctx.beginPath();
            ctx.moveTo(sx, obs.y); ctx.lineTo(sx + spacing / 2, obs.y - spikeLen); ctx.lineTo(sx + spacing, obs.y);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(sx, obs.y + obs.h); ctx.lineTo(sx + spacing / 2, obs.y + obs.h + spikeLen); ctx.lineTo(sx + spacing, obs.y + obs.h);
            ctx.fill();
          }
        }
      }

      // Neon border
      const spikePulse = isSpike ? 10 + Math.sin(time * 0.004) * 8 : 0;
      ctx.shadowColor = glowColor + '88';
      ctx.shadowBlur = 15 + spikePulse;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSpike ? 2 : 3;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.shadowBlur = 0;
    }
  }
}

function drawHook(ctx, player, isLocal) {
  const { hookState, hookX, hookY, x, y, color } = player;
  const isAnchored = hookState === 'ANCHORED';

  // Hook line — thicker and brighter when anchored
  ctx.shadowColor = isAnchored ? '#ffffff' : color;
  ctx.shadowBlur = isAnchored ? 12 : 8;
  ctx.strokeStyle = isAnchored ? color : color + '88';
  ctx.lineWidth = isAnchored ? 3 : 2;

  const isReelingPlayer = hookState === 'REELING_PLAYER';

  if (isAnchored) {
    // Draw taut line with slight curve
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    // Pulsing anchor point
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 15 * pulse;
    ctx.beginPath();
    ctx.arc(hookX, hookY, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
  } else if (isReelingPlayer) {
    // Electric line to hooked player — pulsing red/white
    const pulse = Math.sin(performance.now() * 0.015) * 0.5 + 0.5;
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur = 10 + pulse * 8;
    ctx.strokeStyle = `rgba(255, ${100 + pulse * 155}, ${100 + pulse * 155}, 0.9)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    // Hook grip indicator on victim
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(hookX, hookY, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    // Hook tip
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(hookX, hookY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

// Update HUD elements — cached to avoid DOM thrashing every frame
let _lastLbHtml = '';
let _lastKfHtml = '';
let _lastCount = -1;
let _lastAlive = null;

export function updateHUD(state) {
  if (!state) return;

  // Leaderboard — only update DOM if content changed
  const lbHtml = state.leaderboard
    .map(e => `<div class="lb-entry"><span class="lb-name" style="color:${escapeHtml(e.color)}">${escapeHtml(e.name)}</span><span class="lb-kills">${e.score}</span></div>`)
    .join('');
  if (lbHtml !== _lastLbHtml) {
    _lastLbHtml = lbHtml;
    document.getElementById('leaderboard-list').innerHTML = lbHtml;
  }

  // Player count
  const count = state.players.filter(p => p.alive).length;
  if (count !== _lastCount) {
    _lastCount = count;
    const timer = document.getElementById('round-timer');
    timer.textContent = `${count} player${count !== 1 ? 's' : ''} online`;
    timer.style.color = '#666';
  }

  // Kill feed
  const kfHtml = state.round.killfeed
    .slice(-4)
    .reverse()
    .map(k => `<div class="kill-entry"><span class="killer">${escapeHtml(k.killer)}</span> ate <span class="victim">${escapeHtml(k.victim)}</span></div>`)
    .join('');
  if (kfHtml !== _lastKfHtml) {
    _lastKfHtml = kfHtml;
    document.getElementById('killfeed').innerHTML = kfHtml;
  }

  // Respawn message
  const myId = getMyId();
  const me = state.players.find(p => p.id === myId);
  const alive = me ? me.alive : true;
  if (alive !== _lastAlive) {
    _lastAlive = alive;
    const respawnMsg = document.getElementById('respawn-msg');
    if (!alive) {
      respawnMsg.textContent = 'YOU WERE EATEN!';
      respawnMsg.classList.remove('hidden');
    } else {
      respawnMsg.classList.add('hidden');
    }
  }
}

const _escapeEl = document.createElement('div');
function escapeHtml(text) {
  _escapeEl.textContent = text;
  return _escapeEl.innerHTML;
}
