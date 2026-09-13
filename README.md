# SHOTDEAD // AAA Tactical FPS

> **Hyper-realistic Valorant-class 5v5 tactical shooter built with Three.js R160, PBR, RTX-inspired rendering, and addictive gunplay.**

Inspired by **Valorant, CS2, and Unreal Engine 5**, SHOTDEAD delivers near-photorealistic visuals in the browser — ACESFilmic tone mapping, 4K procedural PBR materials, 4096 PCFSoft shadows, SSAO, Unreal Bloom, PMREM environment probes, and GPU particles.

### 🎮 Live Preview
Run `npm run dev` — preview at `https://{port}-{sandbox}.e2b.app`

---

## 🔥 AAA Features

### Graphics — "Can't distinguish from reality"
- **Renderer**: WebGL2, `ACESFilmicToneMapping`, `SRGBColorSpace`, `PCFSoftShadowMap` 4096, 16x anisotropic
- **PBR Materials**: Procedural 4K concrete, brushed metal with scratches, polymer, glass with transmission
- **Post-FX Pipeline**: `EffectComposer` → `SSAOPass` (contact shadows) → `UnrealBloomPass` → `FXAA` → `OutputPass`
- **Lighting**: Sun (4096 shadow) + fill + hemisphere + 6 point lights with glow + emissive neon signs + volumetric fog (`FogExp2`)
- **Environment**: PMREMGenerator custom HDRI probe for IBL reflections, `envMapIntensity` 0.3-2.0
- **Decals**: Persistent bullet holes with depth, inner shadow, timed fade
- **Particles**: GPU sparks, concrete dust, smoke volumes (40 particles per smoke, 5m scale), muzzle smoke

### Map — NEXUS // SITE A
Valorant-inspired layout:
- **Mid**: 3 pillars, brutalist arch, connector
- **Site A**: Elevated heaven (4m high) with stairs, metal railing, green crate with emissive, wooden stacks, concrete barriers
- **Spawn**: Defender/Attacker with neon signs (`DEFENDERS` cyan, `ATTACKERS` red, `SITE A` green), tech lights
- **Details**: 6 light poles with PointLight + glow spheres, glass panels with `MeshPhysicalMaterial` transmission, floor markings, grunge maps
- **Collision**: AABB per mesh, slide-along-wall, 0.5m radius

### Weapons — Hyper-detailed procedural models
**VANDAL // 5.56 MK-IV** (primary):
- 20 meshes: receiver, top rail, 0.55m barrel (16 seg), muzzle brake, handguard with 3 vent slots, angled mag, grip, skeleton stock, red dot sight (emissive lens), charging handle, ejection port
- Materials: `MeshStandardMaterial` black metal (metalness 0.85, roughness 0.35, env 1.2), gunmetal, polymer, barrel (metalness 0.9, roughness 0.25)
- **Animations**: Recoil pattern (Valorant Vandal: up, up-right, up-left, then random), kick (0.08m back, 0.08 rad pitch), idle sway (sin 0.8Hz), ADS lerp (12x speed), reload (0.8 rad rotation, mag drop)
- **Ballistics**: Raycaster with spread (`0.0015` standing, `0.004` moving, `0.0004` ADS) + recoil spread, 600 RPM, 25/75, 2.1s reload, headshot x4 (156 dmg), tracer line, muzzle PointLight (8 intensity, 40ms)

**CLASSIC // .45** (secondary): frame, barrel, grip, 400 RPM, 12/36

**KNIFE // CARBON**: Tapered blade (vertex manipulation), 90 RPM, 55/110 dmg

