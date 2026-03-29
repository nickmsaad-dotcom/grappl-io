// Continuous game mode — no rounds or timer, just ongoing play

export class Round {
  constructor() {
    this.phase = 'PLAYING';
    this.killfeed = [];
  }

  update() {
    // Always playing — nothing to do
    return false;
  }

  addKill(killerName, victimName) {
    this.killfeed.push({ killer: killerName, victim: victimName, time: Date.now() });
    // Keep only last 5
    if (this.killfeed.length > 5) {
      this.killfeed.shift();
    }
  }

  serialize() {
    return {
      phase: this.phase,
      killfeed: this.killfeed.slice(-5),
    };
  }
}
