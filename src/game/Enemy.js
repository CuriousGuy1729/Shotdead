import * as THREE from 'three';

export class Enemy {
  constructor(scene, position, id, map) {
    this.scene = scene;
    this.map = map;
    this.id = id;
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;
    this.position = position.clone();
    this.targetPos = map.getRandomPatrolPoint();
    this.velocity = new THREE.Vector3();
    this.speed = 2.2 + Math.random() * 1.5;
    this.lastShot = 0;
    this.state = 'patrol'; // patrol, chase, attack, dead
    this.playerLastSeen = null;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    
    this.createMesh();
  }

  createMesh() {
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    
    // Materials - tactical gear, hyper realistic
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc8a882,
      roughness: 0.7,
      metalness: 0.0,
      envMapIntensity: 0.2
    });
    
    const gearMat = new THREE.MeshStandardMaterial({
      color: 0x2a2e35,
      roughness: 0.6,
      metalness: 0.3,
      envMapIntensity: 0.5
    });
    
    const vestMat = new THREE.MeshStandardMaterial({
      color: 0x3a4a3a,
      roughness: 0.8,
      metalness: 0.1,
      envMapIntensity: 0.3
    });
    
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d23,
      roughness: 0.4,
      metalness: 0.7,
      envMapIntensity: 1.0
    });
    
    // Body - capsule approximation with boxes for better hitbox
    const bodyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 8);
    this.bodyMesh = new THREE.Mesh(bodyGeo, vestMat);
    this.bodyMesh.position.y = 0.9;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.userData.isBody = true;
    this.bodyMesh.userData.enemyId = this.id;
    this.group.add(this.bodyMesh);
    
    // Head - critical hitbox
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    this.headMesh = new THREE.Mesh(headGeo, skinMat);
    this.headMesh.position.y = 1.75;
    this.headMesh.castShadow = true;
    this.headMesh.userData.isHead = true;
    this.headMesh.userData.enemyId = this.id;
    this.group.add(this.headMesh);
    
    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.32, 16, 16, 0, Math.PI*2, 0, Math.PI*0.65);
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.8;
    helmet.rotation.x = 0;
    helmet.castShadow = true;
    this.group.add(helmet);
    
    // Visor - emissive red for enemy identification
    const visorGeo = new THREE.BoxGeometry(0.35, 0.08, 0.15);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0xff2244,
      emissiveIntensity: 1.2,
      metalness: 0.8,
      roughness: 0.2
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.75, 0.22);
    this.group.add(visor);
    
    // Weapon in hands
    const weaponGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6);
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.8, roughness: 0.3 });
    const weapon = new THREE.Mesh(weaponGeo, weaponMat);
    weapon.position.set(0.25, 1.0, 0.3);
    this.group.add(weapon);
    
    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.5, 4, 8);
    const leftArm = new THREE.Mesh(armGeo, gearMat);
    leftArm.position.set(-0.4, 1.0, 0);
    leftArm.rotation.z = -0.3;
    leftArm.rotation.x = 0.5;
    this.group.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeo, gearMat);
    rightArm.position.set(0.4, 1.0, 0.15);
    rightArm.rotation.z = 0.3;
    rightArm.rotation.x = 0.8;
    this.group.add(rightArm);
    
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.7, 4, 8);
    const leftLeg = new THREE.Mesh(legGeo, gearMat);
    leftLeg.position.set(-0.15, 0.2, 0);
    this.group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, gearMat);
    rightLeg.position.set(0.15, 0.2, 0);
    this.group.add(rightLeg);
    
    this.scene.add(this.group);
    
    // Hitboxes for raycasting - separate meshes for precision
    this.hitboxes = [this.bodyMesh, this.headMesh];
    
    // Health bar sprite
    this.createHealthBar();
  }

  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    this.healthCanvas = canvas;
    this.healthCtx = ctx;
    
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
    this.healthSprite = new THREE.Sprite(mat);
    this.healthSprite.position.set(0, 2.4, 0);
    this.healthSprite.scale.set(1.2, 0.15, 1);
    this.healthSprite.visible = false;
    this.group.add(this.healthSprite);
    
    this.updateHealthBar();
  }

  updateHealthBar() {
    if (!this.healthCtx) return;
    const ctx = this.healthCtx;
    const w = this.healthCanvas.width;
    const h = this.healthCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);
    const pct = this.health / this.maxHealth;
    ctx.fillStyle = pct > 0.5 ? '#00ff88' : pct > 0.25 ? '#ffaa00' : '#ff4655';
    ctx.fillRect(2, 2, (w - 4) * pct, h - 4);
    this.healthSprite.material.map.needsUpdate = true;
  }

  takeDamage(amount, isHeadshot, hitPos) {
    if (this.isDead) return false;
    
    this.health -= amount;
    this.healthSprite.visible = true;
    this.updateHealthBar();
    
    // Hit reaction
    this.group.position.y -= 0.05;
    setTimeout(() => {
      if (!this.isDead) this.group.position.y += 0.05;
    }, 50);
    
    // Blood particle
    this.createBloodEffect(hitPos, isHeadshot);
    
    if (this.health <= 0) {
      this.die();
      return true;
    }
    
    // Become aggressive
    this.state = 'chase';
    return false;
  }

  createBloodEffect(pos, isHeadshot) {
    const count = isHeadshot ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: isHeadshot ? 0xff2244 : 0xaa1122,
        transparent: true,
        opacity: 0.9
      });
      const drop = new THREE.Mesh(geo, mat);
      drop.position.copy(pos || this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      this.scene.add(drop);
      
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      
      let life = 1.0;
      const animate = () => {
        life -= 0.025;
        drop.position.add(vel.clone().multiplyScalar(0.05));
        vel.y -= 0.08;
        drop.material.opacity = life;
        drop.scale.multiplyScalar(0.98);
        if (life > 0) requestAnimationFrame(animate);
        else this.scene.remove(drop);
      };
      requestAnimationFrame(animate);
    }
  }

  die() {
    this.isDead = true;
    this.state = 'dead';
    
    // Ragdoll fall
    const startY = this.group.position.y;
    const startRot = this.group.rotation.x;
    const start = performance.now();
    const duration = 600;
    
    const fall = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.group.rotation.x = startRot + (Math.PI / 2.2) * eased;
      this.group.position.y = startY - 0.8 * eased;
      if (t < 1) requestAnimationFrame(fall);
      else {
        // Fade out after 5 seconds
        setTimeout(() => {
          let opacity = 1;
          const fade = () => {
            opacity -= 0.02;
            this.group.traverse(c => {
              if (c.isMesh) {
                c.material.transparent = true;
                c.material.opacity = opacity;
              }
            });
            if (opacity > 0) requestAnimationFrame(fade);
            else {
              this.scene.remove(this.group);
            }
          };
          fade();
        }, 5000);
      }
    };
    requestAnimationFrame(fall);
    
    this.healthSprite.visible = false;
  }

  update(delta, playerPos, raycaster, colliders) {
    if (this.isDead) return;
    
    const distToPlayer = this.group.position.distanceTo(playerPos);
    
    // State machine
    if (distToPlayer < 25) {
      // Check line of sight
      const dir = playerPos.clone().sub(this.group.position);
      dir.y = 0;
      const dist = dir.length();
      dir.normalize();
      
      raycaster.set(
        this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
        playerPos.clone().sub(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0))).normalize()
      );
      const hits = raycaster.intersectObjects(colliders);
      const hasLOS = hits.length === 0 || hits[0].distance > dist;
      
      if (hasLOS) {
        this.playerLastSeen = playerPos.clone();
        this.state = dist < 12 ? 'attack' : 'chase';
      } else if (this.playerLastSeen && this.group.position.distanceTo(this.playerLastSeen) > 2) {
        this.state = 'chase';
        this.targetPos = this.playerLastSeen.clone();
      }
    } else {
      if (this.state !== 'patrol' && performance.now() - (this.lastSeenTime || 0) > 5000) {
        this.state = 'patrol';
        this.targetPos = this.map.getRandomPatrolPoint();
      }
    }
    
    // Movement
    let moveDir = new THREE.Vector3();
    if (this.state === 'patrol' || this.state === 'chase') {
      const target = this.state === 'chase' && this.playerLastSeen ? this.playerLastSeen : this.targetPos;
      moveDir = target.clone().sub(this.group.position);
      moveDir.y = 0;
      const dist = moveDir.length();
      
      if (dist < 1.5) {
        if (this.state === 'patrol') {
          this.targetPos = this.map.getRandomPatrolPoint();
        }
      } else {
        moveDir.normalize();
        
        // Strafe when chasing
        if (this.state === 'chase' && dist < 15) {
          this.strafeTimer += delta;
          if (this.strafeTimer > 2 + Math.random() * 2) {
            this.strafeDir *= -1;
            this.strafeTimer = 0;
          }
          const strafe = new THREE.Vector3(-moveDir.z, 0, moveDir.x).multiplyScalar(this.strafeDir * 0.6);
          moveDir.add(strafe).normalize();
        }
        
        const move = moveDir.multiplyScalar(this.speed * delta);
        const newPos = this.group.position.clone().add(move);
        
        // Collision check
        if (!this.map.checkCollision(newPos, 0.4)) {
          this.group.position.copy(newPos);
        } else {
          // Try to go around
          this.targetPos = this.map.getRandomPatrolPoint();
        }
        
        // Look towards movement or player
        const lookTarget = this.state === 'chase' ? playerPos : this.targetPos;
        const lookDir = lookTarget.clone().sub(this.group.position);
        lookDir.y = 0;
        if (lookDir.length() > 0.1) {
          const targetAngle = Math.atan2(lookDir.x, lookDir.z);
          let currentAngle = this.group.rotation.y;
          let diff = targetAngle - currentAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.group.rotation.y += diff * delta * 5;
        }
      }
    } else if (this.state === 'attack') {
      // Face player, strafe
      this.strafeTimer += delta;
      if (this.strafeTimer > 1.2) {
        this.strafeDir *= -1;
        this.strafeTimer = 0;
      }
      
      const toPlayer = playerPos.clone().sub(this.group.position);
      toPlayer.y = 0;
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(this.strafeDir * this.speed * 0.5 * delta);
      const newPos = this.group.position.clone().add(strafe);
      if (!this.map.checkCollision(newPos, 0.4)) {
        this.group.position.copy(newPos);
      }
      
      // Look at player
      toPlayer.normalize();
      const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = targetAngle - this.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * delta * 8;
    }
    
    // Bobbing when moving
    if (moveDir.length() > 0.01) {
      this.group.position.y = Math.sin(performance.now() * 0.008) * 0.05;
    }
    
    // Update health bar to face camera
    if (this.healthSprite.visible) {
      this.healthSprite.lookAt(playerPos);
    }
  }

  canShoot(playerPos, raycaster, colliders) {
    if (this.isDead) return false;
    if (performance.now() - this.lastShot < 350 + Math.random() * 400) return false;
    
    const dist = this.group.position.distanceTo(playerPos);
    if (dist > 35) return false;
    
    // LOS check
    raycaster.set(
      this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      playerPos.clone().sub(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0))).normalize()
    );
    const hits = raycaster.intersectObjects(colliders);
    if (hits.length > 0 && hits[0].distance < dist - 1) return false;
    
    return true;
  }

  shoot(playerPos) {
    this.lastShot = performance.now();
    // Return shoot data for player to handle damage
    return {
      origin: this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      target: playerPos.clone().add(new THREE.Vector3(0, 1.2 + (Math.random() - 0.5) * 0.6, 0)),
      damage: 12 + Math.random() * 18
    };
  }

  get mesh() {
    return this.group;
  }
}
