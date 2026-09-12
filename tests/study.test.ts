import { test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { executeTool, type ToolContext } from '../server/toolkit';
import { studySchema, studyTrials, type Trial } from '../server/experiments/study';
import { RESEARCH_GUIDE } from '../server/experiments/guide';
import type { ExecutionRecord } from '../server/experiments/execution';
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) {
    s.close();
    rmSync(s.root, { recursive: true, force: true });
  }
});
const env = { imageId: 'sha256:' + 'a'.repeat(64), platform: 'linux/arm64' };
function context(): ToolContext {
  const store = new Store(mkdtempSync(join(tmpdir(), 'study-tests-')));
  stores.push(store);
  return {
    store,
    researchId: store.create('Study').id,
    agentId: 'lead',
    signal: new AbortController().signal,
    changed: () => {},
    log: () => {},
    delegate: async () => [],
    lab: {
      capabilities: async () => ({ docker: true, image: true, detail: 'Fixture' }),
      execute: async () => ({
        environment: env,
        exitCode: 0,
        stdout: 'stable',
        durationMs: 1,
        artifacts: [
          {
            name: 'study-metrics.json',
            mime: 'application/json',
            data: Buffer.from('{"absolute_error":0.001}').toString('base64'),
          },
        ],
      }),
    },
  };
}
const spec = { ...RESEARCH_GUIDE.recipe };
test('study design rejects excessive grids, duplicate levels and reversed checks', () => {
  expect(() =>
    studySchema.parse({
      ...spec,
      repeats: 8,
      factors: [{ name: 'n', values: Array.from({ length: 12 }, (_, i) => i) }],
    }),
  ).toThrow('48');
  expect(() => studySchema.parse({ ...spec, factors: [{ name: 'n', values: [1, 1] }] })).toThrow(
    'Duplicate',
  );
  expect(() =>
    studySchema.parse({ ...spec, metrics: [{ name: 'm', unit: '1', min: 2, max: 1 }] }),
  ).toThrow();
  const trials = studyTrials(studySchema.parse({ ...spec, repeats: 2 }));
  expect(trials).toHaveLength(6);
  expect(trials.map((t) => t.seed)).toEqual([7, 8, 7, 8, 7, 8]);
});
test('protocol precedes execution; failures, metrics and exact input lineage remain visible', async () => {
  const ctx = context();
  const file = await ctx.store.artifact(
    ctx.researchId,
    'data.csv',
    'text/csv',
    Buffer.from('1,2'),
    'fixture',
  );
  let calls = 0;
  ctx.lab.execute = async (req) => {
    expect(
      ctx.store.snapshot(ctx.researchId).artifacts.some((a) => a.name.endsWith('-protocol.json')),
    ).toBe(true);
    calls++;
    expect(req.inputs?.[0]?.name).toBe('data.csv');
    const metric = req.code.includes('Study case 2, repeat 1') ? 0.1 : 0.001;
    return {
      environment: env,
      exitCode: 0,
      stdout: 'sample',
      durationMs: 1,
      artifacts: [
        {
          name: 'study-metrics.json',
          mime: 'application/json',
          data: Buffer.from(JSON.stringify({ absolute_error: metric })).toString('base64'),
        },
      ],
    };
  };
  const r = (await executeTool('run_study', { ...spec, inputArtifactIds: [file.id] }, ctx)) as {
    status: string;
    trials: Trial[];
    artifactId: string;
    figureIds: string[];
  };
  expect(r.status).toBe('needs_review');
  expect(r.trials.map((t) => t.status)).toEqual(['passed', 'failed', 'passed']);
  expect(r.trials[1]?.metrics?.absolute_error).toBe(0.1);
  const record = JSON.parse(
    Buffer.from(
      (await ctx.store.readArtifact(ctx.researchId, r.trials[0]!.executionRecordId!)).data,
      'base64',
    ).toString(),
  );
  expect(record.inputs).toEqual([{ id: file.id, name: file.name, sha256: file.sha256 }]);
  expect(record.environment).toEqual(env);
  expect(r.figureIds).toHaveLength(1);
  expect(
    ctx.store.snapshot(ctx.researchId).canvas.filter((c) => c.kind === 'artifact'),
  ).toHaveLength(1);
});
test('cancellation joins active work and preserves partial study outcomes', async () => {
  const ctx = context(),
    abort = new AbortController();
  ctx.signal = abort.signal;
  let calls = 0,
    active = 0;
  ctx.lab.execute = async () => {
    calls++;
    active++;
    try {
      if (calls === 1)
        return {
          environment: env,
          exitCode: 0,
          stdout: 'ok',
          durationMs: 1,
          artifacts: [
            {
              name: 'study-metrics.json',
              mime: 'application/json',
              data: Buffer.from('{"absolute_error":0.001}').toString('base64'),
            },
          ],
        };
      abort.abort();
      await Bun.sleep(10);
      throw new Error('Cancelled');
    } finally {
      active--;
    }
  };
  await expect(executeTool('run_study', spec, ctx)).rejects.toThrow();
  expect(active).toBe(0);
  expect(calls).toBe(2);
  const result = ctx.store
    .snapshot(ctx.researchId)
    .artifacts.find((a) => a.name.endsWith('-results.json'))!;
  const report = JSON.parse(
    Buffer.from(
      (await ctx.store.readArtifact(ctx.researchId, result.id)).data,
      'base64',
    ).toString(),
  );
  expect(report.status).toBe('cancelled');
  expect(report.trials[0].status).toBe('passed');
  expect(report.trials[1].executionRecordId).toBeString();
  expect(report.trials[2].status).toBe('cancelled');
});
test('missing or malformed metrics fail while finite extreme values render without invalid coordinates', async () => {
  const ctx = context();
  let calls = 0;
  ctx.lab.execute = async () => ({
    environment: env,
    exitCode: 0,
    stdout: 'x',
    durationMs: 1,
    artifacts: [
      {
        name: 'study-metrics.json',
        mime: 'application/json',
        data: Buffer.from(
          ++calls === 1
            ? '{}'
            : calls === 2
              ? '{"absolute_error":true}'
              : JSON.stringify({ absolute_error: Number.MAX_VALUE }),
        ).toString('base64'),
      },
    ],
  });
  const r = (await executeTool(
    'run_study',
    { ...spec, metrics: [{ name: 'absolute_error', unit: '1' }] },
    ctx,
  )) as { trials: Trial[]; figureIds: string[] };
  expect(r.trials.map((t) => t.status)).toEqual(['failed', 'failed', 'passed']);
  const svg = Buffer.from(
    (await ctx.store.readArtifact(ctx.researchId, r.figureIds[0]!)).data,
    'base64',
  ).toString();
  expect(svg).not.toMatch(/NaN|Infinity/);
});
test('reproduction uses original input versions and pinned image and compares full console output', async () => {
  const ctx = context();
  const file = await ctx.store.artifact(
    ctx.researchId,
    'data.csv',
    'text/csv',
    Buffer.from('original'),
    'fixture',
  );
  ctx.lab.execute = async (req) => {
    expect(req.inputs?.[0]?.data).toBe(Buffer.from('original').toString('base64'));
    return {
      environment: env,
      exitCode: 0,
      stdout: 'x'.repeat(20000),
      durationMs: 1,
      artifacts: [],
    };
  };
  const baseline = (await executeTool(
    'execute',
    { language: 'python', code: 'pass', inputArtifactIds: [file.id] },
    ctx,
  )) as ExecutionRecord;
  await ctx.store.artifact(
    ctx.researchId,
    'data.csv',
    'text/csv',
    Buffer.from('new version'),
    'fixture',
  );
  const execute = ctx.lab.execute;
  ctx.lab.execute = (req, ...rest) => {
    expect(req.imageId).toBe(env.imageId);
    return execute(req, ...rest);
  };
  const reproduced = (await executeTool(
    'reproduce_execution',
    { executionRecordId: baseline.executionRecordId },
    ctx,
  )) as { status: string };
  expect(reproduced.status).toBe('matched');
  ctx.lab.execute = async () => ({
    environment: env,
    exitCode: 0,
    stdout: 'different',
    durationMs: 1,
    artifacts: [],
  });
  expect(
    (
      (await executeTool(
        'reproduce_execution',
        { executionRecordId: baseline.executionRecordId },
        ctx,
      )) as { status: string }
    ).status,
  ).toBe('different');
});
test('input version collisions, foreign evidence and corrupted blobs fail before computation', async () => {
  const ctx = context();
  let calls = 0;
  ctx.lab.execute = async () => {
    calls++;
    throw new Error('Unexpected execution');
  };
  const a = await ctx.store.artifact(
    ctx.researchId,
    'data.csv',
    'text/csv',
    Buffer.from('original'),
    'fixture',
  );
  const b = await ctx.store.artifact(
    ctx.researchId,
    'data.csv',
    'text/csv',
    Buffer.from('revision'),
    'fixture',
  );
  await expect(
    executeTool(
      'execute',
      { language: 'python', code: 'pass', inputArtifactIds: [a.id, b.id] },
      ctx,
    ),
  ).rejects.toThrow('Duplicate');
  const other = ctx.store.create('Foreign');
  await expect(
    executeTool(
      'run_study',
      { ...spec, inputArtifactIds: [a.id] },
      { ...ctx, researchId: other.id },
    ),
  ).rejects.toThrow();
  await Bun.write(join(ctx.store.root, 'blobs', a.sha256), 'corrupt');
  await expect(ctx.store.readArtifact(ctx.researchId, a.id)).rejects.toThrow('integrity');
  expect(calls).toBe(0);
});
test('legacy and user-authored records cannot claim reproducibility', async () => {
  const ctx = context();
  const a = await ctx.store.artifact(
    ctx.researchId,
    'fake.json',
    'application/json',
    Buffer.from('{"version":2}'),
    'Written by agent',
  );
  await expect(
    executeTool('reproduce_execution', { executionRecordId: a.id }, ctx),
  ).rejects.toThrow('actual execution');
  const b = await ctx.store.artifact(
    ctx.researchId,
    'old.json',
    'application/json',
    Buffer.from('{"exitCode":0}'),
    'Execution record for legacy',
  );
  await expect(
    executeTool('reproduce_execution', { executionRecordId: b.id }, ctx),
  ).rejects.toThrow('historical');
});

