import React, { useState } from 'react';

/**
 * The search box (no <form>: the card's sandbox blocks form submits). Enter searches, or goes to
 * the next hit when the text hasn't changed; Shift+Enter goes back; Escape clears.
 */
export function SearchBar({ search, currentIndex, onSearch, onStep, onClear, onHighlight }) {
  const [text, setText] = useState('');
  const active = !!search.query;
  const same = active && text.trim() === search.query;
  const count = search.hits.length;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setText(''); onClear(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (same && count) onStep(e.shiftKey ? -1 : 1); else onSearch(text);
  };

  let status = '';
  if (active && !search.done) status = `Searching… page ${search.searched} of ${search.total}${count ? ` · ${count} found` : ''}`;
  else if (active && !count) status = 'No matches';
  else if (active) status = `${currentIndex >= 0 ? currentIndex + 1 : '–'} of ${count}${search.capped ? '+' : ''}`;

  return (
    <div className="pdf-tool-group pdf-search">
      <input
        type="search" placeholder="Search the PDF" aria-label="Search the PDF" value={text}
        onChange={(e) => { setText(e.target.value); if (!e.target.value) onClear(); }} onKeyDown={onKeyDown}
      />
      {active && (
        <>
          <button type="button" title="Previous (Shift+Enter)" disabled={!count} onClick={() => onStep(-1)}>↑</button>
          <button type="button" title="Next (Enter)" disabled={!count} onClick={() => onStep(1)}>↓</button>
          <button type="button" title="Highlight this match for everyone" disabled={currentIndex < 0} onClick={onHighlight}>Highlight it</button>
        </>
      )}
      {status && <span className="pdf-muted pdf-search-status">{status}</span>}
    </div>
  );
}

/** Every hit, by page, with the words around it. */
export function SearchResults({ search, currentId, onPick }) {
  if (!search.query || !search.hits.length) return null;
  return (
    <div className="pdf-search-results">
      <div className="pdf-side-title">Found “{search.query}”</div>
      <ul>
        {search.hits.map((h) => (
          <li key={h.id}>
            <button type="button" className={`pdf-search-hit${h.id === currentId ? ' current' : ''}`} onClick={() => onPick(h.id)}>
              <span className="pdf-muted">p.{h.page}</span> {h.before}<mark>{h.hit}</mark>{h.after}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
