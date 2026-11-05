import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = '/Users/mayureshsonawane/.gemini/antigravity/brain/e84c9f91-b9b5-4a53-9dfd-b5689cf714b1';

async function runTest() {
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
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', err => {
    errors.push(err.toString());
  });

  console.log('Navigating to http://localhost:5174/ ...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Screenshot Intro
  console.log('Capturing Intro View...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_intro.png') });

  // 2. Click mouse mode button
  console.log('Entering Mouse Mode...');
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 1200));

  // 3. Screenshot Stand
  console.log('Capturing 3D Stand View...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_stand.png') });

  // 4. Pick up gun and fire
  console.log('Grabbing gun and positioning...');
  await page.mouse.move(760, 520);
  await page.evaluate(() => {
    window.app.selectGun(12); // M4A1 Assault Rifle
    window.app.grab();
  });
  await new Promise(r => setTimeout(r, 600));

  // Fire rapid burst to build up smoke, tracers and sparks
  console.log('Firing burst and capturing FX...');
  await page.evaluate(() => {
    window.app.fire(performance.now());
  });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_fire.png') });

  // 5. Toggle Debug Overlay
  console.log('Toggling Debug Overlay (D key)...');
  await page.keyboard.press('KeyD');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_debug.png') });

  // 6. Open Drawer modal
  console.log('Opening Drawer Modal with 3D Thumbnails...');
  await page.evaluate(() => {
    window.app.ui.openDrawer();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_drawer.png') });

  // 7. Select RPG-7 Launcher from drawer
  console.log('Selecting RPG-7 Launcher from drawer...');
  await page.click('button[data-index="42"]');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_rpg.png') });

  console.log('Closing browser...');
  await browser.close();

  console.log('--- TEST REPORT ---');
  console.log(`Total console logs: ${consoleLogs.length}`);
  console.log(`Total errors: ${errors.length}`);
  if (errors.length > 0) {
    console.error('Errors encountered:');
    errors.forEach(e => console.error('  ->', e));
  } else {
    console.log('SUCCESS: Zero console errors!');
  }
}

runTest().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
