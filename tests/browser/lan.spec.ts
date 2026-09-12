import { test, expect } from '@playwright/test';
test('research commands and response copying work without secure-context browser APIs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page
    .getByLabel('Research question', { exact: true })
    .fill('LAN browser compatibility check');
  await page.getByRole('button', { name: 'Start research', exact: true }).click();
  await expect(
    page.getByText('The test report is ready in your workbench.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Copy response', exact: true }).last().click();
  await expect(page.getByText('Response copied', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('The test report is ready in your workbench.', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
