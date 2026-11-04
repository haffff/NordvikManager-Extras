import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toIncludeScript } from '../../scripts/includeScript.mjs';
import { PROPS, parseRows, validateAnnotation, canEditAnnotation, shareDocument, showAgain, annotate } from './pdf.mjs';

const GAME = '00000000-0000-4000-8000-000000000001';
const GM = '00000000-0000-4000-8000-0000000000a1';
const ANA = '00000000-0000-4000-8000-0000000000a2';
const BO = '00000000-0000-4000-8000-0000000000a3';
const DOC = '00000000-0000-4000-8000-0000000000d1';

// A game for the workflows: properties, players and the steps a script runs (list steps
// change the list property like the server does).
function fakeGame() {
  const props = new Map();
  const key = (parent, name) => `${String(parent).toLowerCase()}|${name}`;
  const game = {
    props, steps: [],
    players: [
      { id: GM, name: 'Gamemaster', isOwner: true },
      { id: ANA, name: 'Ana', isOwner: false },
      { id: BO, name: 'Bo', isOwner: false },
    ],
    getProperty(parent, name, fallback) {
      const k = key(parent, name);
      return props.has(k) ? props.get(k) : (fallback == null ? '' : String(fallback));
    },
    setProperty(parent, name, value) { props.set(key(parent, name), String(value)); },
    find(what) {
      if (what === 'players') return game.players.slice();
      throw new Error('fake find: ' + what);
    },
    step(type, data) {
      game.steps.push({ type, data });
      const rows = () => JSON.parse(game.getProperty(data.ParentId, data.PropertyName, '[]') || '[]');
      const save = (list) => game.setProperty(data.ParentId, data.PropertyName, JSON.stringify(list));
      if (type === 'AddPropertyListItem') save([...rows(), { id: 'row' + game.steps.length, fields: JSON.parse(data.Fields) }]);
      if (type === 'UpdatePropertyListItem') save(rows().map((r) => (r.id === data.ItemId ? { ...r, fields: { ...r.fields, ...JSON.parse(data.Fields) } } : r)));
      if (type === 'RemovePropertyListItem') save(rows().filter((r) => r.id !== data.ItemId));
      return {};
    },
  };
  game.setProperty(DOC, PROPS.kind, 'document');
  game.setProperty(DOC, PROPS.source, JSON.stringify({ resourceId: 'res-1', name: 'Old Mill.pdf', pageCount: 40 }));
  game.setProperty(DOC, PROPS.annotations, '[]');
  return game;
}

const asGm = (extra) => ({ gameId: GAME, playerId: GM, playerName: 'Gamemaster', playerColor: '#ffffff', playerIsGm: 'True', ...extra });
const asAna = (extra) => ({ gameId: GAME, playerId: ANA, playerName: 'Ana', playerColor: '#ff0000', playerIsGm: 'False', ...extra });
const asBo = (extra) => ({ gameId: GAME, playerId: BO, playerName: 'Bo', playerColor: '#00ff00', playerIsGm: 'False', ...extra });
const notes = (game) => parseRows(game.getProperty(DOC, PROPS.annotations, '[]'));

// ── the include itself ───────────────────────────────────────────────────────

test('the include works as a plain script for RunScript', () => {
  const source = readFileSync(new URL('./pdf.mjs', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(toIncludeScript(source, 'pdf.mjs')));
});

// ── checks ───────────────────────────────────────────────────────────────────

test('validateAnnotation keeps the shape on the page, rounded, and refuses junk', () => {
  const ok = validateAnnotation({ kind: 'highlight', page: 3, shape: [[0.123456, 0.5, 0.3, 0.02]], color: '#FFAA00', text: ' note ' }, 40);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { kind: 'highlight', page: 3, shape: [[0.1235, 0.5, 0.3, 0.02]], color: '#ffaa00', text: 'note', parent: '' });

  assert.equal(validateAnnotation({ kind: 'highlight', page: 41, shape: [[0, 0, 0.1, 0.1]] }, 40).ok, false, 'past the last page');
  assert.equal(validateAnnotation({ kind: 'highlight', page: 0, shape: [[0, 0, 0.1, 0.1]] }, 40).ok, false);
  assert.equal(validateAnnotation({ kind: 'script', page: 3, shape: [] }, 40).ok, false);
  assert.equal(validateAnnotation({ kind: 'box', page: 3, shape: [[0.5, 0.5, 0.9, 0.1]] }, 40).ok, false, 'off the page');
  assert.equal(validateAnnotation({ kind: 'pin', page: 3, shape: [0.2, 0.3], color: 'red' }, 40).ok, false, 'colour');
  assert.equal(validateAnnotation({ kind: 'pin', page: 3, shape: [0.2, 0.3], text: 'x'.repeat(2001) }, 40).ok, false);
  assert.equal(validateAnnotation({ kind: 'ink', page: 3, shape: Array.from({ length: 1501 }, () => [0.1, 0.1]) }, 40).ok, false);
  assert.equal(validateAnnotation({ kind: 'ink', page: 3, shape: [[0.1, 0.1]] }, 40).ok, false, 'a stroke needs two points');
  assert.equal(validateAnnotation({ kind: 'reply', parent: 'row1', text: '' }, 40).ok, false, 'an empty reply');
  assert.equal(validateAnnotation({ kind: 'reply', parent: 'row1', text: 'Agreed' }, 40).ok, true);
});

