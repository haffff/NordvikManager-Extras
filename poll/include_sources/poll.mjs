// Poll helpers shared by the addon's actions (RunScript "Include": "poll_poll.js") and its
// card. Plain JavaScript only: RunScript runs it in Jint on the GM's server (no DOM, no
// network). pnpm run pack drops the `export` keywords.
//
// A poll is a card (template poll_poll, in the Cards panel folder of the GM's choice) that is
// never shared: it holds the ballots, one `vote_<playerId>` per voter, and `pollId` (its own
// id, so a deleted card is noticed). What everyone may see is the game property
// `poll_<cardId>`: { poll: the question, options and switches (never changed), state: open or
// closed, who voted, the totals }. Players can read game properties but only actions (as the
// system) and GMs can write them, so that property is also the addon's own record that a card
// is one of its polls. (SetPermission couldn't share a card a player's poll made: it only
// lets the triggering player share what they can edit, and the starter mustn't edit results.)
//
// The workflows (startPoll, castVote, ...) take RunScript's `game` and `vars` and return what
// the action's later steps need: outcome() below. They run as the system, so they check who
// is asking themselves: `vars.playerId` and `vars.playerIsGm` (the game's owner or a player
// with Edit on the game) are built-ins a caller can't override.

export const REPLY_PANEL = /^addon_[A-Za-z0-9_-]+_poll$/;
export const DEFAULT_FOLDER = 'Polls';
export const MAX_QUESTION = 200;
export const MAX_OPTION = 100;
export const MAX_OPTIONS = 10;
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SWITCHES = { '--secret': 'secret', '--hidden': 'hideResults', '--multi': 'multi', '--change': 'allowChange' };
const CHAT_FORMAT = 'Write it as /poll Question? | first option | second option, and add --secret, --hidden, --multi or --change for those switches.';

// ── small helpers ────────────────────────────────────────────────────────────

export function isGuid(value) {
  return typeof value === 'string' && GUID.test(value);
}

export function truthy(value) {
  return value === true || /^true$/i.test(String(value == null ? '' : value).trim());
}

