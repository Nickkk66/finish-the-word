import { h, setText } from './dom.js';
import { TIDE } from '../shared/word-tide.js';
import { sfx } from '../audio.js';
export function createTideHud({ send, start }) {
 const eyebrow = h('div', { class: 'tide-eyebrow' }, 'TROPICAL SURVIVAL');
 const title = h('h1', {}, 'WORD TIDE');
 const prompt = h('div', { class: 'tide-question', role: 'status' });
 const meta = h('div', { class: 'tide-meta' });
 const clock = h('span', { class: 'tide-clock' });
 const progress = h('div', { class: 'tide-progress' }, h('i'));
 const top = h('div', { class: 'tide-top' }, eyebrow, title, prompt, meta, clock, progress);
 const hearts = h('div', { class: 'tide-hearts', 'aria-label': 'Hearts' });
 const input = h('input', { class: 'tide-input', placeholder: 'Think of a long answer…', 'aria-label': 'Your category answer', maxlength: 70, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
 const submit = h('button', { class: 'tide-submit', type: 'submit' }, 'Lock answer ↑');
 const saved = h('div', { class: 'tide-saved', role: 'status', 'aria-live': 'polite' });
 const form = h('form', { class: 'tide-form' }, input, submit);
 const note = h('div', { class: 'tide-note' });
 const startButton = h('button', { class: 'btn green', type: 'button', onClick: start }, 'Summon the tide');
 const rules = h('details', { class: 'tide-rules' }, h('summary', {}, 'How to survive'), h('p', {}, 'Answer together. Lock a valid answer before 20 seconds run out; you can replace it. At the reveal, each letter builds one block. Spaces add no height. The next wave rises after every tower finishes.'), h('p', {}, 'Five hearts. Submerged? Lose one heart, then a rescue lift gives you another chance. Last survivor wins. After 12 rounds: most hearts, then most earned letters. Exact ties share the win. Pets and cards have no effects here.'));
 const bottom = h('div', { class: 'tide-bottom' }, hearts, form, saved, note, startButton, rules);
 const caption = h('div', { class: 'tide-caption' });
 const spray = h('div', { class: 'tide-screen-spray', 'aria-hidden': true });
 const el = h('div', { class: 'tide-hud', hidden: true }, top, bottom, caption, spray);
 let st, key = '', pending = null, locked = null, raf = 0, lastSecond = null;
 function frame() {
  raf = 0; if (el.hidden || !st) return;
  const m = st.match, remaining = Math.max(0, st.deadline - performance.now());
  setText(clock, m?.phase === 'tideAnswer' ? `${Math.ceil(remaining/1000)}s` : m?.phase === 'countdown' ? `${Math.ceil(remaining/1000)}s` : '');
  progress.firstChild.style.transform = `scaleX(${Math.min(1, remaining / TIDE.answer)})`;
  clock.classList.toggle('urgent', remaining < 5000);
  if (m?.phase === 'tideAnswer') {
   const sec = Math.ceil(remaining/1000);
   if (sec !== lastSecond && sec > 0 && sec <= 5) sfx.tick(sec === 1);
   lastSecond = sec; if (!remaining) { input.disabled = submit.disabled = true; }
  }
  if (m?.phase === 'tideIntro') {
   const t = (TIDE.intro - remaining)/1000;
   setText(caption, t<3?'The ocean has gone quiet.':t<6?'Something is rising.':t<9?'BRACE YOURSELF':t<12?'Paradise, washed away.':t<15?'Find your higher ground.':'Longer answers. Higher towers. Survive.');
   spray.style.opacity = t > 7.3 && t < 10 ? String(Math.max(0, 1 - Math.abs(t - 8.2)/1.5)) : '0';
  } else spray.style.opacity = '0';
  raf = requestAnimationFrame(frame);
 }
 form.addEventListener('submit', e => {
  e.preventDefault(); if (input.disabled || pending || !input.value.trim()) return;
  pending = crypto.randomUUID(); submit.disabled = true;
  send({ t: 'tideAnswer', matchId: st.match.matchId, round: st.match.round, requestId: pending, answer: input.value });
  setText(saved, 'Checking your answer…'); sfx.submit();
 });
 function receipt(msg) {
  if (msg.matchId !== st?.match?.matchId || msg.round !== st?.match?.round) return;
  if (msg.requestId && msg.requestId !== pending) return;
  pending = null; locked = msg.locked || locked;
  submit.disabled = input.disabled;
  saved.classList.toggle('invalid', !msg.ok);
  setText(saved, msg.ok ? locked ? `✓ ${locked.word.toUpperCase()} · ${locked.length} blocks saved. You can replace it.` : 'Your answer stays secret until the reveal.' : `${msg.error}${locked ? ` Saved: ${locked.word.toUpperCase()}.` : ''}`);
  if (msg.requestId) (msg.ok ? sfx.pick : sfx.wrong)();
 }
 function update(state, on) {
  st = state; el.hidden = !on;
  if (!on) { if (raf) cancelAnimationFrame(raf); raf = 0; key = ''; pending = locked = null; return; }
  const m = st.match, phase = m?.phase || 'lobby', part = m?.participants.find(p => p.id === st.you), active = !!m?.tide;
  const nextKey = `${m?.matchId}:${m?.round}:${phase}`;
  if (nextKey !== key) {
   key = nextKey; pending = null;
   if (phase === 'tideAnswer') { input.value = ''; locked = null; saved.classList.remove('invalid'); setText(saved, 'Your answer stays secret until the reveal.'); if (part?.alive) { sfx.turn(); if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { if (!el.hidden && !input.disabled) input.focus({preventScroll:true}); }, 100); } }
   if (phase === 'tideReveal') sfx.correct();
   if (phase === 'tideFlood') sfx.tideWave();
   if (phase === 'tideResolve' && part && m.tide.towers[st.you]?.rescued) sfx.heart();
   if (phase === 'ended') sfx.win();
  }
  const intro = phase === 'tideIntro'; el.classList.toggle('cinematic', intro);
  caption.hidden = !intro; bottom.hidden = intro;
  eyebrow.textContent = active ? `TROPICAL SURVIVAL · ROUND ${m.round || 1} / ${TIDE.rounds}` : 'TROPICAL SURVIVAL';
  title.hidden = active && !intro && phase !== 'ended';
  const winners = m?.tide?.winners || [];
  prompt.textContent = phase === 'tideAnswer' ? m.tide.category.prompt : phase === 'tideReveal' ? 'BUILD YOUR WAY UP!' : phase === 'tideFlood' ? 'INCOMING WAVE' : phase === 'tideResolve' ? part && !part.alive ? 'Swept away — watch the survivors' : m.tide.towers[st.you]?.rescued ? 'Heart lost. Rescued for another round!' : 'Above water. Still in the game.' : phase === 'ended' ? winners.length ? `${winners.map(id=>st.players.get(id)?.name||'Player').join(' & ')} ${winners.length>1?'share the win!':'survives!'}` : 'The ocean wins this time.' : intro ? '' : 'Longer answers. Higher towers. Survive.';
  meta.textContent = active && !intro ? `↑ Next wave: ${m.tide.rise} blocks · ${m.participants.filter(p=>p.alive).length} survivors${m.practice?' · Practice':''}` : intro ? '' : 'Five hearts · One letter, one block · A rising tropical ocean';
  progress.hidden = phase !== 'tideAnswer';
  const typing = phase === 'tideAnswer' && part?.alive;
  form.hidden = saved.hidden = !typing; input.disabled = submit.disabled = !typing;
  hearts.hidden = !part || !active;
  hearts.textContent = part ? '♥'.repeat(part.hearts) + '♡'.repeat(Math.max(0,TIDE.hearts-part.hearts)) : '';
  hearts.setAttribute('aria-label', `${part?.hearts || 0} of five hearts`);
  note.textContent = !active ? (st.players.get(st.you)?.seat >= 0 ? 'Waiting for two seated players. The storm begins when the match starts.' : 'Sit at the table to claim your platform.') : phase === 'tideAnswer' && !part?.alive ? 'Spectating · Join the next match by sitting at the table.' : phase === 'tideReveal' ? 'Every letter becomes a block. The water waits for the reveal.' : phase === 'ended' ? m.practice ? 'Practice complete · No coins or wins awarded.' : 'The storm is passing. A new island awaits.' : '';
  startButton.hidden = active || !(st.hostId === st.you || st.isAdmin);
  rules.hidden = active && phase !== 'ended';
  if (!raf) raf = requestAnimationFrame(frame);
 }
 return { el, update, receipt };
}
