/**
 * MagicManager.js
 * Central 3D visual effects and spell orchestration engine for the Magic section.
 * Integrates MagicFX (procedural real-time Three.js effects module) for:
 *   - Energy Wave (charged beam, Goku/Kamehameha style)
 *   - Power Blast (rapid ki orbs & piercing spirit shot)
 *   - Air Tempest (swirling vortex, air gust, chopping blades)
 *   - Water Whip (flowing ribbon, floating water orb, splash)
 *   - Earth Shatter (orbiting dodecahedron boulders, punch, ground smash)
 *   - Dragon Fire (fireball blast, continuous stream)
 *   - Lightning Strike (branching segmented bolts, finger sparks)
 *   - Aegis Shield (hexagonal energy barrier)
 *
 * Provides:
 *   - Real-time hand landmark to 3D scene coordinate conversion
 *   - Energy economy & cooldown integration with effects' power parameter
 *   - Audio synthesis synchronization
 *   - Post-processing (bloom, shockwave distortion, vignette) active ONLY in Magic section
 *   - Mouse mode click-and-hold charge, drag to aim, release to cast
 */
import * as THREE from 'three';
import { MagicFX } from './magic-fx.js';
import { POWER_LIST } from './PowerRegistry.js';
import { MagicAudio } from './MagicAudio.js';
import { MagicGestureDetector } from './MagicGestureDetector.js';

// lm = {x,y} normalized landmark (0..1) from MediaPipe, camera = THREE.PerspectiveCamera
export function handToWorld(lm, camera, depth = 4) {
  const v = new THREE.Vector3((1 - lm.x) * 2 - 1, -(lm.y * 2 - 1), 0.5); // x mirrored like the webcam
  v.unproject(camera);
  const dir = v.sub(camera.position).normalize();
  return camera.position.clone().add(dir.multiplyScalar(depth));
}

if (typeof window !== 'undefined') {
  window.handToWorld = handToWorld;
}

export class MagicManager {
  constructor(scene, camera, renderer, audioContext = null) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Audio & Gesture modules
    this.audio = new MagicAudio(audioContext);
    this.gestureDetector = new MagicGestureDetector(this.camera);

    // Power registry
    this.powers = POWER_LIST;
    this.activePowerIndex = 0;
    this.activePower = this.powers[0];

    // Energy economy
    this.maxEnergy = 100;
    this.energy = 100;
    this.energyRefillRate = 18; // refills 18 energy/sec

    // Active MagicFX single instance
    this.fx = new MagicFX({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      quality: 1.0,
      postprocessing: true,
      maxParticles: 1500
    });

    // Active handles from fx.charge() and fx.cast()
    this.activeCharge = null;
    this.activeBeam = null;
    this.activeShield = null;

    // Mouse control state
    this.mouseCharging = false;
    this.mouseChargeStart = 0;
    this.mouseChargePower = 0.5;
    this.mousePrevDown = false;
    this.mouseLastAimDir = new THREE.Vector3(0, 0, -1);

    // Glowing hand skeleton overlay
    this.magicGroup = new THREE.Group();
    this.magicGroup.name = 'Magic_Overlay_Group';
    this.scene.add(this.magicGroup);
    this.initHandSkeleton();

