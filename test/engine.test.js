import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION, BASE_MISTAKES, COUNTDOWN_MS, CHOOSE_MS, ROUND_END_MS, MATCH_END_MS, MIN_TURN_MS,
  ABS_MIN_TURN_MS, RECONNECT_GRACE_MS, DEFAULT_SETTINGS, REWARDS, CHAT_MAX, NAME_MAX,
} from '../public/js/shared/constants.js';
import { PETS_BY_ID, sanitizeLook } from '../public/js/shared/catalog.js';
import WORDS from '../src/words.js';
import { FakeConn, createRoom, dict, lastMatch, seeded } from './helpers.js';

const ALL_WORDS = WORDS.split('\n');
const HARD = 'jkqvwxyz';
const TURN_MS = DEFAULT_SETTINGS.turnSeconds * 1000;
const wordRng = seeded(12345);

/** Joins (if needed) and seats the players in order; the first one (the host) starts the match. */
function startMatch(room, ids = ['alice', 'bob'], hello = {}) {
  for (const id of ids) if (!room.conns[id]) room.join(id, hello[id]);
  ids.forEach((id, seat) => room.send(room.conns[id], { t: 'sit', seat }));
  room.send(room.conns[ids[0]], { t: 'host', action: 'start' });
  assert.equal(room.engine.match.phase, 'choosing');
}

/** The chooser picks `letter` (default: the first easy option); returns the prefix. */
function pick(room, letter) {
  const m = room.engine.match;
  const chosen = letter ?? m.options.find((l) => !HARD.includes(l));
  room.send(room.conns[m.chooserId], { t: 'pick', letter: chosen });
  assert.equal(room.engine.match.phase, 'typing');
  return chosen;
}

/** A moment later, the typer submits `word` (default: an unused dictionary word for the prefix). */
function play(room, word) {
  room.clock.advance(250); // humans are not instant (and submits are rate limited)
  const m = room.engine.match;
  const submitted = word ?? dict.randomWithPrefix(m.prefix, m.used, wordRng);
  room.send(room.conns[m.typerId], { t: 'submit', word: submitted });
  return submitted;
}

const other = (id, ids = ['alice', 'bob']) => ids.find((x) => x !== id);
const participant = (conn, id) => lastMatch(conn).participants.find((p) => p.id === id);

describe('joining', () => {
  test('hello → welcome; the first human is host; others see the new player', () => {
    const room = createRoom();
    const a = room.join('alice', { name: 'Alice', pet: 'unicorn', chair: 'throne', look: { skin: '#FFFFFF' } });
    const welcome = a.last('welcome');
    assert.equal(welcome.you, 'alice');
    assert.equal(welcome.code, 'TEST1');
    assert.equal(welcome.hostId, 'alice');
    assert.deepEqual(welcome.settings, DEFAULT_SETTINGS);
    assert.deepEqual(welcome.players, [{
      id: 'alice', name: 'Alice', isBot: false, isHost: true, connected: true,
      look: sanitizeLook({ skin: '#ffffff' }), chair: 'throne', pet: 'unicorn', seat: -1, wins: 0, pos: null,
      back: 'none', level: 1, petTier: 1,
    }]);
    assert.equal(welcome.match.phase, 'lobby');
    assert.equal(welcome.match.phaseEndsIn, null);
    assert.deepEqual(welcome.match.participants, []);

    const b = room.join('bob', { name: '  B@d <script> ', pet: 'constructor', chair: 'nope' });
    assert.equal(b.last('welcome').hostId, 'alice');
    assert.equal(b.last('welcome').players.length, 2);
    assert.equal(b.all('player').length, 0, 'the joiner gets welcome, not player');
    const bob = a.last('player').p;
    assert.deepEqual([bob.id, bob.name, bob.pet, bob.chair, bob.isHost], ['bob', 'Bd script', null, 'wooden', false]);
    assert.deepEqual(a.last('chat'), { t: 'chat', id: null, name: 'System', text: 'Bd script joined the game' });

    const c = room.join('carol', { name: '<<<>>>' });
    assert.match(c.last('welcome').players[2].name, /^Player\d{4}$/);
    const d = room.join('dave', { name: 'x'.repeat(40) });
    assert.equal(d.last('welcome').players[3].name.length, NAME_MAX);
    assert.deepEqual(room.errors, []);
  });

  test('bad hellos are rejected with bad_hello and the socket is closed', () => {
    const room = createRoom();
    const attempts = [
      { t: 'chat', text: 'hi' }, // hello must come first
      { t: 'hello', id: 'alice1', v: PROTOCOL_VERSION + 1 },
      { t: 'hello', id: 'alice1' },
      { t: 'hello', id: '', v: PROTOCOL_VERSION },
      { t: 'hello', id: 'x'.repeat(65), v: PROTOCOL_VERSION },
      { t: 'hello', id: 'bot-0001', v: PROTOCOL_VERSION },
      { t: 'hello', id: 'has space', v: PROTOCOL_VERSION },
      { t: 'hello', id: 12345, v: PROTOCOL_VERSION },
    ];
    for (const msg of attempts) {
      const conn = new FakeConn();
      room.send(conn, msg);
      assert.equal(conn.last('error')?.code, 'bad_hello', JSON.stringify(msg));
      assert.equal(conn.closed?.code, 1008);
      room.send(conn, { t: 'hello', id: 'alice1', v: PROTOCOL_VERSION }); // ignored after rejection
      assert.equal(conn.last('welcome'), undefined);
    }
    assert.equal(room.engine.players.size, 0);
  });

  test('a full room rejects the 9th human', () => {
    const room = createRoom();
    for (let i = 0; i < 8; i++) room.join(`human${i}`);
    const late = room.join('human8');
    assert.equal(late.last('error').code, 'room_full');
    assert.equal(late.closed.code, 1008);
    assert.equal(room.engine.players.size, 8);
  });

  test('a joining human evicts a bot when no match is being played', () => {
    const room = createRoom();
    const host = room.join('host1');
    for (let i = 0; i < 7; i++) room.send(host, { t: 'host', action: 'addBot' });
    assert.equal(room.engine.players.size, 8);
    assert.equal(room.engine.match.phase, 'countdown');
    host.clear();
    const late = room.join('late1');
    assert.ok(late.last('welcome'));
    const evicted = host.last('leave').id;
    assert.match(evicted, /^bot-/);
    assert.equal(room.engine.players.size, 8);
    assert.ok(!room.engine.players.has(evicted));
  });

  test('bots playing an active match are not evicted', () => {
    const room = createRoom();
    const host = room.join('host1');
    for (let i = 0; i < 7; i++) room.send(host, { t: 'host', action: 'addBot' });
    room.send(host, { t: 'host', action: 'start' });
    assert.equal(room.engine.match.phase, 'choosing');
    const late = room.join('late1');
    assert.equal(late.last('error').code, 'room_full');
    assert.equal(room.engine.players.size, 8);
  });
});

