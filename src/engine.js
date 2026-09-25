// Server-authoritative game logic for one room (docs/SPEC.md §3 and §4).
// Pure and transport-agnostic: no Cloudflare or Node APIs. Time, timers and randomness
// are injected so tests can drive a room with a fake clock, and a connection is any
// object with send(obj) / close(code, reason).
import {
  PROTOCOL_VERSION, MAX_PLAYERS, SEAT_COUNT, MIN_WORD_LENGTH, MAX_WORD_LENGTH, BASE_MISTAKES,
  COUNTDOWN_MS, CHOOSE_MS, ROUND_END_MS, MATCH_END_MS, MIN_TURN_MS, ABS_MIN_TURN_MS,
  RECONNECT_GRACE_MS, DEFAULT_SETTINGS, REWARDS,
} from '../public/js/shared/constants.js';
import { PETS_BY_ID } from '../public/js/shared/catalog.js';
import { filterText } from './blocklist.js';
import { botProfile, planPick, planTurn } from './bots.js';
import {
  sanitizeName, randomPlayerName, sanitizeLook, sanitizeChair, sanitizePet, sanitizeChat,
  sanitizeTyping, normalizeWord, displayWord, sanitizeMove, sanitizeSettings,
} from './sanitize.js';

const HARD_LETTERS = [...'jkqvwxyz'];
const CHAIN_LENGTH = 12; // accepted words kept in MatchState.chain
const TWO_LETTER_MIN_WORDS = 25; // unused words needed before a two-letter prefix is allowed
const MOVES_INTERVAL_MS = 100; // `moves` batching, ~10 Hz
const MAX_MESSAGE_LENGTH = 2048;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLOSE_REPLACED = 4000; // the same player id connected from another socket
const CLOSE_REJECTED = 1008; // after error room_full / bad_hello
const ACTIVE_PHASES = new Set(['choosing', 'typing', 'roundEnd']);

// Token buckets per player and message kind: [tokens refilled per second, burst].
const RATE_LIMITS = {
  move: [15, 15],
  typing: [20, 20],
  submit: [5, 5],
  chat: [1000 / 600, 3],
  seat: [4, 6],
  loadout: [2, 5],
  host: [5, 10],
  ping: [2, 4],
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
  };
}

// Fields that only mean something during a choosing / typing phase.
const clearTurn = (m) =>
  Object.assign(m, { chooserId: null, options: null, typerId: null, prefix: null, mistakes: 0, maxMistakes: BASE_MISTAKES });

