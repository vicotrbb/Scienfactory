import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:5173');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Lab ready', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Lab', exact: true }).click();
  await page.getByRole('button', { name: 'Run experiment' }).click();
  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByRole('button', { name: /bootstrap.png/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /bootstrap.png/ }).click();
  const plot = page.getByRole('img', { name: 'bootstrap.png', exact: true });
  await expect(plot).toBeVisible();
  await expect
    .poll(() => plot.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(1000);
  await page.screenshot({ path: '/private/tmp/scienfactory-experiment.png' });
  await page.getByRole('tab', { name: 'Lab', exact: true }).click();
  await page.getByLabel('Execution language').selectOption('blender');
  await page.getByRole('button', { name: 'Run experiment' }).click();
  await expect(page.locator('.canvas-block.experiment').last()).toHaveClass(/completed/, {
    timeout: 30000,
  });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByRole('button', { name: /helix.glb/ }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: '/private/tmp/scienfactory-model.png' });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.screenshot({ path: '/private/tmp/scienfactory-model-dark.png' });
  console.log(
    JSON.stringify({
      realDocker: true,
      pythonChart: true,
      blenderGLB: true,
      preview: true,
      errors,
    }),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
