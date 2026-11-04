import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageText, findMatches, matchRects, snippet } from './search.mjs';

// pdf.js text items: str, transform (glyph space → PDF user space), width (user space), hasEOL
const item = (str, x, y, width, size = 10, hasEOL = false) => ({ str, transform: [size, 0, 0, size, x, y], width, hasEOL });
// a 100 × 200 page at scale 1: pdf.js flips y (user space starts at the bottom)
const viewport = { transform: [1, 0, 0, -1, 0, 200], width: 100, height: 200 };

test('pageText joins the items, a line break after each line, and remembers where each item is', () => {
  const { text, spans } = pageText([item('The old ', 0, 190, 40), item('mill', 40, 190, 20, 10, true), item('Trapdoor', 0, 170, 40)]);
  assert.equal(text, 'The old mill\nTrapdoor');
  assert.deepEqual(spans, [{ start: 0, end: 8, item: 0 }, { start: 8, end: 12, item: 1 }, { start: 13, end: 21, item: 2 }]);
  assert.deepEqual(pageText([]).text, '');
});

test('findMatches: any case, any run of spaces or line breaks between words, never overlapping', () => {
  const text = 'The Old  mill\nold mill. OLD MILL';
  assert.deepEqual(findMatches(text, 'old mill'), [{ start: 4, end: 13 }, { start: 14, end: 22 }, { start: 24, end: 32 }]);
  assert.deepEqual(findMatches('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.deepEqual(findMatches(text, '   '), []);
  assert.deepEqual(findMatches('cost (5 gp)', '(5 gp)'), [{ start: 5, end: 11 }]); // not a regex
  assert.deepEqual(findMatches('Żółw ŻÓŁW', 'żółw').length, 2);
  assert.equal(findMatches('a a a a a', 'a', 3).length, 3);
});

test('matchRects: the part of each item a match covers, in page fractions, one rect per line', () => {
  const items = [item('The old ', 0, 190, 40), item('mill', 40, 190, 20, 10, true), item('Trapdoor', 0, 170, 40)];
  const { text, spans } = pageText(items);
  const [m] = findMatches(text, 'old mill');
  const rects = matchRects(items, spans, m, viewport);
  assert.equal(rects.length, 1);
  const [x, y, w, h] = rects[0];
  assert.ok(Math.abs(x - 0.2) < 0.01, `x ${x}`); // "old" starts at char 4 of 8 → 20 of 100
  assert.ok(Math.abs(x + w - 0.6) < 0.01, `right ${x + w}`); // "mill" ends at 60
  assert.ok(y < 10 / 200 && y + h > 10 / 200, 'around the baseline at y=10 from the top');

  const [across] = findMatches(text, 'mill trapdoor');
  assert.equal(matchRects(items, spans, across, viewport).length, 2); // two lines
});

test('matchRects works on a rotated page (an axis-aligned box around the text)', () => {
  const items = [item('Hello', 10, 20, 25)];
  const rotated = { transform: [0, 1, 1, 0, 0, 0], width: 200, height: 100 }; // 90°: x ↔ y
  const [r] = matchRects(items, pageText(items).spans, { start: 0, end: 5 }, rotated);
  assert.ok(r[3] > r[2], 'tall, not wide');
  assert.ok(r.every((n) => n >= 0 && n <= 1));
});

test('snippet: the match with some words around it, on one line', () => {
  const text = 'a'.repeat(100) + ' the trap\ndoor ' + 'b'.repeat(100);
  const s = snippet(text, 105, 114, 10);
  assert.equal(s.hit, 'trap door');
  assert.equal(s.before, '…aaaaa the ');
  assert.equal(s.after, ' bbbbbbbbb…');
  assert.deepEqual(snippet('trap', 0, 4), { before: '', hit: 'trap', after: '' });
});