    this.enabled = false;
  }

  // ==========================================
  // Coordinate Conversion: Screen/Landmark to Scene
  // ==========================================
  /**
   * Converts a MediaPipe normalized landmark (mirrored webcam) to exact Three.js scene coordinates.
   * On mirrored video: screen X is (1 - lm.x).
   */
  landmarkToScene(lm, wlm, idx, defaultDepth = -0.85) {
    if (!lm || !lm[idx]) return new THREE.Vector3(0, 0, defaultDepth);
    const sx = (1 - lm[idx].x) * 2 - 1; // NDC [-1, 1]
    const sy = 1 - lm[idx].y * 2;       // NDC [-1, 1]

    const depth = defaultDepth + (wlm && wlm[idx] ? -wlm[idx].z : 0) * 0.9;
    const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * Math.abs(depth);
    const visibleWidth = visibleHeight * this.camera.aspect;

    return new THREE.Vector3((sx * visibleWidth) / 2, (sy * visibleHeight) / 2, depth);
  }

  // lm = {x,y} normalized landmark (0..1) from MediaPipe, camera = THREE.PerspectiveCamera
  handToWorld(lm, camera = this.camera, depth = 4) {
    return handToWorld(lm, camera, depth);
  }

  getPalmScenePos(hand, depth = 1.2) {
    if (!hand) return new THREE.Vector3(0, 0, -0.85);
    const lm = hand.rawLandmarks;
    if (lm && lm[0] && lm[9]) {
      const p0 = handToWorld(lm[0], this.camera, depth);
      const p9 = handToWorld(lm[9], this.camera, depth);
      return new THREE.Vector3().addVectors(p0, p9).multiplyScalar(0.5);
    }
    return hand.position ? hand.position.clone() : new THREE.Vector3(0, 0, -0.85);
  }

  getFingertipScenePos(hand, tipIdx = 12, depth = 1.2) {
    if (!hand) return new THREE.Vector3(0, 0, -0.85);
    const lm = hand.rawLandmarks;
    if (lm && lm[tipIdx]) {
      return handToWorld(lm[tipIdx], this.camera, depth);
    }
    return hand.position ? hand.position.clone() : new THREE.Vector3(0, 0, -0.85);
  }

  // direction for a thrust: from wrist to middle fingertip
  getThrustDirection(hand) {
    if (!hand) return new THREE.Vector3(0, 0, -1);
    const lm = hand.rawLandmarks;
    if (lm && lm[12] && lm[0]) {
      // direction for a thrust: from wrist to middle fingertip
      const dir = handToWorld(lm[12], this.camera).sub(handToWorld(lm[0], this.camera)).normalize();
      return dir;
    }
    if (hand.quaternion) {
      return new THREE.Vector3(0, 0, 1).applyQuaternion(hand.quaternion).normalize();
    }
    return new THREE.Vector3(0, 0, -1);
  }

  getHandDirection(hand) {
    return this.getThrustDirection(hand);
  }

  // ==========================================
  // Hand Skeleton Visual Overlay
  // ==========================================
  initHandSkeleton() {
    this.handLines = [];
    const BONES = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];
    this.bonesIdx = BONES;

    for (let h = 0; h < 2; h++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(BONES.length * 2 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: this.activePower.glowHex,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const lineMesh = new THREE.LineSegments(geo, mat);
      lineMesh.visible = false;
      this.magicGroup.add(lineMesh);
      this.handLines.push(lineMesh);
    }
  }

  updateHandSkeleton(handTrackingData) {
    if (!handTrackingData || !handTrackingData.hands || handTrackingData.hands.length === 0) {
      this.handLines[0].visible = false;
      this.handLines[1].visible = false;
      return;
    }

    const hands = handTrackingData.hands;
    for (let h = 0; h < 2; h++) {
      const lineMesh = this.handLines[h];
      if (h < hands.length) {
        const hand = hands[h];
        const lm = hand.rawLandmarks;
        const wlm = hand.rawWorldLandmarks;
        if (lm && lm.length >= 21) {
          lineMesh.visible = true;
          lineMesh.material.color.setHex(this.activePower.glowHex);
          const pArr = lineMesh.geometry.attributes.position.array;
          let ptr = 0;
          for (let b = 0; b < this.bonesIdx.length; b++) {
            const i1 = this.bonesIdx[b][0];
            const i2 = this.bonesIdx[b][1];
            const pA = this.landmarkToScene(lm, wlm, i1);
            const pB = this.landmarkToScene(lm, wlm, i2);
            pArr[ptr++] = pA.x; pArr[ptr++] = pA.y; pArr[ptr++] = pA.z;
            pArr[ptr++] = pB.x; pArr[ptr++] = pB.y; pArr[ptr++] = pB.z;
          }
          lineMesh.geometry.attributes.position.needsUpdate = true;
        } else {
          lineMesh.visible = false;
        }
      } else {
        lineMesh.visible = false;
      }
    }
  }

  // ==========================================
  // Energy Management
  // ==========================================
  consumeEnergy(amount) {
    this.energy = Math.max(0, this.energy - amount);
  }

  // ==========================================
  // Handle Lifecycles
  // ==========================================
  stopCharge() {
    if (this.activeCharge) {
      this.activeCharge.stop();
      this.activeCharge = null;
      this.audio.stopCharge();
    }
  }

  stopBeam() {
    if (this.activeBeam) {
      this.activeBeam.stop();
      this.activeBeam = null;
      this.audio.stopBeam();
    }
  }

  stopShield() {
    if (this.activeShield) {
      this.activeShield.stop();
      this.activeShield = null;
    }
  }

  cleanupActiveEffects() {
    this.stopCharge();
    this.stopBeam();
    this.stopShield();
    this.mouseCharging = false;
    this.mousePrevDown = false;
    if (this.fx && this.fx.effects) {
      for (const s of this.fx.effects) {
        try {
          s.dispose?.();
        } catch (e) {}
      }
      this.fx.effects.clear();
    }
  }

  setPower(idx) {
    if (idx >= 0 && idx < this.powers.length) {
      this.cleanupActiveEffects();
      this.activePowerIndex = idx;
      this.activePower = this.powers[idx];
      this.audio.playPowerSelect();
    }
    return this.activePower;
  }

  // ==========================================
  // Main Update Loop
  // ==========================================
  update(dt, handTrackingData = null, mouseControlData = null) {
    if (!this.enabled) return;

    // 1. Refill energy over time
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRefillRate * dt);

    // 2. Process Input: Webcam Gesture or Mouse Fallback
    if (handTrackingData && handTrackingData.hands && handTrackingData.hands.length > 0) {
      this.updateHandSkeleton(handTrackingData);
      const actions = this.gestureDetector.process(handTrackingData, this.activePower.id, performance.now());
      this.processGestures(actions, handTrackingData, dt);
    } else if (mouseControlData) {
      this.handLines[0].visible = false;
      this.handLines[1].visible = false;
      this.processMouseControl(mouseControlData, dt);
    } else {
      this.stopCharge();
      this.stopBeam();
      this.stopShield();
    }

    // 3. Update MagicFX procedural effects engine
    this.fx.update(dt);
  }

  // ==========================================
  // Gesture to MagicFX Mapping
  // ==========================================
  processGestures(actions, trackingData, dt) {
    const hands = trackingData.hands;
    const h1 = hands[0];
    const h2 = hands.length > 1 ? hands[1] : null;

    const palm1 = this.getPalmScenePos(h1);
    const palm2 = h2 ? this.getPalmScenePos(h2) : palm1;
    const midpoint = new THREE.Vector3().addVectors(palm1, palm2).multiplyScalar(0.5);

    // direction for a thrust: from wrist to middle fingertip
    let aimDir;
    if (h1 && h1.rawLandmarks && h1.rawLandmarks[12] && h1.rawLandmarks[0]) {
      const dir1 = handToWorld(h1.rawLandmarks[12], this.camera).sub(handToWorld(h1.rawLandmarks[0], this.camera)).normalize();
      if (h2 && h2.rawLandmarks && h2.rawLandmarks[12] && h2.rawLandmarks[0]) {
        const dir2 = handToWorld(h2.rawLandmarks[12], this.camera).sub(handToWorld(h2.rawLandmarks[0], this.camera)).normalize();
        aimDir = new THREE.Vector3().addVectors(dir1, dir2).normalize();
      } else {
        aimDir = dir1;
      }
    } else {
      aimDir = this.getHandDirection(h1);
    }

    const powerCostMultiplier = Math.max(0.35, Math.min(1.0, this.energy / 100));

    // ----------------------------------------------------
    // 1. ENERGY WAVE (Goku / Kamehameha style)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'energyWave' || this.activePower.id === 'energy_wave') {
      if (actions.isCuppedCharging) {
        const chargePower = Math.min(1.0, 0.4 + actions.chargeAmount * 0.6);
        if (!this.activeCharge) {
          this.activeCharge = this.fx.charge('energyWave', {
            origin: midpoint,
            power: chargePower,
            color: this.activePower.glowHex
          });
          this.audio.startCharge(chargePower);
        } else {
          this.activeCharge.update({ origin: midpoint, power: chargePower });
          this.audio.updateCharge(chargePower);
        }
      } else {
        this.stopCharge();
      }

      if (actions.isBeamFiring) {
        this.stopCharge();
        const beamPower = Math.min(1.0, 0.6 + powerCostMultiplier * 0.4);
        if (!this.activeBeam) {
          if (this.energy > 5) {
            this.activeBeam = this.fx.cast('energyWave', {
              origin: midpoint,
              direction: aimDir,
              power: beamPower,
              color: this.activePower.glowHex
            });
            this.audio.startBeam(beamPower);
            this.audio.playShockwave();
          }
        } else {
          this.activeBeam.update({ origin: midpoint, direction: aimDir, power: beamPower });
          this.consumeEnergy(this.activePower.drainRate * dt);
          if (this.energy <= 0) {
            this.stopBeam();
          }
        }
      } else {
        this.stopBeam();
      }
      return;
    }

    // ----------------------------------------------------
    // 2. POWER BLAST (Ki blast & Spirit shot)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'powerBlast' || this.activePower.id === 'power_blast') {
      if (actions.justPushedBlast && this.energy >= this.activePower.energyCost) {
        const origin = actions.isSpiritShot ? this.getFingertipScenePos(h1, 8) : palm1;
        const dir = aimDir;
        const power = Math.max(0.4, powerCostMultiplier);
        this.fx.cast('powerBlast', {
          origin,
          direction: dir,
          power,
          color: this.activePower.glowHex
        });
        this.audio.playPowerBlast(actions.isSpiritShot);
        this.consumeEnergy(this.activePower.energyCost);
      }
      return;
    }

    // ----------------------------------------------------
    // 3. AIR TEMPEST (Vortex, Gust, Blades)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'air' || this.activePower.id === 'air') {
      if ((actions.isVortexActive || actions.justAirChop || actions.justGustPush) && this.energy >= this.activePower.energyCost) {
        const origin = actions.vortexCenter || palm1;
        const dir = actions.chopVelocity?.lengthSq() > 0.01 ? actions.chopVelocity.clone().normalize() : aimDir;
        const power = Math.max(0.45, powerCostMultiplier);
        this.fx.cast('air', {
          origin,
          direction: dir,
          power,
          color: this.activePower.glowHex
        });
        if (actions.justAirChop) {
          this.audio.playAirBlade();
        } else {
          this.audio.playAirGust();
        }
        this.consumeEnergy(this.activePower.energyCost);
      }
      return;
    }

    // ----------------------------------------------------
    // 4. WATER WHIP (Ribbon, Orb, Splash)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'water' || this.activePower.id === 'water') {
      if ((actions.isLiftingWaterOrb || actions.justWaterThrow) && this.energy >= this.activePower.energyCost) {
        const origin = palm1;
        const dir = aimDir;
        const target = origin.clone().addScaledVector(dir, 6.0);
        const power = Math.max(0.45, powerCostMultiplier);
        this.fx.cast('water', {
          origin,
          direction: dir,
          target,
          power,
          color: this.activePower.glowHex
        });
        this.audio.playWaterSplash();
        this.consumeEnergy(this.activePower.energyCost);
      }
      return;
    }

    // ----------------------------------------------------
    // 5. EARTH SHATTER (Rocks, Punch, Quake)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'earth' || this.activePower.id === 'earth') {
      if ((actions.isFistRaised || actions.justEarthPunch || actions.justEarthSmash) && this.energy >= this.activePower.energyCost) {
        const origin = actions.fistPos || palm1;
        const dir = actions.punchDir || aimDir;
        const power = Math.max(0.5, powerCostMultiplier);
        this.fx.cast('earth', {
          origin,
          direction: dir,
          power,
          color: this.activePower.glowHex
        });
        if (actions.justEarthSmash) {
          this.audio.playEarthCrack();
        } else {
          this.audio.playRockLaunch();
        }
        this.consumeEnergy(this.activePower.energyCost);
      }
      return;
    }

    // ----------------------------------------------------
    // 6. DRAGON FIRE (Fireball & Flamethrower)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'fire' || this.activePower.id === 'fire') {
      if ((actions.justFireball || actions.isFlamethrower) && this.energy >= this.activePower.energyCost) {
        const origin = palm1;
        const dir = aimDir;
        const power = Math.max(0.45, powerCostMultiplier);
        this.fx.cast('fire', {
          origin,
          direction: dir,
          power,
          color: this.activePower.glowHex
        });
        this.audio.playFireball();
        this.consumeEnergy(this.activePower.energyCost);
      }
      return;
    }

    // ----------------------------------------------------
    // 7. LIGHTNING STRIKE
    // ----------------------------------------------------
    if (this.activePower.fxType === 'lightning' || this.activePower.id === 'lightning') {
      if ((actions.isLightningSpread || actions.justLightningStrike) && this.energy >= this.activePower.energyCost) {
        const origin = this.getFingertipScenePos(h1, 8);
        const dir = aimDir;
        const target = origin.clone().addScaledVector(dir, 7.5);
        const power = Math.max(0.45, powerCostMultiplier);
        this.fx.cast('lightning', {
          origin,
          direction: dir,
          target,
          power,
          color: this.activePower.glowHex
        });
        this.audio.playLightningZap();
        this.consumeEnergy(this.activePower.energyCost);
      }
      return;
    }

    // ----------------------------------------------------
    // 8. AEGIS SHIELD (Hexagonal barrier)
    // ----------------------------------------------------
    if (this.activePower.fxType === 'shield' || this.activePower.id === 'shield') {
      if (actions.isHexShieldActive) {
        const origin = actions.shieldCenter || midpoint;
        const power = 0.85;
        if (!this.activeShield) {
          if (this.energy > 5) {
            this.activeShield = this.fx.cast('shield', {
              origin,
              direction: aimDir,
              power,
              color: this.activePower.glowHex
            });
            this.audio.playHexShield();
          }
        } else {
          this.activeShield.update({ origin, power });
          this.consumeEnergy(this.activePower.drainRate * dt);
          if (this.energy <= 0) {
            this.stopShield();
          }
        }
      } else {
        this.stopShield();
      }
      return;
    }
  }

  // ==========================================
  // Mouse Control: Click & Hold Charge, Drag Aim, Release Cast
  // ==========================================
  processMouseFallback(mouseData, dt) {
    return this.processMouseControl(mouseData, dt);
  }

  processMouseControl(mouseData, dt) {
    const isDown = Boolean(mouseData.isDown || mouseData.down);
    const justReleased = Boolean(mouseData.justReleased || mouseData.click || (!isDown && this.mousePrevDown));

    // Map mouse [-1, 1] to 3D scene space at depth z = -0.85
    const mx = mouseData.x || 0;
    const my = mouseData.y || 0;

    const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
    const targetZ = -0.85;
    const visH = 2 * Math.tan(vFOV / 2) * Math.abs(targetZ);
    const visW = visH * this.camera.aspect;

    const targetPos = new THREE.Vector3((mx * visW) / 2, (my * visH) / 2, targetZ);
    const aimDir = new THREE.Vector3(mx * 0.7, my * 0.5, -1.0).normalize();
    this.mouseLastAimDir.copy(aimDir);

    const fxType = this.activePower.fxType || 'powerBlast';
    const isSustained = (fxType === 'energyWave' || fxType === 'shield');

    if (isDown) {
      if (!this.mouseCharging) {
        this.mouseCharging = true;
        this.mouseChargeStart = performance.now();
        this.mouseChargePower = 0.45;

        if (fxType === 'shield') {
          // Shield casts immediately on hold and follows mouse
          if (this.energy > 5) {
            this.activeShield = this.fx.cast('shield', {
              origin: targetPos,
              direction: aimDir,
              power: 0.85,
              color: this.activePower.glowHex
            });
            this.audio.playHexShield();
          }
        } else {
          // Charge orb for energy wave or other powers
          this.activeCharge = this.fx.charge(fxType === 'energyWave' ? 'energyWave' : 'powerBlast', {
            origin: targetPos,
            power: 0.45,
            color: this.activePower.glowHex
          });
          this.audio.startCharge(0.45);
        }
      } else {
        // Holding & dragging: charge builds over time
        const holdTime = (performance.now() - this.mouseChargeStart) / 1000;
        const power = Math.min(1.0, 0.45 + holdTime * 0.65);
        this.mouseChargePower = power;

        if (this.activeCharge) {
          this.activeCharge.update({ origin: targetPos, power });
          this.audio.updateCharge(power);
        }

        if (fxType === 'shield' && this.activeShield) {
          this.activeShield.update({ origin: targetPos, power });
          this.consumeEnergy(this.activePower.drainRate * dt);
          if (this.energy <= 0) this.stopShield();
        } else if (fxType === 'energyWave' && holdTime >= 0.45) {
          // Sustained beam while dragging in mouse mode
          if (!this.activeBeam) {
            this.stopCharge();
            if (this.energy > 5) {
              this.activeBeam = this.fx.cast('energyWave', {
                origin: targetPos,
                direction: aimDir,
                power,
                color: this.activePower.glowHex
              });
              this.audio.startBeam(power);
              this.audio.playShockwave();
            }
          } else {
            this.activeBeam.update({ origin: targetPos, direction: aimDir, power });
            this.consumeEnergy(this.activePower.drainRate * dt);
            if (this.energy <= 0) this.stopBeam();
          }
        }
      }
    } else if (justReleased || (!isDown && this.mouseCharging)) {
      // Mouse Released: Cast the spell!
      this.stopCharge();

      if (isSustained) {
        this.stopBeam();
        this.stopShield();
      } else {
        if (this.energy >= this.activePower.energyCost) {
          const power = Math.max(0.4, this.mouseChargePower);
          const target = targetPos.clone().addScaledVector(aimDir, 8.0);
          this.fx.cast(fxType, {
            origin: targetPos,
            direction: aimDir,
            target,
            power,
            color: this.activePower.glowHex
          });
          this.playAudioForPower(fxType);
          this.consumeEnergy(this.activePower.energyCost);
        }
      }

      this.mouseCharging = false;
    }

    this.mousePrevDown = isDown;
  }

  playAudioForPower(fxType) {
    switch (fxType) {
      case 'powerBlast':
        this.audio.playPowerBlast(false);
        break;
      case 'air':
        this.audio.playAirGust();
        break;
      case 'water':
        this.audio.playWaterSplash();
        break;
      case 'earth':
        this.audio.playRockLaunch();
        break;
      case 'fire':
        this.audio.playFireball();
        break;
      case 'lightning':
        this.audio.playLightningZap();
        break;
      case 'shield':
        this.audio.playHexShield();
        break;
      default:
        this.audio.playPowerBlast(false);
        break;
    }
  }

  // ==========================================
  // Render & Postprocessing
  // ==========================================
  render() {
    if (!this.enabled) return;
    this.fx.render();
  }

  onResize() {
    // MagicFX resizes its render target dynamically in fx.render()
  }

  dispose() {
    this.cleanupActiveEffects();
    this.fx.dispose();
  }
}
