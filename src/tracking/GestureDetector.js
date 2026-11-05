/**
 * GestureDetector.js
 * Detects hand gestures for gun interaction (grab, drop, trigger firing, gun swipe).
 * Features scale-invariant ratios, hysteresis edge detection, multi-trigger detection
 * (thumb drop, index curl, forward/back flick), calibration with localStorage persistence,
 * and support for both left and right hands.
 */

export class GestureDetector {
  constructor() {
    this.defaultCalibration = {
      thumbArmed: 0.68,
      thumbFired: 0.50,
      indexArmed: 1.55,
      indexFired: 1.25,
      flickThreshold: 1.8
    };

    this.calibration = this.loadCalibration();
    this.isCalibrating = false;
    this.calibrationStage = 0; // 0 = idle, 1 = relaxed, 2 = firing gesture
    this.calibrationSamples = { relaxed: [], firing: [] };
    this.calibrationTimer = 0;

    // Hysteresis states
    this.thumbState = 'ARMED'; // 'ARMED' or 'FIRED'
    this.indexState = 'ARMED';
    this.flickState = 'IDLE';

    // Overall trigger state
    this.isArmed = true;
    this.isTriggerDown = false;
    this.lastTriggerTime = 0;
    this.lastFireTime = 0;

    // Velocity tracking for flicks & swipes
    this.prevWrist = null;
    this.prevTime = 0;
    this.wristVelX = 0;
    this.wristVelZ = 0;
    this.lastSwipeTime = 0;

    // Pose tracking
    this.fistFrames = 0;
    this.openFrames = 0;
    this.currentPose = 'other';
    this.debugInfo = {
      pose: 'none',
      thumbRatio: 0,
      indexRatio: 0,
      wristVelZ: 0,
      triggerState: 'IDLE'
    };
  }

