import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAnnotations, decodeView, presenterView } from './model.mjs';

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

test("decodeView: the GM's place, or null", () => {
  assert.deepEqual(decodeView('{"page":4,"scroll":0.5,"by":"gm","at":"t"}'), { page: 4, scroll: 0.5, by: 'gm', at: 't' });
  assert.equal(decodeView(''), null);
  assert.equal(decodeView('{"page":"x"}'), null);
});

test("presenterView: where the GM's scrolling moves the players; null when they're (nearly) there", () => {
  assert.deepEqual(presenterView({ page: 3, scroll: 0 }, 4, 0.25, 'gm'), { page: 4, scroll: 0.25, by: 'gm' });
  assert.deepEqual(presenterView(null, 250, 0.123456, 'gm'), { page: 250, scroll: 0.1235, by: 'gm' });
  assert.equal(presenterView({ page: 4, scroll: 0.25 }, 4, 0.2501, 'gm'), null);
});
