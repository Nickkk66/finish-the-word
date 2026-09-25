import { DurableObject } from 'cloudflare:workers';
import { makeRoomCode, ROOM_CODE_REGEX } from '../public/js/shared/constants.js';

export class Matchmaker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, humans INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
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
      const { code, humans, public: listed } = await request.json();
      if (!ROOM_CODE_REGEX.test(code) || !Number.isInteger(humans) || humans < 0 || humans > 8) return new Response('Invalid room', { status: 400 });
      if (!listed || humans === 0) sql.exec('DELETE FROM rooms WHERE code=?', code);
      else sql.exec('INSERT INTO rooms VALUES (?,?,?) ON CONFLICT(code) DO UPDATE SET humans=excluded.humans,updated_at=excluded.updated_at', code, humans, Date.now());
      await this.ctx.storage.setAlarm(Date.now() + 30000);
      return Response.json({ ok: true });
    }
    if (path === '/public') {
      const rooms = [...sql.exec('SELECT code, humans FROM rooms WHERE humans > 0 ORDER BY humans DESC, code LIMIT 100')];
      return Response.json({ rooms, players: rooms.reduce((n, r) => n + r.humans, 0) });
    }
    if (path === '/quickplay') {
      const open = [...sql.exec('SELECT code FROM rooms WHERE humans BETWEEN 0 AND 7 ORDER BY humans DESC,updated_at DESC LIMIT 1')][0];
      let code = open?.code;
      if (!code) {
        do { code = makeRoomCode(); } while ([...sql.exec('SELECT code FROM rooms WHERE code=?', code)].length);
        sql.exec('INSERT INTO rooms VALUES (?,0,?)', code, Date.now());
        await this.ctx.storage.setAlarm(Date.now() + 30000);
      }
      return Response.json({ code });
    }
    return new Response('Not found', { status: 404 });
  }
}
