// Arena
export const ARENA_WIDTH = 4000;
export const ARENA_HEIGHT = 4000;
export const SOFT_BOUNDARY = 0;
export const KILL_BOUNDARY = 9999;      // Effectively disabled — players bounce off edges

// Player
export const MIN_PLAYER_RADIUS = 18;
export const MAX_PLAYER_RADIUS = 150;
export const BASE_SPEED = 540;          // px/s at minimum size
export const SIZE_SPEED_FACTOR = 0.22;  // Sqrt-based: bigger = slower but not crawling
export const BASE_ACCEL = 3600;         // px/s^2 at minimum size
export const FRICTION = 0.82;
export const INVULN_DURATION = 1.5;

// Eating
export const SIZE_EAT_RATIO = 1.15;    // Must be 15% bigger radius to eat another player
export const MASS_ABSORB_RATIO = 0.8;  // Gain 80% of eaten player's mass
export const MASS_DECAY_RATE = 0.001;  // Lose this fraction of mass per second (keeps big players in check)
export const MIN_MASS = 1.0;

// Food
export const FOOD_COUNT = 500;          // Total food on map at any time
export const FOOD_RADIUS = 5;
export const FOOD_MASS = 0.15;          // Mass gained per food eaten
export const FOOD_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff6fff', '#45f0df', '#ffa07a', '#c792ea',
  '#ff4757', '#70a1ff', '#7bed9f', '#eccc68'
];

// Hook (targets food and terrain)
export const HOOK_SPEED = 1800;         // px/s
export const HOOK_RANGE = 350;          // Max travel distance
export const HOOK_RADIUS = 30;          // Wide sweep to grab food
export const HOOK_COOLDOWN = 0.3;
export const HOOK_FOOD_PULL = 800;      // Speed food travels toward player when hooked
export const HOOK_GATHER_RADIUS = 50;   // Grabs all food within this radius of hook tip

// Terrain anchoring (slingshot)
export const SWING_FORCE = 2800;        // Centripetal pull toward anchor
export const SWING_MAX_SPEED = 900;     // Max tangential speed while swinging
export const SWING_ROPE_LENGTH_MAX = 350; // Max rope length when anchored

// Spike obstacles
export const SPIKE_DAMAGE_RATE = 1.2;   // Fraction of mass lost per second while touching spikes (percentage-based)
export const SPIKE_KNOCKBACK = 500;     // Velocity push when touching spikes

// Grapple combat
export const HOOK_PLAYER_PULL = 600;    // Speed to reel in a hooked smaller player
export const HOOK_MASS_STEAL = 0.07;    // Steal 7% of bigger player's mass
export const HOOK_STEAL_BOOST = 700;    // Velocity boost when stealing from bigger player
export const HOOK_PLAYER_RADIUS = 15;   // Hook must be within this distance of player center to hit

// Split & Merge
export const SPLIT_MIN_MASS = 2.0;        // Cell must have this to split
export const SPLIT_MAX_CELLS = 8;         // Max pieces per player
export const SPLIT_LAUNCH_SPEED = 700;    // Velocity burst for ejected cell
export const SPLIT_COOLDOWN = 0.3;        // Seconds between splits
export const MERGE_COOLDOWN = 15.0;       // Seconds before cells can re-merge
export const MERGE_DRIFT_SPEED = 80;      // px/s merge-ready cells drift together
export const SELF_PUSH_STRENGTH = 50;     // Keep non-merge-ready cells apart
export const CELL_MIN_MASS = 0.5;         // Cell removed if below this

// Power-ups
export const POWERUP_SPAWN_INTERVAL = 15;   // Seconds between spawns
export const POWERUP_MAX_ON_MAP = 3;
export const POWERUP_DESPAWN_TIME = 20;     // Seconds until despawn
export const POWERUP_RADIUS = 12;
export const POWERUP_TYPES = [
  { type: 'speed',   color: '#00ffff', duration: 5, label: 'SPEED' },
  { type: 'shield',  color: '#ffffff', duration: 4, label: 'SHIELD' },
  { type: 'magnet',  color: '#cc33ff', duration: 6, label: 'MAGNET' },
  { type: 'bomb',    color: '#ff6600', duration: 0, label: 'MASS BOMB' },
];
export const POWERUP_SPEED_MULT = 1.8;
export const POWERUP_MAGNET_RANGE = 200;
export const POWERUP_MAGNET_PULL = 300;     // Food pull speed
export const POWERUP_BOMB_RANGE = 250;
export const POWERUP_BOMB_STEAL = 0.3;      // Steal 30% of nearby players' mass

