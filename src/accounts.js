// Optional cloud saves. Gameplay economy remains the existing client-trusted model.
// Passwords and session tokens are never stored in plaintext or returned in profiles.
import { sanitizeLook, CHAIRS, TABLES, BACK_BLING, PETS, CARDS } from '../public/js/shared/catalog.js';

const ITERATIONS = 100000; // Workers Web Crypto PBKDF2 iteration ceiling.
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 32768;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = (error, status = 400) => json({ error }, status);

export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: encoder.encode(salt) }, key, 256));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function cloudProfile(value, fixedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid save.');
  const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000000 ? v : 0;
  const owned = (key, catalog, initial) => [...new Set([initial, ...(Array.isArray(value[key]) ? value[key] : []).filter(id => catalog.some(item => item.id === id))])];
  const ownedChairs = owned('ownedChairs', CHAIRS, 'wooden');
  const ownedTables = owned('ownedTables', TABLES, 'classic');
  const ownedBacks = owned('ownedBacks', BACK_BLING, 'none');
  const petTiers = {}, pets = {};
  for (const { id } of PETS) {
    const old = value.petTiers?.[id];
    const tiers = { 1: count(old ? old[1] : value.pets?.[id]), 2: count(old?.[2]), 3: count(old?.[3]) };
    const total = tiers[1] + tiers[2] + tiers[3];
    if (total) { petTiers[id] = tiers; pets[id] = total; }
  }
  const settings = value.settings || {};
  const result = {
    id: fixedId || (/^[a-z0-9]{8,40}$/i.test(value.id || '') ? value.id : random(12)),
    name: String(value.name || 'Player').replace(/[^A-Za-z0-9 _\-.']/g, '').slice(0, 16).trim() || 'Player',
    look: sanitizeLook(value.look), ownedChairs, ownedTables, ownedBacks, petTiers, pets,
    equippedChair: ownedChairs.includes(value.equippedChair) ? value.equippedChair : 'wooden',
    equippedTable: ownedTables.includes(value.equippedTable) ? value.equippedTable : 'classic',
    equippedBack: ownedBacks.includes(value.equippedBack) ? value.equippedBack : 'none',
    equippedPet: pets[value.equippedPet] ? value.equippedPet : null,
    equippedPetTier: [1, 2, 3].find(tier => tier === value.equippedPetTier && petTiers[value.equippedPet]?.[tier]) || [1, 2, 3].find(tier => petTiers[value.equippedPet]?.[tier]) || 1,
    discoveredPets: [...new Set([...Object.keys(pets), ...(Array.isArray(value.discoveredPets) ? value.discoveredPets : []).filter(id => PETS.some(p => p.id === id))])],
    cards: Object.fromEntries(CARDS.map(card => [card.id, count(value.cards?.[card.id])])),
    longestWord: /^[a-z]{1,30}$/.test(value.longestWord || '') ? value.longestWord : '',
    receipts: Array.isArray(value.receipts) ? value.receipts.filter(v => typeof v === 'string' && v.length <= 160).slice(-100) : [],
    settings: { sound: settings.sound !== false, prefillPrefix: settings.prefillPrefix !== false, view: settings.view === 'first' ? 'first' : 'third', quality: settings.quality === 'low' ? 'low' : 'high' },
  };
  for (const key of ['coins', 'wins', 'gamesPlayed', 'wordsTyped', 'xp', 'bestWpm', 'bestCombo', 'bestObbyMs', 'lastFreeClaim']) {
    result[key] = key === 'lastFreeClaim' ? (Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : 0) : count(value[key]);
  }
  return result;
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new Error('Send JSON.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new Error('Save is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error('Save is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');
  return body;
}

export class Accounts {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(username)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS account_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
  }
  one(query, ...args) { return [...this.sql.exec(query, ...args)][0]; }
  rate(key, maximum, duration) {
    const now = Date.now();
    this.sql.exec('DELETE FROM account_limits WHERE reset_at < ?', now);
    const previous = this.one('SELECT attempts FROM account_limits WHERE key=?', key);
    if (previous && previous.attempts >= maximum) return false;
    this.sql.exec('INSERT INTO account_limits (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1', key, now + duration);
    return true;
  }
  async session(request) {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
    if (!token) return null;
    const tokenHash = await digest(token);
    const found = this.one('SELECT username,expires_at FROM sessions WHERE token_hash=?', tokenHash);
    return found && found.expires_at > Date.now() ? { ...found, tokenHash } : null;
  }
  async fetch(request) {
    try { return await this.handle(request); }
    catch { return failure('The account request could not be completed.', 400); }
  }
  async handle(request) {
    const path = new URL(request.url).pathname.replace('/api/account', '');
    if (request.method === 'POST' && (path === '/register' || path === '/login')) {
      const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'local-development');
      if (!this.rate(`ip:${ipHash}`, 30, 15 * 60000)) return failure('Too many attempts. Try again in 15 minutes.', 429);
      const body = await readBody(request);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return failure('Use 3–20 letters, numbers or underscores for your username.');
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return failure('Use a password between 12 and 128 characters.');
      if (!this.rate(`user:${await digest(username)}`, 12, 15 * 60000)) return failure('Too many attempts for this account. Try again in 15 minutes.', 429);
      let account = this.one('SELECT * FROM accounts WHERE username=?', username);
      if (path === '/register') {
        if (!this.rate(`signup:${ipHash}`, 6, 60 * 60000)) return failure('Too many new accounts. Try again later.', 429);
        if (account) return failure('That username is unavailable.', 409);
        const profile = cloudProfile(body.profile);
        const salt = random(16);
        const hash = await passwordHash(body.password, salt);
        // Unique key protects against two registrations racing across the password await.
        this.sql.exec('INSERT OR IGNORE INTO accounts (username,salt,password_hash,profile,revision,created_at) VALUES (?,?,?,?,1,?)', username, salt, hash, JSON.stringify(profile), Date.now());
        account = this.one('SELECT * FROM accounts WHERE username=?', username);
        if (account.salt !== salt) return failure('That username is unavailable.', 409);
      } else {
        const hash = await passwordHash(body.password, account?.salt || '00000000000000000000000000000000');
        if (!account || !equal(hash, account.password_hash)) return failure('Username or password is incorrect.', 401);
      }
      const token = random(32), tokenHash = await digest(token);
      this.sql.exec('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
      this.sql.exec('DELETE FROM sessions WHERE username=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE username=? ORDER BY expires_at DESC LIMIT 9)', username, username);
      this.sql.exec('INSERT INTO sessions (token_hash,username,expires_at) VALUES (?,?,?)', tokenHash, username, Date.now() + SESSION_MS);
      return json({ username, token, revision: account.revision, profile: JSON.parse(account.profile) });
    }
    const session = await this.session(request);
    if (!session) return failure('Please log in again. Your local progress is still safe.', 401);
    if (path === '/logout' && request.method === 'POST') {
      this.sql.exec('DELETE FROM sessions WHERE token_hash=?', session.tokenHash);
      return json({ ok: true });
    }
    if (path === '/me' && request.method === 'GET') {
      const account = this.one('SELECT profile,revision FROM accounts WHERE username=?', session.username);
      return json({ username: session.username, profile: JSON.parse(account.profile), revision: account.revision });
    }
    if (path === '/profile' && request.method === 'PUT') {
      if (!this.rate(`save:${session.username}`, 120, 60000)) return failure('Saving too quickly. Please wait a minute.', 429);
      const body = await readBody(request);
      const account = this.one('SELECT profile,revision FROM accounts WHERE username=?', session.username);
      if (!Number.isSafeInteger(body.revision) || body.revision !== account.revision) return failure('Another device has a newer save. Load that cloud save or log out to keep playing locally.', 409);
      const profile = cloudProfile(body.profile, JSON.parse(account.profile).id);
      this.sql.exec('UPDATE accounts SET profile=?,revision=revision+1 WHERE username=? AND revision=?', JSON.stringify(profile), session.username, body.revision);
      return json({ revision: account.revision + 1 });
    }
    return failure('Not found.', 404);
  }
}