describe('seats and countdown', () => {
  test('sit, seat_taken, invalid seats, stand', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(a, { t: 'sit', seat: 3 });
    assert.equal(b.last('player').p.seat, 3);
    room.send(b, { t: 'sit', seat: 3 });
    assert.equal(b.last('error').code, 'seat_taken');
    for (const seat of [-1, 8, 1.5, '2', null, undefined]) room.send(b, { t: 'sit', seat });
    assert.equal(room.engine.players.get('bob').seat, -1);
    room.send(a, { t: 'sit', seat: 4 }); // moving to another seat is fine outside a match
    assert.equal(b.last('player').p.seat, 4);
    room.send(a, { t: 'stand' });
    assert.equal(b.last('player').p.seat, -1);
  });

  test('countdown starts at 2 seated, cancels below 2, then starts the match in seat order', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(b, { t: 'sit', seat: 0 });
    assert.equal(room.engine.match.phase, 'lobby');
    room.send(a, { t: 'sit', seat: 5 });
    let m = lastMatch(a);
    assert.equal(m.phase, 'countdown');
    assert.equal(m.phaseEndsIn, COUNTDOWN_MS);
    assert.equal(m.phaseDuration, COUNTDOWN_MS);

    room.clock.advance(3000);
    const c = room.join('carol'); // phaseEndsIn is computed at send time
    assert.equal(c.last('welcome').match.phaseEndsIn, COUNTDOWN_MS - 3000);

    room.send(b, { t: 'stand' });
    assert.equal(lastMatch(a).phase, 'lobby');
    assert.equal(lastMatch(a).phaseEndsIn, null);
    room.clock.advance(COUNTDOWN_MS);
    assert.equal(room.engine.match.phase, 'lobby');

    room.send(b, { t: 'sit', seat: 2 });
    room.clock.advance(COUNTDOWN_MS - 1);
    assert.equal(room.engine.match.phase, 'countdown');
    room.clock.advance(1);
    m = lastMatch(a);
    assert.equal(m.phase, 'choosing');
    assert.deepEqual(m.participants.map((p) => p.id), ['bob', 'alice']);
    assert.deepEqual(m.participants[0], { id: 'bob', hearts: 2, maxHearts: 2, alive: true, words: 0, shield: false, combo: 0, pending: { skip: false, time: 0, mistakes: 0 } });
    assert.equal(m.phaseEndsIn, CHOOSE_MS);
    assert.equal(m.round, 1);
  });

  test('host start skips the countdown; others get not_host; it needs 2 seated players', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(a, { t: 'sit', seat: 0 });
    room.send(a, { t: 'host', action: 'start' });
    assert.equal(room.engine.match.phase, 'lobby');
    room.send(b, { t: 'sit', seat: 1 });
    room.send(b, { t: 'host', action: 'start' });
    assert.equal(b.last('error').code, 'not_host');
    assert.equal(room.engine.match.phase, 'countdown');
    room.send(a, { t: 'host', action: 'start' });
    assert.equal(lastMatch(b).phase, 'choosing');
  });

  test('an active participant cannot change seats; a late sitter waits for the next match', () => {
    const room = createRoom();
    const a = room.join('alice');
    room.send(a, { t: 'host', action: 'settings', settings: { hearts: 1 } });
    startMatch(room);
    const c = room.join('carol');
    room.send(a, { t: 'sit', seat: 5 });
    assert.equal(room.engine.players.get('alice').seat, 0);
    room.send(c, { t: 'sit', seat: 2 });
    assert.equal(c.last('player').p.seat, 2);
    assert.deepEqual(lastMatch(a).participants.map((p) => p.id), ['alice', 'bob']);

    pick(room);
    room.clock.advance(TURN_MS); // the typer times out with their only heart: match over
    assert.equal(lastMatch(c).phase, 'ended');
    room.clock.advance(MATCH_END_MS);
    assert.equal(lastMatch(c).phase, 'countdown');
    room.clock.advance(COUNTDOWN_MS);
    assert.deepEqual(lastMatch(c).participants.map((p) => p.id), ['alice', 'bob', 'carol']);
  });
});

