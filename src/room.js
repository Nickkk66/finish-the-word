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
import { ROOM_CODE_REGEX } from '../public/js/shared/constants.js';

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
      if (this.pendingListing.humans > 0) this.heartbeatTimer = setTimeout(() => this.engine.reportListing(), 20000);
    };
    const remaining = Math.max(0, 2000 - (Date.now() - this.lastListingAt));
    if (remaining) this.listingTimer = setTimeout(flush, remaining); else flush();
  }

  async fetch(request) {
    if(new URL(request.url).pathname==='/handle-update'&&request.method==='POST'){
      const {id,name,revision}=await request.json();this.engine?.updateHandle(id,name,revision);return Response.json({ok:true});
    }
    if (new URL(request.url).pathname === '/shutdown' && request.method === 'POST') {
      const { code } = await request.json();
      this.engine?.shutdownRoom();
      if (!this.engine && ROOM_CODE_REGEX.test(code)) this.report({ code, humans: 0, public: false, players: [] });
      clearTimeout(this.heartbeatTimer);
      return Response.json({ ok: true });
    }
    if (new URL(request.url).pathname === '/admin-edit' && request.method === 'POST') {
      const { action, data } = await request.json();
      if (action.startsWith('profile-')) {
        try { return Response.json(this.engine.adminProfile(action.slice(8), data)); }
        catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      }
      return Response.json({ ok: !!this.engine?.editPlayer(action, data) });
    }
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
      onVerifyAccount: async (token, playerId) => {
        const result = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global')).fetch('https://internal/api/account/verify', { headers: { Authorization: `Bearer ${token}` } });
        if (!result.ok) return null;
        const account = await result.json();
        return account.id === playerId && Number.isSafeInteger(account.createdAt) ? account : null;
      },
      onVerifyHandle: async(token,playerId)=>{
        const result=await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global')).fetch(`https://internal/api/handle/verify?room=${code}`,{headers:{Authorization:`Bearer ${token}`}});
        if(!result.ok)return null;const identity=await result.json();return identity.id===playerId?identity:null;
      },
      onWin: ({ playerId, name }) => this.ctx.waitUntil(this.internal('LEADERBOARD', '/win', { playerId, name,revision:this.engine?.players.get(playerId)?.handleRevision||0 })),
      onRemoveLeaderboard: playerId => this.ctx.waitUntil(this.internal('LEADERBOARD', '/remove', { playerId })),
      onSetWins: async (record) => {
        const result = await this.internal('LEADERBOARD', '/set', { playerId: record.id, name: record.name, wins: record.wins });
        if (!result.ok) throw new Error('Could not update wins.');
        return result.json();
      },
      onSellWins: async (record) => {
        const result = await this.internal('LEADERBOARD', '/sell', { playerId: record.id, requestId: record.requestId });
        if (!result.ok) throw new Error('Could not sell wins.');
        return result.json();
      },
      onCheckTrophies: async (playerIds) => {
        const result = await this.internal('LEADERBOARD', '/eligible', { playerIds });
        if (!result.ok) throw new Error('Could not check Last Sip trophies.');
        return result.json();
      },
      onAdminProfile: async (action, data) => {
        const response = await this.internal('ACCOUNTS', '/admin-profiles', { ...data, action });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      },
      onListRooms: async () => {
        const [roomsResult, leadersResult] = await Promise.all([
          this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global')).fetch('https://internal/all'),
          this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global')).fetch('https://internal/admin-top'),
        ]);
        return { rooms: (await roomsResult.json()).rooms, leaders: (await leadersResult.json()).top };
      },
      onShutdownRoom: async roomCode => {
        const result = await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomCode)).fetch('https://internal/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: roomCode }) });
        if (!result.ok) throw new Error('Room shutdown failed');
      },
      onAdminEdit: async (roomCode, action, data) => {
        const result = await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomCode)).fetch('https://internal/admin-edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) });
        const body = await result.json();
        if (!result.ok || (!action.startsWith('profile-') && !body.ok)) throw new Error(body.error || 'Remote player edit failed');
        return body;
      },
      onGlobalAnnouncement: notice => this.ctx.waitUntil(this.internal('ANNOUNCEMENTS', '/post', notice)),
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
