import { createApp } from '../server/app';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderFactory } from '../server/providers';

// Deterministic provider fixture for browser tests; never used by the application.
const provider: ProviderFactory = (options) => {
  const canvasTest = options.messages.at(-1)?.content.includes('CANVAS_ACCEPTANCE');
  const loadTest = options.messages.at(-1)?.content.includes('LOAD_ACCEPTANCE');
  let presentationId = '';
  let pendingTool = '';
  const plan = (complete = false) => ({
    goal: 'Investigate a spiral',
    steps: [
      {
        id: 'visual',
        title: 'Construct an interactive spiral',
        status: complete ? 'complete' : 'active',
      },
      {
        id: 'experiment',
        title: 'Check the numerical result',
        status: complete ? 'complete' : 'pending',
      },
    ],
  });
  let turn = 0;
  return {
    inputBound: () => 100,
    result: (call, result) => {
      if (call.name === 'present') presentationId = JSON.parse(result).itemId;
      pendingTool = call.name;
    },
    turn: async (signal, onText, onToolInput) => {
      turn++;
      if (loadTest) {
        await Bun.sleep(20);
        signal.throwIfAborted();
        const content = options.messages.at(-1)?.content ?? '';
        const branch = /LOAD_ACCEPTANCE_BRANCH:(\d+)/.exec(content);
        const leaf = content.includes('LOAD_ACCEPTANCE_LEAF');
        if (turn === 1 && !leaf) {
          const tasks = branch
            ? Array.from({ length: Number(branch[1]) === 31 ? 6 : 7 }, (_, i) => ({
                name: `Case ${branch[1]}.${i}`,
                task: 'LOAD_ACCEPTANCE_LEAF: inspect one independent case',
              }))
            : Array.from({ length: 32 }, (_, i) => ({
                name: `Branch ${i}`,
                task: `LOAD_ACCEPTANCE_BRANCH:${i}`,
              }));
          return {
            text: '',
            calls: [{ id: crypto.randomUUID(), name: 'delegate', arguments: { tasks } }],
            inputTokens: 10,
            outputTokens: 10,
          };
        }
        const text = leaf
          ? 'Case checked.'
          : branch
            ? 'Branch joined.'
            : 'All 256 researchers joined successfully.';
        onText(text);
        return { text, calls: [], inputTokens: 10, outputTokens: 10 };
      }
      if (canvasTest) {
        const response = (name: string, args: unknown) => ({
          text: '',
          inputTokens: 10,
          outputTokens: 10,
          calls: [{ id: `canvas-${turn}`, name, arguments: args }],
        });
        if (turn === 1) {
          onText('I’ll explore this through a visual construction and a numerical check.');
          return {
            ...response('update_plan', plan()),
            text: 'I’ll explore this through a visual construction and a numerical check.',
          };
        }
        if (turn === 2)
          return response('present', {
            title: 'Interactive spiral',
            format: 'html',
            content:
              '<!doctype html><html><body style="font:16px system-ui;padding:24px"><h1>Spiral explorer</h1><label>Turns <input id="turns" type="range" min="1" max="12" value="4"></label><output id="value">4</output><svg width="300" height="160"><path d="M150 80 Q250 0 210 100 T90 120 T150 30 T250 140" fill="none" stroke="#34744a" stroke-width="3"/></svg><script>turns.oninput=()=>value.textContent=turns.value</script></body></html>',
          });
        if (turn === 3) {
          onToolInput?.(
            'canvas-3',
            'execute',
            '{"title":"Enumerating cases","language":"python","code":"print(',
          );
          await Bun.sleep(700);
          onToolInput?.(
            'canvas-3',
            'execute',
            '{"title":"Enumerating cases","language":"python","code":"print(42)"}',
          );
          await Bun.sleep(300);
          return response('execute', {
            title: 'Enumerating cases',
            language: 'python',
            code: 'print(42)',
          });
        }
        if (turn === 4)
          return response('present', {
            itemId: presentationId,
            title: 'Interactive spiral',
            format: 'html',
            content:
              '<!doctype html><html><body style="font:16px system-ui;padding:24px"><h1>Spiral explorer</h1><p>Numerical check complete: 42.</p><label>Turns <input id="turns" type="range" min="1" max="12" value="4"></label><output id="value">4</output><script>turns.oninput=()=>value.textContent=turns.value</script></body></html>',
          });
        if (turn === 5) return response('update_plan', plan(true));
        if (pendingTool === 'update_plan') onText('The visual and numerical checks are complete.');
        return {
          text: 'The visual and numerical checks are complete.',
          calls: [],
          inputTokens: 10,
          outputTokens: 10,
        };
      }
      if (turn === 1) {
        for (const text of ['Investigating ', 'your question.\n\n']) {
          signal.throwIfAborted();
          onText(text);
          await Bun.sleep(30);
        }
        return {
          text: 'Investigating your question.',
          inputTokens: 30,
          outputTokens: 10,
          calls: [
            {
              id: 'write-test',
              name: 'write_artifact',
              arguments: {
                name: 'integration-report.md',
                mime: 'text/markdown',
                content:
                  '# Integration test report\n\nThis is a deterministic browser-test fixture.\n\n$$x^2 + y^2 = 1$$',
              },
            },
          ],
        };
      }
      onText('The test report is ready in your workbench.');
      return {
        text: 'The test report is ready in your workbench.',
        inputTokens: 40,
        outputTokens: 15,
        calls: [],
      };
    },
  };
};
const runtime = createApp({
  root: mkdtempSync(join(tmpdir(), 'scienfactory-browser-')),
  port: 4311,
  production: true,
  provider,
  models: {
    clear: () => {},
    list: async (provider) => ({
      provider,
      fetchedAt: Date.now(),
      models: [
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
        { id: 'gpt-5', name: 'GPT-5' },
      ],
    }),
  },
  keys: { openai: 'test-only-key', anthropic: '' },
  lab: {
    capabilities: async () => ({ docker: true, image: true, detail: 'Deterministic test lab' }),
    execute: async (_request, signal, onOutput) => {
      signal.throwIfAborted();
      onOutput?.('42\n');
      await Bun.sleep(1500);
      return {
        exitCode: 0,
        stdout: '42\n',
        durationMs: 100,
        artifacts: [
          {
            name: 'result.json',
            mime: 'application/json',
            data: Buffer.from('{"result":42}').toString('base64'),
          },
        ],
      };
    },
  },
});
runtime.app.listen({ port: 4311, hostname: '127.0.0.1' });
console.log('Browser-test server ready');
