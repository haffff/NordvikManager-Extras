import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplies } from './replies.mjs';

// A manual clock, so timeouts are tested without waiting.
function clock() {
  const timers = [];
  return {
    setTimer: (fn, ms) => { const t = { fn, ms, on: true }; timers.push(t); return t; },
    clearTimer: (t) => { t.on = false; },
    fire: () => timers.filter((t) => t.on).forEach((t) => { t.on = false; t.fn(); }),
  };
}

test('a reply settles the request waiting for that kind', async () => {
  const c = clock();
  const replies = createReplies({ timeoutMs: 1000, ...c });
  const waiting = replies.wait('search');
  replies.deliver({ kind: 'search', ok: true, results: [1] });
  assert.deepEqual(await waiting, { kind: 'search', ok: true, results: [1] });
});

test('a failed reply rejects with its error', async () => {
  const replies = createReplies({ timeoutMs: 1000, ...clock() });
  const waiting = replies.wait('saved');
  replies.deliver({ kind: 'saved', ok: false, error: 'Bad address' });
  await assert.rejects(waiting, /Bad address/);
});

test('no answer in time rejects, pointing at the event log', async () => {
  const c = clock();
  const replies = createReplies({ timeoutMs: 1000, ...c });
  const waiting = replies.wait('imported');
  c.fire();
  await assert.rejects(waiting, /event log/);
});

test('replies of another kind, or nobody waiting, are ignored', async () => {
  const replies = createReplies({ timeoutMs: 1000, ...clock() });
  replies.deliver({ kind: 'search', ok: true });
  const waiting = replies.wait('test');
  replies.deliver({ kind: 'search', ok: true });
  replies.deliver({ kind: 'test', ok: true, version: '1' });
  assert.equal((await waiting).version, '1');
});

test('two requests of one kind are answered in order', async () => {
  const replies = createReplies({ timeoutMs: 1000, ...clock() });
  const first = replies.wait('imported');
  const second = replies.wait('imported');
  replies.deliver({ kind: 'imported', ok: true, cardId: 'a' });
  replies.deliver({ kind: 'imported', ok: true, cardId: 'b' });
  assert.equal((await first).cardId, 'a');
  assert.equal((await second).cardId, 'b');
});

test('a reply that is not an object is ignored', () => {
  const replies = createReplies({ timeoutMs: 1000, ...clock() });
  assert.doesNotThrow(() => { replies.deliver(null); replies.deliver('x'); });
});
