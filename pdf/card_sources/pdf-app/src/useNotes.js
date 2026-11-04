import { useMemo } from 'react';
import { useProperty, fire } from './api.js';
import { decodeAnnotations } from './lib/model.mjs';
import { PROPS } from '../../../include_sources/pdf.mjs';

/**
 * The presentation's notes and the ways to change them. Every change goes through the
 * annotate action (players can only read the presentation; the server checks the rest).
 */
export function useNotes(api, presentationId) {
  const raw = useProperty(api, presentationId, PROPS.annotations);
  const { byId, byPage } = useMemo(() => decodeAnnotations(raw || '[]'), [raw]);
  const send = (op, extra) => presentationId && fire(api, 'annotate', { presentationId, op, ...extra });
  return {
    byId,
    byPage,
    add: (annotation) => send('add', { annotation: JSON.stringify(annotation) }),
    edit: (itemId, change) => send('update', { itemId, annotation: JSON.stringify(change) }),
    remove: (itemId) => send('remove', { itemId }),
    reply: (parent, text) => send('add', { annotation: JSON.stringify({ kind: 'reply', parent, text }) }),
  };
}
