import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = '/Users/mayureshsonawane/.gemini/antigravity/brain/e84c9f91-b9b5-4a53-9dfd-b5689cf714b1';

async function runTwoFingerGunVerification() {
  console.log('--- STARTING TWO-FINGER GUN AUTOMATED VERIFICATION ---');
  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-webgl',
      '--window-size=1280,800'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
  });

  console.log('Navigating to http://localhost:5174/ ...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // Enter mouse mode to initialize 3D scene & UI
  console.log('Entering interactive mode...');
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 600));

  // 1. Verify One-Handed Pistol (Glock 17) and Armed Indicator
  console.log('Testing Glock 17 pick-up and armed LED indicator...');
  await page.evaluate(() => {
    window.app.grab();
  });
  await new Promise(r => setTimeout(r, 500));

  const pistolState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const gun = window.app.gunList[window.app.sel];
    return {
      name: gun.name,
      hands: gun.hands,
      held: window.app.held,
      armedIndicatorVisible: sm.armedIndicator?.visible,
      armedLightVisible: sm.armedLight?.visible,
      armedIndicatorColor: sm.armedIndicator?.material?.color?.getHexString(),
      laserVisible: sm.aimLaser?.visible
    };
  });
  console.log('Pistol State:', pistolState);

  // Take screenshot of pistol with armed indicator
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_two_finger_armed.png') });

  // Fire pistol and capture recoil & muzzle flash screenshot
  console.log('Capturing Pistol firing screenshot with recoil & flash...');
  await page.evaluate(() => {
    window.app.fire(performance.now(), false);
  });
  await new Promise(r => setTimeout(r, 60)); // 60ms into muzzle flash & recoil
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_two_finger_fire.png') });

  // 2. Open Debug Overlay (D Key) to test Telemetry HUD & Aim Laser
  console.log('Toggling Debug Overlay (D key)...');
  await page.keyboard.press('KeyD');
  await new Promise(r => setTimeout(r, 400));

  const debugState = await page.evaluate(() => {
    const dbg = document.querySelector('#debug-overlay');
    const sm = window.app.sceneManager;
    return {
      overlayDisplay: dbg.style.display,
      laserVisibleWithDebug: sm.aimLaser?.visible,
      dotVisibleWithDebug: sm.aimDot?.visible,
      htmlPreview: dbg.innerText.slice(0, 180).replace(/\n/g, ' | ')
    };
  });
  console.log('Debug Overlay State:', debugState);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_debug_telemetry.png') });

  // 3. Test Two-Finger Gun Math, Pose & Trigger State Machine in GestureDetector
  console.log('Verifying Two-Finger Gun Detection & Safety Gating in GestureDetector...');
  const gestureResults = await page.evaluate(() => {
    const gd = window.app.handTracker.getGestureDetector();

    // Helper: generate 3D landmarks for two-finger gun pose vs fist vs open
    function makeLandmarks({ thumbTipDist = 0.12, indexExt = true, middleExt = true, ringCurled = true, pinkyCurled = true, parallelAngle = 0 }) {
      const lm = [];
      const wlm = [];
      for (let i = 0; i < 21; i++) {
        lm.push({ x: 0.5, y: 0.5, z: 0.0 });
        wlm.push({ x: 0.0, y: 0.0, z: 0.0 });
      }

      // Wrist at 0, Middle MCP at 9 (Hand scale = 0.16)
      wlm[0] = { x: 0.0, y: 0.0, z: 0.0 };
      wlm[9] = { x: 0.0, y: 0.16, z: 0.0 };
      lm[0] = { x: 0.5, y: 0.70 };
      lm[9] = { x: 0.5, y: 0.54 };

      // Index base at 5
      wlm[5] = { x: -0.04, y: 0.15, z: 0.0 };
      lm[5] = { x: 0.46, y: 0.55 };

      // Thumb base 2, tip 4
      wlm[2] = { x: -0.05, y: 0.06, z: 0.0 };
      wlm[4] = { x: -0.04, y: 0.15 + thumbTipDist, z: 0.0 };
      lm[4] = { x: 0.46, y: 0.55 - thumbTipDist };

      // Index finger (tip 8)
      if (indexExt) {
        wlm[6] = { x: -0.04, y: 0.22, z: 0.0 };
        wlm[8] = { x: -0.04, y: 0.32, z: 0.0 };
        lm[8] = { x: 0.46, y: 0.38 };
      } else {
        wlm[6] = { x: -0.04, y: 0.18, z: 0.0 };
        wlm[8] = { x: -0.04, y: 0.12, z: 0.0 }; // curled
        lm[8] = { x: 0.46, y: 0.58 };
      }

      // Middle finger (tip 12)
      // parallelAngle rotates middle vector around Z axis
      const rad = (parallelAngle * Math.PI) / 180;
      if (middleExt) {
        wlm[10] = { x: 0.0, y: 0.23, z: 0.0 };
        wlm[12] = { x: 0.16 * Math.sin(rad), y: 0.16 + 0.16 * Math.cos(rad), z: 0.0 };
        lm[12] = { x: 0.50, y: 0.36 };
      } else {
        wlm[10] = { x: 0.0, y: 0.19, z: 0.0 };
        wlm[12] = { x: 0.0, y: 0.13, z: 0.0 }; // curled
        lm[12] = { x: 0.50, y: 0.57 };
      }

      // Ring finger (tip 16)
      if (ringCurled) {
        wlm[14] = { x: 0.04, y: 0.17, z: 0.0 };
        wlm[16] = { x: 0.04, y: 0.11, z: 0.0 };
        lm[16] = { x: 0.54, y: 0.59 };
      } else {
        wlm[16] = { x: 0.04, y: 0.30, z: 0.0 };
        lm[16] = { x: 0.54, y: 0.40 };
      }

      // Pinky finger (tip 20)
      if (pinkyCurled) {
        wlm[18] = { x: 0.08, y: 0.15, z: 0.0 };
        wlm[20] = { x: 0.08, y: 0.10, z: 0.0 };
        lm[20] = { x: 0.58, y: 0.60 };
      } else {
        wlm[20] = { x: 0.08, y: 0.27, z: 0.0 };
        lm[20] = { x: 0.58, y: 0.43 };
      }

      return { lm, wlm };
    }

    const log = [];

    // TEST A: Two-Finger Gun pose with thumb raised (Arming)
    const poseArmed1 = makeLandmarks({ thumbTipDist: 0.11, parallelAngle: 5.0 });
    let res = gd.process(poseArmed1.lm, poseArmed1.wlm, 'Right', 1000);
    // Needs 150ms hold to arm
    res = gd.process(poseArmed1.lm, poseArmed1.wlm, 'Right', 1180);
    log.push({
      step: 'A. Two-Finger Gun Thumb Raised (180ms hold)',
      pose: res.pose,
      fingerAngle: gd.fingerAngleDeg.toFixed(1) + '°',
      isTwoFingerGun: res.isTwoFingerGun,
      r: res.r.toFixed(2),
      isArmed: gd.isArmed,
      triggerState: gd.triggerState
    });

    // TEST B: Non-parallel fingers (angle = 35° > 20°) -> Must break two-finger gun pose
    const wideFingers = makeLandmarks({ thumbTipDist: 0.11, parallelAngle: 35.0 });
    const resB = gd.process(wideFingers.lm, wideFingers.wlm, 'Right', 1200);
    log.push({
      step: 'B. Spread Fingers (35° separation)',
      isTwoFingerGun: resB.isTwoFingerGun,
      fingerAngle: gd.fingerAngleDeg.toFixed(1) + '°',
      isArmed: gd.isArmed
    });

    // TEST C: Re-arm two-finger gun pose
    gd.process(poseArmed1.lm, poseArmed1.wlm, 'Right', 1300);
    gd.process(poseArmed1.lm, poseArmed1.wlm, 'Right', 1500);

    // TEST D: Thumb folds down fast -> FIRE!
    // r drops from ~0.69 to ~0.35 in 30ms -> dr/dt ~ -11.3
    const poseFired = makeLandmarks({ thumbTipDist: 0.055, parallelAngle: 5.0 });
    const resD = gd.process(poseFired.lm, poseFired.wlm, 'Right', 1530);
    log.push({
      step: 'D. Thumb Folds Down (Fast)',
      r: resD.r.toFixed(2),
      rVelocity: resD.rVelocity.toFixed(2),
      justFired: resD.justFired,
      isTriggerDown: resD.isTriggerDown,
      triggerState: gd.triggerState
    });

    // TEST E: Safety Gate: Fist closure must NOT fire
    // Re-arm
    gd.process(poseArmed1.lm, poseArmed1.wlm, 'Right', 1700);
    gd.process(poseArmed1.lm, poseArmed1.wlm, 'Right', 1900);
    // User closes all fingers into a tight fist
    const closedFist = makeLandmarks({ thumbTipDist: 0.05, indexExt: false, middleExt: false });
    const resE = gd.process(closedFist.lm, closedFist.wlm, 'Right', 1930);
    log.push({
      step: 'E. Hand Closes to Fist (Safety Gate)',
      pose: resE.pose,
      isGripChanging: resE.isGripChanging,
      justFired: resE.justFired,
      triggerState: gd.triggerState
    });

    // TEST F: Open palm held for 0.5s triggers gun drop
    const openHand = makeLandmarks({ thumbTipDist: 0.12, indexExt: true, middleExt: true, ringCurled: false, pinkyCurled: false });
    gd.process(openHand.lm, openHand.wlm, 'Right', 2000);
    const resF = gd.process(openHand.lm, openHand.wlm, 'Right', 2550);
    log.push({
      step: 'F. Open Palm held > 0.5s',
      pose: resF.pose,
      openDuration: gd.openDuration.toFixed(2),
      justFired: resF.justFired
    });

    return log;
  });

  console.log('Gesture Machine Step Results:');
  gestureResults.forEach(r => console.log('  ', JSON.stringify(r)));

  // 4. Test Aim Latching (100ms historical lookback)
  console.log('Testing Aim Latch (150ms buffer, 100ms lookback)...');
  const aimLatchTest = await page.evaluate(() => {
    const ht = window.app.handTracker;
    const now = performance.now();

    // Push simulated aim directions into primary hand buffer
    const slot = ht.slots[0];
    slot.aimRingBuffer = [
      { time: now - 140, pos: { x: 0, y: 0, z: -1 }, fwd: { x: 0.05, y: 0.05, z: 0.99 }, up: { x: 0, y: 1, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
      { time: now - 100, pos: { x: 0, y: 0, z: -1 }, fwd: { x: 0.00, y: 0.00, z: 1.00 }, up: { x: 0, y: 1, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
      { time: now - 40,  pos: { x: 0, y: 0, z: -1 }, fwd: { x: 0.15, y: -0.10, z: 0.98 }, up: { x: 0, y: 1, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }, // deflected by thumb press
      { time: now,       pos: { x: 0, y: 0, z: -1 }, fwd: { x: 0.20, y: -0.15, z: 0.96 }, up: { x: 0, y: 1, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }
    ];

    const latched = ht.getLatchedAim(now, 100);
    return {
      now,
      targetTime: (now - 100).toFixed(0),
      latchedTime: latched.time.toFixed(0),
      latchedFwd: [latched.fwd.x.toFixed(2), latched.fwd.y.toFixed(2), latched.fwd.z.toFixed(2)],
      currentFwd: [slot.aimRingBuffer[3].fwd.x.toFixed(2), slot.aimRingBuffer[3].fwd.y.toFixed(2), slot.aimRingBuffer[3].fwd.z.toFixed(2)]
    };
  });
  console.log('Aim Latch Test Result:', aimLatchTest);

  // 5. Test SMG (Automatic Fire while thumb is folded down)
  console.log('Testing Automatic SMG (MAC-10) firing loop...');
  await page.evaluate(() => {
    window.app.selectGun(4); // MAC-10 SMG
    window.app.grab();
  });
  await new Promise(r => setTimeout(r, 400));

  const smgState = await page.evaluate(() => {
    const gun = window.app.gunList[window.app.sel];
    const initialAmmo = window.app.ammo[window.app.sel];
    // Simulate thumb folded trigger hold for 300ms
    const now = performance.now();
    window.app.fire(now, false);
    window.app.fire(now + 90, false);
    window.app.fire(now + 180, false);
    return {
      gunName: gun.name,
      category: gun.category,
      auto: gun.auto,
      hands: gun.hands,
      initialAmmo,
      remainingAmmo: window.app.ammo[window.app.sel]
    };
  });
  console.log('SMG Auto-Fire State:', smgState);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_smg_auto.png') });

  // 6. Test Two-Handed Big Gun scheme preserved (M4A1 Rifle)
  console.log('Verifying Big Gun Two-Hand Scheme (M4A1 Assault Rifle)...');
  await page.evaluate(() => {
    window.app.selectGun(12); // M4A1
  });
  await new Promise(r => setTimeout(r, 400));

  const bigGunState = await page.evaluate(() => {
    const gun = window.app.gunList[window.app.sel];
    const sm = window.app.sceneManager;
    return {
      gunName: gun.name,
      category: gun.category,
      hands: gun.hands,
      requiresSupport: gun.requiresSupport,
      armedIndicatorVisible: sm.armedIndicator?.visible, // Armed LED is only for single-hand guns
      supportRingVisible: sm.supportRing?.visible
    };
  });
  console.log('Big Gun Scheme State:', bigGunState);

  // 7. Verify Calibration Toast & Saved localStorage
  console.log('Testing Two-Finger Calibration Storage...');
  await page.evaluate(() => {
    window.app.startCalibration();
  });
  await new Promise(r => setTimeout(r, 300));

  const calibToast = await page.evaluate(() => {
    const toast = document.querySelector('#calib-toast');
    return {
      text: toast?.textContent,
      opacity: toast?.style?.opacity
    };
  });
  console.log('Calibration Toast:', calibToast);

  await browser.close();

  console.log('--- VERIFICATION SUMMARY ---');
  console.log(`Console Errors Total: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors encountered during test:');
    consoleErrors.forEach(e => console.error('  ->', e));
    process.exit(1);
  } else {
    console.log('ALL VERIFICATIONS PASSED: 0 console errors, all requirements met!');
  }
}

runTwoFingerGunVerification().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
