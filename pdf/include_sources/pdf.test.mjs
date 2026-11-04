import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toIncludeScript } from '../../scripts/includeScript.mjs';
import {
  PROPS, parsePages, parseRows, validateAnnotation, canEditAnnotation, shareKey,
  startShare, showAgain, removeShare, annotate,
} from './pdf.mjs';

const GAME = '00000000-0000-4000-8000-000000000001';
const GM = '00000000-0000-4000-8000-0000000000a1';
const ANA = '00000000-0000-4000-8000-0000000000a2';
const BO = '00000000-0000-4000-8000-0000000000a3';
const DOC = '00000000-0000-4000-8000-0000000000d1';
const TEMPLATE = '00000000-0000-4000-8000-0000000000c1';
const SID = '0123456789abcdef0123456789abcdef';
const KEY = `pdf_share_${SID}.pdf`;

// A game for the workflows: properties, players, cards and the steps a script runs
// (list steps change the list property like the server does).
function fakeGame() {
  const props = new Map();
  const key = (parent, name) => `${String(parent).toLowerCase()}|${name}`;
  let next = 0;
  const cards = [{ id: TEMPLATE, name: 'PDF Presentation', key: 'pdf_presentation', isTemplate: true, isHidden: true }];
  const game = {
    props, cards, steps: [], created: [],
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
    find(what, options) {
      if (what === 'players') return game.players.slice();
      if (what === 'cards') return cards.filter((c) => (options && options.includeTemplates) || !c.isTemplate);
      throw new Error('fake find: ' + what);
    },
    createCard(options) {
      next += 1;
      const id = `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
      cards.push({ id, name: options.name, key: 'pdf_presentation', isTemplate: false, isHidden: false });
      game.created.push({ id, ...options });
      return id;
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
  return game;
}

const asGm = (extra) => ({ gameId: GAME, playerId: GM, playerName: 'Gamemaster', playerColor: '#ffffff', playerIsGm: 'True', ...extra });
const asAna = (extra) => ({ gameId: GAME, playerId: ANA, playerName: 'Ana', playerColor: '#ff0000', playerIsGm: 'False', ...extra });
const asBo = (extra) => ({ gameId: GAME, playerId: BO, playerName: 'Bo', playerColor: '#00ff00', playerIsGm: 'False', ...extra });
const listOf = (game, id, name) => parseRows(game.getProperty(id, name, '[]'));

function shared(game, extra) {
  const out = startShare(game, asGm({ documentId: DOC, title: 'The cellar', pages: '3-4', resourceKey: KEY, kind: 'copy', ...extra }));
  assert.equal(out.failed, 'no', out.notice);
  return out;
}

// ── the include itself ───────────────────────────────────────────────────────

test('the include works as a plain script for RunScript', () => {
  const source = readFileSync(new URL('./pdf.mjs', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(toIncludeScript(source, 'pdf.mjs')));
});

// ── checks ───────────────────────────────────────────────────────────────────

test('parsePages reads lists and ranges, sorted and unique, within the document', () => {
  assert.deepEqual(parsePages('3-5, 8, 4', 40), [3, 4, 5, 8]);
  assert.deepEqual(parsePages('[7, 2]', 40), [2, 7]);
  assert.deepEqual(parsePages(' 12 ', 40), [12]);
  assert.equal(parsePages('0-2', 40), null);
  assert.equal(parsePages('39-41', 40), null);
  assert.equal(parsePages('5-3', 40), null);
  assert.equal(parsePages('', 40), null);
  assert.equal(parsePages('a', 40), null);
  assert.equal(parsePages('1-500', 1000), null); // at most 200 pages in one share
});

test('shareKey makes a random, unguessable resource key and its share id', () => {
  const a = shareKey(), b = shareKey();
  assert.match(a.key, /^pdf_share_[0-9a-f]{32}\.pdf$/);
  assert.equal(a.key, `pdf_share_${a.sid}.pdf`);
  assert.notEqual(a.sid, b.sid);
});

test('validateAnnotation keeps the shape on the page, rounded, and refuses junk', () => {
  const ok = validateAnnotation({ kind: 'highlight', page: 3, shape: [[0.123456, 0.5, 0.3, 0.02]], color: '#FFAA00', text: ' note ' }, [3, 4]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { kind: 'highlight', page: 3, shape: [[0.1235, 0.5, 0.3, 0.02]], color: '#ffaa00', text: 'note', parent: '' });

  assert.equal(validateAnnotation({ kind: 'highlight', page: 9, shape: [[0, 0, 0.1, 0.1]] }, [3, 4]).ok, false, 'page not shared');
  assert.equal(validateAnnotation({ kind: 'script', page: 3, shape: [] }, [3]).ok, false);
  assert.equal(validateAnnotation({ kind: 'box', page: 3, shape: [[0.5, 0.5, 0.9, 0.1]] }, [3]).ok, false, 'off the page');
  assert.equal(validateAnnotation({ kind: 'pin', page: 3, shape: [0.2, 0.3], color: 'red' }, [3]).ok, false, 'colour');
  assert.equal(validateAnnotation({ kind: 'pin', page: 3, shape: [0.2, 0.3], text: 'x'.repeat(2001) }, [3]).ok, false);
  assert.equal(validateAnnotation({ kind: 'ink', page: 3, shape: Array.from({ length: 1501 }, () => [0.1, 0.1]) }, [3]).ok, false);
  assert.equal(validateAnnotation({ kind: 'ink', page: 3, shape: [[0.1, 0.1]] }, [3]).ok, false, 'a stroke needs two points');
  assert.equal(validateAnnotation({ kind: 'reply', parent: 'row1', text: '' }, [3]).ok, false, 'an empty reply');
  assert.equal(validateAnnotation({ kind: 'reply', parent: 'row1', text: 'Agreed' }, [3]).ok, true);
});

test('canEditAnnotation: the author or a GM', () => {
  const row = { id: 'r', fields: { author: ANA } };
  assert.equal(canEditAnnotation(row, ANA.toUpperCase(), false), true);
  assert.equal(canEditAnnotation(row, BO, false), false);
  assert.equal(canEditAnnotation(row, BO, true), true);
});

// ── sharing (GM) ─────────────────────────────────────────────────────────────

test('startShare makes the presentation once, shares it with everyone, adds the share and opens it for the others', () => {
  const game = fakeGame();
  const out = shared(game);
  const pres = out.presentationId;

  assert.equal(game.getProperty(DOC, PROPS.presentation), pres);
  assert.equal(game.getProperty(pres, PROPS.kind), 'presentation');
  assert.equal(game.getProperty(pres, PROPS.document), DOC);
  assert.deepEqual(game.created.map((c) => c.templateId), [TEMPLATE]);
  assert.ok(game.steps.some((s) => s.type === 'SetPermission' && s.data.EntityId === pres && s.data.Player === ''));
  // the presentation never learns where the whole PDF is
  assert.ok(![...game.props.values()].some((v, i) => [...game.props.keys()][i].startsWith(pres) && v.includes('res-1')));

  const shares = listOf(game, pres, PROPS.shares);
  assert.equal(shares.length, 1);
  assert.deepEqual(shares[0].fields, { sid: SID, title: 'The cellar', pages: '[3,4]', resourceKey: KEY, kind: 'copy', at: shares[0].fields.at });

  assert.deepEqual(JSON.parse(game.getProperty(pres, PROPS.view)), { shareId: SID, page: 3, scroll: 0, by: GM, at: JSON.parse(game.getProperty(pres, PROPS.view)).at });
  const views = game.steps.filter((s) => s.type === 'ShowView');
  assert.deepEqual(views.map((s) => s.data.Player).sort(), [ANA, BO].sort());
  assert.deepEqual(JSON.parse(views[0].data.Data), { presentationId: pres });

  // a second share reuses the presentation
  const again = startShare(game, asGm({ documentId: DOC, title: 'Map', pages: '10', resourceKey: 'pdf_share_' + 'f'.repeat(32) + '.pdf', kind: 'image' }));
  assert.equal(again.presentationId, pres);
  assert.equal(game.created.length, 1);
  assert.equal(listOf(game, pres, PROPS.shares).length, 2);
});

test('startShare refuses players, other cards, bad pages and keys', () => {
  const game = fakeGame();
  assert.equal(startShare(game, asAna({ documentId: DOC, title: 't', pages: '1', resourceKey: KEY, kind: 'copy' })).failed, 'yes');
  assert.equal(startShare(game, asGm({ documentId: GAME, title: 't', pages: '1', resourceKey: KEY, kind: 'copy' })).failed, 'yes');
  assert.equal(startShare(game, asGm({ documentId: DOC, title: 't', pages: '41', resourceKey: KEY, kind: 'copy' })).failed, 'yes');
  assert.equal(startShare(game, asGm({ documentId: DOC, title: 't', pages: '1', resourceKey: 'dnd5e_index.html', kind: 'copy' })).failed, 'yes');
  assert.equal(startShare(game, asGm({ documentId: DOC, title: 't', pages: '1', resourceKey: KEY, kind: 'html' })).failed, 'yes');
  assert.equal(game.steps.length, 0);
});

test('startShare makes a new presentation when the old one was deleted or is not ours', () => {
  const game = fakeGame();
  game.setProperty(DOC, PROPS.presentation, '00000000-0000-4000-8000-0000000000ee'); // gone
  const out = shared(game);
  assert.notEqual(out.presentationId, '00000000-0000-4000-8000-0000000000ee');
  assert.equal(game.created.length, 1);
});

test('showAgain opens the presentation for the other players; removeShare drops the share and its file', () => {
  const game = fakeGame();
  const { presentationId } = shared(game);
  game.steps.length = 0;

  assert.equal(showAgain(game, asGm({ documentId: DOC })).failed, 'no');
  assert.deepEqual(game.steps.map((s) => s.type), ['ShowView', 'ShowView']);
  assert.equal(showAgain(game, asAna({ documentId: DOC })).failed, 'yes');

  game.steps.length = 0;
  assert.equal(removeShare(game, asGm({ documentId: DOC, shareId: SID })).failed, 'no');
  assert.equal(listOf(game, presentationId, PROPS.shares).length, 0);
  assert.deepEqual(game.steps.find((s) => s.type === 'DeleteResource').data, { Key: KEY });
  assert.equal(removeShare(game, asGm({ documentId: DOC, shareId: SID })).failed, 'yes', 'already gone');
});

// ── annotations (everyone who can read the presentation) ─────────────────────

test('annotate adds a player\'s annotation with them as author, in their colour by default', () => {
  const game = fakeGame();
  const { presentationId } = shared(game);

  const out = annotate(game, asAna({ presentationId, op: 'add', annotation: JSON.stringify({ kind: 'pin', page: 4, shape: [0.5, 0.25], text: 'Trapdoor?' }) }));
  assert.equal(out.failed, 'no', out.notice);
  const [row] = listOf(game, presentationId, PROPS.annotations);
  assert.equal(row.fields.author, ANA);
  assert.equal(row.fields.authorName, 'Ana');
  assert.equal(row.fields.color, '#ff0000');
  assert.equal(row.fields.shape, '[0.5,0.25]');
  assert.equal(row.fields.page, '4');
  assert.equal(row.fields.text, 'Trapdoor?');
});

test('annotate: only the author or a GM changes or removes; removing takes its replies along', () => {
  const game = fakeGame();
  const { presentationId } = shared(game);
  const add = (vars, a) => annotate(game, { ...vars, presentationId, op: 'add', annotation: JSON.stringify(a) });
  add(asAna(), { kind: 'box', page: 3, shape: [[0.1, 0.1, 0.2, 0.2]] });
  const [mine] = listOf(game, presentationId, PROPS.annotations);
  add(asBo(), { kind: 'reply', parent: mine.id, text: 'Looks like a door' });

  // Bo can't change or remove Ana's box
  assert.equal(annotate(game, asBo({ presentationId, op: 'update', itemId: mine.id, annotation: JSON.stringify({ text: 'mine now' }) })).failed, 'yes');
  assert.equal(annotate(game, asBo({ presentationId, op: 'remove', itemId: mine.id })).failed, 'yes');

  // Ana can; only text, colour and shape change, never the author
  assert.equal(annotate(game, asAna({ presentationId, op: 'update', itemId: mine.id, annotation: JSON.stringify({ text: 'Door', author: BO, kind: 'pin' }) })).failed, 'no');
  const updated = listOf(game, presentationId, PROPS.annotations).find((r) => r.id === mine.id);
  assert.equal(updated.fields.text, 'Door');
  assert.equal(updated.fields.author, ANA);
  assert.equal(updated.fields.kind, 'box');

  // the GM removes Ana's box, and Bo's reply goes with it
  assert.equal(annotate(game, asGm({ presentationId, op: 'remove', itemId: mine.id })).failed, 'no');
  assert.equal(listOf(game, presentationId, PROPS.annotations).length, 0);
});

test('annotate refuses other cards, unknown rows and replies to nothing', () => {
  const game = fakeGame();
  const { presentationId } = shared(game);
  assert.equal(annotate(game, asAna({ presentationId: DOC, op: 'add', annotation: JSON.stringify({ kind: 'pin', page: 3, shape: [0.1, 0.1] }) })).failed, 'yes', 'the GM\'s document');
  assert.equal(annotate(game, asAna({ presentationId, op: 'remove', itemId: 'nope' })).failed, 'yes');
  assert.equal(annotate(game, asAna({ presentationId, op: 'add', annotation: JSON.stringify({ kind: 'reply', parent: 'nope', text: 'hi' }) })).failed, 'yes');
  assert.equal(annotate(game, asAna({ presentationId, op: 'explode' })).failed, 'yes');
  assert.equal(listOf(game, presentationId, PROPS.annotations).length, 0);
});
