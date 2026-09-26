// Server-authoritative game logic for one room (docs/SPEC.md §3 and §4).
// Pure and transport-agnostic: no Cloudflare or Node APIs. Time, timers and randomness
// are injected so tests can drive a room with a fake clock, and a connection is any
// object with send(obj) / close(code, reason).
import {
  PROTOCOL_VERSION, MAX_PLAYERS, SEAT_COUNT, MAX_WORD_LENGTH, BASE_MISTAKES,
  COUNTDOWN_MS, CHOOSE_MS, ROUND_END_MS, MATCH_END_MS,
  RECONNECT_GRACE_MS, DEFAULT_SETTINGS, MODES, REWARDS, FLAIRS, EMOTES, HINT_PRICE, OBBY,
} from '../public/js/shared/constants.js';
import { PETS_BY_ID, CARDS_BY_ID, TABLE_IDS, CHAIR_IDS } from '../public/js/shared/catalog.js';
import { rules, TWISTS } from './modes.js';
import { adminToken, constantTimeEqual } from './auth.js';
import { filterText } from './blocklist.js';
import { botProfile, planPick, planTurn } from './bots.js';
import {
  sanitizeName, randomPlayerName, sanitizeLook, sanitizeChair, sanitizePet, sanitizeChat,
  sanitizeTyping, normalizeWord, displayWord, sanitizeMove, sanitizeSettings,
  sanitizeBack, sanitizeCapeColor, sanitizeTable, sanitizeLevel, sanitizeTier, sanitizeCards,
} from './sanitize.js';

const HARD_LETTERS = [...'jkqvwxyz'];
const CHAIN_LENGTH = 12; // accepted words kept in MatchState.chain
const MOVES_INTERVAL_MS = 100; // `moves` batching, ~10 Hz
const MAX_MESSAGE_LENGTH = 2048;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLOSE_REPLACED = 4000; // the same player id connected from another socket
const CLOSE_REJECTED = 1008; // after error room_full / bad_hello
const ACTIVE_PHASES = new Set(['choosing', 'typing', 'roundEnd', 'roulette', 'rouletteReveal']);

// Token buckets per player and message kind: [tokens refilled per second, burst].
const RATE_LIMITS = {
  move: [15, 15],
  typing: [20, 20],
  submit: [5, 5],
  chat: [1000 / 600, 3],
  seat: [4, 6],
  loadout: [2, 5],
  bet: [2, 4], roulette: [3, 4],
  host: [5, 10],
  ping: [2, 4],
  emote: [1, 1], hint: [2, 3], card: [2, 3], mod: [2, 4], admin: [5, 12], obby: [1, 2], pick: [3, 3],
};

const pickRandom = (list, random) => list[Math.floor(random() * list.length)];
const systemChat = (text) => ({ t: 'chat', id: null, name: 'System', text });

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function newMatch() {
  return {
    phase: 'lobby',
    endsAt: null, // absolute time the phase ends (null = untimed)
    duration: null,
    settings: null, // room settings copied at match start
    participants: [], // turn order: { id, hearts, maxHearts, alive, words, shield, ability }
    chooserId: null,
    options: null,
    typerId: null,
    prefix: null,
    mistakes: 0,
    maxMistakes: BASE_MISTAKES,
    chain: [],
    wordCount: 0,
    round: 0,
    winnerId: null,
    used: new Set(),
    lastFailedId: null, // decides the next chooser
    turnId: 0, mode: 'classic', minLength: 3, prefixIndex: null, twist: null, startedAt: null,
    turnStartAt: null, firstKeyAt: null, paid: false, humans: 0,
  };
}

// Fields that only mean something during a choosing / typing phase.
const clearTurn = (m) =>
  Object.assign(m, { chooserId: null, options: null, typerId: null, prefix: null, mistakes: 0, maxMistakes: BASE_MISTAKES });

export class GameEngine {
  constructor({ code, dict, botDict, botDicts = {}, now, setTimeout, clearTimeout, random, adminCode = '', crypto = globalThis.crypto, onWin = () => {}, onListing = () => {}, onRemoveLeaderboard = () => {}, onGlobalAnnouncement = () => {}, onError = (err) => console.error('[engine]', err) }) {
    this.code = code;
    this.dict = dict;
    this.botDict = botDict;
    this.botDicts = botDicts;
    this.adminCode = adminCode;
    this.crypto = crypto;
    this.onWin = onWin;
    this.onListing = onListing;
    this.onRemoveLeaderboard = onRemoveLeaderboard;
    this.onGlobalAnnouncement = onGlobalAnnouncement;
    this.unlockIps = new Map();
    this.bans = new Map();
    this.obbyRewards = new Map();
    this.rouletteReceipts = new Map();
    this.turnSerial = 0;
    this.matchSerial = 0;
    this.now = now;
    this.random = random;
    this.onError = onError;
    // Timer callbacks run through guard() so a bug can never escape into the runtime.
    this.schedule = (fn, ms) => setTimeout(() => this.guard(fn), ms);
    this.cancel = (handle) => clearTimeout(handle);
    this.conns = new WeakMap(); // connection -> player id (null once rejected or replaced)
    this.botSerial = 0; // for unique bot ids
    this.botPlan = 0; // bumped to cancel the running bot plan
    this.init();
  }

  init() {
    this.players = new Map(); // id -> player, in join order
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.match = newMatch();
    this.phaseTimer = null;
    this.movesTimer = null;
    this.botTimer = null;
    this.tableOverride = null;
    this.pendingPresetBotReset = false;
    this.rouletteEntry = 0;
  }

  // ---- Transport entry points (never throw) -------------------------------------------

  /** A text frame arrived on `conn`. */
  receive(conn, data) {
    this.guard(() => {
      if (typeof data !== 'string' || data.length > MAX_MESSAGE_LENGTH) return;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return;
      if (!this.conns.has(conn)) return this.hello(conn, msg);
      const player = this.players.get(this.conns.get(conn));
      if (player?.conn === conn) return this.dispatch(player, msg);
    });
  }

  /** `conn` closed or errored. The player keeps their place for RECONNECT_GRACE_MS. */
  disconnect(conn) {
    this.guard(() => {
      const player = this.players.get(this.conns.get(conn));
      this.conns.delete(conn);
      if (player?.conn !== conn) return; // never joined, rejected, or replaced by a newer socket
      player.conn = null;
      player.connected = false;
      player.graceTimer = this.schedule(() => this.removePlayer(player.id), RECONNECT_GRACE_MS);
      this.broadcastPlayer(player);
      this.reportListing();
    });
  }

  guard(fn) {
    try {
      const result = fn();
      if (result?.catch) result.catch(this.onError);
    } catch (err) {
      this.onError(err);
    }
  }

  // ---- Joining & leaving --------------------------------------------------------------

