import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toIncludeScript } from '../../scripts/includeScript.mjs';
import {
  baseUrl, folderPath, isNoteId, searchUrl, noteUrl, readResponse, searchResults, prepareNote,
  noteHtml, resourceKey, indexedCard, withIndexed, answer, outcome, rawBody,
} from './trilium.mjs';

// ── addresses ────────────────────────────────────────────────────────────────

test('baseUrl keeps http(s) addresses and drops trailing slashes', () => {
  assert.equal(baseUrl(' http://localhost:8080/ '), 'http://localhost:8080');
  assert.equal(baseUrl('https://notes.example.com/trilium//'), 'https://notes.example.com/trilium');
});

test('baseUrl refuses anything that is not a plain http(s) address', () => {
  for (const bad of ['', 'localhost:8080', 'ftp://x', 'javascript:alert(1)', 'http://user:pw@x', 'http://x/?a=1', 'http://x/#y', null]) {
    assert.equal(baseUrl(bad), null, String(bad));
  }
});

test('note ids are letters, digits and underscores only', () => {
  assert.ok(isNoteId('abcDEF123_x'));
  for (const bad of ['', '../etc', 'a/b', 'a b', 'x'.repeat(65), null]) assert.equal(isNoteId(bad), false, String(bad));
});

test('the search query is encoded into the URL, with a limit', () => {
  // Without a limit Trilium sends every match (and fuzzy ones), which can be megabytes: more
  // than RunScript can read. With one it keeps that many in storage order, so it is generous
  // and searchResults ranks them.
  assert.equal(searchUrl('http://t', 'dragon & "lair"'),
    'http://t/etapi/notes?search=dragon%20%26%20%22lair%22&limit=200');
});

test('folderPath tidies the Cards panel folder, empty for the top level', () => {
  assert.equal(folderPath('  Lore /  Trilium // '), 'Lore/Trilium');
  assert.equal(folderPath('Notes'), 'Notes');
  assert.equal(folderPath('  '), '');
  assert.equal(folderPath(' / '), '');
  assert.equal(folderPath(undefined), '');
});

test('folderPath refuses what the server would: over 10 levels or a name over 100 characters', () => {
  assert.equal(folderPath(Array.from({ length: 10 }, (_, i) => 'f' + i).join('/')).split('/').length, 10);
  assert.equal(folderPath(Array.from({ length: 11 }, (_, i) => 'f' + i).join('/')), null);
  assert.equal(folderPath('x'.repeat(100)), 'x'.repeat(100));
  assert.equal(folderPath('x'.repeat(101)), null);
});

test('note URLs, and none for a bad id', () => {
  assert.equal(noteUrl('http://t', 'abc'), 'http://t/etapi/notes/abc');
  assert.equal(noteUrl('http://t', 'abc', 'content'), 'http://t/etapi/notes/abc/content');
  assert.equal(noteUrl('http://t', '../x'), null);
});

// ── responses ────────────────────────────────────────────────────────────────

test('readResponse parses a JSON body', () => {
  const r = readResponse({ Success: true, StatusCode: 200, ResponseBody: '{"a":1}' }, 'the note');
  assert.deepEqual([r.ok, r.status, r.body], [true, 200, { a: 1 }]);
});

test('readResponse keeps a text body as text', () => {
  assert.equal(readResponse({ Success: true, StatusCode: 200, ResponseBody: '<p>x</p>' }).body, '<p>x</p>');
});

test('readResponse says what went wrong', () => {
  const err = (resp) => readResponse(resp, 'the note').error;
  assert.match(err({ Success: false, StatusCode: 0, ResponseBody: 'Connection refused' }), /reach Trilium.*Connection refused/);
  // The server refused the address itself (private host not allowed): 400 with no body.
  assert.match(err({ Success: false, StatusCode: 400, ResponseBody: null }), /Local network access/);
  assert.match(err({ Success: false, StatusCode: 401, ResponseBody: '{}' }), /token/);
  assert.match(err({ Success: false, StatusCode: 404, ResponseBody: '{}' }), /the note/);
  assert.match(err({ Success: false, StatusCode: 500, ResponseBody: '{"message":"boom"}' }), /500.*boom/);
});

test('readResponse works with camelCase fields too', () => {
  assert.equal(readResponse({ success: true, statusCode: 200, responseBody: '[]' }).ok, true);
});

test('rawBody is the text as Trilium sent it, never parsed', () => {
  assert.equal(rawBody({ ResponseBody: '123' }), '123');
  assert.equal(rawBody({ responseBody: '<p>x</p>' }), '<p>x</p>');
  assert.equal(rawBody(null), '');
});

test('searchResults keeps what the list shows', () => {
  const body = { results: [
    { noteId: 'n1', title: 'Old Mill', type: 'text', utcDateModified: '2026-01-02 10:00:00.000Z', extra: 'x' },
    { noteId: 'n2', title: 'Map', type: 'image' },
    { noteId: '../bad', title: 'skipped' },
  ] };
  assert.deepEqual(searchResults(body), [
    { noteId: 'n1', title: 'Old Mill', type: 'text', modified: '2026-01-02 10:00:00.000Z' },
    { noteId: 'n2', title: 'Map', type: 'image', modified: '' },
  ]);
  assert.deepEqual(searchResults(null), []);
});

test('searchResults keeps the first 30', () => {
  const body = { results: Array.from({ length: 40 }, (_, i) => ({ noteId: 'n' + i, title: 'T' + i })) };
  assert.deepEqual(searchResults(body).map((n) => n.noteId), body.results.slice(0, 30).map((n) => n.noteId));
});

