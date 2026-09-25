// Bot identities and decision making. Pure functions: the engine executes the returned
// plans on its (injectable) timers, so bot behaviour is deterministic under test.
import { DEFAULT_SETTINGS } from '../public/js/shared/constants.js';
import { CHAIRS, PETS, randomLook } from '../public/js/shared/catalog.js';

const NAMES = [
  'BloxyBot', 'NoobMaster', 'WordWizard', 'LetterLord', 'VowelVortex', 'SpellSlinger', 'TypoKing',
  'Wordzilla', 'QuickQuill', 'Dictionerd', 'AlphaBeast', 'SyllaBully', 'PunMaster', 'Scrabbler',
  'InkBlot', 'CaptainABC', 'Glyphy', 'MrSpeller', 'Lexi', 'ChatterBot',
];
const BLANK_CHANCE = 0.08; // freeze up and let the timer run out
const WRONG_CHANCE = 0.1; // first submit a plausible non-word
const REFERENCE_TURN_MS = DEFAULT_SETTINGS.turnSeconds * 1000; // think times are tuned for this turn length

const pick = (list, random) => list[Math.floor(random() * list.length)];

/** Name, look, chair and pet for a new bot; avoids names already in the room. */
export function botProfile(random, takenNames) {
  const free = NAMES.filter((n) => !takenNames.has(n));
  return {
    name: free.length ? pick(free, random) : `Bot${1000 + Math.floor(random() * 9000)}`,
    look: randomLook(random),
    chair: pick(CHAIRS, random).id,
    pet: pick(PETS, random).id,
  };
}

/** Chooser: take 1–2.5 s, then pick one of the offered letters. */
export function planPick(options, random) {
  return { wait: 1000 + random() * 1500, letter: pick(options, random) };
}

/**
 * Typer: a list of steps `{ wait, typing }` / `{ wait, submit }` (wait = ms after the
 * previous step). Empty when the bot blanks or knows no word.
 */
export function planTurn({ prefix, used, turnMs, dict, botDict, random }) {
  if (random() < BLANK_CHANCE) return [];
  const word = botDict.randomWithPrefix(prefix, used, random) ?? dict.randomWithPrefix(prefix, used, random);
  if (!word) return [];

  const steps = [];
  const type = (w) => {
    for (let i = 1; i <= w.length; i++) steps.push({ wait: 90 + random() * 70, typing: w.slice(0, i) });
  };
  const submit = (w) => steps.push({ wait: 150 + random() * 250, submit: w });

  const wrong = random() < WRONG_CHANCE ? misspell(word, prefix, dict, random) : null;
  if (wrong) {
    type(wrong);
    submit(wrong);
    steps.push({ wait: 400 + random() * 600, typing: '' }); // "oops", clear the bubble
  }
  type(word);
  submit(word);

  // Think 1.5–5 s (at the reference turn length, scaled to this turn), but leave time to finish.
  const busy = steps.reduce((sum, s) => sum + s.wait, 0);
  const think = (1500 + random() * 3500) * (turnMs / REFERENCE_TURN_MS);
  steps[0].wait += Math.max(200, Math.min(think, turnMs - busy - 500));
  return steps;
}

// A believable non-word: one letter after the prefix swapped for a random letter.
function misspell(word, prefix, dict, random) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const i = prefix.length + Math.floor(random() * (word.length - prefix.length));
    const candidate = word.slice(0, i) + String.fromCharCode(97 + Math.floor(random() * 26)) + word.slice(i + 1);
    if (!dict.has(candidate)) return candidate;
  }
  return null;
}
