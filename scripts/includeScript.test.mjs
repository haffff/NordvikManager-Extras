import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIncludeScript } from './includeScript.mjs';

test('top-level exports become plain declarations that run as a script', () => {
  const script = toIncludeScript('export function twice(x) { return 2 * x; }\nexport const ONE = 1;\nconst hidden = 3;');
  assert.equal(new Function(`${script}\nreturn twice(ONE) + hidden;`)(), 5);
});

test('imports and other export forms are refused', () => {
  assert.throws(() => toIncludeScript("import x from 'y';"), /can't import/);
  assert.throws(() => toIncludeScript('export default 1;'), /only "export function/);
  assert.throws(() => toIncludeScript('const a = 1;\nexport { a };'), /:2:/);
});
