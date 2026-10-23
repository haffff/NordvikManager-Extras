// Trilium helpers shared by the addon's actions (RunScript "Include": "trilium_trilium.js")
// and its card. Plain JavaScript only: RunScript runs it in Jint on the GM's server, which
// has no URL class, DOM or network. pnpm run pack drops the `export` keywords.

export const RESOURCE_PREFIX = 'trilium_img_';
export const REPLY_PANEL = /^addon_[A-Za-z0-9_-]+_trilium$/;

// ── addresses ────────────────────────────────────────────────────────────────

// The Trilium address the GM typed, as "http(s)://host[:port][/path]" without a trailing
// slash; null for anything else (no credentials, query or fragment).
export function baseUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[A-Za-z0-9.\-\[\]:]+(\/[A-Za-z0-9._~\-\/]*)?$/.test(trimmed)) return null;
  return trimmed;
}

// Trilium note and attachment ids: letters, digits and underscores ("root", "_hidden").
export function isNoteId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(id);
}

export function searchUrl(base, query, limit) {
  return base + '/etapi/notes?search=' + encodeURIComponent(String(query || '').trim()) + '&limit=' + (limit || 30);
}

export function noteUrl(base, noteId, part) {
  if (!isNoteId(noteId)) return null;
  return base + '/etapi/notes/' + noteId + (part ? '/' + part : '');
}

// ── responses ────────────────────────────────────────────────────────────────

// A SendRequest output as { ok, status, body (parsed JSON, else the text), error }.
// `what` names the thing asked for in the error, e.g. "the note".
export function readResponse(resp, what) {
  const r = resp || {};
  const status = Number(pick(r, 'StatusCode', 'statusCode')) || 0;
  const success = pick(r, 'Success', 'success') === true;
  const raw = pick(r, 'ResponseBody', 'responseBody');
  let body = raw;
  if (typeof raw === 'string') {
    try { body = JSON.parse(raw); } catch (e) { body = raw; }
  }
  if (success) return { ok: true, status: status, body: body, error: '' };
  return { ok: false, status: status, body: body, error: describeFailure(status, raw, body, what || 'it') };
}

function pick(obj, a, b) {
  return obj[a] !== undefined ? obj[a] : obj[b];
}

function describeFailure(status, raw, body, what) {
  if (status === 0) return "Can't reach Trilium: " + (raw || 'no answer') + '. Is it running, and is the address right?';
  if (status === 400 && (raw === null || raw === undefined || raw === '')) {
    return 'The server refused that address. A Trilium on this computer or your network must be allowed by the '
      + "server's admin in Application Settings -> Server -> Local network access.";
  }
  if (status === 401) return 'Trilium refused the token. Make a new one in Trilium (Options -> ETAPI) and save it in Settings.';
  if (status === 404) return 'Trilium has no ' + what + '.';
  const message = body && typeof body === 'object' && body.message ? ': ' + body.message : '';
  return 'Trilium answered ' + status + ' for ' + what + message;
}

// The search results the list shows.
export function searchResults(body) {
  const results = body && Array.isArray(body.results) ? body.results : [];
  const out = [];
  for (let i = 0; i < results.length; i++) {
    const n = results[i];
    if (!n || !isNoteId(n.noteId)) continue;
    out.push({ noteId: n.noteId, title: String(n.title || ''), type: String(n.type || ''), modified: String(n.utcDateModified || '') });
  }
  return out;
}

// ── note content ─────────────────────────────────────────────────────────────

export function resourceKey(id) {
  return RESOURCE_PREFIX + id;
}

