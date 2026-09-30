import { DurableObject } from 'cloudflare:workers';
import { MAX_PLAYERS, PUBLIC_ROOM_CODE, ROOM_CODE_REGEX } from '../public/js/shared/constants.js';

export class Matchmaker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, humans INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    try { ctx.storage.sql.exec('ALTER TABLE rooms ADD COLUMN public INTEGER NOT NULL DEFAULT 0'); } catch { /* existing column */ }
    try { ctx.storage.sql.exec("ALTER TABLE rooms ADD COLUMN players_json TEXT NOT NULL DEFAULT '[]'"); } catch { /* existing column */ }
  }
  prune() { this.ctx.storage.sql.exec('DELETE FROM rooms WHERE updated_at < ?', Date.now() - 60000); }
  async alarm() {
    this.prune();
    if ([...this.ctx.storage.sql.exec('SELECT code FROM rooms LIMIT 1')].length) await this.ctx.storage.setAlarm(Date.now() + 30000);
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const sql = this.ctx.storage.sql;
    this.prune();
    if (path === '/report' && request.method === 'POST') {
      const { code, humans, players } = await request.json();
      if (!ROOM_CODE_REGEX.test(code) || !Number.isInteger(humans) || humans < 0 || humans > MAX_PLAYERS) return new Response('Invalid room', { status: 400 });
      if (humans === 0) sql.exec('DELETE FROM rooms WHERE code=?', code);
      else {
        const roster = (Array.isArray(players) ? players : []).filter(p => p && typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) && typeof p.name === 'string').slice(0, MAX_PLAYERS).map(p => ({ id: p.id, name: p.name.slice(0, 16) }));
        sql.exec('INSERT INTO rooms (code,humans,updated_at,public,players_json) VALUES (?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET humans=excluded.humans,updated_at=excluded.updated_at,public=excluded.public,players_json=excluded.players_json', code, humans, Date.now(), Number(code === PUBLIC_ROOM_CODE), JSON.stringify(roster));
      }
      await this.ctx.storage.setAlarm(Date.now() + 30000);
      return Response.json({ ok: true });
    }
    if (path === '/public') {
      const rooms = [...sql.exec('SELECT code, humans FROM rooms WHERE code=? AND humans > 0', PUBLIC_ROOM_CODE)];
      return Response.json({ rooms, players: rooms.reduce((n, r) => n + r.humans, 0) });
    }
    if (path === '/all') {
      const rooms = [...sql.exec('SELECT code, humans, public, players_json FROM rooms WHERE humans > 0 ORDER BY updated_at DESC')]
        .map(room => ({ code: room.code, humans: room.humans, public: !!room.public, players: JSON.parse(room.players_json) }));
      return Response.json({ rooms });
    }
    if (path === '/quickplay') {
      return Response.json({ code: PUBLIC_ROOM_CODE });
    }
    return new Response('Not found', { status: 404 });
  }
}
