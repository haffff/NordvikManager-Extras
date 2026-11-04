import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProperty, fire, idOf } from './api.js';
import { useNotes } from './useNotes.js';
import { decodeView, presenterView } from './lib/model.mjs';
import { openPdfFromResource } from './lib/pdfEngine.js';
import { PROPS, parseJson, truthy } from '../../../include_sources/pdf.mjs';
import { PdfPages } from './components/PdfPages.jsx';
import { Tools } from './components/Tools.jsx';
import { Notes } from './components/Notes.jsx';

const PDF = 'application/pdf';
const PRESENT_EVERY_MS = 300;

const randomHex = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const refOf = (source) => (source?.resourceId ? { id: source.resourceId } : source?.key ? { key: source.key } : null);
const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Choosing the PDF (GM): one from the Materials panel, or a file uploaded here. */
function SourcePicker({ api, onPicked }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { api.Resources.List({ mimeType: PDF }).then(setFiles).catch(() => setFiles([])); }, [api]);

  const pick = async (source) => {
    setBusy('Reading the PDF…');
    try {
      const pdf = await openPdfFromResource(api, refOf(source));
      await onPicked({ ...source, pageCount: pdf.numPages });
    } catch (e) {
      setBusy(`That file couldn't be opened as a PDF (${e?.message ?? e}).`);
    }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(`Uploading ${file.name} (${kb(file.size)})…`);
    const key = `pdf_src_${randomHex()}.pdf`;
    try {
      // Into the server's file storage: parts of it are then read without loading it whole.
      // A big file goes up in parts; the bar follows them.
      await api.Resources.Upload(file, { key, name: file.name, mimeType: PDF, global: true, storage: 'file' },
        (f) => setBusy(`Uploading ${file.name} (${kb(file.size)})… ${Math.round(f * 100)}%`));
    } catch (e) { setBusy(`The upload failed: ${e?.message ?? e}`); return; }
    await pick({ key, name: file.name });
  };

  return (
    <div className="pdf-picker">
      <h3>Pick a PDF</h3>
      <label className="pdf-upload" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}>
        <input type="file" accept={PDF} onChange={(e) => upload(e.target.files?.[0])} />
        Upload a PDF (or drop it here)
      </label>
      <h4>From the Materials panel</h4>
      {files === null ? <div>Loading…</div> : !files.length ? <div className="pdf-empty">No PDFs in Materials yet.</div> : (
        <ul className="pdf-file-list">
          {files.map((f) => <li key={f.id}><button type="button" onClick={() => pick({ resourceId: f.id, name: f.name })}>{f.name}</button></li>)}
        </ul>
      )}
      {busy && <div className="pdf-status">{busy}</div>}
    </div>
  );
}

/**
 * A PDF Document for everyone: the GM picks the file, shares it and presents; players follow;
 * everyone annotates. Only the parts of the file on screen are downloaded.
 */
