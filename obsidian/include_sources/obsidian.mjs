// Obsidian helpers shared by the addon's actions (RunScript "Include": "obsidian_obsidian.js")
// and its card. They talk to the Local REST API plugin (its plain-HTTP server). Plain
// JavaScript only: RunScript runs it in Jint on the GM's server, which has no URL class, DOM
// or network. pnpm run pack drops the `export` keywords.

export const IMAGE_PREFIX = 'obsidian_img_';
export const REPLY_PANEL = /^addon_[A-Za-z0-9_-]+_obsidian$/;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

// ── addresses ────────────────────────────────────────────────────────────────

// The plugin address the GM typed, as "http(s)://host[:port][/path]" without a trailing
// slash; null for anything else (no credentials, query or fragment).
export function baseUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[A-Za-z0-9.\-\[\]:]+(\/[A-Za-z0-9._~\-\/]*)?$/.test(trimmed)) return null;
  return trimmed;
}

// The Cards panel folder imported notes go in, e.g. "Lore/Obsidian" (CreateCard's Folder):
// names trimmed, empty ones dropped; "" for the top level; null for what the server refuses
// (over 10 levels, or a name over 100 characters).
export function folderPath(value) {
  const names = String(value == null ? '' : value).split('/').map((x) => x.trim()).filter((x) => x.length > 0);
  if (names.length > 10 || names.some((x) => x.length > 100)) return null;
  return names.join('/');
}

// ── vault paths ──────────────────────────────────────────────────────────────

// A file in the vault: relative, "/" between folders, no empty, "." or ".." parts, no
// backslashes or control characters, not in Obsidian's own .obsidian folder.
export function isVaultPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (/[\\\u0000-\u001f]/.test(path)) return false;
  const parts = path.split('/');
  if (parts[0] === '.obsidian') return false;
  return parts.every((p) => p.length > 0 && p !== '.' && p !== '..');
}

export function isNotePath(path) {
  return isVaultPath(path) && /\.md$/i.test(path);
}

// Each part encoded on its own: a "?" or "#" in a name stays part of the name.
export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export function vaultUrl(base, path) {
  return isVaultPath(path) ? base + '/vault/' + encodePath(path) : null;
}

// Obsidian ranks the matches (by file name too) and keeps the best ones.
export function searchUrl(base, query) {
  return base + '/search/simple/?query=' + encodeURIComponent(String(query || '').trim()) + '&maxResults=30&contextLength=80';
}

function baseName(path) {
  const parts = String(path).split('/');
  return parts[parts.length - 1];
}

export function titleOf(path) {
  return baseName(path).replace(/\.md$/i, '');
}

export function dirOf(path) {
  const parts = String(path).split('/');
  return parts.slice(0, -1).join('/');
}

function join(dir, name) {
  return dir ? dir + '/' + name : name;
}

function decodeName(name) {
  try { return decodeURIComponent(name); } catch (e) { return name; }
}

// A relative address (as in a markdown link) from a folder: "./" and "../" followed, %-escapes
// decoded; null when it would leave the vault.
export function resolveRelative(dir, rel) {
  const out = dir ? dir.split('/') : [];
  const parts = decodeName(String(rel)).split('/');
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(part);
    }
  }
  const path = out.join('/');
  return isVaultPath(path) ? path : null;
}

// A short id for a text: two 32-bit FNV-1a hashes, as 16 hex characters. Not a secret, only
// keeps names out of what players can read and fits a resource key.
export function hashId(text) {
  const s = String(text);
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  };
  return fnv(2166136261) + fnv(2166136261 ^ 0x9e3779b9);
}

export function imageKey(id) {
  return IMAGE_PREFIX + hashId(id);
}

// ── responses ────────────────────────────────────────────────────────────────

function pick(obj, a, b) {
  return obj[a] !== undefined ? obj[a] : obj[b];
}

// A SendRequest output as { ok, status, body (parsed JSON, else the text), error }.
// `what` names the thing asked for in the error, e.g. "that note".
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

function describeFailure(status, raw, body, what) {
  if (status === 0) {
    return "Can't reach Obsidian: " + (raw || 'no answer') + '. Is Obsidian open, with the Local REST API plugin and its HTTP server on?';
  }
  if (status === 400 && (raw === null || raw === undefined || raw === '')) {
    return 'The server refused that address. Obsidian on this computer or your network must be allowed by the '
      + "server's admin in Application Settings -> Server -> Local network access, e.g. localhost:27123.";
  }
  if (status === 401 || status === 403) return 'Obsidian refused the API key. Copy it again from Settings -> Local REST API and save it in Settings.';
  if (status === 404) return "Obsidian can't find " + what + '. Was it moved or renamed? Search for it again.';
  const message = body && typeof body === 'object' && body.message ? ': ' + body.message : '';
  return 'Obsidian answered ' + status + ' for ' + what + message;
}

// A response's text exactly as Obsidian sent it (a note's markdown), without JSON parsing.
export function rawBody(resp) {
  const raw = resp ? pick(resp, 'ResponseBody', 'responseBody') : '';
  return typeof raw === 'string' ? raw : '';
}

