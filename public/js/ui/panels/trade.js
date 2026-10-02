import { h } from '../dom.js';
import { noticeDialog } from '../overlays.js';
import { icons } from '../icons.js';
import { cardArt, modelArt } from '../art.js';
import { CHAIRS, BACK_BLING, PETS, CARDS, CARDS_BY_ID } from '../../shared/catalog.js';
import { tradeInventory, tradeOffer, tradeItemName } from '../../shared/trade.js';
import { profile } from '../../profile.js';
import { createAvatarPreview } from '../avatar.js';
import { TRADE_ACCOUNT_AGE_MS } from '../../shared/constants.js';

const button = (label, onClick, disabled = false, tone = 'green') =>
  h('button', { type: 'button', class: `btn small ${tone}`, disabled, onClick }, label);

function icon(actions, item) {
  if (item.kind === 'card') return cardArt(CARDS_BY_ID[item.id]);
  return modelArt(actions, item.kind === 'back' ? 'back' : item.kind, item.id, tradeItemName(item), 88);
}

function itemTile(actions, item, qty, onClick, disabled = false) {
  const name = tradeItemName(item);
  return h('button', { type: 'button', class: `trade-tile${qty ? ' selected' : ''}`, title: name,
    'aria-label': `${name}${qty ? `, ${qty} offered` : ''}`, disabled, onClick },
    icon(actions, item), h('span', { class: 'trade-tile-name' }, name),
    qty ? h('span', { class: 'trade-tile-count' }, `×${qty}`) : null);
}

function portrait(look) {
  const avatar = createAvatarPreview(look).el;
  avatar.setAttribute('viewBox', '0 0 140 112');
  avatar.setAttribute('aria-label', 'Player portrait');
  return avatar;
}

function history() {
  const list = h('div', { class: 'trade-history' });
  for (const entry of [...profile.tradeHistory].reverse()) {
    const summary = offer => [(offer.items || []).map(item => `${tradeItemName(item)}${item.qty > 1 ? ` ×${item.qty}` : ''}`)].flat().filter(Boolean).join(', ') || 'Nothing';
    list.append(h('div', { class: 'trade-history-row' }, h('strong', {}, entry.partner), h('small', {}, new Date(entry.at).toLocaleString()), h('span', {}, `Gave: ${summary(entry.outgoing)}`), h('span', {}, `Got: ${summary(entry.incoming)}`)));
  }
  return noticeDialog(`Trade history (${profile.tradeHistory.length})`, list.childElementCount ? list : h('p', { class: 'trade-history-empty' }, 'No completed trades yet.'));
}