describe('choosing', () => {
  test('3 distinct options with a hard letter; only the chooser picks an offered letter; timeout auto-picks', () => {
    const room = createRoom();
    startMatch(room);
    const a = room.conns.alice;
    const m = lastMatch(a);
    assert.equal(m.options.length, 3);
    assert.equal(new Set(m.options).size, 3);
    assert.ok(m.options.every((l) => /^[a-z]$/.test(l)));
    assert.ok(m.options.some((l) => HARD.includes(l)));
    const typerId = other(m.chooserId);

    room.send(room.conns[typerId], { t: 'pick', letter: m.options[0] }); // not the chooser
    const notOffered = [...'abcdefghijklmnopqrstuvwxyz'].find((l) => !m.options.includes(l));
    room.send(room.conns[m.chooserId], { t: 'pick', letter: notOffered });
    room.send(room.conns[m.chooserId], { t: 'pick', letter: [m.options[0]] });
    assert.equal(room.engine.match.phase, 'choosing');

    room.clock.advance(CHOOSE_MS);
    const picked = a.last('picked');
    assert.equal(picked.id, m.chooserId);
    assert.ok(m.options.includes(picked.letter));
    const t = lastMatch(a);
    assert.equal(t.phase, 'typing');
    assert.equal(t.prefix, picked.letter);
    assert.equal(t.typerId, typerId);
    assert.equal(t.chooserId, null);
    assert.equal(t.options, null);
    assert.equal(t.phaseDuration, TURN_MS);
    assert.equal(t.mistakes, 0);
    assert.equal(t.maxMistakes, BASE_MISTAKES);
  });

  test('letter options are weighted towards common letters', () => {
    const room = createRoom({ seed: 5 });
    const counts = {};
    for (let i = 0; i < 3000; i++) {
      const options = room.engine.letterOptions();
      assert.equal(new Set(options).size, 3);
      assert.ok(options.some((l) => HARD.includes(l)));
      for (const l of options) counts[l] = (counts[l] ?? 0) + 1;
    }
    assert.ok(counts.s > counts.n && counts.c > counts.o, JSON.stringify(counts));
  });
});

