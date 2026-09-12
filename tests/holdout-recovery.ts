import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import { expect } from 'bun:test';
import type { Trial } from '../server/experiments/study';
const { root, researchId } = await Bun.file('output/science/live-validation.json').json();
const original = (await Bun.file('output/science/holdout-validation.json').json()).studies[0];
const store = new Store(root);
const ctx: ToolContext = {
  store,
  researchId,
  lab: new DockerLab(),
  agentId: 'independent-validation',
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
};
try {
  const protocol = JSON.parse(
    Buffer.from(
      (await store.readArtifact(researchId, original.protocolArtifactId)).data,
      'base64',
    ).toString(),
  );
  expect(protocol.code).toContain('df.to_csv(csv_name, index=False)');
  // Preserve the agent's solver and metrics exactly; fix only the output path and require its data.
  const code = protocol.code.replace(
    'df.to_csv(csv_name, index=False)',
    "df.to_csv('artifacts/' + csv_name, index=False)\n    df.to_csv('artifacts/trajectory.csv', index=False)",
  );
  const result = (await executeTool(
    'run_study',
    {
      ...protocol,
      title: 'Holdout audit · recovered trajectories',
      code,
      requiredOutputs: ['trajectory.csv'],
      limitations:
        protocol.limitations +
        ' This is a local audit rerun of the original holdout, with the CSV output path repaired. It is not a new holdout or additional independent sample.',
    },
    ctx,
  )) as { status: string; trials: Trial[] };
  expect(result.status).toBe('completed');
  expect(result.trials).toHaveLength(8);
  for (let i = 0; i < 8; i++) expect(result.trials[i]!.metrics).toEqual(original.trials[i].metrics);
  await Bun.write(
    'output/science/holdout-recovery.json',
    JSON.stringify({ researchId, ...result }, null, 2),
  );
  console.log(
    JSON.stringify({
      recoveredTrajectories: 8,
      originalMetrics: 'identical',
      status: result.status,
    }),
  );
} finally {
  store.close();
}
