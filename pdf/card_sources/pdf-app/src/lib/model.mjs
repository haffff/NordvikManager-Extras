// The document card's properties as the viewer uses them. Rows come from the server's list
// steps: { id, fields } with string fields (see include_sources/pdf.mjs).
import { parseJson, parseRows, ANNOTATION_KINDS } from '../../../../include_sources/pdf.mjs';

/**
 * The notes: byId (every note, replies attached in order) and byPage (the notes drawn on
 * each page, replies aside). Broken rows and replies to nothing are left out.
 */
export function decodeAnnotations(value) {
  const byId = new Map();
  const byPage = new Map();
  const replies = [];
  for (const row of parseRows(value)) {
    const f = row.fields;
    if (ANNOTATION_KINDS.indexOf(f.kind) < 0) continue;
    const note = {
      id: row.id, kind: f.kind, page: Number(f.page) || 0, color: String(f.color || '#ffd54f'), text: String(f.text || ''),
      author: String(f.author || ''), authorName: String(f.authorName || ''), at: String(f.at || ''), edited: String(f.edited || ''),
      parent: String(f.parent || ''), cid: String(f.cid || ''), shape: null, replies: [],
    };
    if (note.kind === 'reply') { replies.push(note); continue; }
    note.shape = parseJson(f.shape);
    if (!note.page || !Array.isArray(note.shape)) continue;
    byId.set(note.id, note);
    if (!byPage.has(note.page)) byPage.set(note.page, []);
    byPage.get(note.page).push(note);
  }
  for (const reply of replies) {
    const parent = byId.get(reply.parent);
    if (parent) parent.replies.push(reply);
  }
  return { byId, byPage };
}

/** The GM's place ({ page, scroll, by, at }), or null. */
export function decodeView(value) {
  const v = parseJson(value);
  if (!v || !Number.isInteger(v.page)) return null;
  return { page: v.page, scroll: Number(v.scroll) || 0, by: String(v.by || ''), at: String(v.at || '') };
}

/** The view to send when the GM, presenting, is on a page at a scroll fraction; null when it's (nearly) where players already are. */
export function presenterView(current, page, scroll, by) {
  const view = { page, scroll: Math.round(scroll * 10000) / 10000, by };
  if (current && current.page === page && Math.abs(current.scroll - view.scroll) < 0.01) return null;
  return view;
}

/**
 * The notes as they look with this player's changes still on their way to the server:
 * pending new notes (and replies) shown at once, removed ones hidden, edits applied. settled
 * names what the server already shows (added cids, removed and edited ids), to forget.
 * pending: { added: [{ cid, kind, page, shape, color, text, parent }], removed: Set, edited: Map(id → change) }.
 */
export function withPending({ byId, byPage }, { added = [], removed = new Set(), edited = new Map() }, me) {
  const serverCids = new Set();
  const serverIds = new Set();
  for (const n of byId.values()) {
    serverIds.add(n.id);
    if (n.cid) serverCids.add(n.cid);
    for (const r of n.replies) { serverIds.add(r.id); if (r.cid) serverCids.add(r.cid); }
  }
  const settled = {
    added: added.filter((a) => serverCids.has(a.cid)).map((a) => a.cid),
    removed: [...removed].filter((id) => !serverIds.has(id)),
    edited: [...edited].filter(([id, change]) => {
      const n = byId.get(id) ?? [...byId.values()].flatMap((x) => x.replies).find((r) => r.id === id);
      return !n || Object.keys(change).every((k) => JSON.stringify(n[k]) === JSON.stringify(change[k]));
    }).map(([id]) => id),
  };

  const outId = new Map();
  const outPage = new Map();
  const edit = (n) => (edited.has(n.id) ? { ...n, ...edited.get(n.id) } : n);
  // Pages nothing is pending on keep their arrays (and notes), so their views don't redraw.
  const pendingPages = new Set(added.filter((a) => a.kind !== 'reply' && !serverCids.has(a.cid)).map((a) => a.page));
  for (const a of added) if (a.kind === 'reply' && !serverCids.has(a.cid)) pendingPages.add(byId.get(a.parent)?.page);
  const touched = (n) => removed.has(n.id) || edited.has(n.id) || n.replies.some((r) => removed.has(r.id) || edited.has(r.id));
  for (const [page, notes] of byPage) {
    if (!pendingPages.has(page) && !notes.some(touched)) {
      outPage.set(page, notes);
      for (const n of notes) outId.set(n.id, n);
      continue;
    }
    for (const n of notes) {
      if (removed.has(n.id)) continue;
      const note = { ...edit(n), replies: n.replies.filter((r) => !removed.has(r.id)).map(edit) };
      outId.set(note.id, note);
      if (!outPage.has(page)) outPage.set(page, []);
      outPage.get(page).push(note);
    }
  }
  for (const a of added) {
    if (serverCids.has(a.cid)) continue;
    const note = {
      id: `pending:${a.cid}`, kind: a.kind, page: a.page || 0, color: a.color || '#ffd54f', text: a.text || '',
      author: me?.id ?? '', authorName: me?.name ?? '', at: '', edited: '', parent: a.parent || '', cid: a.cid,
      shape: a.shape ?? null, replies: [], pending: true,
    };
    if (note.kind === 'reply') { const parent = outId.get(note.parent); if (parent) parent.replies.push(note); continue; }
    outId.set(note.id, note);
    if (!outPage.has(note.page)) outPage.set(note.page, []);
    outPage.get(note.page).push(note);
  }
  return { byId: outId, byPage: outPage, settled };
}
