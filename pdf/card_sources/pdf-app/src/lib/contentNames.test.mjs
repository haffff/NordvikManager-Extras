import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xObjectsDrawn } from './contentNames.mjs';

test('xObjectsDrawn finds the images and forms a content stream paints with Do', () => {
  const content = `q 595 0 0 842 0 0 cm /Im12 Do Q
BT /F1 11 Tf (text with /Fake Do inside a string) Tj ET
q /Fm0 Do Q /Im#2012 Do
% /Commented Do`;
  assert.deepEqual([...xObjectsDrawn(content)].sort(), ['Fm0', 'Im 12', 'Im12']);
});

test('xObjectsDrawn: nothing drawn, nothing kept', () => {
  assert.equal(xObjectsDrawn('BT /F1 12 Tf (hi) Tj ET').size, 0);
});