describe('typing', () => {
  test('a valid word passes the turn with the last letter as the new prefix', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    const typerId = room.engine.match.typerId;
    room.forced.push(0.99); // no two-letter prefix this time
    const word = play(room);
    const a = room.conns.alice;
    assert.equal(a.last('result').id, typerId);
    assert.equal(a.last('result').word, word);
    assert.equal(a.last('result').ok, true);
    const m = lastMatch(a);
    assert.equal(m.phase, 'typing');
    assert.equal(m.typerId, other(typerId));
    assert.equal(m.prefix, word.at(-1));
    assert.equal(m.wordCount, 1);
    assert.deepEqual(m.chain, [{ id: typerId, word }]);
    assert.equal(participant(a, typerId).words, 1);
  });

  test('live typing is sanitized, filtered and relayed to everyone but the typer', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    const typerId = room.engine.match.typerId;
    const typer = room.conns[typerId];
    const watcher = room.conns[other(typerId)];
    room.send(typer, { t: 'typing', text: 'He1lo World!' });
    assert.deepEqual(watcher.last('typing'), { t: 'typing', id: typerId, text: 'heloworld' });
    assert.equal(typer.last('typing'), undefined);
    room.send(watcher, { t: 'typing', text: 'sneaky' }); // not the typer: ignored
    assert.equal(typer.last('typing'), undefined);
    room.send(typer, { t: 'typing', text: 'shit' });
    assert.equal(watcher.last('typing').text, '####');
  });

  test('every invalid reason costs a mistake; an empty submit does not', () => {
    const room = createRoom();
    startMatch(room);
    const p = pick(room);
    const typerId = room.engine.match.typerId;
    const wrongStart = dict.randomWithPrefix(p === 'a' ? 'b' : 'a', null, wordRng);
    const cases = [
      [`${p}b1`, 'invalid_chars', `${p}b1`],
      [`${p}a`, 'too_short', `${p}a`],
      [wrongStart, 'wrong_start', wrongStart],
      [`  ${p.toUpperCase()}QZXV `, 'not_word', `${p}qzxv`],
    ];
    play(room, '   ');
    assert.equal(room.engine.match.mistakes, 0);
    cases.forEach(([word, reason, shown], i) => {
      play(room, word);
      assert.deepEqual(room.conns.alice.last('result'), { t: 'result', id: typerId, word: shown, ok: false, reason, mistakes: i + 1 });
      assert.equal(lastMatch(room.conns.bob).mistakes, i + 1);
    });
    room.send(room.conns[other(typerId)], { t: 'submit', word: dict.randomWithPrefix(p, null, wordRng) });
    assert.equal(room.engine.match.mistakes, 4, 'only the typer may submit');
    assert.equal(room.engine.match.typerId, typerId);
  });

  test('a word already used this match is rejected', () => {
    const room = createRoom();
    startMatch(room);
    const loops = (l) => ALL_WORDS.find((w) => w[0] === l && w.at(-1) === l); // starts and ends with l
    const p = pick(room, room.engine.match.options.find(loops));
    room.forced.push(0.99); // single-letter prefix: the same letter again
    play(room, loops(p));
    assert.equal(room.engine.match.prefix, p);
    play(room, loops(p));
    assert.equal(room.conns.alice.last('result').reason, 'used');
  });

  test('profanity in a rejected submission is hidden in the result', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    play(room, 'FUCK');
    const result = room.conns.alice.last('result');
    assert.equal(result.ok, false);
    assert.equal(result.word, '####');
  });

  test('running out of mistakes loses a heart; the failer chooses the next letter', () => {
    const room = createRoom();
    startMatch(room);
    const p = pick(room);
    const typerId = room.engine.match.typerId;
    for (let i = 0; i < BASE_MISTAKES; i++) play(room, `${p}zzqx${'abcde'[i]}`);
    const a = room.conns.alice;
    assert.equal(a.last('result').mistakes, BASE_MISTAKES);
    assert.deepEqual(a.last('fail'), { t: 'fail', id: typerId, cause: 'mistakes', hearts: 1, shielded: false });
    let m = lastMatch(a);
    assert.equal(m.phase, 'roundEnd');
    assert.equal(m.phaseDuration, ROUND_END_MS);
    assert.equal(m.typerId, null);
    assert.equal(participant(a, typerId).hearts, 1);
    room.clock.advance(ROUND_END_MS);
    m = lastMatch(a);
    assert.equal(m.phase, 'choosing');
    assert.equal(m.chooserId, typerId);
    assert.equal(m.round, 2);
  });

  test('a timeout loses a heart', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    const typerId = room.engine.match.typerId;
    room.clock.advance(TURN_MS - 1);
    assert.equal(room.engine.match.phase, 'typing');
    room.clock.advance(1);
    assert.deepEqual(room.conns.bob.last('fail'), { t: 'fail', id: typerId, cause: 'timeout', hearts: 1, shielded: false });
    assert.equal(lastMatch(room.conns.bob).phase, 'roundEnd');
  });

  test('the turn timer shrinks by 1 s every 3 words, down to MIN_TURN_MS', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    for (let words = 0; words <= 30; words++) {
      const expected = Math.max(MIN_TURN_MS, TURN_MS - Math.floor(words / 3) * 1000);
      assert.equal(lastMatch(room.conns.alice).phaseDuration, expected, `after ${words} words`);
      play(room);
    }
  });

  test('the prefix is sometimes the last two letters, if enough unused words start with them', () => {
    const room = createRoom();
    startMatch(room);
    const p = pick(room);
    const common = ALL_WORDS.find((w) => w[0] === p && w.length >= 4 && dict.countPrefix(w.slice(-2)) >= 100);
    room.forced.push(0); // the two-letter roll succeeds
    play(room, common);
    assert.equal(room.engine.match.prefix, common.slice(-2));

    const rare = ALL_WORDS.find((w) => w.startsWith(common.slice(-2)) && dict.countPrefix(w.slice(-2)) < 25);
    room.forced.push(0); // the roll succeeds, but too few words start with those two letters
    play(room, rare);
    assert.equal(room.conns.alice.last('result').ok, true);
    assert.equal(room.engine.match.prefix, rare.at(-1));
  });
});

