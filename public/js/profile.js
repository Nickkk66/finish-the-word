// Local player profile, persisted in localStorage (key ftw_profile_v1).
// Coins, cosmetics and lifetime stats are client-side only; the server just trusts loadout ids.

import { START_COINS, NAME_MAX } from './shared/constants.js';
import { randomLook, sanitizeLook, CHAIRS, CHAIR_IDS, PETS_BY_ID } from './shared/catalog.js';

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
  if (p.pets && typeof p.pets === 'object') {
    for (const [id, n] of Object.entries(p.pets)) if (PETS_BY_ID[id] && count(n) > 0) pets[id] = count(n);
  }
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
    equippedPet: pets[p.equippedPet] ? p.equippedPet : null,
    settings: {
      sound: settings.sound !== false,
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
  commit();
}

export function equipPet(petId) {
  profile.equippedPet = petId && profile.pets[petId] ? petId : null;
  commit();
}

export function recordWord(word) {
  profile.wordsTyped += 1;
  if (word.length > profile.longestWord.length) profile.longestWord = word;
  commit();
}

export function recordMatch({ won, coins }) {
  profile.gamesPlayed += 1;
  if (won) profile.wins += 1;
  if (coins > 0) profile.coins += Math.floor(coins);
  commit();
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
