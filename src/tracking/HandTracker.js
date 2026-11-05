/**
 * HandTracker.js
 * High-precision multi-hand tracker supporting up to 2 simultaneous hands.
 * Features:
 * - Persistent hand identity tracking via wrist-proximity matching (no swapping)
 * - One Euro Filter 3D positional filtering
 * - Quaternion SLERP rotational smoothing
 * - Small dead-zone filtering against micro-jitter
 * - Multi-hand gesture detection and 3D metric coordinate projection
 */
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { OneEuroFilter3D } from './OneEuroFilter.js';
import { GestureDetector } from './GestureDetector.js';

class TrackedHandState {
  constructor(id) {
    this.id = id;
    this.posFilter = new OneEuroFilter3D({ minCutoff: 1.1, beta: 0.006, dCutoff: 1.0 });
    this.fwdFilter = new OneEuroFilter3D({ minCutoff: 0.6, beta: 0.003, dCutoff: 1.0 });
    this.upFilter = new OneEuroFilter3D({ minCutoff: 0.6, beta: 0.003, dCutoff: 1.0 });
    this.smoothPos = new THREE.Vector3();
    this.smoothQuat = new THREE.Quaternion();
    this.gestureDetector = new GestureDetector();

    this.prevWrist = { x: -1, y: -1 };
    this.lastSeen = 0;

    // Dead-zone thresholds against micro-jitter
    this.deadZonePos = 0.0022; // 2.2 mm
    this.deadZoneAngle = 0.012; // ~0.69 degrees

    // Aim latch ring buffer (last 250ms)
    this.aimRingBuffer = [];
    this.lastGoodAim = null;
    this.lastGoodAimTime = 0;
  }

  reset() {
    this.posFilter.reset();
    this.fwdFilter.reset();
    this.upFilter.reset();
    this.prevWrist = { x: -1, y: -1 };
    this.aimRingBuffer = [];
    this.lastGoodAim = null;
    this.lastGoodAimTime = 0;
  }

  getLatchedAim(timestamp, offsetMs = 100) {
    if (this.aimRingBuffer.length === 0) {
      return { quat: this.smoothQuat.clone(), fwd: new THREE.Vector3(0, 0, 1), pos: this.smoothPos.clone() };
    }
    const targetTime = timestamp - offsetMs;
    let closest = this.aimRingBuffer[0];
    let minDiff = Math.abs(closest.time - targetTime);
    for (let i = 1; i < this.aimRingBuffer.length; i++) {
      const diff = Math.abs(this.aimRingBuffer[i].time - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = this.aimRingBuffer[i];
      }
    }
    return closest;
  }
}

export class HandTracker {
  constructor(videoElement, camera3D) {
    this.video = videoElement;
    this.camera = camera3D;
    this.landmarker = null;
    this.isReady = false;
    this.lastVideoTime = -1;

    // Persistent pool of up to 2 tracked hands
    this.slots = [
      new TrackedHandState('hand_0'),
      new TrackedHandState('hand_1')
    ];

    // Primary hand assignment
    this.triggerHandId = null; // Hand ID holding the trigger/grip
    this.currentResult = {
      hands: [],
      primaryHand: null,
      secondaryHand: null,
      numHands: 0
    };
  }

