import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseCodeOf, keywordOf, parseFirstName, parseNameAndPhone } from './keywords.ts';

test('keywords match the bare word, any case, with edge punctuation', () => {
  assert.equal(keywordOf('start'), 'start');
  assert.equal(keywordOf('  START '), 'start');
  assert.equal(keywordOf('Join'), 'join');
  assert.equal(keywordOf('STOP.'), 'stop');
  assert.equal(keywordOf('Yes!'), 'yes');
  assert.equal(keywordOf('y'), 'yes');
  assert.equal(keywordOf('No.'), 'no');
  assert.equal(keywordOf('nope'), 'no');
});

test('a keyword inside a sentence is not a keyword', () => {
  assert.equal(keywordOf('yes please'), null);
  assert.equal(keywordOf("don't stop"), null);
  assert.equal(keywordOf('start over'), null);
  assert.equal(keywordOf('no way, the couch is mine'), null);
  assert.equal(keywordOf(''), null);
});

test('case codes need 4 chars from the alphabet and at least one digit', () => {
  assert.equal(caseCodeOf('4F7K'), '4F7K');
  assert.equal(caseCodeOf(' 4f7k '), '4F7K');
  assert.equal(caseCodeOf('#9QJ2'), '9QJ2');
  assert.equal(caseCodeOf('4F 7K'), '4F7K');
  assert.equal(caseCodeOf('JOIN'), null); // no digit
  assert.equal(caseCodeOf('STOP'), null);
  assert.equal(caseCodeOf('4F0K'), null); // 0 is not in the alphabet
  assert.equal(caseCodeOf('4F7KX'), null);
});

test('first names come out of common phrasings', () => {
  assert.equal(parseFirstName('Alex'), 'Alex');
  assert.equal(parseFirstName("it's alex"), 'Alex');
  assert.equal(parseFirstName('hi, I am Sam.'), 'Sam');
  assert.equal(parseFirstName('Mary-Jane Watson'), 'Mary-Jane');
  assert.equal(parseFirstName('734 555 1234'), null);
  assert.equal(parseFirstName(''), null);
});

test("the ex's name and number come out of one message", () => {
  assert.deepEqual(parseNameAndPhone('Sam 734 555 1234'), { name: 'Sam', phone: '+17345551234' });
  assert.deepEqual(parseNameAndPhone('sam, +1 (734) 555-1234'), { name: 'Sam', phone: '+17345551234' });
  assert.deepEqual(parseNameAndPhone('+91 96770 48869 Ross'), { name: 'Ross', phone: '+919677048869' });
  assert.deepEqual(parseNameAndPhone('Sam'), { name: 'Sam', phone: null });
  assert.deepEqual(parseNameAndPhone('7345551234'), { name: null, phone: '+17345551234' });
});
