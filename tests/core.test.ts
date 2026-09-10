import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { Semaphore } from '../server/concurrency';
import { Command, defaultLimits, type ServerEvent, type Settings } from '../shared/protocol';
import { isPublicAddress, publicFetch, readableText } from '../server/retrieval';
import { ResearchEngine } from '../server/engine';
import { executeTool } from '../server/toolkit';
import { publicError, type ProviderFactory } from '../server/providers';
import type { Lab } from '../server/lab';

const roots: string[] = [];
const stores: Store[] = [];
const makeStore = () => {
  const root = mkdtempSync(join(tmpdir(), 'scienfactory-test-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  return store;
};
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const lab: Lab = {
  capabilities: async () => ({ docker: true, image: true, detail: 'test lab' }),
  execute: async () => ({ exitCode: 0, stdout: '42', durationMs: 1, artifacts: [] }),
};
const config: Settings = {
  provider: 'openai',
  model: 'test',
  limits: { ...defaultLimits, tokenBudget: 1000000 },
};
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return;
    await Bun.sleep(10);
  }
  throw new Error('Timed out');
};

describe('Persistence and evidence', () => {
  test('research isolation, immutable bytes, and restart recovery', async () => {
    const store = makeStore();
    const a = store.create('A');
    const b = store.create('B');
    const file = await store.artifact(
      a.id,
      '../../evidence.md',
      'text/markdown',
      Buffer.from('proof'),
      'test',
    );
    expect(file.name).not.toContain('/');
    expect(file.sha256).toHaveLength(64);
    expect((await store.readArtifact(a.id, file.id)).data).toBe(
      Buffer.from('proof').toString('base64'),
    );
    await expect(store.readArtifact(b.id, file.id)).rejects.toThrow('not found');
    store.message(a.id, 'user', 'question');
    store.updateResearch(a.id, { status: 'running' });
    expect(store.snapshot(b.id).messages).toHaveLength(0);
    store.close();
    stores.splice(stores.indexOf(store), 1);
    const restored = new Store(store.root);
    stores.push(restored);
    expect(restored.snapshot(a.id).research.status).toBe('interrupted');
    expect(restored.snapshot(a.id).messages[0]?.text).toBe('question');
    expect(restored.snapshot(a.id).artifacts[0]?.sha256).toBe(file.sha256);
    restored.delete(a.id);
    expect(restored.researches()).toHaveLength(1);
  });
  test('findings require existing evidence in the same research', async () => {
    const store = makeStore();
    const a = store.create('A');
    const b = store.create('B');
    const file = await store.artifact(b.id, 'b.txt', 'text/plain', Buffer.from('x'), 'test');
    const ctx = {
      store,
      lab,
      researchId: a.id,
      agentId: 'agent',
      signal: new AbortController().signal,
      log: () => {},
      changed: () => {},
      delegate: async () => [],
    };
    await expect(
      executeTool(
        'record_finding',
        { claim: 'Supported', status: 'supported', evidenceIds: [], limitations: '' },
        ctx,
      ),
    ).rejects.toThrow('Evidence is required');
    await expect(
      executeTool(
        'record_finding',
        { claim: 'Supported', status: 'supported', evidenceIds: [file.id], limitations: '' },
        ctx,
      ),
    ).rejects.toThrow('must exist');
    expect(
      await executeTool(
        'record_finding',
        { claim: 'An idea', status: 'hypothesis', evidenceIds: [], limitations: 'Untested' },
        ctx,
      ),
    ).toHaveProperty('sha256');
  });
  test('replay responses persist without credential inputs', () => {
    const store = makeStore();
    store.remember('id', { ok: true, data: { credentials: { openai: true } } });
    expect(store.reply('id')).toEqual({ ok: true, data: { credentials: { openai: true } } });
  });
});
describe('Isolation and protocol', () => {
  test('rejects network targets including IPv4-mapped IPv6', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.169.254',
      '0.0.0.0',
      '100.64.0.1',
      '::1',
      '::ffff:127.0.0.1',
      'fe80::1',
      'fc00::1',
      '224.0.0.1',
    ])
      expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress('1.1.1.1')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  test('rejects unsafe URL shapes before connecting', async () => {
    for (const url of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com:8443',
    ])
      await expect(publicFetch(url, new AbortController().signal)).rejects.toThrow(
        'Only public HTTPS',
      );
  });
  test('validates resource budgets and bounded commands', () => {
    expect(
      Command.safeParse({ type: 'chat.send', requestId: 'a', researchId: 'b', text: '  ' }).success,
    ).toBe(false);
    expect(
      Command.safeParse({
        type: 'settings.update',
        requestId: 'x',
        settings: { ...config, limits: { ...defaultLimits, maxAgents: 257 } },
      }).success,
    ).toBe(false);
    expect(
      Command.safeParse({
        type: 'lab.run',
        requestId: 'x',
        researchId: 'b',
        language: 'shell',
        code: 'pwd',
      }).success,
    ).toBe(false);
    expect(
      Command.safeParse({
        type: 'lab.run',
        requestId: 'x',
        researchId: 'b',
        language: 'python',
        code: 'print(1)',
      }).success,
    ).toBe(true);
  });
  test('scrubs keys and active source code from public text', () => {
    expect(publicError(new Error('failed sk-secretKey123456789'))).not.toContain('secretKey');
    expect(
      readableText('<script>steal()</script><style>x</style><p>Evidence &amp; facts</p>'),
    ).toBe('Evidence & facts');
  });
});
describe('Scheduler and lifecycle', () => {
  test('256 tasks respect permits; queued cancellation does not leak capacity', async () => {
    const semaphore = new Semaphore(7);
    const controller = new AbortController();
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 256 }, () =>
        semaphore.use(controller.signal, async () => {
          peak = Math.max(peak, ++active);
          await Bun.sleep(1);
          active--;
        }),
      ),
    );
    expect(peak).toBe(7);
    const single = new Semaphore(1);
    let release!: () => void;
    const hold = single.use(controller.signal, () => new Promise<void>((r) => (release = r)));
    const queued = new AbortController();
    const waiting = single.use(queued.signal, async () => 1);
    queued.abort();
    await expect(waiting).rejects.toThrow('Cancelled');
    release();
    await hold;
    expect(await single.use(controller.signal, async () => 42)).toBe(42);
  });
  test('real orchestration delegates, joins, streams, and persists usage', async () => {
    const store = makeStore();
    const research = store.create('Orchestration');
    let running = 0;
    let peak = 0;
    const provider: ProviderFactory = (options) => {
      let turn = 0;
      return {
        inputBound: () => 100,
        result: () => {},
        turn: async (signal, onText) => {
          signal.throwIfAborted();
          running++;
          peak = Math.max(peak, running);
          await Bun.sleep(3);
          running--;
          turn++;
          if (!options.messages.at(-1)?.content.includes('Your delegated task') && turn === 1)
            return {
              text: 'Delegating',
              inputTokens: 10,
              outputTokens: 10,
              calls: [
                {
                  id: 'call',
                  name: 'delegate',
                  arguments: {
                    tasks: Array.from({ length: 32 }, (_, i) => ({
                      name: `Agent ${i}`,
                      task: 'Check a distinct case',
                    })),
                  },
                },
              ],
            };
          onText('Evidence reviewed.');
          return { text: 'Evidence reviewed.', inputTokens: 10, outputTokens: 5, calls: [] };
        },
      };
    };
    const events: ServerEvent[] = [];
    const engine = new ResearchEngine(
      store,
      lab,
      (e) => events.push(e),
      () => {},
      provider,
    );
    engine.start(
      research.id,
      'Investigate',
      { ...config, limits: { ...config.limits, maxAgents: 64, concurrency: 3 } },
      'test-key',
    );
    await until(() => !engine.busy(research.id));
    const snapshot = store.snapshot(research.id);
    expect(snapshot.research.status).toBe('completed');
    expect(snapshot.agents).toHaveLength(33);
    expect(snapshot.agents.every((a) => a.status === 'completed')).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);
    expect(snapshot.runs[0]!.inputTokens).toBe(340);
    expect(events.some((e) => e.type === 'delta')).toBe(true);
  });
  test('refuses overlapping runs and cancellation reaches provider', async () => {
    const store = makeStore();
    const research = store.create('Stop');
    const provider: ProviderFactory = () => ({
      inputBound: () => 100,
      result: () => {},
      turn: async (signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('abort')), { once: true }),
        ),
    });
    const engine = new ResearchEngine(
      store,
      lab,
      () => {},
      () => {},
      provider,
    );
    engine.start(research.id, 'Start', config, 'key');
    expect(() => engine.start(research.id, 'Duplicate', config, 'key')).toThrow('already running');
    engine.cancel(research.id);
    await until(() => !engine.busy(research.id));
    expect(store.snapshot(research.id).research.status).toBe('cancelled');
  });
  test('a 256-agent research tree joins without deadlocking its eight model slots', async () => {
    const store = makeStore();
    const research = store.create('256 agents');
    let active = 0;
    let peak = 0;
    const provider: ProviderFactory = (options) => {
      let step = 0;
      return {
        inputBound: () => 100,
        result: () => {},
        turn: async (signal) => {
          signal.throwIfAborted();
          peak = Math.max(peak, ++active);
          await Bun.sleep(1);
          active--;
          step++;
          const task = options.messages.at(-1)?.content ?? '';
          const branch = /BRANCH:(\d+)/.exec(task);
          const isLeaf = task.includes('LEAF');
          if (step === 1 && !isLeaf) {
            const tasks = branch
              ? Array.from({ length: Number(branch[1]) === 31 ? 6 : 7 }, (_, i) => ({
                  name: `Leaf ${i}`,
                  task: 'LEAF: inspect a case',
                }))
              : Array.from({ length: 32 }, (_, i) => ({
                  name: `Branch ${i}`,
                  task: `BRANCH:${i}`,
                }));
            return {
              text: 'Delegating',
              calls: [{ id: crypto.randomUUID(), name: 'delegate', arguments: { tasks } }],
              inputTokens: 10,
              outputTokens: 5,
            };
          }
          return { text: 'Case reviewed', calls: [], inputTokens: 10, outputTokens: 5 };
        },
      };
    };
    const engine = new ResearchEngine(
      store,
      lab,
      () => {},
      () => {},
      provider,
    );
    engine.start(
      research.id,
      'Investigate all cases',
      {
        ...config,
        limits: {
          ...config.limits,
          maxAgents: 256,
          concurrency: 8,
          maxOutputTokens: 256,
          tokenBudget: 2000000,
        },
      },
      'key',
    );
    await until(() => !engine.busy(research.id));
    const result = store.snapshot(research.id);
    expect(result.research.status).toBe('completed');
    expect(result.agents).toHaveLength(256);
    expect(result.agents.every((a) => a.status === 'completed')).toBe(true);
    expect(peak).toBeLessThanOrEqual(8);
  });
  test('a budget failure does not falsely mark research complete', async () => {
    const store = makeStore();
    const research = store.create('Budget');
    const provider: ProviderFactory = () => ({
      inputBound: () => 9999999,
      result: () => {},
      turn: async () => {
        throw new Error('Must not call provider');
      },
    });
    const engine = new ResearchEngine(
      store,
      lab,
      () => {},
      () => {},
      provider,
    );
    engine.start(research.id, 'Start', config, 'key');
    await until(() => !engine.busy(research.id));
    expect(store.snapshot(research.id).research.status).toBe('failed');
    expect(store.snapshot(research.id).runs[0]?.error).toContain('Token budget');
  });
});