describe('pet abilities', () => {
  const turnFor = (room, id) => {
    const ability = PETS_BY_ID[room.engine.players.get(id).pet]?.ability;
    return TURN_MS + (ability?.type === 'time' ? ability.value * 1000 : 0);
  };

  test('time: extra seconds on your own turns', () => {
    const room = createRoom();
    startMatch(room, ['alice', 'bob'], { alice: { pet: 'robot' } });
    pick(room);
    for (let i = 0; i < 2; i++) {
      assert.equal(lastMatch(room.conns.bob).phaseDuration, turnFor(room, room.engine.match.typerId));
      play(room);
    }
  });

  test('mistakes: extra wrong guesses per turn', () => {
    const room = createRoom();
    startMatch(room, ['alice', 'bob'], { alice: { pet: 'kitty' }, bob: { pet: 'kitty' } });
    pick(room);
    assert.equal(lastMatch(room.conns.bob).maxMistakes, BASE_MISTAKES + 1);
  });

  test('sabotage: the turn after your valid word is shorter, never below ABS_MIN_TURN_MS', () => {
    const room = createRoom();
    const a = room.join('alice', { pet: 'bear' });
    room.send(a, { t: 'host', action: 'settings', settings: { turnSeconds: 10 } });
    startMatch(room);
    pick(room);
    for (let i = 0; i < 20; i++) {
      const { typerId, wordCount } = room.engine.match;
      play(room);
      const shrunk = Math.max(MIN_TURN_MS, 10000 - Math.floor((wordCount + 1) / 3) * 1000);
      const expected = typerId === 'alice' ? Math.max(ABS_MIN_TURN_MS, shrunk - 2000) : shrunk;
      assert.equal(lastMatch(room.conns.bob).phaseDuration, expected, `word ${i}`);
    }
  });

  test('shield: the first heart loss of the match is blocked', () => {
    const room = createRoom();
    startMatch(room, ['alice', 'bob'], { alice: { pet: 'unicorn' }, bob: { pet: 'unicorn' } });
    const a = room.conns.alice;
    assert.ok(lastMatch(a).participants.every((p) => p.shield));
    pick(room);
    const first = room.engine.match.typerId;
    room.clock.advance(TURN_MS);
    assert.deepEqual(a.last('fail'), { t: 'fail', id: first, cause: 'timeout', hearts: 2, shielded: true });
    assert.equal(participant(a, first).shield, false);

    room.clock.advance(ROUND_END_MS); // the failer chooses, so the other player types next
    pick(room);
    room.clock.advance(TURN_MS);
    assert.equal(a.last('fail').shielded, true);
    room.clock.advance(ROUND_END_MS);
    pick(room);
    assert.equal(room.engine.match.typerId, first);
    room.clock.advance(TURN_MS);
    assert.deepEqual(a.last('fail'), { t: 'fail', id: first, cause: 'timeout', hearts: 1, shielded: false });
  });

  test('abilities are ignored when settings.petAbilities is off', () => {
    const room = createRoom();
    const a = room.join('alice', { pet: 'unicorn' });
    room.send(a, { t: 'host', action: 'settings', settings: { petAbilities: false } });
    startMatch(room, ['alice', 'bob'], { bob: { pet: 'robot' } });
    assert.ok(lastMatch(a).participants.every((p) => !p.shield));
    pick(room);
    assert.equal(lastMatch(a).phaseDuration, TURN_MS);
    room.clock.advance(TURN_MS);
    assert.deepEqual([a.last('fail').hearts, a.last('fail').shielded], [1, false]);
  });
});

describe('match end', () => {
  test('elimination, winner, rewards and room wins, then back to the lobby countdown', () => {
    const room = createRoom();
    const a = room.join('alice');
    room.send(a, { t: 'host', action: 'settings', settings: { hearts: 1 } });
    startMatch(room);
    pick(room);
    const winner = room.engine.match.typerId;
    const loser = other(winner);
    play(room); // winner: 1 word
    play(room); // loser: 1 word
    play(room); // winner: 2 words
    room.clock.advance(lastMatch(a).phaseDuration); // the loser times out

    assert.deepEqual(a.last('fail'), { t: 'fail', id: loser, cause: 'timeout', hearts: 0, shielded: false });
    assert.deepEqual(a.last('elim'), { t: 'elim', id: loser });
    assert.equal(a.last('win').id, winner);
    const winnerView = a.all('player').findLast((m) => m.p.id === winner).p;
    assert.equal(winnerView.wins, 1);
    assert.equal(a.last('chat').text, `${winner} won the match!`);
    for (const id of [winner, loser]) {
      const reward = room.conns[id].last('reward');
      const part = room.engine.participant(id);
      assert.equal(reward.coins, REWARDS.participation + part.coins + reward.bonuses.reduce((sum, b) => sum + b.coins, 0));
      assert.equal(reward.won, id === winner);
      assert.equal(reward.words, id === winner ? 2 : 1);
    }
    let m = lastMatch(a);
    assert.equal(m.phase, 'ended');
    assert.equal(m.winnerId, winner);
    assert.equal(m.phaseDuration, MATCH_END_MS);
    assert.deepEqual(participant(a, loser), { id: loser, hearts: 0, maxHearts: 1, alive: false, words: 1, shield: false, combo: 0, pending: { skip: false, time: 0, mistakes: 0 } });

    room.clock.advance(MATCH_END_MS);
    m = lastMatch(a);
    assert.equal(m.phase, 'countdown'); // everyone is still seated
    assert.deepEqual([m.participants, m.chain, m.round, m.wordCount, m.winnerId], [[], [], 0, 0, null]);
    room.clock.advance(COUNTDOWN_MS);
    assert.equal(lastMatch(a).phase, 'choosing');
    assert.equal(room.engine.players.get(winner).wins, 1);
  });
});

