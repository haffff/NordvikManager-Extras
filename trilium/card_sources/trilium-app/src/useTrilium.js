import { useCallback, useEffect, useRef, useState } from 'react';
import { createReplies } from './lib/replies.mjs';

// Runs the addon's actions and waits for their answer. The window registers its
// "addon_trilium" panel and passes its name as replyTo; the action answers there with
// RunClientCommand (command Reply). call() resolves with the reply, or rejects with its
// error.
export function useTrilium(Api) {
  const replies = useRef(null);
  if (!replies.current) replies.current = createReplies();
  const [replyTo, setReplyTo] = useState('');

  useEffect(() => {
    let live = true;
    Api.ClientMediator.register('addon_trilium', { Reply: (data) => { replies.current.deliver(data); return true; } })
      .then((name) => { if (live) setReplyTo(name); })
      .catch((err) => console.error('Trilium: could not register the reply panel', err));
    return () => {
      live = false;
      Api.ClientMediator.unregister('addon_trilium');
    };
  }, [Api]);

  const call = useCallback((action, kind, args = {}) => {
    if (!replyTo) return Promise.reject(new Error('Still starting, try again in a moment.'));
    const answer = replies.current.wait(kind);
    Api.FireAction(`trilium/${action}`, { ...args, replyTo });
    return answer;
  }, [Api, replyTo]);

  return { call, ready: Boolean(replyTo) };
}

// The game's id and whether this player is a GM.
export function useGame(Api) {
  const [game, setGame] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      Api.ClientMediator.sendCommandAsync('Game', 'GetGameId'),
      Api.ClientMediator.sendCommandAsync('Game', 'GetIsGM'),
    ]).then(([gameId, isGM]) => { if (live) setGame({ gameId, isGM: isGM === true }); })
      .catch(() => { if (live) setGame({ gameId: null, isGM: false }); });
    return () => { live = false; };
  }, [Api]);
  return game;
}
