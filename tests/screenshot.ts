import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173');
await page.getByText('Connected', { exact: true }).waitFor();
await page.screenshot({ path: '/private/tmp/scienfactory-light.png', fullPage: true });
await page.getByRole('button', { name: 'Use dark theme' }).click();
await page.screenshot({ path: '/private/tmp/scienfactory-dark.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '/private/tmp/scienfactory-mobile.png', fullPage: true });
console.log(JSON.stringify({ errors }));
await browser.close();
