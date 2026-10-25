// `pnpm dev` only: a game with one imported note and pretend actions that answer the way the
// addon's real actions do (RunClientCommand Reply to the window's panel).
import { createApiMock } from '../ApiMock.js';

const GAME = '00000000-0000-4000-8000-000000000001';
const NOTE_CARD = '00000000-0000-4000-8000-000000000002';
const VIEW_CARD = '00000000-0000-4000-8000-000000000003';

const html = '<h2>The Old Mill</h2><p>A ruined mill by the river. See also <a class="reference-link" data-nm-note="n2">the miller</a>.</p>'
  + '<ul><li>Haunted at night</li><li>Hidden cellar</li></ul><img data-nm-resource="trilium_img_none">';

const reply = (api, args, data) => api.ClientMediator.sendCommandAsync(args.replyTo, 'Reply', data);

export function devApi(view) {
  return createApiMock({
    cardId: view ? VIEW_CARD : NOTE_CARD,
    gameId: GAME,
    additionalArguments: view ? JSON.stringify({ view }) : null,
    globals: {
      [NOTE_CARD]: { trilium_note_id: 'n1', title: 'The Old Mill', html, modified: '' },
      [GAME]: { trilium_url: 'http://localhost:8080', trilium_token_set: 'true', trilium_cards: JSON.stringify({ n1: NOTE_CARD }) },
    },
    actions: {
      'trilium/save_settings': (args, api) => reply(api, args, { kind: 'saved', ok: true, message: 'Saved.' }),
      'trilium/test': (args, api) => reply(api, args, { kind: 'test', ok: true, message: 'Connected to Trilium 0.99.' }),
      'trilium/search': (args, api) => reply(api, args, { kind: 'search', ok: true, results: [
        { noteId: 'n1', title: 'The Old Mill', type: 'text' }, { noteId: 'n3', title: 'Map of the valley', type: 'image' }] }),
      'trilium/import': (args, api) => reply(api, args, { kind: 'imported', ok: true, cardId: NOTE_CARD, message: 'Imported "The Old Mill" from Trilium.' }),
      'trilium/share': (args, api) => reply(api, args, { kind: 'shared', ok: true, message: 'Shared "The Old Mill" with the players.' }),
      'trilium/unshare': (args, api) => reply(api, args, { kind: 'shared', ok: true, message: 'Taken back from the players.' }),
      'trilium/pin': (args, api) => reply(api, args, { kind: 'pinned', ok: false, error: 'Right-click a token and choose Pin Trilium note.' }),
    },
  });
}
