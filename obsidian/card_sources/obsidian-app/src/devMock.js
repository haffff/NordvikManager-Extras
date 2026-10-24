// `pnpm dev` only: a game with one imported note and pretend actions that answer the way the
// addon's real actions do (RunClientCommand Reply to the window's panel).
import { createApiMock } from '../ApiMock.js';
import { withIndexed } from '../../../include_sources/obsidian.mjs';

const GAME = '00000000-0000-4000-8000-000000000001';
const NOTE_CARD = '00000000-0000-4000-8000-000000000002';
const VIEW_CARD = '00000000-0000-4000-8000-000000000003';
const PATH = 'Places/The Old Mill.md';

const markdown = '## The Old Mill\nA ruined mill by the river.\nSee also [the miller](nm-note:Miller%20Hans).\n\n'
  + '- Haunted at night\n- Hidden cellar\n\n> The wheel still turns.\n\n![mill](nm-resource:obsidian_img_none)';

const reply = (api, args, data) => api.ClientMediator.sendCommandAsync(args.replyTo, 'Reply', data);

export function devApi(view) {
  return createApiMock({
    cardId: view ? VIEW_CARD : NOTE_CARD,
    gameId: GAME,
    additionalArguments: view ? JSON.stringify({ view }) : null,
    globals: {
      [NOTE_CARD]: { obsidian_path: PATH, title: 'The Old Mill', markdown },
      [GAME]: { obsidian_url: 'http://127.0.0.1:27123', obsidian_key_set: 'true', obsidian_cards: withIndexed('', PATH, NOTE_CARD) },
    },
    actions: {
      'obsidian/save_settings': (args, api) => reply(api, args, { kind: 'saved', ok: true, message: 'Saved.' }),
      'obsidian/test': (args, api) => reply(api, args, { kind: 'test', ok: true, message: 'Connected to Obsidian 1.9.10 (Local REST API 3.2.0).' }),
      'obsidian/search': (args, api) => reply(api, args, { kind: 'search', ok: true, results: [
        { path: PATH, title: 'The Old Mill', folder: 'Places', snippet: 'A ruined mill by the river.' },
        { path: 'NPCs/Miller Hans.md', title: 'Miller Hans', folder: 'NPCs', snippet: 'Runs the old mill…' }] }),
      'obsidian/import': (args, api) => reply(api, args, { kind: 'imported', ok: true, cardId: NOTE_CARD, message: 'Imported "The Old Mill" from Obsidian.' }),
      'obsidian/open_link': (args, api) => reply(api, args, { kind: 'imported', ok: false, error: `There is no note "${args.target}" in the vault.` }),
      'obsidian/share': (args, api) => reply(api, args, { kind: 'shared', ok: true, message: 'Shared "The Old Mill" with the players.' }),
      'obsidian/unshare': (args, api) => reply(api, args, { kind: 'shared', ok: true, message: 'Taken back from the players.' }),
      'obsidian/pin': (args, api) => reply(api, args, { kind: 'pinned', ok: false, error: 'Right-click a token and choose Pin Obsidian note.' }),
    },
  });
}