  async init(onStatus) {
    if (onStatus) onStatus('Loading local vision engine…');
    let vision = null;

    try {
      vision = await FilesetResolver.forVisionTasks('/wasm');
    } catch (e) {
      console.warn('Local wasm failed, falling back to CDN', e);
      vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
    }

    if (onStatus) onStatus('Loading hand tracking model (2 hands)…');
    const options = {
      baseOptions: {
        modelAssetPath: '/models/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch (e) {
      console.warn('GPU delegate failed, trying CPU', e);
      options.baseOptions.delegate = 'CPU';
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    }

    this.isReady = true;
    if (onStatus) onStatus('Hand tracking ready');
  }

  setSensitivity(val) {
    for (const slot of this.slots) {
      slot.gestureDetector.setSensitivity(val);
    }
  }

  getGestureDetector() {
    return this.slots[0].gestureDetector;
  }

  getLatchedAim(timestamp = performance.now(), offsetMs = 100) {
    if (this.triggerHandId) {
      const s = this.slots.find(sl => sl.id === this.triggerHandId);
      if (s) return s.getLatchedAim(timestamp, offsetMs);
    }
    return this.slots[0].getLatchedAim(timestamp, offsetMs);
  }

  update(timestamp = performance.now()) {
    if (!this.isReady || !this.landmarker || this.video.readyState < 2) {
      return null;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.currentResult;
    }
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, timestamp);
    const numDetected = result.landmarks ? result.landmarks.length : 0;

    if (numDetected === 0) {
      this.currentResult = {
        hands: [],
        primaryHand: null,
        secondaryHand: null,
        numHands: 0
      };
      return this.currentResult;
    }

    // 1. Persistent Tracking: Match detected hands to slot by wrist proximity
    // Each detection has wrist landmark at index 0 (normalized x, y)
    const matches = this.matchDetectionsToSlots(result.landmarks, timestamp);

    const activeHands = [];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (!match) continue;

      const slot = match.slot;
      const detIdx = match.detIdx;
      const lm = result.landmarks[detIdx];
      const wlm = result.worldLandmarks ? result.worldLandmarks[detIdx] : null;
      const handedness = result.handednesses && result.handednesses[detIdx] && result.handednesses[detIdx][0]
        ? result.handednesses[detIdx][0].displayName
        : (i === 0 ? 'Right' : 'Left');

      slot.lastSeen = timestamp;
      slot.prevWrist = { x: lm[0].x, y: lm[0].y };

      // Process gestures with this hand's dedicated detector
      const gestures = slot.gestureDetector.process(lm, wlm, handedness, timestamp);

      // 2. 3D Coordinate Mapping (mirrored for camera display: x = 1 - lm.x)
      const screenX = (1 - lm[0].x) * 2 - 1; // NDC [-1, 1]
      const screenY = 1 - lm[0].y * 2;       // NDC [-1, 1]

      // Hand scale metric for depth
      const handScale2D = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
      const targetZ = -Math.max(0.4, Math.min(1.4, 0.16 / Math.max(handScale2D, 0.05)));

      // View frustum dimensions at target depth
      const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
      const visibleHeight = 2 * Math.tan(vFOV / 2) * Math.abs(targetZ);
      const visibleWidth = visibleHeight * this.camera.aspect;

      // 3. 3D Coordinates of Key Landmarks in frustum space
      const getLandmarkPos = (k) => {
        const sx = (1 - lm[k].x) * 2 - 1;
        const sy = 1 - lm[k].y * 2;
        const sz = targetZ + (wlm ? -wlm[k].z : 0) * 0.9;
        return new THREE.Vector3((sx * visibleWidth) / 2, (sy * visibleHeight) / 2, sz);
      };

      const p0 = getLandmarkPos(0);
      const p2 = getLandmarkPos(2);
      const p4 = getLandmarkPos(4);
      const p5 = getLandmarkPos(5);
      const p8 = getLandmarkPos(8);
      const p9 = getLandmarkPos(9);
      const p12 = getLandmarkPos(12);
      const p17 = getLandmarkPos(17);

      let targetPos;
      let rawFwd;
      let rawThumbUp;

      if (gestures && gestures.isTwoFingerGun) {
        // TWO-FINGER GUN POSE:
        // Barrel direction is the normalized average of index (base 5 to tip 8) and middle (base 9 to tip 12)
        const vIdx = new THREE.Vector3().subVectors(p8, p5).normalize();
        const vMid = new THREE.Vector3().subVectors(p12, p9).normalize();
        rawFwd = new THREE.Vector3().addVectors(vIdx, vMid).normalize();

        // Gun's up axis follows the thumb direction (base 2 to tip 4)
        rawThumbUp = new THREE.Vector3().subVectors(p4, p2).normalize();

        // Position gun along the two fingers: grip at base midpoint (5 & 9)
        const pGripBase = new THREE.Vector3().addVectors(p5, p9).multiplyScalar(0.5);
        targetPos = pGripBase;
      } else {
        // Gun hangs relaxed in hand
        const pPalm = new THREE.Vector3(-(1 - lm[0].x), -lm[0].y, (wlm ? -wlm[0].z : 0) * 0.85);
        const pKnuckles = new THREE.Vector3(-(1 - lm[5].x), -lm[5].y, (wlm ? -wlm[5].z : 0) * 0.85);
        rawFwd = new THREE.Vector3().subVectors(pKnuckles, pPalm).normalize();

        // Apply natural relaxed downward tilt (~28 degrees)
        const relaxEuler = new THREE.Euler(0.48, 0, 0);
        rawFwd.applyEuler(relaxEuler);

        const rawLateral = new THREE.Vector3().subVectors(p17, p5).normalize();
        let palmNorm = new THREE.Vector3().crossVectors(rawFwd, rawLateral).normalize();
        if (handedness === 'Left') palmNorm.negate();
        rawThumbUp = palmNorm;

        targetPos = p0;
      }

      // One Euro Filter smoothing on position
      const [fx, fy, fz] = slot.posFilter.filter(targetPos.x, targetPos.y, targetPos.z, timestamp);
      const newPos = new THREE.Vector3(fx, fy, fz);
      if (slot.smoothPos.lengthSq() > 0.001) {
        if (slot.smoothPos.distanceTo(newPos) > slot.deadZonePos) {
          slot.smoothPos.copy(newPos);
        }
      } else {
        slot.smoothPos.copy(newPos);
      }

      // Construct orthonormal rotation basis with Up axis following the thumb
      let right = new THREE.Vector3().crossVectors(rawThumbUp, rawFwd).normalize();
      if (right.lengthSq() < 0.01) {
        const lateral = new THREE.Vector3().subVectors(p17, p5).normalize();
        right.crossVectors(lateral, rawFwd).normalize();
      }
      let finalUp = new THREE.Vector3().crossVectors(rawFwd, right).normalize();

      // Filter orientation basis vectors through 1€ filter
      const [ffx, ffy, ffz] = slot.fwdFilter.filter(rawFwd.x, rawFwd.y, rawFwd.z, timestamp);
      const fwd = new THREE.Vector3(ffx, ffy, ffz).normalize();

      const [ufx, ufy, ufz] = slot.upFilter.filter(finalUp.x, finalUp.y, finalUp.z, timestamp);
      const up = new THREE.Vector3(ufx, ufy, ufz).normalize();

      const finalRight = new THREE.Vector3().crossVectors(up, fwd).normalize();
      const basisUp = new THREE.Vector3().crossVectors(fwd, finalRight).normalize();

      const rotMatrix = new THREE.Matrix4().makeBasis(finalRight, basisUp, fwd);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

      // Adaptive rotational smoothing: dead zone + responsive slerp
      if (slot.smoothQuat.lengthSq() > 0.001) {
        const angDiff = slot.smoothQuat.angleTo(targetQuat);
        if (angDiff > slot.deadZoneAngle) {
          const slerpFactor = Math.min(0.40, Math.max(0.12, angDiff * 1.8));
          slot.smoothQuat.slerp(targetQuat, slerpFactor);
        }
      } else {
        slot.smoothQuat.copy(targetQuat);
      }

      // Record in aim ring buffer for 100ms latched aim
      slot.aimRingBuffer.push({
        time: timestamp,
        quat: slot.smoothQuat.clone(),
        fwd: fwd.clone(),
        pos: slot.smoothPos.clone()
      });
      while (slot.aimRingBuffer.length > 0 && timestamp - slot.aimRingBuffer[0].time > 250) {
        slot.aimRingBuffer.shift();
      }

      slot.lastGoodAim = {
        quat: slot.smoothQuat.clone(),
        fwd: fwd.clone(),
        pos: slot.smoothPos.clone()
      };
      slot.lastGoodAimTime = timestamp;

      activeHands.push({
        id: slot.id,
        position: slot.smoothPos.clone(),
        quaternion: slot.smoothQuat.clone(),
        gestures,
        screen: { x: (1 - lm[0].x) * window.innerWidth, y: lm[0].y * window.innerHeight },
        handedness,
        rawLandmarks: lm,
        rawWorldLandmarks: wlm
      });
    }

