import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import { expect } from 'bun:test';
const holdout = process.argv.includes('--holdout');
const prefix = holdout ? 'heldout_trajectory' : 'trajectory';
const expected = holdout ? 8 : 12;
const state = (await Bun.file('output/science/live-validation.json').json()) as {
  root: string;
  researchId: string;
};
const store = new Store(state.root);
const researchId = state.researchId;
const ctx: ToolContext = {
  store,
  lab: new DockerLab(),
  researchId,
  agentId: 'independent-validation',
  signal: new AbortController().signal,
  log: () => {},
  changed: () => {},
  delegate: async () => [],
};
try {
  const versions = new Map<string, string>();
  for (const a of store.snapshot(researchId).artifacts)
    if (a.name.startsWith(prefix) && a.name.endsWith('.csv')) versions.set(a.name, a.id);
  const ids = [...versions.values()];
  expect(ids).toHaveLength(expected);
  const results = [];
  for (let i = 0; i < ids.length; i += 6) {
    const result = (await executeTool(
      'execute',
      {
        title: `Independent closed-form trajectory check ${i / 6 + 1}`,
        language: 'python',
        code: await Bun.file('tests/oscillator-verify.py').text(),
        inputArtifactIds: ids.slice(i, i + 6),
      },
      ctx,
    )) as { exitCode: number; executionRecordId: string; stdout: string };
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveLength(ids.slice(i, i + 6).length);
    results.push(result);
  }
  await Bun.write(
    `output/science/independent-${holdout ? 'holdout' : 'oscillator'}.json`,
    JSON.stringify({ researchId, verifiedTrajectories: expected, records: results }, null, 2),
  );
  console.log(
    JSON.stringify({
      verifiedTrajectories: expected,
      executionRecords: results.map((r) => r.executionRecordId),
    }),
  );
} finally {
  store.close();
}
