import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A theme's --nordvik-surface can be see-through (Imperium Maledictum's is): over a card
// frame's white canvas the page turned grey. The page itself takes the opaque background.
test('the page background is the opaque theme background, not a surface', () => {
  const css = readFileSync(new URL('./App.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = /(^|\n)body\s*\{([^}]*)\}/.exec(css)?.[2] ?? '';
  assert.match(body, /background:\s*var\(--nordvik-background-color/);
  assert.doesNotMatch(body, /--nordvik-surface/);
});