export class GameEngine {
  constructor({ code, dict, botDict, now, setTimeout, clearTimeout, random, onError = (err) => console.error('[engine]', err) }) {
    this.code = code;
    this.dict = dict;
    this.botDict = botDict;
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
      if (player?.conn === conn) this.dispatch(player, msg);
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
    });
  }

  guard(fn) {
    try {
      fn();
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
    const loadout = {
      name: sanitizeName(msg.name) || randomPlayerName(this.random),
      look: sanitizeLook(msg.look),
      chair: sanitizeChair(msg.chair),
      pet: sanitizePet(msg.pet),
    };
    let player = this.players.get(id);
    const isNew = !player;
    if (player) {
      // Resume after a reconnect, or take over from another tab (whose socket is closed).
      if (player.conn) this.closeConn(player.conn, CLOSE_REPLACED, 'replaced');
      this.cancel(player.graceTimer);
      Object.assign(player, loadout, { conn, connected: true, graceTimer: null });
    } else {
      if (this.players.size >= MAX_PLAYERS && !this.evictBot()) return this.reject(conn, 'room_full', 'This room is full.');
      player = this.addPlayer({ id, isBot: false, conn, ...loadout });
      this.hostId ??= id;
    }
    this.conns.set(conn, id);
    this.send(player, {
      t: 'welcome',
      you: id,
      code: this.code,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: [...this.players.values()].map((p) => this.view(p)),
      match: this.matchView(),
    });
    this.broadcast({ t: 'player', p: this.view(player) }, id);
    if (isNew) this.broadcast(systemChat(`${player.name} joined the game`));
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

  addPlayer({ id, isBot, conn, name, look, chair, pet }) {
    const player = {
      id, name, isBot, look, chair, pet,
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
    this.cancel(player.graceTimer);
    this.fail(id, 'left'); // knocked out if still playing
    this.players.delete(id);
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
    if (player.seat < 0 || !this.allow(player, 'seat')) return;
    this.fail(player.id, 'forfeit'); // standing up mid-match knocks you out
    player.seat = -1;
    this.broadcastPlayer(player);
    this.syncCountdown();
  }

  onPick(player, letter) {
    const m = this.match;
    if (m.phase === 'choosing' && player.id === m.chooserId && m.options.includes(letter)) this.pick(letter);
  }

  onTyping(player, text) {
    const m = this.match;
    if (m.phase === 'typing' && player.id === m.typerId && this.allow(player, 'typing')) {
      this.relayTyping(player, sanitizeTyping(text));
    }
  }

  relayTyping(player, text) {
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
    this.broadcastPlayer(player);
  }

  onHost(player, msg) {
    if (player.id !== this.hostId) {
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

  // ---- Host actions -------------------------------------------------------------------

  hostStart() {
    const { phase } = this.match;
    if ((phase === 'lobby' || phase === 'countdown') && this.seated().length >= 2) this.startMatch();
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
    const next = sanitizeSettings(input, this.settings);
    if (Object.keys(next).every((k) => next[k] === this.settings[k])) return;
    this.settings = next;
    this.broadcastRoom();
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
    this.match = newMatch();
    if (this.seated().length >= 2) this.setPhase('countdown', COUNTDOWN_MS, () => this.startMatch());
    else this.setPhase('lobby');
  }

  syncCountdown() {
    const { phase } = this.match;
    const ready = this.seated().length >= 2;
    if ((phase === 'lobby' && ready) || (phase === 'countdown' && !ready)) {
      this.enterLobby();
      this.broadcastMatch();
    }
  }

  startMatch() {
    const seated = this.seated();
    const settings = { ...this.settings };
    this.match = newMatch();
    this.match.settings = settings;
    this.match.participants = seated.map((p) => {
      const ability = (settings.petAbilities && PETS_BY_ID[p.pet]?.ability) || null;
      return {
        id: p.id,
        hearts: settings.hearts,
        maxHearts: settings.hearts,
        alive: true,
        words: 0,
        shield: ability?.type === 'shield', // unused shield
        ability, // locked in for the whole match
      };
    });
    this.startRound(pickRandom(this.match.participants, this.random).id);
  }

  startRound(chooserId) {
    const m = this.match;
    clearTurn(m);
    m.round++;
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

  startTurn(typerId, sabotageMs) {
    const m = this.match;
    const { ability } = this.participant(typerId);
    const bonus = (type) => (ability?.type === type ? ability.value : 0);
    const shrunk = Math.max(MIN_TURN_MS, m.settings.turnSeconds * 1000 - Math.floor(m.wordCount / 3) * 1000);
    const turnMs = Math.max(ABS_MIN_TURN_MS, shrunk + bonus('time') * 1000 - sabotageMs);
    m.typerId = typerId;
    m.mistakes = 0;
    m.maxMistakes = BASE_MISTAKES + bonus('mistakes');
    this.setPhase('typing', turnMs, () => this.fail(typerId, 'timeout'));
    this.broadcastMatch();

    const typer = this.players.get(typerId);
    if (typer?.isBot) {
      const { dict, botDict, random } = this;
      const steps = planTurn({ prefix: m.prefix, used: m.used, turnMs, dict, botDict, random });
      this.runBot(steps.map((step) => ({
        wait: step.wait,
        run: () => ('submit' in step ? this.submitWord(typer, step.submit) : this.relayTyping(typer, step.typing)),
      })));
    }
  }

  submitWord(player, raw) {
    const m = this.match;
    if (m.phase !== 'typing' || player.id !== m.typerId) return;
    const word = normalizeWord(raw);
    if (!word) return; // an empty submit is not a mistake

    const reason = this.rejectReason(word);
    if (reason) {
      m.mistakes++;
      this.broadcast({ t: 'result', id: player.id, word: displayWord(word), ok: false, reason, mistakes: m.mistakes });
      if (m.mistakes >= m.maxMistakes) this.fail(player.id, 'mistakes');
      else this.broadcastMatch();
      return;
    }

    const participant = this.participant(player.id);
    participant.words++;
    m.used.add(word);
    m.chain.push({ id: player.id, word });
    if (m.chain.length > CHAIN_LENGTH) m.chain.shift();
    m.wordCount++;
    this.broadcast({ t: 'result', id: player.id, word, ok: true });
    m.prefix = this.nextPrefix(word);
    const { ability } = participant;
    this.startTurn(this.nextAlive(player.id), ability?.type === 'sabotage' ? ability.value * 1000 : 0);
  }

  rejectReason(word) {
    const m = this.match;
    if (!/^[a-z]+$/.test(word)) return 'invalid_chars';
    if (word.length < MIN_WORD_LENGTH) return 'too_short';
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
    const chance = Math.min(0.3, 0.04 + 0.012 * m.wordCount);
    return this.random() < chance && this.dict.countPrefix(two, m.used) >= TWO_LETTER_MIN_WORDS ? two : word.slice(-1);
  }

  /** A participant failed (timeout / mistakes) or dropped out (forfeit / left). */
  fail(id, cause) {
    const m = this.match;
    const participant = this.participant(id);
    if (!ACTIVE_PHASES.has(m.phase) || !participant?.alive) return;
    const endsRound = id === m.typerId || id === m.chooserId; // the round cannot go on without them

    let shielded = false;
    if (cause === 'forfeit' || cause === 'left') {
      participant.hearts = 0;
    } else if (participant.shield) {
      participant.shield = false;
      shielded = true;
    } else {
      participant.hearts--;
    }
    this.broadcast({ t: 'fail', id, cause, hearts: participant.hearts, shielded });
    if (participant.hearts === 0) {
      participant.alive = false;
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
    clearTurn(m);
    m.winnerId = winnerId;
    this.setPhase('ended', MATCH_END_MS, () => {
      this.enterLobby(); // players stay seated, so the countdown restarts if 2+ remain
      this.broadcastMatch();
    });
    this.broadcast({ t: 'win', id: winnerId });
    const winner = this.players.get(winnerId);
    if (winner) {
      winner.wins++;
      this.broadcastPlayer(winner);
    }
    this.broadcast(systemChat(winner ? `${winner.name} won the match!` : 'Nobody won this match.'));
    for (const { id, words } of m.participants) {
      const player = this.players.get(id);
      if (!player || player.isBot) continue;
      const won = id === winnerId;
      const coins = REWARDS.participation + REWARDS.perWord * words + (won ? REWARDS.win : 0);
      this.send(player, { t: 'reward', coins, won, words });
    }
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
    };
  }

  matchView() {
    const m = this.match;
    return {
      phase: m.phase,
      phaseEndsIn: m.endsAt === null ? null : Math.max(0, m.endsAt - this.now()),
      phaseDuration: m.duration,
      participants: m.participants.map(({ id, hearts, maxHearts, alive, words, shield }) => ({ id, hearts, maxHearts, alive, words, shield })),
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
    this.broadcast({ t: 'room', hostId: this.hostId, settings: { ...this.settings } });
  }
}
