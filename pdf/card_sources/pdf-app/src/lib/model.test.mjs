import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeShares, decodeAnnotations, decodeView, shareForPage, pageOfShare, indexInShare, presenterView } from './model.mjs';

const shareRows = JSON.stringify([
  { id: 'r1', fields: { sid: 'a'.repeat(32), title: 'Cellar', pages: '[3,4]', resourceKey: `pdf_share_${'a'.repeat(32)}.pdf`, kind: 'copy', at: '2026-11-04T10:00:00Z' } },
  { id: 'r2', fields: { sid: 'b'.repeat(32), title: 'Map', pages: '[4,10]', resourceKey: `pdf_share_${'b'.repeat(32)}.pdf`, kind: 'image', at: '2026-11-04T11:00:00Z' } },
  { id: 'junk', fields: { sid: 'x', pages: 'nope' } },
]);

test('decodeShares reads the rows, newest last, and skips broken ones', () => {
  const shares = decodeShares(shareRows);
  assert.deepEqual(shares.map((s) => [s.sid[0], s.pages, s.kind]), [['a', [3, 4], 'copy'], ['b', [4, 10], 'image']]);
  assert.deepEqual(decodeShares(''), []);
});

test('pages of a share: share index ↔ the document\'s own page number', () => {
  const [cellar] = decodeShares(shareRows);
  assert.equal(pageOfShare(cellar, 2), 4);
  assert.equal(pageOfShare(cellar, 3), null);
  assert.equal(indexInShare(cellar, 3), 1);
  assert.equal(indexInShare(cellar, 9), null);
});

test('decodeAnnotations parses shapes, groups by page and puts replies under their note', () => {
  const rows = JSON.stringify([
    { id: 'n1', fields: { kind: 'highlight', page: '3', shape: '[[0.1,0.1,0.3,0.02]]', color: '#ffaa00', text: 'Trap', author: 'p1', authorName: 'Ana', at: '1' } },
    { id: 'n2', fields: { kind: 'reply', parent: 'n1', text: 'Agreed', author: 'p2', authorName: 'Bo', at: '2' } },
    { id: 'n3', fields: { kind: 'pin', page: '4', shape: '[0.5,0.5]', color: '#00ff00', text: '', author: 'p2', at: '3' } },
    { id: 'n4', fields: { kind: 'reply', parent: 'gone', text: 'orphan' } },
    { id: 'n5', fields: { kind: 'box', page: '3', shape: 'broken' } },
  ]);
  const { byPage, byId } = decodeAnnotations(rows);
  assert.deepEqual(byPage.get(3).map((a) => a.id), ['n1']);
  assert.deepEqual(byPage.get(4).map((a) => a.id), ['n3']);
  assert.deepEqual(byId.get('n1').shape, [[0.1, 0.1, 0.3, 0.02]]);
  assert.deepEqual(byId.get('n1').replies.map((r) => r.text), ['Agreed']);
  assert.equal(byId.has('n4'), false);
  assert.equal(byId.has('n5'), false);
});

test('decodeView: the GM\'s place, or null', () => {
  assert.deepEqual(decodeView('{"shareId":"s","page":4,"scroll":0.5,"by":"gm","at":"t"}'), { shareId: 's', page: 4, scroll: 0.5, by: 'gm', at: 't' });
  assert.equal(decodeView(''), null);
  assert.equal(decodeView('{"page":"x"}'), null);
});

test('shareForPage prefers the share players are on, then the newest that has the page', () => {
  const shares = decodeShares(shareRows);
  assert.equal(shareForPage(shares, 4, 'a'.repeat(32)).sid[0], 'a');
  assert.equal(shareForPage(shares, 4, null).sid[0], 'b');
  assert.equal(shareForPage(shares, 3, 'b'.repeat(32)).sid[0], 'a');
  assert.equal(shareForPage(shares, 7, null), null);
});

test('presenterView: where the GM\'s scrolling moves the players; null on pages they don\'t have', () => {
  const shares = decodeShares(shareRows);
  const current = { shareId: 'a'.repeat(32), page: 3, scroll: 0 };
  assert.deepEqual(presenterView(shares, current, 4, 0.25, 'gm'), { shareId: 'a'.repeat(32), page: 4, scroll: 0.25, by: 'gm' });
  assert.deepEqual(presenterView(shares, current, 10, 0.123456, 'gm'), { shareId: 'b'.repeat(32), page: 10, scroll: 0.1235, by: 'gm' });
  assert.equal(presenterView(shares, current, 7, 0, 'gm'), null);
  // nothing changed (enough): nothing to send
  assert.equal(presenterView(shares, { ...current, page: 4, scroll: 0.25 }, 4, 0.2501, 'gm'), null);
});
