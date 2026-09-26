// Worker entry: health check, WebSocket routing to one Durable Object per room, and
// the static client (./public) for everything else.
import { ROOM_CODE_REGEX } from '../public/js/shared/constants.js';

export { GameRoom } from './room.js';
export { Leaderboard } from './leaderboard.js';
export { Matchmaker } from './matchmaker.js';
export { Accounts } from './accounts.js';
export { Announcements } from './announcements.js';

const ROOM_PATH = /^\/api\/room\/([^/]+)$/;

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') return new Response('ok');
    if (pathname.startsWith('/api/') && request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } });
    if (pathname.startsWith('/api/account/')) {
      const result = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global')).fetch(request);
      return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (pathname === '/api/announcements' && request.method === 'GET') {
      const since = Number(new URL(request.url).searchParams.get('since')) || 0;
      const result = await env.ANNOUNCEMENTS.get(env.ANNOUNCEMENTS.idFromName('global')).fetch(`https://internal/latest?since=${Math.max(0, Math.floor(since))}`);
      return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
    }
    const endpoint = { '/api/leaderboard': ['LEADERBOARD', '/top?n=10', 30], '/api/public': ['MATCHMAKER', '/public', 5], '/api/quickplay': ['MATCHMAKER', '/quickplay', 0] }[pathname];
    if (endpoint && request.method === 'GET') {
      const [binding, path, ttl] = endpoint;
      const key = new Request(new URL(pathname, request.url));
      const cached = ttl && await caches.default.match(key);
      if (cached) return cached;
      const result = await env[binding].get(env[binding].idFromName('global')).fetch(`https://internal${path}`);
      const response = new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': ttl ? `public, max-age=${ttl}` : 'no-store' } });
      if (ttl && response.ok) ctx.waitUntil(caches.default.put(key, response.clone()));
      return response;
    }

    const room = ROOM_PATH.exec(pathname);
    if (room) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const code = room[1].toUpperCase();
      if (!ROOM_CODE_REGEX.test(code)) return rejectSocket('bad_code', 'That room code is not valid.');
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

// Accepts the socket just long enough to say why it is refused, so the client can show
// the reason instead of silently retrying a failed handshake.
function rejectSocket(code, message) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ t: 'error', code, message }));
  server.close(1008, code);
  return new Response(null, { status: 101, webSocket: client });
}
