import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_WORD_LENGTH, MAX_WORD_LENGTH } from '../public/js/shared/constants.js';
import { isBlockedWord } from '../src/blocklist.js';
import { createDictionary } from '../src/dictionary.js';
import WORDS from '../src/words.js';
import BOT_WORDS from '../src/botwords.js';
import { seeded } from './helpers.js';

describe('createDictionary', () => {
  const LIST = ['bad', 'bat', 'batch', 'bath', 'cab', 'cat', 'zoo'];
  const small = createDictionary(LIST.join('\n'));

  test('has() finds every word, including the first and the last', () => {
    for (const word of LIST) assert.ok(small.has(word), word);
  });

  test('has() rejects missing words, prefixes, neighbours and junk', () => {
    const junk = ['', 'a', 'ba', 'batc', 'bats', 'aaa', 'zzz', 'zoos', 'Bad', ' bad', 'bad\nbat', 'bat\n', null, 42, undefined, {}];
    for (const word of junk) assert.equal(small.has(word), false, JSON.stringify(word));
  });

  test('countPrefix() counts ranges and skips used words', () => {
    const cases = { '': 7, b: 4, ba: 4, bat: 3, batch: 1, c: 2, z: 1, a: 0, d: 0, zz: 0, zoo: 1, zoom: 0 };
    for (const [prefix, count] of Object.entries(cases)) assert.equal(small.countPrefix(prefix), count, prefix);
    // Used words only count when they are in this dictionary and match the prefix.
    assert.equal(small.countPrefix('bat', new Set(['bat', 'bath', 'cat', 'batsman'])), 1);
    assert.equal(small.countPrefix('B'), 0);
    assert.equal(small.countPrefix(null), 0);
  });

  test('randomWithPrefix() honours prefix, used set and length limits', () => {
    const rng = seeded(3);
    for (let i = 0; i < 50; i++) assert.ok(small.randomWithPrefix('ba', null, rng).startsWith('ba'));
    assert.equal(small.randomWithPrefix('bat', new Set(['bat', 'batch']), rng), 'bath');
    assert.equal(small.randomWithPrefix('bat', new Set(['bat', 'batch', 'bath']), rng), null);
    assert.equal(small.randomWithPrefix('q', null, rng), null);
    assert.equal(small.randomWithPrefix('Ba', null, rng), null);
    assert.equal(small.randomWithPrefix('b', null, rng, { minLen: 5 }), 'batch');
    assert.ok(['bad', 'bat'].includes(small.randomWithPrefix('b', null, rng, { maxLen: 3 })));
    assert.equal(small.randomWithPrefix('b', null, rng, { minLen: 6 }), null);
  });

  test('randomWithPrefix() reaches the first and last words and every word in between', () => {
    assert.equal(small.randomWithPrefix('', null, () => 0), 'bad');
    assert.equal(small.randomWithPrefix('', null, () => 0.9999999), 'zoo');
    assert.equal(small.randomWithPrefix('z', null, () => 0.5), 'zoo');
    // Wraps around from the end of the range back to its start.
    assert.equal(small.randomWithPrefix('c', new Set(['cat']), () => 0.99), 'cab');
    const rng = seeded(9);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(small.randomWithPrefix('', null, rng));
    assert.deepEqual([...seen].sort(), LIST);
  });

  test('letterWeights() counts words per first letter', () => {
    const weights = small.letterWeights();
    assert.equal(Object.keys(weights).length, 26);
    assert.equal(weights.b, 4);
    assert.equal(weights.c, 2);
    assert.equal(weights.z, 1);
    assert.equal(weights.a, 0);
  });

  test('handles a trailing newline, a single word and an empty list', () => {
    const trailing = createDictionary('abc\nabd\n');
    assert.ok(trailing.has('abd'));
    assert.equal(trailing.countPrefix('ab'), 2);

    const single = createDictionary('solo');
    assert.ok(single.has('solo'));
    assert.equal(single.randomWithPrefix('so', null), 'solo');

    const empty = createDictionary('');
    assert.equal(empty.has('abc'), false);
    assert.equal(empty.countPrefix(''), 0);
    assert.equal(empty.randomWithPrefix('', null), null);
    assert.equal(empty.letterWeights().a, 0);
  });
});

describe('generated word lists', () => {
  const words = WORDS.split('\n');
  const botWords = BOT_WORDS.split('\n');
  const dict = createDictionary(WORDS);

  test('are sorted, unique, lowercase a-z within the length limits, and blocklist-free', () => {
    for (const [list, maxLength] of [[words, MAX_WORD_LENGTH], [botWords, 9]]) {
      const bad = list.find(
        (w, i) => !/^[a-z]+$/.test(w) || w.length < MIN_WORD_LENGTH || w.length > maxLength || (i > 0 && list[i - 1] >= w) || isBlockedWord(w),
      );
      assert.equal(bad, undefined);
    }
    assert.ok(words.length > 100_000);
    assert.ok(botWords.length > 20_000);
  });

  test('every word is found, bot words are dictionary words, and counts agree', () => {
    assert.ok(words.every((w) => dict.has(w)));
    assert.ok(botWords.every((w) => dict.has(w)));
    assert.equal(dict.countPrefix(''), words.length);
    const perLetter = {};
    for (const w of words) perLetter[w[0]] = (perLetter[w[0]] ?? 0) + 1;
    for (const [letter, count] of Object.entries(dict.letterWeights())) assert.equal(count, perLetter[letter] ?? 0, letter);
  });

  test('contains everyday words but no profanity', () => {
    for (const w of ['dog', 'grey', 'yellow', 'quiz', 'zebra', 'xylophone', 'jump', 'assess', 'class']) assert.ok(dict.has(w), w);
    for (const w of ['fuck', 'shit', 'bitch', 'cunt']) assert.equal(dict.has(w), false, w);
  });
});
