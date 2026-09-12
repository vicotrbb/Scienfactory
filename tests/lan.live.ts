import { chromium, expect } from '@playwright/test';
const url = process.env.LAN_TEST_URL;
if (!url) throw new Error('Set LAN_TEST_URL to the running private LAN origin.');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await Bun.file('output/comparisons/validation.json').json();
  await page.goto(`${url}/?research=${state.researchId}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  expect(
    (
      await page.request.get(url + '/api/session', { headers: { Origin: 'https://evil.example' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(url + '/api/health', { headers: { Host: '192.168.50.99:4310' } })
    ).status(),
  ).toBe(403);
  expect((await page.request.get(url + '/api/health')).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Presentations', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      url,
      websocket: 'connected',
      originGuard: true,
      hostGuard: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
