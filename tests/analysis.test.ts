import { test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { executeTool, type ToolContext } from '../server/toolkit';
import { RESEARCH_GUIDE } from '../server/experiments/guide';
import { accessPolicy } from '../server/network';
import type { Trial } from '../server/experiments/study';
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) {
    s.close();
    rmSync(s.root, { recursive: true, force: true });
  }
});
function context(): ToolContext {
  const store = new Store(mkdtempSync(join(tmpdir(), 'science-analysis-')));
  stores.push(store);
  return {
    store,
    researchId: store.create('Analysis').id,
    agentId: 'test',
    signal: new AbortController().signal,
    changed: () => {},
    log: () => {},
    delegate: async () => [],
    lab: {
      capabilities: async () => ({ docker: true, image: true, detail: 'fixture' }),
      execute: async (request) => ({
        environment: { imageId: 'sha256:' + 'a'.repeat(64), platform: 'linux/arm64' },
        exitCode: 0,
        stdout: 'stable',
        durationMs: 1,
        artifacts:
          request.language === 'graphviz'
            ? [file('figure.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')]
            : request.code.includes('BCa')
              ? [
                  file('comparison.md', '# Comparison', 'text/markdown'),
                  file('comparison.json', '{}', 'application/json'),
                  file('comparison.png', 'fixture', 'image/png'),
                ]
              : [
                  file(
                    'study-metrics.json',
                    JSON.stringify({
                      absolute_error: request.code.includes('Study case 2, repeat') ? 2 : 0.001,
                    }),
                    'application/json',
                  ),
                ],
      }),
    },
  };
}
const file = (name: string, data: string, mime: string) => ({
  name,
  mime,
  data: Buffer.from(data).toString('base64'),
});
async function study(ctx: ToolContext) {
  return (await executeTool(
    'run_study',
    { ...RESEARCH_GUIDE.recipe, factors: [{ name: 'method', values: [0, 1] }], repeats: 3 },
    ctx,
  )) as { artifactId: string; trials: Trial[] };
}
const request = (id: string) => ({
  studyArtifactId: id,
  metric: 'absolute_error',
  baselineCase: 1,
  comparisonCase: 2,
  sampling: 'deterministic',
  rationale: 'Controlled fixture',
});
test('comparison pairs all seeds, keeps failed checks and verifies original metrics', async () => {
  const ctx = context();
  const s = await study(ctx);
  await executeTool('compare_study', request(s.artifactId), ctx);
  const input = ctx.store
    .snapshot(ctx.researchId)
    .artifacts.find((a) => a.name.startsWith('comparison-') && a.name.endsWith('-input.json'))!;
  const data = JSON.parse(
    Buffer.from((await ctx.store.readArtifact(ctx.researchId, input.id)).data, 'base64').toString(),
  );
  expect(data.pairs).toHaveLength(3);
  expect(data.pairs.map((p: { seed: number }) => p.seed)).toEqual([7, 8, 9]);
  expect(
    data.pairs.every((p: { comparison: { status: string } }) => p.comparison.status === 'failed'),
  ).toBe(true);
  expect(
    ctx.store
      .snapshot(ctx.researchId)
      .canvas.some((c) => c.title === 'Paired comparison · absolute_error'),
  ).toBe(true);
});
test('comparison refuses missing pairs, duplicate rows, unknown metrics, foreign and invented results', async () => {
  const ctx = context();
  const s = await study(ctx);
  const original = await ctx.store.readArtifact(ctx.researchId, s.artifactId);
  const parsed = JSON.parse(Buffer.from(original.data, 'base64').toString());
  for (const trials of [parsed.trials.slice(1), [...parsed.trials, parsed.trials[0]]]) {
    const altered = await ctx.store.artifact(
      ctx.researchId,
      'altered.json',
      'application/json',
      Buffer.from(JSON.stringify({ ...parsed, trials })),
      original.provenance,
    );
    await expect(executeTool('compare_study', request(altered.id), ctx)).rejects.toThrow();
  }
  await expect(
    executeTool('compare_study', { ...request(s.artifactId), metric: 'not_declared' }, ctx),
  ).rejects.toThrow('not declared');
  const fake = await ctx.store.artifact(
    ctx.researchId,
    'fake.json',
    'application/json',
    Buffer.from(original.data, 'base64'),
    'Agent-authored file',
  );
  await expect(executeTool('compare_study', request(fake.id), ctx)).rejects.toThrow('actual');
  const other = context();
  await expect(executeTool('compare_study', request(s.artifactId), other)).rejects.toThrow(
    'not found',
  );
  parsed.trials[0].metrics.absolute_error = 123;
  const altered = await ctx.store.artifact(
    ctx.researchId,
    'altered.json',
    'application/json',
    Buffer.from(JSON.stringify(parsed)),
    original.provenance,
  );
  await expect(executeTool('compare_study', request(altered.id), ctx)).rejects.toThrow('differs');
});
test('lineage follows generators and exact inputs, with explicit depth boundaries', async () => {
  const ctx = context();
  const input = await ctx.store.artifact(
    ctx.researchId,
    'input.txt',
    'text/plain',
    Buffer.from('input'),
    'Uploaded input',
  );
  const first = (await executeTool(
    'execute',
    { language: 'python', code: 'first', inputArtifactIds: [input.id] },
    ctx,
  )) as { artifacts: { id: string }[] };
  const second = (await executeTool(
    'execute',
    { language: 'python', code: 'second', inputArtifactIds: [first.artifacts[0]!.id] },
    ctx,
  )) as { artifacts: { id: string }[] };
  const result = (await executeTool(
    'trace_artifact',
    { artifactId: second.artifacts[0]!.id },
    ctx,
  )) as { status: string; nodes: { id: string; kind: string }[]; edges: unknown[] };
  expect(result.status).toBe('traced');
  expect(result.nodes).toHaveLength(5);
  expect(result.edges).toHaveLength(4);
  expect(result.nodes.find((n) => n.id === input.id)?.kind).toContain('no recorded generator');
  const limited = (await executeTool(
    'trace_artifact',
    { artifactId: second.artifacts[0]!.id, maxDepth: 1 },
    ctx,
  )) as { status: string; warnings: string[] };
  expect(limited.status).toBe('partial');
  expect(limited.warnings[0]).toContain('Depth limit');
});
test('LAN origins are explicit private addresses and Host checks include port', () => {
  const policy = accessPolicy(4310, true, 'http://192.168.50.113:4310');
  expect(policy.origins.has('http://192.168.50.113:4310')).toBe(true);
  expect(
    policy.validHost(new Request('http://localhost', { headers: { Host: '192.168.50.113:4310' } })),
  ).toBe(true);
  for (const host of [
    '192.168.50.114:4310',
    '192.168.50.113:9999',
    'evil.example',
    '127.0.0.1:9999',
  ])
    expect(policy.validHost(new Request('http://localhost', { headers: { Host: host } }))).toBe(
      false,
    );
  for (const origin of [
    'http://8.8.8.8:4310',
    'http://192.168.50.113:4310/path',
    'http://user:pass@192.168.50.113:4310',
    'http://evil.example',
    'ftp://192.168.50.113',
  ])
    expect(() => accessPolicy(4310, true, origin)).toThrow();
  expect(
    accessPolicy(4310, true, 'http://[fd00::1]:4310').origins.has('http://[fd00::1]:4310'),
  ).toBe(true);
  expect(accessPolicy(4310, true).origins.has('http://192.168.50.113:4310')).toBe(false);
});
