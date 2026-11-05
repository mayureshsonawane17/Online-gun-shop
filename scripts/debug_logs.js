import puppeteer from 'puppeteer-core';

async function debugLogs() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text(), msg.location());
  });

  page.on('pageerror', err => {
    console.log(`[PAGE ERROR]:`, err.stack || err.message);
  });

  page.on('requestfailed', req => {
    console.log(`[REQ FAILED]:`, req.url(), req.failure()?.errorText);
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`[REQ STATUS ${res.status()}]:`, res.url());
    }
  });

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await page.click('#mouse');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { window.app.grab(); });
  await page.evaluate(() => { window.app.fire(performance.now()); });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { window.app.ui.openDrawer(); });
  await new Promise(r => setTimeout(r, 1000));

  await browser.close();
}

debugLogs();

