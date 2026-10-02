import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, dict, FakeConn } from './helpers.js';
import { MODES, OBBY, PROTOCOL_VERSION, ROULETTE_COUNTDOWN_MS } from '../public/js/shared/constants.js';
import { filterText, isBlockedWord } from '../src/blocklist.js';
import { adminToken } from '../src/auth.js';
import { planTurn } from '../src/bots.js';
import { botProfile } from '../src/bots.js';
import { createDictionary } from '../src/dictionary.js';
import { tradeInventory } from '../public/js/shared/trade.js';

test('a bot makes a match practice with no win or coin payout', () => {
  const wins = [];
  const room = createRoom({ onWin: value => wins.push(value) });
  const human = room.join('alice');
  room.send(human, { t: 'sit', seat: 0 });
  room.send(human, { t: 'host', action: 'addBot' });
  room.send(human, { t: 'host', action: 'start' });
  assert.equal(room.engine.match.practice, true);
  room.engine.endMatch('alice');
  assert.equal(human.last('win').practice, true);
  assert.equal(human.last('reward').coins, 0);
  assert.equal(human.last('reward').won, false);
  assert.equal(room.engine.players.get('alice').wins, 0);
  assert.deepEqual(wins, []);
});

test('a Last Sip practice match returns the human entry without a win', () => {
  const wins = [];
  const room = createRoom({ onWin: value => wins.push(value) });
  const human = room.join('alice');
  room.send(human, { t: 'host', action: 'settings', settings: { mode: 'roulette' } });
  room.send(human, { t: 'sit', seat: 0 });
  room.send(human, { t: 'host', action: 'addBot' });
  room.send(human, { t: 'bet', requestId: 'practice-entry', amount: 75, balance: 1000 });
  room.send(human, { t: 'host', action: 'start' });
  assert.equal(room.engine.match.practice, true);
  room.engine.endRoulette('alice');
  assert.equal(human.last('rouletteReward').coins, 75);
  assert.equal(human.last('rouletteReward').won, false);
  assert.equal(human.last('rouletteReward').practice, true);
  assert.equal(room.engine.players.get('alice').wins, 0);
  assert.deepEqual(wins, []);
});

test('Last Sip requires two signed-in humans and explains guest practice', () => {
  const room = createRoom();
  const a = room.join('alice'), b = room.join('bob');
  room.send(a, { t: 'host', action: 'settings', settings: { mode: 'roulette' } });
  room.send(a, { t: 'sit', seat: 0 }); room.send(b, { t: 'sit', seat: 1 });
  for (const [conn, id] of [[a, 'a'], [b, 'b']]) room.send(conn, { t: 'bet', requestId: id, amount: 25, balance: 1000 });
  room.send(a, { t: 'host', action: 'start' });
  assert.equal(room.engine.match.practice, true);
  assert.match(room.engine.matchView().practiceReason, /signed-in/);
  room.engine.endRoulette('alice');
  assert.equal(a.last('rouletteReward').coins, 25);
  room.clock.advance(15000);
  room.engine.players.get('alice').accountCreatedAt = -100_000_000;
  room.engine.players.get('bob').accountCreatedAt = -100_000_000;
  for (const [conn, id] of [[a, 'c'], [b, 'd']]) room.send(conn, { t: 'bet', requestId: id, amount: 25, balance: 1000 });
  room.send(a, { t: 'host', action: 'start' });
  assert.equal(room.engine.match.practice, false);
});

test('a missing recorded trophy blocks Last Sip and refunds entries without spending wins', () => {
  const checks = [];
  const room = createRoom({ onCheckTrophies: ids => { checks.push(ids); return { ok: false, error: 'Each player needs at least one recorded win to play Last Sip.' }; } });
  const a = room.join('alice'), b = room.join('bob');
  for (const id of ['alice', 'bob']) { room.engine.players.get(id).accountCreatedAt = -100_000_000; room.engine.players.get(id).wins = 1; }
  room.send(a, { t: 'host', action: 'settings', settings: { mode: 'roulette' } });
  room.send(a, { t: 'sit', seat: 0 }); room.send(b, { t: 'sit', seat: 1 });
  room.send(a, { t: 'bet', requestId: 'aa', amount: 25, balance: 1000 });
  room.send(b, { t: 'bet', requestId: 'bb', amount: 25, balance: 1000 });
  room.send(a, { t: 'host', action: 'start' });
  assert.deepEqual(checks, [['alice', 'bob']]);
  assert.equal(room.engine.match.phase,'lobby');
  assert.match(a.last('error').message,/one recorded win/);
  assert.equal(room.engine.players.get('alice').wins, 1);
  assert.equal(a.last('stakeRefund').coins,25);assert.equal(b.last('stakeRefund').coins,25);
  assert.equal(a.all('rouletteReward').length,0);
});

test('Last Sip waits 15 seconds after two entries and explains a young account', () => {
  const room = createRoom();
  const a = room.join('alice'), b = room.join('bob');
  room.engine.players.get('alice').accountCreatedAt = room.clock.now() - 86400001;
  room.engine.players.get('bob').accountCreatedAt = room.clock.now() - 1000;
  room.send(a, { t: 'host', action: 'settings', settings: { mode: 'roulette' } });
  room.send(a, { t: 'sit', seat: 0 }); room.send(b, { t: 'sit', seat: 1 });
  room.send(a, { t: 'bet', requestId: 'a', amount: 25, balance: 1000 });
  assert.equal(room.engine.match.phase, 'lobby');
  room.send(b, { t: 'bet', requestId: 'b', amount: 25, balance: 1000 });
  assert.equal(room.engine.match.phase, 'countdown');
  assert.equal(room.engine.match.duration, ROULETTE_COUNTDOWN_MS);
  room.clock.advance(ROULETTE_COUNTDOWN_MS - 1);
  assert.equal(room.engine.match.phase, 'countdown');
  room.clock.advance(1);
  assert.equal(room.engine.match.practice, true);
  assert.match(room.engine.match.practiceReason, /less than 24 hours/);
  room.engine.endRoulette('alice');
  assert.match(a.last('win').practiceReason, /less than 24 hours/);
  assert.equal(a.last('rouletteReward').coins, 25);
});

test('a bot never counts as the second entry for Last Sip auto start', () => {
  const room = createRoom(), a = room.join('alice');
  room.send(a, { t: 'host', action: 'settings', settings: { mode: 'roulette' } });
  room.send(a, { t: 'sit', seat: 0 });
  room.send(a, { t: 'host', action: 'addBot' });
  room.send(a, { t: 'bet', requestId: 'entry', amount: 25, balance: 1000 });
  assert.equal(room.engine.match.phase, 'lobby');
  room.send(a, { t: 'host', action: 'start' });
  assert.equal(room.engine.match.practice, true);
});

