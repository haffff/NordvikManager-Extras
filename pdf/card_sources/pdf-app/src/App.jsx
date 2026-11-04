import React, { useEffect, useState } from 'react';
import { usePlayer, idOf } from './api.js';
import { PROPS, parseJson } from '../../../include_sources/pdf.mjs';
import { DocumentMode } from './DocumentMode.jsx';
import { PresentationMode } from './PresentationMode.jsx';

/**
 * One page for the three ways it opens:
 * - a PDF Document card (pdf_kind "document"): the GM's whole file;
 * - a PDF Presentation card (pdf_kind "presentation"), e.g. from a player's Cards panel;
 * - the pdf_viewer view, opened with { presentationId } for everyone when the GM shows pages.
 */
export default function App({ Api }) {
  const player = usePlayer(Api);
  const [kind, setKind] = useState(null);
  useEffect(() => {
    Api.Properties.Get(PROPS.kind).then((p) => setKind(p?.value ?? '')).catch(() => setKind(''));
  }, [Api]);

  if (!player || kind === null) return <div className="pdf-empty">Loading…</div>;
  if (kind === 'document') {
    if (!player.isGm) return <div className="pdf-empty">This PDF is the GM's. You see the pages the GM shows you.</div>;
    return <DocumentMode api={Api} player={player} />;
  }
  const presentationId = kind === 'presentation'
    ? idOf(Api.cardId)
    : idOf(parseJson(Api.additionalArguments)?.presentationId);
  if (!presentationId) return <div className="pdf-empty">Nothing to show.</div>;
  return <PresentationMode api={Api} presentationId={presentationId} player={player} />;
}
