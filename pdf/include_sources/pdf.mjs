// PDF viewer helpers shared by the addon's actions (RunScript "Include": "pdf_pdf.js") and its
// card. Plain JavaScript only: RunScript runs it in Jint on the GM's server (no DOM, no
// network). pnpm run pack drops the `export` keywords.
//
// One card per PDF (template pdf_document): where the file is (`pdf_source`), where the GM is
// when presenting (`pdf_view`) and everyone's notes (`pdf_annotations`). Sharing it gives every
// player Read on the card, so they can open the whole PDF (read in parts, as pdf.js needs them)
// and follow the GM anywhere in it. Players can only read the card, so their notes go through
// the annotate action. The workflows take RunScript's `game` and `vars` and run as the system:
// they check who is asking themselves (`vars.playerId`, `vars.playerIsGm` are built-ins a
// caller can't override), and the action checks Read on the card before the script runs.
// List rows are { id, fields } with string fields only (the server's list steps).

export const PROPS = {
  kind: 'pdf_kind',
  source: 'pdf_source',
  shared: 'pdf_shared',
  view: 'pdf_view',
  annotations: 'pdf_annotations',
};
export const VIEWER_VIEW = 'pdf_viewer';
export const DOCUMENT_TEMPLATE = 'pdf_document';
export const DOCUMENT_FOLDER = 'PDF';
export const MAX_NAME = 100;
export const MAX_PAGES = 100000;
export const ANNOTATION_KINDS = ['highlight', 'box', 'pin', 'ink', 'reply'];
export const MAX_TEXT = 2000;
export const MAX_RECTS = 100;
export const MAX_POINTS = 1500;
export const MAX_ANNOTATIONS = 2000;
// One player's notes (GMs aside), and all notes together (characters of the stored list):
// every reader downloads and reads them.
export const MAX_NOTES_PER_PLAYER = 300;
export const MAX_NOTES_CHARS = 2000000;
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UPLOAD_KEY = /^pdf_src_[0-9a-f]{32}\.pdf$/;
const ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

// ── small helpers ────────────────────────────────────────────────────────────

export function isGuid(value) {
  return typeof value === 'string' && GUID.test(value);
}

export function truthy(value) {
  return value === true || /^true$/i.test(String(value == null ? '' : value).trim());
}

function text(value) {
  return value == null ? '' : String(value);
}

function sameId(a, b) {
  return text(a).toLowerCase() === text(b).toLowerCase() && text(a) !== '';
}

export function parseJson(value) {
  if (value !== null && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  try { return JSON.parse(value); } catch (e) { return null; }
}

/** A list property's rows, [] for anything else. */
export function parseRows(value) {
  const rows = parseJson(value);
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === 'string' && r.fields && typeof r.fields === 'object') : [];
}

/** Text without control characters, trimmed; null when longer than max. */
function cleanText(value, max) {
  const t = text(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return t.length > max ? null : t;
}

const round4 = (n) => Math.round(n * 10000) / 10000;
const inUnit = (n) => typeof n === 'number' && isFinite(n) && n >= 0 && n <= 1;

/** [x, y] on the page (0..1), rounded; null otherwise. */
function point(value) {
  if (!Array.isArray(value) || value.length !== 2 || !inUnit(value[0]) || !inUnit(value[1])) return null;
  return [round4(value[0]), round4(value[1])];
}

/** [x, y, w, h] inside the page (0..1), rounded; null otherwise. */
function rect(value) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(inUnit)) return null;
  const [x, y, w, h] = value;
  if (x + w > 1.0001 || y + h > 1.0001 || w <= 0 || h <= 0) return null;
  return [round4(x), round4(y), round4(w), round4(h)];
}

/** An annotation's shape for its kind, or null. */
export function validShape(kind, shape) {
  if (kind === 'pin') return point(shape);
  if (kind === 'reply') return null;
  if (!Array.isArray(shape) || !shape.length) return null;
  if (kind === 'ink') {
    if (shape.length < 2 || shape.length > MAX_POINTS) return null;
    const points = shape.map(point);
    return points.every(Boolean) ? points : null;
  }
  if (shape.length > (kind === 'box' ? 1 : MAX_RECTS)) return null;
  const rects = shape.map(rect);
  return rects.every(Boolean) ? rects : null;
}

/**
 * What a client sent for a new annotation, checked: { ok, value: { kind, page, shape, color,
 * text, parent } } or { ok: false, error }. Pages are 1..pageCount; a reply names its parent
 * and has text only.
 */
