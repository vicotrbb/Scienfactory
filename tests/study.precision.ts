import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import { RESEARCH_GUIDE } from '../server/experiments/guide';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'bun:test';
const store = new Store(mkdtempSync(join(tmpdir(), 'science-precision-')));
const ctx: ToolContext = {
  store,
  lab: new DockerLab(),
  researchId: store.create('Metric precision controls').id,
  agentId: 'precision-test',
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
};
try {
  const result = (await executeTool(
    'run_study',
    {
      ...RESEARCH_GUIDE.recipe,
      title: 'Numerical representation controls',
      factors: [{ name: 'kind', values: ['numpy', 'unsafe_integer'] }],
      metrics: [
        {
          name: 'value',
          unit: '1',
          rationale: 'Preserve numerical meaning and reject silent integer rounding.',
        },
      ],
      code: "metrics = {'value': np.int64(42) if parameters['kind']=='numpy' else 2**60+1}",
    },
    ctx,
  )) as { trials: { status: string; error?: string; metrics?: { value: number } }[] };
  expect(result.trials.map((t) => t.status)).toEqual(['passed', 'failed']);
  expect(result.trials[0]!.metrics!.value).toBe(42);
  console.log(JSON.stringify({ numpyScalars: true, unsafeIntegerRejected: true }));
} finally {
  store.close();
}
