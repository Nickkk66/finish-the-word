// Local player profile, persisted in localStorage (key ftw_profile_v1).
// Coins, cosmetics and lifetime stats are client-side only; the server just trusts loadout ids.

import { START_COINS, NAME_MAX } from './shared/constants.js';
import { randomLook, sanitizeLook, CHAIRS, CHAIR_IDS, PETS_BY_ID, TABLES, BACK_BLING, CARDS } from './shared/catalog.js';

const STORAGE_KEY = 'ftw_profile_v1';
export const FREE_COINS = 100;
export const FREE_COOLDOWN_MS = 15 * 60 * 1000;

const listeners = new Set();

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keeps only characters the server accepts in names (letters, digits, space, _-.'). */
export function cleanName(raw) {
  return String(raw ?? '').replace(/[^A-Za-z0-9 _\-.']/g, '').replace(/\s{2,}/g, ' ').slice(0, NAME_MAX);
}

function defaultName() {
  return `Player${1000 + Math.floor(Math.random() * 9000)}`;
}

function count(v, fallback = 0) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

function normalize(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const ownedChairs = ['wooden'];
  if (Array.isArray(p.ownedChairs)) {
    for (const id of p.ownedChairs) if (CHAIR_IDS.has(id) && !ownedChairs.includes(id)) ownedChairs.push(id);
  }
  const pets = {};
  const petTiers = {};
  for (const id of Object.keys(PETS_BY_ID)) {
    const old = p.petTiers?.[id];
    const tiers = old && typeof old === 'object'
      ? { 1: count(old[1]), 2: count(old[2]), 3: count(old[3]) }
      : { 1: count(p.pets?.[id]), 2: 0, 3: 0 };
    const total = tiers[1] + tiers[2] + tiers[3];
    if (total) { pets[id] = total; petTiers[id] = tiers; }
  }
  const ownedTables = [...new Set(['classic', ...(Array.isArray(p.ownedTables) ? p.ownedTables : []).filter((id) => TABLES.some((v) => v.id === id))])];
  const ownedBacks = [...new Set(['none', ...(Array.isArray(p.ownedBacks) ? p.ownedBacks : []).filter((id) => BACK_BLING.some((v) => v.id === id))])];
  const equippedPetTier = [1, 2, 3].find((tier) => tier === p.equippedPetTier && petTiers[p.equippedPet]?.[tier]) || [1, 2, 3].find((tier) => petTiers[p.equippedPet]?.[tier]) || 1;
  const settings = p.settings && typeof p.settings === 'object' ? p.settings : {};
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    id: typeof p.id === 'string' && /^[a-z0-9]{8,40}$/i.test(p.id) ? p.id : randomId(),
    name: cleanName(p.name).trim() || defaultName(),
    look: p.look ? sanitizeLook(p.look) : randomLook(),
    coins: count(p.coins, START_COINS),
    wins: count(p.wins),
    gamesPlayed: count(p.gamesPlayed),
    wordsTyped: count(p.wordsTyped),
    longestWord: typeof p.longestWord === 'string' && /^[a-z]{1,30}$/.test(p.longestWord) ? p.longestWord : '',
    ownedChairs,
    equippedChair: ownedChairs.includes(p.equippedChair) ? p.equippedChair : 'wooden',
    pets,
    petTiers,
    discoveredPets: [...new Set([...Object.keys(pets), ...(Array.isArray(p.discoveredPets) ? p.discoveredPets.filter((id) => PETS_BY_ID[id]) : [])])],
    equippedPet: pets[p.equippedPet] ? p.equippedPet : null,
    equippedPetTier,
    ownedTables, ownedBacks,
    equippedTable: ownedTables.includes(p.equippedTable) ? p.equippedTable : 'classic',
    equippedBack: ownedBacks.includes(p.equippedBack) ? p.equippedBack : 'none',
    cards: Object.fromEntries(CARDS.map((card) => [card.id, count(p.cards?.[card.id])])),
    xp: count(p.xp), bestWpm: count(p.bestWpm), bestCombo: count(p.bestCombo), bestObbyMs: count(p.bestObbyMs),
    receipts: Array.isArray(p.receipts) ? p.receipts.filter((v) => typeof v === 'string').slice(-100) : [],
    settings: {
      sound: settings.sound !== false,
      prefillPrefix: settings.prefillPrefix !== false,
      view: settings.view === 'first' ? 'first' : 'third',
      quality: settings.quality === 'low' || settings.quality === 'high' ? settings.quality : (coarse ? 'low' : 'high'),
    },
    lastFreeClaim: count(p.lastFreeClaim),
  };
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full / disabled (private mode): keep playing with the in-memory profile.
  }
}

/** The live profile. Treat as read-only outside this module; mutate via the helpers below. */
export const profile = normalize(read());
write();

function commit() {
  write();
  for (const fn of listeners) fn(profile);
}

export function onProfileChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Replace identity/progress only at an explicit account boundary; keep the exported object stable. */
export function replaceProfile(raw) {
  Object.assign(profile, normalize(raw));
  commit();
}

export function exportProfile() { return JSON.parse(JSON.stringify(profile)); }

// Another tab changed the profile (e.g. bought something): adopt it so we never overwrite it with stale data.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || !e.newValue) return;
  try {
    Object.assign(profile, normalize(JSON.parse(e.newValue)));
  } catch {
    return; // ignore malformed data written by other tabs
  }
  for (const fn of listeners) fn(profile);
});

