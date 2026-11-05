/**
 * MagicManager.js
 * Central 3D visual effects and spell orchestration engine.
 * Handles Three.js postprocessing (Bloom, Shockwave Distortion, Chromatic Aberration,
 * Screen Shake, Speed Lines), energy economy, GPU particle systems, and the full
 * arsenal of elemental magic spells.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { POWER_LIST } from './PowerRegistry.js';
import { MagicAudio } from './MagicAudio.js';
import { MagicGestureDetector } from './MagicGestureDetector.js';

export class MagicManager {
  constructor(scene, camera, renderer, audioContext = null) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Audio & Gesture modules
    this.audio = new MagicAudio(audioContext);
    this.gestureDetector = new MagicGestureDetector();

    // Magic Group root inside Three.js scene
    this.magicGroup = new THREE.Group();
    this.magicGroup.name = 'Magic_Effects_Root';
    this.scene.add(this.magicGroup);

    // Active power
    this.powers = POWER_LIST;
    this.activePowerIndex = 0;
    this.activePower = this.powers[0];

    // Energy economy
    this.maxEnergy = 100;
    this.energy = 100;
    this.energyRefillRate = 18; // energy per second

    // Screen shake & Camera FX
    this.shakeIntensity = 0;
    this.shakeDecay = 4.5;
    this.hitStopTimer = 0;
    this.webcamDimFactor = 0; // 0 = normal, 1 = dark during big charge

    // Initialize systems
    this.initPostProcessing();
    this.initHandSkeleton();
    this.initEnergyWave();
    this.initPowerBlast();
    this.initAirTempest();
    this.initWaterWhip();
    this.initEarthShatter();
    this.initFireAndLightning();

    this.enabled = false;
  }

  initPostProcessing() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Unreal Bloom Pass for glowing magical particles, beams, and orbs
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      1.15, // strength
      0.35, // radius
      0.45  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Custom Screen Shader (Shockwave distortion, Chromatic aberration, Screen shake, Speed lines, Vignette)
    this.screenFxShader = {
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uShake: { value: new THREE.Vector2(0, 0) },
        uShockwaveCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uShockwaveProgress: { value: -1.0 }, // -1 = inactive, 0..1 = active
        uShockwaveStrength: { value: 0.08 },
        uChromaOffset: { value: 0.0018 },
        uDim: { value: 0.0 },
        uSpeedLines: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uShake;
        uniform vec2 uShockwaveCenter;
        uniform float uShockwaveProgress;
        uniform float uShockwaveStrength;
        uniform float uChromaOffset;
        uniform float uDim;
        uniform float uSpeedLines;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv + uShake;

          // Radial Screen Shockwave Distortion
          if (uShockwaveProgress >= 0.0 && uShockwaveProgress <= 1.0) {
            vec2 diff = uv - uShockwaveCenter;
            float dist = length(diff);
            float waveRadius = uShockwaveProgress * 0.95;
            float waveWidth = 0.12;
            float waveDist = abs(dist - waveRadius);
            if (waveDist < waveWidth) {
              float factor = (1.0 - waveDist / waveWidth) * (1.0 - uShockwaveProgress);
              vec2 pushDir = normalize(diff);
              uv -= pushDir * factor * uShockwaveStrength;
            }
          }

          // Chromatic Aberration
          vec4 colR = texture2D(tDiffuse, uv + vec2(uChromaOffset, 0.0));
          vec4 colG = texture2D(tDiffuse, uv);
          vec4 colB = texture2D(tDiffuse, uv - vec2(uChromaOffset, 0.0));
          vec4 color = vec4(colR.r, colG.g, colB.b, colG.a);

          // Vignette
          vec2 d = uv - vec2(0.5);
          float vignette = clamp(1.0 - dot(d, d) * 1.2, 0.0, 1.0);
          color.rgb *= vignette;

          // Charge Dimming
          if (uDim > 0.0) {
            color.rgb = mix(color.rgb, color.rgb * 0.45 + vec3(0.0, 0.04, 0.08) * uDim, uDim);
          }

          // Anime Speed Lines for massive blasts
          if (uSpeedLines > 0.0) {
            float angle = atan(d.y, d.x);
            float lines = step(0.68, fract(sin(angle * 32.0 + uTime * 20.0) * 43758.5453));
            float distFade = smoothstep(0.15, 0.65, length(d));
            color.rgb += vec3(lines * distFade * uSpeedLines * 0.65);
          }

          gl_FragColor = color;
        }
      `
    };

    this.screenFxPass = new ShaderPass(this.screenFxShader);
    this.composer.addPass(this.screenFxPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  // ==========================================
  // Glowing Hand Skeleton Overlay
  // ==========================================
  initHandSkeleton() {
    this.handLines = [];
    const BONES = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
      [0, 13], [13, 14], [14, 15], [15, 16],// Ring
      [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
      [5, 9], [9, 13], [13, 17]             // Palm arch
    ];
    this.bonesIdx = BONES;

    for (let h = 0; h < 2; h++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(BONES.length * 2 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: this.activePower.glowHex,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const lineMesh = new THREE.LineSegments(geo, mat);
      lineMesh.visible = false;
      this.magicGroup.add(lineMesh);
      this.handLines.push(lineMesh);
    }
  }

  // ==========================================
  // 1. ENERGY WAVE (Kamehameha Beam & Orb)
  // ==========================================
  initEnergyWave() {
    // Charging Orb Core
    const orbGeo = new THREE.SphereGeometry(0.12, 24, 24);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.chargeOrb = new THREE.Mesh(orbGeo, orbMat);
    this.chargeOrb.visible = false;
    this.magicGroup.add(this.chargeOrb);

    // Outer Aura Sphere
    const auraGeo = new THREE.SphereGeometry(0.20, 24, 24);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      wireframe: true
    });
    this.chargeAura = new THREE.Mesh(auraGeo, auraMat);
    this.chargeAura.visible = false;
    this.magicGroup.add(this.chargeAura);

    // Suction Sparks (particles sucked inward to the orb)
    const count = 280;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(count * 3);
    this.sparkVelocities = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const rad = 0.35 + Math.random() * 0.45;
      sparkPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      sparkPos[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
      sparkPos[i * 3 + 2] = rad * Math.cos(phi);
      this.sparkVelocities.push({ rad, theta, phi, speed: 0.8 + Math.random() * 1.2 });
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0x80d8ff,
      size: 0.025,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.suctionParticles = new THREE.Points(sparkGeo, sparkMat);
    this.suctionParticles.visible = false;
    this.magicGroup.add(this.suctionParticles);

    // The Massive Shader Beam (Cylinder stretching into distance)
    const beamGeo = new THREE.CylinderGeometry(0.18, 0.28, 8.0, 24, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 4.0); // Origin at base
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.beamMesh = new THREE.Mesh(beamGeo, beamMat);

    // Inner White Core Beam
    const coreGeo = new THREE.CylinderGeometry(0.08, 0.12, 8.0, 16, 1, true);
    coreGeo.rotateX(Math.PI / 2);
    coreGeo.translate(0, 0, 4.0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.beamCore = new THREE.Mesh(coreGeo, coreMat);
    this.beamMesh.add(this.beamCore);

    this.beamMesh.visible = false;
    this.magicGroup.add(this.beamMesh);

    // Expanding Shockwave Ring
    const ringGeo = new THREE.RingGeometry(0.05, 0.22, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.shockwaveRing = new THREE.Mesh(ringGeo, ringMat);
    this.shockwaveRing.visible = false;
    this.magicGroup.add(this.shockwaveRing);
    this.shockwaveAge = 999;
  }

  // ==========================================
  // 2. POWER BLAST (Ki Orbs & Piercing Spirit)
  // ==========================================
  initPowerBlast() {
    this.blasts = [];
    for (let i = 0; i < 12; i++) {
      const geo = new THREE.SphereGeometry(0.07, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.magicGroup.add(mesh);
      this.blasts.push({
        mesh,
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        isSpirit: false,
        life: 0
      });
    }
  }

  // ==========================================
  // 3. AIR TEMPEST (Vortex, Blades)
  // ==========================================
  initAirTempest() {
    // Air Vortex particles
    const vCount = 180;
    const vGeo = new THREE.BufferGeometry();
    const vPos = new Float32Array(vCount * 3);
    this.vortexParticles = [];
    for (let i = 0; i < vCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const rad = 0.15 + Math.random() * 0.35;
      const y = (Math.random() - 0.5) * 0.4;
      vPos[i * 3] = Math.cos(angle) * rad;
      vPos[i * 3 + 1] = y;
      vPos[i * 3 + 2] = Math.sin(angle) * rad;
      this.vortexParticles.push({ angle, rad, y, speed: 4.5 + Math.random() * 3.5 });
    }
    vGeo.setAttribute('position', new THREE.BufferAttribute(vPos, 3));
    const vMat = new THREE.PointsMaterial({
      color: 0x69f0ae,
      size: 0.03,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    this.vortexMesh = new THREE.Points(vGeo, vMat);
    this.vortexMesh.visible = false;
    this.magicGroup.add(this.vortexMesh);

    // Air Blades (Crescents)
    this.airBlades = [];
    for (let i = 0; i < 6; i++) {
      const bladeGeo = new THREE.TorusGeometry(0.18, 0.02, 8, 24, Math.PI * 0.8);
      const bladeMat = new THREE.MeshBasicMaterial({
        color: 0xa7ffeb,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(bladeGeo, bladeMat);
      mesh.visible = false;
      this.magicGroup.add(mesh);
      this.airBlades.push({ mesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
    }
  }

  // ==========================================
  // 4. WATER WHIP (Flowing Ribbon & Orb)
  // ==========================================
  initWaterWhip() {
    // Dynamic trail ribbon (30 segments)
    this.waterPoints = [];
    for (let i = 0; i < 30; i++) {
      this.waterPoints.push(new THREE.Vector3(0, -99, 0));
    }
    const ribbonGeo = new THREE.BufferGeometry();
    const ribbonPos = new Float32Array(60 * 3);
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x00b0ff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.waterRibbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    this.waterRibbonMesh.visible = false;
    this.magicGroup.add(this.waterRibbonMesh);

    // Floating Water Orb
    const orbGeo = new THREE.SphereGeometry(0.16, 24, 24);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0x40c4ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      wireframe: true
    });
    this.waterOrbMesh = new THREE.Mesh(orbGeo, orbMat);
    this.waterOrbMesh.visible = false;
    this.magicGroup.add(this.waterOrbMesh);
  }

  // ==========================================
  // 5. EARTH SHATTER (Rocks & Ground Crack)
  // ==========================================
  initEarthShatter() {
    this.orbitingRocks = [];
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.05, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8d6e63,
        roughness: 0.85,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.magicGroup.add(mesh);
      this.orbitingRocks.push({
        mesh,
        angle: (i / 5) * Math.PI * 2,
        height: (Math.random() - 0.5) * 0.15,
        radius: 0.28,
        isThrown: false,
        vel: new THREE.Vector3()
      });
    }

    // Ground Crack Fissure
    const fissureGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const fissureMat = new THREE.MeshBasicMaterial({
      color: 0xff6d00,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      wireframe: true
    });
    this.groundCrack = new THREE.Mesh(fissureGeo, fissureMat);
    this.groundCrack.rotation.x = -Math.PI / 2;
    this.groundCrack.position.y = -0.64;
    this.groundCrack.visible = false;
    this.magicGroup.add(this.groundCrack);
    this.crackAge = 999;
  }

  // ==========================================
  // 6. FIRE & 7. LIGHTNING / SHIELD
  // ==========================================
  initFireAndLightning() {
    // Fireballs
    this.fireballs = [];
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.12, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff3d00,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.magicGroup.add(mesh);
      this.fireballs.push({ mesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
    }

    // Lightning Arcs (Line segments between hands / fingertips)
    const arcGeo = new THREE.BufferGeometry();
    const arcPos = new Float32Array(32 * 3);
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
    const arcMat = new THREE.LineBasicMaterial({
      color: 0xb388ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.lightningMesh = new THREE.LineSegments(arcGeo, arcMat);
    this.lightningMesh.visible = false;
    this.magicGroup.add(this.lightningMesh);

    // Hexagonal Shield Barrier
    const hexGeo = new THREE.CircleGeometry(0.38, 6);
    const hexMat = new THREE.MeshBasicMaterial({
      color: 0x7c4dff,
      transparent: true,
      opacity: 0.65,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.hexShield = new THREE.Mesh(hexGeo, hexMat);
    this.hexShield.visible = false;
    this.magicGroup.add(this.hexShield);
  }

  setPower(index) {
    if (index < 0) index = this.powers.length - 1;
    if (index >= this.powers.length) index = 0;
    this.activePowerIndex = index;
    this.activePower = this.powers[index];

    // Update hand skeleton color
    for (const line of this.handLines) {
      line.material.color.setHex(this.activePower.glowHex);
    }

    this.audio.playPowerSelect();
    return this.activePower;
  }

  nextPower() {
    return this.setPower(this.activePowerIndex + 1);
  }

  prevPower() {
    return this.setPower(this.activePowerIndex - 1);
  }

  consumeEnergy(amount) {
    if (this.energy >= amount) {
      this.energy = Math.max(0, this.energy - amount);
      return true;
    }
    return false;
  }

  triggerScreenShake(intensity = 0.02) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  triggerShockwave(screenX = 0.5, screenY = 0.5, strength = 0.08) {
    this.screenFxShader.uniforms.uShockwaveCenter.value.set(screenX, 1.0 - screenY);
    this.screenFxShader.uniforms.uShockwaveProgress.value = 0.0;
    this.screenFxShader.uniforms.uShockwaveStrength.value = strength;
  }

  // ==========================================
  // Main Update Loop
  // ==========================================
  update(dt, trackingData = null, mouseData = null) {
    if (!this.enabled) return;

    // 1. Refill Energy over time
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRefillRate * dt);

    const time = performance.now() * 0.001;

    // 2. Process Gestures
    let actions = null;
    if (trackingData) {
      actions = this.gestureDetector.process(trackingData, this.activePower.id);
    } else if (mouseData) {
      actions = this.processMouseFallback(mouseData, dt);
    }

    // 3. Update Hand Skeleton
    this.updateHandSkeleton(trackingData);

    // 4. Update Spells based on detected actions
    if (actions) {
      this.updateSpells(actions, dt, time);
    }

    // 5. Screen Shake decay & uniform updates
    if (this.shakeIntensity > 0.0005) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt * this.shakeIntensity);
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      this.screenFxShader.uniforms.uShake.value.set(sx, sy);
    } else {
      this.screenFxShader.uniforms.uShake.value.set(0, 0);
    }

    // 6. Shockwave progress
    const waveProgress = this.screenFxShader.uniforms.uShockwaveProgress.value;
    if (waveProgress >= 0.0 && waveProgress <= 1.0) {
      this.screenFxShader.uniforms.uShockwaveProgress.value += dt * 2.2;
      if (this.screenFxShader.uniforms.uShockwaveProgress.value > 1.0) {
        this.screenFxShader.uniforms.uShockwaveProgress.value = -1.0;
      }
    }

    this.screenFxShader.uniforms.uTime.value = time;
    this.screenFxShader.uniforms.uDim.value = THREE.MathUtils.lerp(
      this.screenFxShader.uniforms.uDim.value,
      this.webcamDimFactor,
      dt * 6.0
    );
  }

  updateHandSkeleton(trackingData) {
    if (!trackingData || !trackingData.hands || trackingData.hands.length === 0) {
      this.handLines[0].visible = false;
      this.handLines[1].visible = false;
      return;
    }

    const hands = trackingData.hands;
    for (let h = 0; h < 2; h++) {
      const lineMesh = this.handLines[h];
      if (h < hands.length) {
        lineMesh.visible = true;
        const hand = hands[h];
        const lm = hand.rawLandmarks;
        const wlm = hand.rawWorldLandmarks;
        const posAttr = lineMesh.geometry.attributes.position;
        const arr = posAttr.array;

        // View frustum dimensions at target hand depth
        const targetZ = hand.position.z;
        const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
        const visH = 2 * Math.tan(vFOV / 2) * Math.abs(targetZ);
        const visW = visH * this.camera.aspect;

        let ptr = 0;
        for (const [i, j] of this.bonesIdx) {
          // Point A
          const xA = (1 - lm[i].x) * 2 - 1;
          const yA = 1 - lm[i].y * 2;
          const zA = targetZ + (wlm ? -wlm[i].z * 0.8 : 0);
          arr[ptr++] = (xA * visW) / 2;
          arr[ptr++] = (yA * visH) / 2;
          arr[ptr++] = zA;

          // Point B
          const xB = (1 - lm[j].x) * 2 - 1;
          const yB = 1 - lm[j].y * 2;
          const zB = targetZ + (wlm ? -wlm[j].z * 0.8 : 0);
          arr[ptr++] = (xB * visW) / 2;
          arr[ptr++] = (yB * visH) / 2;
          arr[ptr++] = zB;
        }
        posAttr.needsUpdate = true;
      } else {
        lineMesh.visible = false;
      }
    }
  }

  updateSpells(actions, dt, time) {
    // ------------------------------------------
    // 1. Energy Wave (Kamehameha)
    // ------------------------------------------
    if (this.activePower.id === 'energy_wave') {
      if (actions.isCuppedCharging) {
        this.chargeOrb.visible = true;
        this.chargeAura.visible = true;
        this.suctionParticles.visible = true;

        const charge = actions.chargeAmount;
        this.chargeOrb.position.copy(actions.beamOrigin);
        this.chargeAura.position.copy(actions.beamOrigin);
        this.suctionParticles.position.copy(actions.beamOrigin);

        const orbScale = 0.5 + charge * 1.5;
        this.chargeOrb.scale.setScalar(orbScale);
        this.chargeAura.scale.setScalar(orbScale * 1.3);
        this.chargeAura.rotation.y += dt * 4.0;
        this.chargeAura.rotation.x += dt * 3.0;

        // Suction particle inwards motion
        const pArr = this.suctionParticles.geometry.attributes.position.array;
        for (let i = 0; i < this.sparkVelocities.length; i++) {
          const v = this.sparkVelocities[i];
          v.rad -= dt * v.speed;
          if (v.rad < 0.05) v.rad = 0.45 + Math.random() * 0.3;
          pArr[i * 3] = v.rad * Math.sin(v.phi) * Math.cos(v.theta);
          pArr[i * 3 + 1] = v.rad * Math.sin(v.phi) * Math.sin(v.theta);
          pArr[i * 3 + 2] = v.rad * Math.cos(v.phi);
        }
        this.suctionParticles.geometry.attributes.position.needsUpdate = true;

        // Audio and Webcam dimming
        this.audio.startChargeWhine(90, 800 * charge + 100);
        this.webcamDimFactor = charge * 0.65;
        this.triggerScreenShake(0.003 * charge);
      } else {
        this.chargeOrb.visible = false;
        this.chargeAura.visible = false;
        this.suctionParticles.visible = false;
        this.audio.stopChargeWhine();
        this.webcamDimFactor = 0;
      }

      // Sustained Beam Firing
      if (actions.isBeamFiring && this.consumeEnergy(this.activePower.drainRate * dt)) {
        this.beamMesh.visible = true;
        this.beamMesh.position.copy(actions.beamOrigin);

        // Align beam along direction
        const dir = actions.beamDirection.clone().normalize();
        const target = this.beamMesh.position.clone().add(dir);
        this.beamMesh.lookAt(target);

        // Beam pulse width & noise flutter
        const pulse = 1.0 + Math.sin(time * 30.0) * 0.15;
        this.beamMesh.scale.set(pulse, pulse, 1.0);
        this.beamCore.scale.set(pulse * 0.6, pulse * 0.6, 1.0);

        this.audio.startBeamRoar();
        this.triggerScreenShake(0.024);
        this.screenFxShader.uniforms.uSpeedLines.value = 0.85;

        // Spawn shockwave ring on beam release
        this.shockwaveRing.position.copy(actions.beamOrigin);
        this.shockwaveRing.quaternion.copy(this.beamMesh.quaternion);
        this.shockwaveRing.visible = true;
        this.shockwaveAge = 0;
      } else {
        if (this.beamMesh.visible) {
          // Just stopped firing
          this.audio.stopBeamRoar();
          this.triggerShockwave(0.5, 0.5, 0.12);
        }
        this.beamMesh.visible = false;
        this.screenFxShader.uniforms.uSpeedLines.value = 0.0;
      }

      // Animate shockwave ring expansion
      if (this.shockwaveAge < 0.4) {
        this.shockwaveAge += dt;
        const t = this.shockwaveAge / 0.4;
        this.shockwaveRing.scale.setScalar(1.0 + t * 6.0);
        this.shockwaveRing.material.opacity = (1.0 - t) * 0.9;
      } else {
        this.shockwaveRing.visible = false;
      }
    } else {
      this.beamMesh.visible = false;
      this.chargeOrb.visible = false;
      this.chargeAura.visible = false;
      this.suctionParticles.visible = false;
      this.audio.stopChargeWhine();
      this.audio.stopBeamRoar();
      this.webcamDimFactor = 0;
      this.screenFxShader.uniforms.uSpeedLines.value = 0.0;
    }

    // ------------------------------------------
    // 2. Power Blast & Spirit Shot
    // ------------------------------------------
    if (this.activePower.id === 'power_blast' && actions.justPushedBlast) {
      if (this.consumeEnergy(this.activePower.energyCost)) {
        this.spawnPowerBlast(actions.blastPosition, actions.isSpiritShot);
        this.audio.playPowerBlast(actions.isSpiritShot);
        this.triggerScreenShake(actions.isSpiritShot ? 0.012 : 0.018);
        this.triggerShockwave(0.5, 0.5, 0.05);
      }
    }
    this.updatePowerBlasts(dt);

    // ------------------------------------------
    // 3. Air Tempest
    // ------------------------------------------
    if (this.activePower.id === 'air') {
      if (actions.isVortexActive) {
        this.vortexMesh.visible = true;
        this.vortexMesh.position.copy(actions.vortexCenter);
        const pArr = this.vortexMesh.geometry.attributes.position.array;
        for (let i = 0; i < this.vortexParticles.length; i++) {
          const v = this.vortexParticles[i];
          v.angle += dt * v.speed;
          pArr[i * 3] = Math.cos(v.angle) * v.rad;
          pArr[i * 3 + 1] = v.y + Math.sin(time * 3 + i) * 0.04;
          pArr[i * 3 + 2] = Math.sin(v.angle) * v.rad;
        }
        this.vortexMesh.geometry.attributes.position.needsUpdate = true;
        this.audio.playAirGust();
      } else {
        this.vortexMesh.visible = false;
      }

      if (actions.justAirChop && this.consumeEnergy(this.activePower.energyCost)) {
        this.spawnAirBlade(actions.chopVelocity);
        this.audio.playAirBlade();
        this.triggerScreenShake(0.01);
      }

      if (actions.justGustPush && this.consumeEnergy(this.activePower.energyCost)) {
        this.audio.playAirGust();
        this.triggerShockwave(0.5, 0.5, 0.10);
        this.triggerScreenShake(0.018);
      }
    } else {
      this.vortexMesh.visible = false;
    }
    this.updateAirBlades(dt);

    // ------------------------------------------
    // 4. Water Whip
    // ------------------------------------------
    if (this.activePower.id === 'water') {
      // Flow ribbon following hand
      this.waterPoints.unshift(actions.waterHandPos.clone());
      this.waterPoints.pop();

      this.waterRibbonMesh.visible = true;
      const rArr = this.waterRibbonMesh.geometry.attributes.position.array;
      let ptr = 0;
      for (let i = 0; i < this.waterPoints.length - 1; i++) {
        const p = this.waterPoints[i];
        const width = (1.0 - i / this.waterPoints.length) * 0.06;
        rArr[ptr++] = p.x - width;
        rArr[ptr++] = p.y;
        rArr[ptr++] = p.z;
        rArr[ptr++] = p.x + width;
        rArr[ptr++] = p.y;
        rArr[ptr++] = p.z;
      }
      this.waterRibbonMesh.geometry.attributes.position.needsUpdate = true;

      // Floating Orb
      if (actions.isLiftingWaterOrb) {
        this.waterOrbMesh.visible = true;
        this.waterOrbMesh.position.copy(actions.waterHandPos).add(new THREE.Vector3(0, 0.15, 0));
        this.waterOrbMesh.rotation.y += dt * 3.0;
        this.waterOrbMesh.rotation.x += dt * 2.0;
      } else {
        this.waterOrbMesh.visible = false;
      }

      if (actions.justWaterThrow && this.consumeEnergy(this.activePower.energyCost)) {
        this.audio.playWaterSplash();
        this.triggerScreenShake(0.015);
        this.triggerShockwave(0.5, 0.5, 0.07);
      }
    } else {
      this.waterRibbonMesh.visible = false;
      this.waterOrbMesh.visible = false;
    }

    // ------------------------------------------
    // 5. Earth Shatter
    // ------------------------------------------
    if (this.activePower.id === 'earth') {
      if (actions.isFistRaised) {
        // Orbit rocks around fist
        for (const rock of this.orbitingRocks) {
          if (!rock.isThrown) {
            rock.mesh.visible = true;
            rock.angle += dt * 3.2;
            const rx = actions.fistPos.x + Math.cos(rock.angle) * rock.radius;
            const ry = actions.fistPos.y + rock.height;
            const rz = actions.fistPos.z + Math.sin(rock.angle) * rock.radius;
            rock.mesh.position.set(rx, ry, rz);
            rock.mesh.rotation.x += dt * 2.0;
            rock.mesh.rotation.y += dt * 2.5;
          }
        }
      } else {
        for (const rock of this.orbitingRocks) {
          if (!rock.isThrown) rock.mesh.visible = false;
        }
      }

      // Punch launches an orbiting boulder
      if (actions.justEarthPunch && this.consumeEnergy(this.activePower.energyCost)) {
        const unthrown = this.orbitingRocks.find(r => !r.isThrown && r.mesh.visible);
        if (unthrown) {
          unthrown.isThrown = true;
          unthrown.vel.copy(actions.punchDir).multiplyScalar(12.0);
          this.audio.playRockLaunch();
          this.triggerScreenShake(0.022);
        }
      }

      // Downward smash ground crack
      if (actions.justEarthSmash && this.consumeEnergy(this.activePower.energyCost)) {
        this.groundCrack.visible = true;
        this.crackAge = 0;
        this.audio.playEarthCrack();
        this.triggerScreenShake(0.038);
        this.triggerShockwave(0.5, 0.7, 0.14);
      }

      // Update thrown rocks
      for (const rock of this.orbitingRocks) {
        if (rock.isThrown) {
          rock.mesh.position.addScaledVector(rock.vel, dt);
          rock.vel.y -= 9.8 * dt * 0.4; // gravity
          if (rock.mesh.position.z < -6.0 || rock.mesh.position.y < -0.8) {
            rock.isThrown = false;
            rock.mesh.visible = false;
          }
        }
      }

      // Animate ground crack fade
      if (this.crackAge < 1.2) {
        this.crackAge += dt;
        this.groundCrack.material.opacity = (1.0 - this.crackAge / 1.2) * 0.85;
      } else {
        this.groundCrack.visible = false;
      }
    } else {
      for (const rock of this.orbitingRocks) rock.mesh.visible = false;
      this.groundCrack.visible = false;
    }

    // ------------------------------------------
    // 6. Fire & 7. Lightning / Shield
    // ------------------------------------------
    if (this.activePower.id === 'fire') {
      if (actions.justFireball && this.consumeEnergy(this.activePower.energyCost)) {
        this.spawnFireball();
        this.audio.playFireball();
        this.triggerScreenShake(0.016);
      }
      if (actions.isFlamethrower && this.consumeEnergy(this.activePower.drainRate * dt)) {
        this.spawnFireball(0.06);
        this.audio.playFireball();
        this.triggerScreenShake(0.008);
      }
    }
    this.updateFireballs(dt);

    if (this.activePower.id === 'lightning') {
      if (actions.isLightningSpread) {
        this.lightningMesh.visible = true;
        this.updateLightningArcs(actions);
        this.audio.playLightningZap();
      } else {
        this.lightningMesh.visible = false;
      }

      if (actions.isHexShieldActive) {
        this.hexShield.visible = true;
        this.hexShield.position.copy(actions.shieldCenter);
        this.hexShield.rotation.z += dt * 1.5;
        this.audio.playHexShield();
      } else {
        this.hexShield.visible = false;
      }
    } else {
      this.lightningMesh.visible = false;
      this.hexShield.visible = false;
    }
  }

  spawnPowerBlast(pos, isSpirit) {
    const blast = this.blasts.find(b => !b.active);
    if (!blast) return;
    blast.active = true;
    blast.isSpirit = isSpirit;
    blast.life = 0;
    blast.pos.copy(pos);
    blast.vel.set(0, 0, isSpirit ? -18.0 : -12.0);
    blast.mesh.visible = true;
    blast.mesh.scale.set(isSpirit ? 0.35 : 1.0, isSpirit ? 0.35 : 1.0, isSpirit ? 2.5 : 1.0);
    blast.mesh.material.color.setHex(isSpirit ? 0xffffff : 0xffd700);
  }

  updatePowerBlasts(dt) {
    for (const b of this.blasts) {
      if (b.active) {
        b.life += dt;
        b.pos.addScaledVector(b.vel, dt);
        b.mesh.position.copy(b.pos);
        if (b.life > 0.8 || b.pos.z < -8.0) {
          b.active = false;
          b.mesh.visible = false;
        }
      }
    }
  }

  spawnAirBlade(vel) {
    const blade = this.airBlades.find(b => !b.active);
    if (!blade) return;
    blade.active = true;
    blade.life = 0;
    blade.pos.set(0, 0, -0.6);
    blade.vel.set(vel.x * 0.5, 0, -11.0);
    blade.mesh.visible = true;
  }

  updateAirBlades(dt) {
    for (const b of this.airBlades) {
      if (b.active) {
        b.life += dt;
        b.pos.addScaledVector(b.vel, dt);
        b.mesh.position.copy(b.pos);
        b.mesh.rotation.z += dt * 16.0;
        if (b.life > 0.7) {
          b.active = false;
          b.mesh.visible = false;
        }
      }
    }
  }

  spawnFireball(speedScale = 1.0) {
    const fb = this.fireballs.find(f => !f.active);
    if (!fb) return;
    fb.active = true;
    fb.life = 0;
    fb.pos.set((Math.random() - 0.5) * 0.1, -0.1, -0.6);
    fb.vel.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, -9.0 * speedScale);
    fb.mesh.visible = true;
  }

  updateFireballs(dt) {
    for (const fb of this.fireballs) {
      if (fb.active) {
        fb.life += dt;
        fb.pos.addScaledVector(fb.vel, dt);
        fb.mesh.position.copy(fb.pos);
        fb.mesh.scale.setScalar(1.0 + fb.life * 1.5);
        if (fb.life > 0.6) {
          fb.active = false;
          fb.mesh.visible = false;
        }
      }
    }
  }

  updateLightningArcs(actions) {
    const pArr = this.lightningMesh.geometry.attributes.position.array;
    let ptr = 0;
    const center = new THREE.Vector3(0, 0, -0.7);
    for (let i = 0; i < 16; i++) {
      const p1 = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2));
      const p2 = p1.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25));
      pArr[ptr++] = p1.x;
      pArr[ptr++] = p1.y;
      pArr[ptr++] = p1.z;
      pArr[ptr++] = p2.x;
      pArr[ptr++] = p2.y;
      pArr[ptr++] = p2.z;
    }
    this.lightningMesh.geometry.attributes.position.needsUpdate = true;
  }

  // ==========================================
  // Mouse Mode Fallback
  // ==========================================
  processMouseFallback(mouseData, dt) {
    const actions = {
      isCuppedCharging: false,
      chargeAmount: 0,
      isBeamFiring: false,
      beamOrigin: new THREE.Vector3(mouseData.x * 0.4, mouseData.y * 0.3, -0.8),
      beamDirection: new THREE.Vector3(0, 0, -1),
      justPushedBlast: false,
      blastPosition: new THREE.Vector3(mouseData.x * 0.4, mouseData.y * 0.3, -0.8),
      isSpiritShot: false,
      isVortexActive: false,
      vortexCenter: new THREE.Vector3(mouseData.x * 0.4, mouseData.y * 0.3, -0.8),
      justAirChop: false,
      chopVelocity: new THREE.Vector3(1, 0, 0),
      justGustPush: false,
      waterHandPos: new THREE.Vector3(mouseData.x * 0.4, mouseData.y * 0.3, -0.8),
      isLiftingWaterOrb: false,
      justWaterThrow: false,
      isFistRaised: false,
      fistPos: new THREE.Vector3(mouseData.x * 0.4, mouseData.y * 0.3, -0.8),
      justEarthPunch: false,
      punchDir: new THREE.Vector3(0, 0, -1),
      justEarthSmash: false,
      justFireball: false,
      isFlamethrower: false,
      isLightningSpread: false,
      isHexShieldActive: false,
      shieldCenter: new THREE.Vector3(mouseData.x * 0.4, mouseData.y * 0.3, -0.8)
    };

    if (mouseData.isDown) {
      if (this.activePower.id === 'energy_wave') {
        this.mouseCharge = (this.mouseCharge || 0) + dt * 0.85;
        actions.isCuppedCharging = true;
        actions.chargeAmount = Math.min(1.0, this.mouseCharge);
        if (this.mouseCharge >= 1.0) {
          actions.isCuppedCharging = false;
          actions.isBeamFiring = true;
        }
      } else if (this.activePower.id === 'air') {
        actions.isVortexActive = true;
      } else if (this.activePower.id === 'earth') {
        actions.isFistRaised = true;
      } else if (this.activePower.id === 'lightning') {
        actions.isHexShieldActive = true;
      }
    } else {
      if (mouseData.justReleased) {
        if (this.activePower.id === 'energy_wave' && this.mouseCharge >= 0.5) {
          actions.isBeamFiring = true;
        } else if (this.activePower.id === 'power_blast') {
          actions.justPushedBlast = true;
        } else if (this.activePower.id === 'air') {
          actions.justAirChop = true;
        } else if (this.activePower.id === 'water') {
          actions.justWaterThrow = true;
        } else if (this.activePower.id === 'earth') {
          actions.justEarthPunch = true;
        } else if (this.activePower.id === 'fire') {
          actions.justFireball = true;
        }
      }
      this.mouseCharge = 0;
    }
    return actions;
  }

  render() {
    if (!this.enabled) return;
    this.composer.render();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
  }
}