  hello(conn, msg) {
    const { id } = msg;
    if (msg.t !== 'hello' || msg.v !== PROTOCOL_VERSION || typeof id !== 'string' || !ID_RE.test(id) || id.startsWith('bot-')) {
      const outdated = msg.t === 'hello' && msg.v !== PROTOCOL_VERSION;
      return this.reject(conn, 'bad_hello', outdated ? 'The game was updated. Please refresh the page.' : 'Invalid hello.');
    }
    if (this.bans.has(id) || [...this.bans.values()].some(ip => ip && ip === conn.ipHash)) {
      this.sendTo(conn, { t: 'error', code: 'banned', message: 'You are banned from this room.' });
      return this.closeConn(conn, 4002, 'banned');
    }
    // Token verification is asynchronous; reserve this socket against parallel hello attempts.
    if (msg.adminToken && this.adminCode && !msg._verified) {
      this.conns.set(conn, null);
      return adminToken(this.adminCode, id, this.crypto).then(token => {
        if (!this.conns.has(conn)) return; // socket closed while its token was being checked
        this.conns.delete(conn);
        this.hello(conn, { ...msg, adminToken: null, _verified: constantTimeEqual(token, msg.adminToken), _internal: this });
      });
    }
    const verified = msg._internal === this && msg._verified === true;
    const loadout = {
      name: sanitizeName(msg.name) || randomPlayerName(this.random),
      look: sanitizeLook(msg.look),
      chair: sanitizeChair(msg.chair),
      pet: sanitizePet(msg.pet),
      back: sanitizeBack(msg.back), capeColor: sanitizeCapeColor(msg.capeColor), table: sanitizeTable(msg.table), level: sanitizeLevel(msg.level), petTier: sanitizeTier(msg.petTier),
    };
    let player = this.players.get(id);
    const isNew = !player;
    if (player) {
      // Resume after a reconnect, or take over from another tab (whose socket is closed).
      if (player.conn) this.closeConn(player.conn, CLOSE_REPLACED, 'replaced');
      this.cancel(player.graceTimer);
      Object.assign(player, loadout, { conn, connected: true, graceTimer: null, isAdmin: verified, ipHash: conn.ipHash });
      if (!ACTIVE_PHASES.has(this.match.phase)) player.cards = sanitizeCards(msg.cards);
    } else {
      if (this.players.size >= MAX_PLAYERS && !this.evictBot()) return this.reject(conn, 'room_full', 'This room is full.');
      player = this.addPlayer({ id, isBot: false, conn, ...loadout });
      player.requests = new Map(this.rouletteReceipts.get(id) || []);
      this.rouletteReceipts.delete(id);
      player.cards = sanitizeCards(msg.cards);
      player.isAdmin = verified;
      if (this.players.size === 1 && msg.public === true) this.settings.public = true;
      this.hostId ??= id;
    }
    this.conns.set(conn, id);
    this.send(player, {
      t: 'welcome',
      you: id,
      code: this.code,
      hostId: this.hostId,
      settings: { ...this.settings },
      table: this.roomTable(), public: this.settings.public, isAdmin: player.isAdmin,
      players: [...this.players.values()].map((p) => this.view(p)),
      match: this.matchView(),
      rouletteEntry: this.rouletteEntry,
    });
    this.broadcast({ t: 'player', p: this.view(player) }, id);
    for (const receipt of player.requests.values()) if (['betResult', 'stakeRefund', 'rouletteReward'].includes(receipt.t)) this.send(player, receipt);
    if (isNew) this.broadcast(systemChat(`${player.name} joined the game`));
    this.reportListing();
  }

  reject(conn, code, message) {
    this.sendTo(conn, { t: 'error', code, message });
    this.closeConn(conn, CLOSE_REJECTED, code);
  }

  closeConn(conn, code, reason) {
    this.conns.set(conn, null); // ignore anything else it sends
    try {
      conn.close(code, reason);
    } catch {
      // already closed
    }
  }

  addPlayer({ id, isBot, conn, name, look, chair, pet, back = 'none', capeColor = null, table = 'classic', level = 1, petTier = 1 }) {
    const player = {
      id, name, isBot, look, chair, pet,
      back, capeColor, table, level, petTier, rouletteBet: null, isAdmin: false, adminTag: false, ipHash: conn?.ipHash,
      cards: {}, requests: new Map(), obbyStartAt: null,
      seat: -1, wins: 0, pos: null,
      conn, connected: true, graceTimer: null,
      moved: false, // has a position not yet sent in `moves`
      buckets: {}, // rate limiter state
    };
    this.players.set(id, player);
    return player;
  }

  // Makes room for a joining human by removing a bot that is not playing a match right now.
  evictBot() {
    const active = ACTIVE_PHASES.has(this.match.phase);
    const bot = [...this.players.values()].reverse().find((p) => p.isBot && !(active && this.participant(p.id)));
    if (bot) this.removePlayer(bot.id);
    return Boolean(bot);
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.refundStake(player);
    this.cancel(player.graceTimer);
    this.fail(id, 'left'); // knocked out if still playing
    if (!player.isBot) {
      const receipts = [...player.requests].filter(([,value]) => ['betResult', 'stakeRefund', 'rouletteReward'].includes(value.t));
      if (receipts.length) this.rouletteReceipts.set(id, receipts.slice(-100));
      if (this.rouletteReceipts.size > 64) this.rouletteReceipts.delete(this.rouletteReceipts.keys().next().value);
    }
    this.players.delete(id);
    this.reportListing();
    this.broadcast({ t: 'leave', id });
    this.broadcast(systemChat(`${player.name} left the game`));
    if (![...this.players.values()].some((p) => !p.isBot)) return this.resetRoom();
    if (id === this.hostId) {
      // Host passes to the next human by join order, preferring one who is connected.
      const humans = [...this.players.values()].filter((p) => !p.isBot);
      this.hostId = (humans.find((p) => p.connected) ?? humans[0]).id;
      this.broadcastRoom();
    }
    this.syncCountdown();
  }

  // No humans left: drop the bots, stop every timer, start from scratch.
  resetRoom() {
    this.cancel(this.phaseTimer);
    this.cancel(this.movesTimer);
    this.stopBot();
    this.init();
    this.reportListing();
  }

  // ---- Client messages ----------------------------------------------------------------

  dispatch(player, msg) {
    switch (msg.t) {
      case 'move': return this.onMove(player, msg);
      case 'sit': return this.onSit(player, msg.seat);
      case 'stand': return this.onStand(player);
      case 'pick': return this.onPick(player, msg.letter);
      case 'typing': return this.onTyping(player, msg.text);
      case 'submit': return this.allow(player, 'submit') && this.submitWord(player, msg.word);
      case 'chat': return this.onChat(player, msg.text);
      case 'loadout': return this.onLoadout(player, msg);
      case 'host': return this.onHost(player, msg);
      case 'ping': return this.onPing(player, msg.c);
      case 'hint': return this.onHint(player, msg);
      case 'useCard': return this.onCard(player, msg);
      case 'emote': return this.onEmote(player, msg.name);
      case 'celebrate': return this.onCelebrate(player, msg);
      case 'unlock': return this.onUnlock(player, msg.code);
      case 'mod': return this.onMod(player, msg);
      case 'admin': return this.onAdmin(player, msg);
      case 'obby': return this.onObby(player, msg);
      case 'bet': return this.onBet(player, msg);
      case 'roulette': return this.onRoulette(player, msg);
      default: // unknown types (and repeated hellos) are ignored
    }
  }

