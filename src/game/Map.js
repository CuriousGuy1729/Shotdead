import * as THREE from 'three';
import { TextureGenerator } from '../utils/TextureGenerator.js';

export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.spawnPoints = [];
    this.botPatrolPoints = [];
    this.spikeSites = [];
    this.buyZones = [];
    this.callouts = new Map();
    this.wallbangMaterials = new Map(); // collider -> penetration factor
    this.buildMap();
  }

  createMaterial(opts = {}) {
    const concrete = TextureGenerator.createConcreteTexture(1024);
    const concreteNormal = TextureGenerator.createConcreteNormal(1024);
    const grunge = TextureGenerator.createGrungeMap(512);
    const metal = TextureGenerator.createMetalTexture(512);
    const wood = TextureGenerator.createWoodTexture(512);

    let map = null, normalMap = null, roughnessMap = null;
    let color = opts.color || 0x9aa0a8;

    if (opts.useConcrete) { map = concrete; normalMap = concreteNormal; roughnessMap = grunge; }
    else if (opts.useMetal) { map = metal; }
    else if (opts.useWood) { map = wood; color = opts.color || 0x8b7355; }

    return new THREE.MeshStandardMaterial({
      color,
      map: opts.useTexture ? map : null,
      normalMap: opts.useTexture ? normalMap : null,
      roughnessMap: opts.useTexture ? roughnessMap : null,
      normalScale: new THREE.Vector2(opts.normalScale || 0.7, opts.normalScale || 0.7),
      metalness: opts.metalness ?? 0.1,
      roughness: opts.roughness ?? 0.85,
      envMapIntensity: opts.envIntensity ?? 0.4,
      transparent: opts.transparent || false,
      opacity: opts.opacity || 1,
      ...opts.extra
    });
  }

  addBox(pos, size, matOpts = {}, extra = {}) {
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = this.createMaterial(matOpts);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (extra.rotation) mesh.rotation.copy(extra.rotation);
    if (extra.name) mesh.name = extra.name;
    this.scene.add(mesh);

    if (extra.collider !== false) {
      this.colliders.push(mesh);
      mesh.userData.aabb = new THREE.Box3().setFromObject(mesh);
      mesh.userData.isCollider = true;
      mesh.userData.penetration = extra.penetration || 'concrete'; // concrete low, metal med, wood high
      this.wallbangMaterials.set(mesh, extra.penetration || 'concrete');
      if (extra.callout) this.callouts.set(mesh, extra.callout);
    }

    if (extra.emissive) {
      const emissiveMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: extra.emissive.color,
        emissiveIntensity: extra.emissive.intensity,
      });
      const emissiveMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x*1.01, size.y*0.1, size.z*1.01),
        emissiveMat
      );
      emissiveMesh.position.copy(pos);
      emissiveMesh.position.y += size.y*0.45;
      this.scene.add(emissiveMesh);
      const light = new THREE.PointLight(extra.emissive.color, extra.emissive.intensity*8, 12);
      light.position.copy(emissiveMesh.position);
      light.position.y += 0.2;
      this.scene.add(light);
    }
    return mesh;
  }

  buildMap() {
    // Floor - 140x140 PBR
    const floorTex = TextureGenerator.createConcreteTexture(2048);
    floorTex.repeat.set(8,8);
    const floorNormal = TextureGenerator.createConcreteNormal(2048);
    floorNormal.repeat.set(8,8);
    const floorRough = TextureGenerator.createGrungeMap(1024);
    floorRough.repeat.set(4,4);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8a8f98,
      map: floorTex,
      normalMap: floorNormal,
      roughnessMap: floorRough,
      normalScale: new THREE.Vector2(1.2,1.2),
      metalness: 0.05,
      roughness: 0.9,
      envMapIntensity: 0.3
    });
    const floorGeo = new THREE.PlaneGeometry(150,150);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMatOpts = { useConcrete: true, useTexture: true, color: 0xb8bec8, roughness: 0.85, metalness: 0.05, envIntensity: 0.2 };

    // Outer walls
    this.addBox(new THREE.Vector3(0,8,-75), new THREE.Vector3(150,16,2), wallMatOpts, { callout: 'BORDER' });
    this.addBox(new THREE.Vector3(0,8,75), new THREE.Vector3(150,16,2), wallMatOpts, { callout: 'BORDER' });
    this.addBox(new THREE.Vector3(75,8,0), new THREE.Vector3(2,16,150), wallMatOpts, { callout: 'BORDER' });
    this.addBox(new THREE.Vector3(-75,8,0), new THREE.Vector3(2,16,150), wallMatOpts, { callout: 'BORDER' });

    // === A SITE - Central ===
    this.spikeSites.push({ pos: new THREE.Vector3(0,0,0), radius: 9, name: 'A SITE', callout: 'A SITE' });

    // Heaven platform 24x18, 4m high
    this.addBox(new THREE.Vector3(16,2.2,-16), new THREE.Vector3(26,4.4,19),
      { color: 0x2a2e35, metalness: 0.3, roughness: 0.6, envIntensity: 0.5 }, { callout: 'HEAVEN', penetration: 'metal' });

    // Heaven railing
    const railingMat = { color: 0x1a1d23, metalness: 0.85, roughness: 0.3, envIntensity: 1.2 };
    for (let i=0;i<6;i++) this.addBox(new THREE.Vector3(5+i*4.8,4.9,-24.8), new THREE.Vector3(0.12,1.6,0.12), railingMat, { collider: false });
    this.addBox(new THREE.Vector3(16,5.2,-24.8), new THREE.Vector3(24,0.12,0.12), railingMat, { collider: false });

    // Stairs to heaven
    for (let i=0;i<7;i++) {
      this.addBox(new THREE.Vector3(30,0.28+i*0.38,-16+i*0.85), new THREE.Vector3(3.2,0.5+i*0.76,1.3),
        { color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 }, { callout: 'HEAVEN STAIRS', penetration: 'concrete' });
    }

    // Hell under heaven
    this.addBox(new THREE.Vector3(16,0.9,-16), new THREE.Vector3(10,1.8,8),
      { useConcrete: true, useTexture: true, color: 0x1e2228, roughness: 0.9 }, { callout: 'HELL', penetration: 'concrete' });

    // Site boxes - tactical cover
    this.addBox(new THREE.Vector3(0,1.6,0), new THREE.Vector3(4.2,3.2,4.2),
      { color: 0x4a5a3a, metalness: 0.2, roughness: 0.7 }, { emissive: { color: 0x00ff88, intensity: 0.45 }, callout: 'A SITE - GREEN BOX', penetration: 'metal' });

    const woodMat = { useWood: true, useTexture: true, color: 0x8b7355, metalness: 0.0, roughness: 0.9, envIntensity: 0.1 };
    this.addBox(new THREE.Vector3(-13,1,8.5), new THREE.Vector3(3.2,2,3.2), woodMat, { callout: 'A SITE - WOOD STACK', penetration: 'wood' });
    this.addBox(new THREE.Vector3(-13,3,8.5), new THREE.Vector3(3.2,2,3.2), woodMat, { callout: 'A SITE - WOOD STACK', penetration: 'wood' });
    this.addBox(new THREE.Vector3(-9.5,1,8.5), new THREE.Vector3(3.2,2,3.2), woodMat, { callout: 'A SITE - WOOD', penetration: 'wood' });

    // Concrete barriers mid
    this.addBox(new THREE.Vector3(5.5,1,19), new THREE.Vector3(13,2,1.3),
      { useConcrete: true, useTexture: true, color: 0xa0a6b0, roughness: 0.9 }, { callout: 'A MAIN - BARRIER', penetration: 'concrete' });
    this.addBox(new THREE.Vector3(-8.5,1,-8.5), new THREE.Vector3(1.3,2,11),
      { useConcrete: true, useTexture: true, color: 0xa0a6b0, roughness: 0.9 }, { callout: 'A SHORT - WALL', penetration: 'concrete' });

    // === MID ===
    for (let i=0;i<3;i++) {
      this.addBox(new THREE.Vector3(-26+i*15,4,0), new THREE.Vector3(1.6,8,1.6),
        { color: 0x2a2e35, metalness: 0.5, roughness: 0.5, envIntensity: 0.6 }, { callout: 'MID - PILLAR', penetration: 'concrete' });
    }
    this.addBox(new THREE.Vector3(-20,6,0), new THREE.Vector3(11,1,2.2),
      { color: 0x1e2228, metalness: 0.7, roughness: 0.4 }, { callout: 'MID - ARCH', penetration: 'concrete' });

    // === SPAWN - Defender with tech ===
    this.addBox(new THREE.Vector3(-54,3,-21), new THREE.Vector3(8.5,6,1.2),
      { color: 0x141820, metalness: 0.8, roughness: 0.3 }, { emissive: { color: 0x0dbef5, intensity: 1.3 }, callout: 'DEFENDER SPAWN - CYAN', penetration: 'metal' });
    this.addBox(new THREE.Vector3(-54,3,21), new THREE.Vector3(8.5,6,1.2),
      { color: 0x141820, metalness: 0.8, roughness: 0.3 }, { emissive: { color: 0xff4655, intensity: 1.3 }, callout: 'DEFENDER SPAWN - RED', penetration: 'metal' });
    this.addBox(new THREE.Vector3(-58,1.3,0), new THREE.Vector3(2.2,2.6,11),
      { useConcrete: true, useTexture: true, color: 0x9aa0a8 }, { callout: 'DEF SPAWN - COVER', penetration: 'concrete' });

    // Buy zone defender
    this.buyZones.push({ pos: new THREE.Vector3(-60,0,0), radius: 12, team: 'defender', name: 'DEFENDER BUY' });

    // === ATTACKER SIDE ===
    this.addBox(new THREE.Vector3(48,2,-26), new THREE.Vector3(6.5,4,2.2),
      { color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 }, { callout: 'ATTACKER - ENTRY', penetration: 'concrete' });
    this.addBox(new THREE.Vector3(48,2,26), new THREE.Vector3(6.5,4,2.2),
      { color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 }, { callout: 'ATTACKER - ENTRY', penetration: 'concrete' });
    this.addBox(new THREE.Vector3(32,1,-10.5), new THREE.Vector3(2.6,2,2.6), woodMat, { callout: 'A LOBBY - BOX', penetration: 'wood' });
    this.addBox(new THREE.Vector3(34,1,12.5), new THREE.Vector3(3.2,2,3.2),
      { color: 0x2a4a6a, metalness: 0.3, roughness: 0.6 }, { callout: 'A LOBBY - BLUE BOX', penetration: 'metal' });

    this.buyZones.push({ pos: new THREE.Vector3(62,0,0), radius: 12, team: 'attacker', name: 'ATTACKER BUY' });

    // === PROPS - barrels, computers, etc. ===
    // Barrels
    for (let i=0;i<4;i++){
      const barrelGeo = new THREE.CylinderGeometry(0.5,0.5,1.2,12);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.5 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(-30 + i*3, 0.6, -32);
      barrel.castShadow = true; barrel.receiveShadow = true;
      this.scene.add(barrel);
      this.colliders.push(barrel);
      barrel.userData.aabb = new THREE.Box3().setFromObject(barrel);
      barrel.userData.penetration = 'metal';
    }

    // Light poles + emissive
    const lightPoleMat = { color: 0x0a0e13, metalness: 0.9, roughness: 0.2 };
    const polePositions = [[-42,-42],[42,-42],[-42,42],[42,42],[0,-52],[0,52]];
    polePositions.forEach(([x,z])=>{
      this.addBox(new THREE.Vector3(x,5,z), new THREE.Vector3(0.32,10,0.32), lightPoleMat, { collider: false });
      const light = new THREE.PointLight(0xffffff, 2.2, 32);
      light.position.set(x,9.6,z);
      light.castShadow = true;
      light.shadow.mapSize.set(1024,1024);
      light.shadow.bias = -0.001;
      this.scene.add(light);
      const glowGeo = new THREE.SphereGeometry(0.42,8,8);
      const glowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.2 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x,9.6,z);
      this.scene.add(glow);
    });

    // Neon signs
    this.createNeonSign(new THREE.Vector3(-74,4.2,0), 0, 'DEFENDERS // BUY ZONE', 0x0dbef5);
    this.createNeonSign(new THREE.Vector3(74,4.2,0), Math.PI, 'ATTACKERS // BUY ZONE', 0xff4655);
    this.createNeonSign(new THREE.Vector3(16,6.2,-25.2), -Math.PI/2, 'A SITE // NEXUS - HEAVEN/HELL', 0x00ff88);
    this.createNeonSign(new THREE.Vector3(-20,4.5,0), Math.PI/2, 'MID // CONNECTOR', 0xffffff);

    // Glass panels attacker entry
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff, metalness: 0.1, roughness: 0.05, transmission: 0.92, thickness: 0.12, envMapIntensity: 1.6, transparent: true, opacity: 0.42
    });
    const glassGeo = new THREE.BoxGeometry(0.12,5,8.5);
    const glass1 = new THREE.Mesh(glassGeo, glassMat); glass1.position.set(52,2.5,-10); this.scene.add(glass1);
    const glass2 = new THREE.Mesh(glassGeo, glassMat); glass2.position.set(52,2.5,10); this.scene.add(glass2);

    // Spike plant zone visual - decal on floor
    const siteGeo = new THREE.RingGeometry(6,9,32);
    const siteMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    const siteRing = new THREE.Mesh(siteGeo, siteMat);
    siteRing.rotation.x = -Math.PI/2;
    siteRing.position.set(0,0.02,0);
    this.scene.add(siteRing);

    // Spawns
    this.spawnPoints = [
      new THREE.Vector3(-64,1.8,0), new THREE.Vector3(-58,1.8,-10), new THREE.Vector3(-58,1.8,10),
      new THREE.Vector3(64,1.8,0), new THREE.Vector3(58,1.8,-15), new THREE.Vector3(58,1.8,15),
    ];
    this.botPatrolPoints = [
      new THREE.Vector3(0,0,0), new THREE.Vector3(16,0,-16), new THREE.Vector3(-13,0,8.5),
      new THREE.Vector3(5.5,0,19), new THREE.Vector3(-20,0,0), new THREE.Vector3(32,0,-10.5),
      new THREE.Vector3(34,0,12.5), new THREE.Vector3(-26,0,-20), new THREE.Vector3(10,0,30),
    ];

    this.colliders.forEach(m=>{ m.userData.aabb = new THREE.Box3().setFromObject(m); });
  }

  createNeonSign(position, rotationY, text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 140;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font = '800 42px "Geist Mono", monospace';
    ctx.fillStyle = `#${color.toString(16).padStart(6,'0')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    ctx.shadowColor = `#${color.toString(16).padStart(6,'0')}`; ctx.shadowBlur = 22;
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: color, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.8 });
    const geo = new THREE.PlaneGeometry(12,2.8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.x += rotationY===0?1:rotationY===Math.PI?-1:0;
    mesh.position.z += rotationY===-Math.PI/2?-1:0;
    mesh.rotation.y = rotationY;
    this.scene.add(mesh);
    const light = new THREE.PointLight(color, 1.6, 16);
    light.position.copy(position);
    light.position.x += rotationY===0?1.5:rotationY===Math.PI?-1.5:0;
    this.scene.add(light);
  }

  checkCollision(position, radius = 0.6) {
    const playerBox = new THREE.Box3();
    playerBox.setFromCenterAndSize(position, new THREE.Vector3(radius*2,1.8,radius*2));
    for (const collider of this.colliders) {
      if (playerBox.intersectsBox(collider.userData.aabb)) return collider;
    }
    return null;
  }

  getPenetrationFactor(collider) {
    const mat = collider?.userData?.penetration || 'concrete';
    if (mat==='wood') return 0.85; // high pen
    if (mat==='metal') return 0.55; // med
    return 0.28; // concrete low
  }

  isInBuyZone(pos, team) {
    for (const zone of this.buyZones) {
      if (zone.team===team && pos.distanceTo(zone.pos) < zone.radius) return true;
    }
    return false;
  }

  isInSpikeSite(pos) {
    for (const site of this.spikeSites) {
      if (pos.distanceTo(site.pos) < site.radius) return site;
    }
    return null;
  }

  getCallout(pos) {
    let closest = null, minDist = Infinity;
    for (const [mesh, callout] of this.callouts) {
      const d = pos.distanceTo(mesh.position);
      if (d < minDist && d < 15) { minDist = d; closest = callout; }
    }
    return closest || 'NEXUS';
  }

  getRandomSpawn(isAttacker=false) {
    const idx = isAttacker ? 3+Math.floor(Math.random()*3) : Math.floor(Math.random()*3);
    return this.spawnPoints[idx].clone();
  }

  getRandomPatrolPoint() {
    return this.botPatrolPoints[Math.floor(Math.random()*this.botPatrolPoints.length)].clone();
  }
}
