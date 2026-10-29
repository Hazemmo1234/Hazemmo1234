// Render v5/rewritten_scripts.html to PDF with the pre-installed Playwright Chromium.
// Usage: node content_system/tools/render_pdf.js
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const src = path.join(root, 'final_scripts.html');
  const out = path.join(root, 'final_scripts.pdf');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + src, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight));
  console.log('fonts loaded:', fonts.join(', ') || 'none (system fallback)');
  await page.pdf({ path: out, format: 'A4', printBackground: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:7pt;width:100%;text-align:center;color:#8a929c;font-family:Inter,sans-serif">Reel Scripts · v6 · @hazemmohamed.rehab · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  await browser.close();
  console.log('wrote', out);
})();