test('canEditAnnotation: the author or a GM', () => {
  const row = { id: 'r', fields: { author: ANA } };
  assert.equal(canEditAnnotation(row, ANA.toUpperCase(), false), true);
  assert.equal(canEditAnnotation(row, BO, false), false);
  assert.equal(canEditAnnotation(row, BO, true), true);
});

// ── sharing (GM) ─────────────────────────────────────────────────────────────

test('shareDocument lets everyone read the PDF and opens it for the other players', () => {
  const game = fakeGame();
  const out = shareDocument(game, asGm({ documentId: DOC }));
  assert.equal(out.failed, 'no', out.notice);

  assert.ok(game.steps.some((s) => s.type === 'SetPermission' && s.data.EntityId === DOC && s.data.Player === ''));
  assert.equal(game.getProperty(DOC, PROPS.shared), 'true');
  const views = game.steps.filter((s) => s.type === 'ShowView');
  assert.deepEqual(views.map((s) => s.data.Player).sort(), [ANA, BO].sort());
  assert.deepEqual(JSON.parse(views[0].data.Data), { documentId: DOC });
});

test('shareDocument refuses players, other cards and a document without a PDF', () => {
  const game = fakeGame();
  assert.equal(shareDocument(game, asAna({ documentId: DOC })).failed, 'yes');
  assert.equal(shareDocument(game, asGm({ documentId: GAME })).failed, 'yes');
  game.setProperty(DOC, PROPS.source, '');
  assert.equal(shareDocument(game, asGm({ documentId: DOC })).failed, 'yes');
  assert.equal(game.steps.length, 0);
});

test('showAgain opens a shared PDF for the others; not before it is shared', () => {
  const game = fakeGame();
  assert.equal(showAgain(game, asGm({ documentId: DOC })).failed, 'yes');
  shareDocument(game, asGm({ documentId: DOC }));
  game.steps.length = 0;

  assert.equal(showAgain(game, asGm({ documentId: DOC })).failed, 'no');
  assert.deepEqual(game.steps.map((s) => s.type), ['ShowView', 'ShowView']);
  assert.equal(showAgain(game, asAna({ documentId: DOC })).failed, 'yes');
});

// ── annotations (everyone who can read the PDF) ──────────────────────────────

test("annotate adds a player's note with them as author, in their colour by default", () => {
  const game = fakeGame();
  const out = annotate(game, asAna({ documentId: DOC, op: 'add', annotation: JSON.stringify({ kind: 'pin', page: 4, shape: [0.5, 0.25], text: 'Trapdoor?' }) }));
  assert.equal(out.failed, 'no', out.notice);
  const [row] = notes(game);
  assert.equal(row.fields.author, ANA);
  assert.equal(row.fields.authorName, 'Ana');
  assert.equal(row.fields.color, '#ff0000');
  assert.equal(row.fields.shape, '[0.5,0.25]');
  assert.equal(row.fields.page, '4');
  assert.equal(row.fields.text, 'Trapdoor?');
});

test('annotate: only the author or a GM changes or removes; removing takes its replies along', () => {
  const game = fakeGame();
  const add = (vars, a) => annotate(game, { ...vars, documentId: DOC, op: 'add', annotation: JSON.stringify(a) });
  add(asAna(), { kind: 'box', page: 3, shape: [[0.1, 0.1, 0.2, 0.2]] });
  const [mine] = notes(game);
  add(asBo(), { kind: 'reply', parent: mine.id, text: 'Looks like a door' });

  assert.equal(annotate(game, asBo({ documentId: DOC, op: 'update', itemId: mine.id, annotation: JSON.stringify({ text: 'mine now' }) })).failed, 'yes');
  assert.equal(annotate(game, asBo({ documentId: DOC, op: 'remove', itemId: mine.id })).failed, 'yes');

  assert.equal(annotate(game, asAna({ documentId: DOC, op: 'update', itemId: mine.id, annotation: JSON.stringify({ text: 'Door', author: BO, kind: 'pin' }) })).failed, 'no');
  const updated = notes(game).find((r) => r.id === mine.id);
  assert.equal(updated.fields.text, 'Door');
  assert.equal(updated.fields.author, ANA);
  assert.equal(updated.fields.kind, 'box');

  assert.equal(annotate(game, asGm({ documentId: DOC, op: 'remove', itemId: mine.id })).failed, 'no');
  assert.equal(notes(game).length, 0);
});

test('annotate refuses other cards, unknown rows and replies to nothing', () => {
  const game = fakeGame();
  assert.equal(annotate(game, asAna({ documentId: GAME, op: 'add', annotation: JSON.stringify({ kind: 'pin', page: 3, shape: [0.1, 0.1] }) })).failed, 'yes');
  assert.equal(annotate(game, asAna({ documentId: DOC, op: 'remove', itemId: 'nope' })).failed, 'yes');
  assert.equal(annotate(game, asAna({ documentId: DOC, op: 'add', annotation: JSON.stringify({ kind: 'reply', parent: 'nope', text: 'hi' }) })).failed, 'yes');
  assert.equal(annotate(game, asAna({ documentId: DOC, op: 'explode' })).failed, 'yes');
  assert.equal(notes(game).length, 0);
});
