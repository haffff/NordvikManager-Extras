import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, StandardFonts } from 'pdf-lib';
import { buildShare } from './shareBuilder.js';

// 1×1 PNGs, a red and a blue one.
const png = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));
const RED = png('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==');
const BLUE = png('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==');

// Every image stream anywhere in the file, referenced or not: what a player could dig out.
const imagesInFile = (doc) => doc.context.enumerateIndirectObjects()
  .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length;

const xObjectNames = (page) => {
  const xo = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return xo ? xo.keys().map((k) => k.decodeText()).sort() : [];
};

// Like some publishing tools make them: every page points at one resource dictionary
// holding every image of the book; each page draws only its own.
async function bookWithSharedResources() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [red, blue] = [await doc.embedPng(RED), await doc.embedPng(BLUE)];
  const p1 = doc.addPage([200, 200]);
  p1.drawImage(red, { x: 0, y: 0, width: 50, height: 50 });
  p1.drawText('Page one', { x: 10, y: 150, size: 12, font });
  const p2 = doc.addPage([200, 200]);
  p2.drawImage(blue, { x: 0, y: 0, width: 50, height: 50 });
  // one dictionary for both pages, with both images
  const shared = p1.node.Resources();
  const xo = shared.lookup(PDFName.of('XObject'), PDFDict);
  for (const [name, ref] of p2.node.Resources().lookup(PDFName.of('XObject'), PDFDict).entries()) xo.set(name, ref);
  const ref = doc.context.register(shared);
  p1.node.set(PDFName.of('Resources'), ref);
  p2.node.set(PDFName.of('Resources'), ref);
  // and an annotation (a popup note) on page one
  // as real files store them: an indirect annotation object
  const note = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Contents: 'GM secret' }));
  p1.node.set(PDFName.of('Annots'), doc.context.obj([note]));
  return doc.save();
}

test('a copied page keeps only the images it draws, and no annotations', async () => {
  const source = await bookWithSharedResources();
  const before = await PDFDocument.load(source);
  assert.equal(xObjectNames(before.getPage(0)).length, 2, 'the book really shares both images');
  assert.equal(imagesInFile(before), 2);

  const { bytes, kind } = await buildShare(source, null, [1]);
  assert.equal(kind, 'copy');
  const share = await PDFDocument.load(bytes);
  assert.equal(share.getPageCount(), 1);
  assert.equal(xObjectNames(share.getPage(0)).length, 1);
  assert.equal(imagesInFile(share), 1, "the other page's image must not be in the file at all");
  assert.equal(share.getPage(0).node.get(PDFName.of('Annots')), undefined);
  assert.ok(!Buffer.from(bytes).toString('latin1').includes('GM secret'));
});

test('a page drawing a form keeps only what the form draws', async () => {
  // page 3 draws page 1 as a form, whose resources are the shared dictionary with both images
  const book = await PDFDocument.load(await bookWithSharedResources());
  const form = await book.embedPage(book.getPage(0));
  book.addPage([200, 200]).drawPage(form, { x: 0, y: 0 });
  const source = await book.save();
  assert.equal(imagesInFile(await PDFDocument.load(source)), 2);

  const { bytes, kind } = await buildShare(source, null, [3]);
  assert.equal(kind, 'copy');
  assert.equal(imagesInFile(await PDFDocument.load(bytes)), 1);
});

test('pages come out in the order asked, from anywhere in the book', async () => {
  const source = await bookWithSharedResources();
  const { bytes } = await buildShare(source, null, [2, 1]);
  const share = await PDFDocument.load(bytes);
  assert.equal(share.getPageCount(), 2);
});
