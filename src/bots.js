// Bot identities and decision making. Pure functions: the engine executes the returned
// plans on its (injectable) timers, so bot behaviour is deterministic under test.
import { DEFAULT_SETTINGS, BOT_LEVELS } from '../public/js/shared/constants.js';
import { CHAIRS, PETS, randomLook } from '../public/js/shared/catalog.js';
import { sanitizeName } from './sanitize.js';

const NOUNS = ['Panda', 'Pizza', 'Cat', 'Bunny', 'Cloud', 'Mango', 'Star', 'Fox'];
const REFERENCE_TURN_MS = DEFAULT_SETTINGS.turnSeconds * 1000; // think times are tuned for this turn length

const pick = (list, random) => list[Math.floor(random() * list.length)];

/** Name, look, chair and pet for a new bot; avoids names already in the room. */
export function botProfile(random, takenNames) {
  let name;
  for (let i = 0; i < 20; i++) {
    const noun = pick(NOUNS, random);
    name = sanitizeName(pick([
      `${pick(['Cool', 'Happy', 'Sunny', 'Sleepy'], random)}${noun}${Math.floor(random() * 1000)}`,
      `${noun.toLowerCase()}_${pick(NOUNS, random).toLowerCase()}${10 + Math.floor(random() * 90)}`,
      `xX_${noun}_Xx`, `${pick(['Maya', 'Alex', 'Noah', 'Ava', 'Sam'], random)}${2008 + Math.floor(random() * 9)}`,
    ], random));
    if (!takenNames.has(name)) break;
  }
  if (takenNames.has(name)) name = `Player${1000 + Math.floor(random() * 9000)}`;
  return {
    name,
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
export function planTurn({ prefix, used, turnMs, dict, botDict, random, level = 'normal', minLength = 3 }) {
  const spec = BOT_LEVELS[level] ?? BOT_LEVELS.normal;
  if (random() < spec.blankChance + Math.max(0, spec.pressureBelow - turnMs / 1000) * spec.pressurePerSecond) return [];
  const word = botDict.randomWithPrefix(prefix, used, random, { minLen: minLength, maxLen: spec.maxLength });
  if (!word) return [];

  const steps = [];
  const wpm = spec.wpm[0] + random() * (spec.wpm[1] - spec.wpm[0]);
  const type = (w) => {
    for (let i = 1; i <= w.length; i++) {
      steps.push({ wait: 60000 / (wpm * 5) * (.7 + random() * .6), typing: w.slice(0, i) });
      if (i > prefix.length && random() < .035) {
        steps.push({ wait: 150, typing: w.slice(0, i - 1) }, { wait: 220, typing: w.slice(0, i) });
      }
    }
  };
  const submit = (w) => steps.push({ wait: 150 + random() * 250, submit: w });

  const wrong = random() < spec.wrongChance ? misspell(word, prefix, dict, random) : null;
  if (wrong) {
    type(wrong);
    submit(wrong);
    steps.push({ wait: 400 + random() * 600, typing: '' }); // "oops", clear the bubble
  }
  type(word);
  submit(word);

  // Think 1.5–5 s (at the reference turn length, scaled to this turn), but leave time to finish.
  const think = (spec.think[0] + random() * (spec.think[1] - spec.think[0])) * (turnMs / REFERENCE_TURN_MS);
  steps[0].wait += Math.max(400, think);
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
