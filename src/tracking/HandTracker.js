/**
 * HandTracker.js
 * MediaPipe Tasks Vision HandLandmarker integration with OneEuroFilter smoothing
 * and 3D orientation quaternion slerp to track gun position and orientation in real-time.
 */
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { OneEuroFilter3D } from './OneEuroFilter.js';
import { GestureDetector } from './GestureDetector.js';

export class HandTracker {
  constructor(videoElement, camera3D) {
    this.video = videoElement;
    this.camera = camera3D;
    this.landmarker = null;
    this.isReady = false;

    // Filters for zero-jitter position & rotation
    this.posFilter = new OneEuroFilter3D({ minCutoff: 1.2, beta: 0.008, dCutoff: 1.0 });
    this.smoothPos = new THREE.Vector3();
    this.smoothQuat = new THREE.Quaternion();

    this.gestureDetector = new GestureDetector();
    this.lastVideoTime = -1;

    // Output tracking state
    this.currentHand = null;
  }

  async init(onStatus) {
    if (onStatus) onStatus('Loading local vision engine…');
    let vision = null;

    try {
      // 1. Try local wasm first
      vision = await FilesetResolver.forVisionTasks('/wasm');
    } catch (e) {
      console.warn('Local wasm failed, falling back to CDN', e);
      vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
    }

    if (onStatus) onStatus('Loading hand tracking model…');
    const options = {
      baseOptions: {
        modelAssetPath: '/models/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch (e) {
      console.warn('GPU delegate failed, trying CPU', e);
      options.baseOptions.delegate = 'CPU';
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    }

    this.isReady = true;
    if (onStatus) onStatus('Tracking ready');
  }

  update(timestamp = performance.now()) {
    if (!this.isReady || !this.landmarker || this.video.readyState < 2) {
      return null;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.currentHand;
    }
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, timestamp);
    if (!result.landmarks || result.landmarks.length === 0) {
      this.currentHand = null;
      return null;
    }

    const lm = result.landmarks[0];
    const wlm = result.worldLandmarks ? result.worldLandmarks[0] : null;
    const handedness = result.handednesses && result.handednesses[0] && result.handednesses[0][0]
      ? result.handednesses[0][0].displayName
      : 'Right';

    // 1. Process Gestures
    const gestures = this.gestureDetector.process(lm, wlm, handedness, timestamp);

    // 2. 3D Hand Position & Orientation
    // Video coordinates are mirrored for user display: x = 1 - lm.x
    const screenX = (1 - lm[0].x) * 2 - 1; // NDC [-1, 1]
    const screenY = -(lm[0].y * 2 - 1);   // NDC [-1, 1]

    // Apparent hand scale (wrist 0 to middle MCP 9)
    const handScale2D = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
    // Depth: typical hand distance is ~0.5m to 1.2m
    const targetZ = -Math.max(0.4, Math.min(1.4, 0.16 / Math.max(handScale2D, 0.05)));

    // Project NDC to Three.js camera view frustum
    const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * Math.abs(targetZ);
    const visibleWidth = visibleHeight * this.camera.aspect;

    const rawX = (screenX * visibleWidth) / 2;
    const rawY = (screenY * visibleHeight) / 2;
    const rawZ = targetZ;

    // Apply One Euro Filter to 3D position
    const [fx, fy, fz] = this.posFilter.filter(rawX, rawY, rawZ, timestamp);
    this.smoothPos.set(fx, fy, fz);

    // 3. Compute 3D Gun Orientation
    // Forward direction: from wrist 0 to index MCP 5
    // Mirroring adjustment: invert X in vector
    const p0 = new THREE.Vector3(-(1 - lm[0].x), -lm[0].y, (wlm ? -wlm[0].z : 0) * 1.5);
    const p5 = new THREE.Vector3(-(1 - lm[5].x), -lm[5].y, (wlm ? -wlm[5].z : 0) * 1.5);
    const p17 = new THREE.Vector3(-(1 - lm[17].x), -lm[17].y, (wlm ? -wlm[17].z : 0) * 1.5);

    const fwd = new THREE.Vector3().subVectors(p5, p0).normalize();
    const lateral = new THREE.Vector3().subVectors(p17, p5).normalize();
    const palmNormal = new THREE.Vector3().crossVectors(fwd, lateral).normalize();

    // Adjust for hand
    if (handedness === 'Left') {
      palmNormal.negate();
    }

    // Build rotation matrix
    const right = new THREE.Vector3().crossVectors(fwd, palmNormal).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(right, up, fwd);

    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    // Smooth rotation via Quaternion slerp
    this.smoothQuat.slerp(targetQuat, 0.25);

    this.currentHand = {
      position: this.smoothPos,
      quaternion: this.smoothQuat,
      gestures,
      screen: { x: (1 - lm[0].x) * window.innerWidth, y: lm[0].y * window.innerHeight },
      handedness
    };

    return this.currentHand;
  }
}

