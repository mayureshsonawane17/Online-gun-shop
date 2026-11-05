/**
 * GestureDetector.js
 * Precision gesture detector for the Two-Finger Gun control scheme for single-handed firearms
 * (Pistols, Revolvers, SMGs).
 *
 * Rules:
 * 1. Pose = "two-finger gun":
 *    - Thumb pointing up
 *    - Index and middle fingers extended side by side (the barrel)
 *    - Ring and pinky curled
 *    - Index and middle finger directions roughly parallel (angle <= 20 degrees)
 *    - If pose is not held, weapon hangs relaxed in the hand.
 *    - Closed fist held for 0.2s = pick up from stand.
 *    - Open palm held for 0.5s = put gun away.
 * 2. Fire = thumb folds down:
 *    - Armed: thumb has been up (r > armThreshold) for at least 150 ms with two-finger pose intact.
 *    - Fire: thumb tip moves quickly toward index finger base (r < fireThreshold, dr/dt <= velThreshold).
 *    - Aim latch: keeps a ring buffer of aim directions over last 150 ms; fires using aim from 100 ms earlier.
 *    - Safety Gate: only fires if index and middle stay extended; fist or closing hand never fires.
 *    - Semi-auto: 1 shot per fold, thumb must lift to re-arm.
 *    - Full-auto: continuous firing while thumb remains folded.
 */
import * as THREE from 'three';

export class GestureDetector {
  constructor() {
    this.defaultCalibration = {
      thumbArmed: 0.62,
      thumbFired: 0.42,
      velocityThreshold: -0.75, // r drop rate per second
      parallelAngleMax: 20.0,   // degrees between index and middle
      sensitivity: 1.0
    };

    this.calibration = this.loadCalibration();

    // Calibration runtime state
    this.isCalibrating = false;
    this.calibrationStage = 0; // 0=idle, 1=raised (1.5s), 2=pressed (1.5s)
    this.calibrationSamples = { raised: [], pressed: [] };
    this.calibrationTimer = 0;

    // Trigger state machine
    this.triggerState = 'IDLE'; // 'IDLE', 'ARMED', 'FIRED'
    this.isArmed = false;
    this.armedDuration = 0; // seconds armed in two-finger pose
    this.isTriggerDown = false;
    this.prevR = null;
    this.prevRTime = 0;
    this.rVelocity = 0;
    this.lastFireTime = 0;

    // Pose classification
    this.isTwoFingerGun = false;
    this.fingerAngleDeg = 0;
    this.currentPose = 'other'; // 'two_finger_gun', 'fist', 'open', 'other'

    // Grip change & curl detection (history of finger curls over the last 300ms)
    this.curlHistory = [];
    this.isGripChanging = false;

    // Fist and open palm timers (for grab & drop)
    this.fistStartTime = 0;
    this.fistDuration = 0;
    this.openStartTime = 0;
    this.openDuration = 0;

    // Aim latch ring buffer (holds aim data for the 100ms latch)
    this.aimRingBuffer = [];

    // Velocity tracking for horizontal hand swipe
    this.prevWrist = null;
    this.prevWristTime = 0;
    this.wristVelX = 0;
    this.lastSwipeTime = 0;

    // Low confidence aim hold
    this.lastGoodAim = null;
    this.lastGoodAimTime = 0;

    this.debugInfo = {
      pose: 'none',
      fingerAngle: '0.0°',
      r: '0.00',
      rVel: '0.0',
      isArmed: false,
      triggerState: 'IDLE',
      gripChanging: false,
      fistTime: 0,
      openTime: 0,
      aimVector: '0, 0, 1'
    };
  }