describe('leaving', () => {
  test('standing up mid-match is a forfeit; turn order skips the forfeiter', () => {
    const room = createRoom();
    const ids = ['alice', 'bob', 'carol'];
    startMatch(room, ids);
    pick(room);
    const typerId = room.engine.match.typerId;
    const next = ids[(ids.indexOf(typerId) + 1) % 3];
    const last = ids[(ids.indexOf(typerId) + 2) % 3];
    const w = room.conns[typerId];

    room.send(room.conns[next], { t: 'stand' });
    assert.deepEqual(w.last('fail'), { t: 'fail', id: next, cause: 'forfeit', hearts: 0, shielded: false });
    assert.deepEqual(w.last('elim'), { t: 'elim', id: next });
    assert.equal(w.last('player').p.seat, -1);
    assert.equal(lastMatch(w).phase, 'typing', 'the current turn goes on');
    assert.equal(lastMatch(w).typerId, typerId);

    play(room);
    assert.equal(room.engine.match.typerId, last);
    room.send(room.conns[last], { t: 'stand' });
    assert.equal(lastMatch(w).phase, 'ended');
    assert.equal(lastMatch(w).winnerId, typerId);
  });

  test('if the chooser drops out, the nearest alive player before them chooses', () => {
    const room = createRoom();
    const ids = ['alice', 'bob', 'carol'];
    startMatch(room, ids);
    const chooser = room.engine.match.chooserId;
    const before = ids[(ids.indexOf(chooser) + 2) % 3];
    room.send(room.conns[chooser], { t: 'stand' });
    const w = room.conns[before];
    assert.equal(w.last('fail').cause, 'forfeit');
    assert.equal(lastMatch(w).phase, 'roundEnd');
    room.clock.advance(ROUND_END_MS);
    assert.equal(lastMatch(w).phase, 'choosing');
    assert.equal(lastMatch(w).chooserId, before);
  });

  test('a disconnected typer times out normally, then is knocked out when the grace period ends', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    const gone = room.engine.match.typerId;
    const stays = other(gone);
    const w = room.conns[stays];
    room.engine.disconnect(room.conns[gone]);
    assert.deepEqual([w.last('player').p.id, w.last('player').p.connected], [gone, false]);

    room.clock.advance(TURN_MS);
    assert.deepEqual(w.last('fail'), { t: 'fail', id: gone, cause: 'timeout', hearts: 1, shielded: false });
    room.clock.advance(ROUND_END_MS);
    assert.equal(lastMatch(w).chooserId, gone, 'still chooses while away (auto-pick on timeout)');

    room.clock.advance(RECONNECT_GRACE_MS - TURN_MS - ROUND_END_MS);
    assert.deepEqual(w.last('fail'), { t: 'fail', id: gone, cause: 'left', hearts: 0, shielded: false });
    assert.deepEqual(w.last('elim'), { t: 'elim', id: gone });
    assert.equal(w.last('win').id, stays);
    assert.deepEqual(w.last('leave'), { t: 'leave', id: gone });
    assert.ok(!room.engine.players.has(gone));
    assert.equal(participant(w, gone).alive, false);
    if (gone === 'alice') assert.deepEqual(w.last('room'), { t: 'room', hostId: 'bob', settings: DEFAULT_SETTINGS, table: 'classic', public: false });
  });

  test('the same id on a new socket takes over; the old socket is closed with 4000', () => {
    const room = createRoom();
    const a1 = room.join('alice');
    const b = room.join('bob');
    const a2 = room.join('alice', { name: 'Alice2' });
    assert.deepEqual(a1.closed, { code: 4000, reason: 'replaced' });
    const welcome = a2.last('welcome');
    assert.deepEqual([welcome.you, welcome.hostId, welcome.players.length], ['alice', 'alice', 2]);
    assert.deepEqual([b.last('player').p.name, b.last('player').p.connected], ['Alice2', true]);
    assert.equal(room.engine.players.size, 2);

    b.clear();
    room.send(a1, { t: 'chat', text: 'from the old tab' }); // ignored
    room.engine.disconnect(a1); // the old socket's close event changes nothing
    assert.deepEqual(b.sent, []);
    assert.equal(room.engine.players.get('alice').connected, true);
  });

  test('reconnecting within the grace period resumes the same player mid-turn', () => {
    const room = createRoom();
    startMatch(room);
    pick(room);
    const typerId = room.engine.match.typerId;
    const seat = room.engine.players.get(typerId).seat;
    room.engine.disconnect(room.conns[typerId]);
    room.clock.advance(5000);
    const back = room.join(typerId);
    const welcome = back.last('welcome');
    assert.equal(welcome.match.typerId, typerId);
    assert.equal(welcome.match.phaseEndsIn, TURN_MS - 5000);
    assert.equal(welcome.players.find((p) => p.id === typerId).seat, seat);
    assert.equal(room.conns[other(typerId)].last('player').p.connected, true);
    play(room);
    assert.equal(room.conns[other(typerId)].last('result').ok, true);
    room.clock.advance(RECONNECT_GRACE_MS);
    assert.ok(room.engine.players.has(typerId));
  });

  test('the host passes to the next human; the last human leaving resets the room', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(a, { t: 'host', action: 'addBot' });
    room.send(a, { t: 'host', action: 'addBot' }); // the bots start playing on their own
    room.send(a, { t: 'host', action: 'settings', settings: { hearts: 3 } });
    room.engine.disconnect(a);
    room.clock.advance(RECONNECT_GRACE_MS);
    assert.equal(b.last('leave').id, 'alice');
    assert.deepEqual(b.last('room'), { t: 'room', hostId: 'bob', settings: { ...DEFAULT_SETTINGS, hearts: 3 }, table: 'classic', public: false });

    room.engine.disconnect(b);
    room.clock.advance(RECONNECT_GRACE_MS);
    assert.equal(room.engine.players.size, 0);
    assert.equal(room.engine.match.phase, 'lobby');
    assert.equal(room.clock.pending, 0, 'every timer is cleared');

    const c = room.join('carol');
    const welcome = c.last('welcome');
    assert.deepEqual([welcome.hostId, welcome.players.length, welcome.settings], ['carol', 1, DEFAULT_SETTINGS]);
    assert.deepEqual(room.errors, []);
  });
});

