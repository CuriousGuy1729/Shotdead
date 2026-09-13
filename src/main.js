import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GameMap } from './game/Map.js';
import { WeaponSystem } from './game/WeaponSystem.js';
import { Enemy } from './game/Enemy.js';
import { ParticleSystem } from './game/ParticleSystem.js';
import { AbilitySystem } from './game/AbilitySystem.js';
import { AudioManager } from './core/AudioManager.js';
import { GraphicsManager } from './core/GraphicsManager.js';

class ShotdeadGame {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.clock = new THREE.Clock();
    
    this.controls = null;
    this.map = null;
    this.weaponSystem = null;
    this.particles = null;
    this.abilities = null;
    this.audio = null;
    this.graphics = null;
    
    this.enemies = [];
    this.raycaster = new THREE.Raycaster();
    
    // Player state
    this.player = {
      position: new THREE.Vector3(-60, 1.8, 0),
      velocity: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      armor: 50,
      isMoving: false,
      isSprinting: false,
      isCrouching: false,
      isAiming: false,
      isDashing: false,
      dashVelocity: new THREE.Vector3(),
      dashTime: 0,
      onGround: true,
      kills: 0,
      deaths: 0,
      headshots: 0,
      score: 0,
      rank: 'IRON'
    };
    
    this.keys = {};
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.gameStarted = false;
    this.gameMode = 'deathmatch'; // deathmatch, tactical
    this.roundTime = 0;
    this.scoreAlly = 0;
    this.scoreEnemy = 0;

    // Bind dash to player object
    this.player.dash = (dir) => {
      if (this.player.isDashing) return;
      this.player.isDashing = true;
      this.player.dashTime = 0.35;
      this.player.dashVelocity.copy(dir);
    };
    