// A note's content as HTML for the card. Only text notes are HTML; an image note becomes
// one image (its content is the picture), code is shown as text.
export function noteHtml(note, content, noteId) {
  const type = note && note.type ? String(note.type) : 'text';
  const text = typeof content === 'string' ? content : '';
  if (type === 'text') return text;
  if (type === 'image') return '<p><img src="api/images/' + noteId + '/image"></p>';
  if (type === 'code') return '<pre>' + escapeHtml(text) + '</pre>';
  return '<p><em>This kind of note can\'t be shown here (' + escapeHtml(type) + '). Open it in Trilium.</em></p>';
}

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Trilium's own image addresses: an attachment of the note, or an image note.
function imageRef(src) {
  let m = /^(?:\.\.\/|\/)*api\/attachments\/([A-Za-z0-9_]{1,64})\/image\/([^?#"']*)/.exec(src);
  if (m) return { id: m[1], name: decodeName(m[2]), part: 'attachments' };
  m = /^(?:\.\.\/|\/)*api\/images\/([A-Za-z0-9_]{1,64})\/([^?#"']*)/.exec(src);
  if (m) return { id: m[1], name: decodeName(m[2]), part: 'notes' };
  return null;
}

function decodeName(name) {
  try { return decodeURIComponent(name); } catch (e) { return name; }
}

// Rewrites a note's HTML for the card:
// - Trilium images point at game resources (data-nm-resource), which `downloads` fetches;
//   any other image loses its address, as the card couldn't load it anyway;
// - links to other notes ("#root/.../<id>") keep only the note id (data-nm-note).
// The card sanitizes the result again before showing it.
export function prepareNote(html, base) {
  const downloads = [];
  const seen = {};
  const links = [];

  let out = String(html || '').replace(/<img\b[^>]*>/gi, function (tag) {
    const m = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!m) return tag;
    const ref = imageRef(m[1] !== undefined ? m[1] : m[2]);
    if (!ref) return tag.replace(m[0], '');
    const key = resourceKey(ref.id);
    if (!seen[key]) {
      seen[key] = true;
      downloads.push({ url: base + '/etapi/' + ref.part + '/' + ref.id + '/content', key: key, name: ref.name || ref.id });
    }
    return tag.replace(m[0], ' data-nm-resource="' + key + '"');
  });

  out = out.replace(/<a\b[^>]*>/gi, function (tag) {
    const m = /\shref\s*=\s*(?:"#root\/([^"]*)"|'#root\/([^']*)')/i.exec(tag);
    if (!m) return tag;
    const path = (m[1] !== undefined ? m[1] : m[2]).split(/[?#]/)[0].split('/');
    const id = path[path.length - 1];
    if (!isNoteId(id)) return tag.replace(m[0], '');
    if (links.indexOf(id) === -1) links.push(id);
    return tag.replace(m[0], ' data-nm-note="' + id + '"');
  });

  return { html: out, downloads: downloads, links: links };
}

// ── the note → card index (game property "trilium_cards") ───────────────────

function parseIndex(indexJson) {
  try {
    const index = JSON.parse(indexJson || '{}');
    return index && typeof index === 'object' && !Array.isArray(index) ? index : {};
  } catch (e) {
    return {};
  }
}

export function indexedCard(indexJson, noteId) {
  const cardId = parseIndex(indexJson)[noteId];
  return typeof cardId === 'string' ? cardId : '';
}

export function withIndexed(indexJson, noteId, cardId) {
  const index = parseIndex(indexJson);
  index[noteId] = cardId;
  return JSON.stringify(index);
}

// ── answering a view ─────────────────────────────────────────────────────────

// What a RunScript returns so the action can answer the view that asked (its registered
// "addon_<cardId>_trilium" panel, passed as replyTo): RunClientCommand with %replyTo% and
// %reply%, when %hasReply% is "yes". Run from a menu there is no view to answer.
export function answer(vars, reply) {
  const replyTo = vars && typeof vars.replyTo === 'string' && REPLY_PANEL.test(vars.replyTo) ? vars.replyTo : '';
  return { reply: reply, replyTo: replyTo, hasReply: replyTo ? 'yes' : 'no' };
}

// Everything a RunScript returns for the steps after it: the answer to the view (above),
// failed ("yes" when reply.ok is false: the action tells the GM and stops), notice (the
// text for a chat whisper when there is no view to answer) and any extra variables.
export function outcome(vars, reply, extra) {
  const result = answer(vars, reply);
  result.failed = reply && reply.ok === false ? 'yes' : 'no';
  result.notice = (reply && (reply.error || reply.message)) || '';
  const more = extra || {};
  for (const key in more) result[key] = more[key];
  return result;
}

// A response's text exactly as Trilium sent it (a text note's HTML), without JSON parsing.
export function rawBody(resp) {
  const raw = resp ? pick(resp, 'ResponseBody', 'responseBody') : '';
  return typeof raw === 'string' ? raw : '';
}
