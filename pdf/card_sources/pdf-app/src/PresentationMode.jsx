import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProperty } from './api.js';
import { useNotes } from './useNotes.js';
import { decodeShares, decodeView } from './lib/model.mjs';
import { openPdf } from './lib/pdfEngine.js';
import { PROPS } from '../../../include_sources/pdf.mjs';
import { PdfPages } from './components/PdfPages.jsx';
import { Tools } from './components/Tools.jsx';
import { Notes } from './components/Notes.jsx';

/**
 * What players see: the pages the GM showed (one tab per share), the GM's place when
 * following, and everyone's notes.
 */
export function PresentationMode({ api, presentationId, player }) {
  const title = useProperty(api, presentationId, PROPS.title);
  const sharesRaw = useProperty(api, presentationId, PROPS.shares);
  const viewRaw = useProperty(api, presentationId, PROPS.view);
  const shares = useMemo(() => decodeShares(sharesRaw || '[]'), [sharesRaw]);
  const view = useMemo(() => decodeView(viewRaw || ''), [viewRaw]);
  const notes = useNotes(api, presentationId);

  const [follow, setFollow] = useState(true);
  const [activeSid, setActiveSid] = useState(null);
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('');
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(player.me.color && /^#[0-9a-f]{6}$/i.test(player.me.color) ? player.me.color.toLowerCase() : '#ffd54f');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [goto, setGoto] = useState(null);
  const docs = useRef(new Map()); // sid → pdf.js document

  const active = shares.find((s) => s.sid === activeSid) || null;

  // nothing picked yet (or the share was taken back): where the GM is, else the newest
  useEffect(() => {
    if (active || !shares.length) return;
    setActiveSid(shares.find((s) => s.sid === view?.shareId)?.sid ?? shares[shares.length - 1].sid);
  }, [shares, view, active]);

  // following the GM: their share, their place
  useEffect(() => {
    if (!follow || !view) return;
    if (shares.some((s) => s.sid === view.shareId)) setActiveSid(view.shareId);
    setGoto((g) => ({ page: view.page, scroll: view.scroll, seq: (g?.seq ?? 0) + 1, smooth: true }));
  }, [follow, view, shares]);

  // the share's small PDF (cached by the app between sessions)
  useEffect(() => {
    if (!active) { setDoc(null); return undefined; }
    const cached = docs.current.get(active.sid);
    if (cached) { setDoc(cached); return undefined; }
    let live = true;
    setDoc(null);
    setStatus('Loading pages…');
    api.Resources.Global.Read(active.resourceKey)
      .then((blob) => { if (!blob) throw new Error('missing'); return openPdf(blob); })
      .then((pdf) => {
        docs.current.set(active.sid, pdf);
        if (!live) return;
        setDoc(pdf); setStatus('');
        if (follow && view?.shareId === active.sid) setGoto((g) => ({ page: view.page, scroll: view.scroll, seq: (g?.seq ?? 0) + 1 }));
      })
      .catch(() => { if (live) setStatus('These pages couldn\'t be loaded. Ask the GM to show them again.'); });
    return () => { live = false; };
  }, [active?.sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (sid) => { setFollow(false); setActiveSid(sid); setSelectedId(null); };
  const create = (annotation) => { notes.add({ ...annotation, color }); setTool((t) => (t === 'pin' ? 'select' : t)); };

  if (sharesRaw === null) return <div className="pdf-empty">Loading…</div>;
  if (!shares.length) return <div className="pdf-empty">The GM hasn't shown any pages yet.</div>;

  return (
    <div className="pdf-app">
      <div className="pdf-header">
        <b className="pdf-title">{title || 'PDF'}</b>
        <div className="pdf-tabs">
          {shares.map((s) => (
            <button key={s.sid} type="button" className={s.sid === activeSid ? 'active' : ''} onClick={() => pick(s.sid)} title={`Pages ${s.pages.join(', ')}`}>
              {s.title}{view?.shareId === s.sid ? ' •' : ''}
            </button>
          ))}
        </div>
        <label className="pdf-follow" title="Scroll along with the GM">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow GM
        </label>
      </div>
      <Tools tool={tool} setTool={setTool} color={color} setColor={setColor} zoom={zoom} setZoom={setZoom} hasText={active?.kind === 'copy'} />
      <div className="pdf-body">
        {doc && active ? (
          <PdfPages
            pdfDoc={doc} pages={active.pages} notesByPage={notes.byPage} tool={tool} color={color}
            selectedId={selectedId} onSelect={setSelectedId} onCreate={create} textLayer={active.kind === 'copy'}
            zoom={zoom} goto={goto}
          />
        ) : <div className="pdf-empty">{status || 'Loading…'}</div>}
        <aside className="pdf-side">
          <Notes byId={notes.byId} pages={active?.pages ?? []} selectedId={selectedId} me={player.me} isGm={player.isGm}
            onSelect={setSelectedId} onEdit={notes.edit} onRemove={(id) => { notes.remove(id); setSelectedId(null); }} onReply={notes.reply} />
        </aside>
      </div>
    </div>
  );
}
