import { useState } from 'react';

const MAX_OPTIONS = 10;

// A new poll: the question, up to ten options and the four switches. The start action checks
// everything again and opens the poll for everyone, this player included, so this window
// closes.
export default function NewPoll({ Api, call, ready }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [flags, setFlags] = useState({ secret: false, hideResults: false, multi: false, allowChange: false });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const setOption = (i, value) => setOptions((all) => all.map((o, j) => (j === i ? value : o)));
  const removeOption = (i) => setOptions((all) => all.filter((_, j) => j !== i));
  const addOption = () => setOptions((all) => (all.length < MAX_OPTIONS ? [...all, ''] : all));

  const start = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await call('start', 'started', {
        question: question.trim(),
        options: JSON.stringify(filled),
        secret: String(flags.secret),
        hideResults: String(flags.hideResults),
        multi: String(flags.multi),
        allowChange: String(flags.allowChange),
      });
      Api.Close();
    } catch (err) {
      setStatus(err.message);
      setBusy(false);
    }
  };

  // The sandbox has no forms: Enter in the last option adds another.
  const onOptionKey = (i) => (e) => {
    if (e.key === 'Enter' && i === options.length - 1 && options[i].trim()) addOption();
  };

  const flag = (name, label, help) => (
    <label className="poll-check">
      <input type="checkbox" checked={flags[name]} onChange={(e) => setFlags((f) => ({ ...f, [name]: e.target.checked }))} />
      <span>{label} <span className="poll-muted poll-small">{help}</span></span>
    </label>
  );

  return (
    <div className="poll-page">
      <h1>New poll</h1>
      <label className="poll-field">
        <span>Question</span>
        <input value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder="Where do we go next?" />
      </label>
      <div className="poll-field">
        <span>Options</span>
        {options.map((option, i) => (
          <div key={i} className="poll-row">
            <input className="poll-grow" value={option} maxLength={100} onChange={(e) => setOption(i, e.target.value)}
              onKeyDown={onOptionKey(i)} placeholder={`Option ${i + 1}`} />
            {options.length > 2 && <button aria-label={`Remove option ${i + 1}`} onClick={() => removeOption(i)}>×</button>}
          </div>
        ))}
        {options.length < MAX_OPTIONS && <div><button onClick={addOption}>Add option</button></div>}
      </div>
      <div className="poll-field">
        {flag('secret', 'Secret ballot', 'Nobody sees who voted for what, only the totals.')}
        {flag('hideResults', 'Hide results until closed', 'So early votes don’t sway the rest.')}
        {flag('multi', 'Multiple choice', 'Each voter may pick several options.')}
        {flag('allowChange', 'Allow changing votes', 'Until the poll closes.')}
      </div>
      <div className="poll-row">
        <button disabled={!ready || busy || !question.trim() || filled.length < 2} onClick={start}>Start poll</button>
      </div>
      {status && <p className="poll-error">{status}</p>}
    </div>
  );
}
