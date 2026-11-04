import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRangeReader } from './rangeReader.mjs';

// A 1000-byte file whose byte i is i % 256, read through a fake ReadRange that records calls.
const TOTAL = 1000;
function fakeSource() {
  const calls = [];
  const readRange = async (start, length) => {
    calls.push([start, length]);
    const end = Math.min(TOTAL, start + length);
    const bytes = new Uint8Array(Math.max(0, end - start));
    for (let i = 0; i < bytes.length; i++) bytes[i] = (start + i) % 256;
    return { bytes, start, total: TOTAL, version: 'v' };
  };
  return { calls, readRange };
}

test('reads whole chunks only, and returns exactly the bytes asked for', async () => {
  const { calls, readRange } = fakeSource();
  const reader = createRangeReader(readRange, 100, TOTAL);

  const bytes = await reader.read(150, 260);

  assert.deepEqual(calls, [[100, 100], [200, 100]]);
  assert.equal(bytes.length, 110);
  assert.equal(bytes[0], 150);
  assert.equal(bytes[109], 259 % 256);
});

test('a chunk is fetched once, even when asked for twice at the same time', async () => {
  const { calls, readRange } = fakeSource();
  const reader = createRangeReader(readRange, 100, TOTAL);

  await Promise.all([reader.read(0, 50), reader.read(10, 90), reader.read(0, 100)]);
  await reader.read(20, 30);

  assert.deepEqual(calls, [[0, 100]]);
});

test('the last chunk is shorter, and nothing past the end is asked for', async () => {
  const { calls, readRange } = fakeSource();
  const reader = createRangeReader(readRange, 300, TOTAL);

  const bytes = await reader.read(850, 5000);

  assert.deepEqual(calls, [[600, 300], [900, 100]]);
  assert.equal(bytes.length, 150);
  assert.equal(bytes[149], 999 % 256);
});

test('a chunk that fails is asked for again next time, and the read rejects', async () => {
  let fail = true;
  const { calls, readRange } = fakeSource();
  const flaky = (s, l) => (fail ? Promise.resolve(null) : readRange(s, l));
  const reader = createRangeReader(flaky, 100, TOTAL);

  await assert.rejects(reader.read(0, 10), /couldn't be read/);
  fail = false;
  assert.equal((await reader.read(0, 10)).length, 10);
  assert.deepEqual(calls, [[0, 100]]);
});
