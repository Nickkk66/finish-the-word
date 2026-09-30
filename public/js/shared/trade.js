import { CHAIRS, BACK_BLING, PETS_BY_ID, CARDS_BY_ID } from './catalog.js';

const chairIds = new Set(CHAIRS.map(item => item.id).filter(id => id !== 'wooden'));
const backIds = new Set(BACK_BLING.map(item => item.id).filter(id => id !== 'none'));
const amount = value => Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1000000) : 0;

export function tradeInventory(raw = {}) {
  const pets = {};
  for (const id of Object.keys(PETS_BY_ID)) for (const tier of [1, 2, 3]) {
    const qty = amount(raw.petTiers?.[id]?.[tier] ?? raw.pets?.[`${id}:${tier}`]);
    if (qty) pets[`${id}:${tier}`] = qty;
  }
  const cards = {};
  for (const id of Object.keys(CARDS_BY_ID)) {
    const qty = amount(raw.cards?.[id]);
    if (qty) cards[id] = qty;
  }
  return {
    coins: Math.min(amount(raw.coins), 1000000000),
    chairs: [...new Set((Array.isArray(raw.ownedChairs) ? raw.ownedChairs : raw.chairs || []).filter(id => chairIds.has(id)))],
    backs: [...new Set((Array.isArray(raw.ownedBacks) ? raw.ownedBacks : raw.backs || []).filter(id => backIds.has(id)))],
    pets, cards,
  };
}

export function tradeOffer(raw = {}) {
  const items = [], seen = new Set();
  for (const entry of Array.isArray(raw.items) ? raw.items.slice(0, 16) : []) {
    if (!entry || typeof entry !== 'object') continue;
    const { kind, id } = entry;
    const tier = kind === 'pet' ? entry.tier : undefined;
    if (!(kind === 'chair' && chairIds.has(id) || kind === 'back' && backIds.has(id) || kind === 'pet' && PETS_BY_ID[id] && [1, 2, 3].includes(tier) || kind === 'card' && CARDS_BY_ID[id])) continue;
    const key = `${kind}:${id}:${tier ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind, id, ...(kind === 'pet' ? { tier } : {}), qty: kind === 'chair' || kind === 'back' ? 1 : Math.min(amount(entry.qty), 100) });
  }
  return { coins: Math.min(amount(raw.coins), 1000000000), items: items.filter(item => item.qty) };
}

export function offerAvailable(inventory, offer) {
  if (!inventory || offer.coins > inventory.coins) return false;
  return offer.items.every(item => {
    if (item.kind === 'chair') return inventory.chairs.includes(item.id);
    if (item.kind === 'back') return inventory.backs.includes(item.id);
    if (item.kind === 'pet') return (inventory.pets[`${item.id}:${item.tier}`] || 0) >= item.qty;
    return (inventory.cards[item.id] || 0) >= item.qty;
  });
}

export function transferInventory(inventory, outgoing, incoming) {
  const next = { coins: Math.max(0, inventory.coins - outgoing.coins + incoming.coins),
    chairs: [...inventory.chairs], backs: [...inventory.backs], pets: { ...inventory.pets }, cards: { ...inventory.cards } };
  for (const [offer, sign] of [[outgoing, -1], [incoming, 1]]) for (const item of offer.items) {
    if (item.kind === 'chair' || item.kind === 'back') {
      const list = item.kind === 'chair' ? next.chairs : next.backs;
      if (sign < 0 && list.includes(item.id)) list.splice(list.indexOf(item.id), 1);
      else if (!list.includes(item.id)) list.push(item.id);
    } else {
      const map = item.kind === 'pet' ? next.pets : next.cards;
      const key = item.kind === 'pet' ? `${item.id}:${item.tier}` : item.id;
      map[key] = Math.max(0, (map[key] || 0) + sign * item.qty);
    }
  }
  return next;
}

export function canReceive(inventory, outgoing, incoming) {
  return incoming.items.every(item => {
    if (item.kind === 'chair') return !inventory.chairs.includes(item.id) || outgoing.items.some(v => v.kind === 'chair' && v.id === item.id);
    if (item.kind === 'back') return !inventory.backs.includes(item.id) || outgoing.items.some(v => v.kind === 'back' && v.id === item.id);
    return true;
  });
}

export function tradeItemName(item) {
  if (item.kind === 'chair') return `${CHAIRS.find(v => v.id === item.id)?.name || item.id} Chair`;
  if (item.kind === 'back') return BACK_BLING.find(v => v.id === item.id)?.name || item.id;
  if (item.kind === 'pet') return `${PETS_BY_ID[item.id]?.name || item.id} · Tier ${item.tier}`;
  return CARDS_BY_ID[item.id]?.name || item.id;
}
