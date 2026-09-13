import * as THREE from 'three';

export class AbilitySystem {
  constructor(scene, camera, map, particles, audio) {
    this.scene = scene;
    this.camera = camera;
    this.map = map;
    this.particles = particles;
    this.audio = audio;
    
    this.cooldowns = {
      smoke: 0,
      flash: 0,
      dash: 0,
      ultimate: 0
    };
    
    this.maxCooldowns = {
      smoke: 12000,
      flash: 8000,
      dash: 4000,
      ultimate: 45000
    };
    
    this.smokes = [];
    this.flashes = [];
    this.activeUltimate = false;
    this.ultimateTimer = 0;
  }

  canUse(ability) {
    return this.cooldowns[ability] <= 0;
  }

  useSmoke(position, direction) {
    if (!this.canUse('smoke')) return false;
    
    this.cooldowns.smoke = this.maxCooldowns.smoke;
    this.audio.play('smoke');
    
    // Projectile
    const projGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      emissive: 0x444444,
      emissiveIntensity: 0.5
    });
    const proj = new THREE.Mesh(projGeo, projMat);
    proj.position.copy(position);
    this.scene.add(proj);
    
    const velocity = direction.clone().multiplyScalar(18);
    velocity.y += 2;
    
    let time = 0;
    const animate = () => {
      time += 0.016;
      proj.position.add(velocity.clone().multiplyScalar(0.016));
      velocity.y -= 9.8 * 0.016;
      
      // Check collision
      const hit = this.map.checkCollision(proj.position, 0.1);
      if (hit || time > 3 || proj.position.y < 0.2) {
        this.scene.remove(proj);
        const smokePos = proj.position.clone();
        smokePos.y = Math.max(0.2, smokePos.y);
        const smoke = this.particles.createSmokeGrenade(smokePos, 0x666666);
        this.smokes.push({ mesh: smoke, pos: smokePos, time: performance.now() });
        
        // Remove after 12 sec
        setTimeout(() => {
          const idx = this.smokes.findIndex(s => s.mesh === smoke);
          if (idx !== -1) this.smokes.splice(idx, 1);
        }, 12000);
        
        return;
      }
      
      requestAnimationFrame(animate);
    };
    animate();
    
    this.updateHUD();
    return true;
  }

  useFlash(position, direction, playerPos) {
    if (!this.canUse('flash')) return false;
    
    this.cooldowns.flash = this.maxCooldowns.flash;
    this.audio.play('flash');
    
    const projGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0xffffaa,
      emissive: 0xffff00,
      emissiveIntensity: 2
    });
    const proj = new THREE.Mesh(projGeo, projMat);
    proj.position.copy(position);
    this.scene.add(proj);
    
    const velocity = direction.clone().multiplyScalar(20);
    
    let time = 0;
    const animate = () => {
      time += 0.016;
      proj.position.add(velocity.clone().multiplyScalar(0.016));
      velocity.y -= 9.8 * 0.016 * 0.5;
      
      if (time > 1.2 || this.map.checkCollision(proj.position, 0.1)) {
        this.scene.remove(proj);
        this.detonateFlash(proj.position.clone(), playerPos);
        return;
      }
      requestAnimationFrame(animate);
    };
    animate();
    
    this.updateHUD();
    return true;
  }

  detonateFlash(pos, playerPos) {
    this.particles.createFlashEffect(pos, 3);
    
    const flashLight = new THREE.PointLight(0xffffff, 20, 25);
    flashLight.position.copy(pos);
    this.scene.add(flashLight);
    
    // Check if player is flashed
    const toPlayer = playerPos.clone().sub(pos);
    const dist = toPlayer.length();
    toPlayer.normalize();
    
    // Simple visibility check - dot product with camera forward
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const dot = camForward.dot(toPlayer.clone().negate());
    
    if (dist < 18 && dot > -0.3) {
      const intensity = Math.max(0, 1 - dist / 18) * (dot > 0.5 ? 1 : 0.6);
      if (intensity > 0.15) {
        this.applyFlashToPlayer(intensity);
      }
    }
    
    // Flash bots
    this.flashes.push({ pos: pos.clone(), time: performance.now(), intensity: 1 });
    
    setTimeout(() => this.scene.remove(flashLight), 150);
    setTimeout(() => {
      this.flashes = this.flashes.filter(f => performance.now() - f.time < 3000);
    }, 3000);
  }

  applyFlashToPlayer(intensity) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = '#ffffff';
    overlay.style.zIndex = '1000';
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = intensity;
    document.body.appendChild(overlay);
    
    let op = intensity;
    const fade = () => {
      op -= 0.02;
      overlay.style.opacity = op;
      if (op > 0) requestAnimationFrame(fade);
      else overlay.remove();
    };
    setTimeout(() => requestAnimationFrame(fade), intensity * 800);
  }

  isFlashed(position) {
    const now = performance.now();
    for (const flash of this.flashes) {
      const age = now - flash.time;
      if (age < 2500) {
        const dist = position.distanceTo(flash.pos);
        if (dist < 16) {
          const remaining = 1 - age / 2500;
          if (remaining > 0.2) return remaining * (1 - dist / 16);
        }
      }
    }
    return 0;
  }

  isInSmoke(position) {
    for (const smoke of this.smokes) {
      if (position.distanceTo(smoke.pos) < 5 * smoke.mesh.scale.x) {
        return true;
      }
    }
    return false;
  }

  useDash(player, direction) {
    if (!this.canUse('dash')) return false;
    
    this.cooldowns.dash = this.maxCooldowns.dash;
    this.audio.play('dash');
    
    const dashDir = direction.clone();
    dashDir.y = 0;
    dashDir.normalize();
    
    // Add slight upward if looking up
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    if (camDir.y > 0.3) dashDir.y = 0.2;
    
    player.dash(dashDir.multiplyScalar(12));
    
    // Visual effect - speed lines
    const dashEffect = document.createElement('div');
    dashEffect.style.position = 'fixed';
    dashEffect.style.inset = '0';
    dashEffect.style.background = 'radial-gradient(ellipse at center, transparent 30%, rgba(13,190,245,0.15) 100%)';
    dashEffect.style.pointerEvents = 'none';
    dashEffect.style.zIndex = '20';
    document.body.appendChild(dashEffect);
    setTimeout(() => dashEffect.remove(), 250);
    
    this.updateHUD();
    return true;
  }

  useUltimate() {
    if (!this.canUse('ultimate')) return false;
    
    this.cooldowns.ultimate = this.maxCooldowns.ultimate;
    this.activeUltimate = true;
    this.ultimateTimer = 6; // 6 seconds
    
    // Overdrive effect - screen border
    const ultOverlay = document.createElement('div');
    ultOverlay.id = 'ultOverlay';
    ultOverlay.style.position = 'fixed';
    ultOverlay.style.inset = '0';
    ultOverlay.style.border = '3px solid #ff4655';
    ultOverlay.style.boxShadow = 'inset 0 0 100px rgba(255,70,85,0.3), 0 0 50px rgba(255,70,85,0.5)';
    ultOverlay.style.pointerEvents = 'none';
    ultOverlay.style.zIndex = '15';
    ultOverlay.style.animation = 'pulse 0.5s infinite alternate';
    document.body.appendChild(ultOverlay);
    
    const style = document.createElement('style');
    style.textContent = '@keyframes pulse{from{opacity:0.8}to{opacity:1}}';
    document.head.appendChild(style);
    
    const interval = setInterval(() => {
      this.ultimateTimer -= 0.1;
      if (this.ultimateTimer <= 0) {
        this.activeUltimate = false;
        clearInterval(interval);
        ultOverlay.remove();
        style.remove();
      }
    }, 100);
    
    this.updateHUD();
    return true;
  }

  update(delta) {
    // Update cooldowns
    Object.keys(this.cooldowns).forEach(key => {
      if (this.cooldowns[key] > 0) {
        this.cooldowns[key] -= delta * 1000;
        if (this.cooldowns[key] < 0) this.cooldowns[key] = 0;
      }
    });
    
    this.updateHUD();
  }

  updateHUD() {
    const abilities = [
      { id: 'abilityC', key: 'smoke' },
      { id: 'abilityQ', key: 'flash' },
      { id: 'abilityE', key: 'dash' },
      { id: 'abilityX', key: 'ultimate' }
    ];
    
    abilities.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cd = this.cooldowns[key];
      const max = this.maxCooldowns[key];
      
      if (cd > 0) {
        el.classList.add('on-cooldown');
        el.querySelector('.ability-cooldown').textContent = Math.ceil(cd / 1000);
      } else {
        el.classList.remove('on-cooldown');
      }
      
      if (key === 'ultimate' && cd <= 0) {
        el.classList.add('active');
      } else if (key === 'ultimate') {
        el.classList.remove('active');
      }
    });
  }

  reset() {
    Object.keys(this.cooldowns).forEach(k => this.cooldowns[k] = 0);
    this.smokes.forEach(s => this.scene.remove(s.mesh));
    this.smokes = [];
    this.flashes = [];
    this.activeUltimate = false;
  }
}
