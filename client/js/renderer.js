// Canvas renderer: arena, food, players, hooks, UI

import { ARENA_WIDTH, ARENA_HEIGHT } from './constants.js';
import { drawParticles } from './particles.js';
import { getMyId, getObstacles, getRoomKey } from './net.js';
import { getMouseScreenPos, isMobile } from './input.js';
import { drawTouchControls } from './touch.js';

// Logical canvas size (CSS pixels, not physical)
function logicalW(canvas) { return canvas.width / (window.devicePixelRatio || 1); }
function logicalH(canvas) { return canvas.height / (window.devicePixelRatio || 1); }

let screenShake = { x: 0, y: 0, intensity: 0 };

// Persistent smooth camera state
let camSmooth = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, scale: 1 };

// Frame time — computed once per render, used everywhere
let frameTime = 0;

// --- Floating score indicators ---
const floatingTexts = [];
const MAX_FLOATING_TEXTS = 30;

export function spawnFloatingText(x, y, text, color) {
  if (floatingTexts.length >= MAX_FLOATING_TEXTS) floatingTexts.shift();
  floatingTexts.push({
    x, y,
    vy: -80,
    text,
    color,
    life: 1.0,
    maxLife: 1.0,
  });
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy * dt;
    ft.life -= dt;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}

function drawFloatingTexts(ctx, vl, vt, vr, vb) {
  for (const ft of floatingTexts) {
    if (ft.x < vl - 50 || ft.x > vr + 50 || ft.y < vt - 50 || ft.y > vb + 50) continue;
    const alpha = Math.max(0, ft.life / ft.maxLife);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000aa';
    ctx.lineWidth = 3;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
}

// Cache text color per player color — black for bright neons, white for dark
const textColorCache = {};
function getTextColor(hexColor) {
  if (textColorCache[hexColor]) return textColorCache[hexColor];
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
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

// --- Death animation state ---
const deathAnims = new Map(); // id -> { x, y, radius, color, alpha, timer }
const DEATH_ANIM_DURATION = 0.3;

export function startDeathAnim(id, x, y, radius, color) {
  deathAnims.set(id, { x, y, radius, color, alpha: 1, timer: DEATH_ANIM_DURATION });
}

function updateDeathAnims(dt) {
  for (const [id, d] of deathAnims) {
    d.timer -= dt;
    d.alpha = Math.max(0, d.timer / DEATH_ANIM_DURATION);
    d.radius *= 0.92;
    if (d.timer <= 0) deathAnims.delete(id);
  }
}

function drawDeathAnims(ctx, vl, vt, vr, vb) {
  for (const d of deathAnims.values()) {
    if (d.x < vl - 50 || d.x > vr + 50 || d.y < vt - 50 || d.y > vb + 50) continue;
    ctx.globalAlpha = d.alpha * 0.6;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Hitstop ---
let hitStopTimer = 0;
export function triggerHitStop(duration) {
  hitStopTimer = Math.max(hitStopTimer, duration);
}

export function getHitStopActive() {
  return hitStopTimer > 0;
}

export function render(ctx, canvas, state, dt) {
  if (!state) return { offsetX: 0, offsetY: 0, scale: 1 };

  frameTime = performance.now();

  // Hitstop: skip physics advancement but still render
  if (hitStopTimer > 0) {
    hitStopTimer -= dt;
    dt = 0;
  }

  const myId = getMyId();
  const me = state.players.find(p => p.id === myId);
  updateScreenShake();
  updateFloatingTexts(dt || 0.016);
  updateDeathAnims(dt || 0.016);

  // Camera target — average position of all cells for multi-cell follow
  let targetX = ARENA_WIDTH / 2;
  let targetY = ARENA_HEIGHT / 2;
  let targetZoom = 1;

  if (me && me.alive) {
    const cells = me.cells && me.cells.length > 0 ? me.cells : [{ x: me.x, y: me.y, radius: me.radius }];
    let sumX = 0, sumY = 0, maxR = 0;
    for (const c of cells) {
      sumX += c.x;
      sumY += c.y;
      if (c.radius > maxR) maxR = c.radius;
    }
    targetX = sumX / cells.length;
    targetY = sumY / cells.length;
    // Zoom out more with more cells spread out
    const spread = cells.length > 1 ? Math.sqrt(
      cells.reduce((s, c) => s + (c.x - targetX) ** 2 + (c.y - targetY) ** 2, 0) / cells.length
    ) : 0;
    targetZoom = Math.max(0.25, 1 - (maxR - 18) / 300 - spread / 1500);
  }

  // Smooth camera follow (lerp toward target)
  const camSpeed = 10;
  const safeDt = dt || 0.016;
  const lerpFactor = 1 - Math.exp(-camSpeed * safeDt);
  camSmooth.x += (targetX - camSmooth.x) * lerpFactor;
  camSmooth.y += (targetY - camSmooth.y) * lerpFactor;

  // Mobile gets a closer zoom so the game doesn't look tiny
  const zoomDivisor = isMobile ? 500 : 800;
  const baseScale = Math.min(logicalW(canvas), logicalH(canvas)) / zoomDivisor;
  const targetScale = baseScale * targetZoom;
  camSmooth.scale += (targetScale - camSmooth.scale) * (1 - Math.exp(-5 * safeDt));

  const scale = camSmooth.scale;
  const offsetX = logicalW(canvas) / 2 - camSmooth.x * scale + screenShake.x;
  const offsetY = logicalH(canvas) / 2 - camSmooth.y * scale + screenShake.y;

  // Compute viewport bounds in world space (with margin)
  const margin = 100;
  const viewLeft = camSmooth.x - logicalW(canvas) / scale / 2 - margin;
  const viewRight = camSmooth.x + logicalW(canvas) / scale / 2 + margin;
  const viewTop = camSmooth.y - logicalH(canvas) / scale / 2 - margin;
  const viewBottom = camSmooth.y + logicalH(canvas) / scale / 2 + margin;

  // Clear
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, logicalW(canvas), logicalH(canvas));

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw grid (batched)
  drawGrid(ctx, camSmooth.x, camSmooth.y, logicalW(canvas) / scale, logicalH(canvas) / scale);

  // Draw arena boundary
  drawArenaBoundary(ctx);

  // Draw obstacles (viewport culled)
  drawObstacles(ctx, viewLeft, viewTop, viewRight, viewBottom);

  // Draw food (batched by color, viewport culled)
  if (state.food) {
    drawFood(ctx, state.food, viewLeft, viewTop, viewRight, viewBottom);
  }

  // Draw power-ups
  if (state.powerups) {
    drawPowerups(ctx, state.powerups, viewLeft, viewTop, viewRight, viewBottom);
  }

  // Draw hooks (behind players, viewport culled)
  for (const player of state.players) {
    if (player.hookState !== 'IDLE' && player.alive) {
      drawHook(ctx, player, player.id === myId);
    }
  }

  // Draw particles (viewport culled inside drawParticles)
  drawParticles(ctx, viewLeft, viewTop, viewRight, viewBottom);

  // Draw death animations
  drawDeathAnims(ctx, viewLeft, viewTop, viewRight, viewBottom);

  // Draw players (viewport culled) — draw each cell
  const leaderId = state.leaderboard && state.leaderboard.length > 0 ? state.leaderboard[0].id : null;
  for (const player of state.players) {
    if (!player.alive) continue;
    const cells = player.cells && player.cells.length > 0
      ? player.cells
      : [{ x: player.x, y: player.y, vx: player.vx, vy: player.vy, radius: player.radius, mass: player.mass }];

    // Find largest cell for name/crown
    let largestCell = cells[0];
    for (let i = 1; i < cells.length; i++) {
      if (cells[i].mass > largestCell.mass) largestCell = cells[i];
    }

    for (const cell of cells) {
      if (cell.x + cell.radius < viewLeft || cell.x - cell.radius > viewRight ||
          cell.y + cell.radius < viewTop || cell.y - cell.radius > viewBottom) continue;
      const isLargest = cell === largestCell;
      drawCell(ctx, cell, player, player.id === myId, player.id === leaderId && isLargest, isLargest);
    }
  }

  // Floating score texts (in world space, viewport culled)
  drawFloatingTexts(ctx, viewLeft, viewTop, viewRight, viewBottom);

  ctx.restore();

  // Minimap + controls legend (screen space, after ctx.restore)
  drawMinimap(ctx, canvas, state, myId);
  if (isMobile) {
    drawMobileRoomKey(ctx, canvas);
    drawTouchControls(ctx, canvas);
  } else {
    drawControlsLegend(ctx, canvas);
    drawCrosshair(ctx);
  }

  return { offsetX, offsetY, scale };
}

function drawCrosshair(ctx) {
  const pos = getMouseScreenPos();
  if (pos === null) return;
  const { x, y } = pos;
  const size = 10;
  const gap = 4;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Top
  ctx.moveTo(x, y - gap);
  ctx.lineTo(x, y - gap - size);
  // Bottom
  ctx.moveTo(x, y + gap);
  ctx.lineTo(x, y + gap + size);
  // Left
  ctx.moveTo(x - gap, y);
  ctx.lineTo(x - gap - size, y);
  // Right
  ctx.moveTo(x + gap, y);
  ctx.lineTo(x + gap + size, y);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(x, y, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrid(ctx, cx, cy, viewW, viewH) {
  const gridSize = 60;
  const startX = Math.floor((cx - viewW / 2) / gridSize) * gridSize;
  const endX = Math.ceil((cx + viewW / 2) / gridSize) * gridSize;
  const startY = Math.floor((cy - viewH / 2) / gridSize) * gridSize;
  const endY = Math.ceil((cy + viewH / 2) / gridSize) * gridSize;

  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 1;

  // Batch all vertical lines into one path
  ctx.beginPath();
  for (let x = startX; x <= endX; x += gridSize) {
    if (x < 0 || x > ARENA_WIDTH) continue;
    ctx.moveTo(x, Math.max(0, startY));
    ctx.lineTo(x, Math.min(ARENA_HEIGHT, endY));
  }
  // Batch all horizontal lines into same path
  for (let y = startY; y <= endY; y += gridSize) {
    if (y < 0 || y > ARENA_HEIGHT) continue;
    ctx.moveTo(Math.max(0, startX), y);
    ctx.lineTo(Math.min(ARENA_WIDTH, endX), y);
  }
  ctx.stroke();
}

function drawArenaBoundary(ctx) {
  const pulse = 0.3 + Math.sin(frameTime * 0.002) * 0.15;

  // Outer glow line (wider, translucent) instead of expensive shadowBlur
  ctx.strokeStyle = `rgba(0, 255, 255, ${pulse * 0.3})`;
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Main boundary line
  ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Corner accents — batched into one path
  const cs = 40;
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(0, 255, 255, ${pulse + 0.2})`;
  ctx.beginPath();
  ctx.moveTo(0, cs); ctx.lineTo(0, 0); ctx.lineTo(cs, 0);
  ctx.moveTo(ARENA_WIDTH - cs, 0); ctx.lineTo(ARENA_WIDTH, 0); ctx.lineTo(ARENA_WIDTH, cs);
  ctx.moveTo(0, ARENA_HEIGHT - cs); ctx.lineTo(0, ARENA_HEIGHT); ctx.lineTo(cs, ARENA_HEIGHT);
  ctx.moveTo(ARENA_WIDTH - cs, ARENA_HEIGHT); ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT); ctx.lineTo(ARENA_WIDTH, ARENA_HEIGHT - cs);
  ctx.stroke();
}

function drawFood(ctx, food, vl, vt, vr, vb) {
  ctx.shadowBlur = 0;

  // Batch food draws by color — one beginPath+fill per color
  const byColor = {};
  for (const f of food) {
    if (f.x < vl || f.x > vr || f.y < vt || f.y > vb) continue;
    if (!byColor[f.color]) byColor[f.color] = [];
    byColor[f.color].push(f);
  }

  const time = frameTime * 0.003;
  for (const color in byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const f of byColor[color]) {
      const pulse = 1 + Math.sin(time + f.x * 0.1 + f.y * 0.1) * 0.15;
      ctx.moveTo(f.x + f.radius * pulse, f.y);
      ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function drawPowerups(ctx, powerups, vl, vt, vr, vb) {
  for (const pu of powerups) {
    if (pu.x < vl || pu.x > vr || pu.y < vt || pu.y > vb) continue;

    const pulse = 1 + Math.sin(frameTime * 0.005 + pu.id) * 0.2;
    const r = 12 * pulse;

    // Glow via radial gradient instead of shadowBlur
    const grad = ctx.createRadialGradient(pu.x, pu.y, r * 0.3, pu.x, pu.y, r + 12);
    grad.addColorStop(0, pu.color);
    grad.addColorStop(0.6, pu.color + '44');
    grad.addColorStop(1, pu.color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r + 12, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing orb
    ctx.fillStyle = pu.color;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = '#ffffff88';
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Orbiting ring
    ctx.strokeStyle = pu.color + '66';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r + 6 + Math.sin(frameTime * 0.004) * 3, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pu.color;
    ctx.fillText(pu.label, pu.x, pu.y + r + 14);
  }
}

function drawCell(ctx, cell, player, isLocal, isLeader, isLargest) {
  const { x, y, radius } = cell;
  const { color, name, invuln, displayMass } = player;

  let alpha = 1;
  if (invuln) {
    alpha = 0.4 + Math.sin(frameTime * 0.01) * 0.3;
  }

  ctx.globalAlpha = alpha;

  // Cell glow via radial gradient
  const pvx = cell.vx || 0;
  const pvy = cell.vy || 0;
  const speed = Math.sqrt(pvx * pvx + pvy * pvy);
  const glowSize = radius + (isLocal ? 15 : 8) + Math.min(10, speed * 0.015);

  const grad = ctx.createRadialGradient(x, y, radius * 0.8, x, y, glowSize);
  grad.addColorStop(0, color + '00');
  grad.addColorStop(0.5, color + '22');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, glowSize, 0, Math.PI * 2);
  ctx.fill();

  // Cell circle — slight stretch in movement direction
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

  // Active effect indicators (on all cells)
  const effects = player.effects || {};
  if (effects.shield) {
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (effects.speed) {
    const rot = frameTime * 0.006;
    ctx.strokeStyle = '#00ffff55';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, rot, rot + Math.PI * 1.3);
    ctx.stroke();
  }
  if (effects.magnet) {
    const rot = -frameTime * 0.004;
    ctx.strokeStyle = '#cc33ff55';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 10, rot, rot + Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius + 10, rot + Math.PI, rot + Math.PI * 2);
    ctx.stroke();
  }

  // Kill streak aura rings (only on largest cell)
  if (isLargest) {
    const streak = player.killStreak || 0;
    if (streak >= 2) {
      const t = frameTime * 0.003;
      const rings = Math.min(4, Math.floor(streak / 2));
      const streakColors = ['#ffff0066', '#ff660066', '#ff000066', '#ff00ff66'];
      for (let i = 0; i < rings; i++) {
        const pulse = 1 + Math.sin(t + i * 1.5) * 0.15;
        ctx.strokeStyle = streakColors[i];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, (radius + 10 + i * 8) * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1;

  // Star badge for #1 player (only on largest cell)
  if (isLeader) {
    drawLeaderStar(ctx, x, y, radius);
  }

  // Name label — only on largest cell
  if (isLargest) {
    const mobileBoost = isMobile ? 1.4 : 1;
    const fontSize = Math.max(11, Math.min(16 * mobileBoost, radius * 0.5 * mobileBoost));
    ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#00000088';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - radius - 8);
    ctx.fillStyle = '#ffffffcc';
    ctx.fillText(name, x, y - radius - 8);

    // Active powerup labels below player circle
    const effects = player.effects || {};
    const activeLabels = [];
    if (effects.speed) activeLabels.push({ label: 'SPEED', color: '#00ffff' });
    if (effects.shield) activeLabels.push({ label: 'SHIELD', color: '#ffffff' });
    if (effects.magnet) activeLabels.push({ label: 'MAGNET', color: '#cc33ff' });
    if (effects.bomb) activeLabels.push({ label: 'MASS BOMB', color: '#ff6600' });

    if (activeLabels.length > 0) {
      const labelSize = Math.max(9, Math.min(isMobile ? 15 : 12, radius * (isMobile ? 0.45 : 0.35)));
      ctx.font = `bold ${labelSize}px "Segoe UI", Arial, sans-serif`;
      let labelY = y + radius + labelSize + 6;
      for (const item of activeLabels) {
        ctx.strokeStyle = '#000000aa';
        ctx.lineWidth = 2.5;
        ctx.strokeText(item.label, x, labelY);
        ctx.fillStyle = item.color;
        ctx.fillText(item.label, x, labelY);
        labelY += labelSize + 3;
      }
    }
  }

  // Mass display inside cell — hide for small split cells
  const cellMass = Math.floor((cell.mass || player.mass) * 10);
  if (radius > (isMobile ? 22 : 28)) {
    const textCol = getTextColor(color);
    const isLightBg = textCol[1] === '0';
    const massScale = isMobile ? 0.5 : 0.4;
    ctx.font = `bold ${Math.max(10, radius * massScale)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isLightBg ? '#00000066' : '#ffffff88';
    if (!isLightBg) {
      ctx.strokeStyle = '#00000066';
      ctx.lineWidth = 2;
      ctx.strokeText(String(cellMass), x, y + radius * 0.15);
    }
    ctx.fillText(String(cellMass), x, y + radius * 0.15);
  }
}

function drawLeaderStar(ctx, x, y, radius) {
  const starSize = Math.max(8, radius * 0.3);
  const starX = x;
  const starY = y - radius - starSize - 6;
  const rotation = frameTime * 0.0008; // Slow rotation
  const points = 5;

  ctx.save();
  ctx.globalAlpha = 1;

  // Soft glow behind star
  const glow = ctx.createRadialGradient(starX, starY, 0, starX, starY, starSize * 2);
  glow.addColorStop(0, '#ffd70044');
  glow.addColorStop(1, '#ffd70000');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(starX, starY, starSize * 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw star shape
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = rotation + (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? starSize : starSize * 0.45;
    const px = starX + Math.cos(angle) * r;
    const py = starY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.fillStyle = '#ffd700';
  ctx.fill();
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function getSafeBottom() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0') || 0;
}
function getSafeRight() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sar') || '0') || 0;
}

function drawMinimap(ctx, canvas, state, myId) {
  const size = isMobile ? 100 : 160;
  const padding = isMobile ? 8 : 12;
  const safeR = isMobile ? getSafeRight() : 0;
  const safeB = isMobile ? getSafeBottom() : 0;
  const mx = logicalW(canvas) - size - padding - safeR;
  const my = logicalH(canvas) - size - padding - safeB;
  const scaleX = size / ARENA_WIDTH;
  const scaleY = size / ARENA_HEIGHT;

  ctx.fillStyle = 'rgba(10, 10, 10, 0.75)';
  ctx.fillRect(mx, my, size, size);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, size, size);

  const obstacles = getObstacles();
  if (obstacles) {
    for (const obs of obstacles) {
      ctx.fillStyle = obs.spike ? '#ff440066' : '#ff006644';
      if (obs.type === 'pillar') {
        ctx.beginPath();
        ctx.arc(mx + obs.x * scaleX, my + obs.y * scaleY, Math.max(2, obs.radius * scaleX), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(mx + obs.x * scaleX, my + obs.y * scaleY, Math.max(1, obs.w * scaleX), Math.max(1, obs.h * scaleY));
      }
    }
  }

  for (const p of state.players) {
    if (!p.alive) continue;
    const isMe = p.id === myId;
    ctx.fillStyle = isMe ? '#ffffff' : p.color;
    // Draw all cells on minimap for multi-cell players
    const cells = p.cells && p.cells.length > 0
      ? p.cells
      : [{ x: p.x, y: p.y }];
    for (const cell of cells) {
      const dotSize = isMe ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(mx + cell.x * scaleX, my + cell.y * scaleY, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isMe) {
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx + p.x * scaleX, my + p.y * scaleY, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawMobileRoomKey(ctx, canvas) {
  const roomKey = getRoomKey();
  if (!roomKey) return;
  const minimapSize = 100;
  const padding = 8;
  const safeR = getSafeRight();
  const safeB = getSafeBottom();
  const rkW = 100;
  const rkH = 18;
  const rkX = logicalW(canvas) - minimapSize - padding - safeR;
  const rkY = logicalH(canvas) - minimapSize - padding - safeB - rkH - 4;

  ctx.fillStyle = 'rgba(10, 10, 10, 0.55)';
  ctx.beginPath();
  const rr = 4;
  ctx.moveTo(rkX + rr, rkY);
  ctx.lineTo(rkX + rkW - rr, rkY);
  ctx.quadraticCurveTo(rkX + rkW, rkY, rkX + rkW, rkY + rr);
  ctx.lineTo(rkX + rkW, rkY + rkH - rr);
  ctx.quadraticCurveTo(rkX + rkW, rkY + rkH, rkX + rkW - rr, rkY + rkH);
  ctx.lineTo(rkX + rr, rkY + rkH);
  ctx.quadraticCurveTo(rkX, rkY + rkH, rkX, rkY + rkH - rr);
  ctx.lineTo(rkX, rkY + rr);
  ctx.quadraticCurveTo(rkX, rkY, rkX + rr, rkY);
  ctx.closePath();
  ctx.fill();

  ctx.font = '10px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#666';
  ctx.fillText('SERVER:', rkX + 6, rkY + 13);
  ctx.fillStyle = '#00ffffcc';
  ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
  ctx.fillText(roomKey, rkX + 52, rkY + 13);
}

function drawControlsLegend(ctx, canvas) {
  const padding = 12;
  const minimapSize = isMobile ? 100 : 160;
  const legendW = 160;
  const lineH = 18;
  const controls = [
    ['WASD', 'Move'],
    ['Click', 'Fire hook'],
    ['Release', 'Detach hook'],
    ['Space', 'Split'],
    ['Esc', 'Menu'],
  ];
  const legendH = controls.length * lineH + 12;
  const lx = logicalW(canvas) - legendW - padding;
  const ly = logicalH(canvas) - minimapSize - padding - legendH - 8;

  // Room key label above legend
  const roomKey = getRoomKey();
  if (roomKey) {
    const rkY = ly - 24;
    ctx.fillStyle = 'rgba(10, 10, 10, 0.55)';
    const rkW = 160;
    const rkH = 20;
    const rkX = lx;
    // Rounded pill background
    const rr = 4;
    ctx.beginPath();
    ctx.moveTo(rkX + rr, rkY);
    ctx.lineTo(rkX + rkW - rr, rkY);
    ctx.quadraticCurveTo(rkX + rkW, rkY, rkX + rkW, rkY + rr);
    ctx.lineTo(rkX + rkW, rkY + rkH - rr);
    ctx.quadraticCurveTo(rkX + rkW, rkY + rkH, rkX + rkW - rr, rkY + rkH);
    ctx.lineTo(rkX + rr, rkY + rkH);
    ctx.quadraticCurveTo(rkX, rkY + rkH, rkX, rkY + rkH - rr);
    ctx.lineTo(rkX, rkY + rr);
    ctx.quadraticCurveTo(rkX, rkY, rkX + rr, rkY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#666';
    ctx.fillText('SERVER:', rkX + 8, rkY + 14);
    ctx.fillStyle = '#00ffffcc';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText(roomKey, rkX + 60, rkY + 14);
    ctx.letterSpacing = '0px';
  }

  // Background
  ctx.fillStyle = 'rgba(10, 10, 10, 0.55)';
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(lx + r, ly);
  ctx.lineTo(lx + legendW - r, ly);
  ctx.quadraticCurveTo(lx + legendW, ly, lx + legendW, ly + r);
  ctx.lineTo(lx + legendW, ly + legendH - r);
  ctx.quadraticCurveTo(lx + legendW, ly + legendH, lx + legendW - r, ly + legendH);
  ctx.lineTo(lx + r, ly + legendH);
  ctx.quadraticCurveTo(lx, ly + legendH, lx, ly + legendH - r);
  ctx.lineTo(lx, ly + r);
  ctx.quadraticCurveTo(lx, ly, lx + r, ly);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';

  for (let i = 0; i < controls.length; i++) {
    const [key, action] = controls[i];
    const rowY = ly + 14 + i * lineH;

    // Key badge
    ctx.fillStyle = '#ffffff22';
    const keyW = ctx.measureText(key).width + 10;
    const badgeX = lx + 8;
    ctx.fillRect(badgeX, rowY - 10, keyW, 14);
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(badgeX, rowY - 10, keyW, 14);

    ctx.fillStyle = '#ffffffbb';
    ctx.fillText(key, badgeX + 5, rowY);

    // Action label
    ctx.fillStyle = '#ffffff66';
    ctx.fillText(action, badgeX + keyW + 6, rowY);
  }
}

function drawObstacles(ctx, vl, vt, vr, vb) {
  const obstacles = getObstacles();
  if (!obstacles || obstacles.length === 0) return;

  for (const obs of obstacles) {
    // Viewport culling for obstacles
    if (obs.type === 'pillar') {
      if (obs.x + obs.radius < vl || obs.x - obs.radius > vr ||
          obs.y + obs.radius < vt || obs.y - obs.radius > vb) continue;
    } else {
      if (obs.x + obs.w < vl || obs.x > vr ||
          obs.y + obs.h < vt || obs.y > vb) continue;
    }

    const isSpike = obs.spike;
    const borderColor = isSpike ? '#ff440088' : '#ff006666';
    const coreColor = isSpike ? '#2a0a0a' : '#1a1a2e';

    if (obs.type === 'pillar') {
      // Dark core
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
      ctx.fill();

      // Spike triangles
      if (isSpike) {
        const spikeCount = Math.max(6, Math.floor(obs.radius * 0.4));
        const spikeLen = 8 + obs.radius * 0.2;
        const pulse = 1 + Math.sin(frameTime * 0.005) * 0.15;
        ctx.fillStyle = '#ff440099';
        ctx.beginPath();
        for (let i = 0; i < spikeCount; i++) {
          const a = (Math.PI * 2 * i) / spikeCount;
          const aLeft = a - Math.PI / spikeCount * 0.5;
          const aRight = a + Math.PI / spikeCount * 0.5;
          const baseR = obs.radius;
          const tipR = baseR + spikeLen * pulse;
          ctx.moveTo(obs.x + Math.cos(aLeft) * baseR, obs.y + Math.sin(aLeft) * baseR);
          ctx.lineTo(obs.x + Math.cos(a) * tipR, obs.y + Math.sin(a) * tipR);
          ctx.lineTo(obs.x + Math.cos(aRight) * baseR, obs.y + Math.sin(aRight) * baseR);
        }
        ctx.fill();
      }

      // Neon border — reduced shadowBlur, only on spiked obstacles
      if (isSpike) {
        const spikePulse = 10 + Math.sin(frameTime * 0.004) * 8;
        ctx.shadowColor = '#ff440088';
        ctx.shadowBlur = 8 + spikePulse * 0.5;
      }
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSpike ? 2 : 3;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner ring
      ctx.strokeStyle = (isSpike ? '#ff4400' : '#ff0066') + '33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (obs.type === 'wall') {
      // Dark core
      ctx.fillStyle = coreColor;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

      // Spike ticks along wall edges — batched into one path
      if (isSpike) {
        const pulse = 1 + Math.sin(frameTime * 0.005) * 0.15;
        const spikeLen = 6 * pulse;
        const spacing = 12;
        ctx.fillStyle = '#ff440099';
        ctx.beginPath();
        if (obs.h > obs.w) {
          for (let sy = obs.y; sy < obs.y + obs.h; sy += spacing) {
            ctx.moveTo(obs.x, sy); ctx.lineTo(obs.x - spikeLen, sy + spacing / 2); ctx.lineTo(obs.x, sy + spacing);
            ctx.moveTo(obs.x + obs.w, sy); ctx.lineTo(obs.x + obs.w + spikeLen, sy + spacing / 2); ctx.lineTo(obs.x + obs.w, sy + spacing);
          }
        } else {
          for (let sx = obs.x; sx < obs.x + obs.w; sx += spacing) {
            ctx.moveTo(sx, obs.y); ctx.lineTo(sx + spacing / 2, obs.y - spikeLen); ctx.lineTo(sx + spacing, obs.y);
            ctx.moveTo(sx, obs.y + obs.h); ctx.lineTo(sx + spacing / 2, obs.y + obs.h + spikeLen); ctx.lineTo(sx + spacing, obs.y + obs.h);
          }
        }
        ctx.fill();
      }

      // Neon border — reduced shadowBlur
      if (isSpike) {
        ctx.shadowColor = '#ff440088';
        ctx.shadowBlur = 8;
      }
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSpike ? 2 : 3;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.shadowBlur = 0;
    }
  }
}

function drawHook(ctx, player, isLocal) {
  const { hookState, hookX, hookY, color } = player;
  // Draw hook from largest cell position
  const x = player.x;
  const y = player.y;
  const isAnchored = hookState === 'ANCHORED';
  const isReelingPlayer = hookState === 'REELING_PLAYER';

  // No shadowBlur on hooks — use line opacity instead
  ctx.shadowBlur = 0;

  if (isAnchored) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    // Pulsing anchor point
    const pulse = 1 + Math.sin(frameTime * 0.008) * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hookX, hookY, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Glow ring instead of shadowBlur
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hookX, hookY, 10 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  } else if (isReelingPlayer) {
    const pulse = Math.sin(frameTime * 0.015) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(255, ${100 + pulse * 155 | 0}, ${100 + pulse * 155 | 0}, 0.9)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(hookX, hookY, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = color + '88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hookX, hookY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Update HUD elements — cached to avoid DOM thrashing every frame
let _lastLbHtml = '';
let _lastKfHtml = '';
let _lastCount = -1;
let _lastAlive = null;

export function updateHUD(state) {
  if (!state) return;

  const lbHtml = state.leaderboard
    .map((e, i) => `<div class="lb-entry"><span class="lb-rank">${i + 1}.</span><span class="lb-name" style="color:${escapeHtml(e.color)}">${escapeHtml(e.name)}</span><span class="lb-kills">${e.score}</span></div>`)
    .join('');
  if (lbHtml !== _lastLbHtml) {
    _lastLbHtml = lbHtml;
    document.getElementById('leaderboard-list').innerHTML = lbHtml;
  }

  let count = 0;
  for (const p of state.players) if (p.alive) count++;
  if (count !== _lastCount) {
    _lastCount = count;
    const timer = document.getElementById('round-timer');
    timer.textContent = `${count} player${count !== 1 ? 's' : ''} online`;
    timer.style.color = '#666';
  }

  const kfHtml = state.round.killfeed
    .slice(-6)
    .reverse()
    .map(k => `<div class="kill-entry"><span class="killer">${escapeHtml(k.killer)}</span> ate <span class="victim">${escapeHtml(k.victim)}</span></div>`)
    .join('');
  if (kfHtml !== _lastKfHtml) {
    _lastKfHtml = kfHtml;
    document.getElementById('killfeed').innerHTML = kfHtml;
  }

  const myId = getMyId();
  const me = state.players.find(p => p.id === myId);
  const alive = me ? me.alive : true;
  if (alive !== _lastAlive) {
    _lastAlive = alive;
    const deathScreen = document.getElementById('death-screen');
    if (!alive && deathScreen) {
      // Show death screen with stats
      const stats = document.getElementById('death-stats');
      if (me && stats) {
        stats.innerHTML = `Mass: <strong>${me.displayMass}</strong> &middot; Kills: <strong>${me.kills}</strong> &middot; Deaths: <strong>${me.deaths}</strong>`;
      }
      deathScreen.classList.remove('hidden');
      // Pre-fill rename input with current name
      const renameInput = document.getElementById('rename-input');
      if (renameInput && me) renameInput.value = me.name || '';
    } else if (deathScreen) {
      deathScreen.classList.add('hidden');
    }
  }
}

const _escapeEl = document.createElement('div');
function escapeHtml(text) {
  _escapeEl.textContent = text;
  return _escapeEl.innerHTML;
}
