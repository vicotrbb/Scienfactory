import { ResearchEngine } from '../server/engine';
import { DockerLab } from '../server/lab';
import { Store } from '../server/store';
import { defaultLimits } from '../shared/protocol';
import { resolve } from 'node:path';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
const store = new Store(resolve('.data/live-validation'));
const research = store.create('Live validation: reproducible mean and Lean identity');
const engine = new ResearchEngine(
  store,
  new DockerLab(),
  () => {},
  () => {},
);
engine.start(
  research.id,
  'Perform this bounded integration investigation. First use research_search once for bootstrap confidence intervals. Then delegate exactly two independent tasks: (1) use Python to calculate the mean of [1,2,3,4,5] and save a small bar chart in artifacts/mean.png; (2) use Lean with import Std to prove theorem identity (n : Nat) : n + 0 = n := by simp, and use #print axioms identity. After both finish, write a concise validation-report.md listing actual tool outcomes, the retrieved source, and limitations. Do not perform further searches or experiments.',
  {
    provider: 'openai',
    model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    limits: {
      ...defaultLimits,
      maxAgents: 3,
      concurrency: 2,
      maxSteps: 8,
      tokenBudget: 180000,
      maxOutputTokens: 4096,
    },
  },
  process.env.OPENAI_API_KEY,
);
const timeout = setTimeout(() => engine.cancel(research.id), 300000);
let last = 0;
while (engine.busy(research.id)) {
  await Bun.sleep(1000);
  const snapshot = store.snapshot(research.id);
  if (snapshot.activity.length !== last) {
    last = snapshot.activity.length;
    console.log(
      JSON.stringify({
        agents: snapshot.agents.map((a) => ({ name: a.name, status: a.status })),
        artifacts: snapshot.artifacts.length,
        sources: snapshot.sources.length,
        lastActivity: snapshot.activity.at(-1)?.type,
      }),
    );
  }
}
clearTimeout(timeout);
const result = store.snapshot(research.id);
console.log(
  JSON.stringify({
    researchId: research.id,
    status: result.research.status,
    agents: result.agents.length,
    artifacts: result.artifacts.map((a) => ({ name: a.name, sha256: a.sha256 })),
    sources: result.sources.length,
    tokens: result.runs.map((r) => ({
      input: r.inputTokens,
      output: r.outputTokens,
      error: r.error,
    })),
  }),
);
store.close();
if (
  result.research.status !== 'completed' ||
  result.agents.length !== 3 ||
  !result.artifacts.some((a) => a.name === 'validation-report.md')
)
  throw new Error('Live research acceptance criteria not met.');
