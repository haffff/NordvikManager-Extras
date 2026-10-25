import { useCallback, useEffect, useRef, useState } from 'react';
import { createReplies } from './lib/replies.mjs';
import { windowPanelName } from './lib/panelName.mjs';

// Runs the addon's actions and waits for their answer. The window registers its own
// "addon_w<random>_poll" panel and passes its name as replyTo; the action answers there with
// RunClientCommand (command Reply). call() resolves with the reply, or rejects with its
// error.
export function usePoll(Api) {
  const replies = useRef(null);
  if (!replies.current) replies.current = createReplies();
  const [panel] = useState(windowPanelName);
  const [replyTo, setReplyTo] = useState('');

  useEffect(() => {
    let live = true;
    Api.ClientMediator.register(panel, { Reply: (data) => { replies.current.deliver(data); return true; } })
      .then((name) => { if (live) setReplyTo(name); })
      .catch((err) => console.error('Poll: could not register the reply panel', err));
    return () => {
      live = false;
      Api.ClientMediator.unregister(panel);
    };
  }, [Api, panel]);

  const call = useCallback((action, kind, args = {}) => {
    if (!replyTo) return Promise.reject(new Error('Still starting, try again in a moment.'));
    const answer = replies.current.wait(kind);
    Api.FireAction(`poll/${action}`, { ...args, replyTo });
    return answer;
  }, [Api, replyTo]);

  return { call, ready: Boolean(replyTo) };
}

// The game's id, whether this player is a GM, and who they are.
export function useGame(Api) {
  const [game, setGame] = useState(null);
  useEffect(() => {
    let live = true;
    const ask = (command) => Api.ClientMediator.sendCommandAsync('Game', command).catch(() => null);
    Promise.all([ask('GetGameId'), ask('GetIsGM'), ask('GetCurrentPlayer')])
      .then(([gameId, isGM, player]) => {
        if (live) setGame({ gameId, isGM: isGM === true, playerId: player?.id ?? '' });
      });
    return () => { live = false; };
  }, [Api]);
  return game;
}
