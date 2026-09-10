import { expect, test } from '@playwright/test';

test('256 agents stream through the real WebSocket UI and remain inspectable', async ({ page }) => {
  let bytes = 0,
    patches = 0;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('websocket', (socket) =>
    socket.on('framereceived', (event) => {
      bytes += String(event.payload).length;
      try {
        if (JSON.parse(String(event.payload)).type === 'patch') patches++;
      } catch {}
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Total agents', { exact: true }).fill('256');
  await page.getByLabel('Parallel model calls', { exact: true }).fill('8');
  await page.getByLabel('Total token budget', { exact: false }).fill('2000000');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page
    .getByLabel('Research question', { exact: true })
    .fill('LOAD_ACCEPTANCE inspect all 256 cases');
  await page.getByRole('button', { name: 'Start research', exact: true }).click();
  await expect(
    page.getByText('All 256 researchers joined successfully.', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /^Agents/ }).click();
  await expect(page.locator('.agent-row')).toHaveCount(256);
  await expect(page.locator('.agent-row .state-label.completed')).toHaveCount(256);
  expect(patches).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(8 * 1024 * 1024);
  await page.reload();
  await expect(
    page.getByText('All 256 researchers joined successfully.', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ team: 256, patches, receivedBytes: bytes }));
});
