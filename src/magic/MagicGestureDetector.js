/**
 * MagicGestureDetector.js
 * Advanced multi-hand gesture and motion engine for spellcasting.
 * Detects static hand poses, dual-hand spatial geometry, and dynamic
 * trajectory motions (thrust, circle, chop, raise, punch, smash).
 */
import * as THREE from 'three';

// lm = {x,y} normalized landmark (0..1) from MediaPipe, camera = THREE.PerspectiveCamera
export function handToWorld(lm, camera, depth = 4) {
  const v = new THREE.Vector3((1 - lm.x) * 2 - 1, -(lm.y * 2 - 1), 0.5); // x mirrored like the webcam
  v.unproject(camera);
  const dir = v.sub(camera.position).normalize();
  return camera.position.clone().add(dir.multiplyScalar(depth));
}

export class MagicGestureDetector {
  constructor(camera = null) {
    this.camera = camera;
    // History buffer for motion tracking (positions over last 400ms)
    this.handHistory = new Map(); // handId -> array of { time, pos3D, screenPos, pose }

    // Detected actions in the current frame
    this.currentActions = {
      // Energy Wave
      isCuppedCharging: false,
      chargeAmount: 0.0, // 0.0 to 1.0
      isBeamFiring: false,
      beamOrigin: new THREE.Vector3(),
      beamDirection: new THREE.Vector3(0, 0, -1),

      // Power Blast
      justPushedBlast: false,
      blastPosition: new THREE.Vector3(),
      isSpiritShot: false,

      // Air
      isVortexActive: false,
      vortexCenter: new THREE.Vector3(),
      justAirChop: false,
      chopVelocity: new THREE.Vector3(),
      justGustPush: false,

      // Water
      waterHandPos: new THREE.Vector3(),
      isLiftingWaterOrb: false,
      justWaterThrow: false,

      // Earth
      isFistRaised: false,
      fistPos: new THREE.Vector3(),
      justEarthPunch: false,
      punchDir: new THREE.Vector3(0, 0, -1),
      justEarthSmash: false,

      // Fire & Lightning & Shield
      justFireball: false,
      isFlamethrower: false,
      isLightningSpread: false,
      justLightningStrike: false,
      isHexShieldActive: false,
      shieldCenter: new THREE.Vector3()
    };

    this.chargeStartTime = 0;
    this.lastActionTimes = new Map(); // actionName -> timestamp (for debouncing)
  }

  debounce(actionName, cooldownMs, timestamp) {
    const last = this.lastActionTimes.get(actionName) || 0;
    if (timestamp - last >= cooldownMs) {
      this.lastActionTimes.set(actionName, timestamp);
      return true;
    }
    return false;
  }

