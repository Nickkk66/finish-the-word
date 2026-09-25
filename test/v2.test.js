import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, dict, FakeConn } from './helpers.js';
import { MODES, OBBY, PROTOCOL_VERSION } from '../public/js/shared/constants.js';
import { filterText, isBlockedWord } from '../src/blocklist.js';
import { adminToken } from '../src/auth.js';
import { planTurn } from '../src/bots.js';
import { createDictionary } from '../src/dictionary.js';

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
    assert.equal(room.engine.match.mode, mode.id);
    if (mode.id === 'chaos') assert.ok(room.engine.match.twist);
    for (let i = 0; i < 2400 && !host.last('win'); i++) room.clock.advance(500);
    assert.ok(host.last('win'), mode.id);
    assert.deepEqual(room.errors, [], mode.id);
  }
});

test('long, double, sudden, random and blitz rules apply at turns', () => {
  for (const mode of ['long', 'double', 'sudden', 'random', 'blitz']) {
    const room = game();
    const m = room.engine.match;
    m.mode = mode;
    m.settings.turnSeconds = mode === 'blitz' ? 8 : 15;
    room.engine.startTurn(m.typerId);
    if (mode === 'long') { assert.equal(m.minLength, 5); assert.equal(room.engine.rejectReason('cat'), 'too_short'); }
    if (mode === 'double') {
      assert.equal(room.engine.nextPrefix('planet'), 'et');
      assert.equal(room.engine.nextPrefix('eating'), 'g');
    }
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
    assert.equal(result.coins - result.flairs.reduce((sum, f) => sum + f.coins, 0), Math.round(10 * multiplier) + 10);
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
  const request = { t: 'hint', turnId: m.turnId, requestId: 'hint1', balance: 250 };
  room.send(conn, { ...request, requestId: 'poor', balance: 249 });
  assert.equal(conn.last('hint').reason, 'insufficient_funds');
  room.send(conn, request);
  const answer = conn.last('hint');
  assert.equal(answer.ok, true);
  assert.equal(answer.cost, 250);
  assert.equal(room.engine.rejectReason(answer.word), null);
  for (const other of Object.values(room.conns).filter(c => c !== conn)) assert.equal(other.all('hint').length, 0);
  room.send(conn, request);
  assert.deepEqual(conn.last('hint'), answer);
  room.send(conn, { ...request, requestId: 'hint2' });
  assert.equal(conn.last('hint').reason, 'already_bought');
  room.clock.advance(1000);
  room.send(conn, { t: 'submit', word: answer.word });
  room.send(conn, { ...request, requestId: 'late' });
  assert.equal(conn.last('hint').reason, 'turn_ended');
  const current = room.conns[m.typerId];
  room.engine.dict = createDictionary('');
  room.send(current, { ...request, turnId: m.turnId, requestId: 'empty' });
  assert.equal(current.last('hint').reason, 'no_answer');
});

test('card skip, time and mistakes effects are consumed once on eligible target turns', () => {
  for (const cardId of ['skip', 'time_tax', 'pressure']) {
    const room = game();
    const m = room.engine.match;
    const actor = m.typerId;
    const targetId = room.engine.nextAlive(actor);
    const conn = room.conns[actor];
    const request = { t: 'useCard', turnId: m.turnId, requestId: 'use1', cardId, targetId };
    room.send(conn, request);
    assert.equal(conn.last('cardResult').ok, true);
    room.send(conn, request);
    assert.equal(room.engine.players.get(actor).cards[cardId], 1);
    room.send(conn, { ...request, requestId: 'use2' });
    assert.equal(conn.last('cardResult').reason, 'one_per_turn');
    play(room);
    if (cardId === 'skip') assert.notEqual(m.typerId, targetId);
    else {
      assert.equal(m.typerId, targetId);
      assert.equal(cardId === 'time_tax' ? m.duration : m.maxMistakes, cardId === 'time_tax' ? 13000 : 3);
    }
    assert.deepEqual(room.engine.participant(targetId).pending, { skip: false, time: 0, mistakes: 0 });
  }
});

test('heart cards honor shields, eliminate and end a match; invalid cards never consume inventory', () => {
  const room = game();
  const m = room.engine.match;
  const actor = m.typerId;
  const targetId = room.engine.nextAlive(actor);
  const conn = room.conns[actor];
  const target = room.engine.participant(targetId);
  const request = { t: 'useCard', turnId: m.turnId, requestId: 'heart1', cardId: 'heart', targetId };
  room.send(conn, { ...request, requestId: 'self', targetId: actor });
  assert.equal(conn.last('cardResult').ok, false);
  target.shield = true;
  room.send(conn, request);
  assert.equal(target.hearts, 2);
  assert.equal(target.shield, false);
  assert.equal(room.engine.players.get(actor).cards.heart, 1);
  room.clock.advance(1000);
  room.engine.startTurn(actor);
  target.hearts = 1;
  room.engine.participant(room.engine.nextAlive(targetId)).alive = false;
  room.send(conn, { ...request, turnId: m.turnId, requestId: 'heart2' });
  assert.equal(m.phase, 'ended');
  assert.equal(m.winnerId, actor);
  assert.equal(target.alive, false);
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