  loadCalibration() {
    try {
      const saved = localStorage.getItem('gun_shop_two_finger_calibration_v3') ||
                    localStorage.getItem('gun_shop_gesture_calibration_v2');
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
      localStorage.setItem('gun_shop_two_finger_calibration_v3', JSON.stringify(this.calibration));
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
      this.isArmed = false;
      this.armedDuration = 0;
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

    // 2. Thumb trigger metric r = distance(thumb tip [4], index finger base [5]) / handScale
    const thumbToIndexBase = d3(4, 5);
    const r = thumbToIndexBase / handScale;

    // Apply sensitivity scaling
    const sens = this.calibration.sensitivity || 1.0;
    const armThreshold = this.calibration.thumbArmed / sens;
    const fireThreshold = this.calibration.thumbFired * sens;
    const velThreshold = (this.calibration.velocityThreshold || -0.75) * sens;

    // Calculate r velocity (dr/dt in units per second)
    const dt = this.prevRTime ? Math.max((timestamp - this.prevRTime) / 1000, 0.005) : 0.016;
    if (this.prevR !== null) {
      const instVel = (r - this.prevR) / dt;
      this.rVelocity = this.rVelocity * 0.45 + instVel * 0.55;
    }
    this.prevR = r;
    this.prevRTime = timestamp;

    // 3. Measure extension of all fingers using 3D world landmarks
    // Index finger (base 5, PIP 6, DIP 7, Tip 8)
    const indexTipDist = d3(8, 0) / handScale;
    const indexPipDist = d3(6, 0) / handScale;
    const isIndexExt = (indexTipDist > 1.25) && (d2(8, 0) > d2(6, 0) * 1.15);

    // Middle finger (base 9, PIP 10, DIP 11, Tip 12)
    const middleTipDist = d3(12, 0) / handScale;
    const middlePipDist = d3(10, 0) / handScale;
    const isMiddleExt = (middleTipDist > 1.30) && (d2(12, 0) > d2(10, 0) * 1.15);

    // Ring finger (base 13, PIP 14, DIP 15, Tip 16)
    const ringTipDist = d3(16, 0) / handScale;
    const isRingCurled = (ringTipDist < 1.18) || (d2(16, 0) <= d2(14, 0) * 1.08);

    // Pinky finger (base 17, PIP 18, DIP 19, Tip 20)
    const pinkyTipDist = d3(20, 0) / handScale;
    const isPinkyCurled = (pinkyTipDist < 1.08) || (d2(20, 0) <= d2(18, 0) * 1.08);

    // 4. Calculate angle between Index direction and Middle direction
    const vIndex = new THREE.Vector3(wlm[8].x - wlm[5].x, wlm[8].y - wlm[5].y, (wlm[8].z || 0) - (wlm[5].z || 0)).normalize();
    const vMiddle = new THREE.Vector3(wlm[12].x - wlm[9].x, wlm[12].y - wlm[9].y, (wlm[12].z || 0) - (wlm[9].z || 0)).normalize();

    const dotParallel = Math.max(-1, Math.min(1, vIndex.dot(vMiddle)));
    this.fingerAngleDeg = THREE.MathUtils.radToDeg(Math.acos(dotParallel));

    // Parallel check with hysteresis: enter at <= 22 deg, stay until > 26 deg
    const maxAngle = (this.calibration.parallelAngleMax || 20.0);
    const isParallel = this.isTwoFingerGun
      ? (this.fingerAngleDeg <= maxAngle + 5.0)
      : (this.fingerAngleDeg <= maxAngle + 2.0);

    // Two-Finger Gun Pose: index & middle extended side-by-side parallel; ring & pinky curled
    this.isTwoFingerGun = isIndexExt && isMiddleExt && isRingCurled && isPinkyCurled && isParallel;

    // 5. Overall Pose Detection: Two-Finger Gun vs Fist vs Open vs Other
    const allCurled = isRingCurled && isPinkyCurled && (!isIndexExt || d2(8, 0) < d2(6, 0)) && (!isMiddleExt || d2(12, 0) < d2(10, 0));
    const allOpen = isIndexExt && isMiddleExt && !isRingCurled && !isPinkyCurled;

    if (allOpen) {
      this.currentPose = 'open';
      if (!this.openStartTime) this.openStartTime = timestamp;
      this.openDuration = (timestamp - this.openStartTime) / 1000;
      this.fistStartTime = 0;
      this.fistDuration = 0;
    } else if (allCurled) {
      this.currentPose = 'fist';
      if (!this.fistStartTime) this.fistStartTime = timestamp;
      this.fistDuration = (timestamp - this.fistStartTime) / 1000;
      this.openStartTime = 0;
      this.openDuration = 0;
    } else if (this.isTwoFingerGun) {
      this.currentPose = 'two_finger_gun';
      this.fistStartTime = 0;
      this.fistDuration = 0;
      this.openStartTime = 0;
      this.openDuration = 0;
    } else {
      this.currentPose = 'other';
      this.fistStartTime = 0;
      this.fistDuration = 0;
      this.openStartTime = 0;
      this.openDuration = 0;
    }

    // 6. Grip-Change Gate (monitors if fingers are shifting into a fist or open hand)
    const curlAvg = (indexTipDist + middleTipDist + ringTipDist + pinkyTipDist) / 4;
    this.curlHistory.push({ time: timestamp, curlAvg });
    while (this.curlHistory.length > 0 && timestamp - this.curlHistory[0].time > 300) {
      this.curlHistory.shift();
    }
    const recentCurls = this.curlHistory.filter(h => timestamp - h.time <= 150);
    if (recentCurls.length >= 2) {
      let minCurl = Infinity, maxCurl = -Infinity;
      for (const h of recentCurls) {
        if (h.curlAvg < minCurl) minCurl = h.curlAvg;
        if (h.curlAvg > maxCurl) maxCurl = h.curlAvg;
      }
      this.isGripChanging = (maxCurl - minCurl) > 0.16;
    } else {
      this.isGripChanging = false;
    }

    // 7. Calibration Handling
    if (this.isCalibrating) {
      this.handleCalibrationStep(r, timestamp);
    }

    // 8. Trigger State Machine: Armed -> Fired
    let justFired = false;

    // ARMED condition: Two-finger gun pose intact AND thumb pointing up (r > armThreshold) for at least 150ms
    if (this.isTwoFingerGun && r > armThreshold && !this.isGripChanging) {
      this.armedDuration += dt;
      if (this.armedDuration >= 0.150) {
        this.isArmed = true;
        this.triggerState = 'ARMED';
        this.isTriggerDown = false;
      }
    } else if (!this.isTwoFingerGun || this.currentPose === 'fist' || this.currentPose === 'open') {
      // Disarm immediately if hand closes into fist, opens to palm, or breaks two-finger pose
      this.isArmed = false;
      this.armedDuration = 0;
      this.triggerState = 'IDLE';
      this.isTriggerDown = false;
    }

    // FIRE condition:
    // - Was armed
    // - Thumb folds down quickly (r < fireThreshold, rVelocity <= velThreshold)
    // - Index and middle fingers STAY extended (isIndexExt && isMiddleExt)
    // - Hand is NOT closing into a fist or opening into a palm (!isGripChanging)
    if (this.isArmed && this.triggerState === 'ARMED') {
      const isFolded = r < fireThreshold;
      const isFastDrop = this.rVelocity <= velThreshold;
      const fingersHeld = isIndexExt && isMiddleExt && isRingCurled;

      if (isFolded && isFastDrop && fingersHeld && !this.isGripChanging) {
        this.triggerState = 'FIRED';
        this.isTriggerDown = true;
        justFired = true;
        this.lastFireTime = timestamp;
        this.isArmed = false; // Must return to thumb up to rearm
        this.armedDuration = 0;
      }
    } else if (this.triggerState === 'FIRED') {
      // Continuous firing for full-auto while thumb remains folded down
      if (r < fireThreshold + 0.06 && isIndexExt && isMiddleExt && isRingCurled && !this.isGripChanging) {
        this.isTriggerDown = true;
      } else {
        this.isTriggerDown = false;
        if (r > armThreshold) {
          this.triggerState = 'IDLE';
        }
      }
    }

    // 9. Horizontal Swipe Detection for Gun Switching
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

    // 10. Update Telemetry
    this.debugInfo = {
      pose: this.currentPose,
      fingerAngle: `${this.fingerAngleDeg.toFixed(1)}°`,
      r: r.toFixed(2),
      rVel: this.rVelocity.toFixed(2),
      isArmed: this.isArmed,
      triggerState: this.isTriggerDown ? 'FIRED' : (this.isArmed ? 'ARMED' : 'IDLE'),
      gripChanging: this.isGripChanging,
      fistTime: this.fistDuration.toFixed(2),
      openTime: this.openDuration.toFixed(2),
      handedness
    };

    return {
      pose: this.currentPose,
      isTwoFingerGun: this.isTwoFingerGun,
      fingerAngleDeg: this.fingerAngleDeg,
      r,
      rVelocity: this.rVelocity,
      isArmed: this.isArmed,
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
      // Stage 1: Hold Two-Finger Gun with Thumb UP (1.5s)
      this.calibrationSamples.raised.push(r);
      if (this.onCalibProgress) {
        this.onCalibProgress(`Hold TWO-FINGER GUN with Thumb UP... ${(1.5 - elapsed).toFixed(1)}s`);
      }
      if (elapsed >= 1.5) {
        this.calibrationStage = 2;
        this.calibrationTimer = timestamp;
      }
    } else if (this.calibrationStage === 2) {
      // Stage 2: Fold Thumb DOWN (1.5s)
      this.calibrationSamples.pressed.push(r);
      if (this.onCalibProgress) {
        this.onCalibProgress(`Now FOLD thumb down! ${(1.5 - elapsed).toFixed(1)}s`);
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
      raised.sort((a, b) => a - b);
      pressed.sort((a, b) => a - b);

      const medianRaised = raised[Math.floor(raised.length * 0.5)];
      const minPressed = pressed[0];

      this.calibration.thumbArmed = Math.max(medianRaised * 0.90, 0.52);
      this.calibration.thumbFired = Math.min(minPressed * 1.15, this.calibration.thumbArmed - 0.12);

      this.saveCalibration();
      if (this.onCalibComplete) {
        this.onCalibComplete(`Two-Finger Gun Calibrated: Armed=${this.calibration.thumbArmed.toFixed(2)}, Fire=${this.calibration.thumbFired.toFixed(2)}`);
      }
    } else {
      if (this.onCalibComplete) {
        this.onCalibComplete('Calibration incomplete. Reverted to default thresholds.');
      }
    }
  }
}
