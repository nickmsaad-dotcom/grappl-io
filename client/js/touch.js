// Mobile touch controls: virtual joystick + aim area + split button + pause button

export const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1200);

// Safe area insets (for notch/home indicator)
function getSafeInsets() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--sat') || '0') || 0,
    right: parseInt(style.getPropertyValue('--sar') || '0') || 0,
    bottom: parseInt(style.getPropertyValue('--sab') || '0') || 0,
    left: parseInt(style.getPropertyValue('--sal') || '0') || 0,
  };
}

// Joystick config
const JOY_RADIUS = 60;
const JOY_THUMB_RADIUS = 25;
const JOY_DEADZONE = 8;
const JOY_X = 100;
const JOY_BOTTOM_OFFSET = 100;

// Split button config
const SPLIT_BTN_RADIUS = 30;
const SPLIT_BTN_RIGHT_OFFSET = 80;
const SPLIT_BTN_BOTTOM_OFFSET = 110;

// Pause button config
const PAUSE_BTN_SIZE = 40;
const PAUSE_BTN_MARGIN = 14;

// Double-tap timing
const DOUBLE_TAP_MS = 300;

// State
let joystickTouch = null;  // { id, startX, startY, curX, curY }
let aimTouch = null;       // { id, startX, startY, curX, curY, startTime }
let lastAimTapTime = 0;

let fireQueued = false;
let releaseQueued = false;
let splitQueued = false;
let pauseQueued = false;

let canvasRef = null;
let touchCameraTransform = { offsetX: 0, offsetY: 0, scale: 1 };

// Logical (CSS) pixel dimensions — touch events use CSS pixels
function lw() { return canvasRef ? canvasRef.width / (window.devicePixelRatio || 1) : window.innerWidth; }
function lh() { return canvasRef ? canvasRef.height / (window.devicePixelRatio || 1) : window.innerHeight; }

export function initTouch(canvas) {
  canvasRef = canvas;

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
}

function getJoyCenter() {
  const safe = getSafeInsets();
  return { x: JOY_X + safe.left, y: lh() - JOY_BOTTOM_OFFSET - safe.bottom };
}

function getSplitBtnCenter() {
  const safe = getSafeInsets();
  return { x: lw() - SPLIT_BTN_RIGHT_OFFSET - safe.right, y: lh() - SPLIT_BTN_BOTTOM_OFFSET - safe.bottom };
}

function getPauseBtnRect() {
  const safe = getSafeInsets();
  return { x: PAUSE_BTN_MARGIN + safe.left, y: PAUSE_BTN_MARGIN + safe.top, w: PAUSE_BTN_SIZE, h: PAUSE_BTN_SIZE };
}

function hitTest(tx, ty, cx, cy, r) {
  const dx = tx - cx;
  const dy = ty - cy;
  return dx * dx + dy * dy <= r * r;
}

function onTouchStart(e) {
  e.preventDefault();
  const cw = lw();

  for (const touch of e.changedTouches) {
    const tx = touch.clientX;
    const ty = touch.clientY;

    // Pause button (top-left) — padded hit area for fat fingers
    const pb = getPauseBtnRect();
    const pad = 12;
    if (tx >= pb.x - pad && tx <= pb.x + pb.w + pad && ty >= pb.y - pad && ty <= pb.y + pb.h + pad) {
      pauseQueued = true;
      continue;
    }

    // Split button (bottom-right circle)
    const sb = getSplitBtnCenter();
    if (hitTest(tx, ty, sb.x, sb.y, SPLIT_BTN_RADIUS + 10)) {
      splitQueued = true;
      continue;
    }

    // Left half → joystick
    if (tx < cw * 0.4 && !joystickTouch) {
      joystickTouch = {
        id: touch.identifier,
        startX: tx, startY: ty,
        curX: tx, curY: ty,
      };
      continue;
    }

    // Right half → aim + fire
    if (tx >= cw * 0.4 && !aimTouch) {
      const now = Date.now();
      // Double-tap → split
      if (now - lastAimTapTime < DOUBLE_TAP_MS) {
        splitQueued = true;
      }
      lastAimTapTime = now;

      aimTouch = {
        id: touch.identifier,
        startX: tx, startY: ty,
        curX: tx, curY: ty,
        startTime: now,
      };
      fireQueued = true;
      continue;
    }
  }
}