test('word prompts avoid hard and repeated suffixes and fall back when common answers run out', () => {
  const room = game(), m = room.engine.match;
  m.mode = 'classic';
  for (const suffix of ['ol', 'py', 'up', 'ty']) assert.equal(room.engine.nextPrefix(`a${suffix}`), suffix[1]);
  room.forced.push(0);
  assert.equal(room.engine.nextPrefix('open'), 'en');
  assert.equal(room.engine.nextPrefix('open'), 'n');
  const common = room.engine.botDicts.normal;
  for (;;) {
    const answer = common.randomWithPrefix('ed', m.used, () => 0);
    if (!answer) break;
    m.used.add(answer);
  }
  assert.equal(room.engine.nextPrefix('red'), 'd');
});

test('owner swearing option allows ordinary profanity while retaining slur filtering', () => {
  const room = createRoom(), a = room.join('alice'), b = room.join('bob');
  room.send(a, { t: 'host', action: 'settings', settings: { allowSwearing: true } });
  assert.equal(room.engine.settings.allowSwearing, true);
  room.send(a, { t: 'chat', text: 'damn dike' });
  assert.equal(b.last('chat').text, 'damn ####');
  room.send(a, { t: 'sit', seat: 0 }); room.send(b, { t: 'sit', seat: 1 });
  room.send(a, { t: 'host', action: 'start' });
  const m = room.engine.match;
  m.prefix = 'f'; assert.equal(room.engine.rejectReason('fuck'), null);
  m.prefix = 'd'; assert.equal(room.engine.rejectReason('dike'), 'not_word');
  assert.equal(dict.has('venus'), true);
  m.prefix = 'v'; assert.equal(room.engine.rejectReason('venus'), null);
});

test('admin pet collection and card grants acknowledge success', () => {
  const room = createRoom(), admin = room.join('admin');
  room.engine.players.get('admin').isAdmin = true;
  room.send(admin, { t: 'admin', action: 'grantPet', petId: 'dragon' });
  assert.equal(admin.last('petMergeGrant').tier, 1);
  assert.equal(admin.last('petMergeGrant').petId, 'dragon');
  assert.equal(admin.last('adminPetResult').petId, 'dragon');
  room.send(admin, { t: 'admin', action: 'addCard', id: 'admin', cardId: 'heart' });
  assert.equal(admin.last('adminCard').cardId, 'heart');
  assert.equal(admin.last('adminCardResult').cardId, 'heart');
});

test('selling wins needs a signed-in account and updates the exact leaderboard revision', async () => {
  let sales = 0;
  const room = createRoom({ onSellWins: async ({ id, requestId }) => {
    assert.equal(id, 'alice'); assert.equal(requestId, 'sale1234'); sales++;
    return { ok: true, wins: 7, revision: 3, coins: 1000, receipt: 'wins:alice:sale1234' };
  } });
  const alice = room.join('alice');
  room.send(alice, { t: 'sellWins', requestId: 'sale1234' });
  assert.equal(alice.last('error').code, 'account_required');
  room.engine.players.get('alice').accountCreatedAt = 1;
  room.send(alice, { t: 'sellWins', requestId: 'sale1234' });
  await Promise.resolve();
  assert.equal(alice.last('winsSold').wins, 7);
  assert.equal(alice.last('winsSold').revision, 3);
  room.send(alice, { t: 'sellWins', requestId: 'sale1234' });
  assert.equal(sales, 1);
});

test('bot cosmetics match difficulty and an empty room drops its bots and timers', () => {
  assert.equal(botProfile(() => .99, new Set(), 'easy').pet, null);
  assert.notEqual(botProfile(() => .99, new Set(), 'normal').pet, 'dragon');
  assert.equal(botProfile(() => .99, new Set(), 'hard').pet, 'moth');
  const room=createRoom(); const human=room.join('alice');
  room.send(human,{t:'host',action:'addBot'});
  assert.equal(room.engine.players.size,2);
  const bot=[...room.engine.players.values()].find(p=>p.isBot);
  room.send(human,{t:'host',action:'settings',settings:{botLevel:'easy'}});
  assert.equal(bot.pet,null);
  room.engine.random=()=>.99;
  room.send(human,{t:'host',action:'settings',settings:{botLevel:'hard'}});
  assert.equal(bot.pet,'moth');
  room.engine.disconnect(human);
  assert.equal(room.engine.players.size,0);
  assert.equal(room.engine.match.phase,'lobby');
  assert.equal(room.clock.pending,0);
  assert.deepEqual(room.errors,[]);
});

test('admin room shutdown closes sockets, refunds an active game and resets the room', () => {
  const room=createRoom(), a=room.join('alice'), b=room.join('bob');
  room.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});
  room.send(a,{t:'sit',seat:0}); room.send(b,{t:'sit',seat:1});
  for(const [conn,id] of [[a,'a'],[b,'b']]) room.send(conn,{t:'bet',requestId:id,amount:25,balance:100});
  room.send(a,{t:'host',action:'start'});
  room.engine.shutdownRoom();
  assert.equal(a.last('matchRefund').coins,25);
  assert.equal(b.last('matchRefund').coins,25);
  assert.match(a.last('kicked').reason,/shut down/);
  assert.equal(a.closed.code,4004);
  assert.equal(a.closed.reason,'room_shutdown');
  assert.equal(room.engine.players.size,0);
  assert.equal(room.engine.match.phase,'lobby');
  assert.equal(room.clock.pending,0);
});

