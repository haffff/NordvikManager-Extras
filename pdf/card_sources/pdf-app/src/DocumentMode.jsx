import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProperty, fire, idOf } from './api.js';
import { useNotes } from './useNotes.js';
import { decodeShares, decodeView, presenterView } from './lib/model.mjs';
import { openPdf } from './lib/pdfEngine.js';
import { buildShare } from './lib/shareBuilder.js';
import { PROPS, parseJson, parsePages, shareKey } from '../../../include_sources/pdf.mjs';
import { PdfPages } from './components/PdfPages.jsx';
import { Tools } from './components/Tools.jsx';
import { Notes } from './components/Notes.jsx';

const PDF = 'application/pdf';
const PRESENT_EVERY_MS = 300;

const randomHex = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
// A Blob (any realm: arrayBuffer is enough), ArrayBuffer or typed array.
const toBytes = async (data) => new Uint8Array(typeof data?.arrayBuffer === 'function' ? await data.arrayBuffer() : data);

/** Choosing the PDF: one from the Materials panel, or a file uploaded here. */
function SourcePicker({ api, onPicked }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { api.Resources.List({ mimeType: PDF }).then(setFiles).catch(() => setFiles([])); }, [api]);

  const pick = async (source, bytes) => {
    setBusy('Reading the PDF…');
    try {
      const pdf = await openPdf(bytes.slice());
      await onPicked({ ...source, pageCount: pdf.numPages });
    } catch (e) {
      setBusy(`That file couldn't be opened as a PDF (${e?.message ?? e}).`);
    }
  };
  const fromMaterials = async (file) => {
    setBusy('Loading the PDF…');
    const data = await api.Resources.ReadById(file.id).catch(() => null);
    if (!data) { setBusy('That file couldn\'t be loaded.'); return; }
    await pick({ resourceId: file.id, name: file.name }, await toBytes(data));
  };
  const upload = async (file) => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setBusy(`Uploading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`);
    // A random key: players can't read this card, and nothing else names the file.
    const key = `pdf_src_${randomHex()}.pdf`;
    try {
      await api.Resources.Global.Create(key, new Blob([bytes], { type: PDF }), file.name, PDF);
    } catch (e) { setBusy(`The upload failed: ${e?.message ?? e}`); return; }
    await pick({ key, name: file.name }, bytes);
  };

  return (
    <div className="pdf-picker">
      <h3>Pick a PDF</h3>
      <p>Players never get this file: they see only the pages you show them.</p>
      <label className="pdf-upload"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}>
        <input type="file" accept={PDF} onChange={(e) => upload(e.target.files?.[0])} />
        Upload a PDF (or drop it here)
      </label>
      <h4>From the Materials panel</h4>
      {files === null ? <div>Loading…</div> : !files.length ? <div className="pdf-empty">No PDFs in Materials yet.</div> : (
        <ul className="pdf-file-list">
          {files.map((f) => <li key={f.id}><button type="button" onClick={() => fromMaterials(f)}>{f.name}</button></li>)}
        </ul>
      )}
      {busy && <div className="pdf-status">{busy}</div>}
    </div>
  );
}

