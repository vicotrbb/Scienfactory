import { chromium, expect } from '@playwright/test';
import { createApp } from '../server/app';
import { resolve } from 'node:path';
import { type Snapshot } from '../shared/protocol';
import { ModelDirectory } from '../server/models';
import { applySnapshotPatch } from '../shared/state';

if (!process.env.OPENAI_API_KEY) throw new Error('An OpenAI key is required.');
const catalog = await new ModelDirectory().list('openai', process.env.OPENAI_API_KEY);
if (!catalog.models.some((m) => m.id === 'gpt-5-mini'))
  throw new Error('Test model not returned for this API project.');
console.log(
  JSON.stringify({ availableResearchModels: catalog.models.length, selected: 'gpt-5-mini' }),
);
const runtime = createApp({
  root: resolve('.data/canvas-validation'),
  port: 4314,
  production: true,
});
runtime.app.listen({ hostname: '127.0.0.1', port: 4314 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1512, height: 1000 },
  colorScheme: 'light',
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
let latest: Snapshot | undefined;
let snapshots = 0;
let sawPreparing = false;
let sawRunning = false;
let savedProgress = false;
page.on('websocket', (socket) =>
  socket.on('framereceived', (event) => {
    try {
      const data = JSON.parse(String(event.payload));
      if (data.type === 'snapshot' || (data.type === 'patch' && latest)) {
        latest = data.type === 'snapshot' ? data.data : applySnapshotPatch(latest!, data.data);
        snapshots++;
        sawPreparing ||= !!latest?.tools.some((t) => t.preparing);
        sawRunning ||= !!latest?.canvas.some((c) => c.status === 'running');
      }
    } catch {
      /* Ignore non-JSON transport frames. */
    }
  }),
);
try {
  await page.goto('http://127.0.0.1:4314');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('gpt-5-mini');
  await page.getByLabel('Total agents', { exact: true }).fill('6');
  await page.getByLabel('Parallel model calls', { exact: true }).fill('3');
  await page.getByLabel('Steps per agent', { exact: true }).fill('20');
  await page.getByLabel('Output tokens per step', { exact: true }).fill('8192');
  await page.getByLabel('Total token budget', { exact: false }).fill('350000');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page
    .getByLabel('Research question', { exact: true })
    .fill('Do me a breakthru of something related to combinatories');
  await page.getByRole('button', { name: 'Start research', exact: true }).click();
  const started = Date.now();
  let lastLog = 0;
  while (!latest?.runs.length || latest.research.status === 'running') {
    if (Date.now() - started > 480000) {
      await page.getByRole('button', { name: 'Stop research', exact: true }).click();
      throw new Error('Live research exceeded eight-minute test deadline.');
    }
    await page.waitForTimeout(1500);
    if (!savedProgress && latest?.canvas.some((c) => c.status === 'running')) {
      await page.locator('.research-progress summary').click();
      await page.screenshot({ path: '/private/tmp/scienfactory-canvas-working.png' });
      savedProgress = true;
    }
    if (latest && Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      console.log(
        JSON.stringify({
          elapsedSeconds: Math.floor((Date.now() - started) / 1000),
          status: latest.research.status,
          agents: latest.agents.map((a) => ({ name: a.name, phase: a.phase, status: a.status })),
          canvas: latest.canvas.length,
          tools: latest.tools.length,
        }),
      );
    }
  }
  await page.screenshot({ path: '/private/tmp/scienfactory-canvas-live.png' });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.screenshot({ path: '/private/tmp/scienfactory-canvas-live-dark.png' });
  const firstResponse = latest.messages.find((m) => m.role === 'assistant')?.text ?? '';
  console.log(
    JSON.stringify({
      researchId: latest.research.id,
      status: latest.research.status,
      snapshots,
      sawPreparing,
      sawRunning,
      firstResponse,
      canvas: latest.canvas.map((c) => ({ title: c.title, kind: c.kind, status: c.status })),
      tools: latest.tools.map((t) => ({ name: t.name, status: t.status })),
      usage: latest.runs.map((r) => ({
        input: r.inputTokens,
        output: r.outputTokens,
        error: r.error,
      })),
      errors,
    }),
  );
  if (
    latest.research.status !== 'completed' ||
    !latest.canvas.length ||
    !sawRunning ||
    !sawPreparing ||
    !latest.plans.length ||
    errors.length
  )
    throw new Error('Live canvas acceptance criteria not met.');
} finally {
  await browser.close();
  await runtime.shutdown();
}