test('trade moves chairs, tiered pets and cards exactly once after both accept', () => {
  const records=[];
  const room = createRoom({onTradeRecorded:record=>records.push(record)});
  const a = room.join('alice', { inventory: { coins: 1000, ownedChairs: ['wooden', 'glass'], petTiers: { doggy: { 1: 2 } }, cards: { skip: 3 } } });
  const b = room.join('bob', { inventory: { coins: 300, ownedBacks: ['none', 'cape'], cards: { time_tax: 2 } } });
  room.engine.players.get('alice').accountCreatedAt = room.clock.now() - 86400001;
  room.engine.players.get('bob').accountCreatedAt = room.clock.now() - 86400001;
  room.send(a, { t: 'tradeRequest', targetId: 'bob' });
  const id = a.last('tradeState').id;
  assert.equal(b.last('tradeState').stage, 'invite');
  room.send(b, { t: 'tradeRespond', id, accept: true });
  const aliceOffer = { items: [{ kind: 'chair', id: 'glass', qty: 1 }, { kind: 'pet', id: 'doggy', tier: 1, qty: 1 }, { kind: 'card', id: 'skip', qty: 2 }] };
  const bobOffer = { items: [{ kind: 'card', id: 'time_tax', qty: 1 }] };
  room.send(a, { t: 'tradeOffer', id, offer: aliceOffer });
  room.send(b, { t: 'tradeOffer', id, offer: bobOffer });
  room.send(a, { t: 'tradeAccept', id, inventory: tradeInventory({ coins: 1000, ownedChairs: ['wooden', 'glass'], petTiers: { doggy: { 1: 2 } }, cards: { skip: 3 } }) });
  room.send(b, { t: 'tradeAccept', id, inventory: tradeInventory({ coins: 300, cards: { time_tax: 2 } }) });
  assert.equal(a.last('tradeState').accepted, true);
  assert.equal(b.last('tradeState').accepted, true);
  room.clock.advance(3000);
  assert.equal(a.all('tradeComplete').length, 1);
  assert.equal(b.all('tradeComplete').length, 1);
  assert.equal(records.length,1);assert.equal(records[0].room,'TEST1');assert.deepEqual(records[0].people.map(p=>p.id),['alice','bob']);assert.deepEqual(records[0].offers.alice,aliceOffer);
  assert.equal('coins' in room.engine.players.get('alice').tradeInventory,false);
  assert.equal('coins' in room.engine.players.get('bob').tradeInventory,false);
  assert.deepEqual(room.engine.players.get('alice').tradeInventory.chairs, []);
  assert.deepEqual(room.engine.players.get('bob').tradeInventory.chairs, ['glass']);
  assert.equal(room.engine.players.get('bob').tradeInventory.pets['doggy:1'], 1);
  assert.equal(room.engine.players.get('bob').tradeInventory.cards.skip, 2);
  assert.deepEqual(room.errors, []);
});

test('changing a trade offer clears approvals and duplicate chairs cannot be received', () => {
  const room = createRoom();
  const inv = tradeInventory({ coins: 500, ownedChairs: ['wooden', 'glass'] });
  const a = room.join('alice', { inventory: inv }), b = room.join('bob', { inventory: inv });
  room.engine.players.get('alice').accountCreatedAt = room.clock.now() - 86400001;
  room.engine.players.get('bob').accountCreatedAt = room.clock.now() - 86400001;
  room.send(a, { t: 'tradeRequest', targetId: 'bob' });
  const id = a.last('tradeState').id;
  room.send(b, { t: 'tradeRespond', id, accept: true });
  room.send(a, { t: 'tradeOffer', id, offer: { items: [{ kind: 'chair', id: 'glass' }] } });
  room.send(a, { t: 'tradeAccept', id, inventory: inv });
  assert.equal(a.last('tradeState').accepted, true);
  room.send(b, { t: 'tradeOffer', id, offer: { items: [] } });
  assert.equal(a.last('tradeState').accepted, false);
  room.send(b, { t: 'tradeAccept', id, inventory: inv });
  assert.match(b.last('tradeError').message, /already own/);
  room.clock.advance(3000);
  assert.equal(a.all('tradeComplete').length, 0);
  room.send(a, { t: 'tradeCancel', id });
  assert.equal(b.last('tradeClosed').reason, 'Trade canceled.');
  assert.deepEqual(room.errors, []);
});

test('trading waits for both accounts to reach 24 hours', () => {
  const room = createRoom();
  const a = room.join('alice'), b = room.join('bob');
  room.send(a, { t: 'tradeRequest', targetId: 'bob' });
  assert.match(a.last('tradeError').message, /24 hours/);
  room.engine.players.get('alice').accountCreatedAt = room.clock.now() - 86400001;
  room.engine.players.get('bob').accountCreatedAt = room.clock.now() - 86400000 + 1;
  room.send(a, { t: 'tradeRequest', targetId: 'bob' });
  assert.match(a.last('tradeError').message, /not yet eligible/);
  room.clock.advance(1);
  room.send(a, { t: 'tradeRequest', targetId: 'bob' });
  assert.equal(a.last('tradeState').stage, 'invite');
});

function game(options = {}, hello = {}) {
  const room = createRoom(options);
  for (const [seat, id] of ['alice', 'bob', 'carol'].entries()) {
    const conn = room.join(id, { cards: { skip: 2, time_tax: 2, pressure: 2, heart: 2 }, ...hello[id] });
    room.send(conn, { t: 'sit', seat });
  }
  room.send(room.conns.alice, { t: 'host', action: 'start' });
  room.engine.pick(room.engine.match.options[0]);
  return room;
}
function play(room, delay = 1000) {
  const m = room.engine.match;
  const id = m.typerId;
  const word = dict.randomWithPrefix(m.prefix, m.used, () => .2, { minLen: m.minLength, maxLen: 8 });
  room.clock.advance(delay);
  room.send(room.conns[id], { t: 'submit', word });
  return room.conns[id].last('result');
}

test('each mode loads defaults, plays a full bot match and reports its rules', () => {
  for (const mode of MODES) {
    const room = createRoom({ seed: 71 });
    const host = room.join('host');
    room.send(host, { t: 'host', action: 'settings', settings: { mode: mode.id } });
    assert.equal(room.engine.settings.hearts, mode.hearts);
    room.send(host, { t: 'host', action: 'addBot' });
    room.send(host, { t: 'host', action: 'addBot' });
    room.send(host, { t: 'host', action: 'start' });
    assert.equal(room.engine.match.mode, mode.id === 'custom' ? 'classic' : mode.id);
    if (mode.id === 'chaos') assert.ok(room.engine.match.twist);
    for (let i = 0; i < 2400 && !host.last('win'); i++){room.clock.advance(500);if(room.engine.players.get('host')?.presence)room.send(host,{t:'presenceReply',token:room.engine.players.get('host').presence.token});}
    assert.ok(host.last('win'), mode.id);
    assert.deepEqual(room.errors, [], mode.id);
  }
});

test('custom settings return to the preset when its values are restored', () => {
  const room = createRoom();
  const host = room.join('host');
  room.send(host, { t: 'host', action: 'settings', settings: { mode: 'classic' } });
  room.send(host, { t: 'host', action: 'settings', settings: { mode: 'custom', hearts: 3 } });
  assert.equal(room.engine.settings.mode, 'custom');
  room.send(host, { t: 'host', action: 'settings', settings: { mode: 'custom', hearts: 2 } });
  assert.equal(room.engine.settings.mode, 'classic');
  assert.equal(room.engine.settings.baseMode, undefined);
});

test('long, sudden, random and blitz rules apply at turns', () => {
  for (const mode of ['long', 'sudden', 'random', 'blitz']) {
    const room = game();
    const m = room.engine.match;
    m.mode = mode;
    m.settings.turnSeconds = mode === 'blitz' ? 8 : 15;
    room.engine.startTurn(m.typerId);
    if (mode === 'long') { assert.equal(m.minLength, 5); assert.equal(room.engine.rejectReason('cat'), 'too_short'); }
    if (mode === 'sudden') assert.equal(m.maxMistakes, 1);
    if (mode === 'random') { room.forced.push(.25); assert.equal(room.engine.nextPrefix('planet'), 'l'); assert.equal(m.prefixIndex, 1); }
    if (mode === 'blitz') { m.wordCount = 20; room.engine.startTurn(m.typerId); assert.equal(m.duration, 3000); }
  }
});

