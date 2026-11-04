// pdf.js inside the card's sandboxed frame. The card is one classic script with no files
// next to it, so the worker is bundled into it (Vite ?worker&inline) and started from a
// blob: URL, which the sandbox's CSP allows. It must be a classic worker: in the frame's
// null origin a module worker from blob: fails to start (Chromium), so vite.config builds
// workers as IIFE. eval is never used (isEvalSupported: false).
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&inline';

let workerPort = null;

function ensureWorker() {
  if (workerPort) return;
  workerPort = new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = workerPort;
}

/** Opens a PDF from bytes (ArrayBuffer/Uint8Array/Blob). */
export async function openPdf(data) {
  ensureWorker();
  const bytes = typeof data?.arrayBuffer === 'function' ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
  return pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
}

export { pdfjs };
