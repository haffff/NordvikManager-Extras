import { useEffect, useState } from 'react';
import { bars, choiceLabel, readRecord, recordName } from './lib/pollView.mjs';

// A poll: its question and options to vote with, who has voted, and the results when the
// poll shows them. It reads the game property poll_<card id> (the card itself, with the
// ballots, is never shared). Votes go to the vote action; the page only learns its own picks
// (my_vote).
export default function Vote({ Api, game, call, ready, pollId }) {
  const [card, setCard] = useState(undefined); // undefined: loading; { poll, state } or null
  const [mine, setMine] = useState([]);
  const [picked, setPicked] = useState([]);
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const gameId = game?.gameId;
  useEffect(() => {
    let live = true;
    if (!pollId || !gameId) {
      setCard(null);
      return () => { live = false; };
    }
    const name = recordName(pollId);
    Api.Properties.Global.Get(gameId, name)
      .then((p) => { if (live) setCard(readRecord(p?.value)); })
      .catch(() => { if (live) setCard(null); });
    const onChange = (p) => { if (live) setCard(readRecord(p?.value)); };
    Api.Properties.Global.Subscribe(gameId, name, onChange);
    return () => {
      live = false;
      Api.Properties.Global.Unsubscribe(gameId, name, onChange);
    };
  }, [Api, gameId, pollId]);

  // What this player picked before (after a reload, or in another window).
  const hasPoll = Boolean(card?.poll);
  useEffect(() => {
    if (!ready || !hasPoll) return;
    let live = true;
    call('my_vote', 'mine', { pollId }).then((r) => { if (live) setMine(r.choices ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [ready, hasPoll, call, pollId]);

  const run = async (what) => {
    setBusy(true);
    setStatus(null);
    try {
      const reply = await what();
      setStatus({ ok: true, text: reply.message || 'Done.' });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (card === undefined) return <div className="poll-page poll-muted">Loading…</div>;
  if (!card) return <div className="poll-page poll-muted"><p>There is no poll here: it may have been deleted.</p></div>;

  const { poll, state } = card;
  const open = state.status === 'open';
  const canVote = open && (mine.length === 0 || poll.allowChange);
  const canClose = open && (game.isGM || (Boolean(game.playerId) && game.playerId === poll.createdBy));
  const results = bars(poll, state.results);

  const vote = (choices) => run(async () => {
    const reply = await call('vote', 'voted', { pollId, choices: choices.map((i) => i + 1).join(',') });
    setMine(reply.choices ?? choices);
    setPicked([]);
    return reply;
  });
  const toggle = (i) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort((a, b) => a - b)));

  const switches = [
    poll.secret && 'Secret ballot',
    poll.multi && 'Multiple choice',
    poll.hideResults && 'Results when it closes',
    poll.allowChange && 'You can change your vote',
  ].filter(Boolean);

  return (
    <div className="poll-page">
      <h1>{poll.question}</h1>
      <p className="poll-muted poll-small">
        {open ? 'Open' : 'Closed'} · started by {poll.createdByName || 'someone'}
        {switches.length > 0 && <> · {switches.join(' · ')}</>}
      </p>

      {open && (
        <div className="poll-options">
          {poll.options.map((option, i) => (poll.multi ? (
            <label key={i} className={`poll-option${mine.includes(i) ? ' poll-mine' : ''}`}>
              <input type="checkbox" checked={picked.includes(i)} disabled={!canVote || busy} onChange={() => toggle(i)} />
              <span>{i + 1}. {option}</span>
            </label>
          ) : (
            <button key={i} className={`poll-option${mine.includes(i) ? ' poll-mine' : ''}`} disabled={!ready || !canVote || busy}
              onClick={() => vote([i])}>
              {i + 1}. {option}
            </button>
          )))}
          {poll.multi && canVote && (
            <div className="poll-row">
              <button disabled={!ready || busy || picked.length === 0} onClick={() => vote(picked)}>Vote</button>
            </div>
          )}
        </div>
      )}

      {mine.length > 0 && <p className="poll-small">Your vote: {choiceLabel(poll, mine)}{open && !poll.allowChange ? ' (final)' : ''}</p>}
      {status && <p className={status.ok ? 'poll-ok' : 'poll-error'}>{status.text}</p>}

      <p className="poll-small poll-muted">
        {state.voted.length === 0 ? 'Nobody has voted yet.' : `${state.voted.length} voted: ${state.voted.join(', ')}`}
      </p>

      {results.length > 0 ? (
        <ul className="poll-results">
          {results.map((bar, i) => (
            <li key={i}>
              <div className="poll-bar-label"><span>{bar.label}</span><span>{bar.count} · {bar.percent}%</span></div>
              <div className="poll-bar"><div className="poll-bar-fill" style={{ width: `${bar.percent}%` }} /></div>
              {bar.names.length > 0 && <div className="poll-small poll-muted">{bar.names.join(', ')}</div>}
            </li>
          ))}
        </ul>
      ) : (
        open && poll.hideResults && <p className="poll-small poll-muted">The results show when the poll closes.</p>
      )}

      {(canClose || game.isGM) && (
        <div className="poll-row">
          {canClose && <button disabled={!ready || busy} onClick={() => run(() => call('close', 'closed', { pollId }))}>Close poll</button>}
          {game.isGM && (confirmDelete
            ? <button className="poll-danger" disabled={!ready || busy} onClick={() => run(() => call('delete', 'deleted', { pollId }))}>Click again to delete</button>
            : <button disabled={!ready || busy} onClick={() => setConfirmDelete(true)}>Delete</button>)}
        </div>
      )}
    </div>
  );
}
