// Reading a poll for the page: the game property `poll_<card id>`, JSON written by the
// actions as { poll: question, options, switches; state: open/closed, who voted, totals }.
const parse = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

export const recordName = (pollId) => `poll_${pollId}`;

// { poll, state } or null when there is no such poll.
export function readRecord(value) {
  const record = parse(value);
  const poll = record && record.poll;
  if (!poll || typeof poll.question !== 'string' || !Array.isArray(poll.options)) return null;
  return { poll, state: readState(record.state) };
}

export function readState(state) {
  const s = state && typeof state === 'object' ? state : {};
  return {
    status: s.status === 'closed' ? 'closed' : 'open',
    voted: Array.isArray(s.voted) ? s.voted : [],
    results: s.results && Array.isArray(s.results.counts) ? s.results : null,
  };
}

// One bar per option: votes, the share of voters who picked it (several picks can add up to
// more than 100%), and who did when the poll isn't secret.
export function bars(poll, results) {
  if (!poll || !results) return [];
  return poll.options.map((label, i) => {
    const count = Number(results.counts[i]) || 0;
    return {
      label,
      count,
      percent: results.total > 0 ? Math.round((count / results.total) * 100) : 0,
      names: (results.names && results.names[i]) || [],
    };
  });
}

export function choiceLabel(poll, choices) {
  return (choices || []).map((i) => poll.options[i]).filter(Boolean).join(', ');
}
