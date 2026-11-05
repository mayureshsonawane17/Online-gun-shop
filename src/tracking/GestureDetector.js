/**
 * GestureDetector.js
 * Precision gesture detector for firearm manipulation and thumb-movement firing.
 *
 * Rules:
 * 1. Closed fist = holding weapon (NEVER fires).
 * 2. Open palm held for 0.5s = put weapon away (NEVER fires).
 * 3. Firing is driven SOLELY by thumb movement using scale-invariant metric:
 *    r = distance(thumb tip [4], index finger PIP [6]) / distance(wrist [0], middle MCP [9])
 *    Fires when r drops quickly from "raised" to "pressed" with hysteresis and negative velocity check.
 * 4. Grip-change gate: if other 4 fingers changed curl in the last ~150ms, suppress firing.
 * 5. Works with relaxed fist grip and finger-gun pose, on either hand.
 * 6. Semi-auto fires once; full-auto fires continuously while thumb is held pressed.
 * 7. 3-second calibration stored in localStorage.
 */

export class GestureDetector {
  constructor() {
    this.defaultCalibration = {
      thumbArmed: 0.62,
      thumbFired: 0.44,
      velocityThreshold: -0.75, // r drop velocity per second
      sensitivity: 1.0
    };

    this.calibration = this.loadCalibration();

    // Calibration runtime state
    this.isCalibrating = false;
    this.calibrationStage = 0; // 0=idle, 1=raised (1.5s), 2=pressed (1.5s)
    this.calibrationSamples = { raised: [], pressed: [] };
    this.calibrationTimer = 0;

    // Trigger state machine
    this.triggerState = 'ARMED'; // 'ARMED' or 'FIRED'
    this.isTriggerDown = false;
    this.prevR = null;
    this.prevRTime = 0;
    this.rVelocity = 0;
    this.lastFireTime = 0;

    // Grip change detection (history of finger curls over the last 300ms)
    this.curlHistory = []; // array of { time, curlAvg }
    this.isGripChanging = false;

    // Fist and open palm timers (for grab & drop)
    this.fistStartTime = 0;
    this.fistDuration = 0;
    this.openStartTime = 0;
    this.openDuration = 0;
    this.currentPose = 'other';

    // Velocity tracking for flicks / swipes
    this.prevWrist = null;
    this.prevWristTime = 0;
    this.wristVelX = 0;
    this.lastSwipeTime = 0;

    this.debugInfo = {
      pose: 'none',
      r: '0.00',
      rVel: '0.0',
      triggerState: 'ARMED',
      gripChanging: false,
      fistTime: 0,
      openTime: 0
    };
  }

  loadCalibration() {
    try {
      const saved = localStorage.getItem('gun_shop_gesture_calibration_v2');
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
      localStorage.setItem('gun_shop_gesture_calibration_v2', JSON.stringify(this.calibration));
    } catch (e) {
      console.warn('Failed to save gesture calibration', e);
    }
  }

  setSensitivity(val) {
    this.calibration.sensitivity = Math.max(0.5, Math.min(2.0, val));
    this.saveCalibration();
  }

  startCalibration(onProgress, onComplete) {
    this.isCalibrating = true;
    this.calibrationStage = 1;
    this.calibrationSamples = { raised: [], pressed: [] };
    this.calibrationTimer = performance.now();
    this.onCalibProgress = onProgress;
    this.onCalibComplete = onComplete;
  }

