// Bug A repro: open the tabs page in a fresh browser, click Tab B, report what happens.
//   node first-click.mjs <origin> [<path>]
// <origin> is a running bank (bank.mjs) or the example's `vite dev`; <path> defaults to the
// bank's page. Against `vite dev`, mount <app-bench-tabs> in a route and pass its path.
import { pathToFileURL } from 'node:url';
const ROOT = 'C:/Users/Home/Documents/Cursos 2026/fudic/examples/basic';
const { chromium } = await import(pathToFileURL(`${ROOT}/node_modules/@playwright/test/index.mjs`).href);
const origin = process.argv[2];
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const pw = await browser.newPage();
pw.setDefaultTimeout(4000);
const logs = [];
pw.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
pw.on('pageerror', (e) => logs.push(`pageerror: ${e}`));
await pw.routeWebSocket((u) => !u.pathname.startsWith('/__bench'), () => {});
await pw.goto(origin + (process.argv[3] ?? '/app-bench-tabs--cambia-de-pestana'));
await pw.waitForLoadState('networkidle');
await pw.waitForTimeout(1000); // a click made right at load sometimes lands; one made later never does
const panel = () => pw.getByRole('tabpanel').textContent();
console.log('before:', await panel());
await pw.getByRole('tab', { name: 'Tab B' }).click();
await pw.waitForLoadState('networkidle');
console.log('after 1st click:', await panel());
await pw.waitForTimeout(500);
await pw.getByRole('tab', { name: 'Tab B' }).click();
await pw.waitForTimeout(500);
console.log('after 2nd click:', await panel());
console.log('defined:', await pw.evaluate(() => !!customElements.get('app-bench-tabs')));
console.log(logs.join('\n'));
await browser.close();