  process(trackingData, activePowerId, timestamp = performance.now()) {
    // Reset transient triggers
    this.currentActions.justPushedBlast = false;
    this.currentActions.justAirChop = false;
    this.currentActions.justGustPush = false;
    this.currentActions.justWaterThrow = false;
    this.currentActions.justEarthPunch = false;
    this.currentActions.justEarthSmash = false;
    this.currentActions.justFireball = false;
    this.currentActions.justLightningStrike = false;

    if (!trackingData || !trackingData.hands || trackingData.hands.length === 0) {
      this.currentActions.isCuppedCharging = false;
      this.currentActions.chargeAmount = Math.max(0, this.currentActions.chargeAmount - 0.04);
      this.currentActions.isBeamFiring = false;
      this.currentActions.isVortexActive = false;
      this.currentActions.isFistRaised = false;
      this.currentActions.isFlamethrower = false;
      this.currentActions.isLightningSpread = false;
      this.currentActions.isHexShieldActive = false;
      return this.currentActions;
    }

    const hands = trackingData.hands;
    const numHands = hands.length;

    // 1. Analyze individual hand poses
    const handInfos = hands.map(h => {
      const poseInfo = this.classifyHandPose(h);
      this.recordHandHistory(h.id, h.position, h.screen, poseInfo, timestamp);
      const motion = this.analyzeHandMotion(h.id, timestamp);
      return { hand: h, pose: poseInfo, motion };
    });

    const h1 = handInfos[0];
    const h2 = handInfos.length > 1 ? handInfos[1] : null;

    // 2. Spatial Dual-Hand Geometry
    let handsDistance = 999;
    let handsMidpoint = new THREE.Vector3();
    let palmsFacingEachOther = false;
    let bothPalmsForward = false;
    let bothHandsLow = false;

    if (h1 && h2) {
      handsDistance = h1.hand.position.distanceTo(h2.hand.position);
      handsMidpoint.addVectors(h1.hand.position, h2.hand.position).multiplyScalar(0.5);

      const n1 = new THREE.Vector3(1, 0, 0).applyQuaternion(h1.hand.quaternion);
      const n2 = new THREE.Vector3(1, 0, 0).applyQuaternion(h2.hand.quaternion);
      const dot = n1.dot(n2);
      // Palms facing towards each other
      palmsFacingEachOther = dot < -0.35 && handsDistance < 0.38;

      const fwd1 = new THREE.Vector3(0, 0, 1).applyQuaternion(h1.hand.quaternion);
      const fwd2 = new THREE.Vector3(0, 0, 1).applyQuaternion(h2.hand.quaternion);
      bothPalmsForward = (h1.pose.isOpen && h2.pose.isOpen && fwd1.z > 0.35 && fwd2.z > 0.35);

      // Are hands held below chest level?
      bothHandsLow = h1.hand.position.y < 0.05 && h2.hand.position.y < 0.05;
    }

    // ===============================================
    // POWER 1: ENERGY WAVE (Kamehameha)
    // ===============================================
    if (activePowerId === 'energy_wave') {
      const isCupped = (h1 && h2 && palmsFacingEachOther && handsDistance < 0.35);
      const isForwardThrust = (h1 && h1.motion.isThrustForward) || (h2 && h2.motion.isThrustForward);

      if (isCupped && !this.currentActions.isBeamFiring) {
        this.currentActions.isCuppedCharging = true;
        this.currentActions.chargeAmount = Math.min(1.0, this.currentActions.chargeAmount + 0.022);
        this.currentActions.beamOrigin.copy(handsMidpoint);
      } else if (this.currentActions.chargeAmount >= 0.35 && (isForwardThrust || bothPalmsForward)) {
        // Unleash or sustain beam
        this.currentActions.isBeamFiring = true;
        this.currentActions.isCuppedCharging = false;
        if (h2) {
          this.currentActions.beamOrigin.copy(handsMidpoint);
        } else {
          this.currentActions.beamOrigin.copy(h1.hand.position);
        }

        if (h1.hand.rawLandmarks && h1.hand.rawLandmarks[12] && h1.hand.rawLandmarks[0] && this.camera) {
          // direction for a thrust: from wrist to middle fingertip
          const dir = handToWorld(h1.hand.rawLandmarks[12], this.camera).sub(handToWorld(h1.hand.rawLandmarks[0], this.camera)).normalize();
          this.currentActions.beamDirection.copy(dir);
        } else {
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h1.hand.quaternion);
          this.currentActions.beamDirection.copy(fwd).normalize();
        }
      } else {
        // Discontinue beam / charging
        this.currentActions.isBeamFiring = false;
        this.currentActions.isCuppedCharging = false;
        this.currentActions.chargeAmount = Math.max(0, this.currentActions.chargeAmount - 0.035);
      }
    }

    // ===============================================
    // POWER 2: POWER BLAST & SPIRIT SHOT
    // ===============================================
    if (activePowerId === 'power_blast') {
      for (const info of handInfos) {
        if (info.pose.isTwoFingerPoint && info.motion.isThrustForward) {
          if (this.debounce('spirit_shot', 200, timestamp)) {
            this.currentActions.justPushedBlast = true;
            this.currentActions.isSpiritShot = true;
            this.currentActions.blastPosition.copy(info.hand.position);
            break;
          }
        } else if (info.pose.isOpen && info.motion.isThrustForward) {
          if (this.debounce('power_blast', 180, timestamp)) {
            this.currentActions.justPushedBlast = true;
            this.currentActions.isSpiritShot = false;
            this.currentActions.blastPosition.copy(info.hand.position);
            break;
          }
        }
      }
    }

