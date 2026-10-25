import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toIncludeScript } from '../../scripts/includeScript.mjs';
import {
  folderPath, validatePoll, parseChatPoll, parseChoices, checkVote, tally, canStart, canClose, resultsText,
  answer, outcome, startPoll, castVote, myVote, closePoll, deletePoll, saveSettings, chatCommand, openNew, openCurrent,
} from './poll.mjs';

const GAME = '00000000-0000-4000-8000-000000000001';
const GM = '00000000-0000-4000-8000-0000000000a1';
const ANA = '00000000-0000-4000-8000-0000000000a2';
const BO = '00000000-0000-4000-8000-0000000000a3';
const PANEL = 'addon_00000000-0000-4000-8000-0000000000ff_wabc_poll';

// A game for the workflows: properties, players, cards and every step a script runs.
function fakeGame({ settings = {} } = {}) {
  const props = new Map();
  const key = (parent, name) => `${String(parent).toLowerCase()}|${name}`;
  for (const [name, value] of Object.entries(settings)) props.set(key(GAME, name), value);
  let next = 0;
  const cards = [
    { id: '00000000-0000-4000-8000-00000000c001', name: 'Poll', key: 'poll_poll', isTemplate: true, isHidden: true },
  ];
  const game = {
    props, cards, chats: [], steps: [], created: [],
    players: [
      { id: GM, name: 'Gamemaster', color: '#fff', isOwner: true },
      { id: ANA, name: 'Ana', color: '#f00', isOwner: false },
      { id: BO, name: 'Bo', color: '#0f0', isOwner: false },
    ],
    getProperty(parent, name, fallback) {
      const k = key(parent, name);
      return props.has(k) ? props.get(k) : (fallback == null ? '' : String(fallback));
    },
    setProperty(parent, name, value) { props.set(key(parent, name), String(value)); },
    find(what, options) {
      if (what === 'players') return game.players.slice();
      if (what === 'cards') return cards.filter((c) => (options && options.includeTemplates) || !c.isTemplate);
      throw new Error('fake find: ' + what);
    },
    createCard(options) {
      next += 1;
      const id = `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
      cards.push({ id, name: options.name, key: options.templateId, isTemplate: false, isHidden: false });
      game.created.push({ id, ...options });
      return id;
    },
    chat(text, options) { game.chats.push({ text, title: (options && options.title) || '', to: (options && options.to) || '' }); },
    step(type, data) {
      game.steps.push({ type, data });
      if (type === 'DeleteProperty') props.delete(key(data.ParentId, data.PropertyName));
      if (type === 'DeleteCard') cards.splice(cards.findIndex((c) => c.id === data.CardId), 1);
      return {};
    },
  };
  return game;
}

const asGm = (extra) => ({ gameId: GAME, playerId: GM, playerName: 'Gamemaster', playerIsGm: "true", replyTo: PANEL, ...extra });
const asAna = (extra) => ({ gameId: GAME, playerId: ANA, playerName: 'Ana', playerIsGm: "false", replyTo: PANEL, ...extra });
const asBo = (extra) => ({ gameId: GAME, playerId: BO, playerName: 'Bo', playerIsGm: "false", replyTo: PANEL, ...extra });
const pollOf = (game, id) => JSON.parse(game.getProperty(GAME, 'poll_' + id)).poll;
const stateOf = (game, id) => JSON.parse(game.getProperty(GAME, 'poll_' + id)).state;

function started(game, extra) {
  const out = startPoll(game, asGm({ question: 'Where next?', options: JSON.stringify(['Mill', 'Cave', 'Town']), ...extra }));
  assert.equal(out.failed, 'no', out.notice);
  return out.reply.pollId;
}

// ── the include itself ───────────────────────────────────────────────────────

test('the include works as a plain script for RunScript', () => {
  const source = readFileSync(new URL('./poll.mjs', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(toIncludeScript(source, 'poll.mjs')));
});

// ── checks ───────────────────────────────────────────────────────────────────

test('folderPath tidies the folder, empty for the top level, null when too deep or long', () => {
  assert.equal(folderPath(' Polls / Session 3 /'), 'Polls/Session 3');
  assert.equal(folderPath(''), '');
  assert.equal(folderPath(Array.from({ length: 11 }, (_, i) => 'f' + i).join('/')), null);
  assert.equal(folderPath('x'.repeat(101)), null);
});

test('validatePoll trims, takes options as a list, lines or JSON, and reads the switches', () => {
  const r = validatePoll({ question: '  Where next? ', options: ' Mill \n\nCave\n', multi: 'true', secret: true, hideResults: 'False' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.poll, { question: 'Where next?', options: ['Mill', 'Cave'], multi: true, secret: true, hideResults: false, allowChange: false });
  assert.deepEqual(validatePoll({ question: 'Q', options: '["A","B"]' }).poll.options, ['A', 'B']);
  assert.deepEqual(validatePoll({ question: 'Q', options: ['A', 'B'] }).poll.options, ['A', 'B']);
});

test('validatePoll refuses a missing or long question, too few or many options, long or repeated ones', () => {
  const bad = [
    { question: ' ', options: ['A', 'B'] },
    { question: 'x'.repeat(201), options: ['A', 'B'] },
    { question: 'Q', options: ['A'] },
    { question: 'Q', options: Array.from({ length: 11 }, (_, i) => 'o' + i) },
    { question: 'Q', options: ['A', 'x'.repeat(101)] },
    { question: 'Q', options: ['Yes', ' yes '] },
  ];
  for (const input of bad) assert.equal(validatePoll(input).ok, false, JSON.stringify(input));
});

test('parseChatPoll reads "Question | A | B" with switches anywhere', () => {
  assert.deepEqual(parseChatPoll('Where next? | Mill | Cave --secret --multi'),
    { question: 'Where next?', options: ['Mill', 'Cave'], secret: true, multi: true, hideResults: false, allowChange: false });
  assert.deepEqual(parseChatPoll('--hidden --change Rest? | yes | no').hideResults, true);
  assert.deepEqual(parseChatPoll('--hidden --change Rest? | yes | no').allowChange, true);
  assert.equal(parseChatPoll('Rest?').options.length, 0);
});

test('parseChoices takes numbers from 1, several with commas or spaces, or an option\'s text', () => {
  const poll = { options: ['Mill', 'Cave', 'Town'], multi: true };
  assert.deepEqual(parseChoices('2', poll), { ok: true, choices: [1] });
  assert.deepEqual(parseChoices('3, 1 3', poll), { ok: true, choices: [0, 2] });
  assert.deepEqual(parseChoices(' cave ', poll), { ok: true, choices: [1] });
  assert.deepEqual(parseChoices([1, 2], poll), { ok: true, choices: [0, 1] });
});

test('parseChoices refuses nothing, numbers out of range, unknown text and several picks in a one-pick poll', () => {
  const poll = { options: ['Mill', 'Cave'], multi: false };
  for (const bad of ['', '0', '3', 'Town', '1,2', '1.5']) assert.equal(parseChoices(bad, poll).ok, false, bad);
});

test('checkVote: only open polls, and a second vote only when changing is allowed', () => {
  assert.equal(checkVote({ allowChange: false }, { status: 'closed' }, '').ok, false);
  assert.equal(checkVote({ allowChange: false }, { status: 'open' }, '').ok, true);
  assert.equal(checkVote({ allowChange: false }, { status: 'open' }, '[0]').ok, false);
  assert.equal(checkVote({ allowChange: true }, { status: 'open' }, '[0]').ok, true);
});

test('tally counts picks and names voters per option, but no names for a secret poll', () => {
  const ballots = [{ name: 'Ana', choices: [0] }, { name: 'Bo', choices: [0, 2] }, { name: 'Cy', choices: [] }];
  assert.deepEqual(tally({ options: ['A', 'B', 'C'], secret: false }, ballots),
    { counts: [2, 0, 1], total: 2, names: [['Ana', 'Bo'], [], ['Bo']] });
  assert.deepEqual(tally({ options: ['A', 'B', 'C'], secret: true }, ballots), { counts: [2, 0, 1], total: 2 });
});

test('canStart follows the setting; canClose lets GMs and the poll\'s starter close it', () => {
  assert.equal(canStart('gm', false), false);
  assert.equal(canStart('gm', true), true);
  assert.equal(canStart('everyone', false), true);
  assert.equal(canClose({ createdBy: ANA }, ANA, false), true);
  assert.equal(canClose({ createdBy: ANA }, BO, false), false);
  assert.equal(canClose({ createdBy: ANA }, GM, true), true);
});

test('resultsText lists each option with its votes, and names unless secret', () => {
  const text = resultsText({ options: ['Mill', 'Cave'] }, { counts: [2, 1], total: 3, names: [['Ana', 'Bo'], ['Cy']] });
  assert.match(text, /1\. Mill: 2 \(Ana, Bo\)/);
  assert.match(text, /2\. Cave: 1 \(Cy\)/);
  assert.match(text, /3 voted/);
  assert.doesNotMatch(resultsText({ options: ['Mill'] }, { counts: [1], total: 1 }), /\(/);
});

test('answer only answers a poll window\'s own panel; outcome adds failed and notice', () => {
  assert.equal(answer({ replyTo: PANEL }, { kind: 'x' }).hasReply, 'yes');
  assert.equal(answer({ replyTo: 'BattleMap_token' }, { kind: 'x' }).hasReply, 'no');
  const out = outcome({}, { kind: 'x', ok: false, error: 'Nope' });
  assert.equal(out.failed, 'yes');
  assert.equal(out.notice, 'Nope');
  assert.equal(out.hasNotice, 'yes');
  assert.equal(outcome({}, { kind: 'x', ok: true }).hasNotice, 'no');
});

// ── starting ─────────────────────────────────────────────────────────────────

test('startPoll makes a private card in the Polls folder, puts what all may see on the game and shows it to all', () => {
  const game = fakeGame();
  const out = startPoll(game, asGm({ question: 'Where next?', options: JSON.stringify(['Mill', 'Cave']), secret: 'true' }));
  assert.equal(out.failed, 'no', out.notice);
  const pollId = out.reply.pollId;
  assert.equal(game.created.length, 1);
  const [poll] = game.created;
  assert.equal(poll.id, pollId);
  assert.equal(poll.templateId, '00000000-0000-4000-8000-00000000c001');
  assert.equal(poll.folder, 'Polls');
  assert.equal(poll.name, 'Where next?');
  assert.equal(game.getProperty(pollId, 'pollId'), pollId);

  const config = pollOf(game, pollId);
  assert.equal(config.question, 'Where next?');
  assert.equal(config.secret, true);
  assert.equal(config.createdBy, GM);
  assert.deepEqual(stateOf(game, pollId), { status: 'open', voted: [], results: { counts: [0, 0], total: 0 } });
  assert.equal(game.getProperty(GAME, 'poll_latest'), pollId);

  assert.ok(!game.steps.some((s) => s.type === 'SetPermission'), 'the card is never shared');
  const show = game.steps.find((s) => s.type === 'ShowView');
  assert.equal(show.data.ViewKey, 'poll_window');
  assert.equal(show.data.Player, '');
  assert.deepEqual(JSON.parse(show.data.Data), { view: 'vote', pollId });
  assert.match(game.chats[0].text, /Gamemaster started a poll: Where next\?/);
  assert.equal(game.chats[0].to, '');
});

test('startPoll uses the folder setting, and the top level when it is empty', () => {
  const game = fakeGame({ settings: { poll_folder: 'Table/Votes' } });
  started(game);
  assert.equal(game.created[0].folder, 'Table/Votes');
  const top = fakeGame({ settings: { poll_folder: '' } });
  started(top);
  assert.equal(top.created[0].folder, '');
});

test('startPoll with results hidden until close keeps no results in the state', () => {
  const game = fakeGame();
  const id = started(game, { hideResults: 'true' });
  assert.deepEqual(stateOf(game, id), { status: 'open', voted: [] });
});

test('startPoll: players only when the GM allows everyone to start polls', () => {
  const game = fakeGame();
  const refused = startPoll(game, asAna({ question: 'Q', options: '["A","B"]' }));
  assert.equal(refused.failed, 'yes');
  assert.match(refused.notice, /Only the GM/);
  assert.equal(game.created.length, 0);

  const open = fakeGame({ settings: { poll_who_starts: 'everyone' } });
  const ok = startPoll(open, asAna({ question: 'Q', options: '["A","B"]' }));
  assert.equal(ok.failed, 'no', ok.notice);
  assert.equal(pollOf(open, ok.reply.pollId).createdBy, ANA);
});

test('startPoll refuses a bad poll before making anything', () => {
  const game = fakeGame();
  const out = startPoll(game, asGm({ question: 'Q', options: '["A"]' }));
  assert.equal(out.failed, 'yes');
  assert.equal(game.created.length, 0);
});

test('startPoll says so when the addon\'s templates are missing', () => {
  const game = fakeGame();
  game.cards.length = 0;
  const out = startPoll(game, asGm({ question: 'Q', options: '["A","B"]' }));
  assert.equal(out.failed, 'yes');
  assert.match(out.notice, /reinstall/i);
});

// ── voting ───────────────────────────────────────────────────────────────────

test('castVote stores the ballot privately, and the poll shows who voted and the totals', () => {
  const game = fakeGame();
  const id = started(game);
  const out = castVote(game, asAna({ pollId: id, choices: '2' }));
  assert.equal(out.failed, 'no', out.notice);
  assert.deepEqual(out.reply.choices, [1]);
  assert.equal(game.getProperty(id, 'vote_' + ANA), '[1]');
  assert.doesNotMatch(game.getProperty(GAME, 'poll_' + id), new RegExp(ANA), 'no voter ids where players can read');
  assert.deepEqual(stateOf(game, id), { status: 'open', voted: ['Ana'], results: { counts: [0, 1, 0], total: 1, names: [[], ['Ana'], []] } });
});

test('castVote: a secret poll shows totals without names; a hidden one no totals until it closes', () => {
  const secret = fakeGame();
  const s = started(secret, { secret: 'true' });
  castVote(secret, asAna({ pollId: s, choices: '1' }));
  assert.deepEqual(stateOf(secret, s).results, { counts: [1, 0, 0], total: 1 });

  const hidden = fakeGame();
  const h = started(hidden, { hideResults: 'true' });
  castVote(hidden, asAna({ pollId: h, choices: '1' }));
  assert.deepEqual(stateOf(hidden, h), { status: 'open', voted: ['Ana'] });
});

test('castVote: a second vote is refused, unless changing is allowed, then it replaces the first', () => {
  const game = fakeGame();
  const id = started(game);
  castVote(game, asAna({ pollId: id, choices: '1' }));
  const again = castVote(game, asAna({ pollId: id, choices: '2' }));
  assert.equal(again.failed, 'yes');
  assert.match(again.notice, /already voted/);

  const open = fakeGame();
  const c = started(open, { allowChange: 'true' });
  castVote(open, asAna({ pollId: c, choices: '1' }));
  castVote(open, asAna({ pollId: c, choices: '2' }));
  assert.deepEqual(stateOf(open, c).results.counts, [0, 1, 0]);
  assert.deepEqual(stateOf(open, c).voted, ['Ana']);
});

test('castVote: several picks only in a multiple-choice poll', () => {
  const one = fakeGame();
  const a = started(one);
  assert.equal(castVote(one, asAna({ pollId: a, choices: '1,2' })).failed, 'yes');
  const multi = fakeGame();
  const b = started(multi, { multi: 'true' });
  castVote(multi, asAna({ pollId: b, choices: '1,3' }));
  castVote(multi, asBo({ pollId: b, choices: '3' }));
  assert.deepEqual(stateOf(multi, b).results.counts, [1, 0, 2]);
  assert.deepEqual(stateOf(multi, b).voted, ['Ana', 'Bo']);
});

test('castVote refuses a card that is not one of this addon\'s polls, and a closed poll', () => {
  const game = fakeGame();
  const id = started(game);
  // Some other card, even one with a pollId: no record on the game, so no votes go there.
  const other = '00000000-0000-4000-8000-00000000dead';
  game.setProperty(other, 'pollId', other);
  assert.equal(castVote(game, asAna({ pollId: other, choices: '1' })).failed, 'yes');
  assert.equal(game.getProperty(other, 'vote_' + ANA), '');
  assert.equal(castVote(game, asAna({ pollId: 'not-a-guid', choices: '1' })).failed, 'yes');

  // The poll's card deleted by hand in the Cards panel: the record alone is not enough.
  const gone = started(game);
  game.props.delete(`${gone}|pollId`);
  assert.equal(castVote(game, asAna({ pollId: gone, choices: '1' })).failed, 'yes');

  closePoll(game, asGm({ pollId: id }));
  const late = castVote(game, asAna({ pollId: id, choices: '1' }));
  assert.equal(late.failed, 'yes');
  assert.match(late.notice, /closed/);
});

test('myVote gives the voter their own picks only', () => {
  const game = fakeGame();
  const id = started(game, { secret: 'true' });
  castVote(game, asAna({ pollId: id, choices: '3' }));
  assert.deepEqual(myVote(game, asAna({ pollId: id })).reply.choices, [2]);
  assert.deepEqual(myVote(game, asBo({ pollId: id })).reply.choices, []);
});

// ── closing and deleting ─────────────────────────────────────────────────────

test('closePoll counts the ballots, shows the results, posts them to chat and clears the current poll', () => {
  const game = fakeGame();
  const id = started(game, { hideResults: 'true' });
  castVote(game, asAna({ pollId: id, choices: '1' }));
  castVote(game, asBo({ pollId: id, choices: '1' }));
  const out = closePoll(game, asGm({ pollId: id }));
  assert.equal(out.failed, 'no', out.notice);
  assert.deepEqual(stateOf(game, id), { status: 'closed', voted: ['Ana', 'Bo'], results: { counts: [2, 0, 0], total: 2, names: [['Ana', 'Bo'], [], []] } });
  const posted = game.chats[game.chats.length - 1];
  assert.equal(posted.to, '');
  assert.match(posted.title, /Where next\?/);
  assert.match(posted.text, /1\. Mill: 2 \(Ana, Bo\)/);
  assert.equal(game.getProperty(GAME, 'poll_latest'), '');
});

test('closePoll: the starter and GMs only, and only once', () => {
  const game = fakeGame({ settings: { poll_who_starts: 'everyone' } });
  const id = startPoll(game, asAna({ question: 'Q', options: '["A","B"]' })).reply.pollId;
  assert.equal(closePoll(game, asBo({ pollId: id })).failed, 'yes');
  assert.equal(closePoll(game, asAna({ pollId: id })).failed, 'no');
  assert.equal(closePoll(game, asGm({ pollId: id })).failed, 'yes');
});

test('deletePoll: GMs only; removes the card and the game\'s record of it', () => {
  const game = fakeGame();
  const id = started(game);
  assert.equal(deletePoll(game, asAna({ pollId: id })).failed, 'yes');
  const out = deletePoll(game, asGm({ pollId: id }));
  assert.equal(out.failed, 'no', out.notice);
  const deleted = game.steps.filter((s) => s.type === 'DeleteCard').map((s) => s.data.CardId);
  assert.deepEqual(deleted, [id]);
  assert.equal(game.getProperty(GAME, 'poll_' + id), '');
  assert.equal(game.getProperty(GAME, 'poll_latest'), '');
});

// ── settings and windows ─────────────────────────────────────────────────────

test('saveSettings: GMs only; who may start polls and the folder', () => {
  const game = fakeGame();
  assert.equal(saveSettings(game, asAna({ whoStarts: 'everyone', folder: 'X' })).failed, 'yes');
  assert.equal(saveSettings(game, asGm({ whoStarts: 'anyone', folder: 'X' })).failed, 'yes');
  assert.equal(saveSettings(game, asGm({ whoStarts: 'everyone', folder: 'x'.repeat(101) })).failed, 'yes');
  const out = saveSettings(game, asGm({ whoStarts: 'everyone', folder: ' Votes / Old ' }));
  assert.equal(out.failed, 'no', out.notice);
  assert.equal(game.getProperty(GAME, 'poll_who_starts'), 'everyone');
  assert.equal(game.getProperty(GAME, 'poll_folder'), 'Votes/Old');
});

test('openNew opens the new-poll window only for those who may start one', () => {
  const game = fakeGame();
  assert.equal(openNew(game, asAna()).failed, 'yes');
  assert.equal(game.steps.length, 0);
  assert.equal(openNew(game, asGm()).failed, 'no');
  const show = game.steps.find((s) => s.type === 'ShowView');
  assert.equal(show.data.Player, GM);
  assert.deepEqual(JSON.parse(show.data.Data), { view: 'new' });
});

test('openCurrent shows the open poll to whoever asks, or says there is none', () => {
  const game = fakeGame();
  assert.equal(openCurrent(game, asAna()).failed, 'yes');
  const id = started(game);
  game.steps.length = 0;
  assert.equal(openCurrent(game, asAna()).failed, 'no');
  const show = game.steps.find((s) => s.type === 'ShowView');
  assert.equal(show.data.Player, ANA);
  assert.deepEqual(JSON.parse(show.data.Data), { view: 'vote', pollId: id });
});

// ── chat ─────────────────────────────────────────────────────────────────────

test('chatCommand ignores other commands', () => {
  assert.equal(chatCommand(fakeGame(), asAna({ ChatCommand: 'cast', ChatArgs: 'fireball', replyTo: '' })).ignore, 'yes');
});

test('/vote votes in the current poll and whispers what was counted', () => {
  const game = fakeGame();
  const id = started(game);
  const out = chatCommand(game, asAna({ ChatCommand: 'vote', ChatArgs: 'cave', replyTo: '' }));
  assert.equal(out.ignore, 'no');
  assert.equal(out.failed, 'no', out.notice);
  assert.equal(out.hasReply, 'no');
  assert.match(out.notice, /Cave/);
  assert.deepEqual(stateOf(game, id).voted, ['Ana']);
  assert.equal(chatCommand(fakeGame(), asAna({ ChatCommand: 'vote', ChatArgs: '1', replyTo: '' })).failed, 'yes');
});

test('/poll starts a poll, /poll close closes the current one, /poll alone shows it', () => {
  const game = fakeGame();
  const out = chatCommand(game, asGm({ ChatCommand: 'poll', ChatArgs: 'Rest? | yes | no --secret', replyTo: '' }));
  assert.equal(out.failed, 'no', out.notice);
  const id = game.getProperty(GAME, 'poll_latest');
  assert.equal(pollOf(game, id).secret, true);

  game.steps.length = 0;
  assert.equal(chatCommand(game, asAna({ ChatCommand: 'poll', ChatArgs: '', replyTo: '' })).failed, 'no');
  assert.equal(game.steps.find((s) => s.type === 'ShowView').data.Player, ANA);

  assert.equal(chatCommand(game, asAna({ ChatCommand: 'poll', ChatArgs: 'close', replyTo: '' })).failed, 'yes');
  assert.equal(chatCommand(game, asGm({ ChatCommand: 'poll', ChatArgs: 'close', replyTo: '' })).failed, 'no');
  assert.equal(stateOf(game, id).status, 'closed');
});

test('/poll with a bad poll explains the format', () => {
  const out = chatCommand(fakeGame(), asGm({ ChatCommand: 'poll', ChatArgs: 'Rest?', replyTo: '' }));
  assert.equal(out.failed, 'yes');
  assert.match(out.notice, /\/poll Question\? \| /);
});
