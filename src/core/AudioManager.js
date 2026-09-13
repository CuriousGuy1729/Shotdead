export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sounds = new Map();
    this.enabled = true;
    this.init();
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
      
      // Create procedural sound buffers
      this.createProceduralSounds();
    } catch (e) {
      console.warn('Audio not supported', e);
      this.enabled = false;
    }
  }

  createProceduralSounds() {
    // Vandal gunshot - layered: punch + crack + tail
    this.sounds.set('vandal', this.createGunshotSound(180, 0.15, true));
    this.sounds.set('classic', this.createGunshotSound(320, 0.08, false));
    this.sounds.set('headshot', this.createHeadshotSound());
    this.sounds.set('hit', this.createHitSound());
    this.sounds.set('reload', this.createReloadSound());
    this.sounds.set('footstep', this.createFootstepSound());
    this.sounds.set('dash', this.createDashSound());
    this.sounds.set('flash', this.createFlashSound());
    this.sounds.set('smoke', this.createSmokeSound());
    this.sounds.set('kill', this.createKillSound());
    this.sounds.set('empty', this.createEmptySound());
  }

  createGunshotSound(freq, duration, isRifle) {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      
      // Low punch
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.frequency.setValueAtTime(freq * 0.5, now);
      osc1.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain1.gain.setValueAtTime(1, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc1.connect(gain1).connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Mid crack
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 2.5, now);
      osc2.frequency.exponentialRampToValueAtTime(freq, now + 0.05);
      gain2.gain.setValueAtTime(0.6, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + duration);
      osc2.connect(gain2).connect(this.masterGain);
      osc2.start(now);
      osc2.stop(now + duration + 0.05);

      // Noise burst
      const bufferSize = this.ctx.sampleRate * 0.1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(isRifle ? 0.8 : 0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isRifle ? 2000 : 3500;
      filter.Q.value = 1;
      noise.connect(filter).connect(noiseGain).connect(this.masterGain);
      noise.start(now);

      // Tail reverb (simulated with delay)
      if (isRifle) {
        const delay = this.ctx.createDelay();
        delay.delayTime.value = 0.08;
        const fb = this.ctx.createGain();
        fb.gain.value = 0.25;
        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.3, now);
        tailGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        noiseGain.connect(delay).connect(fb).connect(delay);
        delay.connect(tailGain).connect(this.masterGain);
      }
    };
  }

  createHeadshotSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
      
      // Second harmonic
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.frequency.setValueAtTime(2400, now);
      gain2.gain.setValueAtTime(0.4, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc2.connect(gain2).connect(this.masterGain);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.2);
    };
  }

  createHitSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
    };
  }

  createKillSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      [0, 0.12, 0.24].forEach((d, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 600 + i * 300;
        gain.gain.setValueAtTime(0.5, now + d);
        gain.gain.exponentialRampToValueAtTime(0.01, now + d + 0.15);
        osc.connect(gain).connect(this.masterGain);
        osc.start(now + d);
        osc.stop(now + d + 0.2);
      });
    };
  }

  createReloadSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      // Metallic clicks
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.25;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 2000 + Math.random() * 1000;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.06);
      }
    };
  }

  createFootstepSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.16);
    };
  }

  createDashSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.35);
    };
  }

  createFlashSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 3000;
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.9);
    };
  }

  createSmokeSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.6;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.3 * Math.sin(Math.PI * i / bufferSize);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      src.connect(filter).connect(gain).connect(this.masterGain);
      src.start(now);
    };
  }

  createEmptySound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 120;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
    };
  }

  play(name, volume = 1) {
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const fn = this.sounds.get(name);
    if (fn) {
      const prev = this.masterGain.gain.value;
      this.masterGain.gain.value = prev * volume;
      fn();
      setTimeout(() => { this.masterGain.gain.value = prev; }, 50);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
