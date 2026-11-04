import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The card runs in a frame sandboxed with allow-scripts only: forms don't submit, dialogs,
// popups and downloads don't open, and browser storage isn't there.
const BLOCKED = [
  [/<form[\s>]/, 'a <form> (submitting is blocked: use a button and Enter)'],
  [/\b(alert|confirm|prompt)\s*\(/, 'a browser dialog'],
  [/window\.open\s*\(|target=["']_blank/, 'a popup'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'browser storage'],
];

const dir = path.dirname(fileURLToPath(import.meta.url));
const sources = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? sources(path.join(d, e.name)) : /\.(jsx?|mjs)$/.test(e.name) && !e.name.includes('.test.') ? [path.join(d, e.name)] : []);

test('the card uses nothing its sandboxed frame blocks', () => {
  const found = [];
  for (const file of sources(dir)) {
    const text = readFileSync(file, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
    for (const [pattern, what] of BLOCKED) if (pattern.test(text)) found.push(`${path.relative(dir, file)}: ${what}`);
  }
  assert.deepEqual(found, []);
});