  loadCalibration() {
    try {
      const saved = localStorage.getItem('gun_shop_gesture_calibration');
      if (saved) {
        return { ...this.defaultCalibration, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load gesture calibration, using defaults', e);
    }
    return { ...this.defaultCalibration };
  }

  saveCalibration() {
    try {
      localStorage.setItem('gun_shop_gesture_calibration', JSON.stringify(this.calibration));
    } catch (e) {
      console.warn('Failed to save gesture calibration', e);
    }
  }

  startCalibration(onProgress, onComplete) {
    this.isCalibrating = true;
    this.calibrationStage = 1; // Relaxed
    this.calibrationSamples = { relaxed: [], firing: [] };
    this.calibrationTimer = performance.now();
    this.onCalibProgress = onProgress;
    this.onCalibComplete = onComplete;
  }

  /**
   * Process raw MediaPipe landmarks and worldLandmarks
   * @param {Array} landmarks - 2D normalized screen landmarks [0..20]
   * @param {Array} worldLandmarks - 3D metric world landmarks [0..20]
   * @param {string} handedness - 'Left' or 'Right'
   * @param {number} timestamp - Current frame timestamp
   */
  process(landmarks, worldLandmarks, handedness = 'Right', timestamp = performance.now()) {
    if (!landmarks || landmarks.length < 21) {
      this.currentPose = 'none';
      this.isTriggerDown = false;
      return null;
    }

    const lm = landmarks;
    const wlm = worldLandmarks || landmarks;

    // Scale calculation (distance from wrist 0 to middle MCP 9)
    const d3 = (i, j) => {
      const p1 = wlm[i], p2 = wlm[j];
      return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
    };
    const d2 = (i, j) => Math.hypot(lm[i].x - lm[j].x, lm[i].y - lm[j].y);

    const handScale = Math.max(d3(0, 9), 0.05);

    // 1. Thumb drop ratio (distance from thumb tip 4 to index base 5 normalized by hand scale)
    const thumbDist = d3(4, 5);
    const thumbRatio = thumbDist / handScale;

    // 2. Index curl ratio (distance from index tip 8 to wrist 0 vs index base 5 to wrist 0)
    const indexTipDist = d3(8, 0);
    const indexBaseDist = Math.max(d3(5, 0), 0.03);
    const indexRatio = indexTipDist / indexBaseDist;

    // 3. Hand velocity for flick & swipe
    const dt = this.prevTime ? Math.max((timestamp - this.prevTime) / 1000, 0.001) : 0.016;
    if (this.prevWrist) {
      this.wristVelX = (lm[0].x - this.prevWrist.x) / dt;
      const zCur = wlm[0].z || 0;
      const zPrev = this.prevWrist.z || 0;
      this.wristVelZ = (zCur - zPrev) / dt;
    }
    this.prevWrist = { x: lm[0].x, y: lm[0].y, z: wlm[0].z || 0 };
    this.prevTime = timestamp;

    // 4. Handle Calibration
    if (this.isCalibrating) {
      this.handleCalibrationStep(thumbRatio, indexRatio, timestamp);
    }

    // 5. Basic Pose Detection (Fist, Point, Open)
    const fingerExtended = [
      d2(8, 0) > d2(6, 0) * 1.15,   // Index
      d2(12, 0) > d2(10, 0) * 1.15, // Middle
      d2(16, 0) > d2(14, 0) * 1.15, // Ring
      d2(20, 0) > d2(18, 0) * 1.15  // Pinky
    ];
    const extCount = fingerExtended.filter(Boolean).length;

    if (extCount === 4) {
      this.currentPose = 'open';
      this.openFrames++;
      this.fistFrames = 0;
    } else if (fingerExtended[0] && !fingerExtended[1] && !fingerExtended[2] && !fingerExtended[3]) {
      this.currentPose = 'point';
      this.openFrames = 0;
      this.fistFrames = 0;
    } else if (extCount === 0) {
      this.currentPose = 'fist';
      this.fistFrames++;
      this.openFrames = 0;
    } else {
      this.currentPose = 'other';
      this.openFrames = 0;
      this.fistFrames = 0;
    }

    // 6. Trigger Multi-Condition Detection with Hysteresis
    // (a) Thumb Drop
    if (thumbRatio < this.calibration.thumbFired) {
      this.thumbState = 'FIRED';
    } else if (thumbRatio > this.calibration.thumbArmed) {
      this.thumbState = 'ARMED';
    }

    // (b) Index Curl
    if (indexRatio < this.calibration.indexFired) {
      this.indexState = 'FIRED';
    } else if (indexRatio > this.calibration.indexArmed) {
      this.indexState = 'ARMED';
    }

    // (c) Forward/Back Flick
    const isFlickFired = Math.abs(this.wristVelZ) > this.calibration.flickThreshold;

    // Combine triggers
    const triggerActive = (this.thumbState === 'FIRED') || (this.indexState === 'FIRED') || isFlickFired;

    // Edge Detection: Just fired this frame
    const justFired = triggerActive && !this.isTriggerDown;
    this.isTriggerDown = triggerActive;

    // 7. Hand Swipe Left/Right to cycle guns (when hand is moving fast laterally)
    let swipeDirection = 0; // -1 for left, 1 for right
    if (timestamp - this.lastSwipeTime > 400) {
      if (this.wristVelX > 2.8) {
        swipeDirection = 1;
        this.lastSwipeTime = timestamp;
      } else if (this.wristVelX < -2.8) {
        swipeDirection = -1;
        this.lastSwipeTime = timestamp;
      }
    }

    // Update debug info
    this.debugInfo = {
      pose: this.currentPose,
      thumbRatio: thumbRatio.toFixed(2),
      indexRatio: indexRatio.toFixed(2),
      wristVelZ: this.wristVelZ.toFixed(1),
      triggerState: triggerActive ? 'FIRING' : 'ARMED',
      handedness
    };

    return {
      pose: this.currentPose,
      thumbRatio,
      indexRatio,
      isTriggerDown: this.isTriggerDown,
      justFired,
      fistFrames: this.fistFrames,
      openFrames: this.openFrames,
      swipeDirection,
      debug: this.debugInfo
    };
  }

  handleCalibrationStep(thumbRatio, indexRatio, timestamp) {
    const elapsed = (timestamp - this.calibrationTimer) / 1000;

    if (this.calibrationStage === 1) {
      // Stage 1: Relaxed hand (1.5s)
      this.calibrationSamples.relaxed.push({ thumbRatio, indexRatio });
      if (this.onCalibProgress) {
        this.onCalibProgress(`Keep your hand relaxed... ${(1.5 - elapsed).toFixed(1)}s`);
      }
      if (elapsed >= 1.5) {
        this.calibrationStage = 2;
        this.calibrationTimer = timestamp;
      }
    } else if (this.calibrationStage === 2) {
      // Stage 2: Fire gesture (thumb drop or index curl) (1.5s)
      this.calibrationSamples.firing.push({ thumbRatio, indexRatio });
      if (this.onCalibProgress) {
        this.onCalibProgress(`Now drop thumb or curl index to fire! ${(1.5 - elapsed).toFixed(1)}s`);
      }
      if (elapsed >= 1.5) {
        this.finishCalibration();
      }
    }
  }

  finishCalibration() {
    this.isCalibrating = false;
    this.calibrationStage = 0;

    const r = this.calibrationSamples.relaxed;
    const f = this.calibrationSamples.firing;

    if (r.length > 5 && f.length > 5) {
      const avgRelaxedThumb = r.reduce((s, x) => s + x.thumbRatio, 0) / r.length;
      const minFiringThumb = Math.min(...f.map(x => x.thumbRatio));

      const avgRelaxedIndex = r.reduce((s, x) => s + x.indexRatio, 0) / r.length;
      const minFiringIndex = Math.min(...f.map(x => x.indexRatio));

      this.calibration.thumbArmed = Math.max(avgRelaxedThumb * 0.9, 0.60);
      this.calibration.thumbFired = Math.min(minFiringThumb * 1.15, this.calibration.thumbArmed - 0.12);

      this.calibration.indexArmed = Math.max(avgRelaxedIndex * 0.9, 1.45);
      this.calibration.indexFired = Math.min(minFiringIndex * 1.15, this.calibration.indexArmed - 0.20);

      this.saveCalibration();
      if (this.onCalibComplete) {
        this.onCalibComplete('Calibration complete! Personal thresholds saved.');
      }
    }
  }
}

