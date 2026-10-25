import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { createRenderer } from './markdown.mjs';
import { prepareNote } from '../../../../include_sources/obsidian.mjs';

const render = createRenderer(MarkdownIt);

test('markdown becomes HTML, single line breaks kept as in Obsidian', () => {
  assert.equal(render('# Simon\nOne\nTwo'), '<h1>Simon</h1>\n<p>One<br>\nTwo</p>\n');
});

test('note links carry the note they name, and go nowhere', () => {
  const html = render('[Simon](nm-note:NPCs%2FSimon%20Adler)');
  assert.match(html, /<a data-nm-note="NPCs\/Simon Adler" href="#">Simon<\/a>/);
});

test('images of game resources carry their key and have no address', () => {
  const html = render('![face](nm-resource:obsidian_img_0123456789abcdef)');
  assert.match(html, /<img data-nm-resource="obsidian_img_0123456789abcdef" alt="face">/);
  assert.doesNotMatch(html, /src=/);
});

test('any other image is shown as its text', () => {
  assert.equal(render('![a map](https://e.com/m.png)'), '<p>a map</p>\n');
});

test('a prepared note renders with its links and images', () => {
  const { markdown, downloads } = prepareNote('See [[Severa]] ![[face.png]]', 'NPCs/Simon.md', '', 'http://o');
  const html = render(markdown);
  assert.match(html, /data-nm-note="Severa"/);
  assert.match(html, new RegExp(`data-nm-resource="${downloads[0].key}"`));
});

test('a quote of a note key cannot break out of its attribute', () => {
  assert.match(render('[x](nm-note:a%22b)'), /data-nm-note="a&quot;b"/);
});
