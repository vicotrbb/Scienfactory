import { createProvider } from '../server/providers';
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('OPENAI_API_KEY is required for the explicitly requested live test.');
const model = process.env.OPENAI_MODEL ?? 'gpt-5-mini';
let streamed = '';
const conversation = createProvider({
  provider: 'openai',
  key,
  model,
  system:
    'You are testing a research tool integration. Call calculate to compute 19 + 23. Once its result is returned, answer only with the result.',
  messages: [{ role: 'user', content: 'Compute 19 + 23 with the tool.' }],
  maxOutputTokens: 4096,
  tools: [
    {
      name: 'calculate',
      description: 'Add two integers.',
      parameters: {
        type: 'object',
        properties: { a: { type: 'integer' }, b: { type: 'integer' } },
        required: ['a', 'b'],
        additionalProperties: false,
      },
    },
  ],
});
const signal = AbortSignal.timeout(120000);
const first = await conversation.turn(signal, (text) => (streamed += text));
const call = first.calls[0];
if (!call || call.name !== 'calculate') throw new Error('Provider did not call the expected tool');
const args = call.arguments as { a: number; b: number };
if (args.a + args.b !== 42) throw new Error('Unexpected tool arguments');
conversation.result(call, JSON.stringify({ result: args.a + args.b }));
const second = await conversation.turn(signal, (text) => (streamed += text));
if (!second.text.includes('42') || !streamed.includes('42'))
  throw new Error('Streaming tool continuation failed');
console.log(
  JSON.stringify({
    provider: 'openai',
    model,
    toolRoundTrip: true,
    streaming: true,
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
  }),
);
