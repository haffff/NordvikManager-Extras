import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normRect, rectFromPoints, mergeLineRects, simplifyPath, normPoint } from './geometry.mjs';

// A page element at (100, 50) on screen, 600×800 px.
const PAGE = { left: 100, top: 50, width: 600, height: 800 };

test('normRect turns screen rects into page fractions, clipped to the page; null when outside', () => {
  assert.deepEqual(normRect({ left: 160, top: 130, width: 300, height: 16 }, PAGE), [0.1, 0.1, 0.5, 0.02]);
  assert.deepEqual(normRect({ left: 50, top: 40, width: 100, height: 20 }, PAGE), [0, 0, 0.0833, 0.0125]);
  assert.equal(normRect({ left: 800, top: 130, width: 30, height: 16 }, PAGE), null);
  assert.equal(normRect({ left: 160, top: 130, width: 0, height: 16 }, PAGE), null);
});

test('normPoint clamps to the page', () => {
  assert.deepEqual(normPoint(400, 450, PAGE), [0.5, 0.5]);
  assert.deepEqual(normPoint(0, 2000, PAGE), [0, 1]);
});

test('rectFromPoints makes a rect from two corners in any order', () => {
  assert.deepEqual(rectFromPoints([0.5, 0.4], [0.2, 0.1]), [0.2, 0.1, 0.3, 0.3]);
});

test('mergeLineRects joins the pieces of one line, keeps lines apart and drops tiny bits', () => {
  const merged = mergeLineRects([
    [0.1, 0.1, 0.2, 0.02], [0.3, 0.1005, 0.15, 0.019], // one line, two text spans
    [0.1, 0.13, 0.4, 0.02], // the next line
    [0.5, 0.5, 0.0001, 0.0001], // a zero-size rect a selection sometimes has
    [0.12, 0.1, 0.05, 0.02], // inside the first line already
  ]);
  assert.deepEqual(merged, [[0.1, 0.1, 0.35, 0.02], [0.1, 0.13, 0.4, 0.02]]);
});

test('simplifyPath drops points closer than the step and keeps the ends', () => {
  const path = [[0, 0], [0.0001, 0], [0.01, 0], [0.0101, 0], [0.02, 0.02]];
  assert.deepEqual(simplifyPath(path, 0.002), [[0, 0], [0.01, 0], [0.02, 0.02]]);
  assert.deepEqual(simplifyPath([[0.1, 0.1]], 0.002), [[0.1, 0.1]]);
});
