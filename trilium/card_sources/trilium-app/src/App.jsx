import { viewArgs } from './lib/args.mjs';
import { useGame, useTrilium } from './useTrilium.js';
import Settings from './Settings.jsx';
import Search from './Search.jsx';
import Viewer from './Viewer.jsx';

// One page for the addon's three windows: the GM's settings and search (view trilium_gm),
// and a note (view trilium_viewer, or a Trilium Note card opened from the Cards panel).
export default function App({ Api }) {
  const { view, cardId, pinTo } = viewArgs(Api.additionalArguments, Api.cardId);
  const game = useGame(Api);
  const { call, ready } = useTrilium(Api);

  if (!game) return <div className="tri-page tri-muted">Loading…</div>;
  if (view === 'settings') return <Settings Api={Api} game={game} call={call} ready={ready} />;
  if (view === 'search') return <Search call={call} ready={ready} pinTo={pinTo} />;
  return <Viewer key={cardId} Api={Api} game={game} call={call} ready={ready} cardId={cardId} />;
}
