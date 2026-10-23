// An include source is an ES module, so tests and cards can import it. RunScript's
// Include puts the file's text before the script as a plain script, where `export` is a
// syntax error: drop the keyword from top-level declarations. Imports and other export
// forms can't work there, so they are refused.
export function toIncludeScript(source, name = 'include') {
  const lines = source.split(/\r?\n/);
  return lines.map((line, i) => {
    if (/^\s*import\s/.test(line)) throw new Error(`${name}:${i + 1}: an include can't import anything`);
    if (/^export\s+(async\s+function|function|const|let|class)\b/.test(line)) return line.replace(/^export\s+/, '');
    if (/^export\b/.test(line)) throw new Error(`${name}:${i + 1}: only "export function/const/let/class" works in an include`);
    return line;
  }).join('\n');
}
