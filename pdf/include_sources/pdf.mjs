// PDF viewer helpers shared by the addon's actions (RunScript "Include": "pdf_pdf.js") and its
// card. Plain JavaScript only: RunScript runs it in Jint on the GM's server (no DOM, no
// network). pnpm run pack drops the `export` keywords.
//
// Two cards per PDF:
// - the document (template pdf_document) is the GM's and never shared: it knows where the
//   whole file is (`pdf_source`). Resources have no read check of their own (anyone in the
//   game who knows a resource's id or key can read it), so that reference must stay on a card
//   players can't read.
// - its presentation (template pdf_presentation) is what players read (SetPermission Read for
//   everyone) and open in the pdf_viewer view: the shares (`pdf_shares`, each a small PDF of
//   the shown pages, made when the GM shows them, under a random key), where the GM is
//   (`pdf_view`) and everyone's annotations (`pdf_annotations`).
// Players can only read the presentation, so their annotations go through the annotate
// action. The workflows take RunScript's `game` and `vars` and run as the system: they check
// who is asking themselves (`vars.playerId`, `vars.playerIsGm` are built-ins a caller can't
// override), and the action checks Read on the presentation before the script runs.
// List rows are { id, fields } with string fields only (the server's list steps).

export const PROPS = {
  kind: 'pdf_kind',
  source: 'pdf_source',
  presentation: 'pdf_presentation',
  document: 'pdf_document',
  title: 'pdf_title',
  shares: 'pdf_shares',
  view: 'pdf_view',
  annotations: 'pdf_annotations',
};
export const PRESENTATION_TEMPLATE = 'pdf_presentation';
export const VIEWER_VIEW = 'pdf_viewer';
export const DEFAULT_FOLDER = 'PDF';
export const SHARE_KINDS = ['copy', 'image'];
export const ANNOTATION_KINDS = ['highlight', 'box', 'pin', 'ink', 'reply'];
export const MAX_SHARE_PAGES = 200;
export const MAX_TITLE = 100;
export const MAX_TEXT = 2000;
export const MAX_RECTS = 100;
export const MAX_POINTS = 1500;
export const MAX_ANNOTATIONS = 2000;
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SHARE_KEY = /^pdf_share_([0-9a-f]{32})\.pdf$/;
const SID = /^[0-9a-f]{32}$/;
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

/**
 * Pages "3-5, 8" (or a JSON list) as sorted unique page numbers 1..pageCount; null when any
 * part is wrong, none is given or there are more than MAX_SHARE_PAGES.
 */
export function parsePages(value, pageCount) {
  const list = parseJson(value);
  const parts = Array.isArray(list) ? list.map(String) : text(value).split(',');
  const pages = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const from = range ? Number(range[1]) : (/^\d+$/.test(part) ? Number(part) : NaN);
    const to = range ? Number(range[2]) : from;
    if (!(from >= 1) || !(to >= from) || to > pageCount || to - from >= MAX_SHARE_PAGES) return null;
    for (let p = from; p <= to; p++) if (pages.indexOf(p) < 0) pages.push(p);
    if (pages.length > MAX_SHARE_PAGES) return null;
  }
  return pages.length ? pages.sort((a, b) => a - b) : null;
}

/** A new share's resource key (game-wide, random so it can't be guessed) and its share id. */
export function shareKey() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const sid = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { sid, key: `pdf_share_${sid}.pdf` };
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
 * text, parent } } or { ok: false, error }. Pages must be shared (sharedPages); a reply
 * names its parent and has text only.
 */
export function validateAnnotation(input, sharedPages) {
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
  if (!Number.isInteger(page) || (sharedPages || []).indexOf(page) < 0) return { ok: false, error: 'That page isn\'t shared.' };
  const shape = validShape(kind, a.shape);
  if (!shape) return { ok: false, error: 'That shape doesn\'t fit on the page.' };
  return { ok: true, value: { kind, page, shape, color, text: body, parent: '' } };
}

/** The author changes or removes an annotation; so does a GM. */
export function canEditAnnotation(row, playerId, isGm) {
  return isGm === true || (!!row && sameId(row.fields.author, playerId));
}

