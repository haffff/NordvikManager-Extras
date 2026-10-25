import { useEffect, useState } from 'react';

// The Local REST API plugin's address and API key, the Cards panel folder imported notes go
// in, and where the vault keeps attachments. The key goes to the server once, is stored there
// as a protected property and is never read back: the field only says whether one is saved.
export default function Settings({ Api, game, call, ready }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [folder, setFolder] = useState('');
  const [attachments, setAttachments] = useState('');
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!game?.gameId) return;
    const Global = Api.Properties.Global;
    Global.Get(game.gameId, 'obsidian_url').then((p) => setUrl(p?.value || 'http://127.0.0.1:27123')).catch(() => {});
    Global.Get(game.gameId, 'obsidian_folder').then((p) => setFolder(p?.value ?? '')).catch(() => {});
    Global.Get(game.gameId, 'obsidian_attachments').then((p) => setAttachments(p?.value ?? '')).catch(() => {});
    Global.Get(game.gameId, 'obsidian_key_set').then((p) => setKeySaved(p?.value === 'true')).catch(() => {});
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
    const reply = await call('save_settings', 'saved', {
      url: url.trim(), key: key.trim(), folder: folder.trim(), attachments: attachments.trim(),
    });
    if (key.trim()) { setKeySaved(true); setKey(''); }
    return reply;
  });

  return (
    <div className="obs-page">
      <h1>Obsidian settings</h1>
      <label className="obs-field">
        <span>Local REST API address</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:27123" spellCheck={false} />
      </label>
      <label className="obs-field">
        <span>API key</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off"
          placeholder={keySaved ? 'Saved. Type a new one to replace it.' : 'From Obsidian: Settings > Local REST API'} />
      </label>
      <label className="obs-field">
        <span>Folder for imported notes</span>
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Top level of the Cards panel, e.g. Lore/Obsidian" spellCheck={false} />
      </label>
      <label className="obs-field">
        <span>Attachments folder in the vault</span>
        <input value={attachments} onChange={(e) => setAttachments(e.target.value)} placeholder="As in Obsidian, e.g. Attachments or ./assets" spellCheck={false} />
      </label>
      <div className="obs-row">
        <button disabled={!ready || busy || !url.trim()} onClick={save}>Save</button>
        <button disabled={!ready || busy} onClick={() => run(() => call('test', 'test'))}>Test connection</button>
      </div>
      {status && <p className={status.ok ? 'obs-ok' : 'obs-error'}>{status.text}</p>}
      <div className="obs-help">
        <p>In Obsidian, install the community plugin <b>Local REST API</b>, turn on its <b>HTTP server</b>
          (port 27123) and copy its <b>API key</b>. Obsidian has to be open while you play.</p>
        <p>The key is stored on the GM&apos;s server as a protected property: nobody, not even this window, can read
          it back.</p>
        <p>The server&apos;s admin must allow it in <b>Application Settings &gt; Server &gt; Local network access</b>,
          e.g. <code>localhost:27123</code>. <code>127.0.0.1</code> is the computer the game server runs on.</p>
        <p>Imported notes go into the folder of the Cards panel named above (<code>/</code> between folders), made if
          it doesn&apos;t exist yet. Images embedded as <code>![[picture.png]]</code> are looked for next to the note,
          in the attachments folder, then at the top of the vault.</p>
        <p>Each note&apos;s frontmatter and <code>%% comments %%</code> stay out of its card. Players can see the
          address (not the key).</p>
      </div>
    </div>
  );
}
