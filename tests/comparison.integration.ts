import { expect } from 'bun:test';
import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import { comparisonCases } from './comparison-cases';
import type { Trial } from '../server/experiments/study';
import { mkdirSync } from 'node:fs';
const root = '.data/comparison-validation';
const store = new Store(root);
const research = store.create('Research comparisons · signals, optimization and mechanics');
const ctx: ToolContext = {
  store,
  researchId: research.id,
  agentId: 'local-validation',
  lab: new DockerLab(),
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
};
const summaries = [];
try {
  store.message(
    research.id,
    'user',
    'Local science acceptance: compare three methods across paired synthetic seeds and trace their evidence. Authored experiment code runs in real isolated containers; no provider calls.',
  );
  for (const spec of comparisonCases) {
    console.log(`Starting ${spec.title}`);
    const study = (await executeTool('run_study', spec, ctx)) as {
      status: string;
      artifactId: string;
      trials: Trial[];
    };
    expect(study.status).toBe('completed');
    expect(study.trials).toHaveLength(16);
    const comparison = (await executeTool(
      'compare_study',
      {
        studyArtifactId: study.artifactId,
        metric: spec.metrics[0]!.name,
        baselineCase: 1,
        comparisonCase: 2,
        sampling: 'randomized_repeats',
        rationale:
          'Each repeat uses a fresh synthetic random input; the same seed pairs the two methods. Eight repeats support exploratory computational comparisons only.',
      },
      ctx,
    )) as {
      meanDifference: number;
      interval: number[] | null;
      artifactId: string;
      executionRecordId: string;
      pairs: number;
    };
    expect(comparison.meanDifference).toBeLessThan(0);
    expect(comparison.pairs).toBe(8);
    expect(comparison.interval).not.toBeNull();
    expect(comparison.interval![0]).toBeLessThanOrEqual(comparison.meanDifference);
    expect(comparison.interval![1]).toBeLessThan(0);
    const direct = study.trials
      .filter((t) => t.case === 2)
      .map(
        (t, i) =>
          t.metrics![spec.metrics[0]!.name]! -
          study.trials.filter((t) => t.case === 1)[i]!.metrics![spec.metrics[0]!.name]!,
      );
    expect(
      Math.abs(direct.reduce((a, b) => a + b, 0) / 8 - comparison.meanDifference),
    ).toBeLessThan(1e-10);
    if (spec.title.startsWith('Optimization'))
      expect(
        study.trials.filter((t) => t.case === 2).every((t) => t.metrics!.optimality_gap === 0),
      ).toBe(true);
    const replay = (await executeTool(
      'reproduce_execution',
      { executionRecordId: comparison.executionRecordId, title: 'Reproduce paired comparison' },
      ctx,
    )) as { status: string };
    expect(replay.status).toBe('matched');
    const output = study.trials[8]!.artifacts!.find((a) => a.name === 'observations.csv')!;
    const visual = (await executeTool(
      'execute',
      {
        title: `Inspect ${spec.title}`,
        language: 'python',
        inputArtifactIds: [output.id],
        code: spec.title.startsWith('Signal')
          ? `import pandas as pd, matplotlib.pyplot as plt
d=pd.read_csv('inputs/observations.csv').iloc[:256]
fig,ax=plt.subplots(figsize=(9,4),layout='constrained');ax.plot(d.time,d.noisy,color='.75',lw=.8,label='Noisy input');ax.plot(d.time,d.truth,color='#315c45',label='Known signal');ax.plot(d.time,d.filtered,color='#875532',label='Savitzky-Golay');ax.set(xlabel='Time (s)',ylabel='Amplitude',title='Synthetic waveform recovery');ax.legend();fig.savefig('artifacts/diagnostic.png',dpi=140)`
          : spec.title.startsWith('Optimization')
            ? `import pandas as pd, matplotlib.pyplot as plt
from scipy.optimize import linear_sum_assignment
c=pd.read_csv('inputs/observations.csv').to_numpy();r,k=linear_sum_assignment(c)
fig,ax=plt.subplots(figsize=(6,5),layout='constrained');im=ax.imshow(c,cmap='viridis');ax.scatter(k,r,facecolors='none',edgecolors='white',s=200);ax.set(xlabel='Task',ylabel='Worker',title='Optimal one-to-one assignment');fig.colorbar(im,ax=ax,label='Cost');fig.savefig('artifacts/diagnostic.png',dpi=140)`
            : `import pandas as pd, matplotlib.pyplot as plt
d=pd.read_csv('inputs/observations.csv')
fig,(a,b)=plt.subplots(1,2,figsize=(9,4),layout='constrained');a.plot(d.x,d.v,color='#315c45');a.set(xlabel='Displacement',ylabel='Velocity',title='Verlet phase orbit');a.set_aspect('equal');b.plot(d.time,d.energy-.5,color='#315c45');b.set(xlabel='Time',ylabel='Energy minus initial',title='Bounded energy variation');fig.savefig('artifacts/diagnostic.png',dpi=140)`,
      },
      ctx,
    )) as { exitCode: number; artifacts: { id: string }[] };
    expect(visual.exitCode).toBe(0);
    const lineage = (await executeTool(
      'trace_artifact',
      { artifactId: visual.artifacts[0]!.id },
      ctx,
    )) as { status: string; nodes: unknown[]; edges: unknown[] };
    expect(lineage.status).toBe('traced');
    expect(lineage.nodes).toHaveLength(4);
    expect(lineage.edges).toHaveLength(3);
    summaries.push({
      title: spec.title,
      trials: 16,
      ...comparison,
      lineageNodes: lineage.nodes.length,
      replay: replay.status,
    });
    console.log(JSON.stringify(summaries.at(-1)));
  }
  const control = (await executeTool(
    'run_study',
    {
      ...comparisonCases[0],
      title: 'Constant-effect control',
      factors: [{ name: 'value', values: [1, 2] }],
      requiredOutputs: [],
      code: "metrics={'rmse':float(parameters['value'])}",
    },
    ctx,
  )) as { artifactId: string };
  const degenerate = (await executeTool(
    'compare_study',
    {
      studyArtifactId: control.artifactId,
      metric: 'rmse',
      baselineCase: 1,
      comparisonCase: 2,
      sampling: 'randomized_repeats',
      rationale: 'Degenerate control; equal paired differences must not imply zero uncertainty.',
    },
    ctx,
  )) as { interval: unknown; failedChecksIncluded: number };
  expect(degenerate.interval).toBeNull();
  expect(degenerate.failedChecksIncluded).toBe(8);
  store.put('research', { ...research, status: 'completed', updatedAt: Date.now() });
  store.message(
    research.id,
    'assistant',
    'Completed 48 scientific trials across signal processing, assignment optimization and oscillator mechanics, with three paired comparisons, exact comparison replays, diagnostic figures and source/input lineage. A 16-trial constant-effect control correctly withheld an uncertainty interval and retained all eight failed-bound outcomes. These are local synthetic checks, not claims of scientific novelty.',
  );
  mkdirSync('output/comparisons', { recursive: true });
  await Bun.write(
    'output/comparisons/validation.json',
    JSON.stringify({ root, researchId: research.id, summaries, degenerate }, null, 2),
  );
  console.log(
    JSON.stringify({ researchId: research.id, trials: 48, controlTrials: 16, status: 'passed' }),
  );
} finally {
  store.close();
}
