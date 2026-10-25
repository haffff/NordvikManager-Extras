// The reply panel a window registers ("addon_w<random>_obsidian"; the app makes it
// "addon_<cardId>_w<random>_obsidian"). Two windows of one view are the same card, so the
// random part keeps their answers apart.
let counter = 0;

export function windowPanelName(random = Math.random) {
  counter += 1;
  const part = (Math.floor(random() * 2 ** 32).toString(36) + counter.toString(36) + Date.now().toString(36)).toLowerCase();
  return `addon_w${part.replace(/[^a-z0-9]/g, '').slice(0, 16)}_obsidian`;
}
