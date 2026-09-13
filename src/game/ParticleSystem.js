import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.decalGroup = new THREE.Group();
    this.scene.add(this.decalGroup);
  }

  createImpact(pos, normal, type='concrete') {
    const size = 0.09+Math.random()*0.06;
    const decalGeo = new THREE.CircleGeometry(size,9);
    const decalMat = new THREE.MeshStandardMaterial({
      color: type==='concrete'?0x1a1a1a:type==='metal'?0x442200:0x3a2a1a,
      roughness:0.92, metalness:0.0, transparent:true, opacity:0.92,
      polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1
    });
    const innerGeo = new THREE.CircleGeometry(size*0.52,7);
    const innerMat = new THREE.MeshBasicMaterial({ color:0x000000 });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    const inner = new THREE.Mesh(innerGeo, innerMat); inner.position.z=0.001; decal.add(inner);
    decal.position.copy(pos); decal.position.add(normal.clone().multiplyScalar(0.012));
    const lookAt = pos.clone().add(normal); decal.lookAt(lookAt);
    decal.rotateZ(Math.random()*Math.PI*2);
    this.decalGroup.add(decal);
    setTimeout(()=>{
      let opacity=0.92;
      const fade=()=>{
        opacity-=0.016; decalMat.opacity=opacity;
        if (opacity>0) requestAnimationFrame(fade); else this.decalGroup.remove(decal);
      };
      setTimeout(fade, 16000);
    },100);

    const particleCount = type==='metal'?9:6;
    for (let i=0;i<particleCount;i++){
      const pGeo = new THREE.SphereGeometry(0.016+Math.random()*0.022,4,4);
      const pMat = new THREE.MeshStandardMaterial({
        color: type==='metal'?0xffaa44:type==='wood'?0x8b5a2b:0xaaaaaa,
        emissive: type==='metal'?0xff6600:0x000000, emissiveIntensity: type==='metal'?1.6:0,
        transparent:true, opacity:0.82
      });
      const p = new THREE.Mesh(pGeo, pMat); p.position.copy(pos); this.scene.add(p);
      const vel = normal.clone().add(new THREE.Vector3((Math.random()-0.5)*1.6,(Math.random()-0.5)*1.6,(Math.random()-0.5)*1.6)).normalize().multiplyScalar(1.6+Math.random()*2.6);
      let life=1.0;
      const animate=()=>{
        life-=0.032; p.position.add(vel.clone().multiplyScalar(0.052)); vel.y-=0.152; vel.multiplyScalar(0.962); p.material.opacity=life; p.scale.multiplyScalar(0.972);
        if (life>0) requestAnimationFrame(animate); else this.scene.remove(p);
      };
      requestAnimationFrame(animate);
    }
    if (type==='metal'){
      const light = new THREE.PointLight(0xffaa44,2.2,3.2); light.position.copy(pos); this.scene.add(light); setTimeout(()=>this.scene.remove(light),55);
    }
  }

  createMuzzleSmoke(pos){
    for (let i=0;i<3;i++){
      const geo = new THREE.SphereGeometry(0.042+Math.random()*0.042,6,6);
      const mat = new THREE.MeshStandardMaterial({ color:0x888888, transparent:true, opacity:0.26, depthWrite:false });
      const smoke = new THREE.Mesh(geo, mat);
      smoke.position.copy(pos); smoke.position.add(new THREE.Vector3((Math.random()-0.5)*0.11,(Math.random()-0.5)*0.11,(Math.random()-0.5)*0.22));
      this.scene.add(smoke);
      const vel = new THREE.Vector3((Math.random()-0.5)*0.52, Math.random()*0.52, (Math.random()-0.5)*0.52);
      let life=1.0;
      const animate=()=>{
        life-=0.016; smoke.position.add(vel.clone().multiplyScalar(0.042)); smoke.scale.multiplyScalar(1.016); smoke.material.opacity=life*0.26;
        if (life>0) requestAnimationFrame(animate); else this.scene.remove(smoke);
      };
      requestAnimationFrame(animate);
    }
  }

  createSmokeGrenade(pos, color=0x888888){
    const smokeGroup = new THREE.Group(); smokeGroup.position.copy(pos); this.scene.add(smokeGroup);
    const smokeParticles = [];
    for (let i=0;i<42;i++){
      const geo = new THREE.SphereGeometry(0.32+Math.random()*0.72,8,8);
      const mat = new THREE.MeshStandardMaterial({ color:new THREE.Color(color).multiplyScalar(0.72+Math.random()*0.32), transparent:true, opacity:0.36, depthWrite:false, roughness:1 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set((Math.random()-0.5)*1.1, Math.random()*1.1, (Math.random()-0.5)*1.1);
      smokeGroup.add(p);
      smokeParticles.push({ mesh:p, vel:new THREE.Vector3((Math.random()-0.5)*0.022, Math.random()*0.032, (Math.random()-0.5)*0.022), rotSpeed:(Math.random()-0.5)*0.022 });
    }
    let time=0, opacity=0, expanding=true;
    const animate=()=>{
      time+=0.016;
      if (expanding){ opacity=Math.min(0.92, opacity+0.022); smokeGroup.scale.multiplyScalar(1.009); if (smokeGroup.scale.x>5.2) expanding=false; }
      else opacity-=0.0022;
      smokeParticles.forEach(sp=>{
        sp.mesh.position.add(sp.vel); sp.mesh.rotation.y+=sp.rotSpeed;
        sp.mesh.material.opacity = opacity*0.36*(0.72+Math.sin(time+sp.mesh.position.x)*0.32);
      });
      smokeGroup.position.y+=Math.sin(time*0.5)*0.0022;
      if (opacity>0) requestAnimationFrame(animate); else this.scene.remove(smokeGroup);
    };
    animate();
    return smokeGroup;
  }

  createFlashEffect(pos, intensity=1){
    const light = new THREE.PointLight(0xffffff, intensity*11,16); light.position.copy(pos); this.scene.add(light);
    let i=intensity; const fade=()=>{ i-=0.084; light.intensity=i*11; if (i>0) requestAnimationFrame(fade); else this.scene.remove(light); }; requestAnimationFrame(fade);
  }

  createSpikePlantEffect(pos){
    const ringGeo = new THREE.RingGeometry(0.5,1.2,24);
    const ringMat = new THREE.MeshBasicMaterial({ color:0xff4655, transparent:true, opacity:0.8, side:THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.copy(pos); ring.position.y+=0.05; ring.rotation.x=-Math.PI/2; this.scene.add(ring);
    let scale=0.5, opacity=0.8;
    const animate=()=>{
      scale+=0.04; opacity-=0.02; ring.scale.set(scale,scale,scale); ringMat.opacity=opacity;
      if (opacity>0) requestAnimationFrame(animate); else this.scene.remove(ring);
    };
    requestAnimationFrame(animate);
  }

  clear(){ this.decalGroup.clear(); }
}
