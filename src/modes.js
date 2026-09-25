import { BASE_MISTAKES, MIN_TURN_MS } from '../public/js/shared/constants.js';
export const TWISTS = [
  { id: 'half', name: 'HALF TIME' }, { id: 'double_time', name: 'DOUBLE TIME' },
  { id: 'long', name: 'LONG WORDS' }, { id: 'two', name: 'TWO LETTERS' },
  { id: 'random', name: 'RANDOM LETTER' }, { id: 'perfect', name: 'NO MISTAKES' },
];
export function rules(mode, match) {
  const twist = match.twist?.id;
  return {
    turnMs(wordCount) {
      let time = mode === 'blitz' ? Math.max(3000, match.settings.turnSeconds * 1000 - Math.floor(wordCount / 2) * 1000)
        : Math.max(MIN_TURN_MS, match.settings.turnSeconds * 1000 - Math.floor(wordCount / 3) * 1000);
      if (mode === 'chaos' && twist === 'half') time /= 2;
      if (mode === 'chaos' && twist === 'double_time') time *= 2;
      return time;
    },
    minLength: n => mode === 'long' ? Math.min(8, 5 + Math.floor(n / 6)) : mode === 'chaos' && twist === 'long' ? 6 : 3,
    twoLetterChance: n => mode === 'double' || (mode === 'chaos' && twist === 'two') ? 1 : Math.min(.3, .04 + .012 * n),
    twoLetterMinimum: mode === 'double' || (mode === 'chaos' && twist === 'two') ? 10 : 25,
    maxMistakes: mode === 'sudden' || (mode === 'chaos' && twist === 'perfect') ? 1 : BASE_MISTAKES,
    randomLetter: mode === 'random' || (mode === 'chaos' && twist === 'random'),
    floor: mode === 'blitz' || (mode === 'chaos' && twist === 'half') ? 3000 : 4000,
  };
}