test('WPM combos multiply coins at 3, 5, 8; mistakes and slow words reset them', () => {
  const room = game();
  const seen = new Map();
  for (let i = 0; i < 24; i++) {
    const result = play(room, 250);
    assert.ok(result.ok);
    seen.set(result.combo, result);
  }
  for (const [combo, multiplier] of [[3, 1.5], [5, 2], [8, 3]]) {
    const result = seen.get(combo);
    assert.ok(result.flairs.some(f => f.id === `combo_${combo}`));
    assert.equal(result.coins - result.flairs.reduce((sum, f) => sum + f.coins, 0), Math.round(10 * multiplier) + 16);
  }
  const id = room.engine.match.typerId;
  room.send(room.conns[id], { t: 'submit', word: '!' });
  assert.equal(room.engine.participant(id).combo, 0);
  const result = play(room, room.engine.match.duration * .7);
  assert.equal(result.combo, 0);
});

test('first human keystroke anchors WPM; last-moment accepted words award private coin flairs', () => {
  const room = game();
  const m = room.engine.match;
  const conn = room.conns[m.typerId];
  room.clock.advance(m.duration - 450);
  room.send(conn, { t: 'typing', text: m.prefix });
  const result = play(room, 250);
  assert.ok(result.flairs.some(f => f.id === 'close_call'));
  assert.equal(result.wpm, 250);
  const next = room.engine.match;
  const buzzer = play(room, next.duration - 100);
  assert.ok(buzzer.flairs.some(f => f.id === 'buzzer'));
  assert.ok(!buzzer.flairs.some(f => f.id === 'close_call'));
});

test('hints are valid, private, charged once, and reject stale/poor/no-answer requests', () => {
  const room = game();
  const m = room.engine.match;
  const conn = room.conns[m.typerId];
  const request = { t: 'hint', turnId: m.turnId, requestId: 'hint1', balance: 1000 };
  room.send(conn, { ...request, requestId: 'poor', balance: 249 });
  assert.equal(conn.last('hint').reason, 'insufficient_funds');
  room.send(conn, request);
  const answer = conn.last('hint');
  assert.equal(answer.ok, true);
  assert.equal(answer.cost, 1000);
  assert.equal(answer.matchId, m.matchId);
  assert.equal(answer.receipt, `answer:${m.matchId}:${m.turnId}:${m.typerId}`);
  assert.equal(room.engine.rejectReason(answer.word), null);
  for (const other of Object.values(room.conns).filter(c => c !== conn)) assert.equal(other.all('hint').length, 0);
  room.send(conn, request);
  assert.deepEqual(conn.last('hint'), answer);
  room.send(conn, { ...request, requestId: 'hint2' });
  assert.equal(conn.last('hint').reason, 'already_bought');
  room.clock.advance(1000);
  room.send(conn, { t: 'submit', word: answer.word });
  assert.equal(conn.last('result').paidAnswer, true);
  assert.equal(conn.last('result').coins, 0);
  assert.equal(conn.last('result').combo, 0);
  assert.deepEqual(conn.last('result').flairs, []);
  room.send(conn, { ...request, requestId: 'late' });
  assert.equal(conn.last('hint').reason, 'turn_ended');
  const current = room.conns[m.typerId];
  room.engine.dict = createDictionary('');
  room.send(current, { ...request, turnId: m.turnId, requestId: 'empty' });
  assert.equal(current.last('hint').reason, 'no_answer');
});

function queue(room, actor, cardId, targetId, requestId = 'plan') {
  const request = { t: 'queueCard', matchId: room.engine.match.matchId, requestId, cardId, targetId, style: 'deck' };
  room.send(room.conns[actor], request);
  return request;
}

test('queued skip, time and mistakes consume once at turn lock, and direct use is rejected', () => {
  for (const cardId of ['skip', 'time_tax', 'pressure']) {
    const room = game(), m = room.engine.match;
    const actor = room.engine.nextAlive(m.typerId), targetId = room.engine.nextAlive(actor), conn = room.conns[actor];
    const request = queue(room, actor, cardId, targetId);
    assert.equal(conn.last('cardQueueResult').ok, true);
    assert.equal(room.engine.players.get(actor).cards[cardId], 2);
    room.send(conn, request);
    play(room);
    assert.equal(m.phase, 'cardReveal');
    assert.equal(conn.last('cardResult').ok, true);
    assert.equal(room.engine.players.get(actor).cards[cardId], 1);
    room.send(conn, request);
    room.send(conn, { t: 'useCard', requestId: 'late-use', turnId: m.turnId, cardId, targetId });
    assert.equal(conn.last('cardResult').ok, false);
    assert.equal(conn.all('cardUsed').length, 1);
    room.clock.advance(5199); assert.equal(m.phase, 'cardReveal');
    room.clock.advance(1); assert.equal(m.phase, 'typing');
    play(room);
    if (cardId === 'skip') assert.notEqual(m.typerId, targetId);
    else assert.equal(cardId === 'time_tax' ? m.duration : m.maxMistakes, cardId === 'time_tax' ? 13000 : 3);
    assert.deepEqual(room.engine.participant(targetId).pending, { skip: false, time: 0, mistakes: 0 });
    assert.deepEqual(room.errors, []);
  }
});

test('Free Pass queued for yourself skips the upcoming turn without losing a heart', () => {
  const room = game(), m = room.engine.match, actor = room.engine.nextAlive(m.typerId), conn = room.conns[actor];
  for (const cardId of ['time_tax', 'pressure', 'heart']) {
    room.clock.advance(1000); queue(room, actor, cardId, actor, cardId);
    assert.equal(conn.last('cardQueueResult').reason, 'invalid_target');
  }
  room.clock.advance(1000); queue(room, actor, 'skip', actor, 'self-skip');
  const hearts = room.engine.participant(actor).hearts;
  play(room); assert.equal(m.phase, 'cardReveal');
  room.clock.advance(5200);
  assert.notEqual(m.typerId, actor);
  assert.equal(room.engine.participant(actor).pending.skip, false);
  assert.equal(room.engine.participant(actor).hearts, hearts);
});

