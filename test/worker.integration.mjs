// Explicit integration gate: node test/worker.integration.mjs
// Starts an isolated local Worker with a disposable admin secret and storage directory.
// Never reads production secrets or talks to the deployed Worker.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { PROTOCOL_VERSION, OBBY } from '../public/js/shared/constants.js';

const port = Number(process.env.FTW_TEST_PORT || 8792);
const base = `http://127.0.0.1:${port}`;
const storage = await mkdtemp(join(tmpdir(), 'ftw-integration-'));
const snapshot = await mkdtemp(join(tmpdir(), 'ftw-worker-snapshot-'));
const root = fileURLToPath(new URL('..', import.meta.url));
for (const path of ['src', 'public', 'wrangler.toml', 'package.json']) await cp(join(root, path), join(snapshot, path), { recursive: true });
const secret = 'integration-test-only';
let worker;
const clients = [];
async function start() {
  worker = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(port), '--persist-to', storage, '--var', `ADMIN_CODE:${secret}`], { cwd: snapshot, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  worker.stdout.on('data', data => { logs = (logs + data).slice(-12000); });
  worker.stderr.on('data', data => { logs = (logs + data).slice(-12000); });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    if (worker.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
    await wait(200);
  }
  throw new Error(`Worker startup timed out: ${logs}`);
}
async function stop() {
  if (!worker || worker.exitCode !== null) return;
  await new Promise(resolve => { worker.once('exit', resolve); worker.kill('SIGTERM'); });
}
async function api(path, alternateOrigin = false) {
  const response = await fetch(`${alternateOrigin ? base.replace('127.0.0.1', 'localhost') : base}${path}`);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  return response.json();
}
async function connect(id, code, extra = {}) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/room/${code}`);
  const inbox = [];
  ws.addEventListener('message', e => inbox.push(JSON.parse(e.data)));
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const client = {
    ws, inbox, id, send: msg => ws.send(JSON.stringify(msg)),
    async next(predicate, after = 0) {
      for (let i = 0; i < 200; i++) {
        const found = inbox.slice(after).find(predicate);
        if (found) return found;
        await wait(25);
      }
      throw new Error(`${id}: timed out waiting for message; types=${inbox.map(m => m.t).join(',')}`);
    },
  };
  clients.push(client);
  client.send({ t: 'hello', id, name: id, v: PROTOCOL_VERSION, ...extra });
  client.welcome = await client.next(m => m.t === 'welcome');
  return client;
}
try {
  await start();
  const quick = await api('/api/quickplay');
  assert.equal((await api('/api/quickplay')).code, quick.code, 'empty quickplay reservation reused');
  const host = await connect('HostIntegration', quick.code, { public: true, cards: { heart: 2 } });
  const other = await connect('OtherIntegration', quick.code, { cards: { heart: 2 } });
  await wait(2200);
  assert.equal((await api('/api/quickplay')).code, quick.code);
  const listing = await api('/api/public');
  assert.ok(listing.rooms.some(r => r.code === quick.code && r.humans === 2));
  console.log('ok public matchmaking and CORS');

  host.send({ t: 'unlock', code: secret });
  const unlocked = await host.next(m => m.t === 'unlock');
  assert.equal(unlocked.ok, true);
  assert.ok(unlocked.token);
  assert.ok(!other.inbox.some(m => m.t === 'unlock' || m.p?.isAdmin));
  host.send({ t: 'admin', action: 'grant', id: other.id, coins: 777 });
  assert.equal((await other.next(m => m.t === 'grant')).coins, 777);
  host.send({ t: 'admin', action: 'announce', text: 's3x' });
  assert.equal((await other.next(m => m.t === 'announce')).text, '###');
  console.log('ok hidden admin unlock, grants and filtered announcements');

  host.send({ t: 'host', action: 'settings', settings: { hearts: 1 } });
  host.send({ t: 'sit', seat: 0 }); other.send({ t: 'sit', seat: 1 });
  await host.next(m => m.t === 'match' && m.m.phase === 'countdown');
  host.send({ t: 'host', action: 'start' });
  const choosing = (await host.next(m => m.t === 'match' && m.m.phase === 'choosing')).m;
  const chooser = choosing.chooserId === host.id ? host : other;
  chooser.send({ t: 'pick', letter: choosing.options[0] });
  const typing = (await host.next(m => m.t === 'match' && m.m.phase === 'typing')).m;
  const actor = typing.typerId === host.id ? host : other;
  const target = actor === host ? other : host;
  actor.send({ t: 'hint', turnId: typing.turnId, requestId: 'hintintegration', balance: 250 });
  const hint = await actor.next(m => m.t === 'hint');
  assert.ok(hint.ok && hint.word.startsWith(typing.prefix));
  assert.ok(!target.inbox.some(m => m.t === 'hint'));
  const card = { t: 'useCard', turnId: typing.turnId, requestId: 'cardintegration', cardId: 'heart', targetId: target.id };
  actor.send(card); actor.send(card);
  const result = await actor.next(m => m.t === 'cardResult');
  assert.equal(result.ok, true);
  await host.next(m => m.t === 'win');
  assert.equal(actor.inbox.filter(m => m.t === 'reward').length, 1);
  assert.equal(target.inbox.filter(m => m.t === 'cardUsed').length, 1);
  const board = await api('/api/leaderboard');
  assert.ok(board.top.some(r => r.name === actor.id && r.wins === 1));
  console.log('ok private hint, card replay protection and global leaderboard write');

  const runner = await connect('RunnerIntegration', 'OBBYT');
  runner.send({ t: 'obby', event: 'start' });
  runner.send({ t: 'obby', event: 'finish', ms: 30000 });
  await wait(100);
  assert.ok(!runner.inbox.some(m => m.t === 'grant'));
  await wait(30100);
  runner.send({ t: 'move', ...OBBY.finish, ry: 0, anim: 'idle' });
  runner.send({ t: 'obby', event: 'finish', ms: 30000 });
  assert.equal((await runner.next(m => m.t === 'grant')).coins, 50);
  runner.send({ t: 'obby', event: 'finish', ms: 30000 });
  await wait(100);
  assert.equal(runner.inbox.filter(m => m.t === 'grant').length, 1);
  console.log('ok real-time obby validation and one-time reward');

  for (const c of clients) c.ws.close();
  await stop();
  await start();
  // A new cache origin forces this read through the persisted SQLite object.
  assert.ok((await api('/api/leaderboard', true)).top.some(r => r.name === actor.id && r.wins === 1));
  const resumed = await connect(host.id, 'TOKNT', { adminToken: unlocked.token });
  assert.equal(resumed.welcome.isAdmin, true);
  resumed.send({ t: 'admin', action: 'removeLeaderboard', id: actor.id });
  await wait(300);
  resumed.ws.close();
  await stop(); await start();
  assert.ok(!(await api('/api/leaderboard')).top.some(r => r.name === actor.id));
  console.log('ok SQLite persistence, token reconnect and admin leaderboard removal');
  console.log(`Integration passed; disposable storage: ${storage}`);
} finally {
  for (const client of clients) client.ws.close();
  await stop();
}