test('prototype property names cannot impersonate missing metrics', async () => {
  const ctx = context();
  ctx.lab.execute = async () => ({
    exitCode: 0,
    stdout: 'x',
    durationMs: 1,
    artifacts: [
      {
        name: 'study-metrics.json',
        mime: 'application/json',
        data: Buffer.from('{}').toString('base64'),
      },
    ],
  });
  const r = (await executeTool(
    'run_study',
    {
      ...spec,
      factors: [{ name: 'n', values: [1] }],
      metrics: [{ name: 'constructor', unit: '1' }],
    },
    ctx,
  )) as { status: string; trials: Trial[] };
  expect(r.status).toBe('needs_review');
  expect(r.trials[0]?.error).toContain('missing');
});

test('required deliverables fail visibly while valid metrics remain available', async () => {
  const ctx = context();
  const result = (await executeTool(
    'run_study',
    { ...spec, requiredOutputs: ['trajectory.csv'] },
    ctx,
  )) as { status: string; trials: Trial[]; canvasItemId: string };
  expect(result.status).toBe('needs_review');
  expect(
    result.trials.every((t) => t.status === 'failed' && t.error?.includes('trajectory.csv')),
  ).toBe(true);
  expect(result.trials.every((t) => t.metrics?.absolute_error === 0.001)).toBe(true);
  const item = ctx.store.snapshot(ctx.researchId).canvas.find((i) => i.id === result.canvasItemId)!;
  const report = Buffer.from(
    (await ctx.store.readArtifact(ctx.researchId, item.artifactIds[0]!)).data,
    'base64',
  ).toString();
  expect(report).toContain('Required outputs missing or empty');
});

test('the maximum 48-trial grid never schedules more than two active experiments', async () => {
  const ctx = context();
  const execute = ctx.lab.execute.bind(ctx.lab);
  let active = 0,
    peak = 0,
    completed = 0;
  ctx.lab.execute = async (...args) => {
    active++;
    peak = Math.max(peak, active);
    try {
      await Bun.sleep(2);
      const result = await execute(...args);
      completed++;
      return result;
    } finally {
      active--;
    }
  };
  const result = (await executeTool(
    'run_study',
    { ...spec, factors: [{ name: 'n', values: [1, 2, 3, 4, 5, 6] }], repeats: 8 },
    ctx,
  )) as { status: string; trials: Trial[] };
  expect(result.status).toBe('completed');
  expect(result.trials).toHaveLength(48);
  expect(completed).toBe(48);
  expect(peak).toBe(2);
  expect(active).toBe(0);
});
