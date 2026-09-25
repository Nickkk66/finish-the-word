// Roblox-style player list (top-right): name, host crown, BOT tag, hearts / OUT, wins, turn highlight.

import { h } from './dom.js';
import { icons } from './icons.js';
import { MAX_PLAYERS } from '../shared/constants.js';

const LIVE_PHASES = new Set(['choosing', 'typing', 'roundEnd', 'ended']);

export function createPlayerList() {
  const count = h('span', { class: 'plist-count' });
  const head = h('button', { type: 'button', class: 'plist-head', 'aria-expanded': 'true' },
    h('span', { class: 'plist-title' }, 'Players'), count, h('span', { class: 'plist-wins-head', title: 'Wins' }, '🏆'));
  const rows = h('div', { class: 'plist-rows' });
  const el = h('div', { class: 'plist' }, head, rows);

  // Collapsed by default on small screens (tap the header to toggle).
  const compact = matchMedia('(max-width: 720px), (max-height: 520px)').matches;
  el.classList.toggle('collapsed', compact);
  head.setAttribute('aria-expanded', String(!compact));
  head.addEventListener('click', () => {
    const collapsed = el.classList.toggle('collapsed');
    head.setAttribute('aria-expanded', String(!collapsed));
  });

  let key = '';

  function update(state) {
    const m = state.match;
    const live = m && LIVE_PHASES.has(m.phase);
    const parts = new Map(live ? m.participants.map((p, i) => [p.id, { ...p, order: i }]) : []);
    const turnId = m?.phase === 'typing' ? m.typerId : m?.phase === 'choosing' ? m.chooserId : null;

    const players = [...state.players.values()];
    const rank = (p) => {
      const part = parts.get(p.id);
      if (part) return part.order;
      return p.seat >= 0 ? 100 + p.seat : 200;
    };
    players.sort((a, b) => rank(a) - rank(b));

    const rowData = players.map((p) => {
      const part = parts.get(p.id);
      return {
        id: p.id,
        name: p.name,
        bot: p.isBot,
        host: p.id === state.hostId,
        me: p.id === state.you,
        offline: !p.connected,
        seated: p.seat >= 0,
        wins: p.wins,
        turn: p.id === turnId,
        hearts: part ? part.hearts : null,
        maxHearts: part ? part.maxHearts : 0,
        shield: part ? part.shield && part.alive : false,
        out: part ? !part.alive : false,
      };
    });
    const nextKey = JSON.stringify(rowData);
    if (nextKey === key) return;
    key = nextKey;

    count.textContent = `${players.length}/${MAX_PLAYERS}`;
    rows.replaceChildren(...rowData.map((r) => {
      let status = null;
      if (r.out) status = h('span', { class: 'pl-out' }, 'OUT');
      else if (r.hearts != null) {
        status = h('span', { class: 'pl-hearts', title: `${r.hearts} hearts${r.shield ? ' + pet shield' : ''}` },
          r.shield ? h('span', { class: 'pl-shield' }, '🛡️') : null,
          Array.from({ length: r.maxHearts }, (_, i) => h('span', { class: `pl-heart${i < r.hearts ? '' : ' lost'}` }, icons.heart())));
      } else if (r.seated) status = h('span', { class: 'pl-seat', title: 'Seated' }, '🪑');
      return h('div', { class: `plist-row${r.me ? ' me' : ''}${r.turn ? ' turn' : ''}${r.out ? ' out' : ''}${r.offline ? ' offline' : ''}` },
        h('span', { class: 'pl-name' },
          r.host ? h('span', { class: 'pl-crown', title: 'Host' }, '👑') : null,
          h('span', { class: 'pl-text' }, r.name),
          r.bot ? h('span', { class: 'pl-tag bot' }, 'BOT') : null,
          r.offline ? h('span', { class: 'pl-tag off', title: 'Reconnecting' }, '···') : null),
        h('span', { class: 'pl-status' }, status),
        h('span', { class: 'pl-wins' }, String(r.wins)));
    }));
  }

  return { el, update };
}
