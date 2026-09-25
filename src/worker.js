// Worker entry: health check, WebSocket routing to one Durable Object per room, and
// the static client (./public) for everything else.
import { ROOM_CODE_REGEX } from '../public/js/shared/constants.js';

export { GameRoom } from './room.js';

const ROOM_PATH = /^\/api\/room\/([^/]+)$/;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') return new Response('ok');

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
