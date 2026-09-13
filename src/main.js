import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GameMap } from './game/Map.js';
import { WeaponSystem } from './game/WeaponSystem.js';
import { Enemy } from './game/Enemy.js';
import { ParticleSystem } from './game/ParticleSystem.js';
import { AbilitySystem } from './game/AbilitySystem.js';
import { AudioManager } from './core/AudioManager.js';
import { GraphicsManager } from './core/GraphicsManager.js';
import { BuyMenu } from './game/BuyMenu.js';
import { SpikeSystem } from './game/SpikeSystem.js';
import { AgentSystem } from './game/AgentSystem.js';

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
    this.buyMenu = null;
    this.spikeSystem = null;
    this.agentSystem = null;

    this.enemies = [];
    this.raycaster = new THREE.Raycaster();

    this.player = {
      position: new THREE.Vector3(-60, 1.8, 0),
      velocity: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      armor: 25,
      credits: 800,
      ultPoints: 0,
      maxUltPoints: 7,
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
      rank: 'IRON',
      gameStarted: false,
      controls: null,
      updateHUD: () => this.updateHealthHUD(),
      dash: (dir) => {
        if (this.player.isDashing) return;
        this.player.isDashing = true;
        this.player.dashTime = 0.35;
        this.player.dashVelocity.copy(dir);
      }
    };

    this.keys = {};
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.gameStarted = false;
    this.gameMode = 'deathmatch';
    this.roundState = 'lobby'; // lobby, buy, live, planted, ended
    this.roundTime = 100;
    this.buyTime = 30;
    this.scoreAlly = 0;
    this.scoreEnemy = 0;
    this.roundNumber = 1;

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
    this.spikeSystem = new SpikeSystem(this.scene, this.map, this.particles, this.audio);
    this.agentSystem = new AgentSystem();
    this.buyMenu = new BuyMenu(this.player, this.weaponSystem, this.audio);
    this.player.controls = null; // will set after controls init
    this.setupControls();
    this.setupInput();
    this.setupUI();
    this.spawnEnemies();
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
    const ambient = new THREE.AmbientLight(0x8a9ab0, 0.36);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.85);
    sun.position.set(30, 42, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 160;
    sun.shadow.camera.left = -75; sun.shadow.camera.right = 75; sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
    sun.shadow.bias = -0.00032; sun.shadow.normalBias = 0.022; sun.shadow.radius = 4.2;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8ab4ff, 0.42); fill.position.set(-22, 20, -20); this.scene.add(fill);
    const hemi = new THREE.HemisphereLight(0x6a8ac0, 0x1a1a2a, 0.32); this.scene.add(hemi);
  }

  setupControls() {
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.player.controls = this.controls;
    this.controls.addEventListener('lock', () => {
      if (this.gameStarted) {
        document.getElementById('hud').classList.add('active');
        this.audio.resume();
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
      if (e.code === 'Digit4') this.weaponSystem.switchWeapon(3);
      if (e.code === 'Digit5') this.weaponSystem.switchWeapon(4);
      if (e.code === 'Digit6') this.weaponSystem.switchWeapon(5);

      if (e.code === 'KeyC') {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        if (this.agentSystem.getSelectedAgentId() === 'sage') this.abilities.useWall(this.camera.position.clone(), dir);
        else this.abilities.useSmoke(this.camera.position.clone(), dir);
      }
      if (e.code === 'KeyQ') {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        if (this.agentSystem.getSelectedAgentId() === 'sova') this.abilities.useRecon(this.camera.position.clone(), dir, this.enemies);
        else if (this.agentSystem.getSelectedAgentId() === 'sage') this.abilities.useHeal(this.player);
        else this.abilities.useFlash(this.camera.position.clone(), dir, this.camera.position);
      }
      if (e.code === 'KeyE') {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.abilities.useDash(this.player, dir);
      }
      if (e.code === 'KeyX') this.abilities.useUltimate();
      if (e.code === 'KeyB' && this.gameMode === 'tactical' && this.roundState === 'buy') {
        // Buy menu handled in BuyMenu class
      }
      if (e.code === 'KeyF') {
        // Spike plant/defuse hold
        if (this.spikeSystem.isCarried() && this.map.isInSpikeSite(this.camera.position)) {
          this._isPlanting = true;
          this.spikeSystem.startPlant(this.camera.position);
        } else if (this.spikeSystem.isPlanted() && this.camera.position.distanceTo(this.spikeSystem.spike.position) < 2.5) {
          this._isDefusing = true;
          this.spikeSystem.startDefuse(this.camera.position);
        }
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        document.getElementById('scoreboard').classList.add('open');
      }
      if (e.code === 'Escape' && this.gameStarted) {
        if (this.buyMenu.isOpen) this.buyMenu.close();
        else if (this.controls.isLocked) this.controls.unlock();
        else this.controls.lock();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyF') {
        this._isPlanting = false;
        this._isDefusing = false;
      }
      if (e.code === 'Tab') {
        document.getElementById('scoreboard').classList.remove('open');
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.gameStarted || !this.controls.isLocked || this.buyMenu.isOpen) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (!this.gameStarted || this.buyMenu.isOpen) return;
      const dir = Math.sign(e.deltaY);
      let next = this.weaponSystem.currentWeapon + dir;
      if (next < 0) next = this.weaponSystem.weapons.length - 1;
      if (next >= this.weaponSystem.weapons.length) next = 0;
      this.weaponSystem.switchWeapon(next);
    });
  }

  setupUI() {
    document.getElementById('playDeathmatch').addEventListener('click', () => this.startGame('deathmatch'));
    document.getElementById('playTactical').addEventListener('click', () => this.startGame('tactical'));
    document.getElementById('playAimLab').addEventListener('click', () => this.startGame('aimlab'));
    document.getElementById('openSettings').addEventListener('click', () => document.getElementById('settings').classList.add('open'));
    document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settings').classList.remove('open'));

    document.querySelectorAll('[data-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-q]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.graphics.setQuality(btn.dataset.q);
      });
    });
    document.querySelectorAll('[data-fov]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-fov]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.camera.fov = parseInt(btn.dataset.fov);
        this.camera.updateProjectionMatrix();
      });
    });
    document.querySelectorAll('[data-ch]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ch]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const colors = { green: '#00ff9d', cyan: '#0dbef5', red: '#ff4655', white: '#ffffff' };
        document.querySelectorAll('#crosshair .ch').forEach(el => { el.style.background = colors[btn.dataset.ch]; });
      });
    });
  }

  async simulateLoading() {
    const progress = document.getElementById('loaderProgress');
    const text = document.getElementById('loaderText');
    const pct = document.getElementById('loaderPct');
    const stepEl = document.getElementById('loaderStep');
    const steps = [
      'LOADING PBR 4K MATERIALS + REAL CDN TEXTURES',
      'COMPILING RTX SHADERS + ACES FILMIC + PMREM',
      'BAKING 4096 SHADOWS + SSAO + BLOOM + FXAA',
      'INITIALIZING PHYSICS + NAVMESH + WALLBANG',
      'SPAWNING NEXUS + BUY ZONES + SPIKE SITES',
      'LOADING AGENTS + WEAPONS + ECONOMY',
      'READY // DEPLOY - ESSENTIALS'
    ];
    for (let i = 0; i <= 100; i++) {
      progress.style.width = i + '%';
      const idx = Math.floor((i / 100) * (steps.length - 1));
      text.textContent = steps[idx];
      pct.textContent = i + '%';
      stepEl.textContent = `${idx + 1}/${steps.length}`;
      await new Promise(r => setTimeout(r, 10 + Math.random() * 18));
    }
    await new Promise(r => setTimeout(r, 280));
    document.getElementById('loader').classList.add('hidden');
  }

  startGame(mode) {
    this.gameMode = mode;
    this.gameStarted = true;
    this.player.gameStarted = true;
    this.player.kills = 0; this.player.deaths = 0; this.player.headshots = 0;
    this.player.health = 100; this.player.armor = 25; this.player.credits = 800; this.player.ultPoints = 0;
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.add('active');

    if (mode === 'deathmatch') {
      this.roundState = 'live';
      this.player.position.copy(this.map.getRandomSpawn(false));
      this.camera.position.copy(this.player.position);
      this.spawnEnemies(6);
      this.player.credits = 9999;
    } else if (mode === 'tactical') {
      this.roundState = 'buy';
      this.roundNumber = 1;
      this.scoreAlly = 0; this.scoreEnemy = 0;
      this.roundTime = 100; this.buyTime = 30;
      this.player.position.copy(this.map.getRandomSpawn(false));
      this.camera.position.copy(this.player.position);
      this.spawnEnemies(5);
      this.spikeSystem.reset();
      this.buyMenu.open();
    } else if (mode === 'aimlab') {
      this.roundState = 'live';
      this.player.position.set(0, 1.8, 45);
      this.camera.position.copy(this.player.position);
      this.spawnEnemies(12, true);
      this.player.credits = 9999;
    }

    this.controls.lock();
    this.abilities.reset();
    this.abilities.setAgent(this.agentSystem.getSelectedAgentId());
    this.updateHealthHUD();
  }

  spawnEnemies(count = 5, staticTargets = false) {
    this.enemies.forEach(e => this.scene.remove(e.group));
    this.enemies = [];
    for (let i = 0; i < count; i++) {
      const pos = staticTargets ? new THREE.Vector3((Math.random() - 0.5) * 44, 0, (Math.random() - 0.5) * 32 - 10) : this.map.getRandomSpawn(true);
      pos.y = 0;
      const enemy = new Enemy(this.scene, pos, i, this.map);
      if (staticTargets) { enemy.speed = 0; enemy.state = 'attack'; }
      this.enemies.push(enemy);
    }
  }

  updatePlayer(delta) {
    if (!this.controls.isLocked || this.buyMenu.isOpen) return;
    const speed = this.player.isSprinting ? 7.6 : this.player.isCrouching ? 2.3 : 4.9;
    const moveForward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const moveRight = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    this.player.isMoving = moveForward !== 0 || moveRight !== 0;
    this.player.isSprinting = this.keys['ShiftLeft'] && this.player.isMoving && !this.player.isAiming;
    this.player.isCrouching = this.keys['ControlLeft'];

    if (this.player.isMoving && this.player.onGround) {
      if (!this._footstepTimer || performance.now() - this._footstepTimer > (this.player.isSprinting ? 270 : 410)) {
        const mat = this.map.checkCollision(this.player.position, 0.6)?.userData?.penetration || 'concrete';
        this.audio.play(mat === 'metal' ? 'footstep_metal' : 'footstep_concrete', 0.26);
        this._footstepTimer = performance.now();
      }
    }

    const forward = new THREE.Vector3(); this.camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(); right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();
    const moveDir = new THREE.Vector3();
    if (moveForward) moveDir.add(forward.clone().multiplyScalar(moveForward));
    if (moveRight) moveDir.add(right.clone().multiplyScalar(moveRight));

    if (this.player.isDashing) {
      this.player.dashTime -= delta;
      const dashMove = this.player.dashVelocity.clone().multiplyScalar(delta);
      const newPos = this.player.position.clone().add(dashMove);
      if (!this.map.checkCollision(newPos, 0.52)) this.player.position.copy(newPos);
      if (this.player.dashTime <= 0) { this.player.isDashing = false; this.player.dashVelocity.set(0, 0, 0); }
    } else if (moveDir.length() > 0) {
      moveDir.normalize();
      let moveSpeed = speed;
      if (this.player.isAiming) moveSpeed *= 0.46;
      const newPos = this.player.position.clone().add(moveDir.multiplyScalar(moveSpeed * delta));
      newPos.y = this.player.position.y;
      const collider = this.map.checkCollision(newPos, 0.52);
      if (!collider) this.player.position.copy(newPos);
      else {
        const tryX = new THREE.Vector3(newPos.x, this.player.position.y, this.player.position.z);
        const tryZ = new THREE.Vector3(this.player.position.x, this.player.position.y, newPos.z);
        if (!this.map.checkCollision(tryX, 0.52)) this.player.position.x = tryX.x;
        if (!this.map.checkCollision(tryZ, 0.52)) this.player.position.z = tryZ.z;
      }
    }

    this.player.position.y = this.player.isCrouching ? 1.22 : 1.8;
    this.camera.position.copy(this.player.position);

    // Spike plant/defuse hold
    if (this._isPlanting) {
      const res = this.spikeSystem.updatePlant(delta, this.keys['KeyF']);
      if (res?.completed) {
        this.roundState = 'planted';
        this.player.credits += 300;
        this.player.ultPoints = Math.min(7, this.player.ultPoints + 1);
      }
    }
    if (this._isDefusing) {
      const res = this.spikeSystem.updateDefuse(delta, this.keys['KeyF']);
      if (res?.completed) {
        this.roundState = 'ended';
        this.scoreAlly++;
        this.endRound('defused');
      }
    }

    const recoil = this.weaponSystem.recoilY;
    if (recoil !== 0 && this.mouseDown) this.camera.rotation.x += recoil * 0.14;
  }

  handleShooting() {
    if (!this.mouseDown || !this.controls.isLocked || this.buyMenu.isOpen) return;
    const hit = this.weaponSystem.shoot(this.camera, this.player.isMoving, this.player.isAiming, this.raycaster, this.map.colliders, this.enemies, this.particles, this.map);
    if (!hit) return;
    const crosshair = document.getElementById('crosshair');
    crosshair.classList.add('firing');
    setTimeout(() => crosshair.classList.remove('firing'), 62);
    if (hit.type === 'world') {
      const mat = hit.object?.userData?.penetration || 'concrete';
      this.particles.createImpact(hit.point, hit.face.normal, mat);
      if (!hit.wallbang) this.particles.createMuzzleSmoke(hit.point);
    } else if (hit.enemy) {
      const isHeadshot = hit.type === 'headshot';
      const weapon = this.weaponSystem.getCurrentWeapon();
      let damage = weapon.damage;
      if (isHeadshot) damage *= weapon.headshotMultiplier;
      if (this.abilities.activeUltimate) damage *= 1.36;
      if (hit.wallbang) damage *= hit.penFactor || 0.5;
      if (weapon.name.includes('KNIFE')) damage = isHeadshot ? 110 : 55;
      const died = hit.enemy.takeDamage(damage, isHeadshot, hit.point);
      this.showHitmarker(isHeadshot);
      this.audio.play(isHeadshot ? 'headshot' : (hit.enemy.armor > 0 ? 'hit_armor' : 'hit'), isHeadshot ? 1 : 0.62);
      if (died) {
        this.player.kills++;
        if (isHeadshot) { this.player.headshots++; this.player.credits += 300; } else this.player.credits += 200;
        this.player.ultPoints = Math.min(7, this.player.ultPoints + 1);
        this.player.score += isHeadshot ? 200 : 100;
        this.audio.play('kill');
        this.showKillFeed(hit.enemy.id, isHeadshot, weapon.name.split(' // ')[0]);
        setTimeout(() => {
          if (this.enemies.filter(e => !e.isDead).length < 6) {
            const pos = this.map.getRandomSpawn(true); pos.y = 0;
            const enemy = new Enemy(this.scene, pos, Date.now(), this.map);
            this.enemies.push(enemy);
          }
        }, 1100);
        this.updateRank();
      }
    }
  }

  showHitmarker(isHeadshot) {
    const hm = document.getElementById('hitmarker');
    hm.classList.add('show');
    hm.style.color = isHeadshot ? '#ff4655' : '#ffffff';
    setTimeout(() => hm.classList.remove('show'), 82);
  }

  showKillFeed(enemyId, isHeadshot, weapon) {
    const feed = document.getElementById('killfeed');
    const item = document.createElement('div');
    item.className = 'kill-item';
    item.innerHTML = `<span style="color:#ff4655">YOU</span> <span style="opacity:0.6">→</span> <span>ENEMY ${enemyId}</span> ${isHeadshot ? '<span style="color:#ff4655;margin-left:8px">HEADSHOT</span>' : ''} <span style="margin-left:8px;opacity:0.5">${weapon}</span> <span style="margin-left:8px;color:#00ff9d">+${isHeadshot ? 300 : 200}</span>`;
    feed.appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }

  updateRank() {
    const kills = this.player.kills;
    let rank = 'IRON';
    if (kills >= 30) rank = 'RADIANT'; else if (kills >= 25) rank = 'IMMORTAL'; else if (kills >= 20) rank = 'DIAMOND'; else if (kills >= 15) rank = 'PLATINUM'; else if (kills >= 10) rank = 'GOLD'; else if (kills >= 5) rank = 'SILVER'; else if (kills >= 2) rank = 'BRONZE';
    this.player.rank = rank;
    document.getElementById('rankDisplay').textContent = rank;
  }

  updateEnemies(delta) {
    this.enemies.forEach(enemy => {
      enemy.update(delta, this.camera.position, this.raycaster, this.map.colliders);
      if (enemy.canShoot(this.camera.position, this.raycaster, this.map.colliders)) {
        const flashed = this.abilities.isFlashed(enemy.group.position);
        if (flashed > 0.52) return;
        if (this.abilities.isInSmoke(enemy.group.position) || this.abilities.isInSmoke(this.camera.position)) {
          if (Math.random() > 0.16) return;
        }
        const shootData = enemy.shoot(this.camera.position);
        if (shootData) {
          const tracerGeo = new THREE.BufferGeometry().setFromPoints([shootData.origin, shootData.target]);
          const tracerMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.52 });
          const tracer = new THREE.Line(tracerGeo, tracerMat);
          this.scene.add(tracer);
          setTimeout(() => this.scene.remove(tracer), 62);
          this.raycaster.set(shootData.origin, shootData.target.clone().sub(shootData.origin).normalize());
          const playerDist = shootData.origin.distanceTo(this.camera.position);
          const hits = this.raycaster.intersectObjects(this.map.colliders);
          const blocked = hits.length > 0 && hits[0].distance < playerDist - 0.5;
          if (!blocked) {
            let dmg = shootData.damage;
            if (this.player.armor > 0) {
              const absorb = Math.min(this.player.armor, dmg * 0.5);
              this.player.armor -= absorb;
              dmg -= absorb * 0.5;
              this.audio.play('hit_armor', 0.5);
            }
            this.player.health -= dmg;
            const vignette = document.getElementById('damageV');
            vignette.classList.add('show');
            setTimeout(() => vignette.classList.remove('show'), 122);
            this.camera.position.x += (Math.random() - 0.5) * 0.09;
            this.camera.position.y += (Math.random() - 0.5) * 0.09;
            if (this.player.health <= 0) this.playerDie();
            this.updateHealthHUD();
          }
        }
      }
    });
    this.enemies = this.enemies.filter(e => {
      if (e.isDead && e.group.parent === null) return false;
      return true;
    });
  }

  playerDie() {
    this.player.deaths++;
    this.player.health = 100;
    this.player.armor = this.player.armor > 0 ? Math.max(0, this.player.armor - 10) : 0;
    this.player.position.copy(this.map.getRandomSpawn(false));
    this.camera.position.copy(this.player.position);
    this.updateHealthHUD();
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.background = 'rgba(255,70,85,0.32)'; overlay.style.zIndex = '100'; overlay.style.pointerEvents = 'none';
    overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = "'Anton', sans-serif"; overlay.style.fontSize = '64px'; overlay.style.color = '#fff';
    overlay.textContent = 'ELIMINATED';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 820);
    if (this.gameMode === 'tactical') {
      this.scoreEnemy++;
      this.endRound('eliminated');
    }
  }

  endRound(reason) {
    this.roundState = 'ended';
    const won = reason === 'defused' || reason === 'eliminated_enemy';
    if (won) {
      this.player.credits += 3000;
      this.scoreAlly++;
    } else {
      // Loss bonus: 1900, 2400, 2900
      const lossStreak = this.scoreEnemy - this.scoreAlly;
      this.player.credits += lossStreak === 1 ? 1900 : lossStreak === 2 ? 2400 : 2900;
      this.scoreEnemy++;
    }
    setTimeout(() => {
      this.roundNumber++;
      this.roundState = 'buy';
      this.roundTime = 100;
      this.buyTime = 30;
      this.player.health = 100;
      this.player.position.copy(this.map.getRandomSpawn(false));
      this.camera.position.copy(this.player.position);
      this.spawnEnemies(5);
      this.spikeSystem.reset();
      this.buyMenu.open();
    }, 3200);
  }

  updateHealthHUD() {
    document.getElementById('healthValue').textContent = Math.max(0, Math.floor(this.player.health));
    document.getElementById('armorValue').textContent = Math.max(0, Math.floor(this.player.armor));
    const ring = document.getElementById('healthRing');
    const pct = this.player.health / this.player.maxHealth;
    const circumference = 2 * Math.PI * 31;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - pct);
    document.getElementById('creditsDisplay').textContent = `$${this.player.credits}`;
    document.getElementById('sbKills').textContent = this.player.kills;
    document.getElementById('sbDeaths').textContent = this.player.deaths;
    const hsPct = this.player.kills > 0 ? Math.round((this.player.headshots / this.player.kills) * 100) : 0;
    document.getElementById('sbHs').textContent = hsPct + '%';
    document.getElementById('sbCreds').textContent = `$${this.player.credits}`;
    document.getElementById('sbUlt').textContent = `${this.player.ultPoints}/${this.player.maxUltPoints}`;
  }

  setupMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    const ctx = canvas.getContext('2d');
    const draw = () => {
      if (!this.map) { requestAnimationFrame(draw); return; }
      ctx.fillStyle = '#06090f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 20) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }
      const scale = 2.4; const offsetX = canvas.width / 2; const offsetZ = canvas.height / 2;
      const toMinimap = (pos) => ({ x: offsetX + pos.x * scale, y: offsetZ + pos.z * scale });
      ctx.fillStyle = 'rgba(255,255,255,0.11)';
      this.map.colliders.forEach(col => {
        const pos = toMinimap(col.position);
        const size = col.geometry.parameters; if (!size) return;
        const w = size.width * scale; const h = size.depth * scale;
        ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h);
      });
      // Spike site
      this.map.spikeSites.forEach(site => {
        const pos = toMinimap(site.pos);
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, site.radius * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(0,255,136,0.12)'; ctx.fill();
      });
      this.enemies.forEach(e => {
        if (e.isDead) return;
        const pos = toMinimap(e.group.position);
        ctx.fillStyle = '#ff4655'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff4655'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + Math.sin(e.group.rotation.y) * 11, pos.y + Math.cos(e.group.rotation.y) * 11); ctx.stroke();
      });
      const pPos = toMinimap(this.camera.position);
      ctx.fillStyle = '#00ff9d'; ctx.beginPath(); ctx.arc(pPos.x, pPos.y, 5.2, 0, Math.PI * 2); ctx.fill();
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      ctx.strokeStyle = 'rgba(0,255,157,0.32)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pPos.x, pPos.y); ctx.lineTo(pPos.x + dir.x * 42, pPos.y + dir.z * 42); ctx.stroke();
      ctx.fillStyle = 'rgba(120,120,120,0.48)';
      this.abilities.smokes.forEach(s => {
        const pos = toMinimap(s.pos);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 16 * s.mesh.scale.x, 0, Math.PI * 2); ctx.fill();
      });
      if (this.spikeSystem.spike && this.spikeSystem.spike.visible) {
        const sPos = toMinimap(this.spikeSystem.spike.position);
        ctx.fillStyle = '#ff4655'; ctx.beginPath(); ctx.arc(sPos.x, sPos.y, 6, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(0.05, this.clock.getDelta());
    if (this.gameStarted) {
      if (this.roundState === 'buy') {
        this.buyTime -= delta;
        document.getElementById('roundTimer').textContent = `BUY ${Math.max(0, Math.floor(this.buyTime))}`;
        if (this.buyTime <= 0) {
          this.roundState = 'live';
          this.buyMenu.close();
        }
      } else if (this.roundState === 'live' || this.roundState === 'planted') {
        this.updatePlayer(delta);
        this.player.isAiming = this.rightMouseDown && this.weaponSystem.currentWeapon !== 5;
        this.weaponSystem.update(this.player.isAiming, delta, this.player.isMoving);
        this.handleShooting();
        this.updateEnemies(delta);
        this.abilities.update(delta);
        this.spikeSystem.update(delta);
        if (this.roundState === 'live') {
          this.roundTime -= delta;
          if (this.roundTime <= 0) {
            this.roundTime = 100;
            this.scoreEnemy++;
            this.endRound('time');
          }
          const mins = Math.floor(this.roundTime / 60);
          const secs = Math.floor(this.roundTime % 60);
          document.getElementById('roundTimer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        const targetFOV = this.player.isAiming ? (this.weaponSystem.getCurrentWeapon().isSniper ? 42 : 55) : 75;
        this.camera.fov += (targetFOV - this.camera.fov) * delta * 10;
        this.camera.updateProjectionMatrix();
        const crosshair = document.getElementById('crosshair');
        if (this.player.isAiming) crosshair.classList.add('ads'); else crosshair.classList.remove('ads');
        const baseSpread = 4.2; const moveSpread = this.player.isMoving ? 6.5 : 0; const sprintSpread = this.player.isSprinting ? 8.5 : 0;
        const weaponSpread = this.weaponSystem.getCurrentWeapon().spread * 3200;
        const totalSpread = baseSpread + moveSpread + sprintSpread + weaponSpread + Math.abs(this.weaponSystem.recoilY) * 85;
        const top = crosshair.querySelector('.ch-t'); const bottom = crosshair.querySelector('.ch-b');
        const left = crosshair.querySelector('.ch-l'); const right = crosshair.querySelector('.ch-r');
        if (top) {
          top.style.transform = `translateY(${-totalSpread}px)`;
          bottom.style.transform = `translateY(${totalSpread}px)`;
          left.style.transform = `translateX(${-totalSpread}px)`;
          right.style.transform = `translateX(${totalSpread}px)`;
        }
        if (this.gameMode === 'deathmatch') {
          document.getElementById('scoreAlly').textContent = this.player.kills;
          document.getElementById('scoreEnemy').textContent = this.player.deaths;
        } else {
          document.getElementById('scoreAlly').textContent = this.scoreAlly;
          document.getElementById('scoreEnemy').textContent = this.scoreEnemy;
        }
      }
      this.audio.updateListener(this.camera.position, this.camera.quaternion);
    }
    if (this.graphics) this.graphics.render(); else this.renderer.render(this.scene, this.camera);
  }
}

new ShotdeadGame();

window.addEventListener('resize', () => {
  const game = window.game;
  if (!game) return;
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
  game.graphics.resize(window.innerWidth, window.innerHeight);
});
