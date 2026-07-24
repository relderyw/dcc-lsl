const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const content = await page.content();
  if (content.includes('id="root"></div>')) {
    console.log('ROOT IS EMPTY');
  } else {
    console.log('ROOT HAS CONTENT');
  }
  
  await browser.close();
})();
