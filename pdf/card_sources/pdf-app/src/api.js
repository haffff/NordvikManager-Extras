import { useEffect, useState } from 'react';

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * A property's value (string, '' when missing), kept up to date. Another card's properties
 * go through Properties.Global (the server checks Read), this card's own through Properties:
 * the app routes events for the card itself to the plain Subscribe.
 */
export function useProperty(api, parentId, name) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    if (!api || !parentId) return undefined;
    let live = true;
    const own = same(parentId, api.cardId);
    const props = own ? api.Properties : api.Properties.Global;
    const args = own ? [name] : [parentId, name];
    const onChange = (p) => { if (live) setValue(p?.value ?? ''); };
    props.Subscribe(...args, onChange);
    props.Get(...args).then((p) => { if (live) setValue(p?.value ?? ''); }).catch(() => { if (live) setValue(''); });
    return () => { live = false; props.Unsubscribe(...args, onChange); };
  }, [api, parentId, name]);
  return value; // null while loading
}

/** Who is looking: { me: { id, name, color }, isGm }. */
export function usePlayer(api) {
  const [player, setPlayer] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      api.ClientMediator.sendCommandAsync('Game', 'GetCurrentPlayer', {}).catch(() => null),
      api.ClientMediator.sendCommandAsync('Game', 'GetIsGM', {}).catch(() => false),
    ]).then(([me, isGm]) => {
      if (live) setPlayer({ me: { id: me?.id ?? '', name: me?.name ?? '', color: me?.color ?? '#ffd54f' }, isGm: isGm === true });
    });
    return () => { live = false; };
  }, [api]);
  return player;
}

/** Fires an addon action; the result comes back as property changes (or a whisper). */
export function fire(api, name, args) {
  return api.FireAction(`pdf/${name}`, args);
}

export const idOf = (value) => String(value || '').toLowerCase();