    this.init();
    window.game = this;
  }

  async init() {
    this.setupRenderer();
    this.setupLighting();
    
    this.audio = new AudioManager();
    this.map = new GameMap(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.graphics = new GraphicsManager(this.renderer, this.scene, this.camera);
    
    this.camera.position.copy(this.player.position);
    this.weaponSystem = new WeaponSystem(this.scene, this.camera, this.audio);
    this.abilities = new AbilitySystem(this.scene, this.camera, this.map, this.particles, this.audio);
    
    this.setupControls();
    this.setupInput();
    this.setupUI();
    this.spawnEnemies();
    
    // Loading simulation for polish
    await this.simulateLoading();
    
    this.animate();
    this.setupMinimap();
  }

  setupRenderer() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);
  }

  setupLighting() {
    // Ambient - soft studio
    const ambient = new THREE.AmbientLight(0x8a9ab0, 0.35);
    this.scene.add(ambient);
    
    // Sun - directional with ultra soft shadows
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.8);
    sun.position.set(30, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    
    // Fill light
    const fill = new THREE.DirectionalLight(0x8ab4ff, 0.4);
    fill.position.set(-20, 20, -20);
    this.scene.add(fill);
    
    // Hemisphere for natural bounce
    const hemi = new THREE.HemisphereLight(0x6a8ac0, 0x1a1a2a, 0.3);
    this.scene.add(hemi);
  }

  setupControls() {
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
    
    this.controls.addEventListener('lock', () => {
      if (this.gameStarted) {
        document.getElementById('hud').classList.add('active');
        this.audio.resume();
      }
    });
    
    this.controls.addEventListener('unlock', () => {
      if (this.gameStarted) {
        // Don't show menu immediately, allow ESC to pause
        // document.getElementById('hud').classList.remove('active');
      }
    });
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      
      if (e.code === 'KeyR') this.weaponSystem.startReload();
      if (e.code === 'Digit1') this.weaponSystem.switchWeapon(0);
      if (e.code === 'Digit2') this.weaponSystem.switchWeapon(1);
      if (e.code === 'Digit3') this.weaponSystem.switchWeapon(2);
      
      if (e.code === 'KeyC') {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.abilities.useSmoke(this.camera.position.clone(), dir);
      }
      if (e.code === 'KeyQ') {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.abilities.useFlash(this.camera.position.clone(), dir, this.camera.position);
      }
      if (e.code === 'KeyE') {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.abilities.useDash(this.player, dir);
      }
      if (e.code === 'KeyX') {
        this.abilities.useUltimate();
      }
      
      if (e.code === 'Escape' && this.gameStarted) {
        if (this.controls.isLocked) this.controls.unlock();
        else this.controls.lock();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    
    window.addEventListener('mousedown', (e) => {
      if (!this.gameStarted || !this.controls.isLocked) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });
    
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });
    
    window.addEventListener('contextmenu', e => e.preventDefault());
    
    window.addEventListener('wheel', (e) => {
      if (!this.gameStarted) return;
      const dir = Math.sign(e.deltaY);
      let next = this.weaponSystem.currentWeapon + dir;
      if (next < 0) next = 2;
      if (next > 2) next = 0;
      this.weaponSystem.switchWeapon(next);
    });
  }

  setupUI() {
    document.getElementById('playBtn').addEventListener('click', () => {
      this.startGame('deathmatch');
    });
    document.getElementById('tacticalBtn').addEventListener('click', () => {
      this.startGame('tactical');
    });
    document.getElementById('aimLabBtn').addEventListener('click', () => {
      this.startGame('aimlab');
    });
    document.getElementById('settingsBtn').addEventListener('click', () => {
      document.getElementById('settings').classList.add('open');
    });
    document.getElementById('closeSettings').addEventListener('click', () => {
      document.getElementById('settings').classList.remove('open');
    });
    
    // Quality buttons
    document.querySelectorAll('[data-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-q]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.graphics.setQuality(btn.dataset.q);
      });
    });
    
    // Crosshair color
    document.querySelectorAll('[data-ch]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ch]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const colors = { green: '#00ff9d', cyan: '#0dbef5', red: '#ff4655' };
        document.querySelectorAll('#crosshair .ch-line').forEach(el => {
          el.style.background = colors[btn.dataset.ch];
        });
      });
    });
  }

  async simulateLoading() {
    const progress = document.getElementById('loaderProgress');
    const text = document.getElementById('loaderText');
    const steps = [
      'LOADING PBR MATERIALS // 4K TEXTURES',
      'COMPILING RTX SHADERS // ACES FILMIC',
      'BAKING LIGHTMAPS // 4096 SHADOWS',
      'INITIALIZING PHYSICS // COLLISION',
      'SPAWNING NEXUS // VALORANT PROTOCOL',
      'READY // DEPLOY'
    ];
    
    for (let i = 0; i <= 100; i++) {
      progress.style.width = i + '%';
      const stepIdx = Math.floor((i / 100) * (steps.length - 1));
      text.textContent = `${steps[stepIdx]} // ${i}%`;
      await new Promise(r => setTimeout(r, 12 + Math.random() * 20));
    }
    
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('loader').classList.add('hidden');
  }

  startGame(mode) {
    this.gameMode = mode;
    this.gameStarted = true;
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.headshots = 0;
    this.player.health = 100;
    this.player.armor = 50;
    
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.add('active');
    
    // Reset position based on mode
    if (mode === 'deathmatch') {
      this.player.position.copy(this.map.getRandomSpawn(false));
      this.camera.position.copy(this.player.position);
      this.spawnEnemies(6);
    } else if (mode === 'tactical') {
      this.player.position.set(-60, 1.8, 0);
      this.camera.position.copy(this.player.position);
      this.scoreAlly = 0;
      this.scoreEnemy = 0;
      this.roundTime = 100;
      this.spawnEnemies(5);
    } else if (mode === 'aimlab') {
      this.player.position.set(0, 1.8, 45);
      this.camera.position.copy(this.player.position);
      this.spawnEnemies(10, true); // static targets
    }
    
    this.controls.lock();
    this.abilities.reset();
  }

  spawnEnemies(count = 5, staticTargets = false) {
    // Clear existing
    this.enemies.forEach(e => this.scene.remove(e.group));
    this.enemies = [];
    
    for (let i = 0; i < count; i++) {
      const pos = staticTargets ? 
        new THREE.Vector3((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 30 - 10) :
        this.map.getRandomSpawn(true);
      pos.y = 0;
      const enemy = new Enemy(this.scene, pos, i, this.map);
      if (staticTargets) {
        enemy.speed = 0;
        enemy.state = 'attack';
      }
      this.enemies.push(enemy);
    }
  }

  updatePlayer(delta) {
    if (!this.controls.isLocked) return;
    
    const speed = this.player.isSprinting ? 7.5 : this.player.isCrouching ? 2.2 : 4.8;
    const moveForward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const moveRight = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    
    this.player.isMoving = moveForward !== 0 || moveRight !== 0;
    this.player.isSprinting = this.keys['ShiftLeft'] && this.player.isMoving && !this.player.isAiming;
    this.player.isCrouching = this.keys['ControlLeft'];
    
    // Footsteps
    if (this.player.isMoving && this.player.onGround) {
      if (!this._footstepTimer || performance.now() - this._footstepTimer > (this.player.isSprinting ? 280 : 420)) {
        this.audio.play('footstep', 0.25);
        this._footstepTimer = performance.now();
      }
    }
    
    // Calculate movement
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();
    
    const moveDir = new THREE.Vector3();
    if (moveForward) moveDir.add(forward.clone().multiplyScalar(moveForward));
    if (moveRight) moveDir.add(right.clone().multiplyScalar(moveRight));
    
    // Handle dash separately - works even without input
    if (this.player.isDashing) {
      this.player.dashTime -= delta;
      const dashMove = this.player.dashVelocity.clone().multiplyScalar(delta);
      const newPos = this.player.position.clone().add(dashMove);
      if (!this.map.checkCollision(newPos, 0.5)) {
        this.player.position.copy(newPos);
      }
      if (this.player.dashTime <= 0) {
        this.player.isDashing = false;
        this.player.dashVelocity.set(0, 0, 0);
      }
    } else if (moveDir.length() > 0) {
      moveDir.normalize();
      let moveSpeed = speed;
      if (this.player.isAiming) moveSpeed *= 0.45;
      
      const newPos = this.player.position.clone().add(moveDir.multiplyScalar(moveSpeed * delta));
      newPos.y = this.player.position.y; // keep height
      
      // Collision
      const collider = this.map.checkCollision(newPos, 0.5);
      if (!collider) {
        this.player.position.copy(newPos);
      } else {
        // Slide along wall
        const tryX = new THREE.Vector3(newPos.x, this.player.position.y, this.player.position.z);
        const tryZ = new THREE.Vector3(this.player.position.x, this.player.position.y, newPos.z);
        if (!this.map.checkCollision(tryX, 0.5)) this.player.position.x = tryX.x;
        if (!this.map.checkCollision(tryZ, 0.5)) this.player.position.z = tryZ.z;
      }
    }
    
    // Gravity / ground check
    this.player.position.y = this.player.isCrouching ? 1.2 : 1.8;
    
    this.camera.position.copy(this.player.position);
    
    // Recoil application to camera
    const recoil = this.weaponSystem.recoilY;
    if (recoil !== 0 && this.mouseDown) {
      // Apply recoil to camera pitch
      this.camera.rotation.x += recoil * 0.15;
    }
  }

  handleShooting() {
    if (!this.mouseDown || !this.controls.isLocked) return;
    
    const hit = this.weaponSystem.shoot(
      this.camera,
      this.player.isMoving,
      this.player.isAiming,
      this.raycaster,
      this.map.colliders,
      this.enemies,
      this.particles
    );
    
    if (!hit) return;
    
    // Crosshair feedback
    const crosshair = document.getElementById('crosshair');
    crosshair.classList.add('firing');
    setTimeout(() => crosshair.classList.remove('firing'), 60);
    
    if (hit.type === 'world') {
      this.particles.createImpact(hit.point, hit.face.normal, hit.face.material ? 'metal' : 'concrete');
      this.particles.createMuzzleSmoke(hit.point);
    } else if (hit.enemy) {
      const isHeadshot = hit.type === 'headshot';
      const weapon = this.weaponSystem.getCurrentWeapon();
      let damage = weapon.damage;
      if (isHeadshot) damage *= weapon.headshotMultiplier;
      if (this.abilities.activeUltimate) damage *= 1.35;
      if (weapon.name.includes('KNIFE')) damage = isHeadshot ? 110 : 55;
      
      const finalDamage = damage;
      
      const died = hit.enemy.takeDamage(finalDamage, isHeadshot, hit.point);
      
      // Hit marker
      this.showHitmarker(isHeadshot);
      this.audio.play(isHeadshot ? 'headshot' : 'hit', isHeadshot ? 1 : 0.6);
      
      if (died) {
        this.player.kills++;
        if (isHeadshot) this.player.headshots++;
        this.player.score += isHeadshot ? 200 : 100;
        
        this.audio.play('kill');
        this.showKillFeed(hit.enemy.id, isHeadshot);
        
        // Spawn new enemy
        setTimeout(() => {
          if (this.enemies.filter(e => !e.isDead).length < 6) {
            const pos = this.map.getRandomSpawn(true);
            pos.y = 0;
            const enemy = new Enemy(this.scene, pos, Date.now(), this.map);
            this.enemies.push(enemy);
          }
        }, 1200);
        
        // Rank up check
        this.updateRank();
      }
    }
  }

  showHitmarker(isHeadshot) {
    const hm = document.getElementById('hitmarker');
    hm.classList.add('show');
    hm.style.color = isHeadshot ? '#ff4655' : '#ffffff';
    setTimeout(() => hm.classList.remove('show'), 80);
  }

  showKillFeed(enemyId, isHeadshot) {
    const feed = document.getElementById('killfeed');
    const item = document.createElement('div');
    item.className = 'kill-item';
    item.innerHTML = `<span style="color:#ff4655">YOU</span> <span style="opacity:0.6">→</span> <span>ENEMY ${enemyId}</span> ${isHeadshot ? '<span style="color:#ff4655;margin-left:8px">HEADSHOT</span>' : ''} <span style="margin-left:8px;opacity:0.5">VANDAL</span>`;
    feed.appendChild(item);
    setTimeout(() => item.remove(), 4000);
  }

  updateRank() {
    const kills = this.player.kills;
    let rank = 'IRON';
    if (kills >= 30) rank = 'RADIANT';
    else if (kills >= 25) rank = 'IMMORTAL';
    else if (kills >= 20) rank = 'DIAMOND';
    else if (kills >= 15) rank = 'PLATINUM';
    else if (kills >= 10) rank = 'GOLD';
    else if (kills >= 5) rank = 'SILVER';
    else if (kills >= 2) rank = 'BRONZE';
    
    this.player.rank = rank;
  }

  updateEnemies(delta) {
    this.enemies.forEach(enemy => {
      enemy.update(delta, this.camera.position, this.raycaster, this.map.colliders);
      
      if (enemy.canShoot(this.camera.position, this.raycaster, this.map.colliders)) {
        // Check if flashed or in smoke
        const flashed = this.abilities.isFlashed(enemy.group.position);
        if (flashed > 0.5) return;
        if (this.abilities.isInSmoke(enemy.group.position) || this.abilities.isInSmoke(this.camera.position)) {
          if (Math.random() > 0.15) return; // 85% miss in smoke
        }
        
        const shootData = enemy.shoot(this.camera.position);
        if (shootData) {
          // Enemy tracer
          const tracerGeo = new THREE.BufferGeometry().setFromPoints([shootData.origin, shootData.target]);
          const tracerMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 });
          const tracer = new THREE.Line(tracerGeo, tracerMat);
          this.scene.add(tracer);
          setTimeout(() => this.scene.remove(tracer), 60);
          
          // Check if hits player
          this.raycaster.set(shootData.origin, shootData.target.clone().sub(shootData.origin).normalize());
          const playerDist = shootData.origin.distanceTo(this.camera.position);
          const hits = this.raycaster.intersectObjects(this.map.colliders);
          const blocked = hits.length > 0 && hits[0].distance < playerDist - 0.5;
          
          if (!blocked) {
            // Damage player with armor
            let dmg = shootData.damage;
            if (this.player.armor > 0) {
              const absorb = Math.min(this.player.armor, dmg * 0.5);
              this.player.armor -= absorb;
              dmg -= absorb * 0.5;
            }
            this.player.health -= dmg;
            
            // Damage vignette
            const vignette = document.getElementById('damageVignette');
            vignette.classList.add('show');
            setTimeout(() => vignette.classList.remove('show'), 120);
            
            // Screen shake
            this.camera.position.x += (Math.random() - 0.5) * 0.08;
            this.camera.position.y += (Math.random() - 0.5) * 0.08;
            
            if (this.player.health <= 0) {
              this.playerDie();
            }
            
            this.updateHealthHUD();
          }
        }
      }
    });
    
    // Remove dead enemies from array (but keep mesh fading)
    // Keep for respawn logic, filter only far dead
    this.enemies = this.enemies.filter(e => {
      if (e.isDead && e.group.parent === null) return false;
      return true;
    });
  }

  playerDie() {
    this.player.deaths++;
    this.player.health = 100;
    this.player.armor = 50;
    this.player.position.copy(this.map.getRandomSpawn(false));
    this.camera.position.copy(this.player.position);
    this.updateHealthHUD();
    
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(255,70,85,0.3)';
    overlay.style.zIndex = '100';
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = "'Anton', sans-serif";
    overlay.style.fontSize = '64px';
    overlay.style.color = '#fff';
    overlay.textContent = 'ELIMINATED';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 800);
  }

  updateHealthHUD() {
    document.getElementById('healthValue').textContent = Math.max(0, Math.floor(this.player.health));
    document.getElementById('armorValue').textContent = Math.max(0, Math.floor(this.player.armor));
    const ring = document.getElementById('healthRing');
    const pct = this.player.health / this.player.maxHealth;
    const circumference = 2 * Math.PI * 32;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - pct);
  }

  setupMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    const ctx = canvas.getContext('2d');
    
    const draw = () => {
      if (!this.map) {
        requestAnimationFrame(draw);
        return;
      }
      
      ctx.fillStyle = '#0a0e13';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }
      
      const scale = 2.2;
      const offsetX = canvas.width / 2;
      const offsetZ = canvas.height / 2;
      
      const toMinimap = (pos) => ({
        x: offsetX + pos.x * scale,
        y: offsetZ + pos.z * scale
      });
      
      // Draw colliders
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      this.map.colliders.forEach(col => {
        const pos = toMinimap(col.position);
        const size = col.geometry.parameters;
        if (!size) return;
        const w = size.width * scale;
        const h = size.depth * scale;
        ctx.fillRect(pos.x - w/2, pos.y - h/2, w, h);
      });
      
      // Draw enemies
      this.enemies.forEach(e => {
        if (e.isDead) return;
        const pos = toMinimap(e.group.position);
        ctx.fillStyle = '#ff4655';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
        // Direction
        ctx.strokeStyle = '#ff4655';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x + Math.sin(e.group.rotation.y) * 10, pos.y + Math.cos(e.group.rotation.y) * 10);
        ctx.stroke();
      });
      
      // Draw player
      const pPos = toMinimap(this.camera.position);
      ctx.fillStyle = '#00ff9d';
      ctx.beginPath();
      ctx.arc(pPos.x, pPos.y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Player FOV
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      ctx.strokeStyle = 'rgba(0,255,157,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pPos.x, pPos.y);
      ctx.lineTo(pPos.x + dir.x * 40, pPos.y + dir.z * 40);
      ctx.stroke();
      
      // Smokes
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      this.abilities.smokes.forEach(s => {
        const pos = toMinimap(s.pos);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 15 * s.mesh.scale.x, 0, Math.PI * 2);
        ctx.fill();
      });
      
      requestAnimationFrame(draw);
    };
    draw();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    const delta = Math.min(0.05, this.clock.getDelta());
    
    if (this.gameStarted) {
      this.updatePlayer(delta);
      
      this.player.isAiming = this.rightMouseDown && this.weaponSystem.currentWeapon !== 2;
      this.weaponSystem.update(this.player.isAiming, delta, this.player.isMoving);
      
      this.handleShooting();
      this.updateEnemies(delta);
      this.abilities.update(delta);
      
      // FOV effect for ADS
      const targetFOV = this.player.isAiming ? 55 : 75;
      this.camera.fov += (targetFOV - this.camera.fov) * delta * 10;
      this.camera.updateProjectionMatrix();
      
      // Update crosshair - dynamic based on movement and firing (Valorant style)
      const crosshair = document.getElementById('crosshair');
      if (this.player.isAiming) crosshair.classList.add('ads');
      else crosshair.classList.remove('ads');
      
      // Dynamic spread visual
      const baseSpread = 4;
      const moveSpread = this.player.isMoving ? 6 : 0;
      const sprintSpread = this.player.isSprinting ? 8 : 0;
      const weaponSpread = this.weaponSystem.getCurrentWeapon().spread * 3000;
      const totalSpread = baseSpread + moveSpread + sprintSpread + weaponSpread + Math.abs(this.weaponSystem.recoilY) * 80;
      
      const top = crosshair.querySelector('.ch-top');
      const bottom = crosshair.querySelector('.ch-bottom');
      const left = crosshair.querySelector('.ch-left');
      const right = crosshair.querySelector('.ch-right');
      if (top) {
        top.style.transform = `translateY(${-totalSpread}px)`;
        bottom.style.transform = `translateY(${totalSpread}px)`;
        left.style.transform = `translateX(${-totalSpread}px)`;
        right.style.transform = `translateX(${totalSpread}px)`;
      }
      
      // Update kills UI in top bar
      if (this.gameMode === 'deathmatch') {
        document.getElementById('scoreAlly').textContent = this.player.kills;
        document.getElementById('scoreEnemy').textContent = this.player.deaths;
        document.getElementById('roundTimer').textContent = `${this.player.rank}`;
      }
      
      // Round timer
      if (this.gameMode === 'tactical') {
        this.roundTime -= delta;
        if (this.roundTime <= 0) {
          this.roundTime = 100;
          this.scoreEnemy++;
          this.player.position.copy(this.map.getRandomSpawn(false));
          this.spawnEnemies(5);
        }
        const mins = Math.floor(this.roundTime / 60);
        const secs = Math.floor(this.roundTime % 60);
        document.getElementById('roundTimer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('scoreAlly').textContent = this.scoreAlly;
        document.getElementById('scoreEnemy').textContent = this.scoreEnemy;
      }
    }
    
    // Render with post-processing
    if (this.graphics) {
      this.graphics.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Start
const gameInstance = new ShotdeadGame();

// Handle resize
window.addEventListener('resize', () => {
  if (!gameInstance) return;
  gameInstance.camera.aspect = window.innerWidth / window.innerHeight;
  gameInstance.camera.updateProjectionMatrix();
  gameInstance.renderer.setSize(window.innerWidth, window.innerHeight);
  gameInstance.graphics.resize(window.innerWidth, window.innerHeight);
});

