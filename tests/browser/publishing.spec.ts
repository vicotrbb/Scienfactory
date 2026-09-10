import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('IEEE PDF renders real pages, supports zoom and text, survives theme changes and mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByLabel('Upload files').setInputFiles('tests/fixtures/ieee-truss.pdf');
  await expect(page.getByLabel('Remove attachment ieee-truss.pdf')).toBeVisible();
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('tabpanel', { name: 'files panel' })
    .getByRole('button', { name: /ieee-truss.pdf/ })
    .click();
  await expect(
    page.getByRole('img', { name: 'ieee-truss.pdf, page 1 of 2', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.paper-render-status')).toBeEmpty();
  const initial = await page
    .locator('.paper-viewport canvas')
    .evaluate((c) => c.getBoundingClientRect().width);
  await page.getByLabel('Zoom in PDF').click();
  await expect
    .poll(() =>
      page.locator('.paper-viewport canvas').evaluate((c) => c.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initial);
  await page.getByLabel('Fit PDF to width').click();
  await page.getByLabel('Show PDF text').click();
  await expect(page.locator('.paper-accessible-text')).toContainText('Cantilever');
  await page.getByLabel('Next PDF page').click();
  await expect(page.locator('.paper-accessible-text')).toContainText(/R\s*EFERENCES/);
  await expect(page.getByLabel('Next PDF page')).toBeDisabled();
  await page.getByLabel('Show PDF text').click();
  await expect(page.locator('.paper-render-status')).toBeEmpty();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await expect(page.locator('.paper-viewport canvas')).toBeVisible();
  await expect(page.locator('.paper-render-status')).toBeEmpty();
  await expect
    .poll(() =>
      page.locator('.paper-viewport canvas').evaluate((c) => {
        const r = c.getBoundingClientRect();
        const p = c.parentElement!.getBoundingClientRect();
        return r.left >= p.left && r.right <= p.right;
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/scienfactory-paper-mobile.png' });
  expect(errors).toEqual([]);
});

test('unreadable PDF displays an actionable error without breaking the workspace', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByLabel('Upload files').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-invalid'),
  });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('tabpanel', { name: 'files panel' })
    .getByRole('button', { name: /broken.pdf/ })
    .click();
  await expect(page.locator('.paper-error')).toContainText(/Invalid PDF/i);
  await expect(page.getByLabel('Download artifact')).toBeEnabled();
});
