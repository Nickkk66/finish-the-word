import { cloudProfile, restrictSecretBacks } from './accounts.js';
import { handleKey } from '../public/js/shared/handles.js';
import { wordTideMethods } from './word-tide.js';
import { observeMovement } from './movement-pattern.js';
import { presenceMethods } from './presence.js';
import { TIDE, TIDE_PHASES } from '../public/js/shared/word-tide.js';
import { LIGHTHOUSE_ROOM, lighthouseSeat, lighthouseSeatPosition, TOTAL_WORLD_SEATS } from '../public/js/shared/lighthouse.js';
import { portalRoute, zoneAt } from '../public/js/shared/travel.js';
import { isRouletteMode, rouletteRules, roulettePayoutCap } from '../public/js/shared/roulette.js';
// Server-authoritative game logic for one room (docs/SPEC.md §3 and §4).
// Pure and transport-agnostic: no Cloudflare or Node APIs. Time, timers and randomness
// are injected so tests can drive a room with a fake clock, and a connection is any
// object with send(obj) / close(code, reason).
import {
  PROTOCOL_VERSION, MAX_PLAYERS, SEAT_COUNT, PUBLIC_ROOM_CODE, ROOM_CODE_REGEX, MAX_WORD_LENGTH, BASE_MISTAKES,
  COUNTDOWN_MS, ROULETTE_COUNTDOWN_MS, CHOOSE_MS, ROUND_END_MS, MATCH_END_MS,
  RECONNECT_GRACE_MS, DEFAULT_SETTINGS, MODES, REWARDS, FLAIRS, EMOTES, HINT_PRICE, OBBY, TRADE_ACCOUNT_AGE_MS,
} from '../public/js/shared/constants.js';
import { PETS_BY_ID, CARDS_BY_ID, petAbility, SECRET_BACK_IDS } from '../public/js/shared/catalog.js';
import { tradeInventory, tradeOffer, offerAvailable, canReceive, transferInventory } from '../public/js/shared/trade.js';
import { ROULETTE_INTRO_MS, ROULETTE_DRINK_MS, ROULETTE_PASS_MS, inRouletteFire, rouletteOdds, METEOR_INTERVAL_MS, METEOR_FLIGHT_MS, METEOR_WARNING_MS, METEOR_SITES } from '../public/js/shared/roulette.js';
import { rules, TWISTS } from './modes.js';
import { adminToken, constantTimeEqual } from './auth.js';
import { filterText, ALLOWED_SWEARS } from './blocklist.js';
import { botProfile, botPet, planPick, planTurn } from './bots.js';
import {
  sanitizeName, randomPlayerName, sanitizeLook, sanitizeChair, sanitizePet, sanitizeChat,
  sanitizeTyping, normalizeWord, displayWord, sanitizeMove, sanitizeSettings,
  sanitizeBack, sanitizeCapeColor, sanitizeLevel, sanitizeTier, sanitizeCards,
} from './sanitize.js';

const HARD_LETTERS = [...'jkqvwxyz'];
const CHAIN_LENGTH = 12; // accepted words kept in MatchState.chain
const MOVES_INTERVAL_MS = 100; // `moves` batching, ~10 Hz
const MAX_MESSAGE_LENGTH = 131072;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLOSE_REPLACED = 4000; // the same player id connected from another socket
const CLOSE_REJECTED = 1008; // after error room_full / bad_hello
const ACTIVE_PHASES = new Set(['choosing', 'typing', 'cardReveal', 'roundEnd', 'roulette', 'rouletteReveal', ...TIDE_PHASES]);

// Token buckets per player and message kind: [tokens refilled per second, burst].
const RATE_LIMITS = {
  activity: [1, 2],
  move: [15, 15],
  typing: [20, 20],
  submit: [5, 5],
  chat: [1000 / 600, 3],
  seat: [4, 6],
  loadout: [2, 5],
  collectMeteor: [2, 4], bet: [2, 4], roulette: [3, 4],
  host: [5, 10],
  ping: [2, 4],
  emote: [1, 1], hint: [2, 3], card: [2, 3], mod: [2, 4], admin: [5, 12], obby: [1, 2], pick: [3, 3],
  trade: [3, 6],
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
    twoLetterPrefixes: new Set(),
    lastFailedId: null, // decides the next chooser
    turnId: 0, mode: 'classic', minLength: 3, prefixIndex: null, twist: null, startedAt: null,
    cardHistory: [], cardRequests: new Map(), turnStartAt: null, firstKeyAt: null, paid: false, humans: 0,
    practice: false,
  };
}

// Fields that only mean something during a choosing / typing phase.
const clearTurn = (m) =>
  Object.assign(m, { chooserId: null, options: null, typerId: null, prefix: null, mistakes: 0, maxMistakes: BASE_MISTAKES });