test('portal and hatch celebrations relay to everyone with server-owned identity and limits', () => {
  const room = createRoom();
  const a = room.join('alice'); const b = room.join('bob');
  room.send(a, {t:'move',x:0,y:.25,z:77.5,ry:0,anim:'idle'});
  room.send(a, { t: 'celebrate', kind: 'portal', to: 'obby', id: 'bob' });
  assert.deepEqual(b.last('celebrate'), { t: 'celebrate', kind: 'portal', to: 'obby', id: 'alice', door:{x:0,y:.25,z:77.5} });
  assert.deepEqual(a.last('celebrate'), b.last('celebrate'));
  room.send(a, { t: 'celebrate', kind: 'hatch' });
  assert.equal(b.all('celebrate').length, 1);
  room.clock.advance(1000);
  room.send(a, { t: 'celebrate', kind: 'hatch' });
  assert.equal(b.last('celebrate').kind, 'hatch');
  room.clock.advance(1000);
  room.send(a, { t: 'celebrate', kind: 'portal', to: 'invalid' });
  assert.equal(b.all('celebrate').length, 2);
  const active = game();
  active.send(active.conns.alice, { t: 'celebrate', kind: 'hatch' });
  assert.equal(active.conns.bob.all('celebrate').length, 0);
});

test('queued heart cards honor shields and can end a match during reveal', () => {
  const room = game(), m = room.engine.match, actor = room.engine.nextAlive(m.typerId), targetId = room.engine.nextAlive(actor), target = room.engine.participant(targetId);
  target.shield = true;
  room.engine.random=()=>.1;
  queue(room, actor, 'heart', targetId, 'heart1'); play(room);
  assert.equal(target.hearts, 2); assert.equal(target.shield, true);
  assert.equal(room.conns[actor].last('cardUsed').shielded, true);
  room.clock.advance(4699);
  assert.equal(target.shield, true);
  room.clock.advance(1);
  assert.equal(target.shield, false);
  room.clock.advance(500); play(room);
  queue(room, actor, 'heart', targetId, 'heart2');
  target.hearts = 1; room.engine.participant(room.engine.nextAlive(targetId)).alive = false;
  room.engine.startTurn(actor);
  assert.equal(m.phase, 'cardReveal'); assert.equal(target.alive, true);
  room.clock.advance(4700);
  assert.equal(m.phase, 'ended'); assert.equal(m.winnerId, actor); assert.equal(target.alive, false);
  room.clock.advance(4500); assert.notEqual(m.phase, 'typing');
  assert.deepEqual(room.errors, []);
});

test('in-match inventory updates and reconnects cannot refill spent cards', () => {
  const room = game();
  const m = room.engine.match;
  const id = m.typerId;
  const player = room.engine.players.get(id);
  player.cards.heart = 0;
  room.send(room.conns[id], { t: 'loadout', cards: { heart: 999 } });
  room.join(id, { cards: { heart: 999 } });
  assert.equal(player.cards.heart, 0);
});

test('a spectator can buy card boxes during a match and sync the new card without refilling players', () => {
  const room=game();
  const spectator=room.join('spectator',{cards:{skip:0}});
  room.send(spectator,{t:'loadout',cards:{skip:1}});
  assert.equal(room.engine.players.get('spectator').cards.skip,1);
  room.join('spectator',{cards:{skip:2}});
  assert.equal(room.engine.players.get('spectator').cards.skip,2);
  const active=room.engine.match.typerId;
  const before=room.engine.players.get(active).cards.skip;
  room.send(room.conns[active],{t:'loadout',cards:{skip:999}});
  assert.equal(room.engine.players.get(active).cards.skip,before);
});

test('dragon rolls once: half chance caps next turn at 3 seconds including time pets', () => {
  for (const [roll, expected] of [[.49, 3000], [.5, 20000]]) {
    const room = game();
    const m = room.engine.match;
    room.engine.participant(m.typerId).ability = { type: 'dragon', chance: .5, value: 3 };
    room.engine.participant(room.engine.nextAlive(m.typerId)).ability = { type: 'time', value: 5 };
    room.forced.push(.99, roll);
    play(room);
    assert.equal(m.duration, expected);
  }
});

test('duration bonus is monotonic, requires meaningful human play, excludes lobby and pays once', () => {
  for (const [duration, words, expected] of [[60000, 2, 15], [120000, 4, 30], [7200000, 240, 1800], [7200000, 2, 15]]) {
    const wins = [];
    const room = game({ onWin: v => wins.push(v) });
    const m = room.engine.match;
    m.participants[0].words = 1; m.participants[1].words = words - 1; m.wordCount = words;
    room.clock.t += duration;
    for(const p of room.engine.players.values())room.engine.noteActivity(p,false,true);
    room.engine.endMatch('alice');
    const reward = room.conns.alice.last('reward');
    assert.equal(reward.durationMs, duration);
    assert.equal(reward.bonuses.find(b => b.label === 'Time played').coins, expected);
    room.engine.endMatch('alice');
    assert.equal(room.conns.alice.all('reward').length, 1);
    assert.equal(wins.length, 1);
  }
  const room = game();
  room.clock.t += 7200000;
  for(const p of room.engine.players.values())room.engine.noteActivity(p,false,true);
  room.engine.endMatch('alice');
  assert.equal(room.conns.alice.last('reward').eligibleMs, 0);
});

test('admin tokens stay private, survive reconnect, reject forged flags and rotate with secret', async () => {
  const room = createRoom({ adminCode: 'test-secret' });
  const host = room.join('host');
  const admin = room.join('admin', { _verified: true, isAdmin: true });
  assert.equal(room.engine.players.get('admin').isAdmin, false);
  await room.engine.onUnlock(room.engine.players.get('admin'), ' TEST-SECRET ');
  const token = admin.last('unlock').token;
  assert.ok(token);
  assert.equal(room.engine.view(room.engine.players.get('admin')).isAdmin, undefined);
  room.send(host, { t: 'mod', action: 'kick', id: 'admin' });
  assert.equal(host.last('error').code, 'not_allowed');
  room.send(host, { t: 'mod', action: 'ban', id: 'admin' });
  assert.equal(host.last('error').code, 'not_allowed');
  assert.equal(host.last('modResult'), undefined);
  room.send(host, { t: 'admin', action: 'grant', id: 'host', coins: 100 });
  assert.equal(host.all('grant').length, 0);
  const reconnect = new FakeConn();
  await room.engine.hello(reconnect, { t: 'hello', id: 'admin', v: PROTOCOL_VERSION, adminToken: token });
  assert.equal(reconnect.last('welcome').isAdmin, true);
  assert.ok(!reconnect.last('welcome').players.some(p => p.isAdmin));
  room.send(reconnect, { t: 'admin', action: 'tag', on: true });
  assert.equal(host.last('player').p.isAdmin, true);
  assert.notEqual(await adminToken('rotated-secret', 'admin'), token);
  assert.ok(!JSON.stringify(host.sent).includes('test-secret'));
});

