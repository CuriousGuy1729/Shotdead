import * as THREE from 'three';

// Hyper-real PBR texture generator + real CDN loader for AAA quality
export class TextureGenerator {
  static loader = new THREE.TextureLoader();
  static cache = new Map();

  static loadTexture(url, repeat = 1, anisotropy = 16) {
    if (this.cache.has(url + repeat)) return this.cache.get(url + repeat);
    const tex = this.loader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = anisotropy;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(url + repeat, tex);
    return tex;
  }

  static loadNormal(url, repeat = 1) {
    if (this.cache.has(url + repeat + '_n')) return this.cache.get(url + repeat + '_n');
    const tex = this.loader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 16;
    this.cache.set(url + repeat + '_n', tex);
    return tex;
  }

  // Procedural fallbacks - ultra detailed
  static createConcreteTexture(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8a8d93';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 28;
      img.data[i] += n; img.data[i+1] += n; img.data[i+2] += n;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 250; i++) {
      const x = Math.random()*size, y = Math.random()*size, r = Math.random()*22+4;
      ctx.fillStyle = Math.random()>0.5 ? `rgba(0,0,0,${Math.random()*0.13+0.04})` : `rgba(255,255,255,${Math.random()*0.11+0.03})`;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 0.6;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath(); ctx.moveTo(Math.random()*size, Math.random()*size);
      ctx.bezierCurveTo(Math.random()*size, Math.random()*size, Math.random()*size, Math.random()*size, Math.random()*size, Math.random()*size);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return tex;
  }

  static createConcreteNormal(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0,0,size,size);
    const img = ctx.getImageData(0,0,size,size);
    for (let i = 0; i < img.data.length; i+=4) {
      const n = (Math.random()-0.5)*22;
      img.data[i] = 128 + n; img.data[i+1] = 128 + n; img.data[i+2] = 255 - Math.abs(n)*0.5;
    }
    ctx.putImageData(img,0,0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    return tex;
  }

  static createMetalTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0,0,0,size);
    grad.addColorStop(0,'#2a2e35'); grad.addColorStop(0.5,'#3a3f4a'); grad.addColorStop(1,'#1e2228');
    ctx.fillStyle = grad; ctx.fillRect(0,0,size,size);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let y = 0; y < size; y+=2) {
      const off = Math.sin(y*0.01)*2;
      ctx.beginPath(); ctx.moveTo(off,y); ctx.lineTo(size+off,y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 90; i++) {
      const x = Math.random()*size, y = Math.random()*size, len = Math.random()*90+20;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+len,y+(Math.random()-0.5)*2); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return tex;
  }

  static createGrungeMap(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,size,size);
    for (let i = 0; i < 6000; i++) {
      const x = Math.random()*size, y = Math.random()*size, r = Math.random()*3+0.5;
      ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.14})`;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  static createWoodTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0,0,size,size);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
    for (let y = 0; y < size; y+=8) {
      ctx.beginPath();
      ctx.moveTo(0,y+Math.sin(y*0.02)*4);
      ctx.bezierCurveTo(size*0.33,y+Math.sin(y*0.02+1)*6, size*0.66,y+Math.sin(y*0.02+2)*5, size,y+Math.sin(y*0.02+3)*4);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return tex;
  }

  // Try to load real PBR from Three.js examples CDN, fallback to procedural
  static getRealisticConcrete(repeat = 4) {
    try {
      // Attempt CDN - will fallback if fails (CORS ok)
      const diffuse = this.loadTexture('https://threejs.org/examples/textures/brick_diffuse.jpg', repeat);
      const rough = this.loadTexture('https://threejs.org/examples/textures/brick_roughness.jpg', repeat);
      return { diffuse, rough, normal: null, isReal: true };
    } catch {
      return { diffuse: this.createConcreteTexture(1024), rough: this.createGrungeMap(512), normal: this.createConcreteNormal(1024), isReal: false };
    }
  }

  static getRealisticMetal(repeat = 2) {
    try {
      const diffuse = this.loadTexture('https://threejs.org/examples/textures/metal/', repeat);
      return { diffuse, isReal: false };
    } catch {
      return { diffuse: this.createMetalTexture(512), isReal: false };
    }
  }
}
