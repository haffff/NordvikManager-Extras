// pdf.js inside the card's sandboxed frame. The card is one classic script with no files
// next to it, so the worker is bundled into it (Vite ?worker&inline) and started from a
// blob: URL, which the sandbox's CSP allows. It must be a classic worker: in the frame's
// null origin a module worker from blob: fails to start (Chromium), so vite.config builds
// workers as IIFE. eval is never used (isEvalSupported: false).
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&inline';

// pdf.js asks for parts in multiples of this.
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
  if (file.size <= first.length) return pdfjs.getDocument({ data: first, ...OPTIONS }).promise;

  const transport = new pdfjs.PDFDataRangeTransport(file.size, first);
  transport.requestDataRange = (begin, end) => {
    readPart(begin, end)
      .then((bytes) => transport.onDataRange(begin, bytes))
      .catch((e) => console.warn('PDF: part of the file could not be read', begin, end, e?.message));
  };
  return pdfjs.getDocument({ range: transport, rangeChunkSize: CHUNK, disableAutoFetch: true, ...OPTIONS }).promise;
}

export { pdfjs };
