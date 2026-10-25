import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toIncludeScript } from '../../scripts/includeScript.mjs';
import {
  baseUrl, folderPath, hashId, isVaultPath, isNotePath, encodePath, vaultUrl, searchUrl, titleOf, dirOf,
  resolveRelative, readResponse, searchResults, resolveLink, prepareNote, imageKey,
  indexedCard, cardsNamed, withIndexed, answer, outcome, rawBody, statusInfo,
} from './obsidian.mjs';

// ── addresses ────────────────────────────────────────────────────────────────

test('baseUrl keeps http(s) addresses and drops trailing slashes', () => {
  assert.equal(baseUrl(' http://127.0.0.1:27123/ '), 'http://127.0.0.1:27123');
  assert.equal(baseUrl('https://vault.example.com/api//'), 'https://vault.example.com/api');
});

test('baseUrl refuses anything that is not a plain http(s) address', () => {
  for (const bad of ['', '127.0.0.1:27123', 'ftp://x', 'javascript:alert(1)', 'http://user:pw@x', 'http://x/?a=1', 'http://x/#y', null]) {
    assert.equal(baseUrl(bad), null, String(bad));
  }
});

test('folderPath tidies a folder path, empty for the top level, null when too deep or long', () => {
  assert.equal(folderPath('  Lore /  Obsidian // '), 'Lore/Obsidian');
  assert.equal(folderPath(' / '), '');
  assert.equal(folderPath(undefined), '');
  assert.equal(folderPath(Array.from({ length: 11 }, (_, i) => 'f' + i).join('/')), null);
  assert.equal(folderPath('x'.repeat(101)), null);
});

// ── vault paths ──────────────────────────────────────────────────────────────

test('vault paths: relative, no . or .. parts, no backslashes, not the config folder', () => {
  for (const ok of ['Simon Adler.md', 'Campaign/NPCs/Simon Adler.md', 'Mapy/Wieś Zła.png', 'a/b c/d#1.md']) assert.ok(isVaultPath(ok), ok);
  for (const bad of ['', '/etc/passwd', '../x.md', 'a/../../x.md', 'a/./b.md', 'a//b.md', 'a\\b.md', '.obsidian/app.json',
    'a/\u0000.md', 'x'.repeat(513), null, 5]) {
    assert.equal(isVaultPath(bad), false, String(bad));
  }
});

test('note paths are vault paths of markdown files', () => {
  assert.ok(isNotePath('NPCs/Simon Adler.md'));
  assert.ok(isNotePath('Simon.MD'));
  assert.equal(isNotePath('map.png'), false);
  assert.equal(isNotePath('../x.md'), false);
});

test('paths are encoded part by part, so a name cannot reach another route', () => {
  assert.equal(encodePath('Campaign/NPCs/Simon Adler.md'), 'Campaign/NPCs/Simon%20Adler.md');
  assert.equal(encodePath('a/b?c#d.md'), 'a/b%3Fc%23d.md');
  assert.equal(vaultUrl('http://o', 'Wieś/Zła.md'), 'http://o/vault/Wie%C5%9B/Z%C5%82a.md');
  assert.equal(vaultUrl('http://o', '../x.md'), null);
});

test('the search URL asks Obsidian for its best 30', () => {
  assert.equal(searchUrl('http://o', ' simon & co '), 'http://o/search/simple/?query=simon%20%26%20co&maxResults=30&contextLength=80');
});

test('a note title is its file name without .md; its folder is the rest', () => {
  assert.equal(titleOf('Campaign/NPCs/Simon Adler.md'), 'Simon Adler');
  assert.equal(titleOf('Top.md'), 'Top');
  assert.equal(dirOf('Campaign/NPCs/Simon Adler.md'), 'Campaign/NPCs');
  assert.equal(dirOf('Top.md'), '');
});

