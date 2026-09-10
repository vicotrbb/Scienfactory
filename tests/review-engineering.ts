import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1512, height: 1000 },
  colorScheme: 'light',
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5173/?research=2ac46316-c725-436b-b6f2-d7da9fbbda5e');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Lab ready', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.breadcrumbs strong')).toHaveText(
    'Engineering stress test · spatial truss design',
  );
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('button', { name: /interactive.html/ })
    .first()
    .click();
  const frame = page.frameLocator('iframe[title="interactive.html"]');
  const slider = frame.getByRole('slider');
  await expect(slider).toBeVisible();
  const results = [];
  for (const scale of ['0', '0.5', '1', '3']) {
    await slider.fill(scale);
    const points = await frame
      .locator('polyline')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('points')));
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => p && !/NaN|Infinity/.test(p))).toBe(true);
    results.push({ scale, finite: true });
  }
  await slider.fill('1');
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-interactive.png' });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('button', { name: /truss.glb/ })
    .first()
    .click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Missing 3D viewport');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 15, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-3d-final.png' });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('button', { name: /depth_vs_deflection.png/ })
    .first()
    .click();
  await expect(
    page.getByRole('img', { name: 'depth_vs_deflection.png', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-graph-final.png' });
  await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
  const presentation = page.locator('[data-canvas-id]').filter({
    has: page.getByRole('heading', {
      name: 'Corrected truss results and interactive visualization (low-load 100 N)',
      exact: true,
    }),
  });
  const modelPreview = presentation
    .locator('.canvas-preview')
    .filter({ has: page.locator('.canvas-file-label span', { hasText: 'truss.glb' }) });
  await modelPreview.scrollIntoViewIfNeeded();
  await expect(modelPreview.locator('canvas')).toBeVisible({ timeout: 20000 });
  for (const preview of await presentation.locator('.canvas-preview').all()) {
    await preview.scrollIntoViewIfNeeded();
    await expect(preview.locator('.canvas-preview-placeholder')).toHaveCount(0);
    for (const img of await preview.locator('img').all())
      await expect
        .poll(() =>
          img.evaluate(
            (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
          ),
        )
        .toBe(true);
  }
  await modelPreview.scrollIntoViewIfNeeded();
  await expect(modelPreview.locator('canvas')).toBeInViewport();
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-canvas-final.png' });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-dark-final.png' });
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      researchVisibleInMainApp: true,
      sliderTests: results,
      modelOrbit: true,
      graph: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
