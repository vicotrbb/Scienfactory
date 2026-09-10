import { createApp } from '../server/app';
import { defaultLimits } from '../shared/protocol';
import payload from './article-payload.json';

// Do not run until the user explicitly approves the payload described in docs/article-live-approval.md.
if (process.env.SCIENFACTORY_APPROVED_ARTICLE_TEST !== '1')
  throw new Error(
    'This live test requires explicit approval of the documented engineering payload.',
  );
if (!process.env.OPENAI_API_KEY) throw new Error('An OpenAI API key is required.');
const runtime = createApp({ root: '.data/article-live-review', port: 4316, production: true });
const research = runtime.store.create('Live IEEE article acceptance · spatial truss');
const artifacts = [];
try {
  for (const { name, sha256 } of payload) {
    const bytes = await Bun.file(`output/pdf/${name}`).bytes();
    if (new Bun.CryptoHasher('sha256').update(bytes).digest('hex') !== sha256)
      throw new Error(
        `The reviewable payload changed: ${name}. Review it before any provider call.`,
      );
    artifacts.push(
      await runtime.store.artifact(
        research.id,
        name,
        'application/octet-stream',
        bytes,
        'Approved local engineering acceptance fixture',
      ),
    );
  }
  const prompt = await Bun.file('tests/article-request.md').text();
  runtime.engine.start(
    research.id,
    prompt,
    {
      provider: 'openai',
      model: 'gpt-5-mini',
      limits: {
        ...defaultLimits,
        maxAgents: 4,
        concurrency: 3,
        maxSteps: 36,
        maxOutputTokens: 12000,
        tokenBudget: 1400000,
      },
    },
    process.env.OPENAI_API_KEY,
    artifacts.map((a) => a.id),
  );
  console.log(JSON.stringify({ researchId: research.id, started: true }));
  const started = Date.now();
  while (runtime.engine.busy(research.id)) {
    await Bun.sleep(1000);
    if (Date.now() - started > 20 * 60 * 1000) runtime.engine.cancel(research.id);
  }
  const snapshot = runtime.store.snapshot(research.id);
  console.log(
    JSON.stringify({
      researchId: research.id,
      status: snapshot.research.status,
      runs: snapshot.runs,
      files: snapshot.artifacts.map((a) => ({ id: a.id, name: a.name, sha256: a.sha256 })),
    }),
  );
  if (snapshot.research.status !== 'completed')
    throw new Error(
      'Live article workflow did not complete. Preserve and inspect its recorded failures.',
    );
  if (!snapshot.artifacts.some((a) => a.name === 'paper.pdf'))
    throw new Error('No actual PDF produced.');
} finally {
  runtime.store.close();
}
