import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('parameter study progresses in the existing canvas and preserves negative controls and replay', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page
    .getByLabel('Research question', { exact: true })
    .fill('STUDY_ACCEPTANCE explore a controlled parameter study');
  await page.getByRole('button', { name: 'Start research', exact: true }).click();
  await expect(page.locator('.canvas-block.artifact.running')).toBeVisible();
  await expect(page.locator('.chat-tool.running')).toBeVisible();
  await expect(
    page.getByText('Two cases passed; one failed its declared check. The exact rerun matched.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Presentations', exact: true }).click();
  const study = page.locator('.canvas-block.artifact').filter({
    has: page.getByRole('heading', { name: 'A controlled parameter study', exact: true }).first(),
  });
  await expect(study).toHaveClass(/failed/);
  await study.locator('.canvas-preview').first().scrollIntoViewIfNeeded();
  await expect(study.getByRole('table')).toContainText('failed');
  const img = study.locator('img');
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(study).toContainText('3/3 trials finished');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.reload();
  await expect(page.locator('.chat-tool')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('button', { name: /study-.*-results.csv/ })).toBeVisible();
  expect(errors).toEqual([]);
});