// Physics
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SEND_RATE = 60;

// Visuals
export const NEON_COLORS = [
  '#00ffff', '#ff00ff', '#00ff66', '#ffff00',
  '#ff3366', '#3399ff', '#ff6600', '#cc33ff',
  '#33ffcc', '#ff3333', '#66ff33', '#ff99cc'
];

// Obstacles — pillars (circles) and walls (rectangles)
// Pillars: { type: 'pillar', x, y, radius }
// Walls:   { type: 'wall', x, y, w, h }
export const OBSTACLES = [
  // Central cluster — creates a hub area (center pillar is spiked — dangerous!)
  { type: 'pillar', x: 2000, y: 2000, radius: 65, spike: true },
  { type: 'pillar', x: 1830, y: 1800, radius: 35 },
  { type: 'pillar', x: 2170, y: 2200, radius: 35 },

  // Quadrant pillars — anchor points for swinging (safe)
  { type: 'pillar', x: 1000, y: 1000, radius: 40 },
  { type: 'pillar', x: 3000, y: 1000, radius: 40 },
  { type: 'pillar', x: 1000, y: 3000, radius: 40 },
  { type: 'pillar', x: 3000, y: 3000, radius: 40 },

  // Mid-lane pillars (spiked — lane hazards)
  { type: 'pillar', x: 2000, y: 830, radius: 42, spike: true },
  { type: 'pillar', x: 2000, y: 3170, radius: 42, spike: true },
  { type: 'pillar', x: 830, y: 2000, radius: 42, spike: true },
  { type: 'pillar', x: 3170, y: 2000, radius: 42, spike: true },

  // Walls — create narrow passages (spiked walls — risky shortcuts)
  { type: 'wall', x: 1330, y: 1300, w: 20, h: 250, spike: true },
  { type: 'wall', x: 2630, y: 1300, w: 20, h: 250, spike: true },
  { type: 'wall', x: 1330, y: 2370, w: 20, h: 250, spike: true },
  { type: 'wall', x: 2630, y: 2370, w: 20, h: 250, spike: true },

  // Outer ring pillars — near edges for escape routes (safe)
  { type: 'pillar', x: 330, y: 2000, radius: 32 },
  { type: 'pillar', x: 3670, y: 2000, radius: 32 },
  { type: 'pillar', x: 2000, y: 330, radius: 32 },
  { type: 'pillar', x: 2000, y: 3670, radius: 32 },

  // Scatter pillars — variety across larger map (some spiked)
  { type: 'pillar', x: 1500, y: 670, radius: 25 },
  { type: 'pillar', x: 2500, y: 670, radius: 38, spike: true },
  { type: 'pillar', x: 1500, y: 3330, radius: 38, spike: true },
  { type: 'pillar', x: 2500, y: 3330, radius: 25 },
  { type: 'pillar', x: 670, y: 1500, radius: 38, spike: true },
  { type: 'pillar', x: 670, y: 2500, radius: 25 },
  { type: 'pillar', x: 3330, y: 1500, radius: 25 },
  { type: 'pillar', x: 3330, y: 2500, radius: 38, spike: true },

  // Extra pillars for the bigger map (safe anchors)
  { type: 'pillar', x: 600, y: 600, radius: 28 },
  { type: 'pillar', x: 3400, y: 600, radius: 28 },
  { type: 'pillar', x: 600, y: 3400, radius: 28 },
  { type: 'pillar', x: 3400, y: 3400, radius: 28 },
  { type: 'pillar', x: 2000, y: 1500, radius: 22 },
  { type: 'pillar', x: 2000, y: 2500, radius: 22 },
  { type: 'pillar', x: 1500, y: 2000, radius: 22 },
  { type: 'pillar', x: 2500, y: 2000, radius: 22 },
];

// Spawn points (16 spread around larger arena)
export const SPAWN_POINTS = [
  // 4 corners
  { x: 670, y: 670 },
  { x: 3330, y: 670 },
  { x: 670, y: 3330 },
  { x: 3330, y: 3330 },
  // 4 edge midpoints
  { x: 2000, y: 670 },
  { x: 2000, y: 3330 },
  { x: 670, y: 2000 },
  { x: 3330, y: 2000 },
  // 4 inner ring
  { x: 1300, y: 1300 },
  { x: 2700, y: 1300 },
  { x: 1300, y: 2700 },
  { x: 2700, y: 2700 },
  // 4 mid-lane (between center and edges)
  { x: 2000, y: 1300 },
  { x: 2000, y: 2700 },
  { x: 1300, y: 2000 },
  { x: 2700, y: 2000 },
];