test('unlock limits both connection and IP; bans apply to identity and hashed IP', async () => {
  const room = createRoom({ adminCode: 'test-secret' });
  const host = room.join('host');
  const a = room.join('alice');
  room.engine.players.get('alice').ipHash = 'hash-a';
  for (let i = 0; i < 5; i++) await room.engine.onUnlock(room.engine.players.get('alice'), 'wrong');
  await room.engine.onUnlock(room.engine.players.get('alice'), 'test-secret');
  assert.equal(a.last('unlock').ok, false);
  const b = room.join('bob');
  room.engine.players.get('bob').ipHash = 'hash-a';
  await room.engine.onUnlock(room.engine.players.get('bob'), 'test-secret');
  assert.equal(b.last('unlock').ok, false);
  room.send(host, { t: 'mod', action: 'ban', id: 'alice' });
  assert.equal(a.closed.code, 4002);
  const fresh = new FakeConn(); fresh.ipHash = 'hash-a';
  room.send(fresh, { t: 'hello', id: 'fresh', v: PROTOCOL_VERSION });
  assert.equal(fresh.closed.code, 4002);
  room.send(host, { t: 'mod', action: 'unban', id: 'alice' });
  assert.ok(room.join('alice').last('welcome'));
});

test('obby rewards require elapsed time and finish position and obey cooldown', () => {
  const room = createRoom();
  const conn = room.join('alice');
  const player = room.engine.players.get('alice');
  room.send(conn, { t: 'obby', event: 'start' });
  room.send(conn, { t: 'obby', event: 'finish', ms: 30000 });
  assert.equal(conn.all('grant').length, 0);
  room.clock.advance(30000);
  player.pos = { ...OBBY.finish };
  room.send(conn, { t: 'obby', event: 'finish', ms: 30000 });
  assert.equal(conn.last('grant').coins, 50);
  room.send(conn, { t: 'obby', event: 'start' });
  room.clock.advance(30000);
  room.send(conn, { t: 'obby', event: 'finish', ms: 30000 });
  assert.equal(conn.all('grant').length, 1);
});

test('strict filter blocks sexual terms and evasion without matching innocent substrings', () => {
  const blocked = 'sex sexy sexual sexually sexes sexed sexting sext nude nudes nudity naked horny orgasm erotic erotica fetish kinky kink penis vagina vulva testicles boobs nipples genitals masturbate masturbation ejaculate semen sperm condom viagra orgy stripper hooker prostitute prostitution brothel pervert perv pedophile pedo incest bdsm nsfw xxx hentai cocaine heroin meth suicide kys s3x'.split(' ');
  for (const word of blocked) { assert.ok(isBlockedWord(word), word); assert.ok(filterText(word).includes('#'), word); }
  assert.equal(filterText('s e x'), '#####');
  for (const word of 'class assess sextant sexton Sussex cocktail Scunthorpe grape therapist analysis butterscotch kill die gun weed crack strip hump'.split(' ')) {
    assert.equal(isBlockedWord(word), false, word);
    assert.equal(filterText(word), word);
  }
});

test('bots never fall back to the full dictionary and follow difficulty word lengths', () => {
  assert.deepEqual(planTurn({ prefix: 'a', used: new Set(), turnMs: 15000, dict, botDict: createDictionary(''), random: () => .99 }), []);
  const room = createRoom();
  assert.ok(room.engine.botDicts.easy.countPrefix('') < room.engine.botDicts.normal.countPrefix(''));
  assert.ok(room.engine.botDicts.normal.countPrefix('') < room.engine.botDicts.hard.countPrefix(''));
});


test('travel commits on the server, locks moves and seats, and rejects forged zone exits',()=>{
  const room=createRoom(),a=room.join('alice');
  const p=room.engine.players.get('alice');
  room.send(a,{t:'move',x:300,y:0,z:0,ry:0});assert.equal(p.pos,null);
  room.send(a,{t:'celebrate',kind:'portal',to:'lighthouse'});assert.ok(a.last('travelRejected'));assert.equal(p.zone,'island');
  room.send(a,{t:'move',x:-31.85,y:0,z:-30.14,ry:0});
  room.send(a,{t:'celebrate',kind:'portal',to:'lighthouse'});assert.ok(p.travel);
  const before={...p.pos};room.send(a,{t:'move',x:20,y:0,z:20,ry:0});assert.deepEqual(p.pos,before);
  room.send(a,{t:'sit',seat:0});assert.equal(p.seat,-1);
  room.clock.advance(900);assert.equal(p.zone,'lighthouse');assert.equal(p.pos.x,300);assert.equal(a.last('travel').to,'lighthouse');
  room.send(a,{t:'move',x:0,y:0,z:0,ry:0});assert.equal(p.pos.x,300);
  room.send(a,{t:'move',x:320,y:0,z:0,ry:0});assert.equal(p.pos.x,300);
  room.send(a,{t:'sit',seat:0});assert.equal(p.seat,-1);
  room.clock.advance(1000);room.send(a,{t:'celebrate',kind:'portal',to:'island'});room.clock.advance(900);assert.equal(p.zone,'island');
});

test('active participants cannot start travel or move even if their seat is cleared',()=>{
  const room=game(),p=room.engine.players.get('alice'),a=room.conns.alice;
  p.seat=-1;p.zone='lighthouse';p.pos={x:300,y:0,z:9};
  room.send(a,{t:'celebrate',kind:'portal',to:'island'});assert.equal(p.travel,null);assert.ok(a.last('travelRejected'));
  room.send(a,{t:'move',x:0,y:0,z:0,ry:0});assert.equal(p.pos.x,300);
});

test('card plans are private, replaceable, cancellable and locked at reveal', () => {
  const room = game(), m = room.engine.match, actor = room.engine.nextAlive(m.typerId), target = room.engine.nextAlive(actor), conn = room.conns[actor];
  queue(room, actor, 'time_tax', target, 'first');
  queue(room, actor, 'pressure', target, 'replacement');
  assert.equal(room.engine.players.get(actor).cardQueue.cardId, 'pressure');
  assert.equal(room.conns[target].all('cardQueue').length, 0);
  assert.equal(JSON.stringify(room.engine.matchView()).includes('replacement'), false);
  queue(room, actor, null, null, 'cancel');
  assert.equal(room.engine.players.get(actor).cardQueue, null);
  room.clock.advance(1000); queue(room, actor, 'time_tax', target, 'final'); play(room);
  const endsAt=m.endsAt;
  queue(room, actor, null, null, 'too-late');
  assert.equal(conn.last('cardQueueResult').reason, 'locked');
  room.send(conn, {t:'submit',word:'apple'});
  room.send(conn, {t:'celebrate',kind:'portal',to:'lighthouse'});
  room.send(conn, {t:'loadout',cards:{time_tax:99}});
  assert.equal(m.phase, 'cardReveal'); assert.equal(m.endsAt, endsAt);
  assert.equal(room.engine.players.get(actor).travel, null);
  assert.equal(room.engine.players.get(actor).cards.time_tax, 1);
  assert.deepEqual(room.errors, []);
});

