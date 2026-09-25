// One Durable Object per room code. It uses the standard (non-hibernating) WebSocket
// API, so the in-memory GameEngine and its setTimeout timers live as long as players
// are connected.
import { DurableObject } from 'cloudflare:workers';
import { createDictionary } from './dictionary.js';
import { GameEngine } from './engine.js';
import WORDS from './words.js';
import BOT_WORDS from './botwords.js';

// Word lists are immutable, so all rooms in this isolate share them. Creating a
// dictionary is free: lookups binary-search the raw string.
const dict = createDictionary(WORDS);
const botDict = createDictionary(BOT_WORDS);

export class GameRoom extends DurableObject {
  engine = null;

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
      now: Date.now,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle),
      random: Math.random,
    });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const conn = {
      send: (msg) => server.send(JSON.stringify(msg)),
      close: (closeCode, reason) => server.close(closeCode, reason),
    };
    server.addEventListener('message', (event) => this.engine.receive(conn, event.data));
    server.addEventListener('close', () => this.engine.disconnect(conn));
    server.addEventListener('error', () => this.engine.disconnect(conn));
    return new Response(null, { status: 101, webSocket: client });
  }
}
