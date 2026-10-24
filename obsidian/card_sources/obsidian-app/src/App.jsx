import { viewArgs } from './lib/args.mjs';
import { useGame, useObsidian } from './useObsidian.js';
import Settings from './Settings.jsx';
import Search from './Search.jsx';
import Viewer from './Viewer.jsx';

// One page for the addon's three windows: the GM's settings and search (view obsidian_gm),
// and a note (view obsidian_viewer, or an Obsidian Note card opened from the Cards panel).
export default function App({ Api }) {
  const { view, cardId, pinTo } = viewArgs(Api.additionalArguments, Api.cardId);
  const game = useGame(Api);
  const { call, ready } = useObsidian(Api);

  if (!game) return <div className="obs-page obs-muted">Loading…</div>;
  if (view === 'settings') return <Settings Api={Api} game={game} call={call} ready={ready} />;
  if (view === 'search') return <Search call={call} ready={ready} pinTo={pinTo} />;
  return <Viewer key={cardId} Api={Api} game={game} call={call} ready={ready} cardId={cardId} />;
}
