import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { executeTool, type ToolContext } from '../server/toolkit';
import { ModelDirectory, supportsResearch } from '../server/models';
import { ResearchEngine } from '../server/engine';
import { defaultLimits } from '../shared/protocol';

const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) {
    s.close();
    rmSync(s.root, { recursive: true, force: true });
  }
});
function context(): ToolContext {
  const store = new Store(mkdtempSync(join(tmpdir(), 'canvas-test-')));
  stores.push(store);
  const research = store.create('Canvas research');
  return {
    store,
    researchId: research.id,
    agentId: 'lead',
    signal: new AbortController().signal,
    changed: () => {},
    log: () => {},
    delegate: async () => [],
    lab: {
      capabilities: async () => ({ docker: true, image: true, detail: 'test' }),
      execute: async () => ({ exitCode: 0, stdout: '42', durationMs: 1, artifacts: [] }),
    },
  };
}
test('canvas presentations update in place, preserve files, and enforce research ownership', async () => {
  const ctx = context();
  const first = (await executeTool(
    'present',
    { title: 'A conjecture', content: '# First version' },
    ctx,
  )) as { itemId: string; artifactIds: string[] };
  await executeTool(
    'present',
    { itemId: first.itemId, title: 'A stronger conjecture', content: '# Second version' },
    ctx,
  );
  const snapshot = ctx.store.snapshot(ctx.researchId);
  expect(snapshot.canvas).toHaveLength(1);
  expect(snapshot.canvas[0]!.title).toBe('A stronger conjecture');
  expect(snapshot.artifacts).toHaveLength(2);
  expect(
    Buffer.from(
      (await ctx.store.readArtifact(ctx.researchId, first.artifactIds[0]!)).data,
      'base64',
    ).toString(),
  ).toBe('# First version');
  const foreign = { ...ctx, researchId: ctx.store.create('Other').id };
  await expect(
    executeTool('present', { itemId: first.itemId, title: 'Overwrite', content: 'x' }, foreign),
  ).rejects.toThrow('not found');
  await expect(
    executeTool('present', { title: 'Read', artifactIds: first.artifactIds }, foreign),
  ).rejects.toThrow('belong');
  await expect(executeTool('present', { title: 'Empty' }, ctx)).rejects.toThrow('Present content');
});
test('plan progression updates existing steps and rejects duplicate identifiers', async () => {
  const ctx = context();
  await executeTool(
    'update_plan',
    {
      goal: 'Test a conjecture',
      steps: [{ id: 'enumerate', title: 'Enumerate', status: 'active' }],
    },
    ctx,
  );
  await executeTool(
    'update_plan',
    {
      goal: 'Test a conjecture',
      steps: [
        { id: 'enumerate', title: 'Enumerate', status: 'complete', detail: 'Checked n ≤ 8' },
        { id: 'proof', title: 'Prove', status: 'active' },
      ],
    },
    ctx,
  );
  const plans = ctx.store.snapshot(ctx.researchId).plans;
  expect(plans).toHaveLength(1);
  expect(plans[0]!.steps[0]!.status).toBe('complete');
  await expect(
    executeTool(
      'update_plan',
      {
        goal: 'Invalid',
        steps: [
          { id: 'a', title: 'A', status: 'active' },
          { id: 'a', title: 'B', status: 'active' },
        ],
      },
      ctx,
    ),
  ).rejects.toThrow('unique');
});
test('execution publishes code before completion, streams output, and records a failure honestly', async () => {
  const ctx = context();
  let release!: () => void;
  ctx.lab.execute = async (_, signal, output) => {
    expect(ctx.store.snapshot(ctx.researchId).canvas[0]?.code).toBe('print(42)');
    output?.('Intermediate result\n');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    signal.throwIfAborted();
    return {
      exitCode: 1,
      stdout: 'Intermediate result\n',
      error: 'Assertion failed',
      durationMs: 12,
      artifacts: [],
    };
  };
  const pending = executeTool(
    'execute',
    { title: 'Counterexample search', language: 'python', code: 'print(42)' },
    ctx,
  );
  while (!release) await Bun.sleep(1);
  expect(ctx.store.snapshot(ctx.researchId).canvas[0]?.status).toBe('running');
  expect(ctx.store.snapshot(ctx.researchId).canvas[0]?.output).toContain('Intermediate');
  release();
  await pending;
  expect(ctx.store.snapshot(ctx.researchId).canvas[0]?.status).toBe('failed');
  expect(ctx.store.snapshot(ctx.researchId).canvas[0]?.output).toContain('Assertion failed');
});
test('batch experiments preserve successes when another experiment fails', async () => {
  const ctx = context();
  ctx.lab.execute = async (request) => {
    if (request.code === 'fail') throw new Error('Test failure');
    return { exitCode: 0, stdout: 'successful', durationMs: 1, artifacts: [] };
  };
  const result = (await executeTool(
    'execute_batch',
    {
      experiments: [
        { title: 'Control', language: 'python', code: 'pass' },
        { title: 'Alternative', language: 'python', code: 'fail' },
      ],
    },
    ctx,
  )) as { result?: unknown; error?: string }[];
  expect(result[0]?.result).toBeDefined();
  expect(result[1]?.error).toBeDefined();
  expect(
    ctx.store
      .snapshot(ctx.researchId)
      .canvas.map((i) => i.status)
      .sort(),
  ).toEqual(['completed', 'failed']);
});
test('model directory uses provider results, filters modalities, caches, and isolates credentials', async () => {
  let calls = 0;
  const directory = new ModelDirectory((async (url: string | URL | Request) => {
    calls++;
    expect(String(url)).toContain('/models');
    return Response.json({
      object: 'list',
      data: [
        { id: calls === 1 ? 'gpt-5-mini' : 'gpt-5', object: 'model' },
        { id: 'gpt-image-1', object: 'model' },
        { id: 'gpt-4o-realtime-preview', object: 'model' },
      ],
    });
  }) as typeof fetch);
  expect((await directory.list('openai', 'key-a')).models.map((m) => m.id)).toEqual(['gpt-5-mini']);
  await directory.list('openai', 'key-a');
  expect(calls).toBe(1);
  expect((await directory.list('openai', 'key-b')).models[0]?.id).toBe('gpt-5');
  expect(calls).toBe(2);
  await directory.list('openai', 'key-b', true);
  expect(calls).toBe(3);
  await expect(directory.list('anthropic', '')).rejects.toThrow('Connect');
  expect(supportsResearch('claude-sonnet-4-5')).toBe(true);
  expect(supportsResearch('text-embedding-3-large')).toBe(false);
});
test('tool input drafts become a single completed invocation; message ordering is stable', async () => {
  const ctx = context();
  let sawDraft = false;
  const engine = new ResearchEngine(
    ctx.store,
    ctx.lab,
    () => {},
    () => {
      if (ctx.store.snapshot(ctx.researchId).tools.some((t) => t.preparing)) sawDraft = true;
    },
    () => {
      let turn = 0;
      return {
        inputBound: () => 100,
        result: () => {},
        turn: async (_signal, onText, onToolInput) => {
          if (++turn === 1) {
            onText('I will enumerate the smallest cases.');
            onToolInput?.('call-1', 'execute', '{"language":"python","code":"print(');
            await Bun.sleep(120);
            onToolInput?.('call-1', 'execute', '{"language":"python","code":"print(42)"}');
            return {
              text: 'I will enumerate the smallest cases.',
              calls: [
                {
                  id: 'call-1',
                  name: 'execute',
                  arguments: { language: 'python', code: 'print(42)' },
                },
              ],
              inputTokens: 10,
              outputTokens: 10,
            };
          }
          return {
            text: 'The enumeration is complete.',
            calls: [],
            inputTokens: 10,
            outputTokens: 10,
          };
        },
      };
    },
  );
  engine.start(
    ctx.researchId,
    'Investigate',
    { provider: 'openai', model: 'test', limits: defaultLimits },
    'test-key',
  );
  while (engine.busy(ctx.researchId)) await Bun.sleep(5);
  const snapshot = ctx.store.snapshot(ctx.researchId);
  expect(sawDraft).toBe(true);
  expect(snapshot.tools).toHaveLength(1);
  expect(snapshot.tools[0]?.status).toBe('completed');
  expect(snapshot.tools[0]?.preparing).toBe(false);
  expect(snapshot.messages[1]!.createdAt).toBeLessThanOrEqual(snapshot.tools[0]!.createdAt);
  expect(snapshot.agents[0]?.phase).toBe('finished');
});

