// One Durable Object per room code. It uses the standard (non-hibernating) WebSocket
// API, so the in-memory GameEngine and its setTimeout timers live as long as players
// are connected.
import { DurableObject } from 'cloudflare:workers';
import { createDictionary } from './dictionary.js';
import { GameEngine } from './engine.js';
import WORDS from './words.js';
import BOT_WORDS from './botwords.js';
import EASY_WORDS from './botwords-easy.js';
import NORMAL_WORDS from './botwords-normal.js';
import { hashIp } from './auth.js';

// Word lists are immutable, so all rooms in this isolate share them. Creating a
// dictionary is free: lookups binary-search the raw string.
const dict = createDictionary(WORDS);
const botDict = createDictionary(BOT_WORDS);
const botDicts = { easy: createDictionary(EASY_WORDS), normal: createDictionary(NORMAL_WORDS), hard: botDict };

export class GameRoom extends DurableObject {
  engine = null;
  listingTimer = null;
  heartbeatTimer = null;
  lastListingAt = -Infinity;
  pendingListing = null;

  internal(binding, path, body) {
    return this.env[binding].get(this.env[binding].idFromName('global')).fetch(`https://internal${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  report(listing) {
    this.pendingListing = listing;
    if (this.listingTimer) return;
    const flush = () => {
      this.listingTimer = null;
      this.lastListingAt = Date.now();
      this.ctx.waitUntil(this.internal('MATCHMAKER', '/report', this.pendingListing));
      clearTimeout(this.heartbeatTimer);
      if (this.pendingListing.public && this.pendingListing.humans > 0) this.heartbeatTimer = setTimeout(() => this.engine.reportListing(), 20000);
    };
    const remaining = Math.max(0, 2000 - (Date.now() - this.lastListingAt));
    if (remaining) this.listingTimer = setTimeout(flush, remaining); else flush();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    // The worker routes /api/room/<CODE> here; the room code is the last path segment.
    const code = new URL(request.url).pathname.split('/').pop().toUpperCase();
    this.engine ??= new GameEngine({
      code,
      dict,
      botDict,
      botDicts,
      adminCode: this.env.ADMIN_CODE || '',
      onWin: ({ playerId, name }) => this.ctx.waitUntil(this.internal('LEADERBOARD', '/win', { playerId, name })),
      onRemoveLeaderboard: playerId => this.ctx.waitUntil(this.internal('LEADERBOARD', '/remove', { playerId })),
      onListing: listing => this.report(listing),
      now: Date.now,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle),
      random: Math.random,
    });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const conn = {
      ipHash: await hashIp(request.headers.get('CF-Connecting-IP') || 'local'),
      send: (msg) => server.send(JSON.stringify(msg)),
      close: (closeCode, reason) => server.close(closeCode, reason),
    };
    server.addEventListener('message', (event) => this.engine.receive(conn, event.data));
    server.addEventListener('close', () => this.engine.disconnect(conn));
    server.addEventListener('error', () => this.engine.disconnect(conn));
    return new Response(null, { status: 101, webSocket: client });
  }
}