  /**
   * Process a single hand's landmarks
   * @param {Array} landmarks - 2D normalized screen landmarks [0..20]
   * @param {Array} worldLandmarks - 3D metric world landmarks [0..20]
   * @param {string} handedness - 'Left' or 'Right'
   * @param {number} timestamp - Current frame timestamp in ms
   */
  process(landmarks, worldLandmarks, handedness = 'Right', timestamp = performance.now()) {
    if (!landmarks || landmarks.length < 21) {
      this.currentPose = 'none';
      this.isTriggerDown = false;
      this.fistDuration = 0;
      this.openDuration = 0;
      return null;
    }

    const lm = landmarks;
    const wlm = worldLandmarks || landmarks;

    const d3 = (i, j) => {
      const p1 = wlm[i], p2 = wlm[j];
      return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
    };
    const d2 = (i, j) => Math.hypot(lm[i].x - lm[j].x, lm[i].y - lm[j].y);

    // 1. Hand scale metric: distance from wrist (0) to middle MCP (9)
    const handScale = Math.max(d3(0, 9), 0.04);

    // 2. Thumb trigger metric r = distance(thumb tip 4, index PIP 6) / handScale
    const thumbToIndexPip = d3(4, 6);
    const rawR = thumbToIndexPip / handScale;

    // Apply sensitivity scaling: higher sensitivity lowers effective arm/fire barrier
    const sens = this.calibration.sensitivity || 1.0;
    const r = rawR;

    // Calculate r velocity (dr/dt in units per second)
    const dt = this.prevRTime ? Math.max((timestamp - this.prevRTime) / 1000, 0.005) : 0.016;
    if (this.prevR !== null) {
      const instVel = (r - this.prevR) / dt;
      // Low-pass smooth velocity to prevent single-frame spikes
      this.rVelocity = this.rVelocity * 0.4 + instVel * 0.6;
    }
    this.prevR = r;
    this.prevRTime = timestamp;

    // 3. Measure curl of other 4 fingers: index (8), middle (12), ring (16), pinky (20)
    // Scale-invariant tip-to-wrist ratio
    const indexCurl = d3(8, 0) / handScale;
    const middleCurl = d3(12, 0) / handScale;
    const ringCurl = d3(16, 0) / handScale;
    const pinkyCurl = d3(20, 0) / handScale;
    const curlAvg = (indexCurl + middleCurl + ringCurl + pinkyCurl) / 4;

    // Update curl history over last 300ms
    this.curlHistory.push({ time: timestamp, curlAvg });
    while (this.curlHistory.length > 0 && timestamp - this.curlHistory[0].time > 300) {
      this.curlHistory.shift();
    }

    // Gate check: did the other four fingers change curl in the last ~150 ms?
    const recentCurls = this.curlHistory.filter(h => timestamp - h.time <= 150);
    if (recentCurls.length >= 2) {
      let minCurl = Infinity, maxCurl = -Infinity;
      for (const h of recentCurls) {
        if (h.curlAvg < minCurl) minCurl = h.curlAvg;
        if (h.curlAvg > maxCurl) maxCurl = h.curlAvg;
      }
      // If curl delta > threshold, hand is currently opening/closing or adjusting grip
      this.isGripChanging = (maxCurl - minCurl) > 0.14;
    } else {
      this.isGripChanging = false;
    }

    // 4. Pose detection: Fist vs Point vs Open
    // 2D distance checks from tip to wrist vs joint to wrist
    const isExt = [
      d2(8, 0) > d2(6, 0) * 1.18,
      d2(12, 0) > d2(10, 0) * 1.18,
      d2(16, 0) > d2(14, 0) * 1.18,
      d2(20, 0) > d2(18, 0) * 1.18
    ];
    const extCount = isExt.filter(Boolean).length;

    if (extCount === 4) {
      this.currentPose = 'open';
      if (!this.openStartTime) this.openStartTime = timestamp;
      this.openDuration = (timestamp - this.openStartTime) / 1000;
      this.fistStartTime = 0;
      this.fistDuration = 0;
    } else if (extCount === 0 || (!isExt[1] && !isExt[2] && !isExt[3])) {
      // All curled = fist, or index extended alone = finger gun
      if (isExt[0] && !isExt[1] && !isExt[2] && !isExt[3]) {
        this.currentPose = 'finger_gun';
      } else {
        this.currentPose = 'fist';
      }
      if (!this.fistStartTime) this.fistStartTime = timestamp;
      this.fistDuration = (timestamp - this.fistStartTime) / 1000;
      this.openStartTime = 0;
      this.openDuration = 0;
    } else {
      this.currentPose = 'other';
      this.fistStartTime = 0;
      this.fistDuration = 0;
      this.openStartTime = 0;
      this.openDuration = 0;
    }

    // 5. Calibration handling
    if (this.isCalibrating) {
      this.handleCalibrationStep(r, timestamp);
    }

    // 6. Trigger State Machine with Hysteresis & Velocity Check
    // Armed threshold is scaled by sensitivity
    const armThreshold = this.calibration.thumbArmed / sens;
    const fireThreshold = this.calibration.thumbFired * sens;
    const velThreshold = (this.calibration.velocityThreshold || -0.75) * sens;

    let justFired = false;

    // Reset to ARMED when thumb is lifted/raised
    if (r > armThreshold) {
      this.triggerState = 'ARMED';
      this.isTriggerDown = false;
    }

    // Trigger FIRE when:
    // - Hand is ARMED
    // - r drops below fireThreshold
    // - Velocity check: r is dropping quickly (dr/dt < velThreshold), so slow drifting doesn't fire
    // - Grip-change gate: other fingers are NOT changing curl
    // - Hand is NOT an open palm
    if (this.triggerState === 'ARMED') {
      if (r < fireThreshold && !this.isGripChanging && this.currentPose !== 'open') {
        if (this.rVelocity < velThreshold) {
          this.triggerState = 'FIRED';
          this.isTriggerDown = true;
          justFired = true;
          this.lastFireTime = timestamp;
        }
      }
    } else if (this.triggerState === 'FIRED') {
      // Stay in pressed state while thumb remains below fireThreshold + small release margin
      if (r < fireThreshold + 0.05 && this.currentPose !== 'open') {
        this.isTriggerDown = true;
      } else if (r > armThreshold) {
        this.triggerState = 'ARMED';
        this.isTriggerDown = false;
      }
    }

    // 7. Hand swipe left/right for weapon cycling
    let swipeDirection = 0;
    if (this.prevWrist) {
      const dtWrist = Math.max((timestamp - this.prevWristTime) / 1000, 0.005);
      this.wristVelX = (lm[0].x - this.prevWrist.x) / dtWrist;
      if (timestamp - this.lastSwipeTime > 450) {
        if (this.wristVelX > 2.8) {
          swipeDirection = 1;
          this.lastSwipeTime = timestamp;
        } else if (this.wristVelX < -2.8) {
          swipeDirection = -1;
          this.lastSwipeTime = timestamp;
        }
      }
    }
    this.prevWrist = { x: lm[0].x, y: lm[0].y };
    this.prevWristTime = timestamp;

    // Update debug readouts
    this.debugInfo = {
      pose: this.currentPose,
      r: r.toFixed(2),
      rVel: this.rVelocity.toFixed(2),
      triggerState: this.isTriggerDown ? 'PRESSED' : this.triggerState,
      gripChanging: this.isGripChanging,
      fistTime: this.fistDuration.toFixed(2),
      openTime: this.openDuration.toFixed(2),
      handedness
    };

    return {
      pose: this.currentPose,
      r,
      rVelocity: this.rVelocity,
      isTriggerDown: this.isTriggerDown,
      justFired,
      isGripChanging: this.isGripChanging,
      fistDuration: this.fistDuration,
      openDuration: this.openDuration,
      swipeDirection,
      handedness,
      debug: this.debugInfo
    };
  }