### Gameplay — Addictive loop
- **Movement**: WASD, Shift sprint (7.5 m/s), Ctrl crouch (1.2m height), Space (reserved), mouse look (PointerLock), collision slide, dash ability (12 m/s, 0.35s, E)
- **Shooting**: Valorant recoil reset (pattern index resets after 400ms), first-bullet accuracy, movement inaccuracy, ADS FOV 55 (from 75), crosshair dynamic (expands with move/sprint/recoil)
- **Enemies**: 5-10 bots, Capsule + Sphere head (28cm), helmet + emissive visor, tactical gear, health bar sprite, patrol (9 points) / chase / attack / strafe states, LOS check via raycaster, canShoot (350-750ms), damage 12-30, blood particles, ragdoll fall (90° rotation, 0.6s), fade after 5s
- **Abilities**:
  - **C Smoke** (12s CD): projectile (18 m/s), explodes into 40-sphere volume, 5m radius, 12s duration, blocks LOS
  - **Q Flash** (8s CD): projectile, detonate flash (20 intensity, 25m), whites out if dot > -0.3 and dist <18m, flash bots
  - **E Dash** (4s CD): 12m dash, speed lines effect
  - **X Overdrive** (45s CD): 6s, +35% dmg, no recoil, red border + pulse
- **Audio**: Web Audio API procedural — gunshot (3 layers: low punch osc 180→40Hz, mid crack square 2.5x, noise burst bandpass 2kHz + delay tail), headshot (1200→2400Hz), hit, kill (3 tones), reload clicks, footstep (80→40Hz), dash (100→800Hz), flash (3kHz), smoke (noise lowpass 800Hz), empty
- **HUD**: Valorant-style — top bar (score, timer, rank), minimap (360px canvas, grid, colliders, enemies with direction, player FOV, smokes), crosshair (4 lines + dot, neon green/cyan/red, firing anim), hitmarker, killfeed (slideIn), bottom (health ring SVG, armor, ammo 56px Anton, weapon slots), abilities bar (56px, cooldown overlay)
- **Modes**:
  - **Deathmatch**: 6 bots, kills = scoreAlly, deaths = scoreEnemy, rank Iron→Radiant (30 kills Radiant), respawn on death
  - **Tactical 5v5**: 100s round timer, 5 bots, round resets
  - **Aim Lab**: 10 static bots, precision training

### Controls
| Key | Action |
|-----|--------|
| WASD | Move |
| Shift | Sprint |
| Ctrl | Crouch |
| Mouse L | Shoot |
| Mouse R | ADS |
| R | Reload |
| 1/2/3 | Vandal/Classic/Knife |
| Wheel | Switch weapon |
| C | Smoke |
| Q | Flash |
| E | Dash (Jett-like) |
| X | Ultimate Overdrive |
| Esc | Lock/Unlock mouse |

---

## 🛠 Tech Stack
- **Three.js 0.160.0**: Core, `PointerLockControls`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `SSAOPass`, `FXAAShader`, `OutputPass`
- **GSAP 3.12.5**: (installed, ready for advanced tweens)
- **Vite 5.2**: Dev server with `allowedHosts: true` for preview
- **No external assets**: All textures procedurally generated via Canvas (concrete noise + blotches + cracks, metal brushed lines + scratches, grunge, emissive grid)

## 📦 Run
```bash
npm install
npm run dev   # http://localhost:5173
npm run build
```

## 🎯 Quality Focus (User Request)
> "quality over quantity... hyper realistic 3d maps and guns i shouldnt be able to distinguish from reality"

- Single polished map (NEXUS) vs many low-quality
- One ultra-detailed Vandal with 20 meshes, PBR, animations
- 4K procedural textures, not low-res JPGs
- RTX-class pipeline: shadows, SSAO, bloom, PMREM, ACES
- Addictive: recoil pattern to master, headshot dink, kill sounds, rank progression, dynamic crosshair

## 🚀 Future (if more time)
- GLTF gun models (e.g., from Sketchfab) for even more realism
- Multiplayer via WebRTC
- Spike plant/defuse, buy menu
- More agents with abilities
- SSR, volumetric light shafts, SSR

---

**Built in one session — no placeholder cubes, only AAA.**