test('discovery requests open independent perspectives before lead execution', async () => {
  const ctx = context();
  const seen: string[] = [];
  const engine = new ResearchEngine(
    ctx.store,
    ctx.lab,
    () => {},
    () => {},
    (options) => ({
      inputBound: () => 100,
      result: () => {},
      turn: async () => {
        const specialist = options.messages[0]?.content.includes('Opening perspective:');
        seen.push(specialist ? 'specialist' : 'lead');
        if (specialist) expect(options.tools.some((t) => t.name === 'delegate')).toBe(false);
        else expect(options.messages.at(-1)?.content).toContain('independent opening perspectives');
        return {
          text: specialist
            ? 'A concrete bounded direction with a small test.'
            : 'The investigation is complete.',
          calls: [],
          inputTokens: 10,
          outputTokens: 10,
        };
      },
    }),
  );
  engine.start(
    ctx.researchId,
    'Find a breakthrough in combinatorics',
    { provider: 'openai', model: 'fixture', limits: defaultLimits },
    'test-key',
  );
  while (engine.busy(ctx.researchId)) await Bun.sleep(5);
  const result = ctx.store.snapshot(ctx.researchId);
  expect(seen).toEqual(['specialist', 'specialist', 'lead']);
  expect(result.agents).toHaveLength(3);
  expect(result.tools[0]?.status).toBe('completed');
  expect(result.research.status).toBe('completed');
});

