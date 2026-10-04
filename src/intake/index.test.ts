import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanReply } from './index.ts';

test('plain replies pass through', () => {
  assert.equal(cleanReply('  Got it, couch is $200.  '), 'Got it, couch is $200.');
  assert.equal(cleanReply(''), null);
  assert.equal(cleanReply(null), null);
});

test('a tool call written as text never reaches the person', () => {
  const leaked =
    '<invoke name="reply">\n<parameter name="message">Got it, I have the Couch and TV. What is the couch worth to you?</parameter>\n</invoke>\n</invoke>';
  assert.equal(cleanReply(leaked), 'Got it, I have the Couch and TV. What is the couch worth to you?');
  assert.equal(cleanReply('<invoke name="add_item"></invoke>'), null);
});

test('notes to self after the message are cut off', () => {
  const leaked =
    "All set, Sam. Everything's recorded, and I'll text you as soon as there's something to look at or decide.\n" +
    '<reasoning_"finish_intake" already done>\n<reasoning>I should just reply in plain text without tools?</reasoning>';
  assert.equal(cleanReply(leaked), "All set, Sam. Everything's recorded, and I'll text you as soon as there's something to look at or decide.");
  assert.equal(cleanReply('<reasoning>only thoughts</reasoning>'), null);
  assert.equal(cleanReply('Is $5 < $10? Yes.'), 'Is $5 < $10? Yes.', 'a lone < in normal text is fine');
});
