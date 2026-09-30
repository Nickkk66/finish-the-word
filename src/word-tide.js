import { TIDE, tideRise } from '../public/js/shared/word-tide.js';
import { TIDE_BANK, validateTideAnswer } from './tide-bank.js';
// Methods installed on GameEngine; all scheduling and settlement use its existing lifecycle.
export const wordTideMethods = {
 startTide() {
  const m = this.match;
  const deck = [...TIDE_BANK];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  m.tide = { seed: Math.floor(this.random() * 1000000), water: 0, fromWater: 0, rise: 0, category: null, towers: {}, winners: [], deck, answers: new Map(), requests: new Map() };
  for (const [seat, p] of m.participants.entries()) {
   p.hearts = p.maxHearts = TIDE.hearts; p.shield = false; p.ability = null;
   m.tide.towers[p.id] = { id: p.id, seat, height: 2, earned: 0, segments: [], answer: '', added: 0, rescued: false, before: 2 };
  }
  this.setPhase('tideIntro', TIDE.intro, () => this.nextTideRound());
  this.syncHazards(); this.broadcastMatch();
 },
 nextTideRound() {
  const m = this.match, t = m.tide;
  m.round++; m.turnId = ++this.turnSerial;
  t.category = t.deck[m.round - 1]; t.answers.clear(); t.requests.clear();
  t.rise = tideRise(t.category.referenceLength, m.round);
  for (const tower of Object.values(t.towers)) { tower.answer = ''; tower.added = 0; tower.rescued = false; tower.before = tower.height; tower.longest = false; }
  this.setPhase('tideAnswer', TIDE.answer, () => this.revealTide());
  this.broadcastMatch();
  const bots = m.participants.filter(p => p.isBot && p.alive).map(p => ({ p, at: 4000 + Math.floor(this.random() * 13000) })).sort((a,b) => a.at - b.at);
  let previous = 0;
  this.runBot(bots.map(({p,at}) => {
   const wait = at - previous; previous = at;
   return { wait, run: () => {
    if (this.random() < .12 || !p.alive) return;
    const answers = [...t.category.answers].sort((a,b) => a.length - b.length);
    const level = m.settings.botLevel, max = level === 'easy' ? .55 : level === 'hard' ? 1 : .85;
    const word = answers[Math.floor(this.random() * answers.length * max)];
    t.answers.set(p.id, validateTideAnswer(t.category.id, word));
   }};
  }));
 },
 tidePrivate(id) {
  const m = this.match;
  return m.tide ? { t: 'tideAnswerResult', matchId: m.matchId, round: m.round, ok: true, locked: m.tide.answers.get(id) || null } : null;
 },
 onTideAnswer(player, msg) {
  const m = this.match, t = m.tide;
  if (!t || !this.allow(player, 'submit')) return;
  if (m.phase !== 'tideAnswer' || this.now() >= m.endsAt || msg.matchId !== m.matchId || msg.round !== m.round || !this.participant(player.id)?.alive) {
   return this.send(player, { t: 'tideAnswerResult', matchId: msg.matchId, round: msg.round, requestId: msg.requestId, ok: false, error: 'This answering round has ended.' });
  }
  if (typeof msg.requestId !== 'string' || msg.requestId.length > 80 || !msg.requestId) return;
  const key = `${player.id}:${msg.requestId}`;
  if (t.requests.has(key)) return this.send(player, t.requests.get(key));
  const answer = validateTideAnswer(t.category.id, msg.answer);
  if (answer) t.answers.set(player.id, answer);
  const response = { ...this.tidePrivate(player.id), requestId: msg.requestId, ok: !!answer, error: answer ? '' : 'Not in this category. Try another answer — your last valid answer stays saved.' };
  // The per-round map is bounded, and deadlines/phase prevent a replay ever building twice.
  if (t.requests.size < 1024) t.requests.set(key, response);
  this.send(player, response);
 },
 revealTide() {
  const m = this.match, t = m.tide;
  let longest = 0;
  for (const p of m.participants.filter(p => p.alive)) {
   const tower = t.towers[p.id], answer = t.answers.get(p.id);
   tower.before = tower.height;
   if (!answer) continue;
   tower.answer = answer.word; tower.added = answer.length;
   tower.segments.push({ letters: answer.letters, base: tower.height, round: m.round });
   tower.height += answer.length; tower.earned += answer.length;
   p.words++; m.wordCount++; longest = Math.max(longest, answer.length);
  }
  for (const tower of Object.values(t.towers)) tower.longest = longest > 0 && tower.added === longest;
  this.setPhase('tideReveal', TIDE.reveal, () => {
   t.fromWater = t.water; t.water += t.rise;
   this.setPhase('tideFlood', TIDE.flood, () => this.resolveTide());
   this.broadcastMatch();
  });
  this.broadcastMatch();
 },
 resolveTide() {
  const m = this.match, t = m.tide;
  for (const p of m.participants) {
   p.tidePreviousHearts = p.hearts;
   if (!p.alive) continue;
   const tower = t.towers[p.id]; tower.before = tower.height;
   if (tower.height <= t.water) {
    p.hearts--; p.lostHeart = true;
    if (!p.hearts) p.alive = false;
    else { tower.rescued = true; tower.height = t.water + 2; }
   }
  }
  this.setPhase('tideResolve', TIDE.resolve, () => {
   const alive = m.participants.filter(p => p.alive);
   if (alive.length === 0 || (m.participants.length > 1 && alive.length === 1) || m.round >= TIDE.rounds) {
    const candidates = alive.length ? alive : m.participants.filter(p => p.tidePreviousHearts > 0 && !p.tideForfeit);
    const hearts = Math.max(...candidates.map(p => alive.length ? p.hearts : p.tidePreviousHearts));
    const best = candidates.filter(p => (alive.length ? p.hearts : p.tidePreviousHearts) === hearts);
    const earned = Math.max(...best.map(p => t.towers[p.id].earned));
    return this.endTide(best.filter(p => t.towers[p.id].earned === earned).map(p => p.id));
   }
   this.nextTideRound();
  });
  this.broadcastMatch();
 },
 tideOut(id) {
  const p = this.participant(id); p.alive = false; p.hearts = 0; p.tideForfeit = true;
  const alive = this.match.participants.filter(p => p.alive);
  if (alive.length <= 1) return this.endTide(alive.map(p => p.id));
  this.broadcastMatch();
 },
 endTide(winners = []) {
  const m = this.match; if (m.paid) return;
  m.paid = true; m.tide.winners = winners; m.winnerId = winners[0] || null;
  this.broadcast({ t: 'win', id: m.winnerId, ids: winners, mode: 'word_tide', practice: m.practice });
  this.setPhase('ended', TIDE.outro, () => { this.enterLobby(); this.broadcastMatch(); });
  for (const p of m.participants) {
   const player = this.players.get(p.id); if (!player || p.isBot) continue;
   const won = !m.practice && winners.includes(p.id);
   const coins = m.practice ? 0 : Math.min(TIDE.rewardCap, 5 + p.words * 10 + (won ? 25 : 0));
   const receipt = { t: 'tideReward', matchId: m.matchId, coins, won, practice: m.practice, words: p.words, bestWpm: 0, bestCombo: 0, bonuses: [], durationMs: this.now() - m.startedAt };
   this.remember(player, `tide:${m.matchId}`, receipt); this.send(player, receipt);
   if (won) { player.wins++; this.broadcastPlayer(player); this.onWin({ playerId: player.id, name: player.name, humans: m.humans }); }
  }
  this.broadcastMatch();
 },
 tideView() {
  const t = this.match.tide;
  if (!t) return undefined;
  // Never serialize the deck, lookup, draft answers or request receipts to other players.
  return { seed: t.seed, water: t.water, fromWater: t.fromWater, rise: t.rise, category: t.category ? { id: t.category.id, prompt: t.category.prompt } : null, towers: t.towers, winners: t.winners };
 },
};
