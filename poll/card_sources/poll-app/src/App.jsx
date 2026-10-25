import { viewArgs } from './lib/args.mjs';
import { useGame, usePoll } from './usePoll.js';
import Vote from './Vote.jsx';
import NewPoll from './NewPoll.jsx';
import Settings from './Settings.jsx';

// One page for the addon's windows: a poll to vote in (view poll_window, or a Poll card opened
// from the Cards panel), a new poll (poll_window too) and the GM's settings (poll_gm).
export default function App({ Api }) {
  const { view, pollId } = viewArgs(Api.additionalArguments, Api.cardId);
  const game = useGame(Api);
  const { call, ready } = usePoll(Api);

  if (!game) return <div className="poll-page poll-muted">Loading…</div>;
  if (view === 'settings') return <Settings Api={Api} game={game} call={call} ready={ready} />;
  if (view === 'new') return <NewPoll Api={Api} call={call} ready={ready} />;
  return <Vote key={pollId} Api={Api} game={game} call={call} ready={ready} pollId={pollId} />;
}
