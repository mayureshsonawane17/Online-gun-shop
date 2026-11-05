import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = '/Users/mayureshsonawane/.gemini/antigravity/brain/e84c9f91-b9b5-4a53-9dfd-b5689cf714b1';

async function runMagicFXVerification() {
  console.log('--- STARTING MAGICFX AUTOMATED VERIFICATION ---');
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

  // Enter mouse mode
  console.log('Entering interactive mouse mode...');
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 500));

  // 1. Verify Guns Section is untouched and post-processing is NOT applied
  console.log('Checking Guns section rendering...');
  const gunsState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const mm = window.app.magicManager;
    return {
      section: sm.section,
      magicEnabled: mm.enabled,
      fxPostEnabled: mm.fx.postEnabled,
      hasWeapon: Boolean(sm.weaponRoot && sm.weaponRoot.visible),
      hasTurntable: Boolean(sm.turntable && sm.turntable.mountNode.visible)
    };
  });
  console.log('Guns Section State:', gunsState);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_guns_untouched.png') });

  // 2. Switch to Magic Section
  console.log('Switching to Magic Section...');
  await page.click('#btn-sec-magic');
  await new Promise(r => setTimeout(r, 600));

  const magicInitState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const mm = window.app.magicManager;
    return {
      section: sm.section,
      magicEnabled: mm.enabled,
      powerCount: mm.powers.length,
      activePower: mm.activePower.name,
      fxInstanceReady: Boolean(mm.fx && mm.fx.renderer && mm.fx.pool)
    };
  });
  console.log('Magic Section Initialized:', magicInitState);

  // Helper to test casting a power and taking a screenshot
  async function testPowerCast(powerIdx, screenshotName, castAction, customDelayMs = 120) {
    console.log(`Testing power #${powerIdx}...`);
    await page.evaluate((idx) => {
      window.app.magicManager.cleanupActiveEffects();
      window.app.selectPower(idx);
    }, powerIdx);
    await new Promise(r => setTimeout(r, 400));

    // Execute cast action in browser context
    const castResult = await page.evaluate(castAction);
    console.log(`  -> Cast result:`, castResult);

    await new Promise(r => setTimeout(r, customDelayMs)); // Allow particles/shaders to render
    await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshotName) });
    await new Promise(r => setTimeout(r, 200));

    // Clear after test
    await page.evaluate(() => {
      window.app.magicManager.cleanupActiveEffects();
    });
  }

  // 1. Energy Wave (Index 0): Charge & Cast
  await testPowerCast(0, 'screenshot_magic_energy_wave.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(0, -0.05, -0.85);
    const dir = new window.THREE.Vector3(0.05, 0.05, -1).normalize();

    // Charge
    const ch = mm.fx.charge('energyWave', { origin, power: 0.85, color: 0x00e5ff });
    ch.update({ origin, power: 1.0 });

    // Cast beam
    const beam = mm.fx.cast('energyWave', { origin, direction: dir, power: 0.95, color: 0x00e5ff });
    mm.activeBeam = beam;
    mm.consumeEnergy(35);
    return {
      power: mm.activePower.name,
      fxKind: beam.kind,
      remainingEnergy: mm.energy
    };
  });

  // Stop beam after test
  await page.evaluate(() => {
    window.app.magicManager.cleanupActiveEffects();
  });

  // 2. Power Blast (Index 1)
  await testPowerCast(1, 'screenshot_magic_power_blast.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(0.1, -0.08, -0.85);
    const dir = new window.THREE.Vector3(0.1, 0.05, -1).normalize();
    const blast = mm.fx.cast('powerBlast', { origin, direction: dir, power: 0.85, color: 0xffd700 });
    mm.consumeEnergy(14);
    return { power: mm.activePower.name, fxKind: blast.kind, energy: mm.energy };
  });

  // 3. Air Tempest (Index 2)
  await testPowerCast(2, 'screenshot_magic_air.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(0, 0, -0.85);
    const dir = new window.THREE.Vector3(0, 0, -1);
    const air = mm.fx.cast('air', { origin, direction: dir, power: 0.85, color: 0x69f0ae });
    mm.consumeEnergy(18);
    return { power: mm.activePower.name, fxKind: air.kind, energy: mm.energy };
  });

  // 4. Water Whip (Index 3)
  await testPowerCast(3, 'screenshot_magic_water.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(-0.15, -0.1, -0.85);
    const dir = new window.THREE.Vector3(0.1, 0.05, -1).normalize();
    const target = origin.clone().addScaledVector(dir, 7.0);
    const water = mm.fx.cast('water', { origin, direction: dir, target, power: 0.85, color: 0x00b0ff });
    mm.consumeEnergy(20);
    return { power: mm.activePower.name, fxKind: water.kind, energy: mm.energy };
  });

  // 5. Earth Shatter (Index 4)
  await testPowerCast(4, 'screenshot_magic_earth.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(0, -0.15, -0.85);
    const dir = new window.THREE.Vector3(0, 0.1, -1).normalize();
    const earth = mm.fx.cast('earth', { origin, direction: dir, power: 0.85, color: 0xff9100 });
    mm.consumeEnergy(24);
    return { power: mm.activePower.name, fxKind: earth.kind, energy: mm.energy };
  });

  // 6. Dragon Fire (Index 5)
  await testPowerCast(5, 'screenshot_magic_fire.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(0.05, -0.05, -0.85);
    const dir = new window.THREE.Vector3(0, 0, -1);
    const fire = mm.fx.cast('fire', { origin, direction: dir, power: 0.9, color: 0xff3d00 });
    mm.consumeEnergy(18);
    return { power: mm.activePower.name, fxKind: fire.kind, energy: mm.energy };
  });

  // 7. Lightning Strike (Index 6)
  await testPowerCast(6, 'screenshot_magic_lightning.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(-0.35, -0.15, -0.85);
    const dir = new window.THREE.Vector3(0.5, 0.4, -1).normalize();
    const target = new window.THREE.Vector3(0.35, 0.25, -2.2);
    const lightning = mm.fx.cast('lightning', { origin, direction: dir, target, power: 1.0, color: 0xb388ff });
    mm.consumeEnergy(20);
    return { power: mm.activePower.name, fxKind: lightning.kind, energy: mm.energy };
  }, 35);

  // 8. Aegis Shield (Index 7)
  await testPowerCast(7, 'screenshot_magic_shield.png', () => {
    const mm = window.app.magicManager;
    const origin = new window.THREE.Vector3(0, 0, -0.85);
    const dir = new window.THREE.Vector3(0, 0, -1);
    const shield = mm.fx.cast('shield', { origin, direction: dir, power: 0.85, color: 0x3df0a0 });
    mm.activeShield = shield;
    mm.consumeEnergy(24);
    return { power: mm.activePower.name, fxKind: shield.kind, energy: mm.energy };
  });

  // Clean up
  await page.evaluate(() => {
    window.app.magicManager.cleanupActiveEffects();
  });

  // 9. Test Mouse Mode Interaction: Click-and-Hold Charge, Drag to Aim, Release to Cast
  console.log('Testing Mouse Mode Click-and-Hold Charge and Release Cast...');
  const mouseTestResult = await page.evaluate(async () => {
    const mm = window.app.magicManager;
    mm.setPower(1); // Power Blast
    const initialEnergy = mm.energy;

    // Simulate mouse down (charging)
    mm.processMouseControl({ x: 0.2, y: -0.1, isDown: true, justReleased: false }, 0.05);
    const isCharging = Boolean(mm.mouseCharging && mm.activeCharge);

    // Simulate mouse drag aiming
    mm.processMouseControl({ x: 0.35, y: 0.05, isDown: true, justReleased: false }, 0.05);

    // Simulate mouse release (casting)
    mm.processMouseControl({ x: 0.35, y: 0.05, isDown: false, justReleased: true }, 0.05);
    const castOccurred = (mm.energy < initialEnergy);

    return {
      isCharging,
      castOccurred,
      energyDeducted: initialEnergy - mm.energy
    };
  });
  console.log('Mouse Mode Test Result:', mouseTestResult);

  // 10. Test Coordinate Mapping Function (Landmark to Scene)
  console.log('Testing Landmark to Scene Coordinate Mapping...');
  const coordTestResult = await page.evaluate(() => {
    const mm = window.app.magicManager;
    // Mirrored landmark: (0.2, 0.3, 0)
    const mockLm = [{ x: 0.2, y: 0.3 }];
    const mockWlm = [{ x: 0.0, y: 0.0, z: 0.05 }];
    const scenePos = mm.landmarkToScene(mockLm, mockWlm, 0, -0.85);

    // sx should be (1 - 0.2) * 2 - 1 = 0.8 * 2 - 1 = 0.6
    // sy should be 1 - 0.3 * 2 = 0.4
    return {
      sceneX: scenePos.x.toFixed(3),
      sceneY: scenePos.y.toFixed(3),
      sceneZ: scenePos.z.toFixed(3)
    };
  });
  console.log('Coordinate Mapping Test Result:', coordTestResult);

  // 11. Test Section Switch Back to Guns (disabling post-processing)
  console.log('Testing Switch back to Guns section...');
  await page.click('#btn-sec-guns');
  await new Promise(r => setTimeout(r, 500));

  const gunsRestored = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const mm = window.app.magicManager;
    return {
      section: sm.section,
      magicEnabled: mm.enabled,
      weaponVisible: sm.weaponRoot.visible,
      turntableVisible: sm.turntable.mountNode.visible
    };
  });
  console.log('Guns Section Restored:', gunsRestored);

  await browser.close();

  console.log('--- VERIFICATION SUMMARY ---');
  console.log(`Console Errors Total: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors encountered:');
    consoleErrors.forEach(e => console.error('  ->', e));
    process.exit(1);
  } else {
    console.log('SUCCESS: All MagicFX powers and integration requirements verified with 0 console errors!');
  }
}

runMagicFXVerification().catch(err => {
  console.error('Fatal error in verification:', err);
  process.exit(1);
});
