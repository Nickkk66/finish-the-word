// Optional cloud saves. Gameplay economy remains the existing client-trusted model.
// Passwords and session tokens are never stored in plaintext or returned in profiles.
import { sanitizeLook, CHAIRS, BACK_BLING, PETS, CARDS, SECRET_BACK_IDS } from '../public/js/shared/catalog.js';
import { handleMethods } from './handles.js';
import { tradeOffer } from '../public/js/shared/trade.js';

const ITERATIONS = 100000; // Workers Web Crypto PBKDF2 iteration ceiling.
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 131072; // Includes the bounded 512-receipt replay history.
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
    look: sanitizeLook(value.look), ownedChairs, ownedBacks, petTiers, pets,
    equippedChair: ownedChairs.includes(value.equippedChair) ? value.equippedChair : 'wooden',
    equippedBack: ownedBacks.includes(value.equippedBack) ? value.equippedBack : 'none',
    capeColor: value.capeColor === 'rainbow' || /^#[0-9a-f]{6}$/i.test(value.capeColor || '') ? value.capeColor : '#d84752',
    equippedPet: pets[value.equippedPet] ? value.equippedPet : null,
    equippedPetTier: [1, 2, 3].find(tier => tier === value.equippedPetTier && petTiers[value.equippedPet]?.[tier]) || [1, 2, 3].find(tier => petTiers[value.equippedPet]?.[tier]) || 1,
    discoveredPets: [...new Set([...Object.keys(pets), ...(Array.isArray(value.discoveredPets) ? value.discoveredPets : []).filter(id => PETS.some(p => p.id === id))])],
    cards: Object.fromEntries(CARDS.map(card => [card.id, count(value.cards?.[card.id])])),
    longestWord: /^[a-z]{1,30}$/.test(value.longestWord || '') ? value.longestWord : '',
    receipts: Array.isArray(value.receipts) ? value.receipts.filter(v => typeof v === 'string' && v.length <= 160).slice(-512) : [],
    tradeHistory: Array.isArray(value.tradeHistory) ? value.tradeHistory.filter(v => v && Number.isSafeInteger(v.at) && typeof v.partner === 'string').slice(-20).map(v => ({ at: v.at, partner: v.partner.slice(0, 16), outgoing: tradeOffer(v.outgoing), incoming: tradeOffer(v.incoming) })) : [],
    settings: { sound: settings.sound !== false, prefillPrefix: settings.prefillPrefix !== false, cardStyle: settings.cardStyle === 'deck' ? 'deck' : 'pocket', playerListStyle: ['classic', 'compact', 'portrait', 'ribbon'].includes(settings.playerListStyle) ? settings.playerListStyle : 'classic', view: settings.view === 'first' ? 'first' : 'third', quality: settings.quality === 'low' ? 'low' : 'high' },
  };
  for (const key of ['coins', 'wins', 'winsRevision', 'gamesPlayed', 'wordsTyped', 'xp', 'bestWpm', 'bestCombo', 'bestObbyMs', 'lastFreeClaim']) {
    result[key] = key === 'lastFreeClaim' ? (Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : 0) : count(value[key]);
  }
  result.freePlayMs = Math.min(900000, count(value.freePlayMs));
  return result;
}

