import * as THREE from 'three';

export class AbilitySystem {
  constructor(scene, camera, map, particles, audio) {
    this.scene = scene;
    this.camera = camera;
    this.map = map;
    this.particles = particles;
    this.audio = audio;
    this.cooldowns = { smoke:0, flash:0, dash:0, ultimate:0, heal:0, wall:0, recon:0 };
    this.maxCooldowns = { smoke:12000, flash:8000, dash:4000, ultimate:45000, heal:12000, wall:14000, recon:10000 };
    this.smokes = [];
    this.flashes = [];
    this.walls = [];
    this.activeUltimate = false;
    this.ultimateTimer = 0;
    this.agent = 'jett';
  }

  setAgent(agent){ this.agent = agent; this.updateHUD(); }

  canUse(ability){ return this.cooldowns[ability]<=0; }

  useSmoke(position, direction){
    if (!this.canUse('smoke')) return false;
    this.cooldowns.smoke = this.maxCooldowns.smoke;
    this.audio.play('smoke');
    const projGeo = new THREE.SphereGeometry(0.08,8,8);
    const projMat = new THREE.MeshStandardMaterial({ color:0x888888, emissive:0x444444, emissiveIntensity:0.5 });
    const proj = new THREE.Mesh(projGeo, projMat); proj.position.copy(position); this.scene.add(proj);
    const velocity = direction.clone().multiplyScalar(18); velocity.y+=2;
    let time=0;
    const animate=()=>{
      time+=0.016; proj.position.add(velocity.clone().multiplyScalar(0.016)); velocity.y-=9.8*0.016;
      const hit = this.map.checkCollision(proj.position,0.11);
      if (hit || time>3 || proj.position.y<0.22){
        this.scene.remove(proj);
        const smokePos = proj.position.clone(); smokePos.y=Math.max(0.22, smokePos.y);
        const smoke = this.particles.createSmokeGrenade(smokePos, this.agent==='brim'?0x5a5a5a:0x666666);
        this.smokes.push({ mesh:smoke, pos:smokePos, time:performance.now() });
        setTimeout(()=>{ const idx=this.smokes.findIndex(s=>s.mesh===smoke); if (idx!==-1) this.smokes.splice(idx,1); },12000);
        return;
      }
      requestAnimationFrame(animate);
    };
    animate();
    this.updateHUD(); return true;
  }

  useFlash(position, direction, playerPos){
    if (!this.canUse('flash')) return false;
    this.cooldowns.flash = this.maxCooldowns.flash;
    this.audio.play('flash');
    const projGeo = new THREE.SphereGeometry(0.06,8,8);
    const projMat = new THREE.MeshStandardMaterial({ color:0xffffaa, emissive:0xffff00, emissiveIntensity:2 });
    const proj = new THREE.Mesh(projGeo, projMat); proj.position.copy(position); this.scene.add(proj);
    const velocity = direction.clone().multiplyScalar(20);
    let time=0;
    const animate=()=>{
      time+=0.016; proj.position.add(velocity.clone().multiplyScalar(0.016)); velocity.y-=9.8*0.016*0.5;
      if (time>1.2 || this.map.checkCollision(proj.position,0.11)){
        this.scene.remove(proj); this.detonateFlash(proj.position.clone(), playerPos); return;
      }
      requestAnimationFrame(animate);
    };
    animate();
    this.updateHUD(); return true;
  }

  detonateFlash(pos, playerPos){
    this.particles.createFlashEffect(pos,3);
    const flashLight = new THREE.PointLight(0xffffff,22,26); flashLight.position.copy(pos); this.scene.add(flashLight);
    const toPlayer = playerPos.clone().sub(pos); const dist = toPlayer.length(); toPlayer.normalize();
    const camForward = new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    const dot = camForward.dot(toPlayer.clone().negate());
    if (dist<19 && dot>-0.32){
      const intensity = Math.max(0,1-dist/19)*(dot>0.5?1:0.62);
      if (intensity>0.16) this.applyFlashToPlayer(intensity);
    }
    this.flashes.push({ pos:pos.clone(), time:performance.now(), intensity:1 });
    setTimeout(()=>this.scene.remove(flashLight),160);
    setTimeout(()=>{ this.flashes=this.flashes.filter(f=>performance.now()-f.time<3000); },3000);
  }

