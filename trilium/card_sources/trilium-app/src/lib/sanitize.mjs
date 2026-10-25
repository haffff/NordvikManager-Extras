// Trilium content is untrusted: what it shows is cleaned again in the card, whatever the
// import did. No scripts, frames, forms or styles sheets; no src at all (images are filled
// in from game resources after this, as blob: URLs); data-nm-* attributes stay.
export const PURIFY_CONFIG = {
  FORBID_TAGS: ['style', 'script', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'],
  FORBID_ATTR: ['src', 'srcset', 'action', 'formaction', 'target', 'ping'],
  ALLOW_DATA_ATTR: true,
};

export function sanitize(purify, html) {
  return purify.sanitize(typeof html === 'string' ? html : '', PURIFY_CONFIG);
}
