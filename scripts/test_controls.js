import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = '/Users/mayureshsonawane/.gemini/antigravity/brain/e84c9f91-b9b5-4a53-9dfd-b5689cf714b1';

async function testControls() {
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

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
  });

  console.log('Navigating to http://localhost:5174/ ...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // Enter mouse mode to test UI and 3D scene controls
  console.log('Entering interactive mode...');
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 600));

  // 1. One-Handed Pistol Test (Glock 17)
  console.log('Testing One-Handed Pistol with Aim Laser...');
  await page.evaluate(() => {
    window.app.grab();
  });
  await new Promise(r => setTimeout(r, 500));

  // Verify Aim Laser is visible
  const laserState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    return {
      laserVisible: sm.aimLaser.visible,
      dotVisible: sm.aimDot.visible,
      dotPos: sm.aimDot.position.toArray(),
      gunHands: window.app.gunList[window.app.sel].hands
    };
  });
  console.log('Laser State:', laserState);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_one_hand.png') });

  // 2. Two-Handed Rifle Test without support hand (Unsupported Droop & Hint)
  console.log('Testing Two-Handed Rifle without Support Hand...');
  await page.evaluate(() => {
    window.app.selectGun(12); // M4A1 Assault Rifle
    window.app.mouse.twoHands = false; // Simulate unsupported hold
  });
  await new Promise(r => setTimeout(r, 600));

  const droopState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const gun = window.app.gunList[window.app.sel];
    const hintEl = document.querySelector('#support-hint');
    return {
      gunName: gun.name,
      hands: gun.hands,
      requiresSupport: gun.requiresSupport,
      supportAttached: sm.isSupportAttached,
      ringVisible: sm.supportRing.visible,
      hintVisible: !hintEl.hidden,
      hintText: hintEl.textContent.trim()
    };
  });
  console.log('Droop & Support Hint State:', droopState);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_unsupported.png') });

  // 3. Two-Handed Rifle Test with Support Hand Attached
  console.log('Attaching Support Hand (Two-Handed Aiming & Green Foregrip Ring)...');
  await page.evaluate(() => {
    window.app.mouse.twoHands = true;
  });
  await new Promise(r => setTimeout(r, 400));

  const twoHandState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const hintEl = document.querySelector('#support-hint');
    return {
      supportAttached: sm.isSupportAttached,
      ringVisible: sm.supportRing.visible,
      ringColor: sm.supportRing.material.color.getHexString(),
      hintHidden: hintEl.hidden
    };
  });
  console.log('Two-Hand Attached State:', twoHandState);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_two_hand.png') });

  // 4. Test Sensitivity Slider & Calibration Toast
  console.log('Testing Sensitivity Slider & Calibration Flow...');
  await page.evaluate(() => {
    const slider = document.querySelector('#sens-slider');
    slider.value = '1.25';
    slider.dispatchEvent(new Event('input'));
    window.app.startCalibration();
  });
  await new Promise(r => setTimeout(r, 400));

  const calibState = await page.evaluate(() => {
    const toast = document.querySelector('#calib-toast');
    const sensVal = document.querySelector('#sens-val');
    return {
      toastVisible: toast.style.opacity === '1',
      toastText: toast.textContent,
      sensText: sensVal.textContent
    };
  });
  console.log('Calibration & Sensitivity State:', calibState);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_controls_ui.png') });

  // 5. Test Debug Overlay (D Key)
  console.log('Testing Debug Overlay telemetry HUD...');
  await page.keyboard.press('KeyD');
  await new Promise(r => setTimeout(r, 400));

  const debugState = await page.evaluate(() => {
    const dbg = document.querySelector('#debug-overlay');
    return {
      display: dbg.style.display,
      html: dbg.innerHTML.replace(/\s+/g, ' ')
    };
  });
  console.log('Debug Overlay Display:', debugState.display);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_debug_v2.png') });

  // 6. Test Gestures and Firing Rules in Headless Simulated Landmarker
  console.log('Verifying Gesture Firing Rules (Closed hand does NOT fire, Thumb drop fires)...');
  const gestureTest = await page.evaluate(() => {
    const gd = window.app.handTracker.getGestureDetector();

    // Helper: generate mock hand landmarks
    // Tip 4 (thumb), Tip 6 (index PIP), Wrist 0, Middle MCP 9
    function makeLandmarks(thumbTipDistance, fingerCurls = [0.1, 0.1, 0.1, 0.1]) {
      const lm = [];
      for (let i = 0; i < 21; i++) {
        lm.push({ x: 0.5, y: 0.5, z: 0.0 });
      }
      // Hand scale: 0 to 9 distance = 0.15
      lm[0] = { x: 0.5, y: 0.65, z: 0.0 };
      lm[9] = { x: 0.5, y: 0.50, z: 0.0 };

      // Index PIP at 6
      lm[6] = { x: 0.5, y: 0.45, z: 0.0 };

      // Thumb tip at 4
      lm[4] = { x: 0.5, y: 0.45 + thumbTipDistance, z: 0.0 };

      // Finger tips 8, 12, 16, 20
      lm[8] = { x: 0.5, y: 0.65 - fingerCurls[0], z: 0.0 };
      lm[12] = { x: 0.5, y: 0.65 - fingerCurls[1], z: 0.0 };
      lm[16] = { x: 0.5, y: 0.65 - fingerCurls[2], z: 0.0 };
      lm[20] = { x: 0.5, y: 0.65 - fingerCurls[3], z: 0.0 };

      return lm;
    }

    const results = [];

    // Test A: Closed Fist with Thumb Raised (Armed)
    // Thumb distance = 0.11 -> r = 0.11 / 0.15 = 0.73 (ARMED)
    const fistRaised = makeLandmarks(0.11, [0.08, 0.08, 0.08, 0.08]);
    const resA = gd.process(fistRaised, fistRaised, 'Right', 1000);
    results.push({
      test: 'Closed Fist Thumb Raised',
      pose: resA.pose,
      r: resA.r.toFixed(2),
      isTriggerDown: resA.isTriggerDown,
      justFired: resA.justFired
    });

    // Test B: Hand Closes into tighter fist (Grip change) -> Must NOT fire
    const tightFist = makeLandmarks(0.11, [0.03, 0.03, 0.03, 0.03]);
    const resB = gd.process(tightFist, tightFist, 'Right', 1050);
    results.push({
      test: 'Closing Fist Grip Change',
      isGripChanging: resB.isGripChanging,
      justFired: resB.justFired
    });

    // Test C: Open palm -> Must NOT fire
    const openPalm = makeLandmarks(0.12, [0.25, 0.25, 0.25, 0.25]);
    const resC = gd.process(openPalm, openPalm, 'Right', 1100);
    results.push({
      test: 'Open Palm',
      pose: resC.pose,
      isTriggerDown: resC.isTriggerDown,
      justFired: resC.justFired
    });

    // Test D: Re-arm thumb (r = 0.73)
    gd.process(fistRaised, fistRaised, 'Right', 1400);

    // Test E: Thumb Press Down quickly (r drops from 0.73 to 0.40 in 30ms -> vel = -11 /s)
    const thumbPressed = makeLandmarks(0.055, [0.08, 0.08, 0.08, 0.08]);
    const resE = gd.process(thumbPressed, thumbPressed, 'Right', 1430);
    results.push({
      test: 'Thumb Press Down (Fast)',
      r: resE.r.toFixed(2),
      rVelocity: resE.rVelocity.toFixed(1),
      isTriggerDown: resE.isTriggerDown,
      justFired: resE.justFired
    });

    return results;
  });

  console.log('Gesture Test Results:', JSON.stringify(gestureTest, null, 2));

  await browser.close();

  console.log('--- TEST SUMMARY ---');
  console.log(`Console Errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors encountered:');
    consoleErrors.forEach(e => console.error('  ->', e));
    process.exit(1);
  } else {
    console.log('SUCCESS: Zero console errors!');
  }
}

testControls().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
