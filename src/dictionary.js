// Word lookups over ONE sorted string of '\n'-separated lowercase a-z words (see
// scripts/build-words.mjs). Every query is a binary search over character offsets
// of the raw string, so creating a dictionary costs nothing up front: no split into
// a giant array or Set, which matters under the Workers CPU limits.

const PREFIX_RE = /^[a-z]*$/;
const AFTER_Z = '{'; // the character right after 'z': prefix + '{' sorts after every word with that prefix
const MAX_CACHED_RANGES = 4096;

export function createDictionary(source) {
  // Terminate every word (including the last) with '\n', so a word starting at
  // offset s always spans [s, text.indexOf('\n', s)).
  const text = !source || source.endsWith('\n') ? source || '' : `${source}\n`;
  const ranges = new Map(); // prefix -> { lo, hi, count } (word offsets [lo, hi))
  let weights = null;

  // Offset of the first word >= key, or text.length if there is none.
  // Invariant: lo and hi are always word starts (or the end of the text).
  function lowerBound(key) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const start = text.lastIndexOf('\n', mid - 1) + 1; // start of the word containing mid
      const end = text.indexOf('\n', start);
      if (text.slice(start, end) < key) lo = end + 1;
      else hi = start;
    }
    return lo;
  }

  function range(prefix) {
    let r = ranges.get(prefix);
    if (!r) {
      const lo = lowerBound(prefix);
      const hi = lowerBound(prefix + AFTER_Z);
      let count = 0;
      for (let i = text.indexOf('\n', lo); i !== -1 && i < hi; i = text.indexOf('\n', i + 1)) count++;
      if (ranges.size >= MAX_CACHED_RANGES) ranges.clear();
      r = { lo, hi, count };
      ranges.set(prefix, r);
    }
    return r;
  }

  const isPrefix = (prefix) => typeof prefix === 'string' && PREFIX_RE.test(prefix);

  /** Exact membership test. */
  function has(word) {
    if (!isPrefix(word) || !word) return false;
    const i = lowerBound(word);
    return text.startsWith(word, i) && text.charCodeAt(i + word.length) === 10;
  }

  /** Number of words starting with `prefix`, not counting words in `used` (a Set). */
  function countPrefix(prefix, used) {
    if (!isPrefix(prefix)) return 0;
    let count = range(prefix).count;
    if (used) for (const word of used) if (word.startsWith(prefix) && has(word)) count--;
    return count;
  }

  /**
   * A random word starting with `prefix` that is not in `used` and has a length within
   * [minLen, maxLen], or null. Starts at a uniformly random word of the prefix range and
   * scans forward (wrapping around) to the first word that qualifies.
   */
  function randomWithPrefix(prefix, used, random = Math.random, { minLen = 0, maxLen = Infinity } = {}) {
    if (!isPrefix(prefix)) return null;
    const { lo, hi, count } = range(prefix);
    let pos = lo;
    for (let k = Math.min(count - 1, Math.floor(random() * count)); k > 0; k--) pos = text.indexOf('\n', pos) + 1;
    for (let n = 0; n < count; n++) {
      const end = text.indexOf('\n', pos);
      const length = end - pos;
      if (length >= minLen && length <= maxLen) {
        const word = text.slice(pos, end);
        if (!used?.has(word)) return word;
      }
      pos = end + 1 < hi ? end + 1 : lo;
    }
    return null;
  }

  /** { a: count, b: count, ... z: count } — how many words start with each letter. */
  function letterWeights() {
    if (!weights) {
      weights = {};
      for (let c = 97; c <= 122; c++) {
        const letter = String.fromCharCode(c);
        weights[letter] = range(letter).count;
      }
      Object.freeze(weights);
    }
    return weights;
  }

  return { has, countPrefix, randomWithPrefix, letterWeights };
}
