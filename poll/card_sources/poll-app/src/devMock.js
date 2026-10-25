// `pnpm dev` only: a game with one open poll and pretend actions that answer the way the
// addon's real actions do (RunClientCommand Reply to the window's panel).
import { createApiMock } from '../ApiMock.js';

const GAME = '00000000-0000-4000-8000-000000000001';
const POLL_CARD = '00000000-0000-4000-8000-000000000002';
const VIEW_CARD = '00000000-0000-4000-8000-000000000003';
const PLAYER = 'mock-player';

const poll = {
  question: 'Where do we go next?', options: ['The old mill', 'The cave', 'Back to town'],
  multi: false, secret: false, hideResults: false, allowChange: true,
  createdBy: PLAYER, createdByName: 'Game Master',
};
const state = { status: 'open', voted: ['Ana', 'Bo'], results: { counts: [1, 1, 0], total: 2, names: [['Ana'], ['Bo'], []] } };

const RECORD = `poll_${POLL_CARD}`;
const setState = (api, next) => api.Properties.Global.Set(GAME, RECORD, JSON.stringify({ poll, state: next }));
const reply = (api, args, data) => api.ClientMediator.sendCommandAsync(args.replyTo, 'Reply', data);

export function devApi(view) {
  const api = createApiMock({
    cardId: view ? VIEW_CARD : POLL_CARD,
    gameId: GAME,
    additionalArguments: view ? JSON.stringify({ view }) : null,
    players: [{ id: PLAYER, name: 'Game Master', color: '#c0392b' }],
    globals: {
      [POLL_CARD]: { pollId: POLL_CARD },
      [GAME]: { poll_who_starts: 'gm', poll_folder: 'Polls', [RECORD]: JSON.stringify({ poll, state }) },
    },
    actions: {
      'poll/my_vote': (args, a) => reply(a, args, { kind: 'mine', ok: true, choices: [] }),
      'poll/vote': (args, a) => {
        const choices = String(args.choices).split(',').map((n) => Number(n) - 1);
        const counts = [1, 1, 0];
        for (const i of choices) counts[i] += 1;
        setState(a, {
          status: 'open', voted: ['Ana', 'Bo', 'Game Master'],
          results: { counts, total: 3, names: [['Ana'], ['Bo'], []].map((n, i) => (choices.includes(i) ? [...n, 'Game Master'] : n)) },
        });
        return reply(a, args, { kind: 'voted', ok: true, choices, message: 'Vote counted.' });
      },
      'poll/close': (args, a) => {
        setState(a, { ...state, status: 'closed' });
        return reply(a, args, { kind: 'closed', ok: true, message: 'Poll closed.' });
      },
      'poll/delete': (args, a) => reply(a, args, { kind: 'deleted', ok: true, message: 'Poll deleted.' }),
      'poll/start': (args, a) => reply(a, args, { kind: 'started', ok: true, pollId: POLL_CARD, message: 'Poll started.' }),
      'poll/save_settings': (args, a) => reply(a, args, { kind: 'saved', ok: true, message: 'Saved.' }),
    },
  });
  return api;
}
