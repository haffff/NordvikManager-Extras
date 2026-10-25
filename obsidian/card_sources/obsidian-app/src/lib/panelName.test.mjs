import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowPanelName } from './panelName.mjs';
import { REPLY_PANEL } from '../../../../include_sources/obsidian.mjs';

// Every open window of a view is the same card, so the app's card-id scoping alone would
// give two windows one panel: each window adds its own part.
test('each window gets its own reply panel name', () => {
  const a = windowPanelName(), b = windowPanelName();
  assert.notEqual(a, b);
  assert.match(a, /^addon_w[a-z0-9]{6,}_obsidian$/);
});

test('the actions accept it once the app adds the card id', () => {
  const scoped = windowPanelName().replace(/^addon_/, 'addon_1b4e28ba-2fa1-11d2-883f-0016d3cca427_');
  assert.match(scoped, REPLY_PANEL);
});

test('a poor random source still gives a valid name', () => {
  assert.match(windowPanelName(() => 0), /^addon_w[a-z0-9]{6,}_obsidian$/);
});