export class GameEngine {
  constructor({ code, dict, botDict, botDicts = {}, now, setTimeout, clearTimeout, random, adminCode = '', crypto = globalThis.crypto, onWin = () => {}, onListing = () => {}, onVerifyAccount = async () => null, onVerifyHandle = null, onListRooms = async () => ({ rooms: [], leaders: [] }), onShutdownRoom = async () => {}, onAdminEdit = async () => {}, onAdminProfile = async () => ({ guest: true }), onSetWins = async () => ({ wins: 0, revision: 0 }), onSellWins = async () => ({ ok: false }), onCheckTrophies = () => ({ ok: true }), onRemoveLeaderboard = () => {}, onGlobalAnnouncement = () => {}, onError = (err) => console.error('[engine]', err) }) {
    this.code = code;
    this.dict = dict;
    this.botDict = botDict;
    this.botDicts = botDicts;
    this.adminCode = adminCode;
    this.crypto = crypto;
    this.onWin = onWin;
    this.onListing = onListing;
    this.onListRooms = onListRooms;
    this.onSetWins = onSetWins;
    this.onSellWins = onSellWins;
    this.onCheckTrophies = onCheckTrophies;
    this.onVerifyAccount = onVerifyAccount;
    this.onVerifyHandle=onVerifyHandle;
    this.onRemoveLeaderboard = onRemoveLeaderboard;
    this.onGlobalAnnouncement = onGlobalAnnouncement;
    this.unlockIps = new Map();
    this.bans = new Map();
    this.obbyRewards = new Map();
    this.rouletteReceipts = new Map();
    this.trades = new Map();
    this.onShutdownRoom = onShutdownRoom;
    this.onAdminEdit = onAdminEdit;
    this.onAdminProfile = onAdminProfile;
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
    this.settings = { ...DEFAULT_SETTINGS, public: this.code === PUBLIC_ROOM_CODE };
    this.match = newMatch();
    this.phaseTimer = null;
    this.movesTimer = null;
    this.botTimer = null;
    this.pendingPresetBotReset = false;
    this.rouletteEntry = 25;
    this.rouletteHazardsAt = 0;
    this.fireMode = false;
    this.meteorTimer = null; this.meteor = null;
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
      this.cancelTrade(player, 'The other player disconnected.');
      this.clearCardQueue(player, 'disconnected');
      for (const p of this.players.values()) if (p.cardQueue?.targetId === player.id) this.clearCardQueue(p, 'target_left');
      this.cancel(player.fireTimer); player.fireTimer = null;
      player.graceTimer = this.schedule(() => this.removePlayer(player.id), RECONNECT_GRACE_MS);
      this.broadcastPlayer(player);
      this.reportListing();
      // A room with no connected humans has no audience. Drop its grace timers and
      // bots now so the next visitor starts with a fresh, idle room.
      if (![...this.players.values()].some(p => !p.isBot && p.connected)) {
        for (const human of [...this.players.values()].filter(p => !p.isBot)) this.removePlayer(human.id);
      }
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
    if (msg._internal !== this && ((msg.adminToken && this.adminCode) || msg.accountToken || this.onVerifyHandle)) {
      this.conns.set(conn, null);
      return Promise.all([
        msg.adminToken && this.adminCode ? adminToken(this.adminCode, id, this.crypto).then(token => constantTimeEqual(token, msg.adminToken)) : false,
        typeof msg.accountToken === 'string' && /^[a-f0-9]{64}$/.test(msg.accountToken) ? this.onVerifyAccount(msg.accountToken, id).catch(() => null) : null,
        this.onVerifyHandle?this.onVerifyHandle(msg.accountToken||msg.handleToken,id).catch(()=>null):null,
      ]).then(([adminVerified, account, handle]) => {
        if (!this.conns.has(conn)) return; // socket closed while its token was being checked
        this.conns.delete(conn);
        if(this.onVerifyHandle&&!handle)return this.reject(conn,'handle_required','Claim an available handle before joining.');
        this.hello(conn, { ...msg, adminToken: null, accountToken: null, _verified: adminVerified, _account: account, _handle: handle, _internal: this });
      });
    }
    const verified = msg._internal === this && msg._verified === true;
    const accountCreatedAt = msg._internal === this && msg._account?.id === id ? msg._account.createdAt : null;
    const secretBacks = msg._internal===this ? msg._account?.secretBacks || this.players.get(id)?.secretBacks || [] : this.players.get(id)?.secretBacks || [];
    const loadout = {
      name: (msg._internal===this&&msg._handle?.name)||sanitizeName(msg.name, this.settings.allowSwearing) || randomPlayerName(this.random),
      look: sanitizeLook(msg.look),
      chair: sanitizeChair(msg.chair),
      pet: sanitizePet(msg.pet),
      back: sanitizeBack(msg.back), capeColor: sanitizeCapeColor(msg.capeColor), level: sanitizeLevel(msg.level), petTier: sanitizeTier(msg.petTier), wins: this.safeWins(msg.wins),
    };
    if(!this.onVerifyHandle&&[...this.players.values()].some(p=>p.id!==id&&handleKey(p.name)===handleKey(loadout.name)))return this.reject(conn,'handle_taken','That handle is taken. Choose another.');
    if(SECRET_BACK_IDS.has(loadout.back)&&!secretBacks.includes(loadout.back))loadout.back='none';
    let player = this.players.get(id);
    const isNew = !player;
    if (player) {
      // Resume after a reconnect, or take over from another tab (whose socket is closed).
      if (player.conn) this.closeConn(player.conn, CLOSE_REPLACED, 'replaced');
      this.cancel(player.graceTimer);
      Object.assign(player, loadout, { conn, connected: true, graceTimer: null, isAdmin: verified, accountCreatedAt, secretBacks, ipHash: conn.ipHash });
      player.tradeInventory = tradeInventory(msg.inventory);
      if ((!ACTIVE_PHASES.has(this.match.phase) && this.match.phase !== 'ended') || !this.participant(id)?.alive) player.cards = sanitizeCards(msg.cards);
    } else {
      if (this.players.size >= MAX_PLAYERS && !this.evictBot()) return this.reject(conn, 'room_full', 'This room is full.');
      player = this.addPlayer({ id, isBot: false, conn, ...loadout });
      player.requests = new Map(this.rouletteReceipts.get(id) || []);
      this.rouletteReceipts.delete(id);
      player.cards = sanitizeCards(msg.cards);
      player.tradeInventory = tradeInventory(msg.inventory);
      player.isAdmin = verified;
      player.accountCreatedAt = accountCreatedAt;
      player.secretBacks=secretBacks;
      this.settings.public = this.code === PUBLIC_ROOM_CODE;
      this.hostId ??= id;
    }
    if (msg.profile) player.profile = restrictSecretBacks(cloudProfile(msg.profile, id),secretBacks);
    player.handleRevision=msg._internal===this?msg._handle?.revision||0:0;
    player.inputDevice=msg.inputDevice==='desktop'?'desktop':'touch';
    this.conns.set(conn, id);
    if (this.fireMode) player.fireReadyAt = this.rouletteHazardsAt;
    this.syncFire(player);
    this.send(player, {
      t: 'welcome',
      you: id, zone: player.zone,
      code: this.code,
      hostId: this.hostId,
      settings: { ...this.settings },
      table: this.roomTable(), public: this.settings.public, isAdmin: player.isAdmin,
      players: [...this.players.values()].map((p) => this.view(p)),
      match: this.matchView(),
      rouletteEntry: this.rouletteEntry,
      meteor: this.meteorView(),
      tidePrivate: this.tidePrivate(id),
      cardQueue: player.cardQueue || null, cards: { ...player.cards }, cardReceipts: this.match.cardHistory.filter(e => e.actorId === player.id&&!e.returned).map(e => ({ cardId: e.cardId, requestId: e.requestId })),
    });
    this.sendPresence(player);
    this.broadcast({ t: 'player', p: this.view(player) }, id);
    for (const receipt of player.requests.values()) if ((receipt.t !== 'hint' || receipt.ok) && ['hint', 'betResult', 'stakeRefund', 'rouletteReward', 'hazardDebit', 'meteorReward', 'matchRefund', 'cardReturned', 'adminCard', 'petMergeGrant', 'tradeComplete', 'winsSold', 'tideReward'].includes(receipt.t)) this.send(player, receipt);
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

  addPlayer({ id, isBot, conn, name, look, chair, pet, back = 'none', capeColor = null, level = 1, petTier = 1, wins = 0 }) {
    const player = {
      id, name, isBot, look, chair, pet,
      back, capeColor, level, petTier, rouletteBet: null, isAdmin: false, adminTag: false, ipHash: conn?.ipHash,
      cards: {}, cardQueue: null, requests: new Map(), obbyStartAt: null, tradeInventory: null,
      seat: -1, wins: this.safeWins(wins), pos: null, zone: 'island', travel: null,
      conn, connected: true, graceTimer: null,
      moved: false, // has a position not yet sent in `moves`
      buckets: {}, // rate limiter state
      lastActivityAt: this.now(), presence: null, presenceTimer: null,
    };
    this.players.set(id, player);
    this.armPresence(player);
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
    // A placed entry stays committed if its owner leaves the room.
    player.rouletteBet = null;
    this.cancel(player.graceTimer);
    this.cancel(player.presenceTimer);
    this.cancel(player.fireTimer);
    this.cancelTrade(player, 'The other player left.');
    this.fail(id, 'left'); // knocked out if still playing
    if (!player.isBot) {
      const receipts = [...player.requests].filter(([,value]) => (value.t !== 'hint' || value.ok) && ['hint', 'betResult', 'stakeRefund', 'rouletteReward', 'hazardDebit', 'meteorReward', 'matchRefund', 'cardReturned', 'adminCard', 'petMergeGrant', 'tradeComplete', 'winsSold', 'tideReward'].includes(value.t));
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
    for (const p of this.players.values()) { this.cancel(p.fireTimer); this.cancel(p.presenceTimer); }
    this.cancel(this.phaseTimer);
    this.cancel(this.movesTimer);
    this.cancel(this.meteorTimer);
    this.stopBot();
    for (const trade of new Set(this.trades.values())) this.cancel(trade.timer);
    this.trades.clear();
    this.init();
    this.reportListing();
  }

  shutdownRoom() {
    this.cancelMatch(false);
    for (const player of [...this.players.values()]) {
      this.refundStake(player);
      if (player.conn) {
        this.send(player, { t: 'kicked', reason: 'An admin shut down this room.' });
        this.closeConn(player.conn, 4004, 'room_shutdown');
      }
    }
    this.resetRoom();
  }

  // ---- Client messages ----------------------------------------------------------------

  dispatch(player, msg) {
    switch (msg.t) {
      case 'activity': return this.noteActivity(player);
      case 'presenceReply': return this.onPresenceReply(player, msg);
      case 'move': return this.onMove(player, msg);
      case 'sit': return this.onSit(player, msg.seat);
      case 'stand': return this.onStand(player);
      case 'pick': return this.onPick(player, msg.letter);
      case 'typing': return this.onTyping(player, msg.text);
      case 'tideAnswer': return this.onTideAnswer(player, msg);
      case 'submit': return this.allow(player, 'submit') && this.submitWord(player, msg.word);
      case 'chat': return this.onChat(player, msg.text);
      case 'loadout': return this.onLoadout(player, msg);
      case 'tradeRequest': return this.onTradeRequest(player, msg);
      case 'tradeRespond': return this.onTradeRespond(player, msg);
      case 'tradeOffer': return this.onTradeOffer(player, msg);
      case 'tradeUnaccept': return this.onTradeUnaccept(player, msg);
      case 'tradeAccept': return this.onTradeAccept(player, msg);
      case 'tradeCancel': return this.cancelTrade(player, 'Trade canceled.');
      case 'host': return this.onHost(player, msg);
      case 'ping': return this.onPing(player, msg.c);
      case 'hint': return this.onHint(player, msg);
      case 'queueCard': return this.onQueueCard(player, msg);
      case 'useCard': return this.onCard(player, msg);
      case 'emote': return this.onEmote(player, msg.name);
      case 'celebrate': return this.onCelebrate(player, msg);
      case 'unlock': return this.onUnlock(player, msg.code);
      case 'mod': return this.onMod(player, msg);
      case 'sellWins': return this.sellWins(player, msg);
      case 'admin': return this.onAdmin(player, msg);
      case 'obby': return this.onObby(player, msg);
      case 'collectMeteor': return this.onCollectMeteor(player, msg);
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
    if (player.seat >= 0 || player.travel || this.isPlaying(player.id) || !this.allow(player, 'move')) return;
    const pos = sanitizeMove(msg);
    if (!pos) return;
    const zone=zoneAt(pos);
    if (zone!==player.zone) {
      if (!player.isAdmin) return;
      player.zone=zone;
    }
    if(zone==='lighthouse' && (Math.hypot(pos.x-LIGHTHOUSE_ROOM.center.x,pos.z)>LIGHTHOUSE_ROOM.radius+.1 || pos.y < -.1 || pos.y > 12)) return;
    const changed=!player.pos||Math.hypot(pos.x-player.pos.x,pos.y-player.pos.y,pos.z-player.pos.z)>.02||Math.abs(pos.ry-player.pos.ry)>.02;
    player.pos = pos;
    if(observeMovement(player,pos,this.now()))return this.kickInactive(player,true);
    if(changed)this.noteActivity(player,false,true);
    this.syncFire(player);
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
    if (!Number.isInteger(seat) || seat < 0 || seat >= TOTAL_WORLD_SEATS || seat === player.seat) return;
    const inside=lighthouseSeat(seat);
    if (this.isPlaying(player.id) || player.travel || player.zone!==(inside?'lighthouse':'island') || !this.allow(player, 'seat')) return;
    if(inside&&(!player.pos||Math.hypot(player.pos.x-inside.x,player.pos.z-inside.z)>5.5||Math.abs(player.pos.y)>1))return;
    if (this.seatOwner(seat)) return this.send(player, { t: 'error', code: 'seat_taken', message: 'That seat is taken.' });
    player.seat = seat;
    if(inside)player.pos=lighthouseSeatPosition(seat);
    this.syncFire(player);
    this.broadcastPlayer(player);
    this.syncCountdown();
  }

  onStand(player) {
    if ((player.seat < 0 && !(this.match.mode === 'word_tide' && this.isPlaying(player.id))) || !this.allow(player, 'seat')) return;
    this.fail(player.id, 'forfeit'); // standing up mid-match knocks you out
    const inside=lighthouseSeatPosition(player.seat,true);
    if(inside)player.pos=inside;
    player.seat = -1;
    this.broadcastPlayer(player);
    this.syncCountdown();
  }

  onPick(player, letter) {
    const m = this.match;
    if (m.phase === 'choosing' && player.id === m.chooserId && m.options.includes(letter) && this.allow(player, 'pick')) { this.noteActivity(player,true); this.pick(letter); }
  }

  onTyping(player, text) {
    const m = this.match;
    if (m.phase === 'typing' && player.id === m.typerId && this.allow(player, 'typing')) {
      if (sanitizeTyping(text)) this.noteActivity(player,true);
      this.relayTyping(player, sanitizeTyping(text));
    }
  }

  relayTyping(player, text) {
    if (text && this.match.firstKeyAt === null && this.match.typerId === player.id) this.match.firstKeyAt = this.now();
    this.broadcast({ t: 'typing', id: player.id, text: filterText(text, this.match.settings?.allowSwearing ?? this.settings.allowSwearing) }, player.id);
  }

  onChat(player, raw) {
    const text = sanitizeChat(raw, this.settings.allowSwearing);
    if (!text) return;
    if (!this.allow(player, 'chat')) {
      return this.send(player, { t: 'error', code: 'rate_limited', message: 'You are chatting too fast.' });
    }
    this.broadcast({ t: 'chat', id: player.id, name: player.name, text });
    this.noteActivity(player);
  }

  updateHandle(id,name,revision=0){
    const p=this.players.get(id);if(!p||p.isBot||revision<(p.handleRevision||0))return;
    p.name=name;p.handleRevision=revision;this.broadcastPlayer(p);this.reportListing();
  }

  // Pet changes are cosmetic until the next match: abilities are locked in at match start.
  onLoadout(player, msg) {
    if (!this.allow(player, 'loadout')) return;
    if (msg.profile) player.profile = restrictSecretBacks(cloudProfile(msg.profile, player.id),player.secretBacks||[]);
    if('name' in msg&&!this.onVerifyHandle){
      const name=sanitizeName(msg.name,this.settings.allowSwearing);
      if(name&&![...this.players.values()].some(p=>p.id!==player.id&&handleKey(p.name)===handleKey(name)))player.name=name;
      else if(name)this.send(player,{t:'error',code:'handle_taken',message:'That handle is taken. Choose another.'});
    }
    if ('look' in msg) player.look = sanitizeLook(msg.look);
    if ('chair' in msg) player.chair = sanitizeChair(msg.chair);
    if ('pet' in msg) player.pet = sanitizePet(msg.pet);
    if ('petTier' in msg) player.petTier = sanitizeTier(msg.petTier);
    if ('back' in msg) { const back=sanitizeBack(msg.back);player.back=SECRET_BACK_IDS.has(back)&&!player.secretBacks?.includes(back)?'none':back; }
    if ('capeColor' in msg) player.capeColor = sanitizeCapeColor(msg.capeColor);
    if ('level' in msg) player.level = sanitizeLevel(msg.level);
    if ('wins' in msg) player.wins = this.safeWins(msg.wins);
    if ('cards' in msg && (!ACTIVE_PHASES.has(this.match.phase) || !this.participant(player.id)?.alive)) player.cards = sanitizeCards(msg.cards);
    if ('inventory' in msg) {
      player.tradeInventory = tradeInventory(msg.inventory);
      const trade = this.trades.get(player.id);
      if (trade?.stage === 'open' && !offerAvailable(player.tradeInventory, trade.offers[player.id])) {
        trade.offers[player.id] = tradeOffer();
        this.resetTradeAcceptance(trade);
        this.sendTradeState(trade);
      }
    }
    this.broadcastPlayer(player);
  }

  tradePeer(trade, id) { return this.players.get(trade.ids.find(v => v !== id)); }
  tradeEligible(player) { return player?.accountCreatedAt != null && this.now() - player.accountCreatedAt >= TRADE_ACCOUNT_AGE_MS; }

  sendTradeState(trade) {
    for (const id of trade.ids) {
      const player = this.players.get(id), peer = this.tradePeer(trade, id);
      if (player) this.send(player, { t: 'tradeState', id: trade.id, stage: trade.stage, requesterId: trade.ids[0],
        peerId: peer?.id, peerName: peer?.name, offer: trade.offers[id], peerOffer: trade.offers[peer?.id],
        accepted: trade.accepted.has(id), peerAccepted: trade.accepted.has(peer?.id), countdown: trade.countdown || null });
    }
  }

  resetTradeAcceptance(trade) {
    trade.accepted.clear();
    trade.countdown = null;
    this.cancel(trade.timer);
    trade.timer = null;
  }

  cancelTrade(player, reason = 'Trade canceled.') {
    const trade = this.trades.get(player.id);
    if (!trade) return;
    this.cancel(trade.timer);
    for (const id of trade.ids) {
      this.trades.delete(id);
      const participant = this.players.get(id);
      if (participant) this.send(participant, { t: 'tradeClosed', id: trade.id, reason });
    }
  }

  onTradeRequest(player, msg) {
    if (!this.allow(player, 'trade') || this.isPlaying(player.id) || this.trades.has(player.id)) return;
    if (!this.tradeEligible(player)) return this.send(player, { t: 'tradeError', message: 'Sign in with an account at least 24 hours old to trade.' });
    const target = this.players.get(msg.targetId);
    if (!target || target.id === player.id || target.isBot || !target.connected || this.isPlaying(target.id) || this.trades.has(target.id)) return;
    if (!this.tradeEligible(target)) return this.send(player, { t: 'tradeError', message: 'That player is not yet eligible to trade.' });
    const trade = { id: `${this.code}:${++this.matchSerial}:${this.now()}`, ids: [player.id, target.id], stage: 'invite',
      offers: { [player.id]: tradeOffer(), [target.id]: tradeOffer() }, accepted: new Set(), timer: null, countdown: null };
    for (const id of trade.ids) this.trades.set(id, trade);
    this.sendTradeState(trade);
    trade.timer = this.schedule(() => this.cancelTrade(player, 'Trade request expired.'), 30000);
  }

  onTradeRespond(player, msg) {
    const trade = this.trades.get(player.id);
    if (!trade || trade.id !== msg.id || trade.stage !== 'invite' || trade.ids[1] !== player.id) return;
    if (msg.accept !== true) return this.cancelTrade(player, 'Trade canceled: request declined.');
    if (!this.tradeEligible(player)) return this.cancelTrade(player, 'Trading requires an account at least 24 hours old.');
    this.cancel(trade.timer); trade.timer = null;
    if (trade.ids.some(id => this.isPlaying(id))) return this.cancelTrade(player, 'A player is in a game.');
    trade.stage = 'open';
    this.sendTradeState(trade);
  }

  onTradeOffer(player, msg) {
    const trade = this.trades.get(player.id);
    if (!trade || trade.id !== msg.id || trade.stage !== 'open') return;
    if (!this.tradeEligible(player)) return this.cancelTrade(player, 'Trading requires an account at least 24 hours old.');
    if (!this.allow(player, 'trade')) return this.send(player, { t: 'tradeError', message: 'Please wait a moment before changing your offer.' });
    if(msg.offer?.coins!==undefined&&msg.offer.coins!==0)return this.send(player,{t:'tradeError',message:'Cash cannot be traded. Choose items from your collection.'});
    if ('inventory' in msg) player.tradeInventory = tradeInventory(msg.inventory);
    const offer = tradeOffer(msg.offer);
    if (!offerAvailable(player.tradeInventory, offer)) return this.send(player, { t: 'tradeError', message: 'You no longer own everything in that offer.' });
    trade.offers[player.id] = offer;
    this.resetTradeAcceptance(trade);
    this.sendTradeState(trade);
  }

  onTradeUnaccept(player, msg) {
    const trade = this.trades.get(player.id);
    if (!trade || trade.id !== msg.id || trade.stage !== 'open' || !trade.accepted.has(player.id)) return;
    trade.accepted.delete(player.id);
    this.cancel(trade.timer); trade.timer = null; trade.countdown = null;
    this.sendTradeState(trade);
  }

  onTradeAccept(player, msg) {
    const trade = this.trades.get(player.id);
    if (!trade || trade.id !== msg.id || trade.stage !== 'open' || !this.allow(player, 'trade')) return;
    if (!this.tradeEligible(player)) return this.cancelTrade(player, 'Trading requires an account at least 24 hours old.');
    if (this.isPlaying(player.id)) return this.cancelTrade(player, 'A player entered a game.');
    player.tradeInventory = tradeInventory(msg.inventory);
    if (!offerAvailable(player.tradeInventory, trade.offers[player.id])) return this.send(player, { t: 'tradeError', message: 'Your offer no longer matches your inventory.' });
    if (!canReceive(player.tradeInventory, trade.offers[player.id], trade.offers[this.tradePeer(trade, player.id).id])) return this.send(player, { t: 'tradeError', message: 'You already own a chair or back item in their offer.' });
    trade.accepted.add(player.id);
    if (trade.accepted.size === 2 && !trade.timer) {
      trade.countdown = this.now() + 3000;
      trade.timer = this.schedule(() => this.completeTrade(trade), 3000);
    }
    this.sendTradeState(trade);
  }

  completeTrade(trade) {
    if (trade.accepted.size !== 2 || !trade.countdown || this.now() < trade.countdown) return;
    if (trade.ids.some(id => this.trades.get(id) !== trade || !this.players.get(id)?.connected || this.isPlaying(id))) return this.cancelTrade(this.players.get(trade.ids[0]) || this.players.get(trade.ids[1]), 'Trade could not finish.');
    const [a, b] = trade.ids.map(id => this.players.get(id));
    if (!this.tradeEligible(a) || !this.tradeEligible(b)) return this.cancelTrade(a, 'Trading requires an account at least 24 hours old.');
    if (!offerAvailable(a.tradeInventory, trade.offers[a.id]) || !offerAvailable(b.tradeInventory, trade.offers[b.id]) || !canReceive(a.tradeInventory, trade.offers[a.id], trade.offers[b.id]) || !canReceive(b.tradeInventory, trade.offers[b.id], trade.offers[a.id])) return this.cancelTrade(a, 'An offered item is no longer available.');
    this.cancel(trade.timer);
    for (const player of [a, b]) {
      const other = player === a ? b : a;
      player.tradeInventory = transferInventory(player.tradeInventory, trade.offers[player.id], trade.offers[other.id]);
      this.trades.delete(player.id);
      const result = { t: 'tradeComplete', id: trade.id, receipt: `trade:${trade.id}:${player.id}`,
        partner: other.name, outgoing: trade.offers[player.id], incoming: trade.offers[other.id] };
      this.remember(player, result.receipt, result);
      this.send(player, result);
    }
  }

  onHost(player, msg) {
    if (player.id !== this.hostId && !player.isAdmin) {
      return this.send(player, { t: 'error', code: 'not_host', message: 'Only the host can do that.' });
    }
    if (!this.allow(player, 'host')) return;
    switch (msg.action) {
      case 'start': return this.hostStart();
      case 'endMatch': return this.cancelMatch();
      case 'addBot': return this.addBot(player);
      case 'removeBot': return this.removeBot();
      case 'settings': return this.changeSettings(msg.settings, player);
      default:
    }
  }

  onPing(player, c) {
    if (!this.allow(player, 'ping')) return;
    const echo = Number.isFinite(c) || (typeof c === 'string' && c.length <= 64) ? c : null;
    this.send(player, { t: 'pong', c: echo, s: this.now() });
  }

  // Requests are scoped by type + id; successful consumption can never replay twice.
  request(player, kind, msg, run, internal = false) {
    if (typeof msg.requestId !== 'string' || !ID_RE.test(msg.requestId)) return;
    const key = `${kind}:${msg.requestId}`;
    const plans = kind === 'queueCard' && msg.matchId === this.match.matchId ? this.match.cardRequests : null;
    const planKey = `${player.id}:${key}`;
    if (plans?.has(planKey)) return this.send(player, plans.get(planKey));
    if (player.requests.has(key)) return this.send(player, player.requests.get(key));
    if (!internal && !this.allow(player, kind === 'hint' ? 'hint' : kind === 'bet' ? 'bet' : 'card')) {
      if (kind === 'queueCard') this.send(player, { t: 'cardQueueResult', requestId: msg.requestId, ok: false, reason: 'rate_limited' });
      return;
    }
    const result = run();
    this.remember(player, key, result);
    if (plans) plans.set(planKey, result);
    this.send(player, result);
  }

  remember(player, key, result) {
    player.requests.set(key, result);
    while (player.requests.size > 128) {
      // Rejected spam must not evict an approved answer payment before reconnect.
      const expendable = [...player.requests].find(([, value]) => value.ok === false) || [...player.requests].find(([, value]) => value.t !== 'hint' || !value.ok);
      player.requests.delete(expendable?.[0] ?? player.requests.keys().next().value);
    }
  }

  onHint(player, msg) {
    this.request(player, 'hint', msg, () => {
      const answer = { t: 'hint', ok: false, turnId: msg.turnId, requestId: msg.requestId, matchId: this.match.matchId };
      const m = this.match;
      if (m.tide) return this.tideHint(player, msg, answer);
      if (m.phase !== 'typing' || m.typerId !== player.id || msg.turnId !== m.turnId || this.now() >= m.endsAt) return { ...answer, reason: 'turn_ended' };
      const p = this.participant(player.id);
      if (p.hintedTurn === m.turnId) return { ...answer, reason: 'already_bought' };
      if (!Number.isFinite(msg.balance) || msg.balance < HINT_PRICE) return { ...answer, reason: 'insufficient_funds' };
      const word = this.dict.randomWithPrefix(m.prefix, m.used, this.random, { minLen: m.minLength, maxLen: MAX_WORD_LENGTH });
      if (!word) return { ...answer, reason: 'no_answer' };
      p.hintedTurn = m.turnId;
      p.hintSpent = (p.hintSpent || 0) + HINT_PRICE;
      this.broadcast(systemChat(`${player.name} bought the answer.`));
      return { ...answer, ok: true, word, cost: HINT_PRICE, receipt: `answer:${m.matchId}:${m.turnId}:${player.id}` };
    });
  }

  clearCardQueue(player, reason = null) {
    if (!player?.cardQueue) return;
    player.cardQueue = null;
    this.send(player, { t: 'cardQueue', queue: null, reason });
  }

  onQueueCard(player, msg) {
    this.request(player, 'queueCard', msg, () => {
      const m = this.match;
      const answer = { t: 'cardQueueResult', requestId: msg.requestId, ok: false };
      if (msg.matchId !== m.matchId || !['choosing', 'typing', 'cardReveal', 'roundEnd'].includes(m.phase) ||
          !this.participant(player.id)?.alive || !player.connected || player.travel ||
          (['typing', 'cardReveal'].includes(m.phase) && m.typerId === player.id)) return { ...answer, reason: 'locked' };
      if (this.participant(player.id)?.jammed) return { ...answer, reason:'card_jammed' };
      if (msg.cardId === null) { this.clearCardQueue(player); return { ...answer, ok: true }; }
      const card = Object.hasOwn(CARDS_BY_ID, msg.cardId) ? CARDS_BY_ID[msg.cardId] : null;
      const target = this.participant(msg.targetId);
      if (!card || !target?.alive || !this.players.get(target.id)?.connected || (target.id === player.id && !['skip','heal','ward','reflect'].includes(card.effect))) return { ...answer, reason: 'invalid_target' };
      if (!(player.cards[card.id] > 0)) return { ...answer, reason: 'not_owned' };
      if (['ward','reflect'].includes(card.effect)) {
        if(target.defense)return {...answer,reason:'already_armed'};
        player.cards[card.id]--; target.defense={cardId:card.id,ownerId:player.id,requestId:msg.requestId};
        const event={t:'cardUsed',eventId:`${m.matchId}:arm:${msg.requestId}`,actorId:player.id,targetId:target.id,cardId:card.id,effect:'armed',requestId:msg.requestId};
        m.cardHistory.push(event);this.broadcast(event);this.send(player,{t:'cardResult',ok:true,cardId:card.id,requestId:msg.requestId,turnId:m.turnId});this.broadcastMatch();
        return {...answer,ok:true};
      }
      player.cardQueue = { cardId: card.id, targetId: target.id, requestId: msg.requestId, matchId: m.matchId, style: msg.style === 'deck' ? 'deck' : 'pocket' };
      this.send(player, { t: 'cardQueue', queue: player.cardQueue });
      return { ...answer, ok: true };
    });
  }

  onCard(player, msg, queued = false) {
    this.request(player, 'card', msg, () => {
      const answer = { t: 'cardResult', ok: false, turnId: msg.turnId, requestId: msg.requestId, cardId: msg.cardId, targetId: msg.targetId };
      const m = this.match;
      if (!queued || m.phase !== 'cardReveal' || m.typerId !== player.id || msg.turnId !== m.turnId || this.now() >= m.endsAt) return { ...answer, reason: 'not_your_turn' };
      const actor = this.participant(player.id);
      const target = this.participant(msg.targetId);
      const card = Object.hasOwn(CARDS_BY_ID, msg.cardId) ? CARDS_BY_ID[msg.cardId] : null;
      if (!card || !target?.alive || !this.players.get(target.id)?.connected || (target.id === player.id && !['skip','heal','ward','reflect'].includes(card.effect))) return { ...answer, reason: 'invalid_target' };
      if (actor.jammed) return {...answer,reason:'card_jammed'};
      if (actor.cardTurn === m.turnId) return { ...answer, reason: 'one_per_turn' };
      if (!(player.cards[card.id] > 0)) return { ...answer, reason: 'not_owned' };
      actor.cardTurn = m.turnId;
      player.cards[card.id]--;
      let actualTarget=target,blocked=false,reflected=false;
      if (target.id!==player.id && !['heal'].includes(card.effect) && target.defense) {
        const defense=target.defense;target.defense=null;
        reflected=defense.cardId==='mirrored_shield';blocked=!reflected;
        if(reflected)actualTarget=actor;
        this.broadcast({t:'cardDefense',targetId:target.id,actorId:player.id,cardId:defense.cardId,reflected});
      }
      if(!blocked && card.effect==='mistakes' && actualTarget.ability?.type==='mistakeGuard'&&!actualTarget.mistakeGuardUsed){actualTarget.mistakeGuardUsed=true;blocked=true;}
      const hit=card.effect!=='heart'&&card.effect!=='heal'||this.random()<.5;
      if (!blocked && hit) {
        if (card.effect === 'skip') actualTarget.pending.skip = true;
        if (card.effect === 'time') actualTarget.pending.time += card.value;
        if (card.effect === 'mistakes') actualTarget.mistakePenalty=card.value;
        if (card.effect === 'burn') {actualTarget.burns??=[];actualTarget.burns.push(2);}
        if (card.effect === 'heal') actualTarget.hearts=Math.min(actualTarget.maxHearts,actualTarget.hearts+1);
        if (card.effect === 'jam') {actualTarget.jammed=true;this.clearCardQueue(this.players.get(actualTarget.id),'card_jammed');}
      }
      const event = { t: 'cardUsed', eventId: `${m.matchId}:${m.turnId}`, requestId: msg.requestId, actorId: player.id, targetId: target.id, actorSeat: player.seat, targetSeat: this.players.get(target.id).seat, cardId: card.id, effect: card.effect, style: msg.style, blocked, reflected, hit, actualTargetId:actualTarget.id, shielded: card.effect === 'heart' && !!actualTarget.shield };
      m.cardHistory.push(event);
      const { requestId, ...publicEvent } = event;
      this.broadcast(publicEvent);
      if (card.effect === 'heart' && !blocked && hit) {
        const matchId = m.matchId, turnId = m.turnId, targetId = actualTarget.id;
        this.schedule(() => {
          if (this.match.matchId === matchId && this.match.turnId === turnId && this.match.phase === 'cardReveal') this.fail(targetId, 'card');
        }, 4700);
      }
      else this.broadcastMatch();
      return { ...answer, ok: true };
    }, queued);
  }

  returnArmedCards() {
    const m=this.match;
    for(const part of m.participants){
      const defense=part.defense;if(!defense)continue;part.defense=null;
      const owner=this.players.get(defense.ownerId);
      if(owner)owner.cards[defense.cardId]=(owner.cards[defense.cardId]||0)+1;
      const event=m.cardHistory.find(e=>e.requestId===defense.requestId);if(event)event.returned=true;
      const receipt={t:'cardReturned',cardId:defense.cardId,receipt:`armed-return:${m.matchId}:${defense.requestId}`};
      if(owner){this.remember(owner,receipt.receipt,receipt);this.send(owner,receipt);}
      else {const receipts=this.rouletteReceipts.get(defense.ownerId)||[];receipts.push([receipt.receipt,receipt]);this.rouletteReceipts.set(defense.ownerId,receipts.slice(-100));}
    }
  }

  onEmote(player, name) {
    if (!EMOTES.includes(name) || !this.allow(player, 'emote')) return;
    if (player.seat >= 0 && name.startsWith('dance')) return;
    this.broadcast({ t: 'emote', id: player.id, name }, player.id);
  }

  // Cosmetic events are approved and relayed by the room; clients cannot impersonate another player.
  onCelebrate(player, msg) {
    if (msg.kind !== 'portal') {
      if(msg.kind==='hatch' && !this.isPlaying(player.id) && this.allow(player,'emote')) this.broadcast({t:'celebrate',id:player.id,kind:'hatch'});
      return;
    }
    const route=portalRoute(player.zone,msg.to,player.pos);
    if(this.isPlaying(player.id)||player.seat>=0||player.travel||!route||!this.allow(player,'emote')) {
      this.send(player,{t:'travelRejected'});return;
    }
    const travel={to:msg.to,...route};player.travel=travel;
    this.broadcast({t:'celebrate',id:player.id,kind:'portal',to:msg.to,door:route.door});
    this.schedule(()=>{
      if(this.players.get(player.id)!==player||player.travel!==travel)return;
      player.travel=null;
      if(this.isPlaying(player.id)){this.send(player,{t:'travelRejected'});return;}
      player.zone=travel.to;player.pos={...travel.arrival,anim:'idle'};
      this.broadcast({t:'travel',id:player.id,to:travel.to,pos:player.pos});
      this.broadcastPlayer(player);
    },900);
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
    if (msg.action === 'unban') {
      if (this.bans.delete(msg.id)) this.send(player, { t: 'modResult', action: 'unban', id: msg.id });
      return;
    }
    if (!target || target.id === player.id || (!player.isAdmin && target.isAdmin)) return this.denied(player);
    if (!['kick', 'ban'].includes(msg.action)) return;
    if (msg.action === 'ban') this.bans.set(target.id, target.ipHash);
    this.send(player, { t: 'modResult', action: msg.action, id: target.id, name: target.name });
    this.send(target, { t: 'kicked', reason: msg.action === 'ban' ? 'You were banned by the room owner.' : 'You were kicked by the room owner.' });
    if (target.conn) this.closeConn(target.conn, msg.action === 'ban' ? 4002 : 4001, msg.action);
    this.removePlayer(target.id);
  }

  sellWins(player, msg) {
    if (!player.accountCreatedAt) return this.send(player, { t: 'error', code: 'account_required', message: 'Sign in to sell wins.' });
    if (typeof msg.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(msg.requestId)) return;
    const key = `sell:${msg.requestId}`;
    if (player.requests.has(key)) return this.send(player, player.requests.get(key));
    return this.onSellWins({ id: player.id, requestId: msg.requestId }).then(result => {
      if (!result.ok) return this.send(player, { t: 'error', code: 'sell_wins_failed', message: result.error || 'Could not sell wins.' });
      const receipt = { t: 'winsSold', requestId: msg.requestId, wins: result.wins, revision: result.revision, coins: result.coins, receipt: result.receipt };
      this.remember(player, key, receipt);
      player.wins = result.wins;
      this.broadcastPlayer(player);
      this.send(player, receipt);
    }).catch(() => this.send(player, { t: 'error', code: 'sell_wins_failed', message: 'Could not sell wins. Try again.' }));
  }

  denied(player) { this.send(player, { t: 'error', code: 'not_allowed', message: 'You cannot do that.' }); }

  adminProfile(action, msg) {
    const target = this.players.get(msg.id);
    if (!target || target.isBot || !target.connected) throw new Error('That player is no longer online.');
    if (action === 'get') {
      if (!target.profile) throw new Error('Reconnect this player to load their full profile.');
      return { profile: { ...target.profile, name: target.name }, guest: true };
    }
    if (action === 'save') {
      return { profile: cloudProfile(msg.profile, target.id), guest: true };
    }
    throw new Error('Unknown profile operation.');
  }

  editPlayer(action, msg) {
    const target = this.players.get(msg.id);
    if (!target || target.isBot) return false;
    if (action === 'profile') {
      this.cancelTrade(target, 'An admin updated your profile.');
      target.profile = cloudProfile(msg.profile, target.id);
      target.secretBacks=target.profile.ownedBacks.filter(id=>SECRET_BACK_IDS.has(id));
      Object.assign(target, { look: target.profile.look, chair: target.profile.equippedChair, back: target.profile.equippedBack,
        capeColor: target.profile.capeColor, pet: target.profile.equippedPet, petTier: target.profile.equippedPetTier,
        wins: target.profile.wins, cards: sanitizeCards(target.profile.cards), tradeInventory: tradeInventory(target.profile) });
      this.send(target, { t: 'profileAdjusted', profile: target.profile, revision: msg.revision });
      this.broadcastPlayer(target);
      return true;
    }
    if (action === 'coins'  && ['set', 'add'].includes(msg.operation) && Number.isSafeInteger(msg.amount)
      && msg.amount >= (msg.operation === 'set' ? 0 : -1000000000) && msg.amount <= 1000000000) {
      this.send(target, { t: 'coinAdjust', operation: msg.operation, amount: msg.amount, receipt: globalThis.crypto.randomUUID() });
      return true;
    }
    if (action === 'addCard' && typeof msg.cardId === 'string' && Object.hasOwn(CARDS_BY_ID, msg.cardId)) {
      target.cards[msg.cardId] = Math.min(9999, (target.cards[msg.cardId] || 0) + 1);
      const receipt = { t: 'adminCard', cardId: msg.cardId, receipt: globalThis.crypto.randomUUID() };
      this.remember(target, receipt.receipt, receipt); this.send(target, receipt);
      return true;
    }
    return false;
  }

  onAdmin(player, msg) {
    if (!this.allow(player, 'admin')) return;
    if (!player.isAdmin) return this.denied(player);
    switch (msg.action) {
      case 'listProfiles':
      case 'getProfile':
      case 'saveProfile': {
        const action = { listProfiles: 'list', getProfile: 'get', saveProfile: 'save' }[msg.action];
        return this.onAdminProfile(action, msg).then(async result => {
          if (action !== 'list' && result.guest) {
            result = msg.roomCode && msg.roomCode !== this.code
              ? await this.onAdminEdit(msg.roomCode, `profile-${action}`, msg)
              : this.adminProfile(action, msg);
          }
          if (action === 'save' && result.guest) {
            const wins = await this.onSetWins({ id: msg.id, name: result.profile.name, wins: result.profile.wins });
            result.profile.winsRevision = wins.revision;
            const fields = { ...msg, profile: result.profile };
            if (msg.roomCode && msg.roomCode !== this.code) await this.onAdminEdit(msg.roomCode, 'profile', fields);
            else this.editPlayer('profile', fields);
          }
          this.send(player, { t: action === 'list' ? 'adminProfiles' : 'adminProfile', id: msg.id, saved: action === 'save', ...result });
        }).catch(error => this.send(player, { t: 'error', code: 'profile_edit_failed', message: error.message || 'Could not edit that profile.' }));
      }
      case 'takeHost': this.hostId = player.id; this.broadcastRoom(); break;
      case 'forceStart': this.hostStart(); break;
      case 'endMatch': this.cancelMatch(); break;
      case 'reset':
        if (ACTIVE_PHASES.has(this.match.phase)) this.cancelMatch(false);
        for (const player of this.players.values()) this.refundStake(player);
        this.cancel(this.phaseTimer); this.stopBot();
        for (const p of this.players.values()) { p.seat = -1; this.broadcastPlayer(p); }
        this.settings = { ...DEFAULT_SETTINGS, public: this.code === PUBLIC_ROOM_CODE };
        this.enterLobby(); this.broadcastRoom(); this.broadcastMatch(); this.reportListing(); break;
      case 'announce': {
        const text = sanitizeChat(msg.text, this.settings.allowSwearing);
        if (text) {
          if (msg.global === true) this.onGlobalAnnouncement({ text, name: player.name });
          else this.broadcast({ t: 'announce', text });
        }
        break;
      }
      case 'coins': {
        if (msg.roomCode && msg.roomCode !== this.code && ROOM_CODE_REGEX.test(msg.roomCode)) return this.onAdminEdit(msg.roomCode, 'coins', msg).catch(() => this.send(player, { t: 'error', code: 'edit_failed', message: 'That player is no longer in the room.' }));
        this.editPlayer('coins', msg); break;
      }
      case 'addCard': {
        if (msg.roomCode && msg.roomCode !== this.code && ROOM_CODE_REGEX.test(msg.roomCode)) return this.onAdminEdit(msg.roomCode, 'addCard', msg)
          .then(() => this.send(player, { t: 'adminCardResult', cardId: msg.cardId }))
          .catch(() => this.send(player, { t: 'error', code: 'edit_failed', message: 'That player is no longer in the room.' }));
        if (this.editPlayer('addCard', msg)) this.send(player, { t: 'adminCardResult', cardId: msg.cardId });
        break;
      }
      case 'freeMerge': {
        if (typeof msg.petId === 'string' && Object.hasOwn(PETS_BY_ID, msg.petId) && Number.isInteger(msg.tier) && msg.tier >= 1 && msg.tier < 3) {
          this.send(player, { t: 'petMergeGrant', petId: msg.petId, tier: msg.tier + 1, receipt: globalThis.crypto.randomUUID() });
        }
        break;
      }
      case 'grantPet': {
        if (typeof msg.petId !== 'string' || !Object.hasOwn(PETS_BY_ID, msg.petId)) return;
        const target = this.players.get(msg.id || player.id);
        if (!target || target.isBot) return this.send(player, { t: 'error', code: 'pet_grant_failed', message: 'That player is no longer here.' });
        const receipt = { t: 'petMergeGrant', petId: msg.petId, tier: 1, receipt: globalThis.crypto.randomUUID() };
        this.remember(target, receipt.receipt, receipt);
        this.send(target, receipt);
        this.send(player, { t: 'adminPetResult', petId: msg.petId, name: target.name });
        break;
      }
      case 'grant': {
        const target = this.players.get(msg.id);
        if (target && !target.isBot && Number.isInteger(msg.coins) && msg.coins > 0 && msg.coins <= 100000) this.send(target, { t: 'grant', coins: msg.coins, reason: 'admin' });
        break;
      }
      case 'listRooms': return this.onListRooms().then(({ rooms, leaders }) => { if (player.connected) this.send(player, { t: 'adminRooms', rooms, leaders }); });
      case 'shutdownRoom': {
        const code = String(msg.code || '').toUpperCase();
        if (!ROOM_CODE_REGEX.test(code)) return;
        if (code === this.code) return this.shutdownRoom();
        return this.onShutdownRoom(code).then(() => { if (player.connected) this.send(player, { t: 'adminRoomShutdown', code }); }).catch(() => this.send(player, { t: 'error', code: 'shutdown_failed', message: 'Could not shut down that room.' }));
      }
      case 'setWins': {
        if (typeof msg.id !== 'string' || !ID_RE.test(msg.id) || !Number.isSafeInteger(msg.wins) || msg.wins < 0 || msg.wins > 1000000000) return;
        const target = this.players.get(msg.id);
        const name = target?.name || sanitizeName(msg.name) || msg.id;
        return this.onSetWins({ id: msg.id, name, wins: msg.wins }).then(result => {
          if (target) { target.wins = result.wins; this.broadcastPlayer(target); this.send(target, { t: 'winsSync', wins: result.wins, revision: result.revision }); }
          this.send(player, { t: 'winsSetResult', id: msg.id, name, wins: result.wins });
        }).catch(() => this.send(player, { t: 'error', code: 'wins_update_failed', message: 'Could not update those wins.' }));
      }
      case 'removeLeaderboard': if (typeof msg.id === 'string' && ID_RE.test(msg.id)) this.onRemoveLeaderboard(msg.id); break;
      case 'tag': if (typeof msg.on === 'boolean') { player.adminTag = msg.on; this.broadcastPlayer(player); } break;
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

  roomTable() {
    const settings = ACTIVE_PHASES.has(this.match.phase) ? this.match.settings : this.settings;
    const mode = settings?.mode;
    const tables = { classic: 'classic', blitz: 'lava', long: 'royal', sudden: 'ice', random: 'galaxy', chaos: 'donut', roulette: 'poker', roulette_deadly: 'poker' };
    return tables[mode === 'custom' ? settings.baseMode : mode] ?? 'classic';
  }
  reportListing() {
    const players = [...this.players.values()].filter(p => !p.isBot && p.connected).map(p => ({ id: p.id, name: p.name }));
    this.onListing({ code: this.code, humans: players.length, public: this.settings.public, players });
  }

  // ---- Host actions -------------------------------------------------------------------

  hostStart() {
    const { phase } = this.match;
    if ((phase === 'lobby' || phase === 'countdown') && this.readyPlayers().length >= (this.settings.mode === 'word_tide' ? 1 : 2)) this.startMatch();
  }

  addBot(host) {
    const seat = this.freeSeat();
    if (this.players.size >= MAX_PLAYERS || seat < 0) return this.send(host, systemChat('The room is full.'));
    const names = new Set([...this.players.values()].map((p) => p.name));
    const id = `bot-${(++this.botSerial).toString(36).padStart(4, '0')}`;
    const bot = this.addPlayer({ id, isBot: true, conn: null, ...botProfile(this.random, names, this.settings.botLevel),name:`bot-${this.code}-${this.botSerial}` });
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

  // Ordinary settings apply next match. Selecting Word Tide starts its room-wide event.
  changeSettings(input, actor) {
    if (input?.mode === 'word_tide' && this.match.mode !== 'word_tide' && ACTIVE_PHASES.has(this.match.phase)) this.cancelMatch();
    const next = sanitizeSettings(input, this.settings);
    next.public = this.code === PUBLIC_ROOM_CODE;
    if (next.mode !== this.settings.mode && actor?.rouletteBet) {
      return this.send(actor, { t: 'error', code: 'entry_committed', message: 'Your entry is committed. Play the round or leave and forfeit it before changing modes.' });
    }
    if (next.mode !== this.settings.mode) for (const player of this.players.values()) this.refundStake(player);
    const preset = input?.mode && input.mode !== 'custom' && MODES.some(mode => mode.id === input.mode);
    if (preset) {
      if (ACTIVE_PHASES.has(this.match.phase) || this.match.phase === 'ended') this.pendingPresetBotReset = true;
      else for (const bot of [...this.players.values()].filter(player => player.isBot)) this.removePlayer(bot.id);
    }
    if (Object.keys(next).every((k) => next[k] === this.settings[k])) {
      this.syncCountdown();
      if (preset) this.broadcastRoom();
      if (input?.mode === 'word_tide' && ['lobby','countdown'].includes(this.match.phase)) this.startMatch();
      return;
    }
    const botLevelChanged = next.botLevel !== this.settings.botLevel;
    this.settings = next;
    if (botLevelChanged) for (const bot of this.players.values()) if (bot.isBot) { bot.pet = botPet(this.random, next.botLevel); this.broadcastPlayer(bot); }
    this.syncHazards();
    this.syncCountdown();
    this.broadcastRoom();
    this.reportListing();
    if (input?.mode === 'word_tide' && ['lobby', 'countdown'].includes(this.match.phase)) this.startMatch();
  }

  // ---- Match flow ---------------------------------------------------------------------

  setPhase(phase, duration = null, onEnd = null) {
    const m = this.match;
    this.cancel(this.phaseTimer);
    this.stopBot();
    m.phase = phase;
    m.duration = duration;
    m.endsAt = duration === null ? null : this.now() + duration;
    this.refreshPresencePhase();
    this.phaseTimer = onEnd ? this.schedule(onEnd, duration) : null;
  }

  // Outside matches the phase just follows the number of seated players.
  autoStartReady() {
    const ready = this.readyPlayers();
    return isRouletteMode(this.settings.mode) ? ready.filter(player => !player.isBot).length >= 2 : ready.length >= 2;
  }

  enterLobby() {
    if (this.pendingPresetBotReset) {
      this.pendingPresetBotReset = false;
      for (const bot of [...this.players.values()].filter(player => player.isBot)) {
        this.players.delete(bot.id);
        this.broadcast({ t: 'leave', id: bot.id });
      }
      this.reportListing();
    }
    for (const p of this.players.values()) this.clearCardQueue(p);
    this.match = newMatch();
    if (this.autoStartReady()) this.setPhase('countdown', isRouletteMode(this.settings.mode) ? ROULETTE_COUNTDOWN_MS : COUNTDOWN_MS, () => this.startMatch());
    else this.setPhase('lobby');
    this.syncHazards();
  }

  syncCountdown() {
    const { phase } = this.match;
    const ready = this.autoStartReady();
    if ((phase === 'lobby' && ready) || (phase === 'countdown' && !ready)) {
      this.enterLobby();
      this.broadcastMatch();
    }
  }

  startMatch(trophyCheck = undefined) {
    if (this.trophyCheckPending && trophyCheck === undefined) return;
    const seated = this.readyPlayers();
    if (seated.length < (this.settings.mode === 'word_tide' ? 1 : 2)) return;
    const settings = { ...this.settings };
    const trophyCandidate=isRouletteMode(settings.mode)&&seated.some(p=>!p.isBot);
    if (trophyCandidate && trophyCheck === undefined) {
      this.trophyCheckPending = true;
      const pendingMatch = this.match;
      const playerIds = seated.filter(p=>!p.isBot).map(p => p.id);
      const finish = result => {
        this.trophyCheckPending = false;
        const unchanged = this.match === pendingMatch && ['lobby', 'countdown'].includes(this.match.phase) && this.settings.mode === settings.mode
          && JSON.stringify(this.readyPlayers().filter(p=>!p.isBot).map(p => p.id)) === JSON.stringify(playerIds);
        if (!unchanged) return;
        if(!result?.ok){
          for(const p of seated)if(!p.isBot){this.refundStake(p);this.send(p,{t:'error',code:'trophy_required',message:result?.error||'Earn 1 trophy before playing The Last Sip. Your trophy is never spent.'});}
          this.enterLobby();this.broadcastMatch();return;
        }
        return this.startMatch({});
      };
      try {
        const result = this.onCheckTrophies(playerIds);
        return result?.then ? result.then(finish, () => finish({ ok: false, error: 'Trophy check unavailable.' })) : finish(result);
      } catch { return finish({ ok: false, error: 'Trophy check unavailable.' }); }
    }
    for (const p of this.players.values()) this.clearCardQueue(p);
    this.match = newMatch();
    this.match.settings = settings;
    this.match.mode = settings.mode;
    this.match.startedAt = this.now();
    this.match.matchId = `${this.code}-${this.now()}-${++this.matchSerial}`;
    this.match.humans = seated.filter(p => !p.isBot).length;
    const botAtTable = seated.some(p => p.isBot);
    const signedIn = seated.filter(p => !p.isBot && p.accountCreatedAt != null).length;
    const youngAccount = isRouletteMode(settings.mode) && seated.some(p => !p.isBot && p.accountCreatedAt != null && this.now() - p.accountCreatedAt < TRADE_ACCOUNT_AGE_MS);
    this.match.practice = this.match.humans < 2 || botAtTable || (isRouletteMode(settings.mode) && (signedIn < 2 || signedIn !== this.match.humans || youngAccount)) || !!trophyCheck?.practiceReason;
    this.match.practiceReason = botAtTable ? 'Bots are at the table.' : this.match.humans < 2 ? 'Two real players are required.' : isRouletteMode(settings.mode) && signedIn < 2 ? 'Two signed-in players are required.' : isRouletteMode(settings.mode) && signedIn !== this.match.humans ? 'Everyone at the table must sign in.' : youngAccount ? 'An account at the table is less than 24 hours old.' : trophyCheck?.practiceReason || '';
    this.match.participants = seated.map((p) => {
      const ability = settings.petAbilities ? petAbility(p.pet, settings.mode) : null;
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
    if (settings.mode === 'word_tide') return this.startTide();
    if (isRouletteMode(settings.mode)) return this.startRoulette(seated);
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

  startTurn(typerId, sabotageMs = 0, dragon = false, revealed = false) {
    const m = this.match;
    if (!revealed && this.players.get(typerId)?.cardQueue) {
      m.typerId = typerId;
      m.turnId = ++this.turnSerial;
      // Locked, bounded presentation window; browsing never controls the clock.
      this.setPhase('cardReveal', 5200, () => this.startTurn(typerId, sabotageMs, dragon, true));
      const player = this.players.get(typerId), queue = player?.cardQueue;
      this.clearCardQueue(player);
      this.broadcastMatch();
      if (queue && player.connected) this.onCard(player, { ...queue, turnId: m.turnId }, true);
      return;
    }
    // A skip grants relief without losing a heart. Consume queued skips only once.
    for (let i = 0; i < m.participants.length && this.participant(typerId)?.pending.skip; i++) {
      this.participant(typerId).pending.skip = false;this.participant(typerId).jammed=false;
      this.broadcast({ t: 'cardUsed', actorId: null, targetId: typerId, cardId: 'skip', effect: 'skipped' });
      return this.startTurn(this.nextAlive(typerId), sabotageMs, dragon);
    }
    const participant = this.participant(typerId);
    if (!participant) return;
    const { ability } = participant;
    const modeRules = rules(m.settings.baseMode || m.mode, m);
    const bonus = (type) => (ability?.type === type ? ability.value : 0);
    const shrunk = modeRules.turnMs(m.wordCount);
    const burnPenalty=(participant.burns||[]).length;
    participant.burns=(participant.burns||[]).map(n=>n-1).filter(n=>n>0);
    const reduction=Math.max(0,sabotageMs/1000+participant.pending.time+burnPenalty-bonus('penaltyResist'));
    let turnMs = Math.max(burnPenalty?Math.max(6000,modeRules.floor):modeRules.floor, shrunk + bonus('time') * 1000 - reduction*1000);
    if(dragon&&ability?.type==='dragonGuard'&&!participant.dragonGuardUsed){participant.dragonGuardUsed=true;dragon=false;this.broadcast({t:'petCounter',id:typerId,kind:'Blaze blocked'});}
    if (dragon) turnMs = Math.min(turnMs, 3000);
    if(ability?.type==='timeFloor'&&(reduction>0||dragon))turnMs=Math.max(turnMs,Math.min(shrunk,ability.value*1000));
    m.typerId = typerId;
    if (!revealed) m.turnId = ++this.turnSerial;
    m.turnStartAt = this.now();
    m.firstKeyAt = null;
    m.minLength = modeRules.minLength(m.wordCount);
    m.mistakes = 0;
    m.maxMistakes = Math.max(1, modeRules.maxMistakes + (modeRules.maxMistakes === 1 ? 0 : bonus('mistakes')) - participant.pending.mistakes - (participant.mistakePenalty||0));
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
    this.noteActivity(player,true);

    const reason = this.rejectReason(word);
    if (reason) {
      this.participant(player.id).combo = 0;
      m.mistakes++;
      this.broadcast({ t: 'result', id: player.id, word: displayWord(word, m.settings?.allowSwearing), ok: false, reason, mistakes: m.mistakes });
      if (m.mistakes >= m.maxMistakes) this.fail(player.id, 'mistakes');
      else this.broadcastMatch();
      return;
    }

    const participant = this.participant(player.id);
    const wpm = Math.min(250, Math.round((word.length / 5) * 60000 / Math.max(250, this.now() - (m.firstKeyAt ?? m.turnStartAt))));
    const paidAnswer = participant.hintedTurn === m.turnId;
    const fast = !paidAnswer && wpm >= 45 && this.now() - m.turnStartAt <= m.duration * .6;
    participant.combo = fast ? participant.combo + 1 : 0;
    if (!paidAnswer) participant.bestWpm = Math.max(participant.bestWpm, wpm);
    participant.bestCombo = Math.max(participant.bestCombo, participant.combo);
    const multiplier = participant.combo >= 8 ? 3 : participant.combo >= 5 ? 2 : participant.combo >= 3 ? 1.5 : 1;
    const coins = paidAnswer ? 0 : Math.round(REWARDS.perWord * multiplier) + Math.max(0, Math.min(16, Math.floor((wpm - 40) / 8)));
    if (!m.practice) participant.coins += coins;
    const flairs = [];
    const flair = (id, amount) => {
      if (paidAnswer) return;
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
    this.broadcast({ t: 'result', id: player.id, word, ok: true, wpm, combo: participant.combo, paidAnswer: participant.hintedTurn === m.turnId, coins: m.practice ? 0 : coins + flairs.reduce((n, f) => n + f.coins, 0), flairs });
    m.prefix = this.nextPrefix(word);
    participant.jammed=false;
    const { ability } = participant;
    this.startTurn(this.nextAlive(player.id), ability?.type === 'sabotage' ? ability.value * 1000 : 0, ability?.type === 'dragon' && this.random() < .5);
  }

  rejectReason(word) {
    const m = this.match;
    if (!/^[a-z]+$/.test(word)) return 'invalid_chars';
    if (word.length < m.minLength) return 'too_short';
    if (!word.startsWith(m.prefix)) return 'wrong_start';
    if (m.used.has(word)) return 'used';
    if (word.length > MAX_WORD_LENGTH || (!this.dict.has(word) && !(m.settings?.allowSwearing && ALLOWED_SWEARS.has(word)))) return 'not_word';
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
    // Require familiar unused answers, and do not repeat a two-letter prompt.
    const common = this.botDicts.normal || this.botDict;
    const minCommon = 8;
    const viable = !new Set(['ol', 'py', 'up', 'ty']).has(two)
      && !m.twoLetterPrefixes.has(two)
      && common.countPrefix(two, m.used) >= minCommon
      && this.dict.countPrefix(two, m.used) >= modeRules.twoLetterMinimum;
    if (viable && this.random() < modeRules.twoLetterChance(m.wordCount)) {
      m.twoLetterPrefixes.add(two);
      return two;
    }
    return word.slice(-1);
  }

  /** A participant failed (timeout / mistakes) or dropped out (forfeit / left). */
  fail(id, cause) {
    const m = this.match;
    const participant = this.participant(id);
    if (!ACTIVE_PHASES.has(m.phase) || !participant?.alive) return;
    if (m.mode === 'word_tide') return this.tideOut(id);
    if (isRouletteMode(m.mode)) return this.rouletteOut(id);
    const endsRound = id === m.typerId || id === m.chooserId; // the round cannot go on without them

    let shielded = false;
    participant.combo = 0;if(id===m.typerId)participant.jammed=false;
    if (cause === 'forfeit' || cause === 'left') {
      participant.hearts = 0;
    } else if (participant.shield) {
      participant.shield = false;
      shielded = true;
    } else {
      participant.hearts--;
    }
    this.clearCardQueue(this.players.get(id), 'heart_lost');
    if (!shielded) participant.lostHeart = true;
    this.broadcast({ t: 'fail', id, cause, hearts: participant.hearts, shielded });
    if (participant.hearts === 0) {
      participant.alive = false;
      for (const p of this.players.values()) if (p.cardQueue?.targetId === id) this.clearCardQueue(p, 'target_left');
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
    if (m.mode === 'word_tide') return this.endTide(winnerId ? [winnerId] : []);
    if (isRouletteMode(m.mode)) return this.endRoulette(winnerId);
    if (!this.canAward(winnerId)) winnerId = null;
    m.paid = true;this.returnArmedCards();
    for (const p of this.players.values()) this.clearCardQueue(p);
    const durationMs = Math.max(0, this.now() - m.startedAt);
    const contributors = m.participants.filter(p => !p.isBot && p.words > 0).length;
    const eligibleMs = contributors >= 2 ? Math.min(durationMs, m.wordCount * 30000) : 0;
    const winBonus = Math.floor(Math.min(REWARDS.maxWin, eligibleMs / 60000 * REWARDS.winPerMinute));
    const flairs = [];
    const winnerParticipant = this.participant(winnerId);
    if (winnerParticipant && !m.practice) {
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
    this.broadcast({ t: 'win', id: winnerId, flairs, practice: m.practice, practiceReason: m.practiceReason });
    const winner = this.players.get(winnerId);
    if (winner && !m.practice && !winner.isBot) {
      winner.wins++;
      this.broadcastPlayer(winner);
      if (!winner.isBot && m.humans >= 2) this.onWin({ playerId: winner.id, name: winner.name, humans: m.humans });
    }
    this.broadcast(systemChat(m.practice ? `Practice finished. ${m.practiceReason || 'No match coins or wins.'}` : winner ? `${winner.name} won the match!` : 'Nobody won this match.'));
    for (const part of m.participants) {
      const { id, words, bestWpm, bestCombo } = part;
      part.pending = { skip: false, time: 0, mistakes: 0 };
      const player = this.players.get(id);
      if (!player || player.isBot || !this.canAward(part.id)) continue;
      const won = !m.practice && id === winnerId;
      const bonuses = [...part.bonuses, ...(won ? [{ label: 'Time played', coins: winBonus }] : [])];
      const coins = m.practice ? 0 : REWARDS.participation + part.coins + bonuses.reduce((n, b) => n + b.coins, 0);
      this.send(player, { t: 'reward', matchId: m.matchId, coins, won, practice: m.practice, words, durationMs, eligibleMs, bestWpm, bestCombo, bonuses: m.practice ? [] : bonuses });
    }
    this.broadcastMatch();
  }

  cancelMatch(animate = true) {
    const m = this.match;
    if (!ACTIVE_PHASES.has(m.phase) || m.paid) return;
    this.cancel(this.phaseTimer); this.stopBot();
    for (const player of this.players.values()) this.clearCardQueue(player, 'match_cancelled');
    for (const part of m.participants) {
      const player = this.players.get(part.id);
      if (!player || player.isBot) continue;
      const cards = m.cardHistory.filter(event => event.actorId === part.id&&!event.returned).map(event => event.cardId);
      for (const id of cards) player.cards[id]++;
      const coins = (isRouletteMode(m.mode) ? (m.stakes[part.id] || 0)+(m.excessStakes?.[part.id]||0) : 0) + (part.hintSpent || 0);
      const receipt = { t: 'matchRefund', matchId: m.matchId, coins, cards, receipt: `cancel:${m.matchId}:${part.id}` };
      this.remember(player, receipt.receipt, receipt); this.send(player, receipt);
    }
    m.paid = true;
    m.cancelled = true;
    this.broadcast(systemChat('The room owner ended the game. Entries, answers, and played cards were refunded.'));
    if (m.tide && animate) {
      m.tide.winners = []; m.winnerId = null;
      this.prepareTideFinale();
      this.setPhase('ended', TIDE.outro + m.tide.endingHoldMs, () => { this.enterLobby(); this.broadcastRoom(); this.broadcastMatch(); });
      this.broadcastRoom(); this.broadcastMatch(); return;
    }
    this.enterLobby(); this.broadcastRoom(); this.broadcastMatch();
  }

  // ---- Cursed cup: server-owned hidden draw, turns, stakes and payout -----------------

  syncHazards() {
    const mode = ACTIVE_PHASES.has(this.match.phase) || this.match.phase === 'ended' ? this.match.mode : this.settings.mode;
    const on = isRouletteMode(mode);
    if (on && !this.fireMode) { this.rouletteHazardsAt = this.now() + ROULETTE_INTRO_MS; this.broadcast({t:'chat',id:null,name:'System',text:'☄️ Meteors will begin falling in 10 seconds! Stay clear of the burning craters.',tone:'alert'}); }
    if (on && !this.fireMode) this.scheduleMeteor();
    if (!on && this.fireMode) { this.cancel(this.meteorTimer); this.meteorTimer=null; this.meteor=null; this.broadcast({t:'meteor',meteor:null}); }
    this.fireMode = on;
    for (const p of this.players.values()) this.syncFire(p);
  }

  meteorView() {
    return this.meteor ? {...this.meteor, fallsIn:Math.max(0,this.meteor.fallAt-this.now()), landsIn:Math.max(0,this.meteor.landAt-this.now())} : null;
  }

  scheduleMeteor() {
    this.meteorTimer = this.schedule(() => {
      this.meteorTimer = null;
      if (!this.fireMode) return;
      const site = pickRandom(METEOR_SITES, this.random);
      this.meteor = {...site,id:`meteor:${this.code}:${this.now()}:${++this.matchSerial}`,fallAt:this.now()+METEOR_WARNING_MS,landAt:this.now()+METEOR_WARNING_MS+METEOR_FLIGHT_MS};
      this.broadcast({t:'meteor',meteor:this.meteorView()});
      this.broadcast({ t: 'chat', id: null, name: 'System', text: '☄️ A purple meteor will fall in 10 seconds! Stay clear of the impact.', tone: 'alert' });
      for (const p of this.players.values()) this.syncFire(p);
      this.scheduleMeteor();
    }, METEOR_INTERVAL_MS);
  }

  onCollectMeteor(player, msg) {
    if (!this.allow(player,'collectMeteor')) return;
    const meteor=this.meteor;
    if (!this.fireMode || !meteor || msg.id!==meteor.id || this.now()<meteor.landAt || player.seat>=0 || !player.connected
      || !player.pos || Math.hypot(player.pos.x-meteor.x,player.pos.z-meteor.z)>3.5 || Math.abs(player.pos.y)>3) return;
    this.meteor=null;
    const reward={t:'meteorReward',coins:150,receipt:meteor.id};
    this.remember(player,meteor.id,reward);this.send(player,reward);
    this.broadcast({t:'meteor',meteor:null,collected:{id:meteor.id,x:meteor.x,z:meteor.z,by:player.id}});
  }

  fireActive(player) {
    return player.connected && !player.isBot && player.seat < 0 && (inRouletteFire(player.pos) || this.meteor && player.pos && Math.abs(player.pos.y)<2 && Math.hypot(player.pos.x-this.meteor.x,player.pos.z-this.meteor.z)<2.1)
      && this.fireMode;
  }

  syncFire(player) {
    if (!this.fireActive(player)) { this.cancel(player.fireTimer); player.fireTimer = null; return; }
    if (player.fireTimer != null) return;
    const special = this.meteor && Math.hypot(player.pos.x-this.meteor.x,player.pos.z-this.meteor.z)<2.1;
    const wait = Math.max(0, (special ? this.meteor.landAt : this.rouletteHazardsAt) - this.now(), (player.fireReadyAt || 0) - this.now()) + 1000;
    player.fireTimer = this.schedule(() => {
      player.fireTimer = null;
      if (!this.fireActive(player)) return;
      const receipt = `fire:${this.code}:${player.id}:${this.now()}:${++this.matchSerial}`;
      const debit = {t:'hazardDebit',amount:50,belowMinimum:'halve',receipt};
      this.remember(player,receipt,debit); this.send(player,debit);
      this.syncFire(player);
    }, wait);
  }

  onBet(player, msg) {
    this.request(player, 'bet', msg, () => {
      const result = { t: 'betResult', requestId: msg.requestId, ok: false };
      if (!isRouletteMode(this.settings.mode) || !['lobby', 'countdown'].includes(this.match.phase) || player.seat < 0 || player.seat >= SEAT_COUNT) return { ...result, error: 'Sit at the table between matches first.' };
      if (!Number.isSafeInteger(msg.amount) || msg.amount < 25 || !Number.isSafeInteger(msg.balance) || msg.balance < msg.amount) return { ...result, error: 'Your balance or the entry amount changed.' };
      if (player.rouletteBet) return { ...result, error: 'You already entered this match.' };
      const receipt = `${this.code}:${player.id}:${this.now()}:${++this.matchSerial}`;
      player.rouletteBet = { amount: msg.amount, receipt };
      this.broadcastPlayer(player);
      this.syncCountdown();
      return { ...result, ok: true, amount: msg.amount, receipt };
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
    m.roulette = { houseEdge: .10, payoutCap: 0, pot: 0, basePot: 0, multiplier: 1, risk: rouletteRules(m.mode).startingRisk, turns: 0, loops: 0, cycle: new Set(), passed: new Set(), event: null, serial: 0 };
    m.stakes = {};m.excessStakes={};
    const matched=Math.min(...seated.map(player=>player.isBot?this.rouletteEntry:player.rouletteBet?.amount||0));
    m.roulette.matchedStake=matched;
    for (const player of seated) {
      const amount = player.isBot ? this.rouletteEntry : player.rouletteBet?.amount || 0;
      m.stakes[player.id] = matched; m.excessStakes[player.id]=amount-matched;
      m.roulette.pot += matched;
      player.rouletteBet = null;
      this.broadcastPlayer(player);
    }
    m.roulette.basePot = m.roulette.pot;
    m.roulette.payoutCap = roulettePayoutCap(m.roulette.basePot);
    m.roulette.pot = Math.floor(m.roulette.basePot * .8);
    for (const p of m.participants) { p.hearts = p.maxHearts = 1; p.shield = p.ability?.type === 'antidote'; }
    this.resetBottle();
    this.rouletteTurn(pickRandom(m.participants, this.random).id);
  }

  resetBottle() {
    this.match.round++;
  }

  rouletteTurn(id) {
    const m = this.match;
    if (!this.participant(id)?.alive) id = m.participants.find(p => p.alive)?.id;
    m.typerId = id;
    m.turnId = ++this.turnSerial;
    const ability = this.participant(id)?.ability;
    this.setPhase('roulette', 10000 + (ability?.type === 'sipTime' ? ability.value * 1000 : 0), () => this.rouletteAction(id, 'drink'));
    this.broadcastMatch();
    if (this.players.get(id)?.isBot) this.runBot([{ wait: 1500 + this.random() * 2000, run: () => this.rouletteAction(id, this.random() < .35 && !m.roulette.passed.has(id) ? 'pass' : 'drink') }]);
  }

  onRoulette(player, msg) {
    if (!this.allow(player, 'roulette') || this.match.phase !== 'roulette' || this.match.typerId !== player.id || msg.turnId !== this.match.turnId) return;
    if (!['drink', 'pass', 'double'].includes(msg.action)) return;
    if(msg.action==='pass'&&this.match.roulette.passed.has(player.id)||msg.action==='double'&&this.match.roulette.doubleSurvivors?.has(player.id))return;
    this.noteActivity(player,true);
    this.rouletteAction(player.id, msg.action);
  }

  rouletteAction(id, action) {
    const m = this.match;
    if (m.phase !== 'roulette' || m.typerId !== id || !this.participant(id)?.alive) return;
    const r = m.roulette;
    if (action === 'pass' && r.passed.has(id)) return;
    if (action === 'double' && r.doubleSurvivors?.has(id)) return;
    const next = this.nextAlive(id);
    const part = this.participant(id), ability = part.ability;
    if (action === 'pass') {
      r.passCounts ??= {}; r.passCounts[id] = (r.passCounts[id] || 0) + 1;
      if (r.passCounts[id] >= 1 + (ability?.type === 'extraPass' ? ability.value : 0)) r.passed.add(id);
    }
    const { risk } = this.sipOdds(id, action);
    let poisoned = action !== 'pass' && this.random() < risk, shielded = false;
    if (poisoned && part.shield) { part.shield = false; poisoned = false; shielded = true; }
    if (action === 'double') r.doubleSurvivors ??= new Set();
    if (action === 'double' && !poisoned) r.doubleSurvivors.add(id);
    r.event = { id, action, poisoned, shielded, risk, serial: ++r.serial, next };
    this.setPhase('rouletteReveal', action !== 'pass' ? ROULETTE_DRINK_MS : ROULETTE_PASS_MS, () => {
      r.turns++;
      r.cycle.add(id);
      if (poisoned) this.rouletteOut(id, next);
      else this.advanceRoulette(next);
    });
    this.broadcastMatch();
  }

  advanceRoulette(next) {
    this.completeRouletteCircuit();
    this.rouletteTurn(next);
  }

  completeRouletteCircuit() {
    const m = this.match, r = m.roulette;
    if (!m.participants.filter(p => p.alive).every(p => r.cycle.has(p.id))) return;
    r.cycle.clear();
    r.loops++;
    r.multiplier = Math.min(2, rouletteRules(m.mode).prizeGrowth ** r.loops);
    r.pot = Math.min(roulettePayoutCap(r.basePot), Math.floor(r.basePot * .8 * r.multiplier));
    r.risk = Math.min(.95, r.risk + rouletteRules(m.mode).riskStep);
    this.resetBottle();
  }

  rouletteOut(id, next = this.nextAlive(id)) {
    const m = this.match, part = this.participant(id);
    if (!part?.alive) return;
    part.alive = false; part.hearts = 0;
    this.broadcast({ t: 'rouletteOut', id });
    const alive = m.participants.filter(p => p.alive);
    if (alive.length <= 1) { if (alive.length) this.completeRouletteCircuit(); return this.endRoulette(alive[0]?.id || null); }
    this.advanceRoulette(next);
  }

  endRoulette(winnerId) {
    const m = this.match;
    if (m.paid) return;
    if (!this.canAward(winnerId)) winnerId = null;
    m.paid = true; m.winnerId = winnerId;
    this.setPhase('ended', MATCH_END_MS, () => { this.enterLobby(); this.broadcastRoom(); this.broadcastMatch(); });
    this.broadcast({ t: 'win', id: winnerId, flairs: [], practice: m.practice, practiceReason: m.practiceReason });
    for (const part of m.participants) {
      const player = this.players.get(part.id);
      if (!player || player.isBot || !this.canAward(part.id)) continue;
      const doubleBonus = part.id === winnerId && m.roulette.doubleSurvivors?.has(part.id) ? Math.floor((m.stakes[part.id] || 0) * m.roulette.multiplier) : 0;
      const petBonus = part.id === winnerId && part.ability?.type === 'prizeBonus' ? Math.floor(m.roulette.pot * part.ability.value) : 0;
      const excess=m.excessStakes?.[part.id]||0;
      const coins = excess+(m.practice ? m.stakes[part.id] || 0 : winnerId ? (part.id === winnerId ? Math.min(roulettePayoutCap(m.roulette.basePot), m.roulette.pot + doubleBonus + petBonus) : 0) : m.stakes[part.id] || 0);
      const receipt = { t: 'rouletteReward', matchId: m.matchId, coins, won: !m.practice && part.id === winnerId, earnsTrophy:false, excessReturned:excess, practice: m.practice, words: 0, bestWpm: 0, bestCombo: 0, bonuses: [{ label: m.practice ? 'Practice entry returned' : winnerId ? `Cursed cup pool${doubleBonus ? ' + double sip' : ''}${petBonus ? ' + pet bonus' : ''} · 10%+ house fee${excess ? ` · ${excess} unmatched coins returned` : ''}` : 'Entry returned', coins }] };
      this.remember(player, `roulette:${m.matchId}`, receipt);
      this.send(player, receipt);
    }
    const winner = this.players.get(winnerId);
    // Last Sip wins do not mint sellable trophies; otherwise cheap alt rounds can farm coin sales.
    this.broadcastMatch();
  }

  sipOdds(id, action = 'drink') {
    const m = this.match, stakes = Object.values(m.stakes);
    const base = action === 'double' ? { risk: .6, reduction: 0 } : rouletteOdds(m.roulette.risk, m.stakes[id], stakes.reduce((sum, amount) => sum + amount, 0) / stakes.length);
    const ability = this.participant(id)?.ability;
    const petReduction = ability?.type === 'poisonResist' ? base.risk * ability.value : 0;
    return { risk: base.risk - petReduction, reduction: base.reduction + petReduction, petReduction };
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
    return [...this.players.values()].filter((p) => p.seat >= 0 && p.seat < SEAT_COUNT).sort((a, b) => a.seat - b.seat);
  }
  readyPlayers() {
    if (this.settings.mode === 'word_tide') return [...this.players.values()].filter(p => p.connected || p.isBot);
    return this.seated().filter(p => !isRouletteMode(this.settings.mode) || p.isBot || p.rouletteBet?.amount >= 25);
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

  safeWins(value) { return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000000) : 0; }

  matchView() {
    const m = this.match;
    return {
      matchId: m.matchId, cardHistory: m.cardHistory.map(({ requestId, ...event }) => event),
      phase: m.phase,
      practice: m.practice,
      practiceReason: m.practiceReason || '',
      phaseEndsIn: m.endsAt === null ? null : Math.max(0, m.endsAt - this.now()),
      phaseDuration: m.duration,
      participants: m.participants.map(({ id, hearts, maxHearts, alive, words, shield, combo, pending,defense,jammed,dragonGuardUsed,mistakeGuardUsed }) => ({ id, hearts, maxHearts, alive, words, shield, combo,defense:defense?{cardId:defense.cardId,ownerId:defense.ownerId}:null,jammed:!!jammed,dragonGuardUsed:!!dragonGuardUsed,mistakeGuardUsed:!!mistakeGuardUsed,pending: { ...pending } })),
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
      cancelled: !!m.cancelled,
      ...(m.tide ? { tide: this.tideView() } : {}),
      ...(m.roulette ? { roulette: { ...m.roulette, cycle: [...m.roulette.cycle], doubleSurvivors: [...(m.roulette.doubleSurvivors || [])], stakes: { ...m.stakes },excessStakes:{...m.excessStakes}, ...this.sipOdds(m.typerId, m.phase === 'rouletteReveal' ? m.roulette.event?.action : 'drink'), doubleRisk: this.sipOdds(m.typerId, 'double').risk, passLimit: 1 + (this.participant(m.typerId)?.ability?.type === 'extraPass' ? this.participant(m.typerId).ability.value : 0), baseRisk: m.phase === 'rouletteReveal' && m.roulette.event?.action === 'double' ? .6 : m.roulette.risk, passed: [...m.roulette.passed] } } : {}),
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
    this.broadcast({ t: 'room', hostId: this.hostId, settings: { ...this.settings }, table: this.roomTable(), public: this.settings.public, ...(isRouletteMode(this.settings.mode) ? { rouletteEntry: this.rouletteEntry } : {}) });
  }
}

Object.assign(GameEngine.prototype, wordTideMethods, presenceMethods);