function onTouchMove(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (joystickTouch && touch.identifier === joystickTouch.id) {
      joystickTouch.curX = touch.clientX;
      joystickTouch.curY = touch.clientY;
    }
    if (aimTouch && touch.identifier === aimTouch.id) {
      aimTouch.curX = touch.clientX;
      aimTouch.curY = touch.clientY;
    }
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (joystickTouch && touch.identifier === joystickTouch.id) {
      joystickTouch = null;
    }
    if (aimTouch && touch.identifier === aimTouch.id) {
      releaseQueued = true;
      aimTouch = null;
    }
  }
}

export function setTouchCameraTransform(offsetX, offsetY, scale) {
  touchCameraTransform = { offsetX, offsetY, scale };
}

export function getTouchMovement() {
  const keys = { w: false, a: false, s: false, d: false };
  if (!joystickTouch) return keys;

  const dx = joystickTouch.curX - joystickTouch.startX;
  const dy = joystickTouch.curY - joystickTouch.startY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < JOY_DEADZONE) return keys;

  const nx = dx / dist;
  const ny = dy / dist;

  if (nx > 0.3) keys.d = true;
  if (nx < -0.3) keys.a = true;
  if (ny > 0.3) keys.s = true;
  if (ny < -0.3) keys.w = true;

  return keys;
}

export function getTouchAimAngle(playerX, playerY) {
  if (!aimTouch) return null;

  const scale = touchCameraTransform.scale || 1;
  const gameX = (aimTouch.curX - touchCameraTransform.offsetX) / scale;
  const gameY = (aimTouch.curY - touchCameraTransform.offsetY) / scale;

  return Math.atan2(gameY - playerY, gameX - playerX);
}

export function getTouchAimScreenPos() {
  if (!aimTouch) return null;
  return { x: aimTouch.curX, y: aimTouch.curY };
}

export function getTouchActions() {
  const actions = {
    fire: fireQueued,
    release: releaseQueued,
    split: splitQueued,
  };
  fireQueued = false;
  releaseQueued = false;
  splitQueued = false;
  return actions;
}

export function getPauseQueued() {
  if (pauseQueued) {
    pauseQueued = false;
    return true;
  }
  return false;
}

export function drawTouchControls(ctx, canvas) {
  ctx.save();

  // --- Virtual Joystick ---
  const joy = getJoyCenter();
  let thumbX = joy.x;
  let thumbY = joy.y;

  if (joystickTouch) {
    // Floating joystick — base appears at touch start position
    const baseX = joystickTouch.startX;
    const baseY = joystickTouch.startY;

    let dx = joystickTouch.curX - baseX;
    let dy = joystickTouch.curY - baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS;
      dy = (dy / dist) * JOY_RADIUS;
    }
    thumbX = baseX + dx;
    thumbY = baseY + dy;

    // Base ring at touch origin
    ctx.beginPath();
    ctx.arc(baseX, baseY, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Thumb
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, JOY_THUMB_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Idle hint — faint static joystick
    ctx.beginPath();
    ctx.arc(joy.x, joy.y, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(joy.x, joy.y, JOY_THUMB_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
  }

  // --- Split Button ---
  const sb = getSplitBtnCenter();
  ctx.beginPath();
  ctx.arc(sb.x, sb.y, SPLIT_BTN_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('SPLIT', sb.x, sb.y + 4);

  // --- Pause Button (top-left) ---
  const pb = getPauseBtnRect();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  const rr = 6;
  ctx.moveTo(pb.x + rr, pb.y);
  ctx.lineTo(pb.x + pb.w - rr, pb.y);
  ctx.quadraticCurveTo(pb.x + pb.w, pb.y, pb.x + pb.w, pb.y + rr);
  ctx.lineTo(pb.x + pb.w, pb.y + pb.h - rr);
  ctx.quadraticCurveTo(pb.x + pb.w, pb.y + pb.h, pb.x + pb.w - rr, pb.y + pb.h);
  ctx.lineTo(pb.x + rr, pb.y + pb.h);
  ctx.quadraticCurveTo(pb.x, pb.y + pb.h, pb.x, pb.y + pb.h - rr);
  ctx.lineTo(pb.x, pb.y + rr);
  ctx.quadraticCurveTo(pb.x, pb.y, pb.x + rr, pb.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pause icon (two bars)
  const barW = 4;
  const barH = 14;
  const barGap = 5;
  const bcx = pb.x + pb.w / 2;
  const bcy = pb.y + pb.h / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(bcx - barGap / 2 - barW, bcy - barH / 2, barW, barH);
  ctx.fillRect(bcx + barGap / 2, bcy - barH / 2, barW, barH);

  // --- Aim indicator ---
  if (aimTouch) {
    ctx.beginPath();
    ctx.arc(aimTouch.curX, aimTouch.curY, 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Small crosshair dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(aimTouch.curX, aimTouch.curY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