test('a lead continues a prematurely ended plan and persists its completion', async () => {
  const ctx = context();
  let nudged = 0;
  const engine = new ResearchEngine(
    ctx.store,
    ctx.lab,
    () => {},
    () => {},
    () => {
      let turn = 0;
      return {
        inputBound: () => 100,
        result: () => {},
        nudge: () => {
          nudged++;
        },
        turn: async () => {
          turn++;
          if (turn === 1 || turn === 3)
            return {
              text: '',
              inputTokens: 10,
              outputTokens: 10,
              calls: [
                {
                  id: `plan-${turn}`,
                  name: 'update_plan',
                  arguments: {
                    goal: 'Complete the experiment',
                    steps: [
                      {
                        id: 'test',
                        title: 'Run the check',
                        status: turn === 1 ? 'active' : 'complete',
                      },
                    ],
                  },
                },
              ],
            };
          return {
            text: turn === 2 ? 'Would you like me to continue?' : 'The check is complete.',
            calls: [],
            inputTokens: 10,
            outputTokens: 10,
          };
        },
      };
    },
  );
  engine.start(
    ctx.researchId,
    'Investigate a concrete question',
    { provider: 'openai', model: 'fixture', limits: defaultLimits },
    'test-key',
  );
  while (engine.busy(ctx.researchId)) await Bun.sleep(5);
  expect(nudged).toBe(1);
  expect(ctx.store.snapshot(ctx.researchId).plans[0]?.steps[0]?.status).toBe('complete');
  expect(ctx.store.snapshot(ctx.researchId).research.status).toBe('completed');
});

test('incremental workspace updates retain unchanged evidence and greatly reduce large-team frames', async () => {
  const { snapshotPatch, applySnapshotPatch } = await import('../shared/state');
  const ctx = context();
  const previous = ctx.store.snapshot(ctx.researchId);
  previous.agents = Array.from({ length: 256 }, (_, i) => ({
    id: `a${i}`,
    researchId: ctx.researchId,
    runId: 'r',
    parentId: i ? 'a0' : null,
    name: `Researcher ${i}`,
    task: 'A concrete independent research task. '.repeat(20),
    status: 'running',
    createdAt: 1,
    phase: 'thinking',
  }));
  previous.canvas = [
    {
      id: 'c',
      researchId: ctx.researchId,
      agentId: 'a0',
      kind: 'experiment',
      title: 'An experiment',
      caption: '',
      status: 'running',
      code: 'print(42)\n'.repeat(1000),
      artifactIds: [],
      output: '',
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const next = structuredClone(previous);
  next.agents[42]!.phase = 'writing';
  next.canvas[0]!.output = '42\n';
  next.canvas[0]!.updatedAt = 2;
  const patch = snapshotPatch(previous, next);
  expect(patch.changes.agents).toHaveLength(1);
  expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(next).length / 10);
  expect(applySnapshotPatch(previous, patch)).toEqual(next);
  expect(applySnapshotPatch(next, patch)).toEqual(next);
  expect(applySnapshotPatch(previous, { researchId: 'other', changes: { agents: [] } })).toEqual(
    previous,
  );
});

test('large tool results remain valid JSON and preserve a complete artifact reference', async () => {
  const ctx = context();
  let received: { resultArtifactId?: string } | undefined;
  ctx.lab.execute = async () => ({
    exitCode: 0,
    stdout: 'x'.repeat(20000),
    durationMs: 1,
    artifacts: [],
  });
  const engine = new ResearchEngine(
    ctx.store,
    ctx.lab,
    () => {},
    () => {},
    () => {
      let turn = 0;
      return {
        inputBound: () => 100,
        result: (_call, output) => {
          received = JSON.parse(output);
        },
        turn: async () =>
          ++turn === 1
            ? {
                text: '',
                calls: [
                  {
                    id: 'batch',
                    name: 'execute_batch',
                    arguments: {
                      experiments: Array.from({ length: 8 }, () => ({
                        language: 'python',
                        code: 'print(42)',
                      })),
                    },
                  },
                ],
                inputTokens: 10,
                outputTokens: 10,
              }
            : { text: 'Done', calls: [], inputTokens: 10, outputTokens: 10 },
      };
    },
  );
  engine.start(
    ctx.researchId,
    'Run independent experiments',
    { provider: 'openai', model: 'fixture', limits: defaultLimits },
    'test-key',
  );
  while (engine.busy(ctx.researchId)) await Bun.sleep(5);
  expect(received?.resultArtifactId).toBeDefined();
  const artifact = await ctx.store.readArtifact(ctx.researchId, received!.resultArtifactId!);
  const results = JSON.parse(Buffer.from(artifact.data, 'base64').toString());
  expect(results).toHaveLength(8);
  expect(
    results.every((r: { result: { executionRecordId: string } }) => r.result.executionRecordId),
  ).toBe(true);
  expect(ctx.store.snapshot(ctx.researchId).research.status).toBe('completed');
});
