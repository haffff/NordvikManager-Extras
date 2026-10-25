// The addon's actions answer a window by RunClientCommand to its own reply panel
// (command Reply, data { kind, ok, error?, ... }). wait(kind) is settled by the next reply
// of that kind, in order; a reply with ok: false rejects with its error.
export function createReplies({ timeoutMs = 60000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const waiting = new Map(); // kind -> [{ resolve, reject, timer }]

  const wait = (kind) => new Promise((resolve, reject) => {
    const entry = { resolve, reject, timer: null };
    entry.timer = setTimer(() => {
      const list = waiting.get(kind) ?? [];
      const i = list.indexOf(entry);
      if (i !== -1) list.splice(i, 1);
      reject(new Error('No answer from the server. The game\'s event log (Addons > Code > Event Log) says why.'));
    }, timeoutMs);
    if (!waiting.has(kind)) waiting.set(kind, []);
    waiting.get(kind).push(entry);
  });

  const deliver = (reply) => {
    if (!reply || typeof reply !== 'object') return;
    const entry = waiting.get(reply.kind)?.shift();
    if (!entry) return;
    clearTimer(entry.timer);
    if (reply.ok === false) entry.reject(new Error(reply.error || 'Something went wrong.'));
    else entry.resolve(reply);
  };

  return { wait, deliver };
}
