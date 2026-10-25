import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The card runs in a sandboxed frame without allow-forms: the browser blocks a form's
// submission before any submit handler runs, so a <form> silently does nothing.
test('no page uses a form', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsx'))) {
    const source = readFileSync(join(dir, file), 'utf8');
    assert.doesNotMatch(source, /<form\b|onSubmit|type="submit"/, file);
  }
});