  applyFlashToPlayer(intensity){
    const overlay = document.createElement('div');
    overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='#ffffff'; overlay.style.zIndex='1000'; overlay.style.pointerEvents='none'; overlay.style.opacity=intensity;
    document.body.appendChild(overlay);
    let op=intensity;
    const fade=()=>{ op-=0.022; overlay.style.opacity=op; if (op>0) requestAnimationFrame(fade); else overlay.remove(); };
    setTimeout(()=>requestAnimationFrame(fade), intensity*820);
  }

  isFlashed(position){
    const now=performance.now();
    for (const flash of this.flashes){
      const age=now-flash.time;
      if (age<2600){
        const dist=position.distanceTo(flash.pos);
        if (dist<17){
          const remaining=1-age/2600;
          if (remaining>0.22) return remaining*(1-dist/17);
        }
      }
    }
    return 0;
  }

  isInSmoke(position){
    for (const smoke of this.smokes){
      if (position.distanceTo(smoke.pos) < 5.2*smoke.mesh.scale.x) return true;
    }
    return false;
  }

  useDash(player, direction){
    if (!this.canUse('dash')) return false;
    this.cooldowns.dash = this.maxCooldowns.dash;
    this.audio.play('dash');
    const dashDir = direction.clone(); dashDir.y=0; dashDir.normalize();
    const camDir = new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    if (camDir.y>0.32) dashDir.y=0.22;
    player.dash(dashDir.multiplyScalar(12.5));
    const dashEffect = document.createElement('div');
    dashEffect.style.position='fixed'; dashEffect.style.inset='0';
    dashEffect.style.background='radial-gradient(ellipse at center, transparent 32%, rgba(13,190,245,0.16) 100%)';
    dashEffect.style.pointerEvents='none'; dashEffect.style.zIndex='20';
    document.body.appendChild(dashEffect);
    setTimeout(()=>dashEffect.remove(),260);
    this.updateHUD(); return true;
  }

  useHeal(player){
    if (!this.canUse('heal')) return false;
    this.cooldowns.heal = this.maxCooldowns.heal;
    player.health = Math.min(100, player.health+40);
    const healEffect = document.createElement('div');
    healEffect.style.position='fixed'; healEffect.style.inset='0';
    healEffect.style.background='radial-gradient(ellipse at center, transparent 40%, rgba(0,255,157,0.18) 100%)';
    healEffect.style.pointerEvents='none'; healEffect.style.zIndex='20';
    document.body.appendChild(healEffect);
    setTimeout(()=>healEffect.remove(),420);
    this.updateHUD(); return true;
  }

  useWall(position, direction){
    if (!this.canUse('wall')) return false;
    this.cooldowns.wall = this.maxCooldowns.wall;
    // Sage wall - 3 segments
    const wallGroup = new THREE.Group();
    for (let i=0;i<3;i++){
      const segGeo = new THREE.BoxGeometry(1.2,3.2,0.32);
      const segMat = new THREE.MeshStandardMaterial({ color:0x2a9a7a, emissive:0x00ff9d, emissiveIntensity:0.22, roughness:0.6, metalness:0.1, transparent:true, opacity:0.92 });
      const seg = new THREE.Mesh(segGeo, segMat);
      seg.position.copy(position).add(direction.clone().multiplyScalar(2+i*1.3));
      seg.position.y=1.6;
      seg.lookAt(seg.position.clone().add(new THREE.Vector3(-direction.z,0,direction.x)));
      wallGroup.add(seg);
      this.scene.add(seg);
      this.map.colliders.push(seg);
      seg.userData.aabb = new THREE.Box3().setFromObject(seg);
      seg.userData.penetration = 'concrete';
    }
    this.walls.push({ group:wallGroup, time:performance.now() });
    setTimeout(()=>{
      wallGroup.children.forEach(c=>{ this.scene.remove(c); const idx=this.map.colliders.indexOf(c); if (idx!==-1) this.map.colliders.splice(idx,1); });
      const idx=this.walls.findIndex(w=>w.group===wallGroup); if (idx!==-1) this.walls.splice(idx,1);
    },8000);
    this.updateHUD(); return true;
  }

