import * as THREE from 'three';
import { TextureGenerator } from '../utils/TextureGenerator.js';

export class WeaponSystem {
  constructor(scene, camera, audio) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.currentWeapon = 0;
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
    this.muzzleLight = new THREE.PointLight(0xffaa44,0,8);
    this.muzzleLight.visible = false;
    this.weaponGroup.add(this.muzzleLight);
    this.createWeapons();
    this.switchWeapon(0);
  }

  createWeapons() {
    const metalTex = TextureGenerator.createMetalTexture();
    const grunge = TextureGenerator.createGrungeMap();
    const matBlackMetal = new THREE.MeshStandardMaterial({ color: 0x1a1d23, metalness: 0.85, roughness: 0.35, map: metalTex, roughnessMap: grunge, envMapIntensity: 1.2 });
    const matGunmetal = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.8, roughness: 0.4, envMapIntensity: 1.0 });
    const matPolymer = new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.1, roughness: 0.7, envMapIntensity: 0.3 });
    const matBarrel = new THREE.MeshStandardMaterial({ color: 0x0d0f14, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.5 });

    // VANDAL - hyper detailed
    const vandal = new THREE.Group(); vandal.name = 'VANDAL';
    const receiverGeo = new THREE.BoxGeometry(0.06,0.08,0.32);
    const receiver = new THREE.Mesh(receiverGeo, matBlackMetal); receiver.position.set(0,-0.05,-0.12); receiver.castShadow = true; vandal.add(receiver);
    const railGeo = new THREE.BoxGeometry(0.025,0.02,0.34);
    const rail = new THREE.Mesh(railGeo, matGunmetal); rail.position.set(0,-0.005,-0.12); vandal.add(rail);
    const barrelGeo = new THREE.CylinderGeometry(0.018,0.02,0.55,16); barrelGeo.rotateX(Math.PI/2);
    const barrel = new THREE.Mesh(barrelGeo, matBarrel); barrel.position.set(0,-0.04,-0.52); barrel.castShadow = true; vandal.add(barrel);
    const brakeGeo = new THREE.CylinderGeometry(0.025,0.025,0.06,12); brakeGeo.rotateX(Math.PI/2);
    const brake = new THREE.Mesh(brakeGeo, matGunmetal); brake.position.set(0,-0.04,-0.82); vandal.add(brake);
    const handguardGeo = new THREE.BoxGeometry(0.07,0.07,0.28);
    const handguard = new THREE.Mesh(handguardGeo, matPolymer); handguard.position.set(0,-0.055,-0.42); vandal.add(handguard);
    for (let i=0;i<3;i++){ const ventGeo = new THREE.BoxGeometry(0.072,0.015,0.04); const vent = new THREE.Mesh(ventGeo, new THREE.MeshStandardMaterial({color:0x000000})); vent.position.set(0,-0.055,-0.32-i*0.07); vandal.add(vent); }
    const magGeo = new THREE.BoxGeometry(0.04,0.16,0.07);
    const mag = new THREE.Mesh(magGeo, matPolymer); mag.position.set(0,-0.16,-0.15); mag.rotation.x=-0.15; mag.castShadow=true; vandal.add(mag);
    const gripGeo = new THREE.BoxGeometry(0.035,0.12,0.05);
    const grip = new THREE.Mesh(gripGeo, matPolymer); grip.position.set(0,-0.16,-0.05); grip.rotation.x=-0.25; vandal.add(grip);
    const stockBaseGeo = new THREE.BoxGeometry(0.05,0.06,0.22);
    const stockBase = new THREE.Mesh(stockBaseGeo, matPolymer); stockBase.position.set(0,-0.04,0.12); vandal.add(stockBase);
    const stockButtGeo = new THREE.BoxGeometry(0.06,0.1,0.03);
    const stockButt = new THREE.Mesh(stockButtGeo, matPolymer); stockButt.position.set(0,-0.05,0.24); vandal.add(stockButt);
    const sightBaseGeo = new THREE.BoxGeometry(0.03,0.04,0.06);
    const sightBase = new THREE.Mesh(sightBaseGeo, matGunmetal); sightBase.position.set(0,0.015,-0.18); vandal.add(sightBase);
    const sightLensGeo = new THREE.CylinderGeometry(0.015,0.015,0.03,16); sightLensGeo.rotateZ(Math.PI/2);
    const sightLens = new THREE.Mesh(sightLensGeo, new THREE.MeshStandardMaterial({ color:0x440000, metalness:0.9, roughness:0.1, emissive:0xff1100, emissiveIntensity:2.5 })); sightLens.position.set(0,0.02,-0.18); vandal.add(sightLens);
    vandal.position.set(0.32,-0.28,-0.55); vandal.rotation.set(0,-0.05,0);

    // PHANTOM - suppressed, similar but with suppressor
    const phantom = new THREE.Group(); phantom.name = 'PHANTOM';
    const pReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.075,0.31), matBlackMetal); pReceiver.position.set(0,-0.05,-0.11); phantom.add(pReceiver);
    const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.019,0.52,16).rotateX(Math.PI/2), matBarrel); pBarrel.position.set(0,-0.04,-0.48); phantom.add(pBarrel);
    const suppGeo = new THREE.CylinderGeometry(0.028,0.028,0.18,14); suppGeo.rotateX(Math.PI/2);
    const suppressor = new THREE.Mesh(suppGeo, new THREE.MeshStandardMaterial({ color:0x0a0a0a, metalness:0.85, roughness:0.35 })); suppressor.position.set(0,-0.04,-0.83); phantom.add(suppressor);
    const pHand = new THREE.Mesh(new THREE.BoxGeometry(0.068,0.068,0.26), matPolymer); pHand.position.set(0,-0.053,-0.39); phantom.add(pHand);
    const pMag = new THREE.Mesh(new THREE.BoxGeometry(0.038,0.14,0.065), matPolymer); pMag.position.set(0,-0.15,-0.14); pMag.rotation.x=-0.12; phantom.add(pMag);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.034,0.11,0.048), matPolymer); pGrip.position.set(0,-0.155,-0.04); pGrip.rotation.x=-0.22; phantom.add(pGrip);
    phantom.position.set(0.32,-0.28,-0.55);

    // OPERATOR - sniper with scope
    const operator = new THREE.Group(); operator.name = 'OPERATOR';
    const oBody = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.09,0.42), matBlackMetal); oBody.position.set(0,-0.05,-0.1); operator.add(oBody);
    const oBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.024,0.78,16).rotateX(Math.PI/2), matBarrel); oBarrel.position.set(0,-0.045,-0.62); operator.add(oBarrel);
    const oScopeGeo = new THREE.CylinderGeometry(0.032,0.032,0.32,16); oScopeGeo.rotateX(Math.PI/2);
    const oScope = new THREE.Mesh(oScopeGeo, matGunmetal); oScope.position.set(0,0.03,-0.15); operator.add(oScope);
    const oScopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.02,16).rotateX(Math.PI/2), new THREE.MeshStandardMaterial({ color:0x001133, metalness:0.9, roughness:0.05, emissive:0x0088ff, emissiveIntensity:1.2 })); oScopeLens.position.set(0,0.03,-0.31); operator.add(oScopeLens);
    const oMag = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.12,0.08), matPolymer); oMag.position.set(0,-0.16,-0.12); operator.add(oMag);
    const oStock = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.28), matPolymer); oStock.position.set(0,-0.04,0.18); operator.add(oStock);
    operator.position.set(0.36,-0.32,-0.62);

    // SHERIFF - deagle
    const sheriff = new THREE.Group(); sheriff.name = 'SHERIFF';
    const sFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.07,0.22), matBlackMetal); sFrame.position.set(0,-0.03,-0.12); sheriff.add(sFrame);
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.18,12).rotateX(Math.PI/2), matBarrel); sBarrel.position.set(0,-0.02,-0.26); sheriff.add(sBarrel);
    const sGrip = new THREE.Mesh(new THREE.BoxGeometry(0.032,0.1,0.045), matPolymer); sGrip.position.set(0,-0.12,-0.02); sGrip.rotation.x=-0.18; sheriff.add(sGrip);
    sheriff.position.set(0.28,-0.32,-0.46);

    // CLASSIC - pistol
    const classic = new THREE.Group(); classic.name = 'CLASSIC';
    const cFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.06,0.18), matBlackMetal); cFrame.position.set(0,-0.03,-0.1); classic.add(cFrame);
    const cBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.15,12).rotateX(Math.PI/2), matBarrel); cBarrel.position.set(0,-0.02,-0.22); classic.add(cBarrel);
    const cGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03,0.09,0.04), matPolymer); cGrip.position.set(0,-0.11,-0.02); cGrip.rotation.x=-0.2; classic.add(cGrip);
    classic.position.set(0.28,-0.32,-0.45);

    // KNIFE
    const knife = new THREE.Group(); knife.name = 'KNIFE';
    const bladeGeo = new THREE.BoxGeometry(0.01,0.03,0.28);
    const bladePos = bladeGeo.attributes.position;
    for (let i=0;i<bladePos.count;i++){ const z = bladePos.getZ(i); if (z<-0.05){ const f=1-(-0.05-z)*2; bladePos.setX(i, bladePos.getX(i)*Math.max(0.1,f)); } }
    bladePos.needsUpdate = true;
    const bladeMat = new THREE.MeshStandardMaterial({ color:0xc0c5ce, metalness:0.95, roughness:0.15, envMapIntensity:2 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat); blade.position.set(0,-0.02,-0.25); knife.add(blade);
    const handleGeo = new THREE.CylinderGeometry(0.015,0.018,0.12,8); handleGeo.rotateX(Math.PI/2);
    const handle = new THREE.Mesh(handleGeo, matPolymer); handle.position.set(0,-0.02,-0.05); knife.add(handle);
    knife.position.set(0.35,-0.3,-0.4); knife.rotation.set(0.2,-0.8,0.1);

    this.weapons = [
      { group: vandal, name: 'VANDAL // 5.56 MK-IV - AUTO - $2900', damage: 39, headshotMultiplier: 4, fireRate: 600, magSize: 25, ammo: 25, reserve: 75, reloadTime: 2.1, recoilVertical: 0.018, recoilHorizontal: 0.008, spread: 0.0015, moveSpread: 0.004, adsSpread: 0.0004, range: 120, penetration: 'medium', price: 2900, type: 'rifle', sound: 'vandal' },
      { group: phantom, name: 'PHANTOM // 5.56 SILENT - $2900', damage: 35, headshotMultiplier: 4, fireRate: 660, magSize: 30, ammo: 30, reserve: 90, reloadTime: 2.0, recoilVertical: 0.015, recoilHorizontal: 0.007, spread: 0.0012, moveSpread: 0.0035, adsSpread: 0.00035, range: 100, penetration: 'medium', price: 2900, type: 'rifle', sound: 'phantom' },
      { group: operator, name: 'OPERATOR // .50 CAL - SCOPE - $4700', damage: 255, headshotMultiplier: 1, fireRate: 36, magSize: 5, ammo: 5, reserve: 10, reloadTime: 3.2, recoilVertical: 0.08, recoilHorizontal: 0.02, spread: 0.0002, moveSpread: 0.015, adsSpread: 0.00005, range: 200, penetration: 'high', price: 4700, type: 'sniper', sound: 'operator', isSniper: true },
      { group: sheriff, name: 'SHERIFF // .50 - DEAGLE - $800', damage: 55, headshotMultiplier: 2.9, fireRate: 240, magSize: 6, ammo: 6, reserve: 24, reloadTime: 1.8, recoilVertical: 0.028, recoilHorizontal: 0.012, spread: 0.0035, moveSpread: 0.008, adsSpread: 0.0012, range: 80, penetration: 'high', price: 800, type: 'pistol', sound: 'sheriff' },
      { group: classic, name: 'CLASSIC // .45 SEMI - FREE', damage: 26, headshotMultiplier: 3, fireRate: 400, magSize: 12, ammo: 12, reserve: 36, reloadTime: 1.4, recoilVertical: 0.012, recoilHorizontal: 0.005, spread: 0.003, moveSpread: 0.006, adsSpread: 0.001, range: 60, penetration: 'low', price: 0, type: 'pistol', sound: 'classic' },
      { group: knife, name: 'TACTICAL KNIFE // CARBON - MELEE', damage: 55, headshotMultiplier: 1, fireRate: 90, magSize: Infinity, ammo: Infinity, reserve: Infinity, reloadTime: 0, recoilVertical: 0, recoilHorizontal: 0, spread: 0, moveSpread: 0, adsSpread: 0, range: 2.2, penetration: 'none', price: 0, type: 'melee', sound: 'hit' },
    ];

    this.weapons.forEach(w=>{ w.group.visible=false; this.weaponGroup.add(w.group); });
  }

  switchWeapon(index) {
    if (index<0||index>=this.weapons.length) return;
    if (this.isReloading) return;
    this.weapons[this.currentWeapon].group.visible = false;
    this.currentWeapon = index;
    this.weapons[this.currentWeapon].group.visible = true;
    const g = this.weapons[this.currentWeapon].group;
    const origY = g.position.y;
    g.position.y -= 0.32;
    const start = performance.now();
    const anim = (t)=>{
      const p = Math.min(1,(t-start)/260);
      const eased = 1 - Math.pow(1-p,3);
      g.position.y = origY - 0.32*(1-eased);
      if (p<1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
    this.updateHUD();
  }

  canShoot() {
    const w = this.weapons[this.currentWeapon];
    if (this.isReloading) return false;
    if (w.ammo<=0 && w.magSize!==Infinity) return false;
    const now = performance.now();
    const delay = 60000 / w.fireRate;
    return now - this.lastShotTime >= delay;
  }

  shoot(camera, isMoving, isAiming, raycaster, colliders, enemies, particles, map) {
    if (!this.canShoot()) {
      if (this.weapons[this.currentWeapon].ammo<=0) this.audio.play('empty');
      return null;
    }
    const weapon = this.weapons[this.currentWeapon];
    this.lastShotTime = performance.now();
    if (weapon.magSize!==Infinity) weapon.ammo--;

    const recoilPattern = this.getRecoilPattern();
    this.recoilX += recoilPattern.x;
    this.recoilY += recoilPattern.y;

    let spread = weapon.spread;
    if (isMoving) spread = weapon.moveSpread;
    if (isAiming) spread = weapon.adsSpread;
    spread += Math.abs(this.recoilY)*0.15;

    this.createMuzzleFlash();

    const shootDir = new THREE.Vector3(0,0,-1);
    shootDir.applyQuaternion(camera.quaternion);
    shootDir.x += (Math.random()-0.5)*spread;
    shootDir.y += (Math.random()-0.5)*spread;
    shootDir.normalize();

    raycaster.set(camera.position, shootDir);

    const colliderHits = raycaster.intersectObjects(colliders,false);
    const enemyMeshes = enemies.flatMap(e=>e.hitboxes||[e.mesh]);
    const enemyHits = raycaster.intersectObjects(enemyMeshes,false);

    let hit = null;
    let hitDistance = weapon.range;

    if (colliderHits.length>0 && colliderHits[0].distance < hitDistance) {
      hit = colliderHits[0];
      hitDistance = hit.distance;
      hit.type = 'world';
      // Wallbang check - if high pen weapon can go through
      if (weapon.penetration==='high' && hitDistance < 15) {
        const penFactor = map ? map.getPenetrationFactor(hit.object) : 0.3;
        if (penFactor > 0.6 && Math.random() < penFactor) {
          // Allow through with reduced damage
          hit.wallbang = true;
          hit.penFactor = penFactor;
          this.audio.play('wallbang',0.5);
        }
      }
    }

    if (enemyHits.length>0 && enemyHits[0].distance < hitDistance) {
      const hitMesh = enemyHits[0].object;
      const enemy = enemies.find(e=> e.mesh===hitMesh || (e.hitboxes && e.hitboxes.includes(hitMesh)) || (e.group && e.group.children.includes(hitMesh)));
      if (enemy && enemy.health>0) {
        hit = enemyHits[0];
        hit.enemy = enemy;
        hit.type = hitMesh.userData.isHead ? 'headshot' : 'bodyshot';
        hitDistance = hit.distance;
      }
    }

    this.createTracer(camera.position, shootDir, hitDistance);
    this.audio.play(weapon.sound, 0.92);
    this.animateRecoil();
    this.updateHUD();
    return hit;
  }

  getRecoilPattern() {
    this.recoilPatternIndex++;
    const patterns = [
      {x:0,y:0.022},{x:0.008,y:0.025},{x:0.012,y:0.023},{x:-0.006,y:0.028},{x:-0.015,y:0.022},{x:0.018,y:0.02},{x:-0.012,y:0.018},{x:0.01,y:0.015},
    ];
    const base = patterns[Math.min(this.recoilPatternIndex-1, patterns.length-1)];
    if (this.recoilPatternIndex>8) return { x:(Math.random()-0.5)*0.022, y:0.012+Math.random()*0.011 };
    return base;
  }

  resetRecoil() {
    this.recoilX*=0.92; this.recoilY*=0.92;
    if (Math.abs(this.recoilX)<0.001) this.recoilX=0;
    if (Math.abs(this.recoilY)<0.001) this.recoilY=0;
    if (performance.now()-this.lastShotTime>420) this.recoilPatternIndex=0;
  }

  createMuzzleFlash() {
    this.muzzleLight.intensity = 8.5;
    this.muzzleLight.visible = true;
    this.muzzleLight.color.setHSL(0.08+Math.random()*0.05,0.9,0.6);
    const flashGeo = new THREE.PlaneGeometry(0.13,0.13);
    const flashMat = new THREE.MeshBasicMaterial({ color:0xffcc66, transparent:true, opacity:0.92, blending:THREE.AdditiveBlending, depthWrite:false });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    const w = this.weapons[this.currentWeapon];
    if (w.name.includes('OPERATOR')) flash.position.set(0,-0.045,-0.92);
    else if (w.name.includes('PHANTOM')) flash.position.set(0,-0.04,-0.92);
    else if (w.name.includes('SHERIFF')||w.name.includes('CLASSIC')) flash.position.set(0,-0.02,-0.35);
    else flash.position.set(0,-0.04,-0.82);
    this.weapons[this.currentWeapon].group.add(flash);
    setTimeout(()=>{ this.muzzleLight.visible=false; this.muzzleLight.intensity=0; if (flash.parent) flash.parent.remove(flash); }, 42+Math.random()*32);
  }

  createTracer(origin, dir, distance) {
    const end = origin.clone().add(dir.clone().multiplyScalar(distance));
    const points = [origin.clone(), end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color:0xffdd88, transparent:true, opacity:0.62, blending:THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    let opacity = 0.62;
    const fade = ()=>{ opacity-=0.16; mat.opacity=opacity; if (opacity<=0){ this.scene.remove(line); geo.dispose(); mat.dispose(); } else requestAnimationFrame(fade); };
    requestAnimationFrame(fade);
  }

  animateRecoil() {
    const g = this.weapons[this.currentWeapon].group;
    const origPos = g.position.clone();
    const origRot = g.rotation.clone();
    g.position.z+=0.085; g.position.y+=0.022; g.rotation.x+=0.085;
    const start = performance.now(); const duration = 92;
    const animate = (now)=>{
      const t = Math.min(1,(now-start)/duration);
      const eased = 1 - Math.pow(1-t,3);
      g.position.lerpVectors(new THREE.Vector3(origPos.x, origPos.y+0.022, origPos.z+0.085), origPos, eased);
      g.rotation.x = origRot.x + 0.085*(1-eased);
      if (t<1) requestAnimationFrame(animate); else { g.position.copy(origPos); g.rotation.copy(origRot); }
    };
    requestAnimationFrame(animate);
  }

  startReload() {
    const w = this.weapons[this.currentWeapon];
    if (this.isReloading || w.magSize===Infinity || w.ammo===w.magSize || w.reserve<=0) return false;
    this.isReloading = true;
    this.audio.play('reload');
    const g = w.group;
    const startRot = g.rotation.x;
    const start = performance.now();
    const duration = w.reloadTime*1000;
    const anim = (now)=>{
      const t = Math.min(1,(now-start)/duration);
      if (t<0.4){ g.rotation.x = startRot - (t/0.4)*0.85; g.position.y = -0.28 - (t/0.4)*0.26; }
      else if (t<0.8){ g.rotation.x = startRot - 0.85 + ((t-0.4)/0.4)*0.85; g.position.y = -0.54 + ((t-0.4)/0.4)*0.26; }
      else g.rotation.x = startRot;
      if (t<1) requestAnimationFrame(anim);
      else {
        const needed = w.magSize - w.ammo;
        const toReload = Math.min(needed, w.reserve);
        w.ammo += toReload; w.reserve -= toReload;
        this.isReloading = false;
        this.updateHUD();
      }
    };
    requestAnimationFrame(anim);
    return true;
  }

  update(isAiming, delta, isMoving) {
    const w = this.weapons[this.currentWeapon].group;
    const time = performance.now()*0.001;
    const swayIntensity = isAiming ? 0.0022 : isMoving ? 0.016 : 0.0065;
    const baseX = this.currentWeapon===0||this.currentWeapon===1 ? 0.32 : this.currentWeapon===2 ? 0.36 : this.currentWeapon===3 ? 0.28 : this.currentWeapon===4 ? 0.28 : 0.35;
    const baseY = this.currentWeapon===2 ? -0.32 : this.currentWeapon===3||this.currentWeapon===4 ? -0.32 : -0.28;
    const baseZ = this.currentWeapon===2 ? -0.62 : this.currentWeapon===3 ? -0.46 : this.currentWeapon===4 ? -0.45 : -0.55;
    w.position.x = baseX + Math.sin(time*0.8)*swayIntensity;
    w.position.y = baseY + Math.sin(time*0.6)*swayIntensity*0.72;
    const targetPos = isAiming && this.currentWeapon!==5 ? new THREE.Vector3(0,-0.18,-0.48) : new THREE.Vector3(baseX, baseY, baseZ);
    w.position.lerp(targetPos, delta*(isAiming?12:8));
    this.resetRecoil();
    return { recoilX:this.recoilX, recoilY:this.recoilY };
  }

  updateHUD() {
    const w = this.weapons[this.currentWeapon];
    document.getElementById('ammoCurrent').textContent = w.magSize===Infinity?'∞':w.ammo;
    document.getElementById('ammoReserve').textContent = w.reserve===Infinity?'∞':w.reserve;
    document.getElementById('weaponName').textContent = w.name;
    document.querySelectorAll('.weapon-slot').forEach((el,i)=>{
      el.classList.toggle('active', i===this.currentWeapon);
      const ammoEl = el.querySelector('.ws-ammo');
      if (ammoEl) {
        const wep = this.weapons[i];
        ammoEl.textContent = wep ? (wep.magSize===Infinity?'∞':wep.ammo) : '';
      }
    });
    // Update buy preview stats if open
    const buyPreview = document.getElementById('buyPreview');
    if (buyPreview) buyPreview.textContent = w.name.split(' // ')[0];
  }

  getCurrentWeapon(){ return this.weapons[this.currentWeapon]; }

  buyWeapon(weaponId, credits) {
    const weaponMap = { vandal:0, phantom:1, operator:2, sheriff:3, classic:4 };
    const idx = weaponMap[weaponId];
    if (idx===undefined) return { success:false, reason:'Invalid weapon' };
    const wep = this.weapons[idx];
    if (credits < wep.price) return { success:false, reason:'Not enough credits' };
    // Reset ammo on buy
    wep.ammo = wep.magSize;
    wep.reserve = wep.magSize*3;
    if (weaponId==='operator') wep.reserve = 10;
    if (weaponId==='sheriff') wep.reserve = 24;
    this.switchWeapon(idx);
    return { success:true, cost: wep.price };
  }
}
