// Profanity / slur filter, shared by the word-list build (scripts/build-words.mjs)
// and by the engine (chat, names, live typing). Deliberately modest: it catches
// common words plus simple evasions (stretched letters, leetspeak digits, plurals)
// while matching whole tokens so innocent words ("class", "cocktail", "saltwater",
// "snigger") are left alone.

// Blocked anywhere inside a token: these never occur in innocent words.
const ANYWHERE = ['fuck', 'fuk', 'fck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'jizz', 'dildo'];

// Blocked as whole tokens, optionally followed by a plural -s / -z.
const WHOLE = [
  // profanity & vulgarity
  'ass', 'arse', 'asshole', 'arsehole', 'asshat', 'dumbass', 'jackass', 'fatass',
  'bastard', 'bollock', 'bugger', 'crap', 'crappy', 'damn', 'damned', 'dammit', 'goddamn',
  'goddamned', 'dick', 'dickhead', 'cock', 'cocksucker', 'pussy', 'pussies', 'tit', 'titty',
  'titties', 'boobs', 'boobies', 'cum', 'cumming', 'cumshot', 'blowjob', 'handjob', 'boner',
  'porn', 'porno', 'piss', 'pissed', 'pissing', 'twat', 'wank', 'wanker', 'wanking', 'douche',
  'douchebag', 'skank', 'bellend', 'tosser', 'knobhead', 'milf', 'rape', 'raped', 'raping',
  'rapist',
  // slurs
  'nigger', 'nigga', 'negro', 'negroes', 'coon', 'chink', 'gook', 'jap', 'kike', 'spic',
  'wetback', 'beaner', 'paki', 'raghead', 'towelhead', 'fag', 'faggot', 'faggy', 'dyke', 'homo',
  'tranny', 'retard', 'retarded', 'spaz',
  'sex', 'sexy', 'sexual', 'sexually', 'sexes', 'sexed', 'sexting', 'sext', 'nude', 'nudity',
  'naked', 'horny', 'orgasm', 'erotic', 'erotica', 'fetish', 'kinky', 'kink', 'penis', 'vagina',
  'vulva', 'testicle', 'boob', 'nipple', 'genital', 'masturbate', 'masturbation', 'ejaculate',
  'semen', 'sperm', 'condom', 'viagra', 'orgy', 'stripper', 'hooker', 'prostitute', 'prostitution',
  'brothel', 'pervert', 'perv', 'pedophile', 'pedo', 'incest', 'bdsm', 'nsfw', 'xxx', 'hentai',
  'cocaine', 'heroin', 'meth', 'suicide', 'kys',
];

const WHOLE_RE = new RegExp(`^(?:${WHOLE.join('|')})[sz]?$`);
const ANYWHERE_RE = new RegExp(ANYWHERE.join('|'));
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const TOKEN_RE = /[A-Za-z0-9@$]+/g;

/** True if a single token (a word, possibly with leetspeak) is blocked. */
export function isBlockedWord(token) {
  const word = token.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c]);
  if (word === 'scunthorpe') return false;
  // Runs of 3+ equal letters are (almost) never real spelling, so also try them squeezed
  // to one and to two letters: "fuuuuck" -> "fuck", "asssss" -> "ass".
  const variants = [word, word.replace(/(.)\1{2,}/g, '$1'), word.replace(/(.)\1{2,}/g, '$1$1')];
  return variants.some((w) => WHOLE_RE.test(w) || ANYWHERE_RE.test(w));
}

/** Roblox-style filter: every blocked token is replaced by '#' of the same length. */
export function filterText(text) {
  // Check separated single-letter runs without joining ordinary words ("s e x").
  return text.replace(/\b(?:[A-Za-z0-9@$][\s._-]+){2,}[A-Za-z0-9@$]\b/g, (run) =>
    isBlockedWord(run.replace(/[\s._-]/g, '')) ? '#'.repeat(run.length) : run)
    .replace(TOKEN_RE, (token) => (isBlockedWord(token) ? '#'.repeat(token.length) : token));
}
