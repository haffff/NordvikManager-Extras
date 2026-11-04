// Cuts the shown pages out of the GM's PDF into a new, small one: what players download.
// copy: the PDF's own pages (sharp text, selectable), each keeping only the images it draws
//   and none of its annotations, links or metadata, so nothing from other pages comes along.
// image: the pages rendered by pdf.js, for files pdf-lib can't copy (encrypted ones, as
//   bought PDFs often are, or files it can't parse).
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib';
import { xObjectsDrawn } from './contentNames.mjs';

const PAGE_KEYS_TO_DROP = ['Annots', 'B', 'Thumb', 'PieceInfo', 'Metadata', 'AA', 'StructParents'];
const IMAGE_SCALE = 2;
const JPEG_QUALITY = 0.85;

function contentText(page) {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  let out = '';
  for (const s of streams) {
    if (!(s instanceof PDFRawStream)) continue;
    const bytes = decodePDFRawStream(s).decode();
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    out += '\n';
  }
  return out;
}

/** Leaves only what the page draws in its XObject resources, and nothing page-level that isn't drawing. */
function prune(page) {
  for (const key of PAGE_KEYS_TO_DROP) page.node.delete(PDFName.of(key));
  const resources = page.node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjects) return;
  let drawn;
  try { drawn = xObjectsDrawn(contentText(page)); } catch { return; } // can't read it: keep it whole
  const kept = page.doc.context.obj({});
  for (const [name, ref] of xobjects.entries()) if (drawn.has(name.decodeText())) kept.set(name, ref);
  // A fresh dictionary for this page: the shared one other pages point at stays untouched.
  const own = resources.clone(page.doc.context);
  own.set(PDFName.of('XObject'), kept);
  page.node.set(PDFName.of('Resources'), own);
}

async function copyPages(sourceBytes, pages) {
  const source = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  const copied = await out.copyPages(source, pages.map((p) => p - 1));
  for (const page of copied) { out.addPage(page); prune(page); }
  return out.save();
}

async function renderPages(pdfDoc, pages, onProgress) {
  const out = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < pages.length; i++) {
    const page = await pdfDoc.getPage(pages[i]);
    const size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: IMAGE_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    out.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
    page.cleanup();
    onProgress?.((i + 1) / pages.length);
  }
  return out.save();
}

/**
 * The share's bytes and kind for document pages (1-based). sourceBytes: the whole PDF;
 * pdfDoc: it opened in pdf.js (for rendering when copying isn't possible).
 */
export async function buildShare(sourceBytes, pdfDoc, pages, { onProgress } = {}) {
  try {
    const bytes = await copyPages(sourceBytes, pages);
    return { bytes, kind: 'copy' };
  } catch (e) {
    console.info('PDF: pages can\'t be copied from this file, sending them as images:', e?.message);
    return { bytes: await renderPages(pdfDoc, pages, onProgress), kind: 'image' };
  }
}
