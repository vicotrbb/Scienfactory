import { createApp } from '../server/app';
import { chromium, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runtime = createApp({
  root: mkdtempSync(join(tmpdir(), 'scienfactory-publishing-browser-')),
  port: 4317,
  production: true,
  keys: { openai: '', anthropic: '' },
});
runtime.app.listen({ port: 4317, hostname: '127.0.0.1' });
const research = runtime.store.create('Local document buttons acceptance');
for (const name of ['truss-study.tex', 'references.bib', 'depth-tradeoff.pdf'])
  await runtime.store.artifact(
    research.id,
    name,
    'application/octet-stream',
    await Bun.file(`output/pdf/${name}`).bytes(),
    'Local acceptance fixture',
  );
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
try {
  await page.goto(`http://127.0.0.1:4317/?research=${research.id}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Lab ready', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('tabpanel', { name: 'files panel' })
    .getByRole('button', { name: /truss-study.tex/ })
    .click();
  await page.getByRole('button', { name: 'Compile PDF', exact: true }).click();
  await expect
    .poll(
      () =>
        runtime.store.snapshot(research.id).artifacts.filter((a) => a.name === 'article-build.json')
          .length,
      { timeout: 60000 },
    )
    .toBe(1);
  expect(runtime.store.snapshot(research.id).research.status).toBe('completed');
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('tabpanel', { name: 'files panel' })
    .getByRole('button', { name: /^paper.pdf / })
    .click();
  await expect(
    page.getByRole('img', { name: 'paper.pdf, page 1 of 2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect
    .poll(
      () =>
        runtime.store.snapshot(research.id).artifacts.filter((a) => a.name === 'inspection.json')
          .length,
      { timeout: 60000 },
    )
    .toBe(1);
  const a = runtime.store
    .snapshot(research.id)
    .artifacts.find((a) => a.name === 'inspection.json')!;
  const report = JSON.parse(
    Buffer.from((await runtime.store.readArtifact(research.id, a.id)).data, 'base64').toString(),
  );
  expect(report.status).toBe('inspected');
  expect(report.text).toContain('Cantilever');
  console.log(
    JSON.stringify({
      compileButton: true,
      realPdfPages: 2,
      inspectButton: true,
      inspectionStatus: report.status,
      externalModelCalls: 0,
    }),
  );
} finally {
  await browser.close();
  await runtime.shutdown();
}
