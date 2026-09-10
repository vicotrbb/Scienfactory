import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('complete research workflow, evidence preview, reload, and export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Let’s investigate.' })).toBeVisible();
  await page
    .getByLabel('Research question', { exact: true })
    .fill('Explain bootstrap uncertainty in a report');
  await page.getByRole('button', { name: 'Start research', exact: true }).click();
  await expect(page.getByText('The test report is ready in your workbench.')).toBeVisible();
  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByRole('button', { name: /integration-report.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Integration test report' })).toBeVisible();
  await expect(page.locator('.katex')).toBeVisible();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByLabel('Artifact source')).toContainText(
    'deterministic browser-test fixture',
  );
  await page.getByLabel('Artifact source').fill('# Edited report\n\nA preserved new version.');
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.getByRole('heading', { name: 'Edited report' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('The test report is ready in your workbench.')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export research', exact: true }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toContain('scienfactory.json');
  expect(errors).toEqual([]);
});
test('light and dark accessibility; keyboard panels and theme persistence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const light = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(dark.violations).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('separator', { name: 'Resize workspace panels' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '46');
  await page.getByRole('button', { name: 'Collapse workbench', exact: true }).click();
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Canvas', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('BYOK settings, upload, manual lab, and narrow viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Total agents', { exact: true }).fill('128');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Upload files').setInputFiles({
    name: 'dataset.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('x,y\n1,2\n3,4'),
  });
  await expect(page.locator('.toast')).toContainText('file added');
  await page.getByRole('tab', { name: 'Lab', exact: true }).click();
  await page.getByLabel('Experiment code').fill('print(42)');
  await page.getByRole('button', { name: 'Run experiment' }).click();
  await expect(page.locator('.canvas-output pre')).toContainText('42');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Lab', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByLabel('Research question', { exact: true })).toBeVisible();
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(mobile.violations).toEqual([]);
});