describe('bots', () => {
  test('the host adds and removes bots; a bot takes the first free seat', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(a, { t: 'sit', seat: 0 });
    room.send(b, { t: 'host', action: 'addBot' });
    assert.equal(b.last('error').code, 'not_host');
    room.send(a, { t: 'host', action: 'addBot' });
    const bot = b.last('player').p;
    assert.match(bot.id, /^bot-/);
    assert.deepEqual([bot.isBot, bot.isHost, bot.connected, bot.seat], [true, false, true, 1]);
    assert.ok(bot.name.length > 0 && bot.name.length <= NAME_MAX);
    assert.ok(Object.hasOwn(PETS_BY_ID, bot.pet));
    assert.deepEqual(sanitizeLook(bot.look), bot.look);
    assert.equal(lastMatch(b).phase, 'countdown');
    room.send(a, { t: 'host', action: 'removeBot' });
    assert.equal(b.last('leave').id, bot.id);
    assert.equal(lastMatch(b).phase, 'lobby');
  });

  test('adding a bot to a full room tells the host', () => {
    const room = createRoom();
    const a = room.join('alice');
    for (let i = 0; i < 7; i++) room.send(a, { t: 'host', action: 'addBot' });
    room.send(a, { t: 'host', action: 'addBot' });
    assert.deepEqual(a.last('chat'), { t: 'chat', id: null, name: 'System', text: 'The room is full.' });
    assert.equal(room.engine.players.size, 8);
  });

  test('bots play a whole match on their own', () => {
    const room = createRoom({ seed: 7 });
    const host = room.join('host1');
    for (let i = 0; i < 3; i++) room.send(host, { t: 'host', action: 'addBot' });
    for (let t = 0; t < 30 * 60_000 && !host.last('win'); t += 250) room.clock.advance(250);
    const win = host.last('win');
    assert.ok(win, 'the match ended');

    // Replay the transcript: every accepted word starts with the prompt, is real, and is unique.
    let prefix = null;
    let typed = '';
    const used = new Set();
    for (const msg of host.sent) {
      if (msg.t === 'match') {
        if (msg.m.phase === 'typing') prefix = msg.m.prefix;
        typed = '';
      } else if (msg.t === 'typing') {
        // Words are typed letter by letter (or cleared after a mistake).
        assert.ok(msg.text === '' || msg.text === typed + msg.text.at(-1) || msg.text === typed.slice(0, -1), `${typed} -> ${msg.text}`);
        typed = msg.text;
      } else if (msg.t === 'result' && msg.ok) {
        assert.ok(msg.word.startsWith(prefix) && dict.has(msg.word) && !used.has(msg.word), msg.word);
        used.add(msg.word);
      }
    }
    assert.ok(used.size >= 5, `${used.size} words played`);
    assert.ok(host.all('picked').length >= 1);
    assert.ok(host.all('elim').length >= 2);
    const winner = room.engine.players.get(win.id);
    assert.equal(winner.isBot, true);
    assert.equal(winner.wins, 1);
    assert.equal(host.all('reward').length, 0, 'the host did not play');
    assert.deepEqual(room.errors, []);
  });
});

