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
  await page.goto('http://127.0.0.1:5173/?research=0ed09bd3-9f00-41c7-a31d-23a5f78735fd');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.locator('.breadcrumbs strong')).toHaveText(
    'IEEE article · verified spatial truss study',
  );
  await page.getByRole('button', { name: 'Presentations', exact: true }).click();
  const paper = page
    .locator('.canvas-preview.application-pdf')
    .filter({ has: page.locator('.canvas-file-label', { hasText: 'paper.pdf' }) });
  await paper.scrollIntoViewIfNeeded();
  await expect(paper.locator('canvas')).toBeVisible();
  await expect(paper.locator('.paper-render-status')).toBeEmpty();
  await page.screenshot({ path: 'docs/screenshots/article-canvas-light.png' });
  await paper.getByRole('button', { name: 'Expand paper.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.paper-render-status')).toBeEmpty();
  await expect(dialog.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/article-focus-light.png' });
  await dialog.getByLabel('Next PDF page').click();
  await expect(
    dialog.getByRole('img', { name: 'paper.pdf, page 2 of 2', exact: true }),
  ).toBeVisible();
  await expect(dialog.locator('.paper-render-status')).toBeEmpty();
  await page.screenshot({ path: 'docs/screenshots/article-page-two.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  const model = page.locator('.canvas-preview.model-gltf-binary');
  await model.scrollIntoViewIfNeeded();
  await expect(model.locator('canvas')).toBeVisible();
  const box = await model.locator('canvas').boundingBox();
  if (!box) throw new Error('Missing 3D surface');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({ path: 'docs/screenshots/article-canvas-model.png' });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await paper.scrollIntoViewIfNeeded();
  await expect(paper.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/article-canvas-dark.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      mainApp: true,
      pdfPages: 2,
      canvasFocus: true,
      modelInteraction: true,
      accessibility: 'light and dark passed',
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
