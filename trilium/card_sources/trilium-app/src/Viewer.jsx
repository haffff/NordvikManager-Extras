import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { sanitize } from './lib/sanitize.mjs';
import { indexedCard } from '../../../include_sources/trilium.mjs';

const FIELDS = ['title', 'html', 'trilium_note_id', 'modified'];

// One Trilium Note card. What a player may read is decided by the server: a card they
// can't read simply doesn't load. Links to other notes open them here when this player may
// read them; a GM imports a note that has no card yet.
export default function Viewer({ Api, game, call, ready, cardId: firstCardId }) {
  const [trail, setTrail] = useState(firstCardId ? [firstCardId] : []);
  const cardId = trail[trail.length - 1] ?? '';
  const [note, setNote] = useState(undefined); // undefined: loading, null: nothing to show
  const [flash, setFlash] = useState(null);
  const body = useRef(null);
  const isGM = game?.isGM === true;

  const load = useCallback(async (id) => {
    if (!id) return null;
    try {
      const props = await Api.Properties.Global.GetMany(id, FIELDS);
      const values = Object.fromEntries((props ?? []).map((p) => [p.name, p.value ?? '']));
      return values.trilium_note_id ? values : null;
    } catch {
      return null;
    }
  }, [Api]);

  // Load the card on show, and again when the GM refreshes it.
  useEffect(() => {
    let live = true;
    setNote(undefined);
    const reload = () => load(cardId).then((n) => { if (live) setNote(n); });
    reload();
    if (!cardId) return () => { live = false; };
    const onChange = () => reload();
    Api.Properties.Global.Subscribe(cardId, 'html', onChange);
    Api.Properties.Global.Subscribe(cardId, 'title', onChange);
    return () => {
      live = false;
      Api.Properties.Global.Unsubscribe(cardId, 'html', onChange);
      Api.Properties.Global.Unsubscribe(cardId, 'title', onChange);
    };
  }, [Api, cardId, load]);

  const html = useMemo(() => sanitize(DOMPurify, note?.html), [note?.html]);

  // Images are game resources (the import downloaded them): show them as blob: URLs.
  useEffect(() => {
    const root = body.current;
    if (!root) return undefined;
    const urls = [];
    let live = true;
    root.querySelectorAll('img[data-nm-resource]').forEach((img) => {
      Api.Resources.Global.Read(img.getAttribute('data-nm-resource')).then((data) => {
        if (!live || !(data instanceof Blob)) return;
        const url = URL.createObjectURL(data);
        urls.push(url);
        img.src = url;
      }).catch(() => {});
    });
    return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [Api, html]);

  const follow = async (noteId) => {
    setFlash(null);
    try {
      const index = await Api.Properties.Global.Get(game.gameId, 'trilium_cards');
      const known = indexedCard(index?.value, noteId);
      if (known && await load(known)) { setTrail((t) => [...t, known]); return; }
      if (!isGM) { setFlash({ ok: false, text: "That note hasn't been shared with you." }); return; }
      setFlash({ ok: true, text: 'Importing…' });
      const reply = await call('import', 'imported', { noteId });
      setFlash(null);
      setTrail((t) => [...t, reply.cardId]);
    } catch (err) {
      setFlash({ ok: false, text: err.message });
    }
  };

  // Links never navigate the card's page: note links open here, others do nothing.
  const onClick = (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    const noteId = link.getAttribute('data-nm-note');
    if (noteId) follow(noteId);
  };

  const gmDo = async (action, kind, args) => {
    setFlash({ ok: true, text: 'Working…' });
    try { setFlash({ ok: true, text: (await call(action, kind, args)).message }); }
    catch (err) { setFlash({ ok: false, text: err.message }); }
  };

  if (note === undefined) return <div className="tri-page tri-muted">Loading…</div>;
  if (note === null) {
    return (
      <div className="tri-page tri-muted">
        {cardId ? 'Nothing here yet.' : 'No Trilium note is pinned to this token.'}
      </div>
    );
  }

  return (
    <div className="tri-page">
      <div className="tri-row">
        {trail.length > 1 && <button onClick={() => setTrail((t) => t.slice(0, -1))}>Back</button>}
        <h1 className="tri-grow">{note.title || 'Untitled note'}</h1>
      </div>
      {isGM && (
        <div className="tri-row">
          <button disabled={!ready} onClick={() => gmDo('import', 'imported', { noteId: note.trilium_note_id })}>Refresh</button>
          <button disabled={!ready} onClick={() => gmDo('share', 'shared', { noteCardId: cardId })}>Share with players</button>
          <button disabled={!ready} onClick={() => gmDo('unshare', 'shared', { noteCardId: cardId })}>Take back</button>
        </div>
      )}
      {flash && <p className={flash.ok ? 'tri-ok' : 'tri-error'}>{flash.text}</p>}
      <div ref={body} className="tri-note" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