// ---------------------------------------------------------------- mutations

export function setName(name) {
  const clean = cleanName(name).trim();
  if (!clean || clean === profile.name) return false;
  profile.name = clean;
  commit();
  return true;
}

export function setLook(look) {
  profile.look = sanitizeLook(look);
  commit();
}

function spend(n) {
  if (profile.coins < n) return false;
  profile.coins -= n;
  return true;
}

/** Buys (if needed) and equips a chair. Returns 'equipped' | 'bought' | 'poor' | 'invalid'. */
export function buyOrEquipChair(chairId) {
  const chair = CHAIRS.find((c) => c.id === chairId);
  if (!chair) return 'invalid';
  let result = 'equipped';
  if (!profile.ownedChairs.includes(chairId)) {
    if (!spend(chair.price)) return 'poor';
    profile.ownedChairs.push(chairId);
    result = 'bought';
  }
  profile.equippedChair = chairId;
  commit();
  return result;
}

/** Pays for a lucky block. Returns false when too poor. */
export function payForBlock(block) {
  if (!spend(block.price)) return false;
  commit();
  return true;
}

export function addPet(petId) {
  if (!PETS_BY_ID[petId]) return;
  profile.pets[petId] = (profile.pets[petId] || 0) + 1;
  profile.petTiers[petId] ||= { 1: 0, 2: 0, 3: 0 };
  profile.petTiers[petId][1]++;
  if (!profile.discoveredPets.includes(petId)) profile.discoveredPets.push(petId);
  commit();
}

export function equipPet(petId, tier = 1) {
  profile.equippedPet = petId && profile.petTiers[petId]?.[tier] ? petId : null;
  profile.equippedPetTier = tier;
  commit();
}

export function level() { return Math.min(999, Math.floor(Math.sqrt(profile.xp / 100)) + 1); }

export function recordWord(word, wpm = 0, combo = 0) {
  const previousLevel = level();
  const record = (profile.wordsTyped > 0 && word.length > profile.longestWord.length) || (profile.bestWpm > 0 && wpm > profile.bestWpm);
  profile.wordsTyped += 1;
  profile.xp += 10;
  profile.bestWpm = Math.max(profile.bestWpm, wpm || 0);
  profile.bestCombo = Math.max(profile.bestCombo, combo || 0);
  if (word.length > profile.longestWord.length) profile.longestWord = word;
  commit();
  return { record, levelUp: level() > previousLevel };
}

