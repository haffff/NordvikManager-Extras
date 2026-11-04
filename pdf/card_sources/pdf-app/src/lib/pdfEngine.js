// pdf.js inside the card's sandboxed frame. The card is one classic script with no files
// next to it, so the worker is bundled into it (Vite ?worker&inline) and started from a
// blob: URL, which the sandbox's CSP allows. It must be a classic worker: in the frame's
// null origin a module worker from blob: fails to start (Chromium), so vite.config builds
// workers as IIFE. eval is never used (isEvalSupported: false).
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&inline';
import { createRangeReader } from './rangeReader.mjs';

// pdf.js asks for parts in multiples of this; each is one ReadRange (and one cache entry).
export const CHUNK = 256 * 1024;
const FIRST = 2 * CHUNK; // the start of the file: its header, and usually page 1

let workerPort = null;

function ensureWorker() {
  if (workerPort) return;
  workerPort = new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = workerPort;
}

const OPTIONS = { isEvalSupported: false, useSystemFonts: true };

/** Opens a PDF from bytes (ArrayBuffer/Uint8Array/Blob), e.g. a file just picked for upload. */
export async function openPdf(data) {
  ensureWorker();
  const bytes = typeof data?.arrayBuffer === 'function' ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
  return pdfjs.getDocument({ data: bytes, ...OPTIONS }).promise;
}

/**
 * Opens a game resource ({ id } or { key }) as a PDF, reading only the parts pdf.js needs for
 * the pages it shows (CardAPI.Resources.ReadRange), never the whole file at once.
 * onBytes(totalFetched) follows how much has come so far.
 */
export async function openPdfFromResource(api, ref, { onBytes } = {}) {
  ensureWorker();
  const first = await api.Resources.ReadRange(ref, 0, FIRST);
  if (!first?.bytes?.length) throw new Error('The file is gone from the game.');
  const total = first.total;
  let fetched = first.bytes.length;
  onBytes?.(fetched);
  if (total <= first.bytes.length) return pdfjs.getDocument({ data: first.bytes, ...OPTIONS }).promise;

  const reader = createRangeReader(async (start, length) => {
    const part = await api.Resources.ReadRange(ref, start, length);
    if (part?.bytes) { fetched += part.bytes.length; onBytes?.(fetched); }
    return part;
  }, CHUNK, total);

  const transport = new pdfjs.PDFDataRangeTransport(total, first.bytes);
  transport.requestDataRange = (begin, end) => {
    reader.read(begin, end)
      .then((bytes) => transport.onDataRange(begin, bytes))
      .catch((e) => console.warn('PDF: part of the file could not be read', begin, end, e?.message));
  };
  return pdfjs.getDocument({
    range: transport, rangeChunkSize: CHUNK, disableAutoFetch: true, ...OPTIONS,
  }).promise;
}

export { pdfjs };