export function validateAnnotation(input, pageCount) {
  const a = parseJson(input) || {};
  const kind = text(a.kind);
  if (ANNOTATION_KINDS.indexOf(kind) < 0) return { ok: false, error: 'Unknown kind of annotation.' };
  const body = cleanText(a.text, MAX_TEXT);
  if (body === null) return { ok: false, error: `A note can be at most ${MAX_TEXT} characters.` };
  const color = text(a.color) === '' ? '' : text(a.color).toLowerCase();
  if (color && !COLOR.test(color)) return { ok: false, error: 'A colour is written as #rrggbb.' };

  if (kind === 'reply') {
    if (!ROW_ID.test(text(a.parent))) return { ok: false, error: 'A reply needs the note it answers.' };
    if (!body) return { ok: false, error: 'A reply needs some text.' };
    return { ok: true, value: { kind, page: 0, shape: null, color, text: body, parent: text(a.parent) } };
  }
  const page = Number(a.page);
  if (!Number.isInteger(page) || page < 1 || page > (Number(pageCount) || 0)) return { ok: false, error: 'That page isn\'t in the PDF.' };
  const shape = validShape(kind, a.shape);
  if (!shape) return { ok: false, error: 'That shape doesn\'t fit on the page.' };
  return { ok: true, value: { kind, page, shape, color, text: body, parent: '' } };
}

/** The author changes or removes an annotation; so does a GM. */
export function canEditAnnotation(row, playerId, isGm) {
  return isGm === true || (!!row && sameId(row.fields.author, playerId));
}

/** What a workflow hands the action's later steps (and the caller). */
export function outcome(reply) {
  const r = reply || {};
  const result = { failed: r.ok === false ? 'yes' : 'no', notice: r.error || r.message || '' };
  result.hasNotice = result.notice ? 'yes' : 'no';
  for (const k in r) if (k !== 'ok' && k !== 'error' && k !== 'message') result[k] = r[k];
  return result;
}

const fail = (error) => outcome({ ok: false, error });
const now = () => new Date().toISOString();

// ── the document ─────────────────────────────────────────────────────────────

/** The document card's source ({ resourceId | key, name, pageCount }), or null when it isn't one or has no PDF yet. */
function loadDocument(game, documentId) {
  if (!isGuid(text(documentId)) || game.getProperty(documentId, PROPS.kind, '') !== 'document') return null;
  const source = parseJson(game.getProperty(documentId, PROPS.source, ''));
  return source && (source.resourceId || source.key) ? source : null;
}

/** Opens the viewer for every player but the one asking (the GM has the document open). */
function showToOthers(game, vars, documentId) {
  for (const p of game.find('players', {})) {
    if (sameId(p.id, vars.playerId)) continue;
    game.step('ShowView', { ViewKey: VIEWER_VIEW, Player: p.id, Data: JSON.stringify({ documentId }) });
  }
}

/** The GM shares the PDF: every player may read the card (and so the whole PDF); it opens for them. vars: documentId */
export function shareDocument(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail('Only the GM can share a PDF.');
  if (!loadDocument(game, vars.documentId)) return fail('Pick a PDF first.');
  game.step('SetPermission', { EntityId: vars.documentId, Player: '', Permission: 'Read' });
  game.setProperty(vars.documentId, PROPS.shared, 'true');
  showToOthers(game, vars, vars.documentId);
  return outcome({ ok: true });
}

/** Opens a shared PDF for the other players again (they closed it). vars: documentId */
export function showAgain(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail('Only the GM can do that.');
  if (!loadDocument(game, vars.documentId)) return fail('Pick a PDF first.');
  if (!truthy(game.getProperty(vars.documentId, PROPS.shared, ''))) return fail('Share the PDF first.');
  showToOthers(game, vars, vars.documentId);
  return outcome({ ok: true });
}

/** A document card's name from its file name: without ".pdf", cleaned, at most MAX_NAME characters; "PDF" when nothing is left. */
export function documentName(fileName) {
  const t = Array.from(text(fileName)).filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').trim().replace(/[.]pdf$/i, '').trim();
  return t.slice(0, MAX_NAME).trim() || 'PDF';
}

/** A picked PDF ({ resourceId | key, name, pageCount }) checked, or null: a Materials file by id or a file uploaded by the picker. */
function validSource(value) {
  const s = parseJson(value);
  if (!s || typeof s !== 'object') return null;
  const pageCount = Number(s.pageCount);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES) return null;
  const name = cleanText(s.name, 500) || '';
  if (isGuid(text(s.resourceId))) return { resourceId: text(s.resourceId), name, pageCount };
  if (UPLOAD_KEY.test(text(s.key))) return { key: text(s.key), name, pageCount };
  return null;
}

function templateId(game, key) {
  const found = (game.find('cards', { includeTemplates: true }) || []).filter((c) => c.key === key && c.isTemplate);
  return found.length ? text(found[0].id) : '';
}

