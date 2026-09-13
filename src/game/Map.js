import * as THREE from 'three';
import { TextureGenerator } from '../utils/TextureGenerator.js';

export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.spawnPoints = [];
    this.botPatrolPoints = [];
    this.buildMap();
  }

  createMaterial(options = {}) {
    const concrete = TextureGenerator.createConcreteTexture(1024);
    const concreteNormal = TextureGenerator.createConcreteNormal(1024);
    const grunge = TextureGenerator.createGrungeMap(512);
    
    return new THREE.MeshStandardMaterial({
      color: options.color || 0x9aa0a8,
      map: options.useConcrete ? concrete : null,
      normalMap: options.useConcrete ? concreteNormal : null,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: options.useConcrete ? grunge : null,
      metalness: options.metalness ?? 0.1,
      roughness: options.roughness ?? 0.85,
      envMapIntensity: options.envIntensity ?? 0.4,
      ...options
    });
  }

  addBox(pos, size, materialOptions = {}, extra = {}) {
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = this.createMaterial(materialOptions);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (extra.rotation) mesh.rotation.copy(extra.rotation);
    this.scene.add(mesh);
    
    if (extra.collider !== false) {
      this.colliders.push(mesh);
      // Store AABB for physics
      mesh.userData.aabb = new THREE.Box3().setFromObject(mesh);
      mesh.userData.isCollider = true;
    }
    
    if (extra.emissive) {
      const emissiveMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: extra.emissive.color,
        emissiveIntensity: extra.emissive.intensity,
      });
      const emissiveMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * 1.01, size.y * 0.1, size.z * 1.01),
        emissiveMat
      );
      emissiveMesh.position.copy(pos);
      emissiveMesh.position.y += size.y * 0.45;
      this.scene.add(emissiveMesh);
      
      const light = new THREE.PointLight(extra.emissive.color, extra.emissive.intensity * 8, 12);
      light.position.copy(emissiveMesh.position);
      light.position.y += 0.2;
      this.scene.add(light);
    }
    
    return mesh;
  }

  buildMap() {
    // Floor - huge concrete with realistic PBR
    const floorTex = TextureGenerator.createConcreteTexture(2048);
    floorTex.repeat.set(8, 8);
    const floorNormal = TextureGenerator.createConcreteNormal(2048);
    floorNormal.repeat.set(8, 8);
    const floorRough = TextureGenerator.createGrungeMap(1024);
    floorRough.repeat.set(4, 4);
    
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8a8f98,
      map: floorTex,
      normalMap: floorNormal,
      roughnessMap: floorRough,
      normalScale: new THREE.Vector2(1.2, 1.2),
      metalness: 0.05,
      roughness: 0.9,
      envMapIntensity: 0.3
    });
    
    const floorGeo = new THREE.PlaneGeometry(140, 140);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    
    // Add floor decals / markings - Valorant style lines
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xff4655,
      emissive: 0xff4655,
      emissiveIntensity: 0.3,
      roughness: 0.8
    });
    
    // Outer walls - tall brutalist concrete
    const wallMatOpts = { useConcrete: true, color: 0xb8bec8, roughness: 0.85, metalness: 0.05, envIntensity: 0.2 };
    
    // North wall
    this.addBox(new THREE.Vector3(0, 8, -70), new THREE.Vector3(140, 16, 2), wallMatOpts);
    // South wall
    this.addBox(new THREE.Vector3(0, 8, 70), new THREE.Vector3(140, 16, 2), wallMatOpts);
    // East wall
    this.addBox(new THREE.Vector3(70, 8, 0), new THREE.Vector3(2, 16, 140), wallMatOpts);
    // West wall (spawn)
    this.addBox(new THREE.Vector3(-70, 8, 0), new THREE.Vector3(2, 16, 140), wallMatOpts);
    
    // === SITE A - Central bombsite ===
    // Elevated platform (heaven)
    this.addBox(new THREE.Vector3(15, 2, -15), new THREE.Vector3(24, 4, 18), 
      { color: 0x2a2e35, metalness: 0.3, roughness: 0.6, envIntensity: 0.5 });
    
    // Heaven railing - metal
    const railingMat = { color: 0x1a1d23, metalness: 0.85, roughness: 0.3, envIntensity: 1.2 };
    for (let i = 0; i < 5; i++) {
      this.addBox(new THREE.Vector3(5 + i * 5, 4.5, -23.5), new THREE.Vector3(0.1, 1.5, 0.1), railingMat);
    }
    this.addBox(new THREE.Vector3(15, 4.8, -23.5), new THREE.Vector3(22, 0.1, 0.1), railingMat);
    
    // Stairs to heaven
    for (let i = 0; i < 6; i++) {
      this.addBox(
        new THREE.Vector3(28, 0.25 + i * 0.38, -15 + i * 0.8),
        new THREE.Vector3(3, 0.5 + i * 0.76, 1.2),
        { color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 }
      );
    }
    
    // Site boxes - Valorant style cover
    // Large metal crate - green
    this.addBox(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(4, 3, 4),
      { color: 0x4a5a3a, metalness: 0.2, roughness: 0.7 },
      { emissive: { color: 0x00ff88, intensity: 0.4 } }
    );
    
    // Wooden crates stack
    const woodMat = { color: 0x8b7355, metalness: 0.0, roughness: 0.9, envIntensity: 0.1 };
    this.addBox(new THREE.Vector3(-12, 1, 8), new THREE.Vector3(3, 2, 3), woodMat);
    this.addBox(new THREE.Vector3(-12, 3, 8), new THREE.Vector3(3, 2, 3), woodMat);
    this.addBox(new THREE.Vector3(-9, 1, 8), new THREE.Vector3(3, 2, 3), woodMat);
    
    // Concrete barriers - mid
    this.addBox(new THREE.Vector3(5, 1, 18), new THREE.Vector3(12, 2, 1.2),
      { useConcrete: true, color: 0xa0a6b0, roughness: 0.9 });
    this.addBox(new THREE.Vector3(-8, 1, -8), new THREE.Vector3(1.2, 2, 10),
      { useConcrete: true, color: 0xa0a6b0, roughness: 0.9 });
    
    // === MID - Connector ===
    // Pillars
    for (let i = 0; i < 3; i++) {
      this.addBox(
        new THREE.Vector3(-25 + i * 15, 4, 0),
        new THREE.Vector3(1.5, 8, 1.5),
        { color: 0x2a2e35, metalness: 0.5, roughness: 0.5, envIntensity: 0.6 }
      );
    }
    
    // Mid arch - decorative brutalist
    this.addBox(new THREE.Vector3(-20, 6, 0), new THREE.Vector3(10, 1, 2),
      { color: 0x1e2228, metalness: 0.7, roughness: 0.4 });
    
    // === SPAWN - Defender side with tech ===
    // Spawn walls with neon
    this.addBox(new THREE.Vector3(-50, 3, -20), new THREE.Vector3(8, 6, 1),
      { color: 0x141820, metalness: 0.8, roughness: 0.3 },
      { emissive: { color: 0x0dbef5, intensity: 1.2 } });
    this.addBox(new THREE.Vector3(-50, 3, 20), new THREE.Vector3(8, 6, 1),
      { color: 0x141820, metalness: 0.8, roughness: 0.3 },
      { emissive: { color: 0xff4655, intensity: 1.2 } });
    
    // Spawn cover
    this.addBox(new THREE.Vector3(-55, 1.2, 0), new THREE.Vector3(2, 2.4, 10),
      { useConcrete: true, color: 0x9aa0a8 });
    
    // === ATTACKER SIDE - Entry ===
    this.addBox(new THREE.Vector3(45, 2, -25), new THREE.Vector3(6, 4, 2),
      { color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 });
    this.addBox(new THREE.Vector3(45, 2, 25), new THREE.Vector3(6, 4, 2),
      { color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 });
    
    // Side boxes for tactical play
    this.addBox(new THREE.Vector3(30, 1, -10), new THREE.Vector3(2.5, 2, 2.5), woodMat);
    this.addBox(new THREE.Vector3(32, 1, 12), new THREE.Vector3(3, 2, 3),
      { color: 0x2a4a6a, metalness: 0.3, roughness: 0.6 });
    
    // === DETAILS - Make it feel alive ===
    // Light poles with emissive
    const lightPoleMat = { color: 0x0a0e13, metalness: 0.9, roughness: 0.2 };
    const polePositions = [
      [-40, -40], [40, -40], [-40, 40], [40, 40], [0, -50], [0, 50]
    ];
    polePositions.forEach(([x, z]) => {
      this.addBox(new THREE.Vector3(x, 5, z), new THREE.Vector3(0.3, 10, 0.3), lightPoleMat, { collider: false });
      const light = new THREE.PointLight(0xffffff, 2, 30);
      light.position.set(x, 9.5, z);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.001;
      this.scene.add(light);
      
      // Light fixture glow
      const glowGeo = new THREE.SphereGeometry(0.4, 8, 8);
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 3
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, 9.5, z);
      this.scene.add(glow);
    });
    
    // Neon signs - Valorant aesthetic
    this.createNeonSign(new THREE.Vector3(-69, 4, 0), 0, 'DEFENDERS', 0x0dbef5);
    this.createNeonSign(new THREE.Vector3(69, 4, 0), Math.PI, 'ATTACKERS', 0xff4655);
    this.createNeonSign(new THREE.Vector3(15, 6, -24), -Math.PI/2, 'SITE A // NEXUS', 0x00ff88);
    
    // Glass panels - attacker entry
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.9,
      thickness: 0.1,
      envMapIntensity: 1.5,
      transparent: true,
      opacity: 0.4
    });
    const glassGeo = new THREE.BoxGeometry(0.1, 5, 8);
    const glass1 = new THREE.Mesh(glassGeo, glassMat);
    glass1.position.set(50, 2.5, -10);
    this.scene.add(glass1);
    const glass2 = new THREE.Mesh(glassGeo, glassMat);
    glass2.position.set(50, 2.5, 10);
    this.scene.add(glass2);
    
    // Define spawns
    this.spawnPoints = [
      new THREE.Vector3(-60, 1.8, 0),   // defender spawn
      new THREE.Vector3(-55, 1.8, -10),
      new THREE.Vector3(-55, 1.8, 10),
      new THREE.Vector3(60, 1.8, 0),    // attacker spawn
      new THREE.Vector3(55, 1.8, -15),
      new THREE.Vector3(55, 1.8, 15),
    ];
    
    this.botPatrolPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(15, 0, -15),
      new THREE.Vector3(-12, 0, 8),
      new THREE.Vector3(5, 0, 18),
      new THREE.Vector3(-20, 0, 0),
      new THREE.Vector3(30, 0, -10),
      new THREE.Vector3(32, 0, 12),
      new THREE.Vector3(-25, 0, -20),
      new THREE.Vector3(10, 0, 30),
    ];
    
    // Update all AABBs after building
    this.colliders.forEach(m => {
      m.userData.aabb = new THREE.Box3().setFromObject(m);
    });
  }

  createNeonSign(position, rotationY, text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '800 48px "JetBrains Mono", monospace';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    // Glow
    ctx.shadowColor = `#${color.toString(16).padStart(6, '0')}`;
    ctx.shadowBlur = 20;
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: color,
      emissiveMap: tex,
      emissiveIntensity: 1.5,
      roughness: 0.8
    });
    const geo = new THREE.PlaneGeometry(10, 2.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.x += rotationY === 0 ? 1 : rotationY === Math.PI ? -1 : 0;
    mesh.position.z += rotationY === -Math.PI/2 ? -1 : 0;
    mesh.rotation.y = rotationY;
    this.scene.add(mesh);
    
    const light = new THREE.PointLight(color, 1.5, 15);
    light.position.copy(position);
    light.position.x += rotationY === 0 ? 1.5 : rotationY === Math.PI ? -1.5 : 0;
    this.scene.add(light);
  }

  checkCollision(position, radius = 0.6) {
    const playerBox = new THREE.Box3();
    playerBox.setFromCenterAndSize(
      position,
      new THREE.Vector3(radius * 2, 1.8, radius * 2)
    );
    
    for (const collider of this.colliders) {
      if (playerBox.intersectsBox(collider.userData.aabb)) {
        return collider;
      }
    }
    return null;
  }

  getRandomSpawn(isAttacker = false) {
    const idx = isAttacker ? 3 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 3);
    return this.spawnPoints[idx].clone();
  }

  getRandomPatrolPoint() {
    return this.botPatrolPoints[Math.floor(Math.random() * this.botPatrolPoints.length)].clone();
  }
}
