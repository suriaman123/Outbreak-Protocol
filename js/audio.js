// ==========================================================
// All sound is synthesized at runtime with the Web Audio API.
// No external audio assets required, keeps the repo lightweight
// and avoids any licensing concerns for a GitHub Pages deploy.
// ==========================================================

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  // Must be called from a user-gesture handler (browsers block autoplay otherwise).
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._buildNoiseBuffer();
    this._startAmbience();
  }

  _buildNoiseBuffer() {
    const len = this.ctx.sampleRate; // 1 second of noise, looped
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  playGunshot(weaponId) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    let freq = 1800, q = 0.7, dur = 0.12, vol = 0.5;
    switch (weaponId) {
      case 'smg': freq = 2200; dur = 0.08; vol = 0.4; break;
      case 'rifle': freq = 1500; dur = 0.12; vol = 0.55; break;
      case 'shotgun': freq = 900; dur = 0.22; vol = 0.7; q = 0.4; break;
      case 'pistol': freq = 1800; dur = 0.09; vol = 0.45; break;
      case 'revolver': freq = 1100; dur = 0.18; vol = 0.65; break;
      case 'machinepistol': freq = 2400; dur = 0.07; vol = 0.35; break;
    }

    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);

    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + dur);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(vol * 0.6, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    thump.connect(thumpGain); thumpGain.connect(this.master);
    thump.start(t); thump.stop(t + dur + 0.02);
  }

  playMeleeSwing() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + 0.16);
  }

  playZombieGroan() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const baseFreq = 65 + Math.random() * 45;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.7, t + 0.6);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.13, t + 0.1);
    gain.gain.linearRampToValueAtTime(0, t + 0.7);
    osc.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + 0.75);
  }

  playZombieHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(250, t + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + 0.1);

    const pop = this.ctx.createOscillator();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(300, t);
    pop.frequency.exponentialRampToValueAtTime(140, t + 0.07);
    const popGain = this.ctx.createGain();
    popGain.gain.setValueAtTime(0.15, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    pop.connect(popGain); popGain.connect(this.master);
    pop.start(t); pop.stop(t + 0.08);
  }

  playZombieDeath() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + 0.42);
  }

  playPlayerHurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + 0.24);
  }

  playLevelUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.09, 0.18].forEach((delay, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = [440, 660, 880][i];
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.22, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
      osc.connect(gain); gain.connect(this.master);
      osc.start(t + delay); osc.stop(t + delay + 0.4);
    });
  }

  playLootPickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(1040, t + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + 0.22);
  }

  playReloadClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.1].forEach(delay => {
      const src = this._noiseSource();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.04);
      src.connect(filter); filter.connect(gain); gain.connect(this.master);
      src.start(t + delay); src.stop(t + delay + 0.05);
    });
  }

  _startAmbience() {
    const t = this.ctx.currentTime;
    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 46;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.045;
    drone.connect(droneGain); droneGain.connect(this.master);
    drone.start(t);

    const windSrc = this._noiseSource();
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 280;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.03;
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.master);
    windSrc.start(t);
  }
}

export const audio = new AudioManager();
