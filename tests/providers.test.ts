import { expect, test } from 'bun:test';
import { createProvider, type ProviderOptions } from '../server/providers';

const common: Omit<ProviderOptions, 'provider' | 'fetch'> = {
  key: 'test-secret',
  model: 'fixture',
  system: 'Test',
  messages: [{ role: 'user', content: 'Compute' }],
  tools: [
    {
      name: 'calculate',
      description: 'Calculate',
      parameters: { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] },
    },
  ],
  maxOutputTokens: 1024,
};
const sse = (events: object[]) =>
  new Response(
    events
      .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );

test('OpenAI strips parsed SDK fields from streaming continuation requests', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const output =
      bodies.length === 1
        ? [
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'calculate',
              arguments: '{"a":42}',
              status: 'completed',
            },
          ]
        : [
            {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: '42', annotations: [], logprobs: [] }],
            },
          ];
    return sse([
      {
        type: 'response.created',
        response: { id: 'resp_1', object: 'response', status: 'in_progress', output: [] },
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_1',
          object: 'response',
          status: 'completed',
          output,
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      },
    ]);
  }) as typeof fetch;
  const provider = createProvider({ ...common, provider: 'openai', fetch: fetcher });
  const first = await provider.turn(new AbortController().signal, () => {});
  expect(first.calls[0]?.arguments).toEqual({ a: 42 });
  provider.result(first.calls[0]!, '{"result":42}');
  const second = await provider.turn(new AbortController().signal, () => {});
  expect(second.text).toBe('42');
  expect(JSON.stringify(bodies[1])).not.toContain('parsed_arguments');
  expect(JSON.stringify(bodies[1])).toContain('function_call_output');
});
test('Anthropic streaming tool blocks round-trip as tool_result messages', async () => {
  const bodies: Record<string, unknown>[] = [];
  let text = '';
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const tool = bodies.length === 1;
    return sse([
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'fixture',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 20, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: tool
          ? { type: 'tool_use', id: 'tool_1', name: 'calculate', input: {} }
          : { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: tool
          ? { type: 'input_json_delta', partial_json: '{"a":42}' }
          : { type: 'text_delta', text: '42' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
      { type: 'message_stop' },
    ]);
  }) as typeof fetch;
  const provider = createProvider({ ...common, provider: 'anthropic', fetch: fetcher });
  const first = await provider.turn(new AbortController().signal, (t) => (text += t));
  expect(first.calls[0]?.arguments).toEqual({ a: 42 });
  provider.result(first.calls[0]!, '{"result":42}');
  const second = await provider.turn(new AbortController().signal, (t) => (text += t));
  expect(second.text).toBe('42');
  expect(text).toBe('42');
  expect(JSON.stringify(bodies[1])).toContain('tool_use_id');
  expect(second.inputTokens).toBe(20);
});

for (const name of ['openai', 'anthropic'] as const) {
  test(`${name} sends native visual evidence with tool results and bounds binary input separately`, async () => {
    let body: Record<string, unknown> = {};
    const provider = createProvider({
      ...common,
      provider: name,
      fetch: (async (_url: unknown, init: RequestInit) => {
        body = JSON.parse(String(init.body));
        // Reuse the production request serializer; fail after observing the outbound body.
        return new Response(
          JSON.stringify({ error: { type: 'test_stop', message: 'fixture stop' } }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch,
    });
    provider.result(
      { id: 'inspection', name: 'inspect_file', arguments: {} },
      '{"status":"inspected"}',
    );
    provider.attach?.([
      { name: 'plot.png', mime: 'image/png', data: 'A'.repeat(50000) },
      { name: 'selected-pages.pdf', mime: 'application/pdf', data: 'JVBERi0xLjQ=', pages: 2 },
    ]);
    expect(provider.inputBound()).toBeLessThan(140000);
    await expect(provider.turn(new AbortController().signal, () => {})).rejects.toThrow(
      'fixture stop',
    );
    const json = JSON.stringify(body);
    expect(json).toContain(name === 'openai' ? 'input_image' : '"type":"image"');
    expect(json).toContain(name === 'openai' ? 'input_file' : '"type":"document"');
    expect(json).toContain('application/pdf');
    expect(json).toContain('plot.png');
    expect(json.indexOf('inspection')).toBeLessThan(json.indexOf('plot.png'));
    expect(json).toContain('Untrusted file evidence');
  });
}