/** Every page in the presentation's shares. */
export function sharedPages(game, presentationId) {
  const pages = [];
  for (const row of parseRows(game.getProperty(presentationId, PROPS.shares, '[]'))) {
    for (const p of parseJson(row.fields.pages) || []) if (pages.indexOf(p) < 0) pages.push(p);
  }
  return pages;
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

// ── documents and presentations ──────────────────────────────────────────────

function loadDocument(game, documentId) {
  if (!isGuid(text(documentId)) || game.getProperty(documentId, PROPS.kind, '') !== 'document') return null;
  return parseJson(game.getProperty(documentId, PROPS.source, '')) || {};
}

/** The document's presentation, if it still is one (and still points back at it). */
function presentationOf(game, documentId) {
  const id = text(game.getProperty(documentId, PROPS.presentation, ''));
  if (!isGuid(id)) return '';
  const isOurs = game.getProperty(id, PROPS.kind, '') === 'presentation' && sameId(game.getProperty(id, PROPS.document, ''), documentId);
  return isOurs ? id : '';
}

function createPresentation(game, vars, documentId, title) {
  const template = game.find('cards', { includeTemplates: true }).find((c) => c.isTemplate && c.key === PRESENTATION_TEMPLATE);
  if (!template) return '';
  const id = String(game.createCard({ name: title, templateId: template.id, folder: DEFAULT_FOLDER }));
  game.setProperty(id, PROPS.kind, 'presentation');
  game.setProperty(id, PROPS.document, documentId);
  game.setProperty(id, PROPS.title, title);
  game.setProperty(id, PROPS.shares, '[]');
  game.setProperty(id, PROPS.annotations, '[]');
  game.setProperty(id, PROPS.view, '');
  game.step('SetPermission', { EntityId: id, Player: '', Permission: 'Read' });
  game.setProperty(documentId, PROPS.presentation, id);
  return id;
}

/** Opens the viewer for every player but the one asking (the GM has the document open). */
function showToOthers(game, vars, presentationId) {
  for (const p of game.find('players', {})) {
    if (sameId(p.id, vars.playerId)) continue;
    game.step('ShowView', { ViewKey: VIEWER_VIEW, Player: p.id, Data: JSON.stringify({ presentationId }) });
  }
}

/**
 * The GM shows pages: the client already stored them as one small PDF under resourceKey
 * (shareKey()); this records the share, moves everyone there and opens the viewer.
 * vars: documentId, title, pages, resourceKey, kind (copy: the PDF's own pages; image:
 * rendered pages, for files that can't be copied).
 */
export function startShare(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail('Only the GM can show pages.');
  const source = loadDocument(game, vars.documentId);
  if (!source) return fail('That isn\'t a PDF document.');
  const pages = parsePages(vars.pages, Number(source.pageCount) || 0);
  if (!pages) return fail(`Pick pages between 1 and ${Number(source.pageCount) || 0}, at most ${MAX_SHARE_PAGES}.`);
  const key = text(vars.resourceKey).match(SHARE_KEY);
  if (!key) return fail('The shared pages weren\'t stored.');
  if (SHARE_KINDS.indexOf(text(vars.kind)) < 0) return fail('Unknown kind of share.');
  const title = cleanText(vars.title, MAX_TITLE) || `Pages ${text(vars.pages).trim()}`.slice(0, MAX_TITLE);

  const presentationId = presentationOf(game, vars.documentId)
    || createPresentation(game, vars, vars.documentId, cleanText(source.name, MAX_TITLE) || 'PDF');
  if (!presentationId) return fail('The PDF Presentation template is missing: reinstall the addon.');

  const sid = key[1];
  game.step('AddPropertyListItem', {
    ParentId: presentationId, PropertyName: PROPS.shares,
    Fields: JSON.stringify({ sid, title, pages: JSON.stringify(pages), resourceKey: key[0], kind: text(vars.kind), at: now() }),
  });
  game.setProperty(presentationId, PROPS.view, JSON.stringify({ shareId: sid, page: pages[0], scroll: 0, by: text(vars.playerId), at: now() }));
  showToOthers(game, vars, presentationId);
  return outcome({ ok: true, presentationId, shareId: sid });
}

/** Opens the presentation for the other players again (they closed it). vars: documentId */
export function showAgain(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail('Only the GM can do that.');
  if (!loadDocument(game, vars.documentId)) return fail('That isn\'t a PDF document.');
  const presentationId = presentationOf(game, vars.documentId);
  if (!presentationId) return fail('Nothing is shared yet.');
  showToOthers(game, vars, presentationId);
  return outcome({ ok: true, presentationId });
}

/** Takes a share back and deletes its file. Annotations stay (they belong to pages). vars: documentId, shareId */
export function removeShare(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail('Only the GM can do that.');
  if (!loadDocument(game, vars.documentId)) return fail('That isn\'t a PDF document.');
  const presentationId = presentationOf(game, vars.documentId);
  const row = presentationId && SID.test(text(vars.shareId))
    ? parseRows(game.getProperty(presentationId, PROPS.shares, '[]')).find((r) => r.fields.sid === vars.shareId)
    : null;
  if (!row) return fail('That share is already gone.');
  game.step('RemovePropertyListItem', { ParentId: presentationId, PropertyName: PROPS.shares, ItemId: row.id });
  if (SHARE_KEY.test(text(row.fields.resourceKey))) game.step('DeleteResource', { Key: row.fields.resourceKey });
  return outcome({ ok: true, presentationId });
}

// ── annotations ──────────────────────────────────────────────────────────────

/**
 * Adds, changes or removes an annotation on a presentation. The action has already checked
 * that the player can read it. vars: presentationId, op (add, update, remove), itemId,
 * annotation (JSON: kind, page, shape, color, text, parent).
 */
export function annotate(game, vars) {
  const presentationId = text(vars.presentationId);
  if (!isGuid(presentationId) || game.getProperty(presentationId, PROPS.kind, '') !== 'presentation') return fail('That isn\'t a shared PDF.');
  const isGm = truthy(vars.playerIsGm);
  const rows = parseRows(game.getProperty(presentationId, PROPS.annotations, '[]'));
  const list = { ParentId: presentationId, PropertyName: PROPS.annotations };
  const op = text(vars.op);

  if (op === 'add') {
    if (rows.length >= MAX_ANNOTATIONS) return fail('This PDF has as many notes as it can hold.');
    const checked = validateAnnotation(vars.annotation, sharedPages(game, presentationId));
    if (!checked.ok) return fail(checked.error);
    const a = checked.value;
    if (a.kind === 'reply' && !rows.some((r) => r.id === a.parent && r.fields.kind !== 'reply')) return fail('That note is gone.');
    const color = a.color || (COLOR.test(text(vars.playerColor)) ? text(vars.playerColor).toLowerCase() : '#ffd54f');
    game.step('AddPropertyListItem', {
      ...list,
      Fields: JSON.stringify({
        kind: a.kind, page: String(a.page), shape: a.shape ? JSON.stringify(a.shape) : '', color, text: a.text,
        parent: a.parent, author: text(vars.playerId), authorName: cleanText(vars.playerName, 100) || '', at: now(),
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

  // update: only the text, colour and shape (checked against the row's own kind and page)
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