/** The GM picked a PDF for a new document: a card named after the file, the PDF already set. vars: source (JSON). Out: documentId */
export function newDocument(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail('Only the GM can add a PDF.');
  const source = validSource(vars.source);
  if (!source) return fail("That isn't a PDF the viewer can open.");
  const template = templateId(game, DOCUMENT_TEMPLATE);
  if (!template) return fail("The PDF Viewer's template is missing: reinstall the addon.");
  const documentId = text(game.createCard({ name: documentName(source.name), templateId: template, owner: text(vars.playerId), folder: DOCUMENT_FOLDER }));
  game.setProperty(documentId, PROPS.source, JSON.stringify(source));
  return outcome({ ok: true, documentId });
}

// ── annotations ──────────────────────────────────────────────────────────────

/**
 * Adds, changes or removes a note. The action has already checked that the player can read
 * the document. vars: documentId, op (add, update, remove), itemId, annotation (JSON: kind,
 * page, shape, color, text, parent).
 */
export function annotate(game, vars) {
  const documentId = text(vars.documentId);
  const source = loadDocument(game, documentId);
  if (!source) return fail('That isn\'t a PDF.');
  const isGm = truthy(vars.playerIsGm);
  const stored = game.getProperty(documentId, PROPS.annotations, '[]');
  const rows = parseRows(stored);
  const list = { ParentId: documentId, PropertyName: PROPS.annotations };
  const op = text(vars.op);

  if (op === 'add') {
    if (rows.length >= MAX_ANNOTATIONS || String(stored || '').length >= MAX_NOTES_CHARS) return fail('This PDF has as many notes as it can hold.');
    if (!isGm && rows.filter((r) => r.fields.author === text(vars.playerId)).length >= MAX_NOTES_PER_PLAYER)
      return fail(`You can have at most ${MAX_NOTES_PER_PLAYER} notes on one PDF.`);
    const checked = validateAnnotation(vars.annotation, source.pageCount);
    if (!checked.ok) return fail(checked.error);
    const a = checked.value;
    if (a.kind === 'reply' && !rows.some((r) => r.id === a.parent && r.fields.kind !== 'reply')) return fail('That note is gone.');
    const color = a.color || (COLOR.test(text(vars.playerColor)) ? text(vars.playerColor).toLowerCase() : '#ffd54f');
    // the client's id for its pending copy of the note (it swaps the copy for this row)
    const sent = parseJson(vars.annotation) || {};
    const cid = ROW_ID.test(text(sent.cid)) ? text(sent.cid) : '';
    game.step('AddPropertyListItem', {
      ...list,
      Fields: JSON.stringify({
        kind: a.kind, page: String(a.page), shape: a.shape ? JSON.stringify(a.shape) : '', color, text: a.text,
        parent: a.parent, author: text(vars.playerId), authorName: cleanText(vars.playerName, 100) || '', at: now(), cid,
      }),
    });
    return outcome({ ok: true });
  }

  const row = ROW_ID.test(text(vars.itemId)) ? rows.find((r) => r.id === vars.itemId) : null;
  if (op !== 'update' && op !== 'remove') return fail('Unknown change.');
  if (!row) return fail('That note is gone.');
  if (!canEditAnnotation(row, vars.playerId, isGm)) return fail('Only who wrote a note (or the GM) can change it.');

  if (op === 'remove') {
    for (const reply of rows.filter((r) => r.fields.parent === row.id)) game.step('RemovePropertyListItem', { ...list, ItemId: reply.id });
    game.step('RemovePropertyListItem', { ...list, ItemId: row.id });
    return outcome({ ok: true });
  }

  // update: only the text, colour and shape (checked against the row's own kind)
  const change = parseJson(vars.annotation) || {};
  const fields = {};
  if ('text' in change) {
    const body = cleanText(change.text, MAX_TEXT);
    if (body === null) return fail(`A note can be at most ${MAX_TEXT} characters.`);
    if (!body && row.fields.kind === 'reply') return fail('A reply needs some text.');
    fields.text = body;
  }
  if ('color' in change) {
    if (!COLOR.test(text(change.color))) return fail('A colour is written as #rrggbb.');
    fields.color = text(change.color).toLowerCase();
  }
  if ('shape' in change && row.fields.kind !== 'reply') {
    const shape = validShape(row.fields.kind, change.shape);
    if (!shape) return fail('That shape doesn\'t fit on the page.');
    fields.shape = JSON.stringify(shape);
  }
  if (!Object.keys(fields).length) return outcome({ ok: true });
  fields.edited = now();
  game.step('UpdatePropertyListItem', { ...list, ItemId: row.id, Fields: JSON.stringify(fields) });
  return outcome({ ok: true });
}
