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
    this.smoothPos = new THREE.Vector3();
    this.smoothQuat = new THREE.Quaternion();
    this.gestureDetector = new GestureDetector();

    this.prevWrist = { x: -1, y: -1 };
    this.lastSeen = 0;

    // Dead-zone thresholds against micro-jitter
    this.deadZonePos = 0.0022; // 2.2 mm
    this.deadZoneAngle = 0.015; // ~0.86 degrees
  }

  reset() {
    this.posFilter.reset();
    this.prevWrist = { x: -1, y: -1 };
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

      const rawX = (screenX * visibleWidth) / 2;
      const rawY = (screenY * visibleHeight) / 2;
      const rawZ = targetZ;

      // One Euro Filter smoothing
      const [fx, fy, fz] = slot.posFilter.filter(rawX, rawY, rawZ, timestamp);
      const newPos = new THREE.Vector3(fx, fy, fz);

      // Positional dead zone to eliminate micro-jitter when holding still
      if (slot.smoothPos.lengthSq() > 0.001) {
        if (slot.smoothPos.distanceTo(newPos) > slot.deadZonePos) {
          slot.smoothPos.copy(newPos);
        }
      } else {
        slot.smoothPos.copy(newPos);
      }

      // 3. 3D Orientation (forward vector from wrist 0 to index MCP 5; lateral from index MCP 5 to pinky MCP 17)
      const p0 = new THREE.Vector3(-(1 - lm[0].x), -lm[0].y, (wlm ? -wlm[0].z : 0) * 1.5);
      const p5 = new THREE.Vector3(-(1 - lm[5].x), -lm[5].y, (wlm ? -wlm[5].z : 0) * 1.5);
      const p17 = new THREE.Vector3(-(1 - lm[17].x), -lm[17].y, (wlm ? -wlm[17].z : 0) * 1.5);

      const fwd = new THREE.Vector3().subVectors(p5, p0).normalize();
      const lateral = new THREE.Vector3().subVectors(p17, p5).normalize();
      const palmNormal = new THREE.Vector3().crossVectors(fwd, lateral).normalize();

      if (handedness === 'Left') {
        palmNormal.negate();
      }

      const right = new THREE.Vector3().crossVectors(fwd, palmNormal).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

      const rotMatrix = new THREE.Matrix4().makeBasis(right, up, fwd);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

      // Rotational dead zone against jitter
      if (slot.smoothQuat.lengthSq() > 0.001) {
        const angDiff = slot.smoothQuat.angleTo(targetQuat);
        if (angDiff > slot.deadZoneAngle) {
          slot.smoothQuat.slerp(targetQuat, 0.22);
        }
      } else {
        slot.smoothQuat.copy(targetQuat);
      }

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
