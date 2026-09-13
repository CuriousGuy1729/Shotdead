import * as THREE from 'three';

// Procedural PBR texture generator for hyper-realism without external assets
export class TextureGenerator {
  static createConcreteTexture(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Base concrete color
    ctx.fillStyle = '#8a8d93';
    ctx.fillRect(0, 0, size, size);
    
    // Add noise and variation
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 30;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
      data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Add larger blotches
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 20 + 5;
      const v = Math.random() * 0.15 + 0.05;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${v})` : `rgba(255,255,255,${v})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add cracks / lines
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.bezierCurveTo(
        Math.random() * size, Math.random() * size,
        Math.random() * size, Math.random() * size,
        Math.random() * size, Math.random() * size
      );
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
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 20;
      img.data[i] = 128 + n;
      img.data[i+1] = 128 + n;
      img.data[i+2] = 255 - Math.abs(n) * 0.5;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    return tex;
  }

  static createMetalTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#2a2e35');
    grad.addColorStop(0.5, '#3a3f4a');
    grad.addColorStop(1, '#1e2228');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    
    // Brushed metal lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 2) {
      const offset = Math.sin(y * 0.01) * 2;
      ctx.beginPath();
      ctx.moveTo(offset, y);
      ctx.lineTo(size + offset, y);
      ctx.stroke();
    }
    // Scratches
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = Math.random() * 80 + 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
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
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 3 + 0.5;
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  static createEmissiveGrid(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, size-8, size-8);
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(size/2 - 20, size/2 - 1, 40, 2);
    ctx.fillRect(size/2 - 1, size/2 - 20, 2, 40);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
