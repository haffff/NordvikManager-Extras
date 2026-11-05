import { useCallback, useEffect, useRef, useState } from 'react';
import { pageText, findMatches, matchRects, snippet } from './lib/search.mjs';

const MAX_HITS = 500;
const IDLE = { query: '', hits: [], byPage: new Map(), searched: 0, done: true };

/**
 * Searching the PDF's text, page by page from the reader's page on (wrapping round), so hits
 * nearby come first. Each page's text is read once per document and kept: searching again is
 * instant. Reading a page's text downloads its part of the file, so the first search of a big
 * book reads most of it.
 */
export function useSearch(pdfDoc) {
  const texts = useRef(new Map());
  const run = useRef(0);
  const [state, setState] = useState(IDLE);

  useEffect(() => { texts.current = new Map(); run.current++; setState(IDLE); }, [pdfDoc]);

  const textOf = useCallback(async (n) => {
    let t = texts.current.get(n);
    if (!t) {
      const page = await pdfDoc.getPage(n);
      const content = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      const items = content.items.filter((i) => typeof i.str === 'string');
      t = { items, ...pageText(items), viewport: { transform: vp.transform, width: vp.width, height: vp.height } };
      texts.current.set(n, t);
    }
    return t;
  }, [pdfDoc]);

  const search = useCallback(async (query, fromPage = 1) => {
    const id = ++run.current;
    const q = String(query ?? '').trim();
    if (!pdfDoc || !q) { setState(IDLE); return; }
    setState({ query: q, hits: [], byPage: new Map(), searched: 0, done: false });
    const n = pdfDoc.numPages;
    let total = 0, lastShown = 0;
    for (let k = 0; k < n && total < MAX_HITS; k++) {
      const page = ((fromPage - 1 + k) % n) + 1;
      let t;
      try { t = await textOf(page); } catch { t = null; }
      if (run.current !== id) return;
      const found = t ? findMatches(t.text, q, MAX_HITS - total) : [];
      const hits = found.map((m, i) => ({
        id: `${page}:${i}`, page, rects: matchRects(t.items, t.spans, m, t.viewport), ...snippet(t.text, m.start, m.end),
      })).filter((h) => h.rects.length);
      total += hits.length;
      // redraw on hits, and now and then while nothing turns up
      if (hits.length || k - lastShown >= 10 || k === n - 1) {
        lastShown = k;
        setState((s) => ({
          ...s,
          searched: k + 1,
          hits: hits.length ? [...s.hits, ...hits].sort((a, b) => a.page - b.page || a.rects[0][1] - b.rects[0][1]) : s.hits,
          byPage: hits.length ? new Map(s.byPage).set(page, hits) : s.byPage,
        }));
      }
    }
    if (run.current === id) setState((s) => ({ ...s, done: true, capped: total >= MAX_HITS }));
  }, [pdfDoc, textOf]);

  const clear = useCallback(() => { run.current++; setState(IDLE); }, []);

  return { ...state, total: pdfDoc?.numPages ?? 0, search, clear };
}
