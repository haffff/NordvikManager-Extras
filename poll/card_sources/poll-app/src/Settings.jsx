import { useEffect, useState } from 'react';

// The GM's settings: who may start polls, and the Cards panel folder new polls go in.
export default function Settings({ Api, game, call, ready }) {
  const [whoStarts, setWhoStarts] = useState('gm');
  const [folder, setFolder] = useState('Polls');
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!game?.gameId) return;
    const Global = Api.Properties.Global;
    Global.Get(game.gameId, 'poll_who_starts').then((p) => setWhoStarts(p?.value === 'everyone' ? 'everyone' : 'gm')).catch(() => {});
    Global.Get(game.gameId, 'poll_folder').then((p) => { if (p) setFolder(p.value ?? ''); }).catch(() => {});
  }, [Api, game?.gameId]);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const reply = await call('save_settings', 'saved', { whoStarts, folder: folder.trim() });
      setStatus({ ok: true, text: reply.message || 'Saved.' });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="poll-page">
      <h1>Poll settings</h1>
      <div className="poll-field">
        <span>Who can start polls</span>
        <label className="poll-check">
          <input type="radio" name="who" checked={whoStarts === 'gm'} onChange={() => setWhoStarts('gm')} />
          <span>Only GMs</span>
        </label>
        <label className="poll-check">
          <input type="radio" name="who" checked={whoStarts === 'everyone'} onChange={() => setWhoStarts('everyone')} />
          <span>Everyone</span>
        </label>
      </div>
      <label className="poll-field">
        <span>Folder for polls</span>
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Top level of the Cards panel, e.g. Polls" spellCheck={false} />
      </label>
      <div className="poll-row">
        <button disabled={!ready || busy} onClick={save}>Save</button>
      </div>
      {status && <p className={status.ok ? 'poll-ok' : 'poll-error'}>{status.text}</p>}
      <div className="poll-help">
        <p>Everyone can vote, close polls they started and see the current poll (<b>Addons &gt; Polls</b>, or
          {' '}<code>/poll</code>). GMs can close and delete any poll.</p>
        <p>In chat: <code>/poll Question? | first | second</code> starts a poll (add <code>--secret</code>,
          {' '}<code>--hidden</code>, <code>--multi</code> or <code>--change</code>), <code>/vote 2</code> votes in the
          current one, <code>/poll close</code> closes it.</p>
        <p>Each poll is a card in the folder above (<code>/</code> between folders; empty for the top level). It holds
          the ballots and is never shared: players see the poll in its window. A secret ballot hides who picked what from
          the players (and its totals until it closes); the ballots are still on the GM&apos;s server.</p>
        <p>Players get the <b>New poll</b> menu item the next time they load the game.</p>
      </div>
    </div>
  );
}