export function recordMatch({ won, coins, matchId, bestWpm = 0, bestCombo = 0 }) {
  if (matchId && !claimReceipt(`match:${matchId}`)) return false;
  profile.gamesPlayed += 1;
  if (won) profile.wins += 1;
  if (won) profile.xp += 50;
  profile.bestWpm = Math.max(profile.bestWpm, bestWpm);
  profile.bestCombo = Math.max(profile.bestCombo, bestCombo);
  if (coins > 0) profile.coins += Math.floor(coins);
  commit();
  return true;
}

export function claimReceipt(id) {
  if (profile.receipts.includes(id)) return false;
  profile.receipts.push(id);
  profile.receipts = profile.receipts.slice(-100);
  return true;
}

export function buyOrEquip(kind, id) {
  if (kind === 'chair') return buyOrEquipChair(id);
  const item = (kind === 'table' ? TABLES : BACK_BLING).find((v) => v.id === id);
  if (!item) return 'invalid';
  const owned = kind === 'table' ? profile.ownedTables : profile.ownedBacks;
  let result = 'equipped';
  if (!owned.includes(id)) {
    if (!spend(item.price)) return 'poor';
    owned.push(id); result = 'bought';
  }
  profile[kind === 'table' ? 'equippedTable' : 'equippedBack'] = id;
  commit(); return result;
}

export function spendCoins(coins) { if (!spend(coins)) return false; commit(); return true; }
export function grantCoins(coins, receipt) {
  if (receipt && !claimReceipt(receipt)) return false;
  profile.coins += count(coins); commit(); return true;
}
export function addCard(id) {
  if (!CARDS.some((v) => v.id === id)) return false;
  profile.cards[id] = (profile.cards[id] || 0) + 1; commit(); return true;
}
export function consumeCard(id, receipt) {
  if (!profile.cards[id] || (receipt && !claimReceipt(receipt))) return false;
  profile.cards[id]--; commit(); return true;
}

function syncPetCount(id) {
  const tiers = profile.petTiers[id];
  const n = tiers[1] + tiers[2] + tiers[3];
  if (n) profile.pets[id] = n;
  else { delete profile.pets[id]; delete profile.petTiers[id]; }
}

export function mergePet(id, tier) {
  if (![1, 2].includes(tier) || !(profile.petTiers[id]?.[tier] >= 3)) return false;
  profile.petTiers[id][tier] -= 3;
  profile.petTiers[id][tier + 1]++;
  if (profile.equippedPet === id && profile.equippedPetTier === tier && !profile.petTiers[id][tier]) profile.equippedPetTier = tier + 1;
  syncPetCount(id); commit(); return true;
}

export function deletePet(id, tier, amount = 1) {
  if (!Number.isInteger(amount) || amount < 1 || !(profile.petTiers[id]?.[tier] >= amount)) return false;
  profile.petTiers[id][tier] -= amount;
  if (profile.equippedPet === id && profile.equippedPetTier === tier && !profile.petTiers[id][tier]) profile.equippedPet = null;
  syncPetCount(id); commit(); return true;
}

export function recordObby(ms) {
  if (ms > 0 && (!profile.bestObbyMs || ms < profile.bestObbyMs)) { profile.bestObbyMs = Math.floor(ms); commit(); }
}

export function setSetting(key, value) {
  profile.settings[key] = value;
  commit();
}

export function freeReadyIn(now = Date.now()) {
  return Math.max(0, profile.lastFreeClaim + FREE_COOLDOWN_MS - now);
}

/** Claims the free coins if the cooldown is over. */
export function claimFree(now = Date.now()) {
  if (freeReadyIn(now) > 0) return false;
  profile.lastFreeClaim = now;
  profile.coins += FREE_COINS;
  commit();
  return true;
}
