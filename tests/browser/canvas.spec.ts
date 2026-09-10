import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('agent canvas streams preparation and execution, supports interaction, and survives reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.locator('.starter-list')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Canvas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const models = page.getByRole('combobox', { name: 'Research model', exact: true });
  await expect(models).toBeEnabled();
  await models.selectOption('gpt-5');
  await expect(models).toHaveValue('gpt-5');
  await page
    .getByLabel('Research question', { exact: true })
    .fill('CANVAS_ACCEPTANCE investigate a spiral');
  await page.getByRole('button', { name: 'Start research', exact: true }).click();
  await expect(page.locator('.canvas-block.preparing')).toBeVisible();
  await expect(page.locator('.draft-source')).toContainText('print(');
  await expect(page.locator('.canvas-block.experiment.running')).toBeVisible();
  await expect(page.locator('.canvas-output pre')).toContainText('42');
  await expect(page.locator('.chat-tool.running')).toBeVisible();
  await page.locator('.research-progress summary').click();
  await expect(page.getByRole('list', { name: 'Research plan' })).toContainText(
    'Construct an interactive spiral',
  );
  await expect(
    page.getByText('The visual and numerical checks are complete.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.canvas-block')).toHaveCount(2);
  await expect(page.locator('.plan-steps .complete')).toHaveCount(2);
  const frame = page.frameLocator('iframe[title="Interactive spiral.html"]');
  await expect(frame.getByRole('heading', { name: 'Spiral explorer' })).toBeVisible();
  await expect(frame.getByText('Numerical check complete: 42.')).toBeVisible();
  await frame.getByLabel('Turns').fill('9');
  await expect(frame.locator('output')).toHaveText('9');
  await page.getByRole('button', { name: 'Presentations', exact: true }).click();
  await expect(page.locator('.canvas-block')).toHaveCount(1);
  await page.getByRole('button', { name: 'Expand Interactive spiral.html', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('iframe')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.canvas-block')).toHaveCount(2);
  await page.getByRole('button', { name: 'Explore freely', exact: true }).click();
  await page.getByRole('button', { name: 'Following agent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore freely', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.screenshot({ path: '/private/tmp/scienfactory-canvas-fixture.png' });
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
  await expect(page.locator('.canvas-block')).toHaveCount(2);
  await expect(page.locator('.chat-tool')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Files', exact: false }).click();
  await expect(page.getByRole('button', { name: /Interactive spiral.html/ })).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/scienfactory-canvas-mobile.png' });
  expect(errors).toEqual([]);
});
