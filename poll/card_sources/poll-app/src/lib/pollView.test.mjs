import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRecord, readState, bars, choiceLabel, recordName } from './pollView.mjs';

const POLL = { question: 'Where next?', options: ['Mill', 'Cave'], multi: false, secret: false, hideResults: false, allowChange: true, createdBy: 'a', createdByName: 'Ana' };
const record = (state) => JSON.stringify({ poll: POLL, state });

test('recordName is the game property of a poll', () => {
  assert.equal(recordName('abc'), 'poll_abc');
});

test('readRecord reads the poll and its state, null for anything else', () => {
  const r = readRecord(record({ status: 'closed', voted: ['Ana'], results: { counts: [1, 0], total: 1 } }));
  assert.equal(r.poll.question, 'Where next?');
  assert.deepEqual(r.state, { status: 'closed', voted: ['Ana'], results: { counts: [1, 0], total: 1 } });
  for (const bad of ['', 'nope', '{"poll":{"question":"Q"}}', '{"state":{}}', null]) assert.equal(readRecord(bad), null, String(bad));
});

test('readState gives safe defaults', () => {
  assert.deepEqual(readState(undefined), { status: 'open', voted: [], results: null });
  assert.deepEqual(readState({ status: 'x', voted: 'Ana', results: { counts: 'no' } }), { status: 'open', voted: [], results: null });
});

test('bars: count, share of voters and names per option', () => {
  assert.deepEqual(bars(POLL, { counts: [3, 1], total: 4, names: [['A', 'B', 'C'], ['D']] }), [
    { label: 'Mill', count: 3, percent: 75, names: ['A', 'B', 'C'] },
    { label: 'Cave', count: 1, percent: 25, names: ['D'] },
  ]);
  assert.deepEqual(bars(POLL, { counts: [0, 0], total: 0 }).map((b) => b.percent), [0, 0]);
  assert.deepEqual(bars(POLL, null), []);
});

test('choiceLabel names the picks', () => {
  assert.equal(choiceLabel(POLL, [1]), 'Cave');
  assert.equal(choiceLabel(POLL, [0, 1]), 'Mill, Cave');
  assert.equal(choiceLabel(POLL, []), '');
});