export function Viewer({ api, documentId, player }) {
  const isGm = player.isGm;
  const own = idOf(api.cardId) === documentId;
  const sourceRaw = useProperty(api, documentId, PROPS.source);
  const sharedRaw = useProperty(api, documentId, PROPS.shared);
  const viewRaw = useProperty(api, documentId, PROPS.view);
  const source = useMemo(() => parseJson(sourceRaw), [sourceRaw]);
  const view = useMemo(() => decodeView(viewRaw || ''), [viewRaw]);
  const shared = truthy(sharedRaw);
  const notes = useNotes(api, documentId, player.me);

  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('');
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(/^#[0-9a-f]{6}$/i.test(player.me.color || '') ? player.me.color.toLowerCase() : '#ffd54f');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [position, setPosition] = useState({ page: 1, scroll: 0 });
  const [presenting, setPresenting] = useState(false);
  const [follow, setFollow] = useState(!isGm);
  const [goto, setGoto] = useState(null);
  const [fetched, setFetched] = useState(0);

  // the PDF, read in parts as pages come into view (and cached by the app)
  const ref = refOf(source);
  const refKey = ref ? JSON.stringify(ref) : '';
  useEffect(() => {
    if (!ref) return undefined;
    let live = true;
    setDoc(null);
    setStatus('Opening the PDF…');
    openPdfFromResource(api, ref, { onBytes: (n) => live && setFetched(n) })
      .then((pdf) => { if (live) { setDoc(pdf); setStatus(''); } })
      .catch((e) => { if (live) setStatus(`The PDF couldn't be opened: ${e?.message ?? e}`); });
    return () => { live = false; };
  }, [api, refKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // following: go where the GM is
  useEffect(() => {
    if (!follow || !view || !doc) return;
    setGoto((g) => ({ page: view.page, scroll: view.scroll, seq: (g?.seq ?? 0) + 1, smooth: true }));
  }, [follow, view, doc]);

  // presenting: the GM's place goes to the players (a few times a second at most)
  const pending = useRef(null);
  const lastSent = useRef(0);
  useEffect(() => {
    if (!presenting || !isGm) return undefined;
    const next = presenterView(view, position.page, position.scroll, player.me.id);
    if (!next) return undefined;
    const send = () => {
      lastSent.current = Date.now();
      api.Properties.Global.Set(documentId, PROPS.view, JSON.stringify({ ...next, at: new Date().toISOString() })).catch(() => {});
    };
    const wait = PRESENT_EVERY_MS - (Date.now() - lastSent.current);
    clearTimeout(pending.current);
    if (wait <= 0) send(); else pending.current = setTimeout(send, wait);
    return () => clearTimeout(pending.current);
  }, [presenting, position, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageNumbers = useMemo(() => (doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []), [doc]);
  // Stable callbacks: pages and the notes panel only redraw when their own things change.
  const colorRef = useRef(color);
  colorRef.current = color;
  const byIdRef = useRef(notes.byId);
  byIdRef.current = notes.byId;
  const { add: addNote, edit: editNote, remove: removeNote, reply: replyNote } = notes;
  const create = useCallback((annotation) => {
    addNote({ ...annotation, color: colorRef.current });
    setTool((t) => (t === 'pin' ? 'select' : t));
  }, [addNote]);
  const jumpTo = useCallback((id) => {
    setSelectedId(id);
    const n = id && byIdRef.current.get(id);
    if (n) { setFollow(false); setGoto((g) => ({ page: n.page, scroll: Math.max(0, (n.shape?.[0]?.[1] ?? n.shape?.[1] ?? 0) - 0.1), seq: (g?.seq ?? 0) + 1, smooth: true })); }
  }, []);
  const removeAndClose = useCallback((id) => { removeNote(id); setSelectedId(null); }, [removeNote]);

  if (sourceRaw === null) return <div className="pdf-empty">Loading…</div>;
  if (!ref) {
    if (isGm && own) return <SourcePicker api={api} onPicked={(s) => api.Properties.Set(PROPS.source, JSON.stringify(s))} />;
    return <div className="pdf-empty">The GM hasn't picked a PDF yet.</div>;
  }

  return (
    <div className="pdf-app">
      <div className="pdf-header">
        <b className="pdf-title" title={source.name}>{source.name}</b>
        <span className="pdf-muted">page {position.page} of {doc?.numPages ?? source.pageCount ?? '?'}{fetched ? ` · ${kb(fetched)} loaded` : ''}</span>
        <div className="pdf-actions">
          {isGm && (shared
            ? <button type="button" onClick={() => fire(api, 'show', { documentId })} title="Open it again for players who closed it">Open for everyone</button>
            : <button type="button" onClick={() => fire(api, 'share', { documentId })} title="Every player can open and read the whole PDF">Share with players</button>)}
          {isGm ? (
            <label className="pdf-follow" title="Players following you scroll with you">
              <input type="checkbox" checked={presenting} disabled={!shared} onChange={(e) => setPresenting(e.target.checked)} /> Present
            </label>
          ) : (
            <label className="pdf-follow" title="Scroll along with the GM">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow GM
            </label>
          )}
        </div>
      </div>
      <Tools tool={tool} setTool={setTool} color={color} setColor={setColor} zoom={zoom} setZoom={setZoom} hasText />
      {status && <div className="pdf-status">{status}</div>}
      <div className="pdf-body">
        {doc ? (
          <PdfPages
            pdfDoc={doc} pages={pageNumbers} notesByPage={notes.byPage} tool={tool} color={color}
            selectedId={selectedId} onSelect={setSelectedId} onCreate={create} textLayer zoom={zoom}
            onPosition={setPosition} goto={goto}
          />
        ) : <div className="pdf-empty">{status || 'Opening the PDF…'}</div>}
        <aside className="pdf-side">
          <Notes byId={notes.byId} pages={pageNumbers} selectedId={selectedId} me={player.me} isGm={isGm}
            onSelect={jumpTo} onEdit={editNote} onRemove={removeAndClose} onReply={replyNote} />
        </aside>
      </div>
    </div>
  );
}
