// One shared notice board for all rooms. Only GameRoom can POST; browsers can only GET.
import { DurableObject } from 'cloudflare:workers';

export class Announcements extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/post') {
      const body = await request.json();
      if (typeof body.text !== 'string' || !body.text || body.text.length > 120) return Response.json({ error: 'Invalid announcement' }, { status: 400 });
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at INTEGER NOT NULL)');
      this.ctx.storage.sql.exec('INSERT INTO notices (text,created_at) VALUES (?,?)', body.text, Date.now());
      this.ctx.storage.sql.exec('DELETE FROM notices WHERE created_at < ?', Date.now() - 10 * 60000);
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/latest') {
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at INTEGER NOT NULL)');
      const since = Number(url.searchParams.get('since')) || 0;
      const rows = [...this.ctx.storage.sql.exec('SELECT id,text FROM notices WHERE id > ? AND created_at >= ? ORDER BY id ASC LIMIT 20', since, Date.now() - 10 * 60000)];
      return Response.json({ notices: rows }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}
