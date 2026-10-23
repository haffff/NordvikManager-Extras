import { useEffect, useState } from 'react';

// The Trilium address and ETAPI token. The token goes to the server once, is stored there
// as a protected property and is never read back: the field only says whether one is saved.
export default function Settings({ Api, game, call, ready }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!game?.gameId) return;
    const Global = Api.Properties.Global;
    Global.Get(game.gameId, 'trilium_url').then((p) => setUrl(p?.value ?? '')).catch(() => {});
    Global.Get(game.gameId, 'trilium_token_set').then((p) => setTokenSaved(p?.value === 'true')).catch(() => {});
  }, [Api, game?.gameId]);

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

  const save = () => run(async () => {
    const reply = await call('save_settings', 'saved', { url: url.trim(), token: token.trim() });
    if (token.trim()) { setTokenSaved(true); setToken(''); }
    return reply;
  });

  return (
    <div className="tri-page">
      <h1>Trilium settings</h1>
      <label className="tri-field">
        <span>Trilium address</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8080" spellCheck={false} />
      </label>
      <label className="tri-field">
        <span>ETAPI token</span>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off"
          placeholder={tokenSaved ? 'Saved. Type a new one to replace it.' : 'From Trilium: Options > ETAPI'} />
      </label>
      <div className="tri-row">
        <button disabled={!ready || busy || !url.trim()} onClick={save}>Save</button>
        <button disabled={!ready || busy} onClick={() => run(() => call('test', 'test'))}>Test connection</button>
      </div>
      {status && <p className={status.ok ? 'tri-ok' : 'tri-error'}>{status.text}</p>}
      <div className="tri-help">
        <p>Needs <b>TriliumNext</b>. Make a token in Trilium under <b>Options &gt; ETAPI</b>. The token is stored on the
          GM&apos;s server as a protected property: nobody, not even this window, can read it back.</p>
        <p>A Trilium on this computer or your network (<code>localhost</code>, <code>192.168.x.x</code>) must be
          allowed by the server&apos;s admin in <b>Application Settings &gt; Server &gt; Local network access</b>,
          e.g. <code>localhost:8080</code>.</p>
        <p>Players can see the address (not the token) and which notes have cards.</p>
      </div>
    </div>
  );
}
