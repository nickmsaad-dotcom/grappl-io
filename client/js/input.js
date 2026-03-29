// Input capture: keyboard + mouse

const keys = {};
let mouseX = 0;
let mouseY = 0;
let mouseAngle = 0;
let fireQueued = false;
let releaseQueued = false;
let splitQueued = false;
let canvasRect = { left: 0, top: 0 };
let cameraTransform = { offsetX: 0, offsetY: 0, scale: 1 };

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    // Prevent scrolling and macOS accent picker on held keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
         'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
      e.preventDefault();
    }
    // Edge-detect Space for split
    if (e.key === ' ' && !e.repeat) {
      splitQueued = true;
    }
  });

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

  // Prevent context menu
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function setCameraTransform(offsetX, offsetY, scale) {
  cameraTransform = { offsetX, offsetY, scale };
}

export function getMouseAngle(playerX, playerY) {
  // Convert screen mouse position to game coordinates
  const scale = cameraTransform.scale || 1;
  const gameMouseX = (mouseX - cameraTransform.offsetX) / scale;
  const gameMouseY = (mouseY - cameraTransform.offsetY) / scale;

  return Math.atan2(gameMouseY - playerY, gameMouseX - playerX);
}

export function getInput(playerX, playerY) {
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
