import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAnnotations, decodeView, presenterView, withPending } from './model.mjs';

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

// Marks show at once: a new note is pending until the server's row with its cid arrives,
// removed and changed notes look removed and changed until the server says so.
test('withPending shows pending notes, hides removed ones, applies edits, and drops what the server has done', () => {
  const rows = JSON.stringify([
    { id: 'n1', fields: { kind: 'pin', page: '3', shape: '[0.5,0.5]', color: '#00ff00', text: 'old', author: 'p1' } },
    { id: 'n2', fields: { kind: 'box', page: '3', shape: '[[0.1,0.1,0.2,0.2]]', color: '#00ff00', text: '', author: 'p1', cid: 'c1' } },
    { id: 'n3', fields: { kind: 'pin', page: '4', shape: '[0.2,0.2]', color: '#00ff00', text: '', author: 'p1' } },
  ]);
  const decoded = decodeAnnotations(rows);
  const pending = {
    added: [
      { cid: 'c1', kind: 'box', page: 3, shape: [[0.1, 0.1, 0.2, 0.2]], color: '#ff0000' }, // the server has it now
      { cid: 'c2', kind: 'pin', page: 4, shape: [0.9, 0.9], color: '#ff0000', text: 'new' },
      { cid: 'c3', kind: 'reply', parent: 'n1', text: 'agreed' },
    ],
    removed: new Set(['n3']),
    edited: new Map([['n1', { text: 'edited' }]]),
  };

  const { byId, byPage, settled } = withPending(decoded, pending, { id: 'p1', name: 'Ana' });

  assert.deepEqual(byPage.get(3).map((n) => n.id), ['n1', 'n2']);
  assert.deepEqual(byPage.get(4).map((n) => n.id), ['pending:c2']);
  assert.deepEqual([byId.get('pending:c2').pending, byId.get('pending:c2').text, byId.get('pending:c2').author, byId.get('pending:c2').authorName], [true, 'new', 'p1', 'Ana']);
  assert.equal(byId.get('n1').text, 'edited');
  assert.deepEqual(byId.get('n1').replies.map((r) => r.text), ['agreed']);
  assert.equal(byId.has('n3'), false);
  assert.deepEqual(settled, { added: ['c1'], removed: [], edited: [] });
});

test('withPending: a removal and an edit are settled once the server shows them', () => {
  const decoded = decodeAnnotations(JSON.stringify([
    { id: 'n1', fields: { kind: 'pin', page: '3', shape: '[0.5,0.5]', text: 'edited', author: 'p1' } },
  ]));
  const { settled } = withPending(decoded, { added: [], removed: new Set(['gone']), edited: new Map([['n1', { text: 'edited' }]]) }, { id: 'p1' });
  assert.deepEqual(settled, { added: [], removed: ['gone'], edited: ['n1'] });
});

test('withPending keeps the arrays of pages nothing is pending on', () => {
  const decoded = decodeAnnotations(JSON.stringify([
    { id: 'n1', fields: { kind: 'pin', page: '3', shape: '[0.5,0.5]', author: 'p1' } },
    { id: 'n2', fields: { kind: 'pin', page: '7', shape: '[0.5,0.5]', author: 'p1' } },
  ]));
  const out = withPending(decoded, { added: [{ cid: 'c9', kind: 'pin', page: 7, shape: [0.1, 0.1] }], removed: new Set(), edited: new Map() }, { id: 'p1' });
  assert.equal(out.byPage.get(3), decoded.byPage.get(3));
  assert.notEqual(out.byPage.get(7), decoded.byPage.get(7));
  assert.equal(out.byPage.get(7).length, 2);
});
