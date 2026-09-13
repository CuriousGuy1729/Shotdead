import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.decalGroup = new THREE.Group();
    this.scene.add(this.decalGroup);
  }

  createImpact(pos, normal, type = 'concrete') {
    // Bullet hole decal
    const size = 0.08 + Math.random() * 0.05;
    const decalGeo = new THREE.CircleGeometry(size, 8);
    const decalMat = new THREE.MeshStandardMaterial({
      color: type === 'concrete' ? 0x1a1a1a : 0x442200,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    
    // Add inner darker circle for depth
    const innerGeo = new THREE.CircleGeometry(size * 0.5, 6);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.z = 0.001;
    decal.add(inner);
    
    decal.position.copy(pos);
    decal.position.add(normal.clone().multiplyScalar(0.01));
    
    // Orient to surface
    const lookAt = pos.clone().add(normal);
    decal.lookAt(lookAt);
    
    // Random rotation
    decal.rotateZ(Math.random() * Math.PI * 2);
    
    this.decalGroup.add(decal);
    
    // Fade after time
    setTimeout(() => {
      let opacity = 0.9;
      const fade = () => {
        opacity -= 0.015;
        decalMat.opacity = opacity;
        if (opacity > 0) requestAnimationFrame(fade);
        else this.decalGroup.remove(decal);
      };
      // Keep decals longer for realism
      setTimeout(fade, 15000);
    }, 100);
    
    // Impact particles - dust / sparks
    const particleCount = type === 'metal' ? 8 : 5;
    for (let i = 0; i < particleCount; i++) {
      const pGeo = new THREE.SphereGeometry(0.015 + Math.random() * 0.02, 4, 4);
      const pMat = new THREE.MeshStandardMaterial({
        color: type === 'metal' ? 0xffaa44 : 0xaaaaaa,
        emissive: type === 'metal' ? 0xff6600 : 0x000000,
        emissiveIntensity: type === 'metal' ? 1.5 : 0,
        transparent: true,
        opacity: 0.8
      });
      const p = new THREE.Mesh(pGeo, pMat);
      p.position.copy(pos);
      this.scene.add(p);
      
      const vel = normal.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      )).normalize().multiplyScalar(1.5 + Math.random() * 2.5);
      
      let life = 1.0;
      const animate = () => {
        life -= 0.03;
        p.position.add(vel.clone().multiplyScalar(0.05));
        vel.y -= 0.15;
        vel.multiplyScalar(0.96);
        p.material.opacity = life;
        p.scale.multiplyScalar(0.97);
        if (life > 0) requestAnimationFrame(animate);
        else this.scene.remove(p);
      };
      requestAnimationFrame(animate);
    }
    
    // Light flash for impact
    if (type === 'metal') {
      const light = new THREE.PointLight(0xffaa44, 2, 3);
      light.position.copy(pos);
      this.scene.add(light);
      setTimeout(() => this.scene.remove(light), 50);
    }
  }

  createMuzzleSmoke(pos) {
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 6, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.25,
        depthWrite: false
      });
      const smoke = new THREE.Mesh(geo, mat);
      smoke.position.copy(pos);
      smoke.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      ));
      this.scene.add(smoke);
      
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.5
      );
      
      let life = 1.0;
      const animate = () => {
        life -= 0.015;
        smoke.position.add(vel.clone().multiplyScalar(0.04));
        smoke.scale.multiplyScalar(1.015);
        smoke.material.opacity = life * 0.25;
        if (life > 0) requestAnimationFrame(animate);
        else this.scene.remove(smoke);
      };
      requestAnimationFrame(animate);
    }
  }

  createSmokeGrenade(pos, color = 0x888888) {
    const smokeGroup = new THREE.Group();
    smokeGroup.position.copy(pos);
    this.scene.add(smokeGroup);
    
    // Create dense smoke volume
    const smokeParticles = [];
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.SphereGeometry(0.3 + Math.random() * 0.7, 8, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.7 + Math.random() * 0.3),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        roughness: 1
      });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(
        (Math.random() - 0.5) * 1,
        Math.random() * 1,
        (Math.random() - 0.5) * 1
      );
      smokeGroup.add(p);
      smokeParticles.push({
        mesh: p,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          Math.random() * 0.03,
          (Math.random() - 0.5) * 0.02
        ),
        rotSpeed: (Math.random() - 0.5) * 0.02
      });
    }
    
    let time = 0;
    let opacity = 0;
    let expanding = true;
    
    const animate = () => {
      time += 0.016;
      
      if (expanding) {
        opacity = Math.min(0.9, opacity + 0.02);
        smokeGroup.scale.multiplyScalar(1.008);
        if (smokeGroup.scale.x > 5) expanding = false;
      } else {
        opacity -= 0.002;
      }
      
      smokeParticles.forEach(sp => {
        sp.mesh.position.add(sp.vel);
        sp.mesh.rotation.y += sp.rotSpeed;
        sp.mesh.material.opacity = opacity * 0.35 * (0.7 + Math.sin(time + sp.mesh.position.x) * 0.3);
      });
      
      // Gentle drift
      smokeGroup.position.y += Math.sin(time * 0.5) * 0.002;
      
      if (opacity > 0) requestAnimationFrame(animate);
      else this.scene.remove(smokeGroup);
    };
    animate();
    
    return smokeGroup;
  }

  createFlashEffect(pos, intensity = 1) {
    const light = new THREE.PointLight(0xffffff, intensity * 10, 15);
    light.position.copy(pos);
    this.scene.add(light);
    
    let i = intensity;
    const fade = () => {
      i -= 0.08;
      light.intensity = i * 10;
      if (i > 0) requestAnimationFrame(fade);
      else this.scene.remove(light);
    };
    requestAnimationFrame(fade);
  }

  clear() {
    this.decalGroup.clear();
  }
}
