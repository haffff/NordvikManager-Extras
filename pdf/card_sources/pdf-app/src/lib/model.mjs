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
      parent: String(f.parent || ''), shape: null, replies: [],
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
