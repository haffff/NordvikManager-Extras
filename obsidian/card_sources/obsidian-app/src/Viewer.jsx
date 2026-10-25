import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { sanitize } from './lib/sanitize.mjs';
import { createRenderer } from './lib/markdown.mjs';
import { cardsNamed, resolveLink } from '../../../include_sources/obsidian.mjs';

const FIELDS = ['title', 'markdown', 'obsidian_path'];
const render = createRenderer(MarkdownIt);

// One Obsidian Note card. What a player may read is decided by the server: a card they can't
// read simply doesn't load. [[Links]] open the note they name here when this player may read
// its card; a GM imports a note that has no card yet.
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
      return values.obsidian_path ? values : null;
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
    Api.Properties.Global.Subscribe(cardId, 'markdown', onChange);
    Api.Properties.Global.Subscribe(cardId, 'title', onChange);
    return () => {
      live = false;
      Api.Properties.Global.Unsubscribe(cardId, 'markdown', onChange);
      Api.Properties.Global.Unsubscribe(cardId, 'title', onChange);
    };
  }, [Api, cardId, load]);

  const html = useMemo(() => sanitize(DOMPurify, render(note?.markdown)), [note?.markdown]);

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

  // The card of the note a link names that this player can read: of the cards of notes with
  // that name, the one resolveLink would pick (its folder, else the shortest path).
  const readableCard = async (target) => {
    const index = await Api.Properties.Global.Get(game.gameId, 'obsidian_cards');
    const loaded = [];
    for (const id of cardsNamed(index?.value, target)) {
      const card = await load(id);
      if (card) loaded.push({ id, filename: card.obsidian_path });
    }
    const path = resolveLink(loaded, target, note?.obsidian_path);
    return loaded.find((c) => c.filename === path)?.id ?? '';
  };

  const follow = async (target) => {
    setFlash(null);
    try {
      const known = await readableCard(target);
      if (known) { setTrail((t) => [...t, known]); return; }
      if (!isGM) { setFlash({ ok: false, text: "That note hasn't been shared with you." }); return; }
      setFlash({ ok: true, text: 'Importing…' });
      const reply = await call('open_link', 'imported', { target, from: note?.obsidian_path ?? '' });
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
    const target = link.getAttribute('data-nm-note');
    if (target) follow(target);
  };

  const gmDo = async (action, kind, args) => {
    setFlash({ ok: true, text: 'Working…' });
    try { setFlash({ ok: true, text: (await call(action, kind, args)).message }); }
    catch (err) { setFlash({ ok: false, text: err.message }); }
  };

  if (note === undefined) return <div className="obs-page obs-muted">Loading…</div>;
  if (note === null) {
    return (
      <div className="obs-page obs-muted">
        {cardId ? 'Nothing here yet.' : 'No Obsidian note is pinned to this token.'}
      </div>
    );
  }

  return (
    <div className="obs-page">
      <div className="obs-row">
        {trail.length > 1 && <button onClick={() => setTrail((t) => t.slice(0, -1))}>Back</button>}
        <h1 className="obs-grow">{note.title || 'Untitled note'}</h1>
      </div>
      {isGM && (
        <div className="obs-row">
          <button disabled={!ready} onClick={() => gmDo('import', 'imported', { notePath: note.obsidian_path })}>Refresh</button>
          <button disabled={!ready} onClick={() => gmDo('share', 'shared', { noteCardId: cardId })}>Share with players</button>
          <button disabled={!ready} onClick={() => gmDo('unshare', 'shared', { noteCardId: cardId })}>Take back</button>
        </div>
      )}
      {flash && <p className={flash.ok ? 'obs-ok' : 'obs-error'}>{flash.text}</p>}
      <div ref={body} className="obs-note" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
