// `npm run llm:check`: two tiny calls to confirm the configured LLM works (key, model, tool calls).
// Uses made-up text only. Costs a fraction of a cent.

import { askYesNo, chatEffort, llm } from './index.ts';

const provider = llm();
console.log(`[llm:check] provider=${provider.name} model=${provider.model} effort=${chatEffort()}`);

const started = Date.now();
const result = await provider.chat({
  system: "You help someone record what shared household items are worth to them. When they give a value, call record_value. Then reply in one short sentence.",
  turns: [{ role: 'user', text: "honestly the couch is worth like 300 bucks to me" }],
  tools: [
    {
      name: 'record_value',
      description: 'Save what an item is worth to this person, in whole dollars.',
      inputSchema: {
        type: 'object',
        properties: { item: { type: 'string' }, dollars: { type: 'integer' } },
        required: ['item', 'dollars'],
        additionalProperties: false,
      },
    },
  ],
  effort: chatEffort(),
});
console.log(`[llm:check] chat: ${Date.now() - started}ms, answered by ${result.model}, refused=${result.refused}`);
console.log(`[llm:check] tool calls: ${JSON.stringify(result.toolCalls)}`);
console.log(`[llm:check] reply: ${result.text || '(none)'}`);

const yes = await askYesNo('You check messages for a mediation app.', 'Does the sentence "Your ex values the TV at $250" reveal a dollar value?');
console.log(`[llm:check] yes/no check returned ${yes} (expected true)`);

const ok = !result.refused && result.toolCalls.some((c) => c.name === 'record_value') && yes === true;
console.log(ok ? '[llm:check] OK' : '[llm:check] something looks off, see above');
process.exit(ok ? 0 : 1);