test('resolveRelative follows ./ and ../ inside the vault, never out of it', () => {
  assert.equal(resolveRelative('Campaign/NPCs', 'img/face.png'), 'Campaign/NPCs/img/face.png');
  assert.equal(resolveRelative('Campaign/NPCs', './face%20one.png'), 'Campaign/NPCs/face one.png');
  assert.equal(resolveRelative('Campaign/NPCs', '../Maps/map.png'), 'Campaign/Maps/map.png');
  assert.equal(resolveRelative('', 'map.png'), 'map.png');
  assert.equal(resolveRelative('Campaign', '../../x.png'), null);
});

test('hashId is 16 hex characters, the same for the same text', () => {
  assert.match(hashId('Campaign/NPCs/Simon Adler.md'), /^[0-9a-f]{16}$/);
  assert.equal(hashId('a'), hashId('a'));
  assert.notEqual(hashId('a'), hashId('b'));
  assert.match(imageKey('x'), /^obsidian_img_[0-9a-f]{16}$/);
});

// ── responses ────────────────────────────────────────────────────────────────

test('readResponse says what went wrong', () => {
  const err = (resp) => readResponse(resp, 'that note').error;
  assert.match(err({ Success: false, StatusCode: 0, ResponseBody: 'Connection refused' }), /reach Obsidian.*Connection refused.*open/);
  assert.match(err({ Success: false, StatusCode: 400, ResponseBody: null }), /Local network access/);
  assert.match(err({ Success: false, StatusCode: 401, ResponseBody: '{}' }), /API key/);
  assert.match(err({ Success: false, StatusCode: 404, ResponseBody: '{}' }), /find that note.*renamed/);
  assert.match(err({ Success: false, StatusCode: 500, ResponseBody: '{"message":"boom"}' }), /500.*boom/);
  assert.equal(readResponse({ success: true, statusCode: 200, responseBody: '[]' }).ok, true);
});

test('rawBody is the text as Obsidian sent it, never parsed', () => {
  assert.equal(rawBody({ ResponseBody: '123' }), '123');
  assert.equal(rawBody({ responseBody: '# x' }), '# x');
  assert.equal(rawBody(null), '');
});

test('statusInfo reads whether the key works and the versions', () => {
  assert.deepEqual(statusInfo({ status: 'OK', authenticated: true, versions: { obsidian: '1.9.10', self: '3.2.0' } }),
    { authenticated: true, obsidian: '1.9.10', plugin: '3.2.0' });
  assert.deepEqual(statusInfo(null), { authenticated: false, obsidian: '?', plugin: '?' });
});

const RESULTS = [
  { filename: 'Sessions/Session 3.md', score: -1, matches: [{ match: { start: 10, end: 15 }, context: '…met simon at the mill…' }] },
  { filename: 'NPCs/Simon Adler.md', score: -2, matches: [{ match: { start: 0, end: 5, source: 'filename' }, context: 'Simon Adler' },
    { match: { start: 3, end: 8 }, context: 'One of the Adeptus Arbitis' }] },
  { filename: 'map.png', score: 0, matches: [] },
  { filename: '../x.md', score: 0, matches: [] },
];

test('searchResults: notes only, the title first if it is the query, a text snippet', () => {
  assert.deepEqual(searchResults(RESULTS, 'simon adler'), [
    { path: 'NPCs/Simon Adler.md', title: 'Simon Adler', folder: 'NPCs', snippet: 'One of the Adeptus Arbitis' },
    { path: 'Sessions/Session 3.md', title: 'Session 3', folder: 'Sessions', snippet: '…met simon at the mill…' },
  ]);
  assert.deepEqual(searchResults(RESULTS, 'mill').map((r) => r.title), ['Session 3', 'Simon Adler']);
  assert.deepEqual(searchResults({ not: 'a list' }, 'x'), []);
});

test('searchResults keeps the first 30', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ filename: `n${i}.md`, score: 0, matches: [] }));
  assert.equal(searchResults(many, 'q').length, 30);
});

