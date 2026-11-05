import puppeteer from 'puppeteer-core';

async function logUpdate() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 400));

  await page.evaluate(() => {
    window.app.grab();
  });
  await new Promise(r => setTimeout(r, 400));

  const debug = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const vFOV = (sm.camera.fov * Math.PI) / 180;
    const vHeight = 2 * Math.tan(vFOV / 2) * 0.65;
    const vWidth = vHeight * sm.camera.aspect;
    return {
      mouse: window.app.mouse,
      heldLerp: sm.heldLerp,
      vHeight,
      vWidth,
      weaponRootPos: sm.weaponRoot.position.toArray(),
      weaponGroupPos: sm.currentGunGroup.position.toArray(),
      weaponGroupWorldPos: (() => {
        const v = new THREE.Vector3();
        sm.currentGunGroup.getWorldPosition(v);
        return v.toArray();
      })()
    };
  });
  console.log('Update Debug:', debug);
  await browser.close();
}

logUpdate();

