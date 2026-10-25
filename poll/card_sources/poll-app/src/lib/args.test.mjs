import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewArgs } from './args.mjs';

const GUID = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

test('a view gets its ShowView Data, which arrives as a JSON string', () => {
  assert.deepEqual(viewArgs('{"view":"vote","pollId":"' + GUID + '"}', 'view-card'), { view: 'vote', pollId: GUID });
  assert.deepEqual(viewArgs({ view: 'new' }, 'view-card'), { view: 'new', pollId: '' });
  assert.deepEqual(viewArgs({ view: 'settings' }, 'view-card'), { view: 'settings', pollId: '' });
});

test('a Poll card opened from the Cards panel shows itself', () => {
  assert.deepEqual(viewArgs(null, GUID), { view: 'vote', pollId: GUID });
  assert.deepEqual(viewArgs('not json', GUID), { view: 'vote', pollId: GUID });
});

test('ids that are not ids are dropped, unknown views show the card itself', () => {
  assert.deepEqual(viewArgs('{"view":"vote","pollId":"x\\" onload"}', 'v'), { view: 'vote', pollId: '' });
  assert.deepEqual(viewArgs('{"view":"bogus"}', GUID), { view: 'vote', pollId: GUID });
});