// The plugin's status (GET /): whether the key was accepted and the versions.
export function statusInfo(body) {
  const b = body && typeof body === 'object' ? body : {};
  const v = b.versions && typeof b.versions === 'object' ? b.versions : {};
  return { authenticated: b.authenticated === true, obsidian: String(v.obsidian || '?'), plugin: String(v.self || '?') };
}

// ── search ───────────────────────────────────────────────────────────────────

// The search results the list shows, the first 30: notes named the query first, then names
// starting with it, then names containing it (ignoring case); the rest best first, as
// Obsidian scored them. Each with a snippet of its text.
export function searchResults(body, query) {
  const results = Array.isArray(body) ? body : [];
  const q = String(query || '').trim().toLowerCase();
  const rank = (title) => {
    const t = title.toLowerCase();
    if (!q) return 3;
    if (t === q) return 0;
    if (t.indexOf(q) === 0) return 1;
    return t.indexOf(q) !== -1 ? 2 : 3;
  };
  const found = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || !isNotePath(r.filename)) continue;
    const matches = Array.isArray(r.matches) ? r.matches : [];
    const text = matches.filter((m) => m && !(m.match && m.match.source === 'filename'))[0];
    const title = titleOf(r.filename);
    found.push({
      rank: rank(title), score: Number(r.score) || 0, i: i,
      note: { path: r.filename, title: title, folder: dirOf(r.filename), snippet: text ? String(text.context || '').trim().slice(0, 160) : '' },
    });
  }
  found.sort((a, b) => a.rank - b.rank || b.score - a.score || a.i - b.i);
  return found.slice(0, 30).map((f) => f.note);
}

// The note a [[link]] means, from search results for its name: the file with that name (or
// that path ending), in the linking note's folder if there's one there, else the shortest
// path. "" for none.
export function resolveLink(body, target, fromPath) {
  const results = Array.isArray(body) ? body : [];
  const want = String(target || '').trim().replace(/\.md$/i, '').toLowerCase();
  if (!want) return '';
  const fromDir = dirOf(fromPath || '').toLowerCase();
  const matching = results
    .map((r) => (r && typeof r.filename === 'string' ? r.filename : ''))
    .filter((f) => {
      if (!isNotePath(f)) return false;
      const lower = f.toLowerCase();
      return lower === want + '.md' || lower.endsWith('/' + want + '.md');
    });
  matching.sort((a, b) => {
    const sameA = dirOf(a).toLowerCase() === fromDir ? 0 : 1;
    const sameB = dirOf(b).toLowerCase() === fromDir ? 0 : 1;
    return sameA - sameB || a.split('/').length - b.split('/').length || a.length - b.length || (a < b ? -1 : 1);
  });
  return matching[0] || '';
}

// ── preparing a note for its card ────────────────────────────────────────────

// Code (fenced blocks and `inline`) as odd items, the rest as even ones.
function splitCode(md) {
  return md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/);
}

function noteLink(label, target) {
  return '[' + String(label).replace(/[\[\]]/g, '') + '](nm-note:' + encodeURIComponent(target) + ')';
}

