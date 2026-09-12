import { expect } from 'bun:test';
import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import { comparisonCases } from './comparison-cases';
const store = new Store('.data/comparison-controls');
const research = store.create('Comparison edge cases');
const ctx: ToolContext = {
  store,
  researchId: research.id,
  agentId: 'controls',
  lab: new DockerLab(),
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
};
try {
  const study = (await executeTool(
    'run_study',
    {
      ...comparisonCases[0],
      title: 'Insufficient paired repeats',
      factors: [{ name: 'method', values: [0, 1] }],
      repeats: 2,
      requiredOutputs: [],
      code: "metrics={'rmse': float(parameters['method']) * rng.uniform(.1,.2)}",
    },
    ctx,
  )) as { artifactId: string };
  const outcomes = [];
  for (const sampling of ['randomized_repeats', 'deterministic']) {
    const r = (await executeTool(
      'compare_study',
      {
        studyArtifactId: study.artifactId,
        baselineCase: 1,
        comparisonCase: 2,
        metric: 'rmse',
        sampling,
        rationale: 'Exercise interval suppression for short and deterministic data.',
      },
      ctx,
    )) as { interval: unknown; warnings: string[] };
    expect(r.interval).toBeNull();
    expect(r.warnings.some((w) => /Fewer than six|Deterministic/.test(w))).toBe(true);
    outcomes.push(r);
  }
  const extreme = (await executeTool(
    'run_study',
    {
      ...comparisonCases[0],
      title: 'Overflow control',
      factors: [{ name: 'value', values: [-1e308, 1e308] }],
      metrics: [{ name: 'rmse', unit: '1' }],
      repeats: 1,
      requiredOutputs: [],
      code: "metrics={'rmse':parameters['value']}",
    },
    ctx,
  )) as { artifactId: string };
  await expect(
    executeTool(
      'compare_study',
      {
        studyArtifactId: extreme.artifactId,
        baselineCase: 1,
        comparisonCase: 2,
        metric: 'rmse',
        sampling: 'deterministic',
        rationale: 'Overflow must fail explicitly.',
      },
      ctx,
    ),
  ).rejects.toThrow('Comparison failed');
  const records = store
    .snapshot(research.id)
    .canvas.filter((c) => c.kind === 'experiment' && c.status === 'failed');
  expect(records.some((c) => c.output?.includes('rescale'))).toBe(true);
  await Bun.write(
    'output/comparisons/controls.json',
    JSON.stringify({ shortAndDeterministic: outcomes, overflowRejected: true }, null, 2),
  );
  console.log(JSON.stringify({ smallSample: true, deterministic: true, overflowRejected: true }));
} finally {
  store.close();
}
