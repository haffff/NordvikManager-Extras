import { useState } from 'react';

// Searching Trilium (its own syntax: words, "exact phrase", #label). Each result can be
// opened, shared with the players, or pinned to the token the search was opened from.
export default function Search({ call, ready, pinTo }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState({}); // noteId -> { ok, text }

  const search = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const reply = await call('search', 'search', { query });
      setResults(reply.results ?? []);
      setRows({});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onRow = async (noteId, what) => {
    setRows((r) => ({ ...r, [noteId]: { ok: true, text: 'Working…' } }));
    try {
      const text = await what();
      setRows((r) => ({ ...r, [noteId]: { ok: true, text } }));
    } catch (err) {
      setRows((r) => ({ ...r, [noteId]: { ok: false, text: err.message } }));
    }
  };

  const importNote = (noteId, open) => call('import', 'imported', { noteId, open: open ? 'yes' : 'no' });
  const open = (noteId) => onRow(noteId, async () => (await importNote(noteId, true)).message);
  const share = (noteId) => onRow(noteId, async () => {
    const { cardId } = await importNote(noteId, false);
    return (await call('share', 'shared', { noteCardId: cardId })).message;
  });
  const pin = (noteId) => onRow(noteId, async () => {
    const { cardId } = await importNote(noteId, false);
    return (await call('pin', 'pinned', { elementId: pinTo, noteCardId: cardId })).message;
  });

  return (
    <div className="tri-page">
      <h1>{pinTo ? 'Pin a Trilium note to the token' : 'Search Trilium'}</h1>
      <form className="tri-row" onSubmit={search}>
        <input className="tri-grow" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder='Words, "an exact phrase" or #label' autoFocus />
        <button type="submit" disabled={!ready || busy || !query.trim()}>Search</button>
      </form>
      {error && <p className="tri-error">{error}</p>}
      {results && results.length === 0 && <p className="tri-muted">Nothing found.</p>}
      <ul className="tri-results">
        {(results ?? []).map((n) => (
          <li key={n.noteId}>
            <div className="tri-row">
              <span className="tri-grow tri-title">{n.title || 'Untitled'}</span>
              {n.type !== 'text' && <span className="tri-muted">{n.type}</span>}
            </div>
            <div className="tri-row">
              <button onClick={() => open(n.noteId)}>Open</button>
              {pinTo && <button onClick={() => pin(n.noteId)}>Pin to token</button>}
              <button onClick={() => share(n.noteId)}>Share with players</button>
            </div>
            {rows[n.noteId] && <p className={rows[n.noteId].ok ? 'tri-ok' : 'tri-error'}>{rows[n.noteId].text}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
