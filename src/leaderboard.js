import { DurableObject } from 'cloudflare:workers';
import { sanitizeName } from './sanitize.js';

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wins (player_id TEXT PRIMARY KEY, name TEXT NOT NULL, wins INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const sql = this.ctx.storage.sql;
    if (path === '/top' && request.method === 'GET') {
      const n = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get('n')) || 10));
      return Response.json({ top: [...sql.exec('SELECT name, wins FROM wins ORDER BY wins DESC, updated_at ASC LIMIT ?', n)] });
    }
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });
    const data = await request.json();
    if (typeof data.playerId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.playerId)) return new Response('Bad id', { status: 400 });
    if (path === '/win') {
      const name = sanitizeName(data.name) || 'Player';
      sql.exec('INSERT INTO wins (player_id,name,wins,updated_at) VALUES (?,?,1,?) ON CONFLICT(player_id) DO UPDATE SET name=excluded.name,wins=wins.wins+1,updated_at=excluded.updated_at', data.playerId, name, Date.now());
    } else if (path === '/remove') sql.exec('DELETE FROM wins WHERE player_id=?', data.playerId);
    else return new Response('Not found', { status: 404 });
    return Response.json({ ok: true });
  }
}
