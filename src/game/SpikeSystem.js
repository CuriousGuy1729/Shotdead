import * as THREE from 'three';

export class SpikeSystem {
  constructor(scene, map, particles, audio) {
    this.scene = scene;
    this.map = map;
    this.particles = particles;
    this.audio = audio;
    this.spike = null;
    this.spikeState = 'carried'; // carried, planted, defused, exploded
    this.plantTime = 0;
    this.defuseTime = 0;
    this.plantDuration = 3.5;
    this.defuseDuration = 7;
    this.explodeDuration = 45;
    this.explodeTimer = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.isPlanting = false;
    this.isDefusing = false;
    this.plantSite = null;
    this.createSpike();
  }

  createSpike() {
    const spikeGeo = new THREE.BoxGeometry(0.18, 0.22, 0.18);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff4655, emissive: 0xff4655, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.4 });
    this.spike = new THREE.Mesh(spikeGeo, spikeMat);
    this.spike.visible = false;
    this.scene.add(this.spike);

    // Spike glow
    const glowGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4655, transparent: true, opacity: 0.32 });
    this.spikeGlow = new THREE.Mesh(glowGeo, glowMat);
    this.spike.add(this.spikeGlow);
  }

  startPlant(playerPos) {
    if (this.spikeState !== 'carried') return false;
    const site = this.map.isInSpikeSite(playerPos);
    if (!site) return false;
    this.isPlanting = true;
    this.plantSite = site;
    this.plantProgress = 0;
    this.plantTime = performance.now();
    return true;
  }

  updatePlant(delta, isHolding) {
    if (!this.isPlanting) return null;
    if (!isHolding) {
      this.isPlanting = false;
      this.plantProgress = 0;
      return { progress: 0, cancelled: true };
    }
    const elapsed = (performance.now() - this.plantTime) / 1000;
    this.plantProgress = Math.min(1, elapsed / this.plantDuration);
    if (this.plantProgress >= 1) {
      this.plant();
      this.isPlanting = false;
      return { progress: 1, completed: true };
    }
    return { progress: this.plantProgress };
  }

  plant() {
    this.spikeState = 'planted';
    this.spike.position.copy(this.plantSite.pos);
    this.spike.position.y = 0.2;
    this.spike.visible = true;
    this.explodeTimer = this.explodeDuration;
    this.audio.play('spike_plant');
    this.particles.createSpikePlantEffect(this.spike.position.clone());

    // Plant light
    this.plantLight = new THREE.PointLight(0xff4655, 3, 18);
    this.plantLight.position.copy(this.spike.position);
    this.plantLight.position.y += 1;
    this.scene.add(this.plantLight);

    // Show spike status in HUD
    document.getElementById('spikeStatus').style.display = 'flex';
    document.getElementById('spikeCarry').style.display = 'none';
  }

  startDefuse(playerPos) {
    if (this.spikeState !== 'planted') return false;
    if (playerPos.distanceTo(this.spike.position) > 2.5) return false;
    this.isDefusing = true;
    this.defuseProgress = 0;
    this.defuseTime = performance.now();
    return true;
  }

  updateDefuse(delta, isHolding) {
    if (!this.isDefusing) return null;
    if (!isHolding) {
      this.isDefusing = false;
      this.defuseProgress = 0;
      return { progress: 0, cancelled: true };
    }
    const elapsed = (performance.now() - this.defuseTime) / 1000;
    this.defuseProgress = Math.min(1, elapsed / this.defuseDuration);
    if (this.defuseProgress >= 1) {
      this.defuse();
      this.isDefusing = false;
      return { progress: 1, completed: true };
    }
    return { progress: this.defuseProgress };
  }

  defuse() {
    this.spikeState = 'defused';
    this.spike.visible = false;
    if (this.plantLight) this.scene.remove(this.plantLight);
    this.audio.play('spike_defuse');
    document.getElementById('spikeStatus').style.display = 'none';
    return true;
  }

  update(delta) {
    if (this.spikeState === 'planted') {
      this.explodeTimer -= delta;
      const beepInterval = this.explodeTimer > 20 ? 1.2 : this.explodeTimer > 10 ? 0.6 : 0.3;
      if (!this._lastBeep || performance.now() - this._lastBeep > beepInterval * 1000) {
        this.audio.play('spike_beep', 0.7);
        this._lastBeep = performance.now();
        // Pulse light
        if (this.plantLight) {
          this.plantLight.intensity = 3 + Math.sin(performance.now() * 0.01) * 1.5;
        }
      }
      document.getElementById('spikeText').textContent = `SPIKE PLANTED - ${this.explodeTimer.toFixed(1)}`;
      if (this.explodeTimer <= 0) {
        this.explode();
      }
    }
    // Rotate spike when carried? Glow pulse
    if (this.spikeGlow) {
      this.spikeGlow.scale.setScalar(1 + Math.sin(performance.now() * 0.005) * 0.15);
    }
  }

  explode() {
    this.spikeState = 'exploded';
    this.spike.visible = false;
    if (this.plantLight) this.scene.remove(this.plantLight);
    // Explosion effect
    const explosionLight = new THREE.PointLight(0xff4400, 12, 45);
    explosionLight.position.copy(this.spike.position);
    this.scene.add(explosionLight);
    for (let i = 0; i < 18; i++) {
      const geo = new THREE.SphereGeometry(0.12 + Math.random() * 0.22, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(this.spike.position);
      this.scene.add(p);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6);
      let life = 1;
      const anim = () => {
        life -= 0.022;
        p.position.add(vel.clone().multiplyScalar(0.06));
        vel.y -= 0.12;
        p.material.opacity = life;
        if (life > 0) requestAnimationFrame(anim);
        else this.scene.remove(p);
      };
      requestAnimationFrame(anim);
    }
    setTimeout(() => this.scene.remove(explosionLight), 600);
    document.getElementById('spikeStatus').style.display = 'none';
  }

  reset() {
    this.spikeState = 'carried';
    this.spike.visible = false;
    this.isPlanting = false;
    this.isDefusing = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.explodeTimer = 0;
    if (this.plantLight) this.scene.remove(this.plantLight);
    document.getElementById('spikeStatus').style.display = 'none';
    document.getElementById('spikeCarry').style.display = 'block';
  }

  isCarried() { return this.spikeState === 'carried'; }
  isPlanted() { return this.spikeState === 'planted'; }
}