test('searchResults puts title matches first: exact, then starting with, then containing', () => {
  const titles = ['Notes about Simon', 'Session 3', 'Simon Adler', 'simon adler', 'Simonetta', 'Postać Princessa'];
  const body = { results: titles.map((title, i) => ({ noteId: 'n' + i, title })) };
  const order = (query) => searchResults(body, query).map((n) => n.title);
  // The rest keep Trilium's order.
  assert.deepEqual(order('Simon Adler'),
    ['Simon Adler', 'simon adler', 'Notes about Simon', 'Session 3', 'Simonetta', 'Postać Princessa']);
  assert.deepEqual(order('  simon '),
    ['Simon Adler', 'simon adler', 'Simonetta', 'Notes about Simon', 'Session 3', 'Postać Princessa']);
  assert.deepEqual(order('#label'), titles);
});

// ── note content ─────────────────────────────────────────────────────────────

test('images become game resources, downloaded from ETAPI', () => {
  const { html, downloads } = prepareNote(
    '<p><img src="api/attachments/att1/image/mill.png" width="300"><img src=\'../api/images/img2/old.jpg\'></p>',
    'http://t');
  assert.equal(html, '<p><img data-nm-resource="trilium_img_att1" width="300"><img data-nm-resource="trilium_img_img2"></p>');
  assert.deepEqual(downloads, [
    { url: 'http://t/etapi/attachments/att1/content', key: 'trilium_img_att1', name: 'mill.png' },
    { url: 'http://t/etapi/notes/img2/content', key: 'trilium_img_img2', name: 'old.jpg' },
  ]);
});

test('the same image twice is downloaded once', () => {
  const { downloads } = prepareNote('<img src="api/attachments/a/image/x.png"><img src="api/attachments/a/image/x.png">', 'http://t');
  assert.equal(downloads.length, 1);
});

test('other images lose their address (the card could not load them anyway)', () => {
  assert.equal(prepareNote('<img src="https://evil.example/x.png" alt="x">', 'http://t').html, '<img alt="x">');
});

test('links to other notes keep only the note id', () => {
  const { html, links } = prepareNote('<a class="reference-link" href="#root/abc/def123?viewMode=x">Mill</a> <a href="https://x.org">out</a>', 'http://t');
  assert.equal(html, '<a class="reference-link" data-nm-note="def123">Mill</a> <a href="https://x.org">out</a>');
  assert.deepEqual(links, ['def123']);
});

test('noteHtml: text notes are their content, images an image, code is escaped', () => {
  assert.equal(noteHtml({ type: 'text' }, '<p>x</p>', 'n'), '<p>x</p>');
  assert.equal(noteHtml({ type: 'image' }, 'BINARY', 'n1'), '<p><img src="api/images/n1/image"></p>');
  assert.equal(noteHtml({ type: 'code' }, 'a < b && c', 'n'), '<pre>a &lt; b &amp;&amp; c</pre>');
  assert.match(noteHtml({ type: 'canvas' }, '{}', 'n'), /can't be shown.*canvas/);
});

test('resource keys for images', () => {
  assert.equal(resourceKey('abc'), 'trilium_img_abc');
});

// ── the note → card index ────────────────────────────────────────────────────

test('the index finds a note\'s card and survives bad JSON', () => {
  const index = withIndexed('{}', 'n1', 'card-1');
  assert.equal(indexedCard(index, 'n1'), 'card-1');
  assert.equal(indexedCard(index, 'n2'), '');
  assert.equal(indexedCard('not json', 'n1'), '');
  assert.equal(indexedCard(withIndexed('not json', 'n2', 'c2'), 'n2'), 'c2');
});

// ── answering a view ─────────────────────────────────────────────────────────

test('answer goes to the view that asked, or nowhere', () => {
  assert.deepEqual(answer({ replyTo: 'addon_v1_trilium' }, { kind: 'saved', ok: true }),
    { reply: { kind: 'saved', ok: true }, replyTo: 'addon_v1_trilium', hasReply: 'yes' });
  assert.equal(answer({}, { kind: 'x' }).hasReply, 'no');
  // Each window registers its own name ("addon_w<random>_trilium"), scoped by the app with the card id.
  assert.equal(answer({ replyTo: 'addon_1b4e28ba-2fa1-11d2-883f-0016d3cca427_wk3j9x2_trilium' }, {}).hasReply, 'yes');
  // Only one of the view's own panels: an action can't be pointed at the app's panels.
  assert.equal(answer({ replyTo: 'BattleMap_token' }, { kind: 'x' }).hasReply, 'no');
});

test('outcome: what an action step needs to answer, or to stop on a failure', () => {
  const failed = outcome({ replyTo: 'addon_v1_trilium' }, { kind: 'search', ok: false, error: 'no' });
  assert.deepEqual([failed.failed, failed.notice, failed.hasReply], ['yes', 'no', 'yes']);
  const done = outcome({}, { kind: 'shared', ok: true, message: 'Shared.' }, { target: 'c1' });
  assert.deepEqual([done.failed, done.notice, done.hasReply, done.target], ['no', 'Shared.', 'no', 'c1']);
});

// ── as RunScript sees it ─────────────────────────────────────────────────────

test('the include runs as a plain script, as RunScript loads it', () => {
  const source = readFileSync(new URL('./trilium.mjs', import.meta.url), 'utf8');
  const script = toIncludeScript(source, 'trilium.mjs');
  const run = new Function('vars', `${script}\nreturn prepareNote('<img src="api/attachments/a/image/x.png">', baseUrl(vars.url));`);
  assert.equal(run({ url: 'http://t/' }).downloads[0].url, 'http://t/etapi/attachments/a/content');
});
