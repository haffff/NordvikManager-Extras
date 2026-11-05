import React, { useEffect, useState } from 'react';
import { usePlayer, idOf, fire } from './api.js';
import { PROPS, parseJson } from '../../../include_sources/pdf.mjs';
import { Viewer, SourcePicker } from './Viewer.jsx';

/** New PDF (GM): pick or upload the file first, so the card is made already named after it. */
function NewDocument({ Api }) {
  const [error, setError] = useState('');
  const create = async (source) => {
    try {
      await fire(Api, 'create_document', { source: JSON.stringify(source) });
      Api.Close();
    } catch (e) { setError(`The PDF couldn't be added: ${e?.message ?? e}`); }
  };
  return (
    <>
      <SourcePicker api={Api} onPicked={create} />
      {error && <div className="pdf-status">{error}</div>}
    </>
  );
}

/**
 * One page for the two ways it opens:
 * - a PDF Document card (pdf_kind "document"): the GM's, or a player's once it's shared;
 * - the pdf_viewer view, opened with { documentId } for everyone when the GM shares the PDF,
 *   or with { newDocument: true } for the GM's New PDF (pick the file, then the card is made).
 */
export default function App({ Api }) {
  const player = usePlayer(Api);
  const [kind, setKind] = useState(null);
  useEffect(() => {
    Api.Properties.Get(PROPS.kind).then((p) => setKind(p?.value ?? '')).catch(() => setKind(''));
  }, [Api]);

  if (!player || kind === null) return <div className="pdf-empty">Loading…</div>;
  const args = kind === 'document' ? null : parseJson(Api.additionalArguments);
  if (args?.newDocument === true) {
    return player.isGm ? <NewDocument Api={Api} /> : <div className="pdf-empty">Only the GM can add a PDF.</div>;
  }
  const documentId = kind === 'document'
    ? idOf(Api.cardId)
    : idOf(args?.documentId);
  if (!documentId) return <div className="pdf-empty">Nothing to show.</div>;
  return <Viewer api={Api} documentId={documentId} player={player} />;
}