describe('chat, moves and misc', () => {
  test('chat is cleaned, filtered and rate limited', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(a, { t: 'chat', text: 'what the fuck' });
    assert.deepEqual(b.last('chat'), { t: 'chat', id: 'alice', name: 'alice', text: 'what the ####' });
    assert.equal(a.last('chat').text, 'what the ####', 'the sender sees the filtered text too');
    room.send(a, { t: 'chat', text: '  hi\u0000‮  there\n\nfriend ' });
    assert.equal(b.last('chat').text, 'hi there friend');
    room.send(a, { t: 'chat', text: 'x'.repeat(500) });
    assert.equal(b.last('chat').text.length, CHAT_MAX);

    room.send(a, { t: 'chat', text: 'too fast' });
    assert.equal(a.last('error').code, 'rate_limited');
    assert.notEqual(b.last('chat').text, 'too fast');
    room.clock.advance(600);
    room.send(a, { t: 'chat', text: 'ok now' });
    assert.equal(b.last('chat').text, 'ok now');
  });

  test('moves are batched ~10 Hz, only when changed, never echoed, and ignored while seated', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    const c = room.join('carol');
    room.send(a, { t: 'move', x: 1, y: 0, z: 2, ry: 0.5, anim: 'walk' });
    room.send(a, { t: 'move', x: 1.23456, y: 0, z: 3, ry: 0.5, anim: 'walk' });
    room.send(b, { t: 'move', x: -5, y: 1, z: 0, ry: 3, anim: 'dance' });
    assert.equal(c.all('moves').length, 0);
    room.clock.advance(100);
    const alice = { id: 'alice', x: 1.23, y: 0, z: 3, ry: 0.5, anim: 'walk' };
    const bob = { id: 'bob', x: -5, y: 1, z: 0, ry: 3, anim: 'idle' };
    assert.deepEqual(c.last('moves').list, [alice, bob]);
    assert.deepEqual(b.last('moves').list, [alice]);
    assert.deepEqual(a.last('moves').list, [bob]);

    room.clock.advance(1000);
    assert.equal(c.all('moves').length, 1, 'nothing changed, nothing sent');
    assert.equal(room.clock.pending, 0);

    room.send(a, { t: 'sit', seat: 0 });
    room.send(a, { t: 'move', x: 9, y: 9, z: 9, ry: 0, anim: 'walk' });
    room.clock.advance(100);
    assert.equal(c.all('moves').length, 1, 'seated players do not move');
    const { id, ...pos } = bob;
    assert.deepEqual(room.join('dave').last('welcome').players.find((p) => p.id === id).pos, pos);
  });

  test('loadout changes are sanitized and broadcast', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    room.send(a, { t: 'loadout', name: 'Ace_1', look: { skin: 'red', face: 2 }, chair: 'glass', pet: 'dragon' });
    let p = b.last('player').p;
    assert.deepEqual([p.name, p.look, p.chair, p.pet], ['Ace_1', sanitizeLook({ face: 2 }), 'glass', 'dragon']);
    room.send(a, { t: 'loadout', name: '', pet: null });
    p = b.last('player').p;
    assert.deepEqual([p.name, p.chair, p.pet], ['Ace_1', 'glass', null]);
  });

  test('ping → pong with the server time', () => {
    const room = createRoom();
    const a = room.join('alice');
    room.send(a, { t: 'ping', c: 42.5 });
    assert.deepEqual(a.last('pong'), { t: 'pong', c: 42.5, s: room.clock.t });
  });

  test('malformed messages never crash or corrupt the room', () => {
    const room = createRoom();
    const a = room.join('alice');
    const b = room.join('bob');
    const raw = ['', 'not json', '[]', '[1,2]', 'null', '42', '"text"', '{}', '{"t":5}', '{"t":null}', '{"t":"sit","seat":1', 'x'.repeat(10_000)];
    for (const data of raw) room.engine.receive(a, data);
    room.engine.receive(a, new Uint8Array([1, 2, 3]));
    room.engine.receive(a, undefined);
    const messages = [
      { t: 'hello', id: 'mallory', v: PROTOCOL_VERSION }, // a second hello is ignored
      { t: 'sit', seat: '1' }, { t: 'sit' }, { t: 'sit', seat: { valueOf: 1 } },
      { t: 'move', x: '1', y: 0, z: 0, ry: 0 }, { t: 'move', x: null }, { t: 'move', x: 1e400, y: 0, z: 0, ry: 0 },
      { t: 'pick', letter: ['a'] }, { t: 'submit', word: { length: 3 } }, { t: 'typing', text: 12 },
      { t: 'chat', text: { toString: 'x' } }, { t: 'chat', text: ['a'] },
      { t: 'loadout', name: {}, look: 'x', chair: ['wooden'], pet: '__proto__' },
      { t: 'loadout', pet: 'hasOwnProperty', chair: 'toString' },
      { t: 'host', action: 'settings', settings: 'x' },
      { t: 'host', action: 'settings', settings: { hearts: 99, turnSeconds: 12, petAbilities: 'yes' } },
      { t: 'host', action: { toString: 1 } }, { t: 'host' },
      { t: 'ping', c: { a: 1 } },
      { t: '__proto__' }, { t: 'constructor' }, { t: 'toString' }, { t: 'dispatch' },
    ];
    for (const msg of messages) room.send(a, msg);

    assert.deepEqual(room.errors, []);
    assert.equal(room.engine.players.size, 2);
    assert.deepEqual(room.engine.settings, DEFAULT_SETTINGS);
    const alice = room.engine.players.get('alice');
    assert.deepEqual([alice.seat, alice.pos, alice.chair, alice.pet, alice.name], [-1, null, 'wooden', null, 'alice']);
    assert.equal(a.last('pong').c, null);
    assert.equal(b.all('chat').filter((m) => m.id === 'alice').length, 0);

    // The room still works normally.
    room.send(a, { t: 'sit', seat: 0 });
    room.send(b, { t: 'sit', seat: 1 });
    assert.equal(lastMatch(b).phase, 'countdown');
  });
});
