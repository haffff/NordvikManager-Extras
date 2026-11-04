// Cuts the shown pages out of the GM's PDF into a new, small one: what players download.
// copy: the PDF's own pages (sharp text, selectable), each keeping only the images it draws
//   and none of its annotations, links or metadata, so nothing from other pages comes along.
// image: the pages rendered by pdf.js, for files pdf-lib can't copy (encrypted ones, as
//   bought PDFs often are, or files it can't parse).
// Pruning covers XObjects (images, and forms with their own resources). Images can also
// hide in tiling patterns (/Pattern) and soft masks (/ExtGState) of a shared resource
// dictionary; those are copied whole for now.
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib';
import { xObjectsDrawn } from './contentNames.mjs';

const PAGE_KEYS_TO_DROP = ['Annots', 'B', 'Thumb', 'PieceInfo', 'Metadata', 'AA', 'StructParents'];
const IMAGE_SCALE = 2;
const JPEG_QUALITY = 0.85;

const XOBJECT = PDFName.of('XObject');
const RESOURCES = PDFName.of('Resources');
const SUBTYPE = PDFName.of('Subtype');

function streamText(stream) {
  if (!(stream instanceof PDFRawStream)) throw new Error('unreadable content stream');
  const bytes = decodePDFRawStream(stream).decode();
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return out;
}

function pageText(page) {
  const contents = page.node.Contents();
  if (!contents) return '';
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  return streams.map(streamText).join('\n');
}

/**
 * A copy of a resource dictionary with only the XObjects `content` draws, going into the
 * forms it draws too (a form's own resources can point at the shared dictionary as well).
 */
function prunedResources(context, resources, content, seen) {
  const own = resources.clone(context);
  const xobjects = resources.lookupMaybe(XOBJECT, PDFDict);
  if (!xobjects) return own;
  const drawn = xObjectsDrawn(content);
  const kept = context.obj({});
  for (const [name, ref] of xobjects.entries()) {
    if (!drawn.has(name.decodeText())) continue;
    kept.set(name, ref);
    const form = context.lookup(ref);
    if (form instanceof PDFRawStream && form.dict.get(SUBTYPE)?.toString() === '/Form' && !seen.has(form)) {
      seen.add(form);
      const formResources = form.dict.lookupMaybe(RESOURCES, PDFDict);
      if (formResources) form.dict.set(RESOURCES, prunedResources(context, formResources, streamText(form), seen));
    }
  }
  own.set(XOBJECT, kept);
  return own;
}

/**
 * Strips a page of the source (a throwaway copy) before it's copied: copyPages copies
 * everything a page reaches, and save() writes all of it, so whatever must not go to the
 * players has to be unreachable first. Unreadable content throws: then the page goes as
 * a picture instead.
 */
function strip(page) {
  for (const key of PAGE_KEYS_TO_DROP) page.node.delete(PDFName.of(key));
  const resources = page.node.Resources();
  if (resources) page.node.set(RESOURCES, prunedResources(page.doc.context, resources, pageText(page), new Set()));
}

async function copyPages(sourceBytes, pages) {
  const source = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  for (const p of pages) strip(source.getPage(p - 1));
  const out = await PDFDocument.create({ updateMetadata: false });
  const copied = await out.copyPages(source, pages.map((p) => p - 1));
  for (const page of copied) out.addPage(page);
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
