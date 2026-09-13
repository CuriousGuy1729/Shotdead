import * as THREE from 'three';
import { TextureGenerator } from '../utils/TextureGenerator.js';

export class WeaponSystem {
  constructor(scene, camera, audio) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.currentWeapon = 0; // 0 vandal, 1 classic, 2 knife
    this.weapons = [];
    this.isAiming = false;
    this.isReloading = false;
    this.isFiring = false;
    this.lastShotTime = 0;
    this.recoilX = 0;
    this.recoilY = 0;
    this.recoilPatternIndex = 0;
    this.weaponGroup = new THREE.Group();
    this.camera.add(this.weaponGroup);
    
    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 8);
    this.muzzleLight.visible = false;
    this.weaponGroup.add(this.muzzleLight);
    
    this.createWeapons();
    this.switchWeapon(0);
  }

  createWeapons() {
    // Shared materials - ultra realistic PBR
    const metalTex = TextureGenerator.createMetalTexture();
    const grunge = TextureGenerator.createGrungeMap();
    
    const matBlackMetal = new THREE.MeshStandardMaterial({
      color: 0x1a1d23,
      metalness: 0.85,
      roughness: 0.35,
      map: metalTex,
      roughnessMap: grunge,
      envMapIntensity: 1.2
    });
    
    const matGunmetal = new THREE.MeshStandardMaterial({
      color: 0x2a2e38,
      metalness: 0.8,
      roughness: 0.4,
      envMapIntensity: 1.0
    });
    
    const matPolymer = new THREE.MeshStandardMaterial({
      color: 0x111318,
      metalness: 0.1,
      roughness: 0.7,
      envMapIntensity: 0.3
    });
    
    const matBarrel = new THREE.MeshStandardMaterial({
      color: 0x0d0f14,
      metalness: 0.9,
      roughness: 0.25,
      envMapIntensity: 1.5
    });

    // VANDAL - Hyper detailed
    const vandal = new THREE.Group();
    vandal.name = 'VANDAL';
    
    // Receiver - main body
    const receiverGeo = new THREE.BoxGeometry(0.06, 0.08, 0.32);
    const receiver = new THREE.Mesh(receiverGeo, matBlackMetal);
    receiver.position.set(0, -0.05, -0.12);
    receiver.castShadow = true;
    vandal.add(receiver);
    
    // Top rail
    const railGeo = new THREE.BoxGeometry(0.025, 0.02, 0.34);
    const rail = new THREE.Mesh(railGeo, matGunmetal);
    rail.position.set(0, -0.005, -0.12);
    vandal.add(rail);
    
    // Barrel - long, with chamfer
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.55, 16);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matBarrel);
    barrel.position.set(0, -0.04, -0.52);
    barrel.castShadow = true;
    vandal.add(barrel);
    
    // Muzzle brake - detailed
    const brakeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 12);
    brakeGeo.rotateX(Math.PI / 2);
    const brake = new THREE.Mesh(brakeGeo, matGunmetal);
    brake.position.set(0, -0.04, -0.82);
    vandal.add(brake);
    
    // Handguard - with vents
    const handguardGeo = new THREE.BoxGeometry(0.07, 0.07, 0.28);
    const handguard = new THREE.Mesh(handguardGeo, matPolymer);
    handguard.position.set(0, -0.055, -0.42);
    vandal.add(handguard);
    
    // Handguard vents (3 slots)
    for (let i = 0; i < 3; i++) {
      const ventGeo = new THREE.BoxGeometry(0.072, 0.015, 0.04);
      const vent = new THREE.Mesh(ventGeo, new THREE.MeshStandardMaterial({ color: 0x000000 }));
      vent.position.set(0, -0.055, -0.32 - i * 0.07);
      vandal.add(vent);
    }
    
    // Magazine - angled
    const magGeo = new THREE.BoxGeometry(0.04, 0.16, 0.07);
    const mag = new THREE.Mesh(magGeo, matPolymer);
    mag.position.set(0, -0.16, -0.15);
    mag.rotation.x = -0.15;
    mag.castShadow = true;
    vandal.add(mag);
    
    // Grip
    const gripGeo = new THREE.BoxGeometry(0.035, 0.12, 0.05);
    const grip = new THREE.Mesh(gripGeo, matPolymer);
    grip.position.set(0, -0.16, -0.05);
    grip.rotation.x = -0.25;
    vandal.add(grip);
    
    // Stock - skeletonized
    const stockBaseGeo = new THREE.BoxGeometry(0.05, 0.06, 0.22);
    const stockBase = new THREE.Mesh(stockBaseGeo, matPolymer);
    stockBase.position.set(0, -0.04, 0.12);
    vandal.add(stockBase);
    
    const stockButtGeo = new THREE.BoxGeometry(0.06, 0.1, 0.03);
    const stockButt = new THREE.Mesh(stockButtGeo, matPolymer);
    stockButt.position.set(0, -0.05, 0.24);
    vandal.add(stockButt);
    
    // Sight - red dot
    const sightBaseGeo = new THREE.BoxGeometry(0.03, 0.04, 0.06);
    const sightBase = new THREE.Mesh(sightBaseGeo, matGunmetal);
    sightBase.position.set(0, 0.015, -0.18);
    vandal.add(sightBase);
    
    const sightLensGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.03, 16);
    sightLensGeo.rotateZ(Math.PI / 2);
    const sightLens = new THREE.Mesh(sightLensGeo, new THREE.MeshStandardMaterial({
      color: 0x440000,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xff1100,
      emissiveIntensity: 2.5
    }));
    sightLens.position.set(0, 0.02, -0.18);
    vandal.add(sightLens);
    
    // Charging handle
    const chargeGeo = new THREE.BoxGeometry(0.02, 0.015, 0.04);
    const charge = new THREE.Mesh(chargeGeo, matGunmetal);
    charge.position.set(0.035, -0.02, -0.08);
    vandal.add(charge);
    
    // Ejection port
    const ejectGeo = new THREE.BoxGeometry(0.001, 0.02, 0.06);
    const eject = new THREE.Mesh(ejectGeo, new THREE.MeshStandardMaterial({ color: 0x000000 }));
    eject.position.set(0.031, -0.03, -0.12);
    vandal.add(eject);
    
    vandal.position.set(0.32, -0.28, -0.55);
    vandal.rotation.set(0, -0.05, 0);
    
    // Classic pistol
    const classic = new THREE.Group();
    classic.name = 'CLASSIC';
    const pistolFrameGeo = new THREE.BoxGeometry(0.04, 0.06, 0.18);
    const pistolFrame = new THREE.Mesh(pistolFrameGeo, matBlackMetal);
    pistolFrame.position.set(0, -0.03, -0.1);
    classic.add(pistolFrame);
    
    const pistolBarrelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.15, 12);
    pistolBarrelGeo.rotateX(Math.PI/2);
    const pistolBarrel = new THREE.Mesh(pistolBarrelGeo, matBarrel);
    pistolBarrel.position.set(0, -0.02, -0.22);
    classic.add(pistolBarrel);
    
    const pistolGripGeo = new THREE.BoxGeometry(0.03, 0.09, 0.04);
    const pistolGrip = new THREE.Mesh(pistolGripGeo, matPolymer);
    pistolGrip.position.set(0, -0.11, -0.02);
    pistolGrip.rotation.x = -0.2;
    classic.add(pistolGrip);
    
    classic.position.set(0.28, -0.32, -0.45);
    
    // Knife
    const knife = new THREE.Group();
    knife.name = 'KNIFE';
    const bladeGeo = new THREE.BoxGeometry(0.01, 0.03, 0.28);
    // Taper blade
    const bladePos = bladeGeo.attributes.position;
    for (let i = 0; i < bladePos.count; i++) {
      const z = bladePos.getZ(i);
      if (z < -0.05) {
        const factor = 1 - (-0.05 - z) * 2;
        bladePos.setX(i, bladePos.getX(i) * Math.max(0.1, factor));
      }
    }
    bladePos.needsUpdate = true;
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xc0c5ce,
      metalness: 0.95,
      roughness: 0.15,
      envMapIntensity: 2
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, -0.02, -0.25);
    knife.add(blade);
    
    const handleGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.12, 8);
    handleGeo.rotateX(Math.PI/2);
    const handle = new THREE.Mesh(handleGeo, matPolymer);
    handle.position.set(0, -0.02, -0.05);
    knife.add(handle);
    
    knife.position.set(0.35, -0.3, -0.4);
    knife.rotation.set(0.2, -0.8, 0.1);
    
    this.weapons = [
      { 
        group: vandal, 
        name: 'VANDAL // 5.56 MK-IV - AUTO',
        damage: 39, // body, head 156
        headshotMultiplier: 4,
        fireRate: 600, // rpm
        magSize: 25,
        ammo: 25,
        reserve: 75,
        reloadTime: 2.1,
        recoilVertical: 0.018,
        recoilHorizontal: 0.008,
        spread: 0.0015,
        moveSpread: 0.004,
        adsSpread: 0.0004,
        range: 120
      },
      {
        group: classic,
        name: 'CLASSIC // .45 - SEMI',
        damage: 26,
        headshotMultiplier: 3,
        fireRate: 400,
        magSize: 12,
        ammo: 12,
        reserve: 36,
        reloadTime: 1.4,
        recoilVertical: 0.012,
        recoilHorizontal: 0.005,
        spread: 0.003,
        moveSpread: 0.006,
        adsSpread: 0.001,
        range: 60
      },
      {
        group: knife,
        name: 'TACTICAL KNIFE // CARBON - MELEE',
        damage: 55,
        headshotMultiplier: 1,
        fireRate: 90,
        magSize: Infinity,
        ammo: Infinity,
        reserve: Infinity,
        reloadTime: 0,
        recoilVertical: 0,
        recoilHorizontal: 0,
        spread: 0,
        moveSpread: 0,
        adsSpread: 0,
        range: 2.2
      }
    ];
    
    this.weapons.forEach(w => {
      w.group.visible = false;
      this.weaponGroup.add(w.group);
    });
  }

  switchWeapon(index) {
    if (index < 0 || index >= this.weapons.length) return;
    if (this.isReloading) return;
    
    this.weapons[this.currentWeapon].group.visible = false;
    this.currentWeapon = index;
    this.weapons[this.currentWeapon].group.visible = true;
    
    // Animate switch
    const g = this.weapons[this.currentWeapon].group;
    const origY = g.position.y;
    g.position.y -= 0.3;
    const start = performance.now();
    const anim = (t) => {
      const p = Math.min(1, (t - start) / 250);
      const eased = 1 - Math.pow(1 - p, 3);
      g.position.y = origY - 0.3 * (1 - eased);
      if (p < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
    
    this.updateHUD();
  }

  canShoot() {
    const w = this.weapons[this.currentWeapon];
    if (this.isReloading) return false;
    if (w.ammo <= 0 && w.magSize !== Infinity) return false;
    const now = performance.now();
    const delay = 60000 / w.fireRate;
    return now - this.lastShotTime >= delay;
  }

  shoot(camera, isMoving, isAiming, raycaster, colliders, enemies, particles) {
    if (!this.canShoot()) {
      if (this.weapons[this.currentWeapon].ammo <= 0) {
        this.audio.play('empty');
      }
      return null;
    }
    
    const weapon = this.weapons[this.currentWeapon];
    this.lastShotTime = performance.now();
    
    if (weapon.magSize !== Infinity) {
      weapon.ammo--;
    }
    
    // Recoil
    const recoilPattern = this.getRecoilPattern();
    this.recoilX += recoilPattern.x;
    this.recoilY += recoilPattern.y;
    
    // Spread calculation (Valorant style)
    let spread = weapon.spread;
    if (isMoving) spread = weapon.moveSpread;
    if (isAiming) spread = weapon.adsSpread;
    // Add recoil spread
    spread += Math.abs(this.recoilY) * 0.15;
    
    // Muzzle flash
    this.createMuzzleFlash();
    
    // Raycast with spread
    const shootDir = new THREE.Vector3(0, 0, -1);
    shootDir.applyQuaternion(camera.quaternion);
    shootDir.x += (Math.random() - 0.5) * spread;
    shootDir.y += (Math.random() - 0.5) * spread;
    shootDir.normalize();
    
    raycaster.set(camera.position, shootDir);
    
    // Check colliders first
    const colliderHits = raycaster.intersectObjects(colliders, false);
    const enemyMeshes = enemies.flatMap(e => e.hitboxes || [e.mesh]);
    const enemyHits = raycaster.intersectObjects(enemyMeshes, false);
    
    let hit = null;
    let hitDistance = weapon.range;
    
    if (colliderHits.length > 0 && colliderHits[0].distance < hitDistance) {
      hit = colliderHits[0];
      hitDistance = hit.distance;
      hit.type = 'world';
    }
    
    if (enemyHits.length > 0 && enemyHits[0].distance < hitDistance) {
      // Find which enemy
      const hitMesh = enemyHits[0].object;
      const enemy = enemies.find(e => 
        e.mesh === hitMesh || 
        (e.hitboxes && e.hitboxes.includes(hitMesh)) ||
        (e.group && e.group.children.includes(hitMesh))
      );
      if (enemy && enemy.health > 0) {
        hit = enemyHits[0];
        hit.enemy = enemy;
        hit.type = hitMesh.userData.isHead ? 'headshot' : 'bodyshot';
        hitDistance = hit.distance;
      }
    }
    
    // Tracer
    this.createTracer(camera.position, shootDir, hitDistance, particles);
    
    // Audio
    this.audio.play(weapon.group.name === 'VANDAL' ? 'vandal' : weapon.group.name === 'CLASSIC' ? 'classic' : 'hit', 0.9);
    
    // Weapon kick animation
    this.animateRecoil();
    
    this.updateHUD();
    
    return hit;
  }

  getRecoilPattern() {
    // Valorant Vandal pattern: up, up-right, up-left oscillation
    this.recoilPatternIndex++;
    const patterns = [
      { x: 0, y: 0.022 },
      { x: 0.008, y: 0.025 },
      { x: 0.012, y: 0.023 },
      { x: -0.006, y: 0.028 },
      { x: -0.015, y: 0.022 },
      { x: 0.018, y: 0.02 },
      { x: -0.012, y: 0.018 },
      { x: 0.01, y: 0.015 },
    ];
    const base = patterns[Math.min(this.recoilPatternIndex - 1, patterns.length - 1)];
    // After 8 shots, random
    if (this.recoilPatternIndex > 8) {
      return {
        x: (Math.random() - 0.5) * 0.02,
        y: 0.012 + Math.random() * 0.01
      };
    }
    return base;
  }

  resetRecoil() {
    // Decay recoil when not firing
    this.recoilX *= 0.92;
    this.recoilY *= 0.92;
    if (Math.abs(this.recoilX) < 0.001) this.recoilX = 0;
    if (Math.abs(this.recoilY) < 0.001) this.recoilY = 0;
    if (performance.now() - this.lastShotTime > 400) {
      this.recoilPatternIndex = 0;
    }
  }

  createMuzzleFlash() {
    this.muzzleLight.intensity = 8;
    this.muzzleLight.visible = true;
    this.muzzleLight.color.setHSL(0.08 + Math.random() * 0.05, 0.9, 0.6);
    
    // Flash sprite
    const flashGeo = new THREE.PlaneGeometry(0.12, 0.12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0, -0.04, -0.82);
    if (this.currentWeapon === 1) flash.position.set(0, -0.02, -0.3);
    this.weapons[this.currentWeapon].group.add(flash);
    
    setTimeout(() => {
      this.muzzleLight.visible = false;
      this.muzzleLight.intensity = 0;
      if (flash.parent) flash.parent.remove(flash);
    }, 40 + Math.random() * 30);
  }

  createTracer(origin, dir, distance, particleSystem) {
    const end = origin.clone().add(dir.clone().multiplyScalar(distance));
    
    const points = [origin.clone(), end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    
    let opacity = 0.6;
    const fade = () => {
      opacity -= 0.15;
      mat.opacity = opacity;
      if (opacity <= 0) {
        this.scene.remove(line);
        geo.dispose();
        mat.dispose();
      } else {
        requestAnimationFrame(fade);
      }
    };
    requestAnimationFrame(fade);
  }

  animateRecoil() {
    const g = this.weapons[this.currentWeapon].group;
    const origPos = g.position.clone();
    const origRot = g.rotation.clone();
    
    g.position.z += 0.08;
    g.position.y += 0.02;
    g.rotation.x += 0.08;
    
    const start = performance.now();
    const duration = 90;
    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      g.position.lerpVectors(
        new THREE.Vector3(origPos.x, origPos.y + 0.02, origPos.z + 0.08),
        origPos,
        eased
      );
      g.rotation.x = origRot.x + 0.08 * (1 - eased);
      if (t < 1) requestAnimationFrame(animate);
      else {
        g.position.copy(origPos);
        g.rotation.copy(origRot);
      }
    };
    requestAnimationFrame(animate);
  }

  startReload() {
    const w = this.weapons[this.currentWeapon];
    if (this.isReloading || w.magSize === Infinity || w.ammo === w.magSize || w.reserve <= 0) return false;
    
    this.isReloading = true;
    this.audio.play('reload');
    
    const g = w.group;
    const startRot = g.rotation.x;
    const start = performance.now();
    const duration = w.reloadTime * 1000;
    
    const anim = (now) => {
      const t = Math.min(1, (now - start) / duration);
      if (t < 0.4) {
        g.rotation.x = startRot - (t / 0.4) * 0.8;
        g.position.y = -0.28 - (t / 0.4) * 0.25;
      } else if (t < 0.8) {
        g.rotation.x = startRot - 0.8 + ((t - 0.4) / 0.4) * 0.8;
        g.position.y = -0.53 + ((t - 0.4) / 0.4) * 0.25;
      } else {
        g.rotation.x = startRot;
      }
      if (t < 1) {
        requestAnimationFrame(anim);
      } else {
        const needed = w.magSize - w.ammo;
        const toReload = Math.min(needed, w.reserve);
        w.ammo += toReload;
        w.reserve -= toReload;
        this.isReloading = false;
        this.updateHUD();
      }
    };
    requestAnimationFrame(anim);
    return true;
  }

  update(isAiming, delta, isMoving) {
    const w = this.weapons[this.currentWeapon].group;
    
    // Idle sway - hyper realistic breathing
    const time = performance.now() * 0.001;
    const swayIntensity = isAiming ? 0.002 : isMoving ? 0.015 : 0.006;
    w.position.x = (this.currentWeapon === 0 ? 0.32 : this.currentWeapon === 1 ? 0.28 : 0.35) + Math.sin(time * 0.8) * swayIntensity;
    w.position.y = (this.currentWeapon === 0 ? -0.28 : this.currentWeapon === 1 ? -0.32 : -0.3) + Math.sin(time * 0.6) * swayIntensity * 0.7;
    
    // ADS lerp
    const targetPos = isAiming && this.currentWeapon !== 2 ? 
      new THREE.Vector3(0, -0.18, -0.48) : 
      new THREE.Vector3(this.currentWeapon === 0 ? 0.32 : this.currentWeapon === 1 ? 0.28 : 0.35, this.currentWeapon === 0 ? -0.28 : -0.32, this.currentWeapon === 0 ? -0.55 : -0.45);
    
    if (isAiming) {
      w.position.lerp(targetPos, delta * 12);
      // Slight FOV effect is handled outside
    } else {
      w.position.lerp(targetPos, delta * 8);
    }
    
    // Apply recoil to camera (returned to be applied by player)
    this.resetRecoil();
    
    return { recoilX: this.recoilX, recoilY: this.recoilY };
  }

  updateHUD() {
    const w = this.weapons[this.currentWeapon];
    document.getElementById('ammoCurrent').textContent = w.magSize === Infinity ? '∞' : w.ammo;
    document.getElementById('ammoReserve').textContent = w.reserve === Infinity ? '∞' : w.reserve;
    document.getElementById('weaponName').textContent = w.name;
    
    document.querySelectorAll('.weapon-slot').forEach((el, i) => {
      el.classList.toggle('active', i === this.currentWeapon);
    });
  }

  getCurrentWeapon() {
    return this.weapons[this.currentWeapon];
  }
}
