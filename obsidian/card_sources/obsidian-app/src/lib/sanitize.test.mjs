import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURIFY_CONFIG, sanitize } from './sanitize.mjs';

test('sanitize hands DOMPurify the config and only text', () => {
  const calls = [];
  const purify = { sanitize: (html, config) => { calls.push([html, config]); return 'clean'; } };
  assert.equal(sanitize(purify, '<p>x</p>'), 'clean');
  assert.equal(sanitize(purify, null), 'clean');
  assert.deepEqual(calls.map((c) => c[0]), ['<p>x</p>', '']);
  assert.equal(calls[0][1], PURIFY_CONFIG);
});

test('the config keeps scripts, frames, forms and every src out', () => {
  for (const tag of ['script', 'iframe', 'form', 'style']) assert.ok(PURIFY_CONFIG.FORBID_TAGS.includes(tag), tag);
  for (const attr of ['src', 'srcset', 'action']) assert.ok(PURIFY_CONFIG.FORBID_ATTR.includes(attr), attr);
});
