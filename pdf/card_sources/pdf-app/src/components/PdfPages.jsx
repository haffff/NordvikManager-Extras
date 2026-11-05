import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { pdfjs } from '../lib/pdfEngine.js';
import { normRect, normPoint, rectFromPoints, mergeLineRects, simplifyPath } from '../lib/geometry.mjs';

// Scrollable pages of one pdf.js document. `pages` maps each page of that document (index
// 1..n) to the page number annotations are stored under (the source PDF's own): the whole
// document for the GM, a share's pages for players.

const INK_STEP = 0.002;
const PIN_SIZE = 22;

function Note({ note, selected, onSelect, tool }) {
  const clickable = tool === 'select';
  const common = {
    onClick: clickable ? (e) => { e.stopPropagation(); onSelect(note.id); } : undefined,
    className: `pdf-note pdf-note-${note.kind}${selected ? ' selected' : ''}${note.pending ? ' pending' : ''}`,
    style: { pointerEvents: clickable ? 'auto' : 'none' },
  };
  if (note.kind === 'highlight') {
    return <g {...common}>{note.shape.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={note.color} />)}</g>;
  }
  if (note.kind === 'box') {
    const r = note.shape[0];
    return <g {...common}><rect x={r[0]} y={r[1]} width={r[2]} height={r[3]} stroke={note.color} fill={note.color} fillOpacity="0.08" vectorEffect="non-scaling-stroke" /></g>;
  }
  if (note.kind === 'ink') {
    return <g {...common}><polyline points={note.shape.map((p) => p.join(',')).join(' ')} stroke={note.color} fill="none" vectorEffect="non-scaling-stroke" /></g>;
  }
  return null; // pins are drawn as HTML (round at any aspect)
}

// Memoized: a page redraws only when its own notes, its selection, the tool or its size change.
const Page = React.memo(function Page({ pdfDoc, index, docPage, width, textLayer, notes, tool, color, selectedId, onSelect, onCreate, registerEl, estimate, hits, currentHit }) {
  const holder = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [base, setBase] = useState(estimate); // { width, height } at scale 1
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(null); // shape being drawn
  const height = base ? (width * base.height) / base.width : width * 1.414;

  useEffect(() => registerEl(docPage, holder.current), [docPage, registerEl]);

  useEffect(() => {
    const el = holder.current;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      // Scrolled well away: let go of the canvas's pixels (10+ MB a page at high DPI) and the
      // text spans; the page draws again when it comes back.
      const canvas = canvasRef.current;
      if (canvas && canvas.width) { canvas.width = 0; canvas.height = 0; }
      textRef.current?.replaceChildren();
      return undefined;
    }
    if (!pdfDoc || !width) return undefined;
    let cancelled = false;
    let renderTask = null;
    let text = null;
    (async () => {
      const page = await pdfDoc.getPage(index);
      if (cancelled) return;
      const unit = page.getViewport({ scale: 1 });
      setBase({ width: unit.width, height: unit.height });
      const scale = width / unit.width;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      await renderTask.promise.catch(() => {});
      if (cancelled || !textLayer || !textRef.current) return;
      textRef.current.replaceChildren();
      textRef.current.style.setProperty('--total-scale-factor', String(scale));
      text = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textRef.current, viewport });
      await text.render().catch(() => {});
    })();
    return () => { cancelled = true; renderTask?.cancel(); text?.cancel(); };
  }, [visible, pdfDoc, index, width, textLayer]);

  // ── drawing ────────────────────────────────────────────────────────────────
  const box = () => holder.current.getBoundingClientRect();
  const drawing = ['box', 'mark', 'ink', 'pin'].includes(tool);
  const onPointerDown = (e) => {
    if (!drawing || e.button !== 0) return;
    const p = normPoint(e.clientX, e.clientY, box());
    if (tool === 'pin') { onCreate({ kind: 'pin', page: docPage, shape: p }); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ start: p, points: [p], end: p });
  };
  const onPointerMove = (e) => {
    if (!draft) return;
    const p = normPoint(e.clientX, e.clientY, box());
    setDraft((d) => (tool === 'ink' ? { ...d, points: [...d.points, p], end: p } : { ...d, end: p }));
  };
  const onPointerUp = () => {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    if (tool === 'ink') {
      const points = simplifyPath(d.points, INK_STEP).slice(0, 1500);
      if (points.length >= 2) onCreate({ kind: 'ink', page: docPage, shape: points });
      return;
    }
    const r = rectFromPoints(d.start, d.end);
    if (r[2] < 0.005 || r[3] < 0.003) return;
    onCreate({ kind: tool === 'mark' ? 'highlight' : 'box', page: docPage, shape: [r] });
  };

  const draftShape = draft && (tool === 'ink'
    ? <polyline points={draft.points.map((p) => p.join(',')).join(' ')} stroke={color} fill="none" vectorEffect="non-scaling-stroke" />
    : (() => { const r = rectFromPoints(draft.start, draft.end); return <rect x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={tool === 'mark' ? color : 'none'} fillOpacity={tool === 'mark' ? 0.35 : 0} stroke={color} vectorEffect="non-scaling-stroke" />; })());

  return (
    <div className="pdf-page" ref={holder} data-doc-page={docPage} style={{ width, height }}>
      <canvas ref={canvasRef} />
      {textLayer && <div className="textLayer" ref={textRef} style={{ pointerEvents: tool === 'text' ? 'auto' : 'none' }} />}
      <svg className="pdf-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
        {(notes || []).map((n) => <Note key={n.id} note={n} selected={n.id === selectedId} onSelect={onSelect} tool={tool} />)}
        {(hits || []).map((h) => h.rects.map((r, i) => (
          <rect key={`${h.id}-${i}`} className={`pdf-hit${h.id === currentHit ? ' current' : ''}`} x={r[0]} y={r[1]} width={r[2]} height={r[3]} />
        )))}
        {draftShape}
      </svg>
      {(notes || []).filter((n) => n.kind === 'pin').map((n) => (
        <button
          key={n.id} type="button" title={n.text || 'Pin'}
          className={`pdf-pin${n.id === selectedId ? ' selected' : ''}${n.pending ? ' pending' : ''}`}
          style={{ left: `calc(${n.shape[0] * 100}% - ${PIN_SIZE / 2}px)`, top: `calc(${n.shape[1] * 100}% - ${PIN_SIZE}px)`, background: n.color, pointerEvents: tool === 'select' ? 'auto' : 'none' }}
          onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
        >{n.replies?.length ? n.replies.length + 1 : ''}</button>
      ))}
      {drawing && (
        <div className="pdf-draw" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDraft(null)} />
      )}
      <div className="pdf-page-number">{docPage}</div>
    </div>
  );
});

