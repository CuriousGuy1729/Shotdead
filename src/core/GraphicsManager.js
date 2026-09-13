import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class GraphicsManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloomPass = null;
    this.ssaoPass = null;
    this.quality = 'high';
    this.init();
  }

  init() {
    // Renderer setup - ULTRA quality
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.physicallyCorrectLights = true;
    
    // Enable anisotropic filtering globally
    THREE.Texture.DEFAULT_ANISOTROPY = 16;
    
    // Post-processing
    this.setupPostProcessing();
    
    // Environment map for reflections - studio lighting
    this.setupEnvironment();
    
    // Fog - subtle volumetric
    this.scene.fog = new THREE.FogExp2(0x0a0e13, 0.012);
  }

  setupPostProcessing() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // SSAO - contact shadows for realism
    this.ssaoPass = new SSAOPass(this.scene, this.camera, size.x, size.y);
    this.ssaoPass.kernelRadius = 0.8;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.05;
    this.ssaoPass.output = SSAOPass.OUTPUT.Default;
    this.composer.addPass(this.ssaoPass);
    
    // Bloom - subtle for emissive
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.25, // strength
      0.4,  // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);
    
    // FXAA - anti-aliasing
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.set(1 / size.x, 1 / size.y);
    this.composer.addPass(fxaaPass);
    
    // Output
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  setupEnvironment() {
    // Create PMREM for image-based lighting - studio HDRI approximation
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a simple gradient environment
    const envScene = new THREE.Scene();
    const topColor = new THREE.Color(0x1a2a4a);
    const bottomColor = new THREE.Color(0x0a0e13);
    
    const envGeo = new THREE.SphereGeometry(100, 32, 32);
    const envMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(0.0, h)), 1.0);
        }
      `,
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor }
      },
      side: THREE.BackSide
    });
    
    const envMesh = new THREE.Mesh(envGeo, envMat);
    envScene.add(envMesh);
    
    // Add some lights to env
    const envLight1 = new THREE.PointLight(0xffffff, 2, 50);
    envLight1.position.set(10, 20, 10);
    envScene.add(envLight1);
    
    const envLight2 = new THREE.PointLight(0xff4655, 1, 30);
    envLight2.position.set(-15, 10, -10);
    envScene.add(envLight2);
    
    const renderTarget = pmremGenerator.fromScene(envScene);
    this.scene.environment = renderTarget.texture;
    
    pmremGenerator.dispose();
  }

  setQuality(quality) {
    this.quality = quality;
    
    switch(quality) {
      case 'low':
        this.renderer.shadowMap.enabled = false;
        this.bloomPass.enabled = false;
        this.ssaoPass.enabled = false;
        this.renderer.setPixelRatio(1);
        break;
      case 'high':
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.bloomPass.enabled = true;
        this.bloomPass.strength = 0.25;
        this.ssaoPass.enabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        break;
      case 'ultra':
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        this.bloomPass.enabled = true;
        this.bloomPass.strength = 0.35;
        this.ssaoPass.enabled = true;
        this.ssaoPass.kernelRadius = 1.2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        break;
    }
  }

  resize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    this.ssaoPass.setSize(width, height);
  }

  render() {
    this.composer.render();
  }
}
