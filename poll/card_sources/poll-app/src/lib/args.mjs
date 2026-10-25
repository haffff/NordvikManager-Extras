// What the page should show. A view opened by ShowView gets its Data (a JSON string) as
// additionalArguments: { view: "vote", pollId } | { view: "new" } | { view: "settings" }.
// A Poll card opened from the Cards panel has none and shows itself.
const VIEWS = ['vote', 'new', 'settings'];
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const id = (value) => (typeof value === 'string' && GUID.test(value) ? value : '');

export function viewArgs(additionalArguments, ownCardId) {
  let args = additionalArguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = null; }
  }
  if (!args || typeof args !== 'object' || !VIEWS.includes(args.view)) {
    return { view: 'vote', pollId: id(ownCardId) };
  }
  return { view: args.view, pollId: args.view === 'vote' ? id(args.pollId) : '' };
}