function parseJson(value) {
  if (value !== null && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

// The Cards panel folder new polls go in, e.g. "Polls" (CreateCard's Folder): names trimmed,
// empty ones dropped; "" for the top level; null for what the server refuses (over 10
// levels, or a name over 100 characters).
export function folderPath(value) {
  const names = text(value).split('/').map((x) => x.trim()).filter((x) => x.length > 0);
  if (names.length > 10 || names.some((x) => x.length > 100)) return null;
  return names.join('/');
}

// ── checks ───────────────────────────────────────────────────────────────────

// What someone typed for a new poll: options as a list, a JSON list or one per line, the
// switches as true/false or "true"/"false". { ok, poll } or { ok: false, error }.
export function validatePoll(input) {
  const question = text(input && input.question);
  let options = input ? input.options : null;
  if (typeof options === 'string') {
    const parsed = parseJson(options);
    options = Array.isArray(parsed) ? parsed : options.split(/\r?\n/);
  }
  if (!Array.isArray(options)) options = [];
  options = options.map(text).filter((x) => x.length > 0);

  if (!question) return { ok: false, error: 'Write a question.' };
  if (question.length > MAX_QUESTION) return { ok: false, error: `The question can be at most ${MAX_QUESTION} characters.` };
  if (options.length < 2) return { ok: false, error: 'A poll needs at least two options.' };
  if (options.length > MAX_OPTIONS) return { ok: false, error: `A poll can have at most ${MAX_OPTIONS} options.` };
  if (options.some((x) => x.length > MAX_OPTION)) return { ok: false, error: `Each option can be at most ${MAX_OPTION} characters.` };
  const lower = options.map((x) => x.toLowerCase());
  if (lower.some((x, i) => lower.indexOf(x) !== i)) return { ok: false, error: 'Two options are the same.' };

  return {
    ok: true,
    poll: {
      question: question,
      options: options,
      multi: truthy(input.multi),
      secret: truthy(input.secret),
      // A secret poll keeps its totals until it closes: live totals next to the list of who
      // has voted would show each new voter's pick.
      hideResults: truthy(input.hideResults) || truthy(input.secret),
      allowChange: truthy(input.allowChange),
    },
  };
}

// "/poll Where next? | Mill | Cave --secret": the question, the options and the switches
// (anywhere in the line), for validatePoll.
export function parseChatPoll(args) {
  const out = { question: '', options: [], secret: false, multi: false, hideResults: false, allowChange: false };
  const rest = text(args).replace(/(^|\s)(--[a-z]+)(?=\s|$)/gi, (whole, space, flag) => {
    const name = SWITCHES[flag.toLowerCase()];
    if (!name) return whole;
    out[name] = true;
    return space;
  });
  const parts = rest.split('|').map(text);
  out.question = parts[0] || '';
  out.options = parts.slice(1).filter((x) => x.length > 0);
  return out;
}

// What a voter picked: numbers from 1 ("2", "1,3", "1 3"), a list of them, or one option's
// text. { ok, choices } with 0-based indexes, sorted, or { ok: false, error }.
export function parseChoices(input, poll) {
  const options = (poll && poll.options) || [];
  let picks;
  if (Array.isArray(input)) {
    picks = input.map((x) => Number(x));
  } else {
    const typed = text(input);
    if (!typed) return { ok: false, error: 'Pick an option.' };
    const named = options.map((x) => x.toLowerCase()).indexOf(typed.toLowerCase());
    if (named !== -1) return { ok: true, choices: [named] };
    picks = typed.split(/[\s,]+/).map((x) => (/^\d+$/.test(x) ? Number(x) : NaN));
  }
  if (picks.some((n) => !Number.isInteger(n) || n < 1 || n > options.length)) {
    return { ok: false, error: `Pick a number from 1 to ${options.length}, or an option's name.` };
  }
  const choices = picks.map((n) => n - 1).filter((n, i, all) => all.indexOf(n) === i).sort((a, b) => a - b);
  if (choices.length === 0) return { ok: false, error: 'Pick an option.' };
  if (choices.length > 1 && !(poll && poll.multi)) return { ok: false, error: 'This poll takes one pick.' };
  return { ok: true, choices: choices };
}

// May this voter vote now? `existing` is their stored ballot ("" for none).
export function checkVote(poll, state, existing) {
  if (!state || state.status !== 'open') return { ok: false, error: 'This poll is closed.' };
  if (text(existing) && !(poll && poll.allowChange)) return { ok: false, error: 'You have already voted in this poll.' };
  return { ok: true };
}

// The totals from the ballots ([{ name, choices }]): votes per option, how many voted and,
// unless the poll is secret, who picked each option.
export function tally(poll, ballots) {
  const counts = poll.options.map(() => 0);
  const names = poll.options.map(() => []);
  let total = 0;
  for (const ballot of ballots) {
    const picks = (ballot.choices || []).filter((i) => Number.isInteger(i) && i >= 0 && i < counts.length);
    if (picks.length === 0) continue;
    total += 1;
    for (const i of picks) { counts[i] += 1; names[i].push(ballot.name); }
  }
  const results = { counts: counts, total: total };
  if (!poll.secret) results.names = names;
  return results;
}

export function canStart(setting, isGm) {
  return isGm === true || setting === 'everyone';
}

export function canClose(poll, playerId, isGm) {
  return isGm === true || (!!poll && !!playerId && String(poll.createdBy).toLowerCase() === String(playerId).toLowerCase());
}

// The results as chat text, one line per option.
export function resultsText(poll, results) {
  const lines = poll.options.map((option, i) => {
    const who = results.names && results.names[i] && results.names[i].length ? ` (${results.names[i].join(', ')})` : '';
    return `${i + 1}. ${option}: ${results.counts[i] || 0}${who}`;
  });
  lines.push(`${results.total} voted.`);
  return lines.join('\n');
}

// ── answers ──────────────────────────────────────────────────────────────────

// The answer to the window that asked (RunClientCommand Reply to its panel), only when
// replyTo is one of this addon's window panels.
export function answer(vars, reply) {
  const replyTo = vars && typeof vars.replyTo === 'string' && REPLY_PANEL.test(vars.replyTo) ? vars.replyTo : '';
  return { reply: reply, replyTo: replyTo, hasReply: replyTo ? 'yes' : 'no' };
}

// Everything a RunScript returns for the steps after it: the answer (above), failed ("yes"
// when reply.ok is false), notice (the text to whisper when there is no window to answer),
// hasNotice ("yes" when there is one: an If can't compare text that may hold quotes) and
// any extra variables.
export function outcome(vars, reply, extra) {
  const result = answer(vars, reply);
  result.failed = reply && reply.ok === false ? 'yes' : 'no';
  result.notice = (reply && (reply.error || reply.message)) || '';
  result.hasNotice = result.notice ? 'yes' : 'no';
  const more = extra || {};
  for (const key in more) result[key] = more[key];
  return result;
}

const fail = (vars, kind, error) => outcome(vars, { kind: kind, ok: false, error: error });

// ── workflows ────────────────────────────────────────────────────────────────

function players(game) {
  return game.find('players') || [];
}

function readBallot(game, ballotsId, playerId) {
  const choices = parseJson(game.getProperty(ballotsId, 'vote_' + playerId, ''));
  return Array.isArray(choices) ? choices : [];
}

function showPoll(game, playerId, data) {
  game.step('ShowView', { ViewKey: 'poll_window', Player: playerId || '', Data: JSON.stringify(data) });
}

// A poll by its card id: its config and state (from the game) and its card, or an error.
function loadPoll(game, vars, pollId) {
  const missing = { error: 'That poll doesn\'t exist.' };
  if (!isGuid(pollId)) return missing;
  const record = parseJson(game.getProperty(vars.gameId, 'poll_' + pollId, ''));
  if (!record || !record.poll || !record.state || !Array.isArray(record.poll.options)) return missing;
  if (text(game.getProperty(pollId, 'pollId', '')).toLowerCase() !== pollId.toLowerCase()) return missing;
  return { id: pollId, poll: record.poll, state: record.state, ballots: pollId };
}

function saveState(game, vars, id, poll, state) {
  game.setProperty(vars.gameId, 'poll_' + id, JSON.stringify({ poll: poll, state: state }));
}

function currentState(game, vars, id) {
  const record = parseJson(game.getProperty(vars.gameId, 'poll_' + id, ''));
  return record && record.state ? record.state : null;
}

// Counts every player's ballot again: who voted (in the players' order) and the totals.
function recount(game, loaded) {
  const ballots = players(game).map((p) => ({ name: p.name, choices: readBallot(game, loaded.ballots, p.id) }));
  return {
    voted: ballots.filter((b) => b.choices.length > 0).map((b) => b.name),
    results: tally(loaded.poll, ballots),
  };
}

function openState(poll, voted, results) {
  const state = { status: 'open', voted: voted };
  if (!poll.hideResults) state.results = results;
  return state;
}

function templateId(game, key) {
  const found = (game.find('cards', { includeTemplates: true }) || []).filter((c) => c.key === key && c.isTemplate);
  return found.length ? String(found[0].id) : '';
}

export function startPoll(game, vars) {
  const setting = text(game.getProperty(vars.gameId, 'poll_who_starts', 'gm'));
  if (!canStart(setting, truthy(vars.playerIsGm))) return fail(vars, 'started', 'Only the GM can start polls in this game.');
  const checked = validatePoll(vars);
  if (!checked.ok) return fail(vars, 'started', checked.error);

  const template = templateId(game, 'poll_poll');
  if (!template) return fail(vars, 'started', 'The Poll addon\'s template is missing: reinstall the addon.');
  const folder = folderPath(game.getProperty(vars.gameId, 'poll_folder', DEFAULT_FOLDER));

  const poll = checked.poll;
  const pollId = String(game.createCard({ name: poll.question, templateId: template, folder: folder || '' }));
  poll.createdBy = vars.playerId;
  poll.createdByName = text(vars.playerName);

  game.setProperty(pollId, 'pollId', pollId);
  saveState(game, vars, pollId, poll, openState(poll, [], tally(poll, [])));
  game.setProperty(vars.gameId, 'poll_latest', pollId);

  const numbers = poll.multi ? '/vote 1,3' : `/vote 1 to /vote ${poll.options.length}`;
  game.chat(`${poll.createdByName || 'Someone'} started a poll: ${poll.question}\n`
    + poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')
    + `\nVote in the poll window, or type ${numbers} in chat.`, { title: 'Poll' });
  showPoll(game, '', { view: 'vote', pollId: pollId });
  return outcome(vars, { kind: 'started', ok: true, pollId: pollId, message: 'Poll started.' });
}

export function castVote(game, vars) {
  const loaded = loadPoll(game, vars, text(vars.pollId));
  if (loaded.error) return fail(vars, 'voted', loaded.error);
  const picked = parseChoices(vars.choices, loaded.poll);
  if (!picked.ok) return fail(vars, 'voted', picked.error);
  const existing = game.getProperty(loaded.ballots, 'vote_' + vars.playerId, '');
  const allowed = checkVote(loaded.poll, loaded.state, existing);
  if (!allowed.ok) return fail(vars, 'voted', allowed.error);

  game.setProperty(loaded.ballots, 'vote_' + vars.playerId, JSON.stringify(picked.choices));
  const counted = recount(game, loaded);
  // Closed in the meantime? Then the close's own count stands.
  const now = currentState(game, vars, loaded.id);
  if (now && now.status === 'open') saveState(game, vars, loaded.id, loaded.poll, openState(loaded.poll, counted.voted, counted.results));
  const names = picked.choices.map((i) => loaded.poll.options[i]).join(', ');
  return outcome(vars, { kind: 'voted', ok: true, choices: picked.choices, message: `Vote counted: ${names}.` });
}

export function myVote(game, vars) {
  const loaded = loadPoll(game, vars, text(vars.pollId));
  if (loaded.error) return fail(vars, 'mine', loaded.error);
  return outcome(vars, { kind: 'mine', ok: true, choices: readBallot(game, loaded.ballots, vars.playerId) });
}

export function closePoll(game, vars) {
  const loaded = loadPoll(game, vars, text(vars.pollId));
  if (loaded.error) return fail(vars, 'closed', loaded.error);
  if (!canClose(loaded.poll, vars.playerId, truthy(vars.playerIsGm))) return fail(vars, 'closed', 'Only the GM or whoever started the poll can close it.');
  if (loaded.state.status !== 'open') return fail(vars, 'closed', 'This poll is closed already.');

  const counted = recount(game, loaded);
  saveState(game, vars, loaded.id, loaded.poll, { status: 'closed', voted: counted.voted, results: counted.results });
  if (text(game.getProperty(vars.gameId, 'poll_latest', '')).toLowerCase() === loaded.id.toLowerCase()) {
    game.setProperty(vars.gameId, 'poll_latest', '');
  }
  game.chat(resultsText(loaded.poll, counted.results), { title: 'Poll closed: ' + loaded.poll.question });
  return outcome(vars, { kind: 'closed', ok: true, message: 'Poll closed.' });
}

export function deletePoll(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail(vars, 'deleted', 'Only the GM can delete polls.');
  const loaded = loadPoll(game, vars, text(vars.pollId));
  if (loaded.error) return fail(vars, 'deleted', loaded.error);
  game.step('DeleteCard', { CardId: loaded.id });
  game.step('DeleteProperty', { ParentId: vars.gameId, PropertyName: 'poll_' + loaded.id });
  if (text(game.getProperty(vars.gameId, 'poll_latest', '')).toLowerCase() === loaded.id.toLowerCase()) {
    game.setProperty(vars.gameId, 'poll_latest', '');
  }
  return outcome(vars, { kind: 'deleted', ok: true, message: 'Poll deleted.' });
}

export function saveSettings(game, vars) {
  if (!truthy(vars.playerIsGm)) return fail(vars, 'saved', 'Only the GM can change the poll settings.');
  const who = text(vars.whoStarts);
  if (who !== 'gm' && who !== 'everyone') return fail(vars, 'saved', 'Choose who can start polls: the GM or everyone.');
  const folder = folderPath(vars.folder);
  if (folder === null) return fail(vars, 'saved', 'The folder can have at most 10 levels, each name at most 100 characters.');
  game.setProperty(vars.gameId, 'poll_who_starts', who);
  game.setProperty(vars.gameId, 'poll_folder', folder);
  return outcome(vars, { kind: 'saved', ok: true, message: 'Saved. Players get the New poll menu item the next time they load the game.' });
}

export function openNew(game, vars) {
  const setting = text(game.getProperty(vars.gameId, 'poll_who_starts', 'gm'));
  if (!canStart(setting, truthy(vars.playerIsGm))) return fail(vars, 'opened', 'Only the GM can start polls in this game.');
  showPoll(game, vars.playerId, { view: 'new' });
  return outcome(vars, { kind: 'opened', ok: true });
}

export function openCurrent(game, vars) {
  const latest = text(game.getProperty(vars.gameId, 'poll_latest', ''));
  const loaded = loadPoll(game, vars, latest);
  if (loaded.error) return fail(vars, 'opened', 'There is no open poll.');
  showPoll(game, vars.playerId, { view: 'vote', pollId: loaded.id });
  return outcome(vars, { kind: 'opened', ok: true });
}

// Hook 19 (Chat Command): /vote <pick> in the current poll; /poll Question? | A | B starts
// one, /poll close closes the current one, /poll alone shows it. Every Chat Command action
// gets every command: anything else comes back with ignore = "yes".
export function chatCommand(game, vars) {
  const command = text(vars.ChatCommand).toLowerCase();
  const args = text(vars.ChatArgs);
  const chatVars = Object.assign({}, vars, { replyTo: '' });
  let result;
  if (command === 'vote') {
    const latest = text(game.getProperty(vars.gameId, 'poll_latest', ''));
    if (!latest) result = fail(chatVars, 'voted', 'There is no open poll.');
    else result = castVote(game, Object.assign({}, chatVars, { pollId: latest, choices: args }));
  } else if (command === 'poll') {
    if (!args) {
      result = openCurrent(game, chatVars);
    } else if (args.toLowerCase() === 'close') {
      const latest = text(game.getProperty(vars.gameId, 'poll_latest', ''));
      if (!latest) result = fail(chatVars, 'closed', 'There is no open poll.');
      else result = closePoll(game, Object.assign({}, chatVars, { pollId: latest }));
    } else {
      const parsed = parseChatPoll(args);
      const checked = validatePoll(parsed);
      result = checked.ok
        ? startPoll(game, Object.assign({}, chatVars, parsed, { options: parsed.options }))
        : fail(chatVars, 'started', checked.error + ' ' + CHAT_FORMAT);
    }
  } else {
    return { ignore: 'yes', failed: 'no', hasReply: 'no', notice: '', hasNotice: 'no', reply: null, replyTo: '' };
  }
  result.ignore = 'no';
  return result;
}
