// What the page should show. A view opened by ShowView gets its Data (a JSON string) as
// additionalArguments: { view: "settings" | "search" | "viewer", cardId?, pinTo? }.
// An Obsidian Note card opened from the Cards panel has none and shows itself.
const VIEWS = ['settings', 'search', 'viewer'];
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const id = (value) => (typeof value === 'string' && GUID.test(value) ? value : '');

export function viewArgs(additionalArguments, ownCardId) {
  let args = additionalArguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = null; }
  }
  if (!args || typeof args !== 'object' || !VIEWS.includes(args.view)) {
    return { view: 'viewer', cardId: id(ownCardId), pinTo: '' };
  }
  return { view: args.view, cardId: args.view === 'viewer' ? id(args.cardId) : '', pinTo: args.view === 'search' ? id(args.pinTo) : '' };
}
