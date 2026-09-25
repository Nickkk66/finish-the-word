// Validation / normalisation of untrusted client input. Every function accepts any
// value (wrong types included) and returns a safe value or a "nothing" marker.
import { NAME_MAX, CHAT_MAX, MAX_WORD_LENGTH } from '../public/js/shared/constants.js';
import { CHAIR_IDS, PETS_BY_ID } from '../public/js/shared/catalog.js';
import { filterText } from './blocklist.js';

export { sanitizeLook } from '../public/js/shared/catalog.js';

const ANIMS = new Set(['idle', 'walk', 'jump', 'fall']);
const WORLD_LIMIT = 1000; // generous bound on coordinates; the island is far smaller
const TURN_SECONDS = [10, 15, 20];

// Collapses whitespace and strips control / invisible formatting characters (bidi overrides,
// zero-width chars) that could garble or spoof text.
const cleanText = (text) => text.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();

/** Letters, digits, space and _-.' only, ≤ NAME_MAX, filtered. '' if nothing usable. */
export function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  const clean = name.replace(/[^A-Za-z0-9 _.'-]/g, '').replace(/ +/g, ' ').trim();
  return filterText(clean.slice(0, NAME_MAX).trim());
}

export const randomPlayerName = (random) => `Player${1000 + Math.floor(random() * 9000)}`;

export const sanitizeChair = (chair) => (typeof chair === 'string' && CHAIR_IDS.has(chair) ? chair : 'wooden');

// Object.hasOwn: a plain lookup would accept inherited keys such as "constructor".
export const sanitizePet = (pet) => (typeof pet === 'string' && Object.hasOwn(PETS_BY_ID, pet) ? pet : null);

/** Chat line: cleaned, ≤ CHAT_MAX characters (code points), filtered. '' if empty. */
export function sanitizeChat(text) {
  if (typeof text !== 'string') return '';
  return filterText(Array.from(cleanText(text)).slice(0, CHAT_MAX).join('').trim());
}

/** Live typing text for the speech bubble: lowercase a-z only, ≤ MAX_WORD_LENGTH. */
export const sanitizeTyping = (text) =>
  typeof text === 'string' ? text.toLowerCase().replace(/[^a-z]/g, '').slice(0, MAX_WORD_LENGTH) : '';

/** A submitted word as validated by the rules: trimmed and lowercased ('' if not a string). */
export const normalizeWord = (word) => (typeof word === 'string' ? word.trim().toLowerCase() : '');

/** How a (possibly invalid) submitted word is echoed to everyone in `result`. */
export const displayWord = (word) => filterText(Array.from(cleanText(word)).slice(0, MAX_WORD_LENGTH).join(''));

/** { x, y, z, ry, anim } with finite, clamped, rounded numbers, or null if unusable. */
export function sanitizeMove(msg) {
  const values = [msg.x, msg.y, msg.z, msg.ry];
  if (!values.every(Number.isFinite)) return null;
  const [x, y, z, ry] = values.map((v) => Math.round(Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, v)) * 100) / 100);
  return { x, y, z, ry, anim: ANIMS.has(msg.anim) ? msg.anim : 'idle' };
}

/** Applies the valid fields of an untrusted settings object on top of `current`. */
export function sanitizeSettings(input, current) {
  const next = { ...current };
  if (!input || typeof input !== 'object') return next;
  if (Number.isInteger(input.hearts) && input.hearts >= 1 && input.hearts <= 3) next.hearts = input.hearts;
  if (TURN_SECONDS.includes(input.turnSeconds)) next.turnSeconds = input.turnSeconds;
  if (typeof input.petAbilities === 'boolean') next.petAbilities = input.petAbilities;
  return next;
}
