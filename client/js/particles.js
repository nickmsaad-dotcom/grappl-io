// Lightweight particle system for visual effects

const particles = [];

export function spawnDeathBurst(x, y, color) {
  const count = 20;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 150 + Math.random() * 300;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.6 + Math.random() * 0.4,
      radius: 2 + Math.random() * 4,
      color,
    });
  }
}

export function spawnHookTrail(x, y, color) {
  particles.push({
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    vx: (Math.random() - 0.5) * 30,
    vy: (Math.random() - 0.5) * 30,
    life: 0.2 + Math.random() * 0.2,
    maxLife: 0.3,
    radius: 1.5 + Math.random() * 2,
    color,
  });
}

export function spawnFlingBurst(x, y, color) {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.3,
      maxLife: 0.4,
      radius: 1.5 + Math.random() * 3,
      color,
    });
  }
}

// Player movement trail — subtle afterimage
const MAX_PARTICLES = 300;

export function spawnTrail(x, y, radius, color, speed) {
  if (speed < 80 || particles.length > MAX_PARTICLES) return;
  const alpha = Math.min(1, speed / 400);
  particles.push({
    x: x + (Math.random() - 0.5) * radius * 0.5,
    y: y + (Math.random() - 0.5) * radius * 0.5,
    vx: (Math.random() - 0.5) * 10,
    vy: (Math.random() - 0.5) * 10,
    life: 0.15 + alpha * 0.15,
    maxLife: 0.3,
    radius: radius * 0.3 * alpha,
    color,
  });
}

// Mass steal spark effect — electric sparks between two points
export function spawnStealSparks(fromX, fromY, toX, toY, color) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 150;
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.2 + Math.random() * 0.2,
      maxLife: 0.3,
      radius: 1 + Math.random() * 2,
      color: Math.random() > 0.5 ? color : '#ffffff',
    });
  }
}

// Food absorption — small sparkle when eating food
export function spawnFoodAbsorb(x, y, color) {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 60;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.15 + Math.random() * 0.1,
      maxLife: 0.25,
      radius: 1 + Math.random() * 2,
      color,
    });
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

export function drawParticles(ctx) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export function getParticles() {
  return particles;
}