test('resolveLink finds the note a [[link]] means: its name, then its folder, then the shortest path', () => {
  const found = [
    { filename: 'Archive/Old/Simon Adler.md' }, { filename: 'NPCs/Simon Adler.md' }, { filename: 'Simon Adler extra.md' },
    { filename: 'Simon Adler.md' },
  ];
  assert.equal(resolveLink(found, 'simon adler', 'NPCs/Party.md'), 'NPCs/Simon Adler.md');
  assert.equal(resolveLink(found, 'Simon Adler', 'Sessions/One.md'), 'Simon Adler.md');
  assert.equal(resolveLink(found, 'Old/Simon Adler', 'x.md'), 'Archive/Old/Simon Adler.md');
  assert.equal(resolveLink(found, 'Simon Adler.md', 'x.md'), 'Simon Adler.md');
  assert.equal(resolveLink(found, 'Nobody', 'x.md'), '');
  assert.equal(resolveLink(null, 'x', 'y.md'), '');
});

// ── preparing a note ─────────────────────────────────────────────────────────

test('prepareNote leaves out the frontmatter and %% comments %%, which often hold GM secrets', () => {
  const md = '---\ntags: [npc]\nsecret: the king\n---\n# Simon\nVisible %%the GM only%% text.\n%%\nWhole\nblock\n%%\nEnd';
  const { markdown } = prepareNote(md, 'NPCs/Simon.md', '', 'http://o');
  assert.doesNotMatch(markdown, /secret|the king|GM only|Whole|block/);
  assert.match(markdown, /^# Simon\nVisible  text\./);
  assert.match(markdown, /End$/);
});

test('prepareNote turns [[links]] into note links, keeping the alias', () => {
  const { markdown, links } = prepareNote('See [[Princessa Severa]] and [[NPCs/Simon Adler#Past|Simon]].', 'a.md', '', 'http://o');
  assert.equal(markdown, 'See [Princessa Severa](nm-note:Princessa%20Severa) and [Simon](nm-note:NPCs%2FSimon%20Adler).');
  assert.deepEqual(links, ['Princessa Severa', 'NPCs/Simon Adler']);
});

test('prepareNote turns markdown links to notes into note links, and leaves web links alone', () => {
  const { markdown } = prepareNote('[Mill](../Places/Old%20Mill.md) and [site](https://example.com)', 'NPCs/a.md', '', 'http://o');
  assert.equal(markdown, '[Mill](nm-note:Places%2FOld%20Mill) and [site](https://example.com)');
});

test('prepareNote downloads embedded images, trying the note folder, the attachments folder, then the vault', () => {
  const { markdown, downloads } = prepareNote('Face: ![[face.png|200]]', 'NPCs/Simon.md', 'Assets', 'http://o');
  assert.equal(downloads.length, 1);
  const [img] = downloads;
  assert.deepEqual(img.urls, ['http://o/vault/NPCs/face.png', 'http://o/vault/Assets/face.png', 'http://o/vault/face.png']);
  assert.equal(img.name, 'face.png');
  assert.equal(img.key, imageKey('npcs/face.png|assets/face.png|face.png'));
  assert.equal(markdown, `Face: ![face](nm-resource:${img.key})`);
});

test('prepareNote: an attachments folder starting with ./ is under the note folder; a path in the embed is tried first', () => {
  assert.deepEqual(prepareNote('![[pic.jpg]]', 'NPCs/Simon.md', './att', 'http://o').downloads[0].urls,
    ['http://o/vault/NPCs/pic.jpg', 'http://o/vault/NPCs/att/pic.jpg', 'http://o/vault/pic.jpg']);
  assert.deepEqual(prepareNote('![[Maps/world map.png]]', 'NPCs/Simon.md', '', 'http://o').downloads[0].urls,
    ['http://o/vault/Maps/world%20map.png', 'http://o/vault/NPCs/Maps/world%20map.png']);
});

test('prepareNote downloads relative markdown images; web and data images are dropped to their text', () => {
  const { markdown, downloads } = prepareNote('![map](../Maps/map%201.png) ![x](https://e.com/a.png) ![y](data:image/png;base64,AA)', 'NPCs/S.md', '', 'http://o');
  assert.deepEqual(downloads.map((d) => d.urls), [['http://o/vault/Maps/map%201.png']]);
  assert.equal(markdown, `![map](nm-resource:${downloads[0].key}) x y`);
});

test('prepareNote downloads each image once, and shows embedded notes as links', () => {
  const { markdown, downloads } = prepareNote('![[a.png]] ![[a.png]] ![[Other note]] ![[song.mp3]]', 'n.md', '', 'http://o');
  assert.equal(downloads.length, 1);
  assert.match(markdown, /\[Other note\]\(nm-note:Other%20note\)/);
  assert.match(markdown, /song\.mp3$/);
});

test('prepareNote leaves code alone', () => {
  const md = 'Use `[[not a link]]` or\n```\n![[not.png]] %%not a comment%%\n```\n[[Real]]';
  const { markdown, downloads } = prepareNote(md, 'n.md', '', 'http://o');
  assert.ok(markdown.includes('`[[not a link]]`'));
  assert.ok(markdown.includes('![[not.png]] %%not a comment%%'));
  assert.equal(downloads.length, 0);
  assert.ok(markdown.endsWith('[Real](nm-note:Real)'));
});

// ── the indexes (game property "obsidian_cards") ────────────────────────────

test('the index finds a note card by path and by name, keyed by hashes (players can read it)', () => {
  let index = withIndexed('', 'NPCs/Simon Adler.md', 'card-1');
  index = withIndexed(index, 'Archive/Simon Adler.md', 'card-2');
  index = withIndexed(index, 'NPCs/Simon Adler.md', 'card-1');
  assert.doesNotMatch(index, /Simon|NPCs|Archive/i);
  assert.equal(indexedCard(index, 'NPCs/Simon Adler.md'), 'card-1');
  assert.equal(indexedCard(index, 'npcs/simon adler.md'), 'card-1');
  assert.deepEqual(cardsNamed(index, 'simon adler'), ['card-1', 'card-2']);
  assert.deepEqual(cardsNamed(index, 'NPCs/Simon Adler'), ['card-1', 'card-2']);
  assert.equal(indexedCard('not json', 'x.md'), '');
  assert.deepEqual(cardsNamed(null, 'x'), []);
});

// ── answering a window ───────────────────────────────────────────────────────

test('answer only replies to an Obsidian window panel', () => {
  assert.deepEqual(answer({ replyTo: 'addon_c1_wabc_obsidian' }, { ok: true }), { reply: { ok: true }, replyTo: 'addon_c1_wabc_obsidian', hasReply: 'yes' });
  for (const bad of ['addon_c1_trilium', 'Game', 'addon_x_obsidian;', undefined]) assert.equal(answer({ replyTo: bad }, {}).hasReply, 'no', String(bad));
});

test('outcome marks failures and carries extra variables', () => {
  const r = outcome({}, { kind: 'x', ok: false, error: 'nope' }, { a: 1 });
  assert.equal(r.failed, 'yes');
  assert.equal(r.notice, 'nope');
  assert.equal(r.a, 1);
});

// ── as RunScript runs it ─────────────────────────────────────────────────────

test('the include runs as a plain script (no export, no modules)', () => {
  const source = readFileSync(new URL('./obsidian.mjs', import.meta.url), 'utf8');
  const script = toIncludeScript(source, 'obsidian.mjs');
  const run = new Function('vars', `${script}\nreturn prepareNote('![[a.png]]', 'n.md', '', baseUrl(vars.url));`);
  assert.deepEqual(run({ url: 'http://o/' }).downloads[0].urls, ['http://o/vault/a.png']);
});
