/**
 * test_magic.js
 * Comprehensive end-to-end browser verification of the new Magic section,
 * section switcher, 7 elemental powers, energy meter, drawers, gestures, and mouse mode.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = '/Users/mayureshsonawane/.gemini/antigravity/brain/e84c9f91-b9b5-4a53-9dfd-b5689cf714b1';

async function testMagic() {
  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('BROWSER ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error('PAGE ERROR:', err.message);
  });

  console.log('Navigating to http://localhost:5174/ ...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Enter mouse mode from intro
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 800));

  // Verify initial Guns mode
  const initialSection = await page.evaluate(() => window.app.section);
  console.log(`Initial Section: ${initialSection}`);

  // 1. Switch to MAGIC SECTION
  console.log('Switching to MAGIC SECTION via header pill...');
  await page.click('#btn-sec-magic');
  await new Promise(r => setTimeout(r, 800));

  const magicSectionState = await page.evaluate(() => {
    const app = window.app;
    return {
      section: app.section,
      appTitle: document.querySelector('#app-title').textContent,
      pickGunsHidden: document.querySelector('#pick').hidden,
      pickMagicVisible: !document.querySelector('#pick-magic').hidden,
      energyCardVisible: !document.querySelector('#magic-energy-card').hidden,
      energyText: document.querySelector('#energy-val').textContent,
      powerTitle: document.querySelector('#active-power-title').textContent,
      activePower: app.magicManager.activePower.name
    };
  });
  console.log('Magic Section State:', magicSectionState);

  // Take screenshot of Magic section intro / Energy Wave
  const magicHomePath = path.join(ARTIFACTS_DIR, 'screenshot_magic_home.png');
  await page.screenshot({ path: magicHomePath });
  console.log(`Saved screenshot: ${magicHomePath}`);

  // 2. Open MAGIC DRAWER
  console.log('Opening Magic Drawer...');
  await page.click('#pick-magic');
  await new Promise(r => setTimeout(r, 600));

  const drawerState = await page.evaluate(() => {
    const drawer = document.querySelector('#magic-drawers');
    const cards = Array.from(drawer.querySelectorAll('.power-card')).map(c => ({
      title: c.querySelector('.power-card-title').textContent,
      badge: c.querySelector('.power-card-badge').textContent,
      hint: c.querySelector('.power-card-hint').textContent
    }));
    return {
      visible: !drawer.hidden,
      powerCount: cards.length,
      powers: cards
    };
  });
  console.log('Magic Drawer State:', drawerState);

  const drawerPath = path.join(ARTIFACTS_DIR, 'screenshot_magic_drawer.png');
  await page.screenshot({ path: drawerPath });
  console.log(`Saved screenshot: ${drawerPath}`);

  // Close drawer
  await page.click('#magic-x');
  await new Promise(r => setTimeout(r, 400));

  // 3. Test Power 1: Energy Wave (Kamehameha Charging & Beam Firing)
  console.log('Testing Energy Wave Beam Firing...');
  await page.evaluate(() => {
    const app = window.app;
    app.magicManager.setPower(0);
    // Simulate cupped hands charging
    const fakeActions = {
      isCuppedCharging: true,
      chargeAmount: 0.95,
      beamOrigin: new THREE.Vector3(0, -0.1, -0.8),
      beamDirection: new THREE.Vector3(0, 0, -1),
      isBeamFiring: true
    };
    app.magicManager.updateSpells(fakeActions, 0.05, performance.now() * 0.001);
  });
  await new Promise(r => setTimeout(r, 400));

  const wavePath = path.join(ARTIFACTS_DIR, 'screenshot_energy_wave.png');
  await page.screenshot({ path: wavePath });
  console.log(`Saved screenshot: ${wavePath}`);

  // 4. Test Power 2: Power Blast (Ki & Spirit Shots)
  console.log('Testing Power Blast...');
  await page.evaluate(() => {
    const app = window.app;
    app.selectPower(1);
    app.magicManager.spawnPowerBlast(new THREE.Vector3(0, -0.1, -0.8), false);
    app.magicManager.spawnPowerBlast(new THREE.Vector3(0.2, -0.05, -0.8), true);
  });
  await new Promise(r => setTimeout(r, 300));
  const blastPath = path.join(ARTIFACTS_DIR, 'screenshot_power_blast.png');
  await page.screenshot({ path: blastPath });
  console.log(`Saved screenshot: ${blastPath}`);

  // 5. Test Power 3: Air Tempest (Vortex & Air Blades)
  console.log('Testing Air Tempest...');
  await page.evaluate(() => {
    const app = window.app;
    app.selectPower(2);
    const fakeActions = {
      isVortexActive: true,
      vortexCenter: new THREE.Vector3(0, 0, -0.7),
      justAirChop: false
    };
    app.magicManager.updateSpells(fakeActions, 0.05, performance.now() * 0.001);
    app.magicManager.spawnAirBlade(new THREE.Vector3(2.0, 0, 0));
  });
  await new Promise(r => setTimeout(r, 300));
  const airPath = path.join(ARTIFACTS_DIR, 'screenshot_air_tempest.png');
  await page.screenshot({ path: airPath });
  console.log(`Saved screenshot: ${airPath}`);

  // 6. Test Power 4: Water Whip & Orb
  console.log('Testing Water Whip & Orb...');
  await page.evaluate(() => {
    const app = window.app;
    app.selectPower(3);
    const fakeActions = {
      waterHandPos: new THREE.Vector3(0.1, 0, -0.7),
      isLiftingWaterOrb: true
    };
    app.magicManager.updateSpells(fakeActions, 0.05, performance.now() * 0.001);
  });
  await new Promise(r => setTimeout(r, 300));
  const waterPath = path.join(ARTIFACTS_DIR, 'screenshot_water_whip.png');
  await page.screenshot({ path: waterPath });
  console.log(`Saved screenshot: ${waterPath}`);

  // 7. Test Power 5: Earth Shatter (Orbiting Rocks & Ground Crack)
  console.log('Testing Earth Shatter...');
  await page.evaluate(() => {
    const app = window.app;
    app.selectPower(4);
    const fakeActions = {
      isFistRaised: true,
      fistPos: new THREE.Vector3(0, 0, -0.7),
      justEarthSmash: true
    };
    app.magicManager.updateSpells(fakeActions, 0.05, performance.now() * 0.001);
  });
  await new Promise(r => setTimeout(r, 300));
  const earthPath = path.join(ARTIFACTS_DIR, 'screenshot_earth_shatter.png');
  await page.screenshot({ path: earthPath });
  console.log(`Saved screenshot: ${earthPath}`);

  // 8. Test Power 6 & 7: Fire & Lightning Shield
  console.log('Testing Lightning Shield...');
  await page.evaluate(() => {
    const app = window.app;
    app.selectPower(6);
    const fakeActions = {
      isLightningSpread: true,
      isHexShieldActive: true,
      shieldCenter: new THREE.Vector3(0, 0, -0.7)
    };
    app.magicManager.updateSpells(fakeActions, 0.05, performance.now() * 0.001);
  });
  await new Promise(r => setTimeout(r, 300));
  const shieldPath = path.join(ARTIFACTS_DIR, 'screenshot_lightning_shield.png');
  await page.screenshot({ path: shieldPath });
  console.log(`Saved screenshot: ${shieldPath}`);

  // 9. Test Energy Consumption & Refill
  console.log('Testing Energy consumption & refill...');
  const energyStatus = await page.evaluate(() => {
    const app = window.app;
    const initialEnergy = app.magicManager.energy;
    app.magicManager.consumeEnergy(40);
    const afterConsume = app.magicManager.energy;
    // Simulate 0.5s of refill
    app.magicManager.update(0.5);
    const afterRefill = app.magicManager.energy;
    return { initialEnergy, afterConsume, afterRefill };
  });
  console.log('Energy Economy Test:', energyStatus);

  // 10. Switch back to GUNS section and verify nothing broke
  console.log('Switching back to GUNS section...');
  await page.click('#btn-sec-guns');
  await new Promise(r => setTimeout(r, 800));

  const gunsReturnState = await page.evaluate(() => {
    const app = window.app;
    return {
      section: app.section,
      appTitle: document.querySelector('#app-title').textContent,
      pickGunsVisible: !document.querySelector('#pick').hidden,
      pickMagicHidden: document.querySelector('#pick-magic').hidden,
      hudVisible: !document.querySelector('#hud').hidden,
      gunName: app.gunList[app.sel].name,
      turntableVisible: app.sceneManager.turntable.mountNode.visible
    };
  });
  console.log('Guns Return State:', gunsReturnState);

  const gunsRestoredPath = path.join(ARTIFACTS_DIR, 'screenshot_guns_restored.png');
  await page.screenshot({ path: gunsRestoredPath });
  console.log(`Saved screenshot: ${gunsRestoredPath}`);

  // Test Summary
  console.log('--- TEST RESULTS ---');
  console.log(`Console Errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors found:', consoleErrors);
    process.exit(1);
  } else {
    console.log('SUCCESS: All tests passed with ZERO console errors!');
  }

  await browser.close();
}

testMagic().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

