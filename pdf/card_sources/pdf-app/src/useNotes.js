import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProperty, fire } from './api.js';
import { decodeAnnotations, withPending } from './lib/model.mjs';
import { PROPS } from '../../../include_sources/pdf.mjs';

// A change the server hasn't confirmed after this long was refused (the reason comes as a
// whisper in chat): it's dropped and the note shows as the server has it.
const PENDING_FOR_MS = 20000;

const newCid = () => 'c' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const EMPTY = { added: [], removed: new Map(), edited: new Map() };

/**
 * The document's notes and the ways to change them. Every change goes through the annotate
 * action (players can only read the document; the server checks the rest), and shows at once
 * meanwhile: new notes pending, removed ones hidden, edits applied, until the server's notes
 * show them (or the change was refused).
 */
export function useNotes(api, documentId, me) {
  const raw = useProperty(api, documentId, PROPS.annotations);
  const decoded = useMemo(() => decodeAnnotations(raw || '[]'), [raw]);
  const [pending, setPending] = useState(EMPTY);

  const view = useMemo(() => withPending(decoded, {
    added: pending.added,
    removed: new Set(pending.removed.keys()),
    edited: new Map([...pending.edited].map(([id, e]) => [id, e.change])),
  }, me), [decoded, pending, me]);

  // forget what the server now shows
  const { settled } = view;
  useEffect(() => {
    if (!settled.added.length && !settled.removed.length && !settled.edited.length) return;
    setPending((p) => ({
      added: p.added.filter((a) => !settled.added.includes(a.cid)),
      removed: new Map([...p.removed].filter(([id]) => !settled.removed.includes(id))),
      edited: new Map([...p.edited].filter(([id]) => !settled.edited.includes(id))),
    }));
  }, [settled]);

  // and what the server never confirmed
  const hasPending = pending.added.length + pending.removed.size + pending.edited.size > 0;
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = setInterval(() => {
      const old = Date.now() - PENDING_FOR_MS;
      setPending((p) => ({
        added: p.added.filter((a) => a.since > old),
        removed: new Map([...p.removed].filter(([, since]) => since > old)),
        edited: new Map([...p.edited].filter(([, e]) => e.since > old)),
      }));
    }, 2000);
    return () => clearInterval(timer);
  }, [hasPending]);

  const send = useRef(null);
  send.current = (op, extra) => documentId && fire(api, 'annotate', { documentId, op, ...extra });

  const add = useCallback((annotation) => {
    const cid = newCid();
    setPending((p) => ({ ...p, added: [...p.added, { ...annotation, cid, since: Date.now() }] }));
    send.current('add', { annotation: JSON.stringify({ ...annotation, cid }) });
  }, []);
  const edit = useCallback((itemId, change) => {
    if (String(itemId).startsWith('pending:')) return;
    setPending((p) => ({ ...p, edited: new Map(p.edited).set(itemId, { change, since: Date.now() }) }));
    send.current('update', { itemId, annotation: JSON.stringify(change) });
  }, []);
  const remove = useCallback((itemId) => {
    if (String(itemId).startsWith('pending:')) return;
    setPending((p) => ({ ...p, removed: new Map(p.removed).set(itemId, Date.now()) }));
    send.current('remove', { itemId });
  }, []);
  const reply = useCallback((parent, text) => add({ kind: 'reply', parent, text }), [add]);

  return { byId: view.byId, byPage: view.byPage, add, edit, remove, reply };
}