/**
 * props: pdfDoc, pages (doc page per index), notesByPage, tool, color, selectedId, onSelect,
 * onCreate(annotation), textLayer, zoom, onPosition({ page, scroll }) while scrolling,
 * goto ({ page, scroll, seq }: scroll there when seq changes), hitsByPage (search hits per page,
 * each { id, rects }), currentHit (the hit id to stress).
 */
export const PdfPages = React.memo(function PdfPages({ pdfDoc, pages, notesByPage, tool, color, selectedId, onSelect, onCreate, textLayer, zoom, onPosition, goto, hitsByPage, currentHit }) {
  const scroller = useRef(null);
  const els = useRef(new Map());
  const [width, setWidth] = useState(0);
  const [estimate, setEstimate] = useState(null);
  const registerEl = useCallback((page, el) => {
    if (el) els.current.set(page, el); else els.current.delete(page);
    return () => els.current.delete(page);
  }, []);

  useEffect(() => {
    let live = true;
    pdfDoc?.getPage(1).then((p) => { if (live) { const v = p.getViewport({ scale: 1 }); setEstimate({ width: v.width, height: v.height }); } });
    return () => { live = false; };
  }, [pdfDoc]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.floor((el.clientWidth - 24) * zoom))));
    ro.observe(el);
    setWidth(Math.max(200, Math.floor((el.clientWidth - 24) * zoom)));
    return () => ro.disconnect();
  }, [zoom]);

  // where the reader is: the page at the top of the view and how far into it
  const report = useRef(null);
  const onScroll = () => {
    if (!onPosition) return;
    cancelAnimationFrame(report.current);
    report.current = requestAnimationFrame(() => {
      const top = scroller.current.getBoundingClientRect().top + 8;
      for (const page of pages) {
        const el = els.current.get(page);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > top) { onPosition({ page, scroll: Math.min(1, Math.max(0, (top - r.top) / r.height)) }); return; }
      }
    });
  };

  useEffect(() => {
    if (!goto) return;
    const el = els.current.get(goto.page);
    if (!el) return;
    scroller.current.scrollTo({ top: el.offsetTop - 8 + (goto.scroll || 0) * el.offsetHeight, behavior: goto.smooth ? 'smooth' : 'auto' });
  }, [goto?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // a text selection becomes one highlight per page it covers
  const onMouseUp = () => {
    if (tool !== 'text') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const rects = [...sel.getRangeAt(0).getClientRects()];
    for (const page of pages) {
      const el = els.current.get(page);
      if (!el) continue;
      const box = el.getBoundingClientRect();
      const mine = mergeLineRects(rects.map((r) => normRect(r, box)).filter(Boolean));
      if (mine.length) onCreate({ kind: 'highlight', page, shape: mine.slice(0, 100) });
    }
    sel.removeAllRanges();
  };

  return (
    <div className="pdf-scroller" ref={scroller} onScroll={onScroll} onMouseUp={onMouseUp} onClick={() => tool === 'select' && onSelect(null)}>
      {width > 0 && pages.map((page, i) => (
        <Page
          key={`${i}-${page}`} pdfDoc={pdfDoc} index={i + 1} docPage={page} width={width} textLayer={textLayer}
          notes={notesByPage.get(page)} tool={tool} color={color} onSelect={onSelect}
          selectedId={notesByPage.get(page)?.some((n) => n.id === selectedId) ? selectedId : null}
          onCreate={onCreate} registerEl={registerEl} estimate={estimate}
          hits={hitsByPage?.get(page)} currentHit={hitsByPage?.get(page)?.some((h) => h.id === currentHit) ? currentHit : null}
        />
      ))}
    </div>
  );
});