    // ===============================================
    // POWER 3: AIR TEMPEST (Vortex, Gust, Blades)
    // ===============================================
    if (activePowerId === 'air') {
      let vortexFound = false;
      for (const info of handInfos) {
        if (info.motion.isCircling) {
          vortexFound = true;
          this.currentActions.isVortexActive = true;
          this.currentActions.vortexCenter.copy(info.hand.position);
        }

        if (info.motion.isChop && this.debounce('air_chop', 220, timestamp)) {
          this.currentActions.justAirChop = true;
          this.currentActions.chopVelocity.copy(info.motion.vel);
        }

        if (info.pose.isOpen && info.motion.isThrustForward && this.debounce('air_gust', 250, timestamp)) {
          this.currentActions.justGustPush = true;
        }
      }
      if (!vortexFound) {
        this.currentActions.isVortexActive = false;
      }
    }

    // ===============================================
    // POWER 4: WATER WHIP (Ribbon, Orb, Splash)
    // ===============================================
    if (activePowerId === 'water') {
      if (h1) {
        this.currentActions.waterHandPos.copy(h1.hand.position);
      }

      // Lifting both hands forms floating orb
      if (h1 && h2 && h1.motion.vel.y > 0.35 && h2.motion.vel.y > 0.35 && handsDistance < 0.40) {
        this.currentActions.isLiftingWaterOrb = true;
      } else {
        this.currentActions.isLiftingWaterOrb = false;
      }

      // Throw forward
      for (const info of handInfos) {
        if (info.motion.isThrustForward && this.debounce('water_throw', 220, timestamp)) {
          this.currentActions.justWaterThrow = true;
          break;
        }
      }
    }

    // ===============================================
    // POWER 5: EARTH SHATTER (Boulders, Quake)
    // ===============================================
    if (activePowerId === 'earth') {
      let fistRaised = false;
      for (const info of handInfos) {
        if (info.pose.isFist && info.hand.position.y > -0.05) {
          fistRaised = true;
          this.currentActions.fistPos.copy(info.hand.position);
        }

        // Punch forward throws rock
        if (info.pose.isFist && info.motion.isThrustForward && this.debounce('earth_punch', 280, timestamp)) {
          this.currentActions.justEarthPunch = true;
          this.currentActions.punchDir.set(0, 0, -1).applyQuaternion(info.hand.quaternion);
        }

        // Downward smash
        if (info.motion.vel.y < -0.85 && this.debounce('earth_smash', 350, timestamp)) {
          this.currentActions.justEarthSmash = true;
        }
      }
      this.currentActions.isFistRaised = fistRaised;
    }

    // ===============================================
    // POWER 6: DRAGON FIRE (Fireball & Stream)
    // ===============================================
    if (activePowerId === 'fire') {
      for (const info of handInfos) {
        if (info.motion.isThrustForward && this.debounce('fireball', 200, timestamp)) {
          this.currentActions.justFireball = true;
        }
      }
      this.currentActions.isFlamethrower = bothPalmsForward;
    }

    // ===============================================
    // POWER 7: LIGHTNING
    // ===============================================
    if (activePowerId === 'lightning') {
      const anyFingersSpread = handInfos.some(i => i.pose.isSpread);
      this.currentActions.isLightningSpread = anyFingersSpread;

      for (const info of handInfos) {
        if ((info.pose.isSpread || info.motion.isThrustForward) && this.debounce('lightning', 220, timestamp)) {
          this.currentActions.justLightningStrike = true;
          break;
        }
      }
    }

