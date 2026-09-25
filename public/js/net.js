// WebSocket client for one room: connect(code), send(msg), on(type, fn), auto-reconnect with backoff.
//
// States: 'connecting' (first attempt) → 'open' (welcome received) → 'reconnecting' (socket lost, retrying)
//         → 'closed' (stopped; reason: 'user' | 'replaced' | 'rejected' | 'room_full' | 'bad_hello' | 'bad_code').
// A socket that stays silent for a whole ping interval (e.g. hung after a server restart) is dropped and retried.

const PING_MS = 10000;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8000;
const CLOSE_REPLACED = 4000;              // server: same id connected from another tab
const CLOSE_REJECTED = 1008;              // server: after error room_full / bad_hello / bad_code
const FATAL_ERRORS = new Set(['room_full', 'bad_hello', 'bad_code']);

// The Cloudflare Worker serves both the game and its rooms. Static copies of the client (GitHub Pages)
// have no server of their own, so they connect to the Worker's rooms instead.
const GAME_SERVER = 'finish-the-word.nickkk66.workers.dev';

function roomUrl(code) {
  const staticHost = location.hostname.endsWith('.github.io');
  const host = staticHost ? GAME_SERVER : location.host;
  const proto = staticHost || location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${host}/api/room/${encodeURIComponent(code)}`;
}

export function createNet() {
  const handlers = new Map();             // type -> Set<fn>
  const stateListeners = new Set();
  let socket = null;
  let code = null;
  let makeHello = null;
  let state = 'closed';
  let reason = null;
  let backoff = BACKOFF_MIN_MS;
  let retryTimer = 0;
  let pingTimer = 0;
  let pingSentAt = 0;
  let lastReceived = 0;
  let rtt = null;

  function setState(next, why = null) {
    if (state === next && reason === why) return;
    state = next;
    reason = why;
    for (const fn of stateListeners) fn(state, reason);
  }

  function emit(msg) {
    const set = handlers.get(msg.t);
    if (set) for (const fn of [...set]) fn(msg);
  }

  function stopTimers() {
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    retryTimer = 0;
    pingTimer = 0;
  }

  /** Detaches and closes the current socket without triggering its handlers. */
  function dropSocket(closeCode = 1000) {
    const s = socket;
    socket = null;
    if (!s) return;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try { s.close(closeCode); } catch { /* already closed */ }
  }

  function scheduleRetry() {
    stopTimers();
    setState('reconnecting');
    const delay = backoff * (0.85 + Math.random() * 0.3);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    retryTimer = setTimeout(open, delay);
  }

  function ping() {
    // Nothing (not even the previous pong) arrived for a whole interval: the socket is dead.
    if (pingSentAt && lastReceived < pingSentAt) {
      dropSocket(4001);
      scheduleRetry();
      return;
    }
    pingSentAt = performance.now();
    send({ t: 'ping', c: Math.round(pingSentAt) });
  }

  function open() {
    stopTimers();
    dropSocket();
    let s;
    try {
      s = new WebSocket(roomUrl(code));
    } catch {
      scheduleRetry();
      return;
    }
    socket = s;
    s.onopen = () => {
      lastReceived = performance.now();
      pingSentAt = 0;
      s.send(JSON.stringify(makeHello()));
      pingTimer = setInterval(ping, PING_MS);
    };
    s.onmessage = (ev) => {
      lastReceived = performance.now();
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'welcome') {
        backoff = BACKOFF_MIN_MS;
        setState('open');
      } else if (msg.t === 'pong' && typeof msg.c === 'number') {
        rtt = Math.max(0, Math.round(performance.now() - msg.c));
      }
      if (msg.t === 'error' && FATAL_ERRORS.has(msg.code)) {
        // The server closes the socket after these; stop right away, never retry (reported via the state).
        stopTimers();
        dropSocket();
        setState('closed', msg.code);
        return;
      }
      emit(msg);
    };
    s.onerror = () => {};  // 'close' always follows
    s.onclose = (ev) => {
      socket = null;
      stopTimers();
      if (ev.code === CLOSE_REPLACED) setState('closed', 'replaced');
      else if (ev.code === CLOSE_REJECTED) setState('closed', 'rejected');
      else scheduleRetry();
    };
  }

  function retryNow() {
    if (state === 'reconnecting') {
      backoff = BACKOFF_MIN_MS;
      open();
    }
  }
  window.addEventListener('online', retryNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retryNow();
  });

  function send(msg) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }

  return {
    /** Connects to room `roomCode`; `hello()` builds the hello payload (called on every (re)connect). */
    connect(roomCode, hello) {
      code = roomCode;
      makeHello = hello;
      backoff = BACKOFF_MIN_MS;
      setState('connecting');
      open();
    },
    /** Leaves the room for good (no reconnect). */
    close() {
      stopTimers();
      dropSocket(1000);
      setState('closed', 'user');
    },
    send,
    /** Subscribe to a server message type; returns an unsubscribe function. */
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    /** fn(state, reason) on every state change. */
    onState(fn) {
      stateListeners.add(fn);
      return () => stateListeners.delete(fn);
    },
    get state() { return state; },
    get rtt() { return rtt; },
  };
}