  useRecon(position, direction, enemies){
    if (!this.canUse('recon')) return false;
    this.cooldowns.recon = this.maxCooldowns.recon;
    const projGeo = new THREE.SphereGeometry(0.07,8,8);
    const projMat = new THREE.MeshStandardMaterial({ color:0x0dbef5, emissive:0x0dbef5, emissiveIntensity:1.2 });
    const proj = new THREE.Mesh(projGeo, projMat); proj.position.copy(position); this.scene.add(proj);
    const velocity = direction.clone().multiplyScalar(16);
    let time=0;
    const animate=()=>{
      time+=0.016; proj.position.add(velocity.clone().multiplyScalar(0.016)); velocity.y-=9.8*0.016*0.32;
      if (time>2.2 || this.map.checkCollision(proj.position,0.11)){
        this.scene.remove(proj);
        // Reveal enemies in 12m
        const pulseGeo = new THREE.SphereGeometry(12,16,16);
        const pulseMat = new THREE.MeshBasicMaterial({ color:0x0dbef5, transparent:true, opacity:0.18, wireframe:true });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat); pulse.position.copy(proj.position); this.scene.add(pulse);
        let scale=0.1, op=0.18;
        const pulseAnim=()=>{
          scale+=0.06; op-=0.008; pulse.scale.set(scale,scale,scale); pulseMat.opacity=op;
          if (op>0) requestAnimationFrame(pulseAnim); else this.scene.remove(pulse);
        };
        requestAnimationFrame(pulseAnim);
        // Mark enemies
        enemies.forEach(e=>{
          if (!e.isDead && e.group.position.distanceTo(proj.position)<12){
            e.healthSprite.visible=true;
            e.bodyMesh.material.emissive = new THREE.Color(0x0dbef5);
            e.bodyMesh.material.emissiveIntensity = 0.6;
            setTimeout(()=>{ e.bodyMesh.material.emissiveIntensity=0; },3000);
          }
        });
        return;
      }
      requestAnimationFrame(animate);
    };
    animate();
    this.updateHUD(); return true;
  }

  useUltimate(){
    if (!this.canUse('ultimate')) return false;
    this.cooldowns.ultimate = this.maxCooldowns.ultimate;
    this.activeUltimate = true;
    this.ultimateTimer = 6;
    const ultOverlay = document.createElement('div');
    ultOverlay.id='ultOverlay';
    ultOverlay.style.position='fixed'; ultOverlay.style.inset='0';
    ultOverlay.style.border='3px solid #ff4655';
    ultOverlay.style.boxShadow='inset 0 0 110px rgba(255,70,85,0.32), 0 0 52px rgba(255,70,85,0.52)';
    ultOverlay.style.pointerEvents='none'; ultOverlay.style.zIndex='15';
    ultOverlay.style.animation='pulse 0.5s infinite alternate';
    document.body.appendChild(ultOverlay);
    const style = document.createElement('style');
    style.textContent='@keyframes pulse{from{opacity:0.82}to{opacity:1}}';
    document.head.appendChild(style);
    const interval=setInterval(()=>{
      this.ultimateTimer-=0.11;
      if (this.ultimateTimer<=0){ this.activeUltimate=false; clearInterval(interval); ultOverlay.remove(); style.remove(); }
    },110);
    this.updateHUD(); return true;
  }

  update(delta){
    Object.keys(this.cooldowns).forEach(key=>{
      if (this.cooldowns[key]>0){ this.cooldowns[key]-=delta*1000; if (this.cooldowns[key]<0) this.cooldowns[key]=0; }
    });
    this.updateHUD();
  }

  updateHUD(){
    const abilities = [{id:'abilityC',key:'smoke'},{id:'abilityQ',key:'flash'},{id:'abilityE',key:'dash'},{id:'abilityX',key:'ultimate'}];
    abilities.forEach(({id,key})=>{
      const el=document.getElementById(id); if (!el) return;
      const cd=this.cooldowns[key]; const max=this.maxCooldowns[key];
      if (cd>0){ el.classList.add('on-cooldown'); el.querySelector('.ability-cooldown').textContent=Math.ceil(cd/1000); }
      else el.classList.remove('on-cooldown');
      if (key==='ultimate' && cd<=0) el.classList.add('active'); else if (key==='ultimate') el.classList.remove('active');
    });
  }

  reset(){ Object.keys(this.cooldowns).forEach(k=>this.cooldowns[k]=0); this.smokes.forEach(s=>this.scene.remove(s.mesh)); this.smokes=[]; this.flashes=[]; this.walls=[]; this.activeUltimate=false; }
}