test('owner cancellation restores played cards and purchased answers without awarding match rewards', () => {
  const room = game(), m = room.engine.match;
  const first = m.typerId;
  const next = room.engine.nextAlive(m.typerId);
  room.send(room.conns[m.typerId], { t: 'hint', turnId: m.turnId, requestId: 'cancel-answer', balance: 1000 });
  assert.equal(room.conns[m.typerId].last('hint').ok, true);
  queue(room, next, 'time_tax', m.typerId, 'cancel-card');
  play(room);
  assert.equal(room.engine.players.get(next).cards.time_tax, 1);
  room.send(room.conns.alice, { t: 'host', action: 'endMatch' });
  assert.equal(room.conns[next].last('matchRefund').cards[0], 'time_tax');
  assert.equal(room.engine.players.get(next).cards.time_tax, 2);
  assert.equal(room.conns[first].last('matchRefund').coins, 1000);
  assert.equal(room.conns[first].all('reward').length, 0);
  assert.equal(room.conns[first].all('win').length, 0);
  assert.deepEqual(room.errors, []);
});

test('only an unlocked admin can grant a valid card', async () => {
  const room = createRoom({ adminCode: 'secret' }), admin = room.join('admin'), target = room.join('target');
  room.send(admin, { t: 'admin', action: 'addCard', id: 'target', cardId: 'heart' });
  assert.equal(room.engine.players.get('target').cards.heart || 0, 0);
  await room.engine.onUnlock(room.engine.players.get('admin'), 'secret');
  room.send(admin, { t: 'admin', action: 'addCard', id: 'target', cardId: 'heart' });
  assert.equal(room.engine.players.get('target').cards.heart, 1);
  assert.equal(target.last('adminCard').cardId, 'heart');
  room.send(admin, { t: 'admin', action: 'addCard', id: 'target', cardId: '__invalid__' });
  assert.equal(room.engine.players.get('target').cards.heart, 1);
});

test('disconnect cancels private plans and reconnect cannot refill spent cards or lose history', () => {
  const room = game(), m = room.engine.match, actor = room.engine.nextAlive(m.typerId), target = room.engine.nextAlive(actor);
  queue(room, actor, 'time_tax', target);
  const takeover=room.join(actor,{cards:{time_tax:99}});
  assert.equal(takeover.last('welcome').cardQueue.cardId,'time_tax');
  room.engine.disconnect(takeover);
  assert.equal(room.engine.players.get(actor).cardQueue,null);
  room.join(actor,{cards:{time_tax:99}});
  assert.equal(room.conns[actor].last('welcome').cardQueue,null);
  room.clock.advance(1000); queue(room,actor,'time_tax',target,'spent'); play(room);
  room.engine.disconnect(room.conns[actor]);room.join(actor,{cards:{time_tax:99}});
  assert.equal(room.engine.players.get(actor).cards.time_tax,1);
  assert.equal(room.conns[actor].last('welcome').match.cardHistory.length,1);
  assert.equal(room.conns[actor].last('welcome').cards.time_tax,1);
  assert.equal(room.conns[actor].last('welcome').cardReceipts.length,1);
  assert.deepEqual(room.errors,[]);
});

test('departed targets, forfeits and a new match clear card plans without consumption', () => {
  const room=game(), m=room.engine.match, actor=room.engine.nextAlive(m.typerId), target=room.engine.nextAlive(actor);
  queue(room,actor,'heart',target);
  room.engine.disconnect(room.conns[target]);
  assert.equal(room.engine.players.get(actor).cardQueue,null);
  assert.equal(room.engine.players.get(actor).cards.heart,2);
  room.join(target);room.clock.advance(1000);queue(room,actor,'pressure',target,'next');
  room.engine.fail(actor,'forfeit');
  assert.equal(room.engine.players.get(actor).cardQueue,null);
  room.engine.endMatch(null);room.engine.enterLobby();room.engine.startMatch();
  room.send(room.conns[actor],{t:'queueCard',matchId:m.matchId,requestId:'stale',cardId:'heart',targetId:target});
  assert.equal(room.conns[actor].last('cardQueueResult').ok,false);
  assert.equal(room.engine.match.cardHistory.length,0);
  assert.deepEqual(room.errors,[]);
});

test('old queue requests cannot be replayed after the ordinary receipt cache rolls over', () => {
  const room=game(), m=room.engine.match, actor=room.engine.nextAlive(m.typerId), target=room.engine.nextAlive(actor);
  const request=queue(room,actor,'time_tax',target,'old-plan');
  queue(room,actor,null,null,'cancel-plan');
  const player=room.engine.players.get(actor);
  for(let i=0;i<140;i++)room.engine.remember(player,`hint:noise${i}`,{t:'hint',ok:false});
  room.send(room.conns[actor],request);
  assert.equal(player.cardQueue,null);
  assert.equal(player.cards.time_tax,2);
  assert.deepEqual(room.errors,[]);
});

test('cash offers are rejected and item settlement contains no money transfer',()=>{
 const room=createRoom();const a=room.join('alice',{inventory:{coins:100000000,ownedChairs:['wooden','glass']}}),b=room.join('bob',{inventory:{coins:300}});
 for(const p of room.engine.players.values())p.accountCreatedAt=room.clock.now()-86400001;
 room.send(a,{t:'tradeRequest',targetId:'bob'});const id=a.last('tradeState').id;room.send(b,{t:'tradeRespond',id,accept:true});
 room.send(a,{t:'tradeOffer',id,offer:{coins:100,items:[{kind:'chair',id:'glass',qty:1}]}});
 assert.match(a.last('tradeError').message,/Cash cannot be traded/);assert.deepEqual(a.last('tradeState').offer.items,[]);
 room.send(a,{t:'tradeOffer',id,offer:{items:[{kind:'chair',id:'glass',qty:1}]}});
 room.send(a,{t:'tradeAccept',id,inventory:{ownedChairs:['wooden','glass']}});room.send(b,{t:'tradeAccept',id,inventory:{}});room.clock.advance(3000);
 assert.equal(a.all('tradeComplete').length,1);assert.equal('coins' in a.last('tradeComplete').outgoing,false);assert.equal('coins' in b.last('tradeComplete').incoming,false);assert.deepEqual(room.errors,[]);
});

test('guest Last Sip cannot bypass the trophy gate through a practice fallback',()=>{
 const room=createRoom({onCheckTrophies:()=>({ok:false,error:'Earn 1 trophy to play. You keep it.'})}),a=room.join('alice'),b=room.join('bob');
 room.send(a,{t:'host',action:'settings',settings:{mode:'roulette'}});room.send(a,{t:'sit',seat:0});room.send(b,{t:'sit',seat:1});
 for(const [id,c]of [['a',a],['b',b]])room.send(c,{t:'bet',requestId:id,amount:25,balance:100});
 room.send(a,{t:'host',action:'start'});assert.equal(room.engine.match.phase,'lobby');assert.equal(room.engine.match.participants.length,0);
 assert.equal(a.last('error').code,'trophy_required');assert.equal(a.last('stakeRefund').coins,25);assert.equal(b.last('stakeRefund').coins,25);assert.deepEqual(room.errors,[]);
});

