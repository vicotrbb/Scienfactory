import { createApp } from '../server/app';
import { defaultLimits } from '../shared/protocol';
const { root, researchId: id } = (await Bun.file('output/science/live-validation.json').json()) as {
  root: string;
  researchId: string;
};
if (!process.env.OPENAI_API_KEY) throw new Error('Approved app key required.');
const runtime = createApp({ root, port: 4318, production: true });
const started = Date.now();
try {
  runtime.engine.start(
    id,
    await Bun.file('tests/science-followup.md').text(),
    {
      provider: 'openai',
      model: 'gpt-5-mini',
      limits: {
        ...defaultLimits,
        maxAgents: 2,
        concurrency: 2,
        maxSteps: 12,
        maxOutputTokens: 8192,
        tokenBudget: 400000,
      },
    },
    process.env.OPENAI_API_KEY,
  );
  let last = 0;
  while (runtime.engine.busy(id)) {
    await Bun.sleep(1000);
    if (Date.now() - started > 12 * 60 * 1000) runtime.engine.cancel(id);
    if (Date.now() - last > 15000) {
      last = Date.now();
      console.log(
        JSON.stringify({
          elapsedSeconds: Math.round((Date.now() - started) / 1000),
          files: runtime.store.snapshot(id).artifacts.length,
        }),
      );
    }
  }
  const s = runtime.store.snapshot(id);
  const results = [];
  for (const a of s.artifacts.filter(
    (a) => a.name.endsWith('-results.json') && a.createdAt >= started,
  ))
    results.push(
      JSON.parse(
        Buffer.from((await runtime.store.readArtifact(id, a.id)).data, 'base64').toString(),
      ),
    );
  const record = {
    researchId: id,
    root,
    status: s.research.status,
    studies: results,
    runs: s.runs,
  };
  await Bun.write('output/science/holdout-validation.json', JSON.stringify(record, null, 2));
  console.log(
    JSON.stringify({
      researchId: id,
      status: s.research.status,
      trials: results.map((r) => ({ status: r.status, count: r.trials.length })),
      tokens: s.runs.at(-1),
    }),
  );
  if (
    s.research.status !== 'completed' ||
    !results.some((r) => r.status === 'completed' && r.trials.length === 8)
  )
    throw new Error('Holdout acceptance failed; inspect preserved results.');
} finally {
  runtime.close();
}
