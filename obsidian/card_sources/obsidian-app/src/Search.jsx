import { useState } from 'react';

// Searching the vault (Obsidian's simple search: words in note names and text). Each result
// can be opened, shared with the players, or pinned to the token the search was opened from.
export default function Search({ call, ready, pinTo }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState({}); // path -> { ok, text }

  const canSearch = ready && !busy && Boolean(query.trim());

  const search = async () => {
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

  const onRow = async (path, what) => {
    setRows((r) => ({ ...r, [path]: { ok: true, text: 'Working…' } }));
    try {
      const text = await what();
      setRows((r) => ({ ...r, [path]: { ok: true, text } }));
    } catch (err) {
      setRows((r) => ({ ...r, [path]: { ok: false, text: err.message } }));
    }
  };

  const importNote = (notePath, open) => call('import', 'imported', { notePath, open: open ? 'yes' : 'no' });
  const open = (path) => onRow(path, async () => (await importNote(path, true)).message);
  const share = (path) => onRow(path, async () => {
    const { cardId } = await importNote(path, false);
    return (await call('share', 'shared', { noteCardId: cardId })).message;
  });
  const pin = (path) => onRow(path, async () => {
    const { cardId } = await importNote(path, false);
    return (await call('pin', 'pinned', { elementId: pinTo, noteCardId: cardId })).message;
  });

  return (
    <div className="obs-page">
      <h1>{pinTo ? 'Pin an Obsidian note to the token' : 'Search Obsidian'}</h1>
      {/* Not a form element: the card's sandbox blocks form submission (no allow-forms). */}
      <div className="obs-row">
        <input className="obs-grow" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSearch) search(); }}
          placeholder="Words in a note's name or text" autoFocus />
        <button disabled={!canSearch} onClick={() => search()}>Search</button>
      </div>
      {busy && <p className="obs-muted">Searching…</p>}
      {error && <p className="obs-error">{error}</p>}
      {!busy && results && results.length === 0 && <p className="obs-muted">Nothing found.</p>}
      <ul className="obs-results">
        {(results ?? []).map((n) => (
          <li key={n.path}>
            <div className="obs-row">
              <span className="obs-grow obs-title">{n.title || 'Untitled'}</span>
              {n.folder && <span className="obs-muted">{n.folder}</span>}
            </div>
            {n.snippet && <p className="obs-muted obs-snippet">{n.snippet}</p>}
            <div className="obs-row">
              <button onClick={() => open(n.path)}>Open</button>
              {pinTo && <button onClick={() => pin(n.path)}>Pin to token</button>}
              <button onClick={() => share(n.path)}>Share with players</button>
            </div>
            {rows[n.path] && <p className={rows[n.path].ok ? 'obs-ok' : 'obs-error'}>{rows[n.path].text}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
