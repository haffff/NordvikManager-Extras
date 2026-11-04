import React, { useEffect, useState } from 'react';
import { usePlayer, idOf } from './api.js';
import { PROPS, parseJson } from '../../../include_sources/pdf.mjs';
import { Viewer } from './Viewer.jsx';

/**
 * One page for the two ways it opens:
 * - a PDF Document card (pdf_kind "document"): the GM's, or a player's once it's shared;
 * - the pdf_viewer view, opened with { documentId } for everyone when the GM shares the PDF.
 */
export default function App({ Api }) {
  const player = usePlayer(Api);
  const [kind, setKind] = useState(null);
  useEffect(() => {
    Api.Properties.Get(PROPS.kind).then((p) => setKind(p?.value ?? '')).catch(() => setKind(''));
  }, [Api]);

  if (!player || kind === null) return <div className="pdf-empty">Loading…</div>;
  const documentId = kind === 'document'
    ? idOf(Api.cardId)
    : idOf(parseJson(Api.additionalArguments)?.documentId);
  if (!documentId) return <div className="pdf-empty">Nothing to show.</div>;
  return <Viewer api={Api} documentId={documentId} player={player} />;
}
