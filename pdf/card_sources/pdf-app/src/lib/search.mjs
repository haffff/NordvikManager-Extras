// Searching a PDF's text: pure functions over pdf.js text items ({ str, transform, width, hasEOL }),
// so the search runs (and is tested) without pdf.js.
import { mergeLineRects } from './geometry.mjs';

const round4 = (n) => Math.round(n * 10000) / 10000;
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A page's text (items joined, a line break after each line) and where each item sits in it. */
export function pageText(items) {
  let text = '';
  const spans = [];
  items.forEach((it, i) => {
    const str = it.str ?? '';
    if (str) spans.push({ start: text.length, end: text.length + str.length, item: i });
    text += str;
    if (it.hasEOL) text += '\n';
  });
  return { text, spans };
}

/** Where `query` is in `text`: any case, any whitespace between its words. At most `limit` matches. */
export function findMatches(text, query, limit = Infinity) {
  const words = String(query ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const re = new RegExp(words.map(escapeRe).join('\\s+'), 'giu');
  const out = [];
  for (const m of text.matchAll(re)) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (out.length >= limit) break;
  }
  return out;
}

// A point of PDF user space on the page at scale 1 (viewport.transform: [a, b, c, d, e, f]).
const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];

/** The page rects ([x, y, w, h] fractions, one per line) a match covers. */
export function matchRects(items, spans, match, viewport) {
  const rects = [];
  for (const span of spans) {
    const from = Math.max(match.start, span.start), to = Math.min(match.end, span.end);
    if (to <= from) continue;
    const it = items[span.item];
    const [ta, tb, tc, td, tx, ty] = it.transform;
    const len = span.end - span.start;
    const along = Math.hypot(ta, tb) || 1;
    // along the baseline (user space units), and the font's height upward
    const ux = (ta / along) * it.width, uy = (tb / along) * it.width;
    const f0 = (from - span.start) / len, f1 = (to - span.start) / len;
    const corners = [];
    for (const f of [f0, f1]) {
      for (const up of [-0.2, 0.9]) {
        corners.push(apply(viewport.transform, tx + ux * f + tc * up, ty + uy * f + td * up));
      }
    }
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    const x0 = clamp01(Math.min(...xs) / viewport.width), x1 = clamp01(Math.max(...xs) / viewport.width);
    const y0 = clamp01(Math.min(...ys) / viewport.height), y1 = clamp01(Math.max(...ys) / viewport.height);
    if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1 - x0, y1 - y0]);
  }
  return mergeLineRects(rects).map((r) => r.map(round4));
}

/** The match and up to `around` characters each side of it, on one line. */
export function snippet(text, start, end, around = 40) {
  const flat = (s) => s.replace(/\s+/g, ' ');
  const from = Math.max(0, start - around), to = Math.min(text.length, end + around);
  return {
    before: (from > 0 ? '…' : '') + flat(text.slice(from, start)),
    hit: flat(text.slice(start, end)),
    after: flat(text.slice(end, to)) + (to < text.length ? '…' : ''),
  };
}
