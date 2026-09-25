// Shared test fixtures: real dictionaries, a manual clock, fake connections and a room harness.
import { PROTOCOL_VERSION } from '../public/js/shared/constants.js';
import { createDictionary } from '../src/dictionary.js';
import { GameEngine } from '../src/engine.js';
import WORDS from '../src/words.js';
import BOT_WORDS from '../src/botwords.js';
import EASY_WORDS from '../src/botwords-easy.js';
import NORMAL_WORDS from '../src/botwords-normal.js';

export const dict = createDictionary(WORDS);
export const botDict = createDictionary(BOT_WORDS);

/** Deterministic PRNG (mulberry32) returning values in [0, 1). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Timers only fire inside advance(), in due-time order. */
export class FakeClock {
  t = 1_000_000;
  timers = new Map();
  seq = 0;
  now = () => this.t;
  setTimeout = (fn, ms) => {
    const id = ++this.seq;
    this.timers.set(id, { id, at: this.t + Math.max(0, ms), fn });
    return id;
  };
  clearTimeout = (id) => {
    this.timers.delete(id);
  };
  advance(ms) {
    const end = this.t + ms;
    for (;;) {
      let next = null;
      for (const timer of this.timers.values()) if (timer.at <= end && (!next || timer.at < next.at)) next = timer;
      if (!next) break;
      this.timers.delete(next.id);
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
  get pending() {
    return this.timers.size;
  }
}

/** Records what the server sends, as it would arrive over the wire (JSON round trip). */
export class FakeConn {
  sent = [];
  closed = null;
  send(msg) {
    this.sent.push(JSON.parse(JSON.stringify(msg)));
  }
  close(code, reason) {
    this.closed = { code, reason };
  }
  all(t) {
    return this.sent.filter((m) => m.t === t);
  }
  last(t) {
    return this.all(t).at(-1);
  }
  clear() {
    this.sent.length = 0;
  }
}

/** Latest MatchState a connection received. */
export const lastMatch = (conn) => conn.last('match')?.m;

/**
 * A room with a fake clock. `forced` values are returned by random() before the seeded
 * PRNG takes over, to steer specific rolls. Internal errors are collected in `errors`.
 */
export function createRoom({ seed = 1, ...options } = {}) {
  const clock = new FakeClock();
  const rng = seeded(seed);
  const forced = [];
  const errors = [];
  const engine = new GameEngine({
    code: 'TEST1',
    dict,
    botDict,
    botDicts: { easy: createDictionary(EASY_WORDS), normal: createDictionary(NORMAL_WORDS), hard: botDict },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    random: () => (forced.length ? forced.shift() : rng()),
    onError: (err) => errors.push(err),
    ...options,
  });
  const conns = {};
  const send = (conn, msg) => engine.receive(conn, JSON.stringify(msg));
  const join = (id, extra = {}) => {
    const conn = new FakeConn();
    send(conn, { t: 'hello', id, name: id, v: PROTOCOL_VERSION, ...extra });
    conns[id] = conn;
    return conn;
  };
  return { clock, engine, forced, errors, conns, send, join };
}
