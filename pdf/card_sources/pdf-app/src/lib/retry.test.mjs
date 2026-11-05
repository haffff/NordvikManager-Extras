import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retry } from './retry.mjs';

// A part of the PDF that failed to arrive (a timeout over the game connection) is asked for
// again: pdf.js never asks twice, so without this the page would stay blank.
test('retry: tries again after each delay, and gives up with the last error', async () => {
  let calls = 0;
  assert.equal(await retry(async () => { if (++calls < 3) throw new Error('timeout'); return 'bytes'; }, [1, 1, 1]), 'bytes');
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new Error('gone ' + calls); }, [1, 1]), /gone 3/);
  assert.equal(calls, 3);
});
