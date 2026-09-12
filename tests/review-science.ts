import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1512, height: 1000 },
  colorScheme: 'light',
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  const { researchId } = await Bun.file('output/science/validation.json').json();
  await page.goto(`http://127.0.0.1:5173/?research=${researchId}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Presentations', exact: true }).click();
  for (const title of [
    'Heat equation · numerical convergence',
    'Graph theory · independent tree counts',
    'Statistics · robustness and interval calibration',
  ]) {
    const block = page
      .locator('.canvas-block.artifact')
      .filter({ has: page.locator('.canvas-block-heading', { hasText: title }) });
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
  }
  await page.screenshot({ path: 'docs/screenshots/study-statistics-light.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.screenshot({ path: 'docs/screenshots/study-statistics-dark.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const model = page.locator('.canvas-preview.model-gltf-binary');
  await model.scrollIntoViewIfNeeded();
  await expect(model.locator('canvas')).toBeVisible();
  const box = await model.locator('canvas').boundingBox();
  if (!box) throw new Error('Missing 3D viewport');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: 'docs/screenshots/study-heat-3d.png' });
  const live = await Bun.file('output/science/live-validation.json').json();
  await page.goto(`http://127.0.0.1:5173/?research=${live.researchId}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Presentations', exact: true }).click();
  const audit = page.locator('.canvas-block.artifact').filter({
    has: page.locator('.canvas-block-heading', {
      hasText: 'Damped oscillator · independently checked evidence',
    }),
  });
  await audit.locator('.canvas-preview').first().scrollIntoViewIfNeeded();
  await expect(audit.getByRole('table')).toBeVisible();
  await expect(audit.locator('.katex').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/study-oscillator-audit.png' });
  await audit.locator('img').first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      audit
        .locator('img')
        .first()
        .evaluate((e) => (e as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/screenshots/study-oscillator-phase.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      subjects: 3,
      threeD: true,
      mobile: true,
      accessibility: 'light and dark passed',
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
