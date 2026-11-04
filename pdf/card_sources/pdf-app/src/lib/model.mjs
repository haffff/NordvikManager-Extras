// The presentation's properties as the viewer uses them. Rows come from the server's list
// steps: { id, fields } with string fields (see include_sources/pdf.mjs).
import { parseJson, parseRows, ANNOTATION_KINDS } from '../../../../include_sources/pdf.mjs';

const SID = /^[0-9a-f]{32}$/;

/** The shares, in the order they were made. */
export function decodeShares(value) {
  const shares = [];
  for (const row of parseRows(value)) {
    const f = row.fields;
    const pages = parseJson(f.pages);
    if (!SID.test(String(f.sid)) || !Array.isArray(pages) || !pages.length || !pages.every(Number.isInteger)) continue;
    shares.push({ rowId: row.id, sid: f.sid, title: String(f.title || ''), pages, resourceKey: String(f.resourceKey || ''), kind: f.kind === 'image' ? 'image' : 'copy', at: String(f.at || '') });
  }
  return shares;
}

/** The document's page number of a share's page (1-based index); null past its end. */
export function pageOfShare(share, index) {
  return share.pages[index - 1] ?? null;
}

/** Where a document page is in a share (1-based); null when it isn't in it. */
export function indexInShare(share, page) {
  const i = share.pages.indexOf(page);
  return i < 0 ? null : i + 1;
}

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

/** The GM's place ({ shareId, page, scroll, by, at }), or null. */
export function decodeView(value) {
  const v = parseJson(value);
  if (!v || typeof v.shareId !== 'string' || !Number.isInteger(v.page)) return null;
  return { shareId: v.shareId, page: v.page, scroll: Number(v.scroll) || 0, by: String(v.by || ''), at: String(v.at || '') };
}

/** The share to show a document page in: the one players are on if it has it, else the newest that does. */
export function shareForPage(shares, page, currentSid) {
  const current = shares.find((s) => s.sid === currentSid);
  if (current && current.pages.includes(page)) return current;
  for (let i = shares.length - 1; i >= 0; i--) if (shares[i].pages.includes(page)) return shares[i];
  return null;
}

/**
 * The view to send when the GM, presenting, is on a document page at a scroll fraction:
 * null when players don't have that page, or when it's (nearly) where they already are.
 */
export function presenterView(shares, current, page, scroll, by) {
  const share = shareForPage(shares, page, current?.shareId);
  if (!share) return null;
  const view = { shareId: share.sid, page, scroll: Math.round(scroll * 10000) / 10000, by };
  if (current && current.shareId === view.shareId && current.page === page && Math.abs(current.scroll - view.scroll) < 0.01) return null;
  return view;
}