  handleCalibrationStep(r, timestamp) {
    const elapsed = (timestamp - this.calibrationTimer) / 1000;

    if (this.calibrationStage === 1) {
      // Stage 1: Hold thumb raised / up (1.5s)
      this.calibrationSamples.raised.push(r);
      if (this.onCalibProgress) {
        this.onCalibProgress(`Hold thumb UP and relaxed... ${(1.5 - elapsed).toFixed(1)}s`);
      }
      if (elapsed >= 1.5) {
        this.calibrationStage = 2;
        this.calibrationTimer = timestamp;
      }
    } else if (this.calibrationStage === 2) {
      // Stage 2: Press thumb down once (1.5s)
      this.calibrationSamples.pressed.push(r);
      if (this.onCalibProgress) {
        this.onCalibProgress(`Now press thumb DOWN once! ${(1.5 - elapsed).toFixed(1)}s`);
      }
      if (elapsed >= 1.5) {
        this.finishCalibration();
      }
    }
  }

  finishCalibration() {
    this.isCalibrating = false;
    this.calibrationStage = 0;

    const raised = this.calibrationSamples.raised;
    const pressed = this.calibrationSamples.pressed;

    if (raised.length > 5 && pressed.length > 5) {
      // Sort and pick robust percentiles
      raised.sort((a, b) => a - b);
      pressed.sort((a, b) => a - b);

      const medianRaised = raised[Math.floor(raised.length * 0.5)];
      const minPressed = pressed[0];

      // Calculate personal arm and fire boundaries
      this.calibration.thumbArmed = Math.max(medianRaised * 0.92, 0.55);
      this.calibration.thumbFired = Math.min(minPressed * 1.15, this.calibration.thumbArmed - 0.12);

      this.saveCalibration();
      if (this.onCalibComplete) {
        this.onCalibComplete(`Calibrated: Armed=${this.calibration.thumbArmed.toFixed(2)}, Fire=${this.calibration.thumbFired.toFixed(2)}`);
      }
    } else {
      if (this.onCalibComplete) {
        this.onCalibComplete('Calibration incomplete. Reverted to default thresholds.');
      }
    }
  }
}
