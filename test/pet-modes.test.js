import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from './helpers.js';
import { PETS, petAbility, petAbilityRows } from '../public/js/shared/catalog.js';
import { TIDE, tideBuildUnits } from '../public/js/shared/word-tide.js';

function sip(pet, petAbilities = true) {
  const r = createRoom(), a = r.join('alice', { pet, wins: 1 }), b = r.join('bob', { wins: 1 });
  for (const id of ['alice', 'bob']) r.engine.players.get(id).accountCreatedAt = -100000000;
  r.send(a, { t: 'host', action: 'settings', settings: { mode: 'roulette', petAbilities } });
  r.send(a, { t: 'sit', seat: 0 }); r.send(b, { t: 'sit', seat: 1 });
  for (const [conn, requestId] of [[a, 'a'], [b, 'b']]) r.send(conn, { t: 'bet', requestId, amount: 100, balance: 1000 });
  r.send(a, { t: 'host', action: 'start' }); r.engine.rouletteTurn('alice');
  return { r, a, b };
}

test('every pet describes an implemented ability for every mode, including Death Wish', () => {
  for (const pet of PETS) {
    assert.equal(petAbilityRows(pet).length, 3);
    for (const row of petAbilityRows(pet)) assert.ok(row.text, pet.id);
    assert.equal(petAbility(pet.id, 'classic'), pet.ability);
    assert.equal(petAbility(pet.id, 'roulette_deadly'), petAbility(pet.id, 'roulette'));
  }
});

test('dragon reduces normal and double sip poison risk; display and hidden draw agree', () => {
  const { r, a } = sip('dragon'); r.engine.match.roulette.risk = .4;
  assert.ok(Math.abs(r.engine.matchView().roulette.risk - .3) < 1e-9);
  assert.ok(Math.abs(r.engine.matchView().roulette.doubleRisk - .45) < 1e-9);
  r.forced.push(.35); r.send(a, { t: 'roulette', turnId: r.engine.match.turnId, action: 'drink' });
  assert.equal(r.engine.match.roulette.event.poisoned, false);
  assert.ok(Math.abs(r.engine.match.roulette.event.risk - .3) < 1e-9);
  assert.equal(r.engine.players.get('alice').wins, 1);
  assert.equal(r.engine.players.get('bob').wins, 1);
  assert.deepEqual(r.errors, []);
});

test('Last Sip time, extra pass, antidote and prize bonus work and abilities can be disabled', () => {
  const robot = sip('robot'); assert.equal(robot.r.engine.match.duration, 10000);
  const kitty = sip('kitty'); kitty.r.engine.rouletteAction('alice', 'pass');
  assert.equal(kitty.r.engine.match.roulette.passed.has('alice'), false);
  kitty.r.engine.rouletteTurn('alice'); kitty.r.engine.rouletteAction('alice', 'pass');
  assert.equal(kitty.r.engine.match.roulette.passed.has('alice'), true);
  const unicorn = sip('unicorn'); unicorn.r.forced.push(0); unicorn.r.engine.rouletteAction('alice', 'drink');
  assert.equal(unicorn.r.engine.match.roulette.event.shielded, true);
  assert.equal(unicorn.r.engine.match.roulette.event.poisoned, false);
  unicorn.r.engine.rouletteTurn('alice'); unicorn.r.forced.push(0); unicorn.r.engine.rouletteAction('alice', 'drink');
  assert.equal(unicorn.r.engine.match.roulette.event.poisoned, true);
  const bear = sip('bear'); bear.r.engine.endRoulette('alice'); assert.equal(bear.a.last('rouletteReward').coins, 176);
  const off = sip('dragon', false); off.r.engine.match.roulette.risk = .4;
  assert.equal(off.r.engine.matchView().roulette.risk, .4); assert.equal(off.r.engine.participant('alice').ability, null);
  for (const { r } of [robot, kitty, unicorn, bear, off]) assert.deepEqual(r.errors, []);
});

test('Word Tide pets protect hearts instead of adding extra blocks', () => {
  const r = createRoom(), a = r.join('alice', { pet: 'dragon' }), b = r.join('bob');
  r.send(a, { t: 'host', action: 'settings', settings: { mode: 'word_tide' } }); r.clock.advance(TIDE.intro);
  const m = r.engine.match, word = m.tide.category.answers[0];
  for (const [conn, requestId] of [[a, 'a'], [b, 'b']]) r.send(conn, { t: 'tideAnswer', matchId: m.matchId, round: m.round, requestId, answer: word });
  const length = a.last('tideAnswerResult').locked.length; r.clock.advance(TIDE.answer);
  assert.equal(m.tide.towers.alice.height, 2 + length);
  assert.equal(m.tide.towers.alice.earned, length);
  assert.equal(m.tide.towers.alice.segments.length,1);
  assert.equal(r.engine.participant('alice').ability.type,'tideGuard');
  assert.equal(m.tide.towers.alice.longest, true); assert.equal(m.tide.towers.bob.longest, true);
  assert.deepEqual(r.errors, []);
});

test('Word Tide shield saves one heart; all build animations start at zero and settle exactly', () => {
  const r = createRoom(), a = r.join('alice', { pet: 'unicorn' }); r.join('bob');
  r.send(a, { t: 'host', action: 'settings', settings: { mode: 'word_tide' } });
  r.clock.advance(TIDE.intro + TIDE.answer + TIDE.reveal + TIDE.flood);
  assert.equal(r.engine.participant('alice').hearts, 5); assert.equal(r.engine.participant('alice').shield, false);
  r.clock.advance(TIDE.resolve + TIDE.answer + TIDE.reveal + TIDE.flood);
  assert.equal(r.engine.participant('alice').hearts, 4);
  for (const added of [0, 1, 4, 40, 45]) {
    assert.equal(tideBuildUnits(added, 0), 0); assert.equal(tideBuildUnits(added, 1), added);
    let previous = 0;
    for (let i = 0; i <= 1000; i++) { const n = tideBuildUnits(added, i / 1000); assert.ok(n >= previous && n <= added); previous = n; }
  }
  assert.deepEqual(r.errors, []);
});

test('one trophy qualifies for Last Sip and is kept on entry, cancellation and losing', () => {
  const { r, a, b } = sip(null);
  assert.equal(r.engine.match.practice, false);
  for (const id of ['alice', 'bob']) assert.equal(r.engine.players.get(id).wins, 1);
  r.send(a, { t: 'host', action: 'endMatch' });
  for (const id of ['alice', 'bob']) assert.equal(r.engine.players.get(id).wins, 1);
  for (const [conn, requestId] of [[a, 'again-a'], [b, 'again-b']]) r.send(conn, { t: 'bet', requestId, amount: 100, balance: 1000 });
  r.send(a, { t: 'host', action: 'start' }); r.engine.rouletteOut('alice');
  assert.equal(r.engine.players.get('alice').wins, 1); assert.equal(r.engine.players.get('bob').wins, 1);
  assert.deepEqual(r.errors, []);
});

test('Tide guard can protect a submerged player without changing tower score',()=>{
 const r=createRoom(),a=r.join('alice',{pet:'dragon'});r.join('bob');r.send(a,{t:'host',action:'settings',settings:{mode:'word_tide'}});r.clock.advance(TIDE.intro+TIDE.answer);
 r.engine.match.tide.rise=10;r.forced.push(0);r.clock.advance(TIDE.reveal+TIDE.flood);
 assert.equal(r.engine.participant('alice').hearts,5);assert.equal(r.engine.match.tide.towers.alice.shielded,true);assert.equal(r.engine.match.tide.towers.alice.earned,0);
});