  allow(player, kind) {
    const [rate, burst] = RATE_LIMITS[kind];
    const now = this.now();
    const bucket = (player.buckets[kind] ??= { tokens: burst, at: now });
    bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * rate);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  onMove(player, msg) {
    if (player.seat >= 0 || !this.allow(player, 'move')) return;
    const pos = sanitizeMove(msg);
    if (!pos) return;
    player.pos = pos;
    player.moved = true;
    this.movesTimer ??= this.schedule(() => this.flushMoves(), MOVES_INTERVAL_MS);
  }

  flushMoves() {
    this.movesTimer = null;
    const moved = [];
    for (const p of this.players.values()) {
      if (!p.moved) continue;
      p.moved = false;
      moved.push({ id: p.id, ...p.pos });
    }
    for (const p of this.players.values()) {
      const list = moved.filter((m) => m.id !== p.id);
      if (list.length) this.send(p, { t: 'moves', list });
    }
  }

  onSit(player, seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT || seat === player.seat) return;
    if (this.isPlaying(player.id) || !this.allow(player, 'seat')) return;
    if (this.seatOwner(seat)) return this.send(player, { t: 'error', code: 'seat_taken', message: 'That seat is taken.' });
    player.seat = seat;
    this.broadcastPlayer(player);
    this.syncCountdown();
  }

  onStand(player) {
    this.refundStake(player);
    if (player.seat < 0 || !this.allow(player, 'seat')) return;
    this.fail(player.id, 'forfeit'); // standing up mid-match knocks you out
    player.seat = -1;
    this.broadcastPlayer(player);
    this.syncCountdown();
  }

  onPick(player, letter) {
    const m = this.match;
    if (m.phase === 'choosing' && player.id === m.chooserId && m.options.includes(letter) && this.allow(player, 'pick')) this.pick(letter);
  }

  onTyping(player, text) {
    const m = this.match;
    if (m.phase === 'typing' && player.id === m.typerId && this.allow(player, 'typing')) {
      this.relayTyping(player, sanitizeTyping(text));
    }
  }

  relayTyping(player, text) {
    if (text && this.match.firstKeyAt === null && this.match.typerId === player.id) this.match.firstKeyAt = this.now();
    this.broadcast({ t: 'typing', id: player.id, text: filterText(text) }, player.id);
  }

  onChat(player, raw) {
    const text = sanitizeChat(raw);
    if (!text) return;
    if (!this.allow(player, 'chat')) {
      return this.send(player, { t: 'error', code: 'rate_limited', message: 'You are chatting too fast.' });
    }
    this.broadcast({ t: 'chat', id: player.id, name: player.name, text });
  }

  // Pet changes are cosmetic until the next match: abilities are locked in at match start.
  onLoadout(player, msg) {
    if (!this.allow(player, 'loadout')) return;
    if ('name' in msg) player.name = sanitizeName(msg.name) || player.name;
    if ('look' in msg) player.look = sanitizeLook(msg.look);
    if ('chair' in msg) player.chair = sanitizeChair(msg.chair);
    if ('pet' in msg) player.pet = sanitizePet(msg.pet);
    if ('petTier' in msg) player.petTier = sanitizeTier(msg.petTier);
    if ('back' in msg) player.back = sanitizeBack(msg.back);
    if ('capeColor' in msg) player.capeColor = sanitizeCapeColor(msg.capeColor);
    if ('table' in msg) { player.table = sanitizeTable(msg.table); if (player.id === this.hostId) this.tableOverride = null; }
    if ('level' in msg) player.level = sanitizeLevel(msg.level);
    if ('cards' in msg && !ACTIVE_PHASES.has(this.match.phase)) player.cards = sanitizeCards(msg.cards);
    this.broadcastPlayer(player);
    if (player.id === this.hostId && 'table' in msg) this.broadcastRoom();
  }

  onHost(player, msg) {
    if (player.id !== this.hostId && !player.isAdmin) {
      return this.send(player, { t: 'error', code: 'not_host', message: 'Only the host can do that.' });
    }
    if (!this.allow(player, 'host')) return;
    switch (msg.action) {
      case 'start': return this.hostStart();
      case 'addBot': return this.addBot(player);
      case 'removeBot': return this.removeBot();
      case 'settings': return this.changeSettings(msg.settings);
      default:
    }
  }

  onPing(player, c) {
    if (!this.allow(player, 'ping')) return;
    const echo = Number.isFinite(c) || (typeof c === 'string' && c.length <= 64) ? c : null;
    this.send(player, { t: 'pong', c: echo, s: this.now() });
  }

  // Requests are scoped by type + id; successful consumption can never replay twice.
  request(player, kind, msg, run) {
    if (typeof msg.requestId !== 'string' || !ID_RE.test(msg.requestId)) return;
    const key = `${kind}:${msg.requestId}`;
    if (player.requests.has(key)) return this.send(player, player.requests.get(key));
    if (!this.allow(player, kind === 'hint' ? 'hint' : kind === 'bet' ? 'bet' : 'card')) return;
    const result = run();
    this.remember(player, key, result);
    this.send(player, result);
  }

  remember(player, key, result) {
    player.requests.set(key, result);
    while (player.requests.size > 128) player.requests.delete(player.requests.keys().next().value);
  }

  onHint(player, msg) {
    this.request(player, 'hint', msg, () => {
      const answer = { t: 'hint', ok: false, turnId: msg.turnId, requestId: msg.requestId };
      const m = this.match;
      if (m.phase !== 'typing' || m.typerId !== player.id || msg.turnId !== m.turnId || this.now() >= m.endsAt) return { ...answer, reason: 'turn_ended' };
      const p = this.participant(player.id);
      if (p.hintedTurn === m.turnId) return { ...answer, reason: 'already_bought' };
      if (!Number.isFinite(msg.balance) || msg.balance < HINT_PRICE) return { ...answer, reason: 'insufficient_funds' };
      const word = this.dict.randomWithPrefix(m.prefix, m.used, this.random, { minLen: m.minLength, maxLen: MAX_WORD_LENGTH });
      if (!word) return { ...answer, reason: 'no_answer' };
      p.hintedTurn = m.turnId;
      return { ...answer, ok: true, word, cost: HINT_PRICE };
    });
  }

  onCard(player, msg) {
    this.request(player, 'card', msg, () => {
      const answer = { t: 'cardResult', ok: false, turnId: msg.turnId, requestId: msg.requestId, cardId: msg.cardId, targetId: msg.targetId };
      const m = this.match;
      if (m.phase !== 'typing' || m.typerId !== player.id || msg.turnId !== m.turnId || this.now() >= m.endsAt) return { ...answer, reason: 'not_your_turn' };
      const actor = this.participant(player.id);
      const target = this.participant(msg.targetId);
      const card = Object.hasOwn(CARDS_BY_ID, msg.cardId) ? CARDS_BY_ID[msg.cardId] : null;
      if (!card || !target?.alive || (target.id === player.id && card.effect !== 'skip')) return { ...answer, reason: 'invalid_target' };
      if (actor.cardTurn === m.turnId) return { ...answer, reason: 'one_per_turn' };
      if (!(player.cards[card.id] > 0)) return { ...answer, reason: 'not_owned' };
      actor.cardTurn = m.turnId;
      player.cards[card.id]--;
      if (card.effect === 'skip') target.pending.skip = true;
      if (card.effect === 'time') target.pending.time += card.value;
      if (card.effect === 'mistakes') target.pending.mistakes += card.value;
      this.broadcast({ t: 'cardUsed', actorId: player.id, targetId: target.id, cardId: card.id, effect: card.effect });
      if (card.effect === 'heart') this.fail(target.id, 'card');
      else this.broadcastMatch();
      return { ...answer, ok: true };
    });
  }

  onEmote(player, name) {
    if (!EMOTES.includes(name) || !this.allow(player, 'emote')) return;
    if (player.seat >= 0 && name.startsWith('dance')) return;
    this.broadcast({ t: 'emote', id: player.id, name }, player.id);
  }

  // Cosmetic events are approved and relayed by the room; clients cannot impersonate another player.
  onCelebrate(player, msg) {
    if (!['portal', 'hatch'].includes(msg.kind) || this.isPlaying(player.id) || !this.allow(player, 'emote')) return;
    if (msg.kind === 'portal' && (player.seat >= 0 || !['island', 'obby'].includes(msg.to))) return;
    this.broadcast({ t: 'celebrate', id: player.id, kind: msg.kind, ...(msg.kind === 'portal' ? { to: msg.to } : {}) });
  }

  async onUnlock(player, code) {
    if (!this.adminCode || typeof code !== 'string' || code.length > 256) return this.send(player, { t: 'unlock', ok: false });
    const conn = player.conn;
    const now = this.now();
    const window = (old) => old && now - old.at < 600000 ? old : { at: now, count: 0 };
    conn.unlockWindow = window(conn.unlockWindow);
    const ip = player.ipHash || player.id;
    const attempts = window(this.unlockIps.get(ip));
    this.unlockIps.set(ip, attempts);
    // Periodically discard expired keys so the room does not retain every past visitor.
    for (const [key, state] of this.unlockIps) if (now - state.at >= 600000) this.unlockIps.delete(key);
    if (conn.unlockWindow.count >= 5 || attempts.count >= 5) return this.send(player, { t: 'unlock', ok: false });
    conn.unlockWindow.count++;
    attempts.count++;
    if (!constantTimeEqual(code.trim().toLowerCase(), this.adminCode.trim().toLowerCase())) return this.send(player, { t: 'unlock', ok: false });
    const token = await adminToken(this.adminCode, player.id, this.crypto);
    if (player.conn !== conn) return;
    player.isAdmin = true;
    this.send(player, { t: 'unlock', ok: true, token });
  }

  onMod(player, msg) {
    if (!this.allow(player, 'mod')) return;
    if (player.id !== this.hostId && !player.isAdmin) return this.denied(player);
    const target = this.players.get(msg.id);
    if (msg.action === 'unban') { this.bans.delete(msg.id); return; }
    if (!target || target.id === player.id || (!player.isAdmin && target.isAdmin)) return this.denied(player);
    if (!['kick', 'ban'].includes(msg.action)) return;
    if (msg.action === 'ban') this.bans.set(target.id, target.ipHash);
    this.send(target, { t: 'kicked', reason: msg.action === 'ban' ? 'You were banned by the room owner.' : 'You were kicked by the room owner.' });
    if (target.conn) this.closeConn(target.conn, msg.action === 'ban' ? 4002 : 4001, msg.action);
    this.removePlayer(target.id);
  }

  denied(player) { this.send(player, { t: 'error', code: 'not_allowed', message: 'You cannot do that.' }); }

  onAdmin(player, msg) {
    if (!this.allow(player, 'admin')) return;
    if (!player.isAdmin) return this.denied(player);
    switch (msg.action) {
      case 'takeHost': this.hostId = player.id; this.tableOverride = null; this.broadcastRoom(); break;
      case 'forceStart': this.hostStart(); break;
      case 'endMatch': if (ACTIVE_PHASES.has(this.match.phase)) this.endMatch(null); break;
      case 'reset':
        if (this.match.mode === 'roulette' && ACTIVE_PHASES.has(this.match.phase)) this.endRoulette(null);
        for (const player of this.players.values()) this.refundStake(player);
        this.cancel(this.phaseTimer); this.stopBot();
        for (const p of this.players.values()) { p.seat = -1; this.broadcastPlayer(p); }
        this.settings = { ...DEFAULT_SETTINGS }; this.tableOverride = null;
        this.enterLobby(); this.broadcastRoom(); this.broadcastMatch(); this.reportListing(); break;
      case 'announce': {
        const text = sanitizeChat(msg.text);
        if (text) {
          if (msg.global === true) this.onGlobalAnnouncement({ text, name: player.name });
          else this.broadcast({ t: 'announce', text });
        }
        break;
      }
      case 'coins': {
        const target = this.players.get(msg.id);
        if (target && !target.isBot && ['set', 'add'].includes(msg.operation) && Number.isSafeInteger(msg.amount)
          && msg.amount >= (msg.operation === 'set' ? 0 : -1000000000) && msg.amount <= 1000000000) {
          this.send(target, { t: 'coinAdjust', operation: msg.operation, amount: msg.amount, receipt: globalThis.crypto.randomUUID() });
        }
        break;
      }
      case 'sellChair': {
        const target = this.players.get(msg.id);
        if (target && !target.isBot && typeof msg.chairId === 'string' && CHAIR_IDS.has(msg.chairId) && msg.chairId !== 'wooden') {
          this.send(target, { t: 'sellChair', chairId: msg.chairId, receipt: globalThis.crypto.randomUUID() });
        }
        break;
      }
      case 'freeMerge': {
        if (typeof msg.petId === 'string' && Object.hasOwn(PETS_BY_ID, msg.petId) && Number.isInteger(msg.tier) && msg.tier >= 1 && msg.tier < 3) {
          this.send(player, { t: 'petMergeGrant', petId: msg.petId, tier: msg.tier + 1, receipt: globalThis.crypto.randomUUID() });
        }
        break;
      }
      case 'grant': {
        const target = this.players.get(msg.id);
        if (target && !target.isBot && Number.isInteger(msg.coins) && msg.coins > 0 && msg.coins <= 100000) this.send(target, { t: 'grant', coins: msg.coins, reason: 'admin' });
        break;
      }
      case 'removeLeaderboard': if (typeof msg.id === 'string' && ID_RE.test(msg.id)) this.onRemoveLeaderboard(msg.id); break;
      case 'tag': if (typeof msg.on === 'boolean') { player.adminTag = msg.on; this.broadcastPlayer(player); } break;
      case 'table': if (TABLE_IDS.has(msg.table)) { this.tableOverride = msg.table; this.broadcastRoom(); } break;
      default:
    }
  }

  onObby(player, msg) {
    if (!this.allow(player, 'obby') || player.seat >= 0) return;
    if (msg.event === 'start') { player.obbyStartAt ??= this.now(); return; }
    if (msg.event !== 'finish' || player.obbyStartAt === null) return;
    const elapsed = this.now() - player.obbyStartAt;
    if (elapsed < OBBY.minFinishMs || !Number.isFinite(msg.ms) || msg.ms < OBBY.minFinishMs || msg.ms > elapsed + 2000) return;
    if (this.now() - (this.obbyRewards.get(player.id) ?? -Infinity) < OBBY.cooldownMs) return;
    // Position plus server elapsed time prevents an instant finish message from granting coins.
    if (!player.pos || Math.hypot(player.pos.x - OBBY.finish.x, player.pos.z - OBBY.finish.z) > 15 || Math.abs(player.pos.y - OBBY.finish.y) > 10) return;
    this.obbyRewards.set(player.id, this.now());
    player.obbyStartAt = null;
    this.send(player, { t: 'grant', coins: OBBY.reward, reason: 'obby', ms: elapsed });
    this.broadcast(systemChat(`${player.name} beat the obby in ${Math.round(elapsed / 1000)}s!`));
  }

  roomTable() { return this.settings.mode === 'roulette' || (this.match.mode === 'roulette' && ACTIVE_PHASES.has(this.match.phase)) ? 'poker' : this.tableOverride ?? this.players.get(this.hostId)?.table ?? 'classic'; }
  reportListing() { this.onListing({ code: this.code, humans: [...this.players.values()].filter(p => !p.isBot && p.connected).length, public: this.settings.public }); }

  // ---- Host actions -------------------------------------------------------------------

  hostStart() {
    const { phase } = this.match;
    if ((phase === 'lobby' || phase === 'countdown') && this.readyPlayers().length >= 2) this.startMatch();
  }

  addBot(host) {
    const seat = this.freeSeat();
    if (this.players.size >= MAX_PLAYERS || seat < 0) return this.send(host, systemChat('The room is full.'));
    const names = new Set([...this.players.values()].map((p) => p.name));
    const id = `bot-${(++this.botSerial).toString(36).padStart(4, '0')}`;
    const bot = this.addPlayer({ id, isBot: true, conn: null, ...botProfile(this.random, names) });
    bot.seat = seat;
    this.broadcastPlayer(bot);
    this.broadcast(systemChat(`${bot.name} joined the game`));
    this.syncCountdown();
  }

  // Prefers a bot that is not playing right now; otherwise the newest bot (it is knocked out).
  removeBot() {
    const bots = [...this.players.values()].filter((p) => p.isBot).reverse();
    const bot = bots.find((b) => !this.isPlaying(b.id)) ?? bots[0];
    if (bot) this.removePlayer(bot.id);
  }

  // Settings apply from the next match.
  changeSettings(input) {
    if (Number.isSafeInteger(input?.rouletteEntry) && [0, 25, 100, 500].includes(input.rouletteEntry) && !ACTIVE_PHASES.has(this.match.phase)) {
      for (const player of this.players.values()) this.refundStake(player);
      this.rouletteEntry = input.rouletteEntry;
      this.broadcastRoom();
    }
    const next = sanitizeSettings(input, this.settings);
    if (next.mode !== this.settings.mode) for (const player of this.players.values()) this.refundStake(player);
    const preset = input?.mode && input.mode !== 'custom' && MODES.some(mode => mode.id === input.mode);
    if (preset) {
      this.tableOverride = 'classic';
      if (ACTIVE_PHASES.has(this.match.phase) || this.match.phase === 'ended') this.pendingPresetBotReset = true;
      else for (const bot of [...this.players.values()].filter(player => player.isBot)) this.removePlayer(bot.id);
    }
    if (Object.keys(next).every((k) => next[k] === this.settings[k])) {
      this.syncCountdown();
      if (preset) this.broadcastRoom();
      return;
    }
    this.settings = next;
    this.syncCountdown();
    this.broadcastRoom();
    this.reportListing();
  }

  // ---- Match flow ---------------------------------------------------------------------

  setPhase(phase, duration = null, onEnd = null) {
    const m = this.match;
    this.cancel(this.phaseTimer);
    this.stopBot();
    m.phase = phase;
    m.duration = duration;
    m.endsAt = duration === null ? null : this.now() + duration;
    this.phaseTimer = onEnd ? this.schedule(onEnd, duration) : null;
  }

  // Outside matches the phase just follows the number of seated players.
  enterLobby() {
    if (this.pendingPresetBotReset) {
      this.pendingPresetBotReset = false;
      for (const bot of [...this.players.values()].filter(player => player.isBot)) {
        this.players.delete(bot.id);
        this.broadcast({ t: 'leave', id: bot.id });
      }
      this.reportListing();
    }
    this.match = newMatch();
    if (this.readyPlayers().length >= 2) this.setPhase('countdown', COUNTDOWN_MS, () => this.startMatch());
    else this.setPhase('lobby');
  }

  syncCountdown() {
    const { phase } = this.match;
    const ready = this.readyPlayers().length >= 2;
    if ((phase === 'lobby' && ready) || (phase === 'countdown' && !ready)) {
      this.enterLobby();
      this.broadcastMatch();
    }
  }

  startMatch() {
    const seated = this.readyPlayers();
    if (seated.length < 2) return;
    const settings = { ...this.settings };
    this.match = newMatch();
    this.match.settings = settings;
    this.match.mode = settings.mode;
    this.match.startedAt = this.now();
    this.match.matchId = `${this.code}-${this.now()}-${++this.matchSerial}`;
    this.match.humans = seated.filter(p => !p.isBot).length;
    this.match.participants = seated.map((p) => {
      const ability = (settings.petAbilities && PETS_BY_ID[p.pet]?.ability) || null;
      return {
        id: p.id,
        hearts: settings.hearts,
        maxHearts: settings.hearts,
        alive: true,
        words: 0,
        isBot: p.isBot, coins: 0, combo: 0, bestWpm: 0, bestCombo: 0, bonuses: [], lostHeart: false,
        pending: { skip: false, time: 0, mistakes: 0 }, hintedTurn: null, cardTurn: null,
        shield: ability?.type === 'shield', // unused shield
        ability, // locked in for the whole match
      };
    });
    if (settings.mode === 'roulette') return this.startRoulette(seated);
    this.startRound(pickRandom(this.match.participants, this.random).id);
  }

  startRound(chooserId) {
    const m = this.match;
    clearTurn(m);
    m.round++;
    m.twist = (m.settings.baseMode || m.mode) === 'chaos' ? pickRandom(TWISTS, this.random) : null;
    m.minLength = rules(m.settings.baseMode || m.mode, m).minLength(m.wordCount);
    m.chooserId = chooserId;
    m.options = this.letterOptions();
    this.setPhase('choosing', CHOOSE_MS, () => this.pick(pickRandom(m.options, this.random)));
    this.broadcastMatch();
    if (this.players.get(chooserId)?.isBot) {
      const { wait, letter } = planPick(m.options, this.random);
      this.runBot([{ wait, run: () => this.pick(letter) }]);
    }
  }

  // Three distinct letters: two weighted by how many words start with them, plus one hard letter.
  letterOptions() {
    const weights = this.dict.letterWeights();
    const options = [];
    while (options.length < 2) {
      const pool = Object.keys(weights).filter((l) => !options.includes(l));
      let r = this.random() * pool.reduce((sum, l) => sum + weights[l], 0);
      options.push(pool.find((l) => (r -= weights[l]) < 0) ?? pool[pool.length - 1]);
    }
    options.push(pickRandom(HARD_LETTERS.filter((l) => !options.includes(l)), this.random));
    return shuffle(options, this.random);
  }

  pick(letter) {
    const m = this.match;
    this.broadcast({ t: 'picked', id: m.chooserId, letter });
    const typerId = this.nextAlive(m.chooserId);
    clearTurn(m);
    m.prefix = letter;
    this.startTurn(typerId, 0);
  }

  startTurn(typerId, sabotageMs = 0, dragon = false) {
    const m = this.match;
    // A skip grants relief without losing a heart. Consume queued skips only once.
    for (let i = 0; i < m.participants.length && this.participant(typerId)?.pending.skip; i++) {
      this.participant(typerId).pending.skip = false;
      this.broadcast({ t: 'cardUsed', actorId: null, targetId: typerId, cardId: 'skip', effect: 'skipped' });
      typerId = this.nextAlive(typerId);
    }
    const participant = this.participant(typerId);
    if (!participant) return;
    const { ability } = participant;
    const modeRules = rules(m.settings.baseMode || m.mode, m);
    const bonus = (type) => (ability?.type === type ? ability.value : 0);
    const shrunk = modeRules.turnMs(m.wordCount);
    let turnMs = Math.max(modeRules.floor, shrunk + bonus('time') * 1000 - sabotageMs - participant.pending.time * 1000);
    if (dragon) turnMs = Math.min(turnMs, 3000);
    m.typerId = typerId;
    m.turnId = ++this.turnSerial;
    m.turnStartAt = this.now();
    m.firstKeyAt = null;
    m.minLength = modeRules.minLength(m.wordCount);
    m.mistakes = 0;
    m.maxMistakes = Math.max(1, modeRules.maxMistakes + (modeRules.maxMistakes === 1 ? 0 : bonus('mistakes')) - participant.pending.mistakes);
    participant.pending.time = participant.pending.mistakes = 0;
    this.setPhase('typing', turnMs, () => this.fail(typerId, 'timeout'));
    this.broadcastMatch();

    const typer = this.players.get(typerId);
    if (typer?.isBot) {
      const { dict, botDict, random } = this;
      const steps = planTurn({ prefix: m.prefix, used: m.used, turnMs, dict, botDict: this.botDicts[m.settings.botLevel] ?? botDict, random, level: m.settings.botLevel, minLength: m.minLength });
      this.runBot(steps.map((step) => ({
        wait: step.wait,
        run: () => ('submit' in step ? this.submitWord(typer, step.submit) : this.relayTyping(typer, step.typing)),
      })));
    }
  }

  submitWord(player, raw) {
    const m = this.match;
    if (m.phase !== 'typing' || player.id !== m.typerId || this.now() >= m.endsAt) return;
    const word = normalizeWord(raw);
    if (!word) return; // an empty submit is not a mistake

    const reason = this.rejectReason(word);
    if (reason) {
      this.participant(player.id).combo = 0;
      m.mistakes++;
      this.broadcast({ t: 'result', id: player.id, word: displayWord(word), ok: false, reason, mistakes: m.mistakes });
      if (m.mistakes >= m.maxMistakes) this.fail(player.id, 'mistakes');
      else this.broadcastMatch();
      return;
    }

    const participant = this.participant(player.id);
    const wpm = Math.min(250, Math.round((word.length / 5) * 60000 / Math.max(250, this.now() - (m.firstKeyAt ?? m.turnStartAt))));
    const fast = wpm >= 45 && this.now() - m.turnStartAt <= m.duration * .6;
    participant.combo = fast ? participant.combo + 1 : 0;
    participant.bestWpm = Math.max(participant.bestWpm, wpm);
    participant.bestCombo = Math.max(participant.bestCombo, participant.combo);
    const multiplier = participant.combo >= 8 ? 3 : participant.combo >= 5 ? 2 : participant.combo >= 3 ? 1.5 : 1;
    const coins = Math.round(REWARDS.perWord * multiplier) + Math.max(0, Math.min(10, Math.floor((wpm - 40) / 10)));
    participant.coins += coins;
    const flairs = [];
    const flair = (id, amount) => {
      const value = { id, ...FLAIRS[id], ...(amount === undefined ? {} : { coins: amount }) };
      flairs.push(value);
      if (value.coins) participant.bonuses.push({ label: value.label, coins: value.coins });
    };
    if (!m.wordCount) flair('first_word');
    const left = m.endsAt - this.now();
    if (left <= 150) flair('buzzer'); else if (left <= 500) flair('close_call');
    if (word.length >= 9) flair('huge_word', (word.length - 8) * 2);
    if ('jqxz'.includes(m.prefix[0])) flair('rare_letter');
    if (m.prefix.length === 2) flair('double_clear');
    if (wpm >= 90) flair('speed_demon');
    if ([3, 5, 8].includes(participant.combo)) flair(`combo_${participant.combo}`);
    participant.words++;
    m.used.add(word);
    m.chain.push({ id: player.id, word });
    if (m.chain.length > CHAIN_LENGTH) m.chain.shift();
    m.wordCount++;
    this.broadcast({ t: 'result', id: player.id, word, ok: true, wpm, combo: participant.combo, coins: coins + flairs.reduce((n, f) => n + f.coins, 0), flairs });
    m.prefix = this.nextPrefix(word);
    const { ability } = participant;
    this.startTurn(this.nextAlive(player.id), ability?.type === 'sabotage' ? ability.value * 1000 : 0, ability?.type === 'dragon' && this.random() < .5);
  }

  rejectReason(word) {
    const m = this.match;
    if (!/^[a-z]+$/.test(word)) return 'invalid_chars';
    if (word.length < m.minLength) return 'too_short';
    if (!word.startsWith(m.prefix)) return 'wrong_start';
    if (m.used.has(word)) return 'used';
    if (word.length > MAX_WORD_LENGTH || !this.dict.has(word)) return 'not_word';
    return null;
  }

  // Usually the last letter; sometimes (more often as the match goes on) the last two,
  // but only if enough unused words start with them.
  nextPrefix(word) {
    const m = this.match;
    const two = word.slice(-2);
    const modeRules = rules(m.settings.baseMode || m.mode, m);
    if (modeRules.randomLetter) {
      m.prefixIndex = Math.floor(this.random() * word.length);
      return word[m.prefixIndex];
    }
    m.prefixIndex = word.length - 1;
    return this.random() < modeRules.twoLetterChance(m.wordCount) && this.dict.countPrefix(two, m.used) >= modeRules.twoLetterMinimum ? two : word.slice(-1);
  }

  /** A participant failed (timeout / mistakes) or dropped out (forfeit / left). */
  fail(id, cause) {
    const m = this.match;
    const participant = this.participant(id);
    if (!ACTIVE_PHASES.has(m.phase) || !participant?.alive) return;
    if (m.mode === 'roulette') return this.rouletteOut(id);
    const endsRound = id === m.typerId || id === m.chooserId; // the round cannot go on without them

    let shielded = false;
    participant.combo = 0;
    if (cause === 'forfeit' || cause === 'left') {
      participant.hearts = 0;
    } else if (participant.shield) {
      participant.shield = false;
      shielded = true;
    } else {
      participant.hearts--;
    }
    if (!shielded) participant.lostHeart = true;
    this.broadcast({ t: 'fail', id, cause, hearts: participant.hearts, shielded });
    if (participant.hearts === 0) {
      participant.alive = false;
      participant.pending = { skip: false, time: 0, mistakes: 0 };
      this.broadcast({ t: 'elim', id });
    }

    const alive = m.participants.filter((p) => p.alive);
    if (alive.length <= 1) return this.endMatch(alive[0]?.id ?? null);
    if (endsRound) {
      m.lastFailedId = id;
      clearTurn(m);
      this.setPhase('roundEnd', ROUND_END_MS, () => this.startRound(this.nextChooser()));
    }
    this.broadcastMatch();
  }

  endMatch(winnerId) {
    const m = this.match;
    if (m.paid || !ACTIVE_PHASES.has(m.phase)) return;
    if (m.mode === 'roulette') return this.endRoulette(winnerId);
    m.paid = true;
    const durationMs = Math.max(0, this.now() - m.startedAt);
    const contributors = m.participants.filter(p => !p.isBot && p.words > 0).length;
    const eligibleMs = contributors >= 2 ? Math.min(durationMs, m.wordCount * 30000) : 0;
    const winBonus = Math.floor(Math.min(REWARDS.maxWin, eligibleMs / 60000 * REWARDS.winPerMinute));
    const flairs = [];
    const winnerParticipant = this.participant(winnerId);
    if (winnerParticipant) {
      if (!winnerParticipant.lostHeart) flairs.push({ id: 'flawless', ...FLAIRS.flawless });
      if (winnerParticipant.hearts === 1 && winnerParticipant.maxHearts >= 2) flairs.push({ id: 'comeback', ...FLAIRS.comeback });
      winnerParticipant.bonuses.push(...flairs.map(f => ({ label: f.label, coins: f.coins })));
    }
    clearTurn(m);
    m.winnerId = winnerId;
    this.setPhase('ended', MATCH_END_MS, () => {
      this.enterLobby(); // players stay seated, so the countdown restarts if 2+ remain
      this.broadcastMatch();
    });
    this.broadcast({ t: 'win', id: winnerId, flairs });
    const winner = this.players.get(winnerId);
    if (winner) {
      winner.wins++;
      this.broadcastPlayer(winner);
      if (!winner.isBot && m.humans >= 2) this.onWin({ playerId: winner.id, name: winner.name, humans: m.humans });
    }
    this.broadcast(systemChat(winner ? `${winner.name} won the match!` : 'Nobody won this match.'));
    for (const part of m.participants) {
      const { id, words, bestWpm, bestCombo } = part;
      part.pending = { skip: false, time: 0, mistakes: 0 };
      const player = this.players.get(id);
      if (!player || player.isBot) continue;
      const won = id === winnerId;
      const bonuses = [...part.bonuses, ...(won ? [{ label: 'Time played', coins: winBonus }] : [])];
      const coins = REWARDS.participation + part.coins + bonuses.reduce((n, b) => n + b.coins, 0);
      this.send(player, { t: 'reward', matchId: m.matchId, coins, won, words, durationMs, eligibleMs, bestWpm, bestCombo, bonuses });
    }
    this.broadcastMatch();
  }

  // ---- Cursed cup: server-owned hidden draw, turns, stakes and payout -----------------

  onBet(player, msg) {
    this.request(player, 'bet', msg, () => {
      const result = { t: 'betResult', requestId: msg.requestId, ok: false };
      if (this.settings.mode !== 'roulette' || !['lobby', 'countdown'].includes(this.match.phase) || player.seat < 0) return { ...result, error: 'Sit at the table between matches first.' };
      if (msg.amount !== this.rouletteEntry || !Number.isSafeInteger(msg.balance) || msg.balance < this.rouletteEntry) return { ...result, error: 'Your balance or the entry amount changed.' };
      if (player.rouletteBet) return { ...result, error: 'You already entered this match.' };
      const receipt = `${this.code}:${player.id}:${this.now()}:${++this.matchSerial}`;
      player.rouletteBet = { amount: this.rouletteEntry, receipt };
      this.broadcastPlayer(player);
      this.syncCountdown();
      return { ...result, ok: true, amount: this.rouletteEntry, receipt };
    });
  }

  refundStake(player) {
    if (!player?.rouletteBet) return;
    const { amount, receipt } = player.rouletteBet;
    player.rouletteBet = null;
    const msg = { t: 'stakeRefund', coins: amount, receipt: `refund:${receipt}` };
    this.remember(player, msg.receipt, msg);
    this.send(player, msg);
    this.broadcastPlayer(player);
  }

  startRoulette(seated) {
    const m = this.match;
    m.roulette = { pot: 0, remaining: 6, passed: new Set(), event: null, serial: 0 };
    m.stakes = {};
    for (const player of seated) {
      const amount = player.rouletteBet?.amount || 0;
      m.stakes[player.id] = amount;
      m.roulette.pot += amount;
      player.rouletteBet = null;
      this.broadcastPlayer(player);
    }
    for (const p of m.participants) { p.hearts = p.maxHearts = 1; p.shield = false; p.ability = null; }
    this.resetBottle();
    this.rouletteTurn(pickRandom(m.participants, this.random).id);
  }

  resetBottle() {
    this.match.poisonSip = 1 + Math.floor(this.random() * 6);
    this.match.sips = 0;
    this.match.roulette.remaining = 6;
    this.match.roulette.passed.clear();
    this.match.round++;
  }

  rouletteTurn(id) {
    const m = this.match;
    if (!this.participant(id)?.alive) id = m.participants.find(p => p.alive)?.id;
    m.typerId = id;
    m.turnId = ++this.turnSerial;
    this.setPhase('roulette', 10000, () => this.rouletteAction(id, 'drink'));
    this.broadcastMatch();
    if (this.players.get(id)?.isBot) this.runBot([{ wait: 1500 + this.random() * 2000, run: () => this.rouletteAction(id, this.random() < .35 && !m.roulette.passed.has(id) ? 'pass' : 'drink') }]);
  }

  onRoulette(player, msg) {
    if (!this.allow(player, 'roulette') || this.match.phase !== 'roulette' || this.match.typerId !== player.id || msg.turnId !== this.match.turnId) return;
    if (!['drink', 'pass'].includes(msg.action)) return;
    this.rouletteAction(player.id, msg.action);
  }

  rouletteAction(id, action) {
    const m = this.match;
    if (m.phase !== 'roulette' || m.typerId !== id || !this.participant(id)?.alive) return;
    const r = m.roulette;
    if (action === 'pass' && r.passed.has(id)) return;
    const next = this.nextAlive(id);
    if (action === 'pass') r.passed.add(id);
    const poisoned = action === 'drink' && ++m.sips === m.poisonSip;
    if (action === 'drink') r.remaining = 6 - m.sips;
    r.event = { id, action, poisoned, serial: ++r.serial, next };
    this.setPhase('rouletteReveal', poisoned ? 2600 : 1700, () => {
      if (poisoned) this.rouletteOut(id);
      else this.rouletteTurn(next);
    });
    this.broadcastMatch();
  }

  rouletteOut(id) {
    const m = this.match, part = this.participant(id);
    if (!part?.alive) return;
    part.alive = false; part.hearts = 0;
    this.broadcast({ t: 'rouletteOut', id });
    const alive = m.participants.filter(p => p.alive);
    if (alive.length <= 1) return this.endRoulette(alive[0]?.id || null);
    this.resetBottle();
    this.rouletteTurn(this.nextAlive(id));
  }

  endRoulette(winnerId) {
    const m = this.match;
    if (m.paid) return;
    m.paid = true; m.winnerId = winnerId;
    this.setPhase('ended', MATCH_END_MS, () => { this.enterLobby(); this.broadcastRoom(); this.broadcastMatch(); });
    this.broadcast({ t: 'win', id: winnerId, flairs: [] });
    for (const part of m.participants) {
      const player = this.players.get(part.id);
      if (!player || player.isBot) continue;
      const coins = winnerId ? (part.id === winnerId ? m.roulette.pot : 0) : m.stakes[part.id] || 0;
      const receipt = { t: 'rouletteReward', matchId: m.matchId, coins, won: part.id === winnerId, words: 0, bestWpm: 0, bestCombo: 0, bonuses: [{ label: winnerId ? 'Cursed cup pool' : 'Entry returned', coins }] };
      this.remember(player, `roulette:${m.matchId}`, receipt);
      this.send(player, receipt);
    }
    const winner = this.players.get(winnerId);
    if (winner) { winner.wins++; this.broadcastPlayer(winner); }
    this.broadcastMatch();
  }

  // ---- Turn order & seats -------------------------------------------------------------

  participant(id) {
    return this.match.participants.find((p) => p.id === id);
  }

  isPlaying(id) {
    return ACTIVE_PHASES.has(this.match.phase) && Boolean(this.participant(id)?.alive);
  }

  // The next alive participant after `id` in turn order.
  nextAlive(id) {
    const list = this.match.participants;
    const i = list.findIndex((p) => p.id === id);
    for (let k = 1; k < list.length; k++) {
      const p = list[(i + k) % list.length];
      if (p.alive) return p.id;
    }
    return null;
  }

  // The player who just failed if still alive, else the nearest alive player before them.
  nextChooser() {
    const list = this.match.participants;
    const i = list.findIndex((p) => p.id === this.match.lastFailedId);
    for (let k = 0; k < list.length; k++) {
      const p = list[(i - k + list.length) % list.length];
      if (p.alive) return p.id;
    }
    return null;
  }

  seated() {
    return [...this.players.values()].filter((p) => p.seat >= 0).sort((a, b) => a.seat - b.seat);
  }
  readyPlayers() {
    return this.seated().filter(p => this.settings.mode !== 'roulette' || this.rouletteEntry === 0 || p.rouletteBet?.amount === this.rouletteEntry);
  }

  seatOwner(seat) {
    return [...this.players.values()].find((p) => p.seat === seat) ?? null;
  }

  freeSeat() {
    for (let seat = 0; seat < SEAT_COUNT; seat++) if (!this.seatOwner(seat)) return seat;
    return -1;
  }

  // ---- Bots ---------------------------------------------------------------------------

  // Runs bot steps [{ wait, run }] one after another. Any phase or turn change
  // (setPhase -> stopBot) cancels the rest of the plan.
  runBot(steps) {
    const plan = ++this.botPlan;
    const next = (i) => {
      if (i >= steps.length) return;
      this.botTimer = this.schedule(() => {
        this.botTimer = null;
        steps[i].run();
        if (plan === this.botPlan) next(i + 1);
      }, steps[i].wait);
    };
    next(0);
  }

  stopBot() {
    this.botPlan++;
    this.cancel(this.botTimer);
    this.botTimer = null;
  }

  // ---- Outbound -----------------------------------------------------------------------

  view(p) {
    return {
      id: p.id, name: p.name, isBot: p.isBot, isHost: p.id === this.hostId, connected: p.connected,
      look: p.look, chair: p.chair, pet: p.pet, seat: p.seat, wins: p.wins, pos: p.pos,
      back: p.back, level: p.level, petTier: p.petTier,
      ...(p.capeColor ? { capeColor: p.capeColor } : {}),
      ...(p.rouletteBet ? { rouletteBet: p.rouletteBet.amount } : {}),
      ...(p.isAdmin && p.adminTag ? { isAdmin: true } : {}),
    };
  }

  matchView() {
    const m = this.match;
    return {
      phase: m.phase,
      phaseEndsIn: m.endsAt === null ? null : Math.max(0, m.endsAt - this.now()),
      phaseDuration: m.duration,
      participants: m.participants.map(({ id, hearts, maxHearts, alive, words, shield, combo, pending }) => ({ id, hearts, maxHearts, alive, words, shield, combo, pending: { ...pending } })),
      turnId: m.turnId, mode: m.mode, minLength: m.minLength, prefixIndex: m.prefixIndex, twist: m.twist, startedAt: m.startedAt,
      chooserId: m.chooserId,
      options: m.options,
      typerId: m.typerId,
      prefix: m.prefix,
      mistakes: m.mistakes,
      maxMistakes: m.maxMistakes,
      chain: m.chain.slice(),
      wordCount: m.wordCount,
      round: m.round,
      winnerId: m.winnerId,
      ...(m.roulette ? { roulette: { ...m.roulette, passed: [...m.roulette.passed] } } : {}),
    };
  }

  send(player, msg) {
    if (player.conn) this.sendTo(player.conn, msg);
  }

  sendTo(conn, msg) {
    try {
      conn.send(msg);
    } catch {
      // the socket is closing; its close event will follow
    }
  }

  broadcast(msg, exceptId = null) {
    for (const p of this.players.values()) if (p.id !== exceptId) this.send(p, msg);
  }

  broadcastMatch() {
    this.broadcast({ t: 'match', m: this.matchView() });
  }

  broadcastPlayer(player) {
    this.broadcast({ t: 'player', p: this.view(player) });
  }

  broadcastRoom() {
    this.broadcast({ t: 'room', hostId: this.hostId, settings: { ...this.settings }, table: this.roomTable(), public: this.settings.public, ...(this.settings.mode === 'roulette' ? { rouletteEntry: this.rouletteEntry } : {}) });
  }
}