    // 4. Role assignment: Trigger hand vs Support hand
    let primary = null;
    let secondary = null;

    if (activeHands.length === 1) {
      primary = activeHands[0];
      this.triggerHandId = primary.id;
    } else if (activeHands.length >= 2) {
      // If a trigger hand was already chosen, keep it as primary
      if (this.triggerHandId) {
        primary = activeHands.find(h => h.id === this.triggerHandId) || activeHands[0];
        secondary = activeHands.find(h => h.id !== primary.id) || null;
      } else {
        // Choose right hand or first hand as default trigger hand
        primary = activeHands.find(h => h.handedness === 'Right') || activeHands[0];
        secondary = activeHands.find(h => h.id !== primary.id) || null;
        this.triggerHandId = primary.id;
      }
    }

    this.currentResult = {
      hands: activeHands,
      primaryHand: primary,
      secondaryHand: secondary,
      numHands: activeHands.length
    };

    return this.currentResult;
  }

  /**
   * Greedy nearest-wrist assignment to preserve persistent hand identity across frames
   */
  matchDetectionsToSlots(detections, timestamp) {
    const matched = [];
    const usedSlots = new Set();
    const usedDets = new Set();

    // Check distances between each detection and each slot's previous wrist
    const pairs = [];
    for (let d = 0; d < detections.length; d++) {
      const wrist = detections[d][0];
      for (let s = 0; s < this.slots.length; s++) {
        const slot = this.slots[s];
        let dist = 1.0;
        if (slot.prevWrist.x >= 0 && timestamp - slot.lastSeen < 1200) {
          dist = Math.hypot(wrist.x - slot.prevWrist.x, wrist.y - slot.prevWrist.y);
        }
        pairs.push({ d, s, dist });
      }
    }

    // Sort by proximity
    pairs.sort((a, b) => a.dist - b.dist);

    for (const p of pairs) {
      if (!usedDets.has(p.d) && !usedSlots.has(p.s) && p.dist < 0.35) {
        matched.push({ slot: this.slots[p.s], detIdx: p.d });
        usedDets.add(p.d);
        usedSlots.add(p.s);
      }
    }

    // For any unmatched detections, assign to an available slot
    for (let d = 0; d < detections.length; d++) {
      if (!usedDets.has(d)) {
        for (let s = 0; s < this.slots.length; s++) {
          if (!usedSlots.has(s)) {
            this.slots[s].reset();
            matched.push({ slot: this.slots[s], detIdx: d });
            usedDets.add(d);
            usedSlots.add(s);
            break;
          }
        }
      }
    }

    return matched;
  }
}