    // ===============================================
    // POWER 8: SHIELD
    // ===============================================
    if (activePowerId === 'shield') {
      if (bothPalmsForward && handsDistance < 0.45) {
        this.currentActions.isHexShieldActive = true;
        this.currentActions.shieldCenter.copy(handsMidpoint);
      } else if (h1 && (h1.pose.isOpen || bothPalmsForward)) {
        this.currentActions.isHexShieldActive = true;
        this.currentActions.shieldCenter.copy(h1.hand.position);
      } else {
        this.currentActions.isHexShieldActive = false;
      }
    }

    return this.currentActions;
  }

  classifyHandPose(hand) {
    const lm = hand.rawLandmarks;
    if (!lm || lm.length < 21) {
      return { isOpen: false, isFist: false, isTwoFingerPoint: false, isSpread: false };
    }

    // Euclidean distance in 2D
    const d = (i, j) => Math.hypot(lm[i].x - lm[j].x, lm[i].y - lm[j].y);

    // Tip to wrist distance vs joint to wrist distance
    const isExt = [
      d(8, 0) > d(6, 0) * 1.15,   // Index
      d(12, 0) > d(10, 0) * 1.15, // Middle
      d(16, 0) > d(14, 0) * 1.15, // Ring
      d(20, 0) > d(18, 0) * 1.15  // Pinky
    ];

    const extCount = isExt.filter(Boolean).length;
    const isOpen = extCount >= 3;
    const isFist = extCount === 0;

    // Two finger point: index and middle extended, ring and pinky curled
    const isTwoFingerPoint = isExt[0] && isExt[1] && !isExt[2] && !isExt[3];

    // Spread fingers: distance between adjacent fingertips is large
    const tipSpread = d(8, 12) + d(12, 16) + d(16, 20);
    const handSize = d(0, 9);
    const isSpread = isOpen && (tipSpread / Math.max(handSize, 0.05) > 1.25);

    return { isOpen, isFist, isTwoFingerPoint, isSpread };
  }

  recordHandHistory(handId, pos3D, screenPos, pose, timestamp) {
    if (!this.handHistory.has(handId)) {
      this.handHistory.set(handId, []);
    }
    const list = this.handHistory.get(handId);
    list.push({ time: timestamp, pos: pos3D.clone(), screen: { ...screenPos }, pose });
    // Keep last 400ms
    while (list.length > 0 && timestamp - list[0].time > 400) {
      list.shift();
    }
  }

  analyzeHandMotion(handId, timestamp) {
    const history = this.handHistory.get(handId);
    if (!history || history.length < 3) {
      return { vel: new THREE.Vector3(), isThrustForward: false, isCircling: false, isChop: false };
    }

    const latest = history[history.length - 1];
    const prev = history[Math.max(0, history.length - 4)];
    const dt = Math.max((latest.time - prev.time) / 1000, 0.016);

    const vel = new THREE.Vector3().subVectors(latest.pos, prev.pos).divideScalar(dt);

    // Forward thrust: moving towards screen / -Z or rapid negative Z delta
    const isThrustForward = vel.z < -0.65;

    // Horizontal chop: high horizontal screen speed while hand is relatively flat
    const isChop = Math.abs(vel.x) > 1.1 && Math.abs(vel.y) < 0.6;

    // Circling motion: check if angular trajectory sweeps > 240 degrees over history
    let isCircling = false;
    if (history.length >= 8) {
      let sumAngle = 0;
      for (let i = 2; i < history.length; i++) {
        const v1x = history[i - 1].pos.x - history[i - 2].pos.x;
        const v1y = history[i - 1].pos.y - history[i - 2].pos.y;
        const v2x = history[i].pos.x - history[i - 1].pos.x;
        const v2y = history[i].pos.y - history[i - 1].pos.y;
        const cross = v1x * v2y - v1y * v2x;
        const dot = v1x * v2x + v1y * v2y;
        const angle = Math.atan2(cross, dot);
        sumAngle += angle;
      }
      isCircling = Math.abs(sumAngle) > Math.PI * 1.35;
    }

    return { vel, isThrustForward, isCircling, isChop };
  }
}

