import { DurableObject } from 'cloudflare:workers';
import { sanitizeName } from './sanitize.js';

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wins (player_id TEXT PRIMARY KEY, name TEXT NOT NULL, wins INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    try{ctx.storage.sql.exec('ALTER TABLE wins ADD COLUMN handle_revision INTEGER NOT NULL DEFAULT 0');}catch{}
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wins_sync (player_id TEXT PRIMARY KEY, wins INTEGER NOT NULL, revision INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS win_sales (player_id TEXT NOT NULL, request_id TEXT NOT NULL, wins INTEGER NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(player_id,request_id))');
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const sql = this.ctx.storage.sql;
    if (path === '/top' && request.method === 'GET') {
      const n = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get('n')) || 10));
      return Response.json({ top: [...sql.exec('SELECT name, wins FROM wins ORDER BY wins DESC, updated_at ASC LIMIT ?', n)] });
    }
    if (path === '/admin-top' && request.method === 'GET') {
      return Response.json({ top: [...sql.exec('SELECT player_id AS id,name,wins FROM wins ORDER BY wins DESC,updated_at ASC LIMIT 100')] });
    }
    if (path === '/sync' && request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id');
      if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new Response('Bad id', { status: 400 });
      const row = [...sql.exec('SELECT wins,revision FROM wins_sync WHERE player_id=?', id)][0];
      return Response.json(row || { wins: null, revision: 0 });
    }
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });
    const data = await request.json();
    if (path === '/eligible') {
      if (!Array.isArray(data.playerIds) || data.playerIds.length < 1 || data.playerIds.length > 8
        || new Set(data.playerIds).size !== data.playerIds.length || data.playerIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return new Response('Bad entry', { status: 400 });
      const enough = data.playerIds.every(id => ([...sql.exec('SELECT wins FROM wins WHERE player_id=?', id)][0]?.wins || 0) >= 1);
      return Response.json(enough ? { ok: true } : { ok: false, error: 'Each player needs 1 recorded trophy to play The Last Sip. The trophy is kept.' });
    }
    if (typeof data.playerId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.playerId)) return new Response('Bad id', { status: 400 });
    if(path==='/rename'){
      sql.exec('UPDATE wins SET name=?,handle_revision=? WHERE player_id=? AND handle_revision<=?',data.name,data.revision||0,data.playerId,data.revision||0);
    } else if (path === '/win') {
      const name = sanitizeName(data.name) || 'Player';
      sql.exec('INSERT INTO wins (player_id,name,wins,updated_at,handle_revision) VALUES (?,?,1,?,?) ON CONFLICT(player_id) DO UPDATE SET name=CASE WHEN excluded.handle_revision>=wins.handle_revision THEN excluded.name ELSE wins.name END,handle_revision=MAX(wins.handle_revision,excluded.handle_revision),wins=wins.wins+1,updated_at=excluded.updated_at', data.playerId, name, Date.now(), data.revision||0);
      const synced = [...sql.exec('SELECT revision FROM wins_sync WHERE player_id=?', data.playerId)][0];
      if (synced) sql.exec('UPDATE wins_sync SET wins=(SELECT wins FROM wins WHERE player_id=?),revision=revision+1 WHERE player_id=?', data.playerId, data.playerId);
    } else if (path === '/sell') {
      if (typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(data.requestId)) return new Response('Bad request', { status: 400 });
      const previous = [...sql.exec('SELECT wins,revision FROM win_sales WHERE player_id=? AND request_id=?', data.playerId, data.requestId)][0];
      if (previous) return Response.json({ ok: true, ...previous, coins: 1000, receipt: `wins:${data.playerId}:${data.requestId}` });
      const current = [...sql.exec('SELECT wins FROM wins WHERE player_id=?', data.playerId)][0];
      if (!current || current.wins < 5) return Response.json({ ok: false, error: 'You need 5 recorded wins to sell.' });
      sql.exec('UPDATE wins SET wins=wins-5,updated_at=? WHERE player_id=? AND wins>=5', Date.now(), data.playerId);
      const wins = current.wins - 5;
      sql.exec('INSERT INTO wins_sync (player_id,wins,revision) VALUES (?,?,1) ON CONFLICT(player_id) DO UPDATE SET wins=excluded.wins,revision=wins_sync.revision+1', data.playerId, wins);
      const row = [...sql.exec('SELECT wins,revision FROM wins_sync WHERE player_id=?', data.playerId)][0];
      sql.exec('INSERT INTO win_sales (player_id,request_id,wins,revision) VALUES (?,?,?,?)', data.playerId, data.requestId, row.wins, row.revision);
      return Response.json({ ok: true, ...row, coins: 1000, receipt: `wins:${data.playerId}:${data.requestId}` });
    } else if (path === '/set') {
      if (!Number.isSafeInteger(data.wins) || data.wins < 0 || data.wins > 1000000000) return new Response('Bad wins', { status: 400 });
      const name = sanitizeName(data.name) || data.playerId;
      sql.exec('INSERT INTO wins (player_id,name,wins,updated_at) VALUES (?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET name=excluded.name,wins=excluded.wins,updated_at=excluded.updated_at', data.playerId, name, data.wins, Date.now());
      sql.exec('INSERT INTO wins_sync (player_id,wins,revision) VALUES (?,?,1) ON CONFLICT(player_id) DO UPDATE SET wins=excluded.wins,revision=wins_sync.revision+1', data.playerId, data.wins);
      const row = [...sql.exec('SELECT wins,revision FROM wins_sync WHERE player_id=?', data.playerId)][0];
      return Response.json({ ok: true, ...row });
    } else if (path === '/remove') sql.exec('DELETE FROM wins WHERE player_id=?', data.playerId);
    else return new Response('Not found', { status: 404 });
    return Response.json({ ok: true });
  }
}