export function tradePanel({ state, actions }) {
  return { id: 'trade', title: 'Trade', color: 'green', icon: icons.trade,
    mount(body) {
      const countdown = h('p', { class: 'trade-countdown', role: 'status' });
      function tick() { if (state.trade?.countdown) countdown.textContent = `Trade completes in ${Math.max(0, Math.ceil((state.trade.countdown - Date.now()) / 1000))}…`; }
      const clock = setInterval(tick, 100);
      function update() {
        body.replaceChildren(h('button', { type: 'button', class: 'trade-history-shortcut', title: 'Trade history',
          'aria-label': 'Trade history', 'aria-haspopup': 'dialog', onClick: history }, icons.history()));
        const trade = state.trade;
        if (!state.inRoom) { body.append(h('p', {}, 'Join a room to trade.')); return; }
        const eligible = state.account?.status === 'saved' && Number.isSafeInteger(state.account.createdAt) && Date.now() - state.account.createdAt >= TRADE_ACCOUNT_AGE_MS;
        if (!eligible && !trade) { body.append(h('p', { class: 'trade-note' }, state.account?.status !== 'saved' || !Number.isSafeInteger(state.account.createdAt) ? 'Sign in to trade. Your account must be at least 24 hours old.' : `Trading unlocks when your account is 24 hours old (${new Date(state.account.createdAt + TRADE_ACCOUNT_AGE_MS).toLocaleString()}).`)); return; }
        if (!trade) {
          body.append(h('p', { class: 'trade-note' }, 'Choose a player to trade with.'));
          const others = [...state.players.values()].filter(p => p.id !== state.you && !p.isBot && p.connected);
          const requests = h('div', { class: 'trade-request-grid' });
          for (const player of others) requests.append(h('button', { type: 'button', class: 'trade-request', onClick: () => actions.tradeRequest(player.id) },
            h('span', { class: 'trade-request-avatar' }, portrait(player.look)),
            h('strong', {}, player.name), h('small', {}, 'Request trade')));
          body.append(others.length ? requests : h('p', {}, 'No other players are available yet.'));
          return;
        }
        body.append(h('p', { class: 'trade-partner' }, `Trading with ${trade.peerName || 'another player'}`));
        if (trade.stage === 'invite') {
          const outgoing = trade.requesterId === state.you;
          body.append(h('p', {}, outgoing ? 'Waiting for them to accept your request…' : 'They want to trade with you.'));
          body.append(h('div', { class: 'trade-actions' },
            outgoing ? null : button('Accept request', () => actions.tradeRespond(trade.id, true)),
            button(outgoing ? 'Cancel request' : 'Decline', () => actions.tradeCancel(trade.id), false, 'grey')));
          return;
        }
        const own = tradeOffer(trade.offer), theirs = tradeOffer(trade.peerOffer), inventory = tradeInventory(profile);
        function change(item, delta) {
          const current = own.items.find(v => v.kind === item.kind && v.id === item.id && v.tier === item.tier)?.qty || 0;
          const available = item.kind === 'chair' ? Number(inventory.chairs.includes(item.id)) :
            item.kind === 'back' ? Number(inventory.backs.includes(item.id)) :
              item.kind === 'pet' ? inventory.pets[`${item.id}:${item.tier}`] || 0 : inventory.cards[item.id] || 0;
          const qty = Math.max(0, Math.min(available, current + delta));
          const items = own.items.filter(v => !(v.kind === item.kind && v.id === item.id && v.tier === item.tier));
          if (qty) items.push({ kind: item.kind, id: item.id, ...(item.tier ? { tier: item.tier } : {}), qty });
          actions.tradeOffer({ ...own, items });
        }
        function offerBox(title, offer, ready, mine) {
          const box = h('section', { class: `trade-box${ready ? ' accepted' : ''}` }, h('h3', {}, title));
          const tiles = h('div', { class: 'trade-icon-grid offer-grid trade-offer-grid' });
          for (const item of offer.items) tiles.append(itemTile(actions, item, item.qty, mine ? () => change(item, -1) : undefined, !mine || state.tradePending));
          if (!offer.items.length) tiles.append(h('span', { class: 'trade-empty' }, 'No items yet'));
          box.append(tiles, h('div', { class: 'trade-offer-footer' }, h('span', {}, ready ? 'Accepted ✓' : 'Reviewing')));
          if (ready) box.append(h('div', { class: 'trade-accepted-mark', 'aria-label': 'Offer accepted' }, '✓'));
          return box;
        }
        body.append(h('div', { class: 'trade-offers' },
          offerBox('Your offer', own, trade.accepted, true),
          offerBox(`${trade.peerName || 'Their'} offer`, theirs, trade.peerAccepted, false)));
        const entries = [
          ...CHAIRS.filter(v => inventory.chairs.includes(v.id)).map(v => ({ kind: 'chair', id: v.id })),
          ...BACK_BLING.filter(v => inventory.backs.includes(v.id)).map(v => ({ kind: 'back', id: v.id })),
          ...PETS.flatMap(v => [1, 2, 3].filter(tier => inventory.pets[`${v.id}:${tier}`]).map(tier => ({ kind: 'pet', id: v.id, tier }))),
          ...CARDS.filter(v => inventory.cards[v.id]).map(v => ({ kind: 'card', id: v.id })),
        ];
        const collection = h('div', { class: 'trade-icon-grid trade-collection scroll' });
        for (const item of entries) {
          const current = own.items.find(v => v.kind === item.kind && v.id === item.id && v.tier === item.tier)?.qty || 0;
          const max = item.kind === 'chair' || item.kind === 'back' ? 1 : item.kind === 'pet' ? inventory.pets[`${item.id}:${item.tier}`] : inventory.cards[item.id];
          collection.append(itemTile(actions, item, current, () => change(item, current >= max ? -current : 1), state.tradePending || own.items.length >= 16 && !current));
        }
        body.append(h('h3', { class: 'trade-collection-title' }, 'Your collection · tap an icon to add it'),
          entries.length ? collection : h('p', {}, 'You have no transferable items yet.'));
        body.append(h('p', { class: 'trade-note' }, state.tradePending ? 'Updating offer…' : trade.countdown ? 'Both accepted. You can still cancel your acceptance.' : 'Changing either offer clears both acceptances.'));
        if (trade.countdown) { tick(); body.append(countdown); }
        body.append(h('div', { class: 'trade-actions' },
          trade.accepted ? button('Cancel accept', () => actions.tradeUnaccept(trade.id), false, 'orange') : button('Accept trade', () => actions.tradeAccept(trade.id), state.tradePending),
          button('Cancel', () => actions.tradeCancel(trade.id), false, 'grey')));
      }
      update();
      return { update, unmount() { clearInterval(clock); if (state.trade) actions.tradeCancel(state.trade.id); } };
    },
  };
}
