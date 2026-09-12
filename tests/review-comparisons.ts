import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const { researchId } = await Bun.file('output/comparisons/validation.json').json();
const base = process.env.LAN_TEST_URL;
if (!base) throw new Error('Set LAN_TEST_URL to the running app origin.');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1000 },
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?research=${researchId}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Presentations', exact: true }).click();
  for (const metric of ['rmse', 'cost', 'energy_drift']) {
    const block = page
      .locator('.canvas-block.artifact')
      .filter({
        has: page.locator('.canvas-block-heading', { hasText: `Paired comparison · ${metric}` }),
      })
      .first();
    await block.locator('.canvas-preview').first().scrollIntoViewIfNeeded();
    await expect(block.getByRole('table')).toBeVisible();
    await block.locator('img').first().scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        block
          .locator('img')
          .first()
          .evaluate((e) => (e as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    if (metric === 'cost')
      await page.screenshot({ path: 'docs/screenshots/comparison-optimization.png' });
  }
  const lineage = page
    .locator('.canvas-block.artifact')
    .filter({ has: page.locator('.canvas-block-heading', { hasText: 'Evidence lineage' }) })
    .last();
  await lineage.locator('.canvas-preview').last().scrollIntoViewIfNeeded();
  await lineage.locator('img').scrollIntoViewIfNeeded();
  await expect
    .poll(() => lineage.locator('img').evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/screenshots/comparison-lineage.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'docs/screenshots/comparison-lineage-dark.png' });
  await page.reload();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      url: base,
      researchId,
      comparisons: 3,
      lineage: true,
      reload: true,
      mobile: true,
      accessibility: 'light and dark passed',
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
