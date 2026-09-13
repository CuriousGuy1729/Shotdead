export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sounds = new Map();
    this.enabled = true;
    this.listener = null;
    this.pannerNodes = new Map();
    this.init();
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;
      this.masterGain.connect(this.ctx.destination);
      this.listener = this.ctx.listener;
      this.createProceduralSounds();
    } catch (e) {
      console.warn('Audio not supported', e);
      this.enabled = false;
    }
  }

  createProceduralSounds() {
    this.sounds.set('vandal', this.createGunshotSound(165, 0.16, true, 0.9));
    this.sounds.set('phantom', this.createGunshotSound(195, 0.12, true, 0.6, true));
    this.sounds.set('operator', this.createGunshotSound(90, 0.32, true, 1.4));
    this.sounds.set('sheriff', this.createGunshotSound(280, 0.14, false, 1.1));
    this.sounds.set('classic', this.createGunshotSound(320, 0.08, false, 0.7));
    this.sounds.set('headshot', this.createHeadshotSound());
    this.sounds.set('hit', this.createHitSound());
    this.sounds.set('hit_armor', this.createHitArmorSound());
    this.sounds.set('kill', this.createKillSound());
    this.sounds.set('reload', this.createReloadSound());
    this.sounds.set('footstep_concrete', this.createFootstepSound(80, 'concrete'));
    this.sounds.set('footstep_metal', this.createFootstepSound(120, 'metal'));
    this.sounds.set('dash', this.createDashSound());
    this.sounds.set('flash', this.createFlashSound());
    this.sounds.set('smoke', this.createSmokeSound());
    this.sounds.set('empty', this.createEmptySound());
    this.sounds.set('spike_plant', this.createSpikePlantSound());
    this.sounds.set('spike_beep', this.createSpikeBeepSound());
    this.sounds.set('spike_defuse', this.createSpikeDefuseSound());
    this.sounds.set('buy', this.createBuySound());
    this.sounds.set('wallbang', this.createWallbangSound());
  }

  createGunshotSound(freq, duration, isRifle, volume = 1, suppressed = false) {
    return (pos = null) => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const master = this.getSpatialGain(pos);

      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.frequency.setValueAtTime(freq * 0.5, now);
      osc1.frequency.exponentialRampToValueAtTime(38, now + 0.09);
      gain1.gain.setValueAtTime(volume, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc1.connect(gain1).connect(master);
      osc1.start(now); osc1.stop(now + 0.22);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(suppressed ? freq * 1.2 : freq * 2.6, now);
      osc2.frequency.exponentialRampToValueAtTime(freq, now + 0.05);
      gain2.gain.setValueAtTime(suppressed ? 0.25 : 0.62, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + duration);
      osc2.connect(gain2).connect(master);
      osc2.start(now); osc2.stop(now + duration + 0.06);

      const bufferSize = this.ctx.sampleRate * 0.11;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random()*2-1) * Math.pow(1 - i/bufferSize, suppressed ? 1.2 : 2.2);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(isRifle ? (suppressed ? 0.32 : 0.82) : 0.42, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + (suppressed ? 0.08 : 0.13));
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = suppressed ? 900 : (isRifle ? 2100 : 3600);
      filter.Q.value = 1.1;
      noise.connect(filter).connect(noiseGain).connect(master);
      noise.start(now);

      if (isRifle && !suppressed) {
        const delay = this.ctx.createDelay();
        delay.delayTime.value = 0.084;
        const fb = this.ctx.createGain(); fb.gain.value = 0.26;
        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.32, now);
        tailGain.gain.exponentialRampToValueAtTime(0.01, now + 0.42);
        noiseGain.connect(delay).connect(fb).connect(delay);
        delay.connect(tailGain).connect(master);
      }
    };
  }

  createHeadshotSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.exponentialRampToValueAtTime(2420, now + 0.09);
      gain.gain.setValueAtTime(0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now + 0.26);
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.frequency.setValueAtTime(2420, now);
      gain2.gain.setValueAtTime(0.42, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc2.connect(gain2).connect(this.masterGain);
      osc2.start(now+0.02); osc2.stop(now+0.21);
    };
  }

  createHitSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 820;
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.09);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.11);
    };
  }

  createHitArmorSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      const gain = this.ctx.createGain();
      osc.frequency.value = 240;
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.14);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.16);
    };
  }

  createKillSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      [0,0.12,0.24].forEach((d,i)=>{
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 600 + i*300;
        gain.gain.setValueAtTime(0.52, now+d);
        gain.gain.exponentialRampToValueAtTime(0.01, now+d+0.16);
        osc.connect(gain).connect(this.masterGain);
        osc.start(now+d); osc.stop(now+d+0.21);
      });
    };
  }

  createReloadSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      for (let i=0;i<3;i++){
        const t = now + i*0.26;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 2000 + Math.random()*1100;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t+0.06);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t); osc.stop(t+0.07);
      }
    };
  }

  createFootstepSound(freq, mat) {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq*0.5, now+0.11);
      gain.gain.setValueAtTime(mat==='metal'?0.18:0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.16);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.17);
      if (mat==='metal'){
        const osc2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        osc2.frequency.value = freq*3.2;
        g2.gain.setValueAtTime(0.08, now);
        g2.gain.exponentialRampToValueAtTime(0.01, now+0.08);
        osc2.connect(g2).connect(this.masterGain);
        osc2.start(now); osc2.stop(now+0.09);
      }
    };
  }

  createDashSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(820, now+0.21);
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.32);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.36);
    };
  }

  createFlashSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 3100;
      gain.gain.setValueAtTime(0.62, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.82);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.92);
    };
  }

  createSmokeSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate*0.62;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1)*0.32*Math.sin(Math.PI*i/bufferSize);
      const src = this.ctx.createBufferSource(); src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.62);
      const filter = this.ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=820;
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
      osc.frequency.value=120;
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.09);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.11);
    };
  }

  createSpikePlantSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      for (let i=0;i<4;i++){
        const t = now + i*0.18;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 440 + i*80;
        gain.gain.setValueAtTime(0.32, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t+0.12);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t); osc.stop(t+0.14);
      }
    };
  }

  createSpikeBeepSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.18);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.2);
    };
  }

  createSpikeDefuseSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(300, now+0.8);
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.setValueAtTime(0.42, now+0.6);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.82);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.84);
    };
  }

  createBuySound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(900, now+0.12);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.18);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now); osc.stop(now+0.2);
    };
  }

  createWallbangSound() {
    return () => {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate*0.08;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/bufferSize,1.5)*0.6;
      const src = this.ctx.createBufferSource(); src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now+0.09);
      src.connect(gain).connect(this.masterGain);
      src.start(now);
    };
  }

  getSpatialGain(pos) {
    if (!pos || !this.ctx) return this.masterGain;
    // Simple distance attenuation - could use PannerNode for HRTF
    return this.masterGain;
  }

  play(name, volume = 1, pos = null) {
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const fn = this.sounds.get(name);
    if (fn) {
      const prev = this.masterGain.gain.value;
      this.masterGain.gain.value = prev * volume;
      fn(pos);
      setTimeout(()=>{ this.masterGain.gain.value = prev; }, 60);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  updateListener(position, orientation) {
    if (!this.enabled || !this.listener) return;
    if (this.listener.positionX) {
      this.listener.positionX.value = position.x;
      this.listener.positionY.value = position.y;
      this.listener.positionZ.value = position.z;
    }
  }
}