/** The GM's card for one PDF: the whole file, showing pages, presenting. */
export function DocumentMode({ api, player }) {
  const sourceRaw = useProperty(api, api.cardId, PROPS.source);
  const presentationRaw = useProperty(api, api.cardId, PROPS.presentation);
  const source = useMemo(() => parseJson(sourceRaw), [sourceRaw]);
  const presentationId = idOf(presentationRaw) || null;
  const sharesRaw = useProperty(api, presentationId, PROPS.shares);
  const viewRaw = useProperty(api, presentationId, PROPS.view);
  const shares = useMemo(() => decodeShares(sharesRaw || '[]'), [sharesRaw]);
  const view = useMemo(() => decodeView(viewRaw || ''), [viewRaw]);
  const notes = useNotes(api, presentationId);

  const [doc, setDoc] = useState(null);
  const bytes = useRef(null);
  const [status, setStatus] = useState('');
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#ffd54f');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [position, setPosition] = useState({ page: 1, scroll: 0 });
  const [presenting, setPresenting] = useState(false);
  const [pagesText, setPagesText] = useState('');
  const [title, setTitle] = useState('');
  const [goto, setGoto] = useState(null);

  // the whole PDF, once (cached by the app between sessions)
  useEffect(() => {
    if (!source?.resourceId && !source?.key) return undefined;
    let live = true;
    setStatus('Loading the PDF…');
    (source.resourceId ? api.Resources.ReadById(source.resourceId) : api.Resources.Global.Read(source.key))
      .then(async (data) => {
        if (!data) throw new Error('The file is gone from the game.');
        const b = await toBytes(data);
        const pdf = await openPdf(b.slice());
        if (!live) return;
        bytes.current = b; setDoc(pdf); setStatus('');
      })
      .catch((e) => { if (live) setStatus(`The PDF couldn't be loaded: ${e?.message ?? e}`); });
    return () => { live = false; };
  }, [api, source?.resourceId, source?.key]);

  // presenting: the GM's place goes to the players (a few times a second at most)
  const pending = useRef(null);
  const lastSent = useRef(0);
  useEffect(() => {
    if (!presenting || !presentationId) return undefined;
    const next = presenterView(shares, view, position.page, position.scroll, player.me.id);
    if (!next) return undefined;
    const send = () => {
      lastSent.current = Date.now();
      api.Properties.Global.Set(presentationId, PROPS.view, JSON.stringify({ ...next, at: new Date().toISOString() })).catch(() => {});
    };
    const wait = PRESENT_EVERY_MS - (Date.now() - lastSent.current);
    clearTimeout(pending.current);
    if (wait <= 0) send(); else pending.current = setTimeout(send, wait);
    return () => clearTimeout(pending.current);
  }, [presenting, position, shares, view, presentationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageNumbers = useMemo(() => (doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []), [doc]);
  const sharedPages = useMemo(() => new Set(shares.flatMap((s) => s.pages)), [shares]);

  const show = async () => {
    const pages = parsePages(pagesText || String(position.page), doc.numPages);
    if (!pages) { setStatus(`Pages are written like 3 or 3-5, 8 (1 to ${doc.numPages}).`); return; }
    try {
      setStatus('Preparing the pages…');
      const built = await buildShare(bytes.current, doc, pages, { onProgress: (f) => setStatus(`Rendering pages… ${Math.round(f * 100)}%`) });
      const { key } = shareKey();
      setStatus(`Sending ${(built.bytes.length / 1024).toFixed(0)} KB…`);
      await api.Resources.Global.Create(key, new Blob([built.bytes], { type: PDF }), title || `Pages ${pages.join(', ')}`, PDF);
      fire(api, 'share', { documentId: api.cardId, title: title.trim(), pages: JSON.stringify(pages), resourceKey: key, kind: built.kind });
      setStatus(built.kind === 'image' ? 'Shown as pictures: this PDF doesn\'t let its pages be copied, so text can\'t be selected.' : '');
      setPagesText(''); setTitle('');
    } catch (e) {
      setStatus(`The pages couldn't be shown: ${e?.message ?? e}`);
    }
  };

  const create = (annotation) => {
    if (!sharedPages.has(annotation.page)) { setStatus('Notes go on pages the players have: show this page first.'); return; }
    notes.add({ ...annotation, color });
    setTool((t) => (t === 'pin' ? 'select' : t));
  };

  if (sourceRaw === null) return <div className="pdf-empty">Loading…</div>;
  if (!source?.resourceId && !source?.key) {
    return <SourcePicker api={api} onPicked={(s) => api.Properties.Set(PROPS.source, JSON.stringify(s))} />;
  }

  return (
    <div className="pdf-app">
      <div className="pdf-header">
        <b className="pdf-title" title={source.name}>{source.name}</b>
        <span className="pdf-muted">page {position.page} of {doc?.numPages ?? source.pageCount ?? '?'}</span>
        <label className="pdf-follow" title="Players following you scroll with you (only on pages they have)">
          <input type="checkbox" checked={presenting} disabled={!shares.length} onChange={(e) => setPresenting(e.target.checked)} /> Present
        </label>
      </div>
      <Tools tool={tool} setTool={setTool} color={color} setColor={setColor} zoom={zoom} setZoom={setZoom} hasText>
        {/* No <form>: the card's frame is sandboxed without allow-forms, so submitting is blocked. */}
        <div className="pdf-tool-group pdf-share-form" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && doc) show(); }}>
          <input value={pagesText} onChange={(e) => setPagesText(e.target.value)} placeholder={`Pages (${position.page})`} size={8} title="e.g. 3-5, 8" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" size={10} maxLength={100} />
          <button type="button" disabled={!doc} onClick={show}>Show to players</button>
        </div>
      </Tools>
      {status && <div className="pdf-status">{status}</div>}
      <div className="pdf-body">
        {doc ? (
          <PdfPages
            pdfDoc={doc} pages={pageNumbers} notesByPage={notes.byPage} tool={tool} color={color}
            selectedId={selectedId} onSelect={setSelectedId} onCreate={create} textLayer zoom={zoom}
            onPosition={setPosition} goto={goto}
          />
        ) : <div className="pdf-empty">{status || 'Loading…'}</div>}
        <aside className="pdf-side">
          <div className="pdf-shares">
            <div className="pdf-side-title">
              Shown to players
              {presentationId && <button type="button" className="pdf-link" onClick={() => fire(api, 'show', { documentId: api.cardId })}>open for everyone</button>}
            </div>
            {!shares.length && <div className="pdf-empty">Nothing yet. Pick pages above and press “Show to players”.</div>}
            {shares.map((s) => (
              <div key={s.sid} className={`pdf-share${view?.shareId === s.sid ? ' current' : ''}`}>
                <button type="button" className="pdf-link" onClick={() => setGoto((g) => ({ page: s.pages[0], scroll: 0, seq: (g?.seq ?? 0) + 1 }))}>
                  {s.title} <span className="pdf-muted">p.{s.pages.length > 3 ? `${s.pages[0]}–${s.pages[s.pages.length - 1]}` : s.pages.join(', ')}{s.kind === 'image' ? ' · pictures' : ''}</span>
                </button>
                <button type="button" className="pdf-link pdf-danger" onClick={() => fire(api, 'unshare', { documentId: api.cardId, shareId: s.sid })}>take back</button>
              </div>
            ))}
          </div>
          <Notes byId={notes.byId} pages={[...sharedPages]} selectedId={selectedId} me={player.me} isGm
            onSelect={(id) => {
              setSelectedId(id);
              const n = id && notes.byId.get(id);
              if (n) setGoto((g) => ({ page: n.page, scroll: Math.max(0, (n.shape?.[0]?.[1] ?? n.shape?.[1] ?? 0) - 0.1), seq: (g?.seq ?? 0) + 1, smooth: true }));
            }}
            onEdit={notes.edit} onRemove={(id) => { notes.remove(id); setSelectedId(null); }} onReply={notes.reply} />
        </aside>
      </div>
    </div>
  );
}
