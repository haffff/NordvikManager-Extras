// Renders a prepared note (prepareNote in the include) to HTML, with markdown-it passed in.
// - nm-note:<name> links get data-nm-note and href="#": the viewer opens them itself;
// - nm-resource:<key> images get data-nm-resource and no src: the viewer fills them in from
//   game resources; any other image is shown as its text (the card couldn't load it).
// Single line breaks stay line breaks, as Obsidian shows them. The viewer sanitizes the
// result before showing it.
const NOTE = 'nm-note:';
const RESOURCE = 'nm-resource:';

function decode(text) {
  try { return decodeURIComponent(text); } catch { return text; }
}

export function createRenderer(MarkdownIt) {
  const md = new MarkdownIt({ html: true, linkify: false, breaks: true });
  const { escapeHtml } = md.utils;

  const validateLink = md.validateLink.bind(md);
  md.validateLink = (url) => url.startsWith(NOTE) || url.startsWith(RESOURCE) || validateLink(url);

  const linkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href') ?? '';
    if (href.startsWith(NOTE)) token.attrs = [['data-nm-note', decode(href.slice(NOTE.length))], ['href', '#']];
    return linkOpen(tokens, idx, options, env, self);
  };

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    const alt = self.renderInlineAsText(token.children ?? [], options, env);
    if (!src.startsWith(RESOURCE)) return escapeHtml(alt);
    return `<img data-nm-resource="${escapeHtml(decode(src.slice(RESOURCE.length)))}" alt="${escapeHtml(alt)}">`;
  };

  return (markdown) => md.render(typeof markdown === 'string' ? markdown : '');
}
