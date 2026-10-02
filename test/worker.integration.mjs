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
let workerLogs = '';
const clients = [];
const handleTokens=new Map();
async function start() {
  worker = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(port), '--inspector-port', String(port + 100), '--persist-to', storage, '--var', `ADMIN_CODE:${secret}`], { cwd: snapshot, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  worker.stdout.on('data', data => { logs = (logs + data).slice(-12000); workerLogs = logs; });
  worker.stderr.on('data', data => { logs = (logs + data).slice(-12000); workerLogs = logs; });
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
  if(!extra.accountToken){
    if(!handleTokens.has(id)){
      const r=await fetch(`${base}/api/handle/claim`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,handle:id.slice(0,16)})});
      assert.equal(r.status,200);handleTokens.set(id,(await r.json()).token);
    }
    extra={...extra,handleToken:handleTokens.get(id)};
  }
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
  async function account(path, method = 'GET', body, token, expected = 200) {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`${base}/api/account/${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status !== 500 || !(await response.clone().text()).includes('Network connection lost')) break;
      await wait(150);
    }
    assert.equal(response.status, expected, `${path}: ${await response.clone().text()}\n${workerLogs}`);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    return response.json();
  }
  const credentials = { username: 'integration_user', password: 'disposable-test-password' };
  const registered = await account('register', 'POST', { ...credentials, profile: { id: 'guestintegration', coins: 777, freePlayMs:300000, ownedBacks:['none','secret_crown'], equippedBack:'secret_crown', pets: { cat: 3 }, settings: { prefillPrefix: false } } });
  assert.equal(registered.profile.coins, 777);assert.deepEqual(registered.profile.ownedBacks,['none']);assert.equal(registered.profile.equippedBack,'none');
  assert.equal(registered.profile.settings.prefillPrefix, false);
  assert.equal(registered.profile.freePlayMs,300000);
  assert.ok(registered.token && !registered.password && !registered.password_hash);
  assert.match(registered.recoveryCode, /^[a-f0-9]{40}$/);
  await account('register', 'POST', { ...credentials, profile: {} }, null, 409);
  await account('login', 'POST', { ...credentials, password: 'incorrect-password' }, null, 401);
  const device = await account('login', 'POST', credentials);
  assert.deepEqual(device.profile, registered.profile);
  await account('profile', 'PUT', { revision: 1, profile: { ...device.profile, coins: 999, ownedBacks:['none','secret_scythe'], equippedBack:'secret_scythe', id: 'cannotchangeid', receipts: Array.from({length:512}, (_,i) => `receipt-${i}`.padEnd(150, 'x')) } }, device.token);
  const saved = await account('me', 'GET', null, registered.token);
  assert.equal(saved.profile.coins, 999);assert.deepEqual(saved.profile.ownedBacks,['none']);
  assert.equal(saved.profile.receipts.length, 512);
  assert.equal(saved.profile.freePlayMs,300000);
  assert.equal(saved.profile.id, 'guestintegration');
  await account('profile', 'PUT', { revision: 1, profile: registered.profile }, registered.token, 409);
  await account('profile', 'PUT', { revision: 2, profile: {} }, '0'.repeat(64), 401);
  await account('logout', 'POST', null, device.token);
  await account('me', 'GET', null, device.token, 401);
  await account('reset', 'POST', { username: credentials.username, password: 'short', recoveryCode: 'wrong' }, null, 401);
  const reset = await account('reset', 'POST', { username: credentials.username, password: 'short', recoveryCode: registered.recoveryCode });
  assert.match(reset.recoveryCode, /^[a-f0-9]{40}$/);
  await account('me', 'GET', null, registered.token, 401);
  await account('reset', 'POST', { username: credentials.username, password: 'short', recoveryCode: registered.recoveryCode }, null, 401);
  const fresh = await account('login', 'POST', { username: credentials.username, password: 'short' });
  assert.equal((await account('verify', 'GET', null, fresh.token)).id, 'guestintegration');
  const replacement = await account('recovery', 'POST', null, fresh.token);
  assert.match(replacement.recoveryCode, /^[a-f0-9]{40}$/);
  await stop(); await start();
  assert.equal((await account('me', 'GET', null, fresh.token)).profile.coins, 999);
  console.log('ok account registration, login, persistence, identity, conflicts, logout and CORS');

  const quick = await api('/api/quickplay');
  assert.equal((await api('/api/quickplay')).code, quick.code, 'empty quickplay reservation reused');
  const host = await connect('HostIntegration', quick.code, { public: true, cards: { heart: 2 } });
  const other = await connect('OtherIntegration', quick.code, { cards: { heart: 2 } });
  await wait(2200);
  assert.equal((await api('/api/quickplay')).code, quick.code);
  const listing = await api('/api/public');
  assert.ok(listing.rooms.some(r => r.code === quick.code && r.humans === 2));
  console.log('ok public matchmaking and CORS');
  const noTrophyA=await connect('NoTrophyOne','NOTRP',{wins:999}),noTrophyB=await connect('NoTrophyTwo','NOTRP',{wins:999});
  noTrophyA.send({t:'host',action:'settings',settings:{mode:'roulette'}});
  noTrophyA.send({t:'sit',seat:0});noTrophyB.send({t:'sit',seat:1});
  for(const c of [noTrophyA,noTrophyB]){c.send({t:'bet',requestId:'trophy-entry-'+c.id,amount:25,balance:100});await c.next(m=>m.t==='betResult'&&m.ok);}
  noTrophyA.send({t:'host',action:'start'});
  assert.match((await noTrophyA.next(m=>m.t==='error'&&m.code==='trophy_required')).message,/trophy/);
  for(const c of [noTrophyA,noTrophyB])assert.equal((await c.next(m=>m.t==='stakeRefund')).coins,25);
  assert.equal((await noTrophyA.next(m=>m.t==='match'&&m.m.phase==='lobby')).m.participants.length,0);
  assert.ok(!noTrophyA.inbox.some(m=>m.t==='match'&&m.m.phase==='roulette'));
  noTrophyA.ws.close();noTrophyB.ws.close();
  console.log('ok Last Sip rejects missing recorded trophies despite forged local wins and refunds coin entries');


  host.send({ t: 'unlock', code: secret });
  const unlocked = await host.next(m => m.t === 'unlock');
  assert.equal(unlocked.ok, true);
  assert.ok(unlocked.token);
  assert.ok(!other.inbox.some(m => m.t === 'unlock' || m.p?.isAdmin));
  // Full profiles stay behind the unlocked admin WebSocket, including offline saves.
  const forbiddenAt = other.inbox.length;
  other.send({ t: 'admin', action: 'listProfiles' });
  assert.equal((await other.next(m => m.t === 'error', forbiddenAt)).code, 'not_allowed');
  host.send({ t: 'admin', action: 'listProfiles', search: 'integration_user' });
  const users = await host.next(m => m.t === 'adminProfiles');
  assert.ok(users.users.some(user => user.id === 'guestintegration'));
  host.send({ t: 'admin', action: 'getProfile', id: 'guestintegration' });
  const full = await host.next(m => m.t === 'adminProfile' && m.id === 'guestintegration');
  assert.equal(full.profile.coins, 999);
  assert.ok(!('password_hash' in full) && !('recovery_hash' in full));
  const editAt = host.inbox.length;
  host.send({ t: 'admin', action: 'saveProfile', id: 'guestintegration', revision: full.revision,
    profile: { ...full.profile, coins: 12345, ownedBacks:['none','secret_helmet'], equippedBack:'secret_helmet', petTiers: { piggy: { 1: 2, 2: 3, 3: 1 } }, cards: { shield: 4 }, wins: 11 } });
  const edited = await host.next(m => m.t === 'adminProfile' && m.saved, editAt);
  assert.equal(edited.profile.coins, 12345);assert.ok(edited.profile.ownedBacks.includes('secret_helmet'));assert.deepEqual((await account('verify','GET',null,fresh.token)).secretBacks,['secret_helmet']);
  assert.equal(edited.profile.petTiers.piggy[2], 3);
  assert.equal((await account('me', 'GET', null, fresh.token)).revision, edited.revision);
  assert.equal((await api('/api/wins?id=guestintegration')).wins, 11);
  const conflictAt = host.inbox.length;
  host.send({ t: 'admin', action: 'saveProfile', id: 'guestintegration', revision: full.revision, profile: full.profile });
  assert.match((await host.next(m => m.t === 'error' && m.code === 'profile_edit_failed', conflictAt)).message, /Reload/);
  const seller = await connect('guestintegration', 'SALE1', { accountToken: fresh.token });
  const onlineEditAt = host.inbox.length;
  host.send({ t: 'admin', action: 'saveProfile', id: seller.id, revision: edited.revision, profile: { ...edited.profile, coins: 54321 } });
  const adjusted = await seller.next(m => m.t === 'profileAdjusted');
  assert.equal(adjusted.profile.coins, 54321);
  await host.next(m => m.t === 'adminProfile' && m.saved, onlineEditAt);
  assert.equal((await account('me', 'GET', null, fresh.token)).profile.coins, 54321);
  console.log('ok admin-only full profiles, offline persistent edits, conflict protection and cross-room profile delivery');
  host.send({ t: 'admin', action: 'setWins', id: seller.id, name: seller.id, wins: 7 });
  await host.next(m => m.t === 'winsSetResult' && m.id === seller.id);
  seller.send({ t: 'sellWins', requestId: 'sale0001' });
  const sold = await seller.next(m => m.t === 'winsSold');
  assert.equal(sold.coins, 1000);
  assert.equal(sold.wins, 2);
  const soldCount = seller.inbox.length;
  seller.send({ t: 'sellWins', requestId: 'sale0001' });
  assert.equal((await seller.next(m => m.t === 'winsSold' && m.requestId === 'sale0001', soldCount)).receipt, sold.receipt);
  assert.equal((await api(`/api/wins?id=${seller.id}`)).wins, 2);
  const second = await account('register', 'POST', { username: 'entry_player', password: 'entry-password', profile: { id: 'guestentrytwo', name: 'EntryPlayer' } });
  const entrantHost = await connect('guestintegration', 'ENTRY1', { accountToken: fresh.token });
  const entrant = await connect('guestentrytwo', 'ENTRY1', { accountToken: second.token });
  host.send({ t: 'admin', action: 'setWins', id: entrant.id, name: entrant.id, wins: 3 });
  await host.next(m => m.t === 'winsSetResult' && m.id === entrant.id);
  entrantHost.send({ t: 'host', action: 'settings', settings: { mode: 'roulette' } });
  entrantHost.send({ t: 'sit', seat: 0 }); entrant.send({ t: 'sit', seat: 1 });
  entrantHost.send({ t: 'bet', requestId: 'entryhost', amount: 25, balance: 1000 });
  entrant.send({ t: 'bet', requestId: 'entryguest', amount: 25, balance: 1000 });
  await entrantHost.next(m => m.t === 'betResult' && m.ok);
  await entrant.next(m => m.t === 'betResult' && m.ok);
  entrantHost.send({ t: 'host', action: 'start' });
  const freshMatch = (await entrantHost.next(m => m.t === 'match' && m.m.phase === 'roulette')).m;
  assert.equal(freshMatch.practice, true);
  assert.match(freshMatch.practiceReason, /less than 24 hours/);
  assert.equal((await api(`/api/wins?id=${entrantHost.id}`)).wins, 2);
  assert.equal((await api(`/api/wins?id=${entrant.id}`)).wins, 3);
  entrantHost.send({ t: 'host', action: 'endMatch' });
  await entrantHost.next(m => m.t === 'matchRefund');
  assert.equal((await api(`/api/wins?id=${entrantHost.id}`)).wins, 2);
  assert.equal((await api(`/api/wins?id=${entrant.id}`)).wins, 3);
  host.send({ t: 'admin', action: 'grant', id: other.id, coins: 777 });
  assert.equal((await other.next(m => m.t === 'grant')).coins, 777);
  host.send({ t: 'admin', action: 'announce', text: 's3x' });
  assert.equal((await other.next(m => m.t === 'announce')).text, '###');
  host.send({ t: 'admin', action: 'coins', id: other.id, operation: 'set', amount: 400 });
  assert.equal((await other.next(m => m.t === 'coinAdjust')).amount, 400);
  host.send({ t: 'admin', action: 'coins', id: other.id, operation: 'add', amount: -50 });
  assert.equal((await other.next(m => m.t === 'coinAdjust' && m.operation === 'add')).amount, -50);
  host.send({ t: 'admin', action: 'addCard', id: other.id, cardId: 'heart' });
  assert.equal((await other.next(m => m.t === 'adminCard')).cardId, 'heart');
  host.send({ t: 'admin', action: 'freeMerge', petId: 'kitty', tier: 1 });
  assert.equal((await host.next(m => m.t === 'petMergeGrant')).tier, 2);
  const privateRoom = await connect('PrivateIntegration', 'PRIVT');
  other.send({ t: 'admin', action: 'listRooms' });
  await wait(100);
  assert.ok(!other.inbox.some(m => m.t === 'adminRooms'));
  await wait(2200);
  host.send({ t: 'admin', action: 'listRooms' });
  const rooms = await host.next(m => m.t === 'adminRooms');
  assert.ok(rooms.rooms.some(room => room.code === 'PRIVT' && !room.public && room.players.some(p => p.id === privateRoom.id)));
  assert.ok(rooms.rooms.some(room => room.code === quick.code && room.public));
  assert.ok(!(await api('/api/public')).rooms.some(room => room.code === 'PRIVT'));
  host.send({ t: 'admin', action: 'setWins', id: privateRoom.id, name: privateRoom.id, wins: 17 });
  assert.equal((await host.next(m => m.t === 'winsSetResult' && m.id === privateRoom.id)).wins, 17);
  assert.deepEqual(await api(`/api/wins?id=${privateRoom.id}`), { wins: 17, revision: 1 });
  assert.ok((await api('/api/leaderboard', true)).top.some(row => row.wins === 17 && row.name.startsWith('PrivateIntegrat')));
  const beforeRefresh = host.inbox.length;
  host.send({ t: 'admin', action: 'listRooms' });
  assert.ok((await host.next(m => m.t === 'adminRooms', beforeRefresh)).leaders.some(row => row.id === privateRoom.id && row.wins === 17));
  host.send({ t: 'admin', action: 'coins', id: privateRoom.id, roomCode: 'PRIVT', operation: 'set', amount: 321 });
  assert.equal((await privateRoom.next(m => m.t === 'coinAdjust' && m.amount === 321)).amount, 321);
  host.send({ t: 'admin', action: 'addCard', id: privateRoom.id, roomCode: 'PRIVT', cardId: 'heart' });
  assert.equal((await privateRoom.next(m => m.t === 'adminCard')).cardId, 'heart');
  host.send({ t: 'admin', action: 'shutdownRoom', code: 'PRIVT' });
  assert.match((await privateRoom.next(m => m.t === 'kicked')).reason, /shut down/);
  await host.next(m => m.t === 'adminRoomShutdown' && m.code === 'PRIVT');
  await wait(2200);
  const afterShutdown = host.inbox.length;
  host.send({ t: 'admin', action: 'listRooms' });
  assert.ok(!(await host.next(m => m.t === 'adminRooms', afterShutdown)).rooms.some(room => room.code === 'PRIVT'));
  host.send({ t: 'admin', action: 'announce', text: 'Every room sees this', global: true });
  for (let i = 0; i < 80; i++) {
    if ((await api('/api/announcements')).notices.some(v => v.text === 'Every room sees this')) break;
    await wait(25);
  }
  assert.ok((await api('/api/announcements')).notices.some(v => v.text === 'Every room sees this'));
  assert.ok(privateRoom.welcome && !privateRoom.inbox.some(m => m.t === 'announce'));
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
  actor.send({ t: 'hint', turnId: typing.turnId, requestId: 'hintintegration', balance: 1000 });
  const hint = await actor.next(m => m.t === 'hint');
  assert.ok(hint.ok && hint.word.startsWith(typing.prefix));
  assert.ok(!target.inbox.some(m => m.t === 'hint'));
  const card = { t: 'queueCard', matchId: typing.matchId, requestId: 'cardintegration', cardId: 'heart', targetId: actor.id, style: 'deck' };
  target.send(card); target.send(card);
  assert.equal((await target.next(m => m.t === 'cardQueueResult')).ok, true);
  assert.ok(!actor.inbox.some(m => m.t === 'cardQueue'));
  actor.send({ t: 'submit', word: hint.word });
  const result = await target.next(m => m.t === 'cardResult');
  assert.equal(result.ok, true);
  await actor.next(m => m.t === 'cardUsed');
  // Heartbreaker has a 50% hit chance. Forfeit the target of the card to
  // verify the winner/leaderboard path without assuming a successful roll.
  actor.send({t:'stand'});
  await host.next(m => m.t === 'win');
  await target.next(m => m.t === 'reward');
  assert.equal(target.inbox.filter(m => m.t === 'reward').length, 1);
  assert.equal(actor.inbox.filter(m => m.t === 'cardUsed').length, 1);
  const board = await api('/api/leaderboard');
  assert.ok(board.top.some(r => r.name === target.id && r.wins === 1));
  console.log('ok private hint, card replay protection and global leaderboard write');

  const runner = await connect('RunnerIntegration', 'OBBYT');
  runner.send({t:'move',x:0,y:.25,z:77.5,ry:0});
  runner.send({t:'celebrate',kind:'portal',to:'obby'});
  await runner.next(m=>m.t==='travel'&&m.to==='obby');
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
  assert.ok((await api('/api/leaderboard', true)).top.some(r => r.name === target.id && r.wins >= 1));
  const resumed = await connect(host.id, 'TOKNT', { adminToken: unlocked.token });
  assert.equal(resumed.welcome.isAdmin, true);
  resumed.send({ t: 'admin', action: 'removeLeaderboard', id: target.id });
  await wait(300);
  resumed.ws.close();
  await stop(); await start();
  assert.ok(!(await api('/api/leaderboard')).top.some(r => r.name === target.id));
  console.log('ok SQLite persistence, token reconnect and admin leaderboard removal');
  console.log(`Integration passed; disposable storage: ${storage}`);
} finally {
  for (const client of clients) client.ws.close();
  await stop();
}
