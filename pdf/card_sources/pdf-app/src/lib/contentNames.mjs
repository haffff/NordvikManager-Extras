// Which XObjects (images, forms) a page's content stream draws. A copied page keeps only
// those: some PDFs give every page one shared resource dictionary, and copying it whole
// would hand players every image of the book along with the shown page.

/** Names used with the Do operator, with strings, comments and #xx escapes handled. */
export function xObjectsDrawn(content) {
  const names = new Set();
  let i = 0;
  let lastName = null;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (c === '%') { while (i < n && content[i] !== '\n' && content[i] !== '\r') i++; lastName = null; continue; }
    if (c === '(') { // literal string, balanced parentheses and backslash escapes
      let depth = 1; i++;
      while (i < n && depth) {
        if (content[i] === '\\') i += 2;
        else { if (content[i] === '(') depth++; else if (content[i] === ')') depth--; i++; }
      }
      lastName = null; continue;
    }
    if (c === '<' && content[i + 1] !== '<') { while (i < n && content[i] !== '>') i++; i++; lastName = null; continue; }
    if (c === '/') {
      let j = i + 1;
      while (j < n && !/[\s/()<>[\]{}%]/.test(content[j])) j++;
      lastName = content.slice(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      i = j; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    let j = i;
    while (j < n && !/[\s/()<>[\]{}%]/.test(content[j])) j++;
    if (j === i) { i++; lastName = null; continue; }
    const word = content.slice(i, j);
    if (word === 'Do' && lastName) names.add(lastName);
    lastName = null;
    i = j;
  }
  return names;
}