export function restrictSecretBacks(profile, allowed = []) {
  profile.ownedBacks = profile.ownedBacks.filter(id => !SECRET_BACK_IDS.has(id) || allowed.includes(id));
  if(!profile.ownedBacks.includes(profile.equippedBack))profile.equippedBack='none';
  return profile;
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
  constructor(ctx, env) {
    this.ctx=ctx;this.env=env;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(username)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS account_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
    // Existing accounts predate recovery codes. Their owners can generate one while signed in.
    try { this.sql.exec('ALTER TABLE accounts ADD COLUMN recovery_hash TEXT'); } catch { /* already migrated */ }
    this.initHandles();
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
    const url=new URL(request.url);
    // Internal service binding only: no public account route exposes these operations.
    if (url.hostname === 'internal' && url.pathname === '/admin-profiles' && request.method === 'POST') {
      const body = await readBody(request);
      if (body.action === 'list') {
        const search = String(body.search || '').slice(0, 64).toLowerCase();
        const users = [...this.sql.exec('SELECT username,profile,created_at FROM accounts ORDER BY created_at DESC')]
          .map(a => ({ username: a.username, id: JSON.parse(a.profile).id, name: JSON.parse(a.profile).name, createdAt: a.created_at }))
          .filter(a => !search || [a.username, a.id, a.name].some(v => v.toLowerCase().includes(search))).slice(0, 100);
        return json({ users });
      }
      const handle = this.one('SELECT * FROM handles WHERE owner=?', body.id);
      const account = handle?.account && this.one('SELECT * FROM accounts WHERE username=?', handle.account);
      if (!account) {
        if (handle && body.action === 'save') {
          const name = cloudProfile(body.profile, body.id).name;
          const taken = this.one('SELECT owner FROM handles WHERE handle=?', name.toLowerCase());
          if (taken && taken.owner !== body.id) return failure('That handle is taken.', 409);
          if (/^bot-/i.test(name)) return failure('That handle is reserved.');
          this.sql.exec('UPDATE handles SET handle=?,name=?,revision=revision+1 WHERE owner=?', name.toLowerCase(), name, body.id);
          await this.notifyHandle(this.one('SELECT * FROM handles WHERE owner=?', body.id));
        }
        return json({ guest: true });
      }
      if (body.action === 'get') return json({ profile: JSON.parse(account.profile), revision: account.revision, username: account.username, createdAt: account.created_at });
      if (body.action !== 'save') return failure('Unknown operation.');
      if (body.revision !== account.revision) return failure('This save changed. Reload the profile before editing.', 409);
      const profile = cloudProfile(body.profile, body.id);
      const name = profile.name;
      const taken = this.one('SELECT owner FROM handles WHERE handle=?', name.toLowerCase());
      if (taken && taken.owner !== body.id) return failure('That handle is taken.', 409);
      if (/^bot-/i.test(name)) return failure('That handle is reserved.');
      if (this.env?.LEADERBOARD) {
        const response = await this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global')).fetch('https://internal/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: body.id, name, wins: profile.wins }) });
        if (!response.ok) return failure('Could not update wins.');
        profile.winsRevision = (await response.json()).revision;
        // The leaderboard call yielded; protect against a newer client save.
        const current = this.one('SELECT revision FROM accounts WHERE username=?', account.username);
        if (current.revision !== account.revision) return failure('This save changed. Reload the profile before editing.', 409);
        const reserved = this.one('SELECT owner FROM handles WHERE handle=?', name.toLowerCase());
        if (reserved && reserved.owner !== body.id) return failure('That handle is taken.', 409);
      }
      this.sql.exec('UPDATE handles SET handle=?,name=?,revision=revision+1 WHERE owner=?', name.toLowerCase(), name, body.id);
      this.sql.exec('UPDATE accounts SET profile=?,revision=revision+1 WHERE username=?', JSON.stringify(profile), account.username);
      const result = { profile, revision: account.revision + 1, username: account.username, createdAt: account.created_at };
      await this.notifyHandle(this.one('SELECT * FROM handles WHERE owner=?', body.id));
      if (this.env?.ROOMS) {
        await Promise.all([...this.sql.exec('SELECT room FROM handle_rooms WHERE owner=?', body.id)].map(({ room }) =>
          this.env.ROOMS.get(this.env.ROOMS.idFromName(room)).fetch('https://internal/admin-edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'profile', data: { id: body.id, ...result } }) })));
      }
      return json(result);
    }

    if(url.pathname.startsWith('/api/handle/'))return this.handleRequest(request,url.pathname.replace('/api/handle',''),readBody);
    const path = url.pathname.replace('/api/account', '');
    if (request.method === 'POST' && (path === '/register' || path === '/login' || path === '/reset')) {
      const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'local-development');
      if (!this.rate(`ip:${ipHash}`, 30, 15 * 60000)) return failure('Too many attempts. Try again in 15 minutes.', 429);
      const body = await readBody(request);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return failure('Use 3–20 letters, numbers or underscores for your username.');
      if (typeof body.password !== 'string' || body.password.length < 5 || body.password.length > 128) return failure('Use a password between 5 and 128 characters.');
      if (!this.rate(`user:${await digest(username)}`, 12, 15 * 60000)) return failure('Too many attempts for this account. Try again in 15 minutes.', 429);
      let account = this.one('SELECT * FROM accounts WHERE username=?', username);
      let recoveryCode = null;
      if (path === '/register') {
        if (!this.rate(`signup:${ipHash}`, 6, 60 * 60000)) return failure('Too many new accounts. Try again later.', 429);
        if (account) return failure('That username is unavailable.', 409);
        const profile = restrictSecretBacks(cloudProfile(body.profile));
        const salt = random(16);
        const hash = await passwordHash(body.password, salt);
        recoveryCode = random(20);
        const recoveryHash = await digest(recoveryCode);
        // Adopt the verified guest handle, or atomically reserve a new one.
        if(this.one('SELECT username FROM accounts WHERE username=?',username))return failure('That login ID is unavailable.',409);
        if(!(await this.registerHandle(profile,username,body.handleToken)))return failure('That handle is taken or belongs to another player.',409);
        // Unique key protects against two registrations racing across the password await.
        this.sql.exec('INSERT OR IGNORE INTO accounts (username,salt,password_hash,profile,revision,created_at,recovery_hash) VALUES (?,?,?,?,1,?,?)', username, salt, hash, JSON.stringify(profile), Date.now(), recoveryHash);
        account = this.one('SELECT * FROM accounts WHERE username=?', username);
        if (account.salt !== salt) return failure('That username is unavailable.', 409);
      } else if (path === '/reset') {
        const code = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim().toLowerCase() : '';
        const candidate = await digest(code);
        if (!account?.recovery_hash || !equal(candidate, account.recovery_hash)) return failure('Username or recovery code is incorrect.', 401);
        const salt = random(16);
        const hash = await passwordHash(body.password, salt);
        recoveryCode = random(20);
        const recoveryHash = await digest(recoveryCode);
        this.sql.exec('UPDATE accounts SET salt=?,password_hash=?,recovery_hash=? WHERE username=? AND recovery_hash=?', salt, hash, recoveryHash, username, candidate);
        account = this.one('SELECT * FROM accounts WHERE username=?', username);
        if (account.salt !== salt) return failure('That recovery code has already been used.', 401);
        this.sql.exec('DELETE FROM sessions WHERE username=?', username);
      } else {
        const hash = await passwordHash(body.password, account?.salt || '00000000000000000000000000000000');
        if (!account || !equal(hash, account.password_hash)) return failure('Username or password is incorrect.', 401);
      }
      const token = random(32), tokenHash = await digest(token);
      this.sql.exec('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
      this.sql.exec('DELETE FROM sessions WHERE username=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE username=? ORDER BY expires_at DESC LIMIT 9)', username, username);
      this.sql.exec('INSERT INTO sessions (token_hash,username,expires_at) VALUES (?,?,?)', tokenHash, username, Date.now() + SESSION_MS);
      return json({ username, token, revision: account.revision, createdAt: account.created_at, profile: JSON.parse(account.profile), ...(recoveryCode ? { recoveryCode } : {}) });
    }
    const session = await this.session(request);
    if (!session) return failure('Please log in again. Your local progress is still safe.', 401);
    if (path === '/verify' && request.method === 'GET') {
      const account = this.one('SELECT profile,created_at FROM accounts WHERE username=?', session.username);
      return json({ id: JSON.parse(account.profile).id, createdAt: account.created_at, secretBacks:JSON.parse(account.profile).ownedBacks.filter(id=>SECRET_BACK_IDS.has(id)) });
    }
    if (path === '/logout' && request.method === 'POST') {
      this.sql.exec('DELETE FROM sessions WHERE token_hash=?', session.tokenHash);
      return json({ ok: true });
    }
    if (path === '/recovery' && request.method === 'POST') {
      if (!this.rate(`recovery:${session.username}`, 3, 60 * 60000)) return failure('Too many recovery codes requested. Try again later.', 429);
      const recoveryCode = random(20);
      this.sql.exec('UPDATE accounts SET recovery_hash=? WHERE username=?', await digest(recoveryCode), session.username);
      return json({ recoveryCode });
    }
    if (path === '/me' && request.method === 'GET') {
      const account = this.one('SELECT profile,revision,created_at FROM accounts WHERE username=?', session.username);
      return json({ username: session.username, profile: JSON.parse(account.profile), revision: account.revision, createdAt: account.created_at });
    }
    if (path === '/profile' && request.method === 'PUT') {
      if (!this.rate(`save:${session.username}`, 120, 60000)) return failure('Saving too quickly. Please wait a minute.', 429);
      const body = await readBody(request);
      const account = this.one('SELECT profile,revision FROM accounts WHERE username=?', session.username);
      if (!Number.isSafeInteger(body.revision) || body.revision !== account.revision) return failure('Another device has a newer save. Load that cloud save or log out to keep playing locally.', 409);
      const profile = restrictSecretBacks(cloudProfile(body.profile, JSON.parse(account.profile).id), JSON.parse(account.profile).ownedBacks);
      profile.name=this.one('SELECT name FROM handles WHERE account=?',session.username).name;
      this.sql.exec('UPDATE accounts SET profile=?,revision=revision+1 WHERE username=? AND revision=?', JSON.stringify(profile), session.username, body.revision);
      return json({ revision: account.revision + 1 });
    }
    return failure('Not found.', 404);
  }
}

Object.assign(Accounts.prototype,handleMethods);