// Rewrites a note's markdown for the card:
// - the frontmatter and %% comments %% are left out: GMs keep secrets there;
// - images (![[x.png]], ![](x.png)) point at game resources (nm-resource:<key>), which
//   `downloads` fetches; an ![[embed]] is looked for in the note's folder, the attachments
//   folder ("./x" is under the note's folder) and the vault, in that order; web and data
//   images are left out, as the card couldn't load them anyway;
// - [[links]] and markdown links to notes become nm-note:<name or path> links; embedded notes
//   are shown as links.
// The card renders the markdown and sanitizes the result.
export function prepareNote(markdown, notePath, attachments, base) {
  const noteDir = dirOf(notePath);
  const downloads = [];
  const seen = {};
  const links = [];
  const addLink = (target) => { if (links.indexOf(target) === -1) links.push(target); };

  const image = (candidates, alt) => {
    const paths = [];
    candidates.forEach((p) => { if (p && isVaultPath(p) && paths.indexOf(p) === -1) paths.push(p); });
    if (paths.length === 0) return alt;
    const key = imageKey(paths.join('|').toLowerCase());
    if (!seen[key]) {
      seen[key] = true;
      downloads.push({ key: key, name: baseName(paths[0]), urls: paths.map((p) => base + '/vault/' + encodePath(p)) });
    }
    return '![' + String(alt).replace(/[\[\]]/g, '') + '](nm-resource:' + key + ')';
  };

  const attachmentDir = (() => {
    const a = String(attachments || '').trim().replace(/^\/+|\/+$/g, '');
    if (!a) return '';
    if (a === '.' ) return noteDir;
    if (a.indexOf('./') === 0) return resolveRelative(noteDir, a.slice(2)) || '';
    return a;
  })();

  let md = String(markdown || '').replace(/^﻿/, '');
  md = md.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');

  const parts = splitCode(md);
  for (let i = 0; i < parts.length; i += 2) {
    let text = parts[i].replace(/%%[\s\S]*?%%/g, '');

    // ![[embed|size]]
    text = text.replace(/!\[\[([^\]\n]+)\]\]/g, (all, inner) => {
      const target = inner.split('|')[0].split('#')[0].trim();
      if (!target) return '';
      if (IMAGE_EXT.test(target)) {
        const alt = baseName(target).replace(IMAGE_EXT, '');
        const candidates = target.indexOf('/') !== -1
          ? [target, join(noteDir, target)]
          : [join(noteDir, target), attachmentDir ? join(attachmentDir, target) : '', target];
        return image(candidates, alt);
      }
      if (/\.[A-Za-z0-9]{1,5}$/.test(target) && !/\.md$/i.test(target)) return baseName(target);
      const name = target.replace(/\.md$/i, '');
      addLink(name);
      return noteLink(baseName(name), name);
    });

    // [[link#heading|alias]]
    text = text.replace(/\[\[([^\]\n]+)\]\]/g, (all, inner) => {
      const bar = inner.indexOf('|');
      const target = (bar === -1 ? inner : inner.slice(0, bar)).split('#')[0].trim().replace(/\.md$/i, '');
      const label = bar === -1 ? target : inner.slice(bar + 1).trim();
      if (!target) return label;
      addLink(target);
      return noteLink(label || target, target);
    });

    // ![alt](address)
    text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (all, alt, address) => {
      if (address.indexOf('nm-resource:') === 0) return all; // an ![[embed]] made above
      if (/^[a-z][a-z0-9+.\-]*:/i.test(address)) return alt;
      const path = resolveRelative(noteDir, address);
      return path && IMAGE_EXT.test(path) ? image([path], alt) : alt;
    });

    // [text](note.md)
    text = text.replace(/(^|[^!])\[([^\]\n]*)\]\(([^)\s]+\.md)\)/gi, (all, before, label, address) => {
      if (/^[a-z][a-z0-9+.\-]*:/i.test(address)) return all;
      const path = resolveRelative(noteDir, address);
      if (!path) return before + label;
      const name = path.replace(/\.md$/i, '');
      addLink(name);
      return before + noteLink(label || titleOf(path), name);
    });

    parts[i] = text;
  }

  return { markdown: parts.join(''), downloads: downloads, links: links };
}

// ── the note → card index (game property "obsidian_cards") ──────────────────

// Players can read the game's properties, so the index holds hashes, not paths:
// { p: { hash(path): cardId }, n: { hash(name): [cardId, …] } }, lower case.

function parseIndex(indexJson) {
  try {
    const index = JSON.parse(indexJson || '{}');
    if (!index || typeof index !== 'object' || Array.isArray(index)) return { p: {}, n: {} };
    return { p: index.p && typeof index.p === 'object' ? index.p : {}, n: index.n && typeof index.n === 'object' ? index.n : {} };
  } catch (e) {
    return { p: {}, n: {} };
  }
}

export function indexedCard(indexJson, path) {
  const cardId = parseIndex(indexJson).p[hashId(String(path).toLowerCase())];
  return typeof cardId === 'string' ? cardId : '';
}

// The cards of notes with this name (the last part of a [[link]]), wherever they are.
export function cardsNamed(indexJson, name) {
  const list = parseIndex(indexJson).n[hashId(baseName(String(name || '')).replace(/\.md$/i, '').toLowerCase())];
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}

export function withIndexed(indexJson, path, cardId) {
  const index = parseIndex(indexJson);
  index.p[hashId(String(path).toLowerCase())] = cardId;
  const nameKey = hashId(titleOf(path).toLowerCase());
  const list = Array.isArray(index.n[nameKey]) ? index.n[nameKey] : [];
  if (list.indexOf(cardId) === -1) list.push(cardId);
  index.n[nameKey] = list;
  return JSON.stringify(index);
}

// ── answering a view ─────────────────────────────────────────────────────────

// What a RunScript returns so the action can answer the window that asked (its own
// "addon_<cardId>_w<random>_obsidian" panel, passed as replyTo): RunClientCommand with
// %replyTo% and %reply%, when %hasReply% is "yes". Run from a menu there is no window.
export function answer(vars, reply) {
  const replyTo = vars && typeof vars.replyTo === 'string' && REPLY_PANEL.test(vars.replyTo) ? vars.replyTo : '';
  return { reply: reply, replyTo: replyTo, hasReply: replyTo ? 'yes' : 'no' };
}

// Everything a RunScript returns for the steps after it: the answer to the window (above),
// failed ("yes" when reply.ok is false: the action tells the GM and stops), notice (the
// text for a chat whisper when there is no window to answer) and any extra variables.
export function outcome(vars, reply, extra) {
  const result = answer(vars, reply);
  result.failed = reply && reply.ok === false ? 'yes' : 'no';
  result.notice = (reply && (reply.error || reply.message)) || '';
  const more = extra || {};
  for (const key in more) result[key] = more[key];
  return result;
}
