// pdf.js inside the card's sandboxed frame. The card is one classic script with no files
// next to it, so the worker is bundled into it (Vite ?worker&inline) and started from a
// blob: URL, which the sandbox's CSP allows. It must be a classic worker: in the frame's
// null origin a module worker from blob: fails to start (Chromium), so vite.config builds
// workers as IIFE. eval is never used (isEvalSupported: false).
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&inline';
import { retry } from './retry.mjs';

// pdf.js asks for parts in multiples of this.
export const CHUNK = 256 * 1024;
const FIRST = 2 * CHUNK; // the start of the file: its header, and usually page 1

// One worker for every document, handed to each as params.worker: pdf.js then never ends it
// when a document is destroyed (it would, for a worker it made itself from a global port).
let pdfWorker = null;

function ensureWorker() {
  if (!pdfWorker) pdfWorker = new pdfjs.PDFWorker({ port: new PdfWorker() });
}

const options = () => ({ isEvalSupported: false, useSystemFonts: true, worker: pdfWorker });

/** Opens a PDF from bytes (ArrayBuffer/Uint8Array/Blob), e.g. a file just picked for upload. */
export async function openPdf(data) {
  ensureWorker();
  const bytes = typeof data?.arrayBuffer === 'function' ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
  return pdfjs.getDocument({ data: bytes, ...options() }).promise;
}

/**
 * Opens a game resource ({ id } or { key }) as a PDF, reading only the parts pdf.js needs for
 * the pages it shows (CardAPI Resources.Open: the app fetches and caches the pieces).
 * onBytes(totalRead) follows how much has been read so far.
 */
export async function openPdfFromResource(api, ref, { onBytes } = {}) {
  ensureWorker();
  const file = await api.Resources.Open(ref);
  if (!file) throw new Error('The file is gone from the game.');
  let read = 0;
  const readPart = async (start, end) => {
    const bytes = await file.read(start, end);
    read += bytes.length;
    onBytes?.(read);
    return bytes;
  };
  const first = await readPart(0, Math.min(FIRST, file.size));
  if (file.size <= first.length) return pdfjs.getDocument({ data: first, ...options() }).promise;

  const transport = new pdfjs.PDFDataRangeTransport(file.size, first);
  // pdf.js asks for a part once: one that fails is asked for again here, or its pages would
  // stay blank until the PDF is opened again.
  transport.requestDataRange = (begin, end) => {
    retry(() => readPart(begin, end))
      .then((bytes) => transport.onDataRange(begin, bytes))
      .catch((e) => console.warn('PDF: part of the file could not be read', begin, end, e?.message));
  };
  return pdfjs.getDocument({ range: transport, rangeChunkSize: CHUNK, disableAutoFetch: true, ...options() }).promise;
}

export { pdfjs };
