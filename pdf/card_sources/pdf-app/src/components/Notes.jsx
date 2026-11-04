import React, { useEffect, useState } from 'react';

const KIND_LABEL = { highlight: 'Highlight', box: 'Box', pin: 'Pin', ink: 'Drawing' };
const mine = (note, me, isGm) => isGm || String(note.author).toLowerCase() === String(me.id).toLowerCase();

function Detail({ note, me, isGm, onEdit, onRemove, onReply, onClose }) {
  const [text, setText] = useState(note.text);
  const [reply, setReply] = useState('');
  useEffect(() => setText(note.text), [note.id, note.text]);
  const canEdit = mine(note, me, isGm);
  return (
    <div className="pdf-note-detail">
      <div className="pdf-note-head">
        <span className="pdf-swatch" style={{ background: note.color }} />
        <b>{KIND_LABEL[note.kind]}</b> · page {note.page} · {note.authorName || 'someone'}
        <button type="button" className="pdf-link" onClick={onClose}>Close</button>
      </div>
      {canEdit ? (
        <>
          <textarea value={text} maxLength={2000} placeholder="Add a note…" onChange={(e) => setText(e.target.value)} />
          <div className="pdf-row">
            <button type="button" disabled={text === note.text} onClick={() => onEdit(note.id, { text })}>Save</button>
            <button type="button" className="pdf-danger" onClick={() => onRemove(note.id)}>Delete</button>
          </div>
        </>
      ) : (note.text ? <p className="pdf-note-text">{note.text}</p> : null)}
      <div className="pdf-replies">
        {note.replies.map((r) => (
          <div key={r.id} className="pdf-reply">
            <b>{r.authorName || 'someone'}:</b> {r.text}
            {mine(r, me, isGm) && <button type="button" className="pdf-link" onClick={() => onRemove(r.id)}>delete</button>}
          </div>
        ))}
      </div>
      <form className="pdf-row" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { onReply(note.id, reply.trim()); setReply(''); } }}>
        <input value={reply} maxLength={2000} placeholder="Reply…" onChange={(e) => setReply(e.target.value)} />
        <button type="submit" disabled={!reply.trim()}>Reply</button>
      </form>
    </div>
  );
}

/** Notes on the pages in view, or the selected one with its replies. */
export function Notes({ byId, pages, selectedId, me, isGm, onSelect, onEdit, onRemove, onReply }) {
  const selected = selectedId ? byId.get(selectedId) : null;
  if (selected) return <Detail note={selected} me={me} isGm={isGm} onEdit={onEdit} onRemove={onRemove} onReply={onReply} onClose={() => onSelect(null)} />;
  const shown = new Set(pages);
  const list = [...byId.values()].filter((n) => shown.has(n.page)).sort((a, b) => a.page - b.page || (a.shape?.[0]?.[1] ?? a.shape?.[1] ?? 0) - (b.shape?.[0]?.[1] ?? b.shape?.[1] ?? 0));
  if (!list.length) return <div className="pdf-empty">No notes yet. Pick a tool above and mark the page.</div>;
  return (
    <ul className="pdf-note-list">
      {list.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => onSelect(n.id)}>
            <span className="pdf-swatch" style={{ background: n.color }} />
            <span className="pdf-note-meta">p.{n.page} · {n.authorName || 'someone'}</span>
            <span className="pdf-note-preview">{n.text || KIND_LABEL[n.kind]}{n.replies.length ? ` (${n.replies.length})` : ''}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
