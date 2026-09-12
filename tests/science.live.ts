import { createApp } from '../server/app';
import { defaultLimits } from '../shared/protocol';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
if (!process.env.OPENAI_API_KEY) throw new Error('Configured OpenAI API key required.');
mkdirSync('.data', { recursive: true });
const root = mkdtempSync(join('.data', 'science-live-'));
const runtime = createApp({ root, port: 4318, production: true });
const research = runtime.store.create('Live research · damped oscillator solver comparison');
const prompt = await Bun.file('tests/science-request.md').text();
const started = Date.now();
try {
  runtime.engine.start(
    research.id,
    prompt,
    {
      provider: 'openai',
      model: 'gpt-5-mini',
      limits: {
        ...defaultLimits,
        maxAgents: 2,
        concurrency: 2,
        maxSteps: 16,
        maxOutputTokens: 8192,
        tokenBudget: 400000,
      },
    },
    process.env.OPENAI_API_KEY,
  );
  console.log(
    JSON.stringify({ started: true, researchId: research.id, root, initialAttachments: 0 }),
  );
  let last = 0;
  while (runtime.engine.busy(research.id)) {
    await Bun.sleep(1000);
    if (Date.now() - started > 12 * 60 * 1000) runtime.engine.cancel(research.id);
    if (Date.now() - last > 15000) {
      last = Date.now();
      const s = runtime.store.snapshot(research.id);
      console.log(
        JSON.stringify({
          elapsedSeconds: Math.round((Date.now() - started) / 1000),
          agents: s.agents.map((a) => ({ name: a.name, status: a.status, tool: a.currentTool })),
          files: s.artifacts.length,
        }),
      );
    }
  }
  const s = runtime.store.snapshot(research.id);
  const studies = [];
  for (const a of s.artifacts.filter(
    (a) => a.name.endsWith('-results.json') && a.provenance.startsWith('Study outcomes'),
  ))
    studies.push(
      JSON.parse(
        Buffer.from(
          (await runtime.store.readArtifact(research.id, a.id)).data,
          'base64',
        ).toString(),
      ),
    );
  const replays = [];
  for (const a of s.artifacts.filter(
    (a) => a.provenance === 'Reproduction audit of actual execution records',
  ))
    replays.push(
      JSON.parse(
        Buffer.from(
          (await runtime.store.readArtifact(research.id, a.id)).data,
          'base64',
        ).toString(),
      ),
    );
  const result = {
    researchId: research.id,
    root,
    status: s.research.status,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    runs: s.runs,
    studies: studies.map((s) => ({
      status: s.status,
      trials: s.trials.length,
      failed: s.trials.filter((t: { status: string }) => t.status !== 'passed').length,
    })),
    replays: replays.map((r) => r.status),
    files: s.artifacts.map((a) => ({ id: a.id, name: a.name })),
  };
  mkdirSync('output/science', { recursive: true });
  await Bun.write('output/science/live-validation.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (
    s.research.status !== 'completed' ||
    !studies.some((s) => s.status === 'completed' && s.trials.length === 12) ||
    !replays.some((r) => r.status === 'matched')
  )
    throw new Error(
      'Live research did not satisfy the declared study/reproduction acceptance checks. Inspect retained evidence.',
    );
} finally {
  runtime.close();
}