// The opt-in covers common profanity, its plurals and stretched spellings in chat.
test('swearing setting allows ordinary chat profanity and stays reversible',()=>{
 const r=createRoom(),a=r.join('alice');
 r.send(a,{t:'host',action:'settings',settings:{allowSwearing:true}});
 r.send(a,{t:'chat',text:'fuck shit bitch bitches cunt fuuuuck'});
 assert.equal(a.last('chat').text,'fuck shit bitch bitches cunt fuuuuck');
 r.clock.advance(1000);r.send(a,{t:'host',action:'settings',settings:{allowSwearing:false}});
 r.send(a,{t:'chat',text:'fuck bitch'});assert.equal(a.last('chat').text,'#### #####');
});


test('admin guest profile edits preserve identity, cancel trades and sync inventory privately', async () => {
  const room = createRoom({ onSetWins: async value => ({ wins: value.wins, revision: 7 }) });
  const admin = room.join('adminprofile');
  const target = room.join('targetprofile', { profile: { id: 'targetprofile', name: 'Target', coins: 100, lastFreeClaim: 1790880000000 }, inventory: { ownedChairs: ['glass'] } });
  const peer = room.join('peerprofile');
  room.engine.players.get('adminprofile').isAdmin = true;
  for (const id of ['targetprofile', 'peerprofile']) room.engine.players.get(id).accountCreatedAt = room.clock.now() - 86400000;
  room.send(target, { t: 'tradeRequest', targetId: 'peerprofile' });
  assert.ok(target.last('tradeState'));
  room.send(peer, { t: 'admin', action: 'getProfile', id: 'targetprofile' });
  assert.equal(peer.last('error').code, 'not_allowed');
  room.send(admin, { t: 'admin', action: 'getProfile', id: 'targetprofile' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(admin.last('adminProfile').profile.coins, 100);
  room.send(admin, { t: 'admin', action: 'saveProfile', id: 'targetprofile', profile: {
    id: 'forgedidentity', name: 'Target', coins: 555, wins: 9, petTiers: { piggy: { 2: 3 } }, lastFreeClaim: 1790880000000,
  } });
  await new Promise(resolve => setImmediate(resolve));
  const result = target.last('profileAdjusted');
  assert.equal(result.profile.id, 'targetprofile');
  assert.equal(result.profile.lastFreeClaim, 1790880000000);
  assert.equal(result.profile.coins, 555);
  assert.equal(result.profile.winsRevision, 7);
  assert.equal(room.engine.players.get('targetprofile').tradeInventory.pets['piggy:2'], 3);
  assert.match(peer.last('tradeClosed').reason, /admin updated/);
  assert.equal(peer.all('profileAdjusted').length, 0);
  assert.equal(admin.last('adminProfile').saved, true);
  assert.deepEqual(room.errors, []);
});

test('trade acceptance can be withdrawn during its three second countdown',()=>{
 const r=createRoom(),a=r.join('alice',{inventory:{cards:{skip:1}}}),b=r.join('bob',{inventory:{}});
 for(const id of ['alice','bob'])r.engine.players.get(id).accountCreatedAt=r.clock.now()-86400001;
 r.send(a,{t:'tradeRequest',targetId:'bob'});const id=a.last('tradeState').id;r.send(b,{t:'tradeRespond',id,accept:true});
 r.send(a,{t:'tradeOffer',id,offer:{items:[{kind:'card',id:'skip',qty:1}]}});
 const accept=()=>{r.send(a,{t:'tradeAccept',id,inventory:tradeInventory({cards:{skip:1}})});r.send(b,{t:'tradeAccept',id,inventory:tradeInventory({})});};
 accept();r.clock.advance(2999);assert.equal(a.all('tradeComplete').length,0);
 r.send(a,{t:'tradeUnaccept',id});assert.equal(a.last('tradeState').accepted,false);assert.equal(a.last('tradeState').countdown,null);
 r.clock.advance(3001);assert.equal(a.all('tradeComplete').length,0);assert.ok(r.engine.trades.has('alice'));
 accept();r.clock.advance(2999);assert.equal(a.all('tradeComplete').length,0);r.clock.advance(1);assert.equal(a.all('tradeComplete').length,1);
});

test('ordinary profanity submits as a valid game answer when swearing is on',()=>{
 const r=createRoom(),a=r.join('alice'),b=r.join('bob');r.send(a,{t:'host',action:'settings',settings:{allowSwearing:true}});
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});r.engine.pick(r.engine.match.options[0]);
 const m=r.engine.match;m.prefix='f';m.minLength=1;r.send(r.conns[m.typerId],{t:'submit',word:'fuck'});
 assert.equal(r.conns[m.typerId]?.last('result')?.ok ?? a.last('result')?.ok,true);assert.ok(m.used.has('fuck'));
});


test('answer payment receipt survives a lost reply, turn change and reconnect before refund', () => {
  const room = game(), m = room.engine.match, id = m.typerId, conn = room.conns[id];
  room.send(conn, { t:'hint', turnId:m.turnId, requestId:'lost-reply', balance:1000 });
  const purchase = conn.last('hint');
  conn.clear(); // Simulate a client that never received the payment response.
  for(let i=0;i<140;i++)room.engine.remember(room.engine.players.get(id),`hint:spam${i}`,{t:'hint',ok:false});
  room.clock.advance(m.endsAt-room.clock.now()+1);
  room.engine.disconnect(conn);
  const reconnected=room.join(id);
  assert.deepEqual(reconnected.last('hint'),purchase);
  room.send(room.conns.alice,{t:'host',action:'endMatch'});
  assert.equal(reconnected.last('matchRefund').coins,purchase.cost);
  room.engine.disconnect(reconnected);
  const again=room.join(id);
  const payments=again.sent.filter(msg=>msg.t==='hint'||msg.t==='matchRefund');
  assert.equal(payments[0].receipt,purchase.receipt);
  assert.equal(payments[1].coins,purchase.cost);
});


test('only unlocked admins can request global or account trade history',async()=>{
 const calls=[],r=createRoom({onAdminTrades:async query=>{calls.push(query);return{id:query.id||null,trades:[]};}}),a=r.join('alice');
 r.send(a,{t:'admin',action:'listTrades'});assert.equal(a.last('error').code,'not_allowed');assert.equal(calls.length,0);
 r.engine.players.get('alice').isAdmin=true;r.send(a,{t:'admin',action:'listTrades',id:'bob'});await Promise.resolve();await Promise.resolve();assert.deepEqual(calls,[{id:'bob'}]);assert.equal(a.last('adminTrades').id,'bob');
});
