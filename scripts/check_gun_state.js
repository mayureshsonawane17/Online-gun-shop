import puppeteer from 'puppeteer-core';

async function checkGunState() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 500));

  const state = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const gun = sm.currentGunGroup;
    const standPos = sm.turntable.getStandWorldPosition();
    return {
      hasGunGroup: !!gun,
      gunName: gun?.name,
      gunVisible: gun?.visible,
      gunChildren: gun?.children.length,
      rootPos: sm.weaponRoot.position.toArray(),
      rootQuat: sm.weaponRoot.quaternion.toArray(),
      gunPos: gun?.position.toArray(),
      gunScale: gun?.scale.toArray(),
      standPos: standPos.toArray(),
      held: window.app.held,
      heldLerp: sm.heldLerp,
      cameraPos: sm.camera.position.toArray(),
      cameraNearFar: [sm.camera.near, sm.camera.far]
    };
  });
  console.log('Gun State at Stand:', state);

  // Now grab
  await page.evaluate(() => {
    window.app.grab();
  });
  await new Promise(r => setTimeout(r, 500));

  const heldState = await page.evaluate(() => {
    const sm = window.app.sceneManager;
    const gun = sm.currentGunGroup;
    return {
      held: window.app.held,
      heldLerp: sm.heldLerp,
      rootPos: sm.weaponRoot.position.toArray(),
      rootQuat: sm.weaponRoot.quaternion.toArray(),
      gunPos: gun?.position.toArray()
    };
  });
  console.log('Gun State when Held:', heldState);

  await browser.close();
}

checkGunState();

