import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewArgs } from './args.mjs';

const GUID = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

test('a view gets its ShowView Data, which arrives as a JSON string', () => {
  assert.deepEqual(viewArgs('{"view":"search","pinTo":"' + GUID + '"}', 'view-card'), { view: 'search', cardId: '', pinTo: GUID });
  assert.deepEqual(viewArgs({ view: 'settings' }, 'view-card'), { view: 'settings', cardId: '', pinTo: '' });
});

test('the viewer shows the card it was given, or nothing', () => {
  assert.deepEqual(viewArgs('{"view":"viewer","cardId":"' + GUID + '"}', 'view-card'), { view: 'viewer', cardId: GUID, pinTo: '' });
  assert.deepEqual(viewArgs('{"view":"viewer","cardId":""}', 'view-card'), { view: 'viewer', cardId: '', pinTo: '' });
});

test('an Obsidian Note card opened from the Cards panel shows itself', () => {
  assert.deepEqual(viewArgs(null, GUID), { view: 'viewer', cardId: GUID, pinTo: '' });
  assert.deepEqual(viewArgs('not json', GUID), { view: 'viewer', cardId: GUID, pinTo: '' });
});

test('ids that are not ids are dropped', () => {
  assert.deepEqual(viewArgs('{"view":"viewer","cardId":"x\\" onload"}', 'v'), { view: 'viewer', cardId: '', pinTo: '' });
  assert.equal(viewArgs('{"view":"search","pinTo":"%pinTo%"}', 'v').pinTo, '');
  assert.equal(viewArgs('{"view":"bogus"}', GUID).view, 'viewer');
});
