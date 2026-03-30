// Input capture: keyboard + mouse (desktop) or touch (mobile)

import { isMobile, initTouch, getTouchMovement, getTouchAimAngle, getTouchActions, getTouchAimScreenPos, setTouchCameraTransform } from './touch.js';

export { isMobile };

const keys = {};
let mouseX = null;
let mouseY = null;
let mouseAngle = 0;
let fireQueued = false;
let releaseQueued = false;
let splitQueued = false;
let canvasRect = { left: 0, top: 0 };
let cameraTransform = { offsetX: 0, offsetY: 0, scale: 1 };

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
  'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'
]);

export function initInput(canvas) {
  if (isMobile) {
    initTouch(canvas);
    return;
  }

  // Desktop: keyboard + mouse
  const isTyping = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  };

  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    keys[e.key] = true;
    if (GAME_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === ' ' && !e.repeat) {
      splitQueued = true;
    }
  }, { capture: true });

  window.addEventListener('keypress', (e) => {
    if (isTyping()) return;
    if (GAME_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });

  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    canvasRect = canvas.getBoundingClientRect();
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) fireQueued = true;
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) releaseQueued = true;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function setCameraTransform(offsetX, offsetY, scale) {
  cameraTransform = { offsetX, offsetY, scale };
  if (isMobile) setTouchCameraTransform(offsetX, offsetY, scale);
}

export function getMouseAngle(playerX, playerY) {
  const scale = cameraTransform.scale || 1;
  const mx = mouseX || 0;
  const my = mouseY || 0;
  const gameMouseX = (mx - cameraTransform.offsetX) / scale;
  const gameMouseY = (my - cameraTransform.offsetY) / scale;

  return Math.atan2(gameMouseY - playerY, gameMouseX - playerX);
}

export function getMouseScreenPos() {
  if (isMobile) return getTouchAimScreenPos();
  if (mouseX === null) return null;
  return { x: mouseX, y: mouseY };
}

export function getInput(playerX, playerY) {
  if (isMobile) {
    const touchKeys = getTouchMovement();
    const touchAngle = getTouchAimAngle(playerX, playerY);
    const actions = getTouchActions();

    return {
      keys: {
        w: touchKeys.w, a: touchKeys.a, s: touchKeys.s, d: touchKeys.d,
        ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
      },
      mouseAngle: touchAngle !== null ? touchAngle : 0,
      fire: actions.fire,
      release: actions.release,
      split: actions.split,
    };
  }

  // Desktop
  const angle = getMouseAngle(playerX, playerY);
  const input = {
    keys: {
      w: !!keys['w'] || !!keys['W'],
      a: !!keys['a'] || !!keys['A'],
      s: !!keys['s'] || !!keys['S'],
      d: !!keys['d'] || !!keys['D'],
      ArrowUp: !!keys['ArrowUp'],
      ArrowDown: !!keys['ArrowDown'],
      ArrowLeft: !!keys['ArrowLeft'],
      ArrowRight: !!keys['ArrowRight'],
    },
    mouseAngle: angle,
    fire: fireQueued,
    release: releaseQueued,
    split: splitQueued,
  };

  fireQueued = false;
  releaseQueued = false;
  splitQueued = false;

  return input;
}
