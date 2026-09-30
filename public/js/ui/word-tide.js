import { h, s, setText } from './dom.js';
import { TIDE } from '../shared/word-tide.js';
import { sfx } from '../audio.js';
export function createTideHud({ send, start }) {
 const eyebrow = h('div', { class: 'tide-eyebrow' }, 'TROPICAL SURVIVAL');
 const title = h('h1', {}, 'WORD TIDE');
 const prompt = h('div', { class: 'tide-question', role: 'status' });
 const meta = h('div', { class: 'tide-meta' });
 const clock = h('div', { class: 'timer-num tide-clock' });
 const circumference = 2 * Math.PI * 42;
 const ring = s('circle', {class:'timer-ring',cx:50,cy:50,r:42,'stroke-dasharray':circumference});
 const timer = h('div',{class:'timer tide-timer'},s('svg',{viewBox:'0 0 100 100','aria-hidden':'true'},s('circle',{class:'timer-face',cx:50,cy:50,r:47}),s('circle',{class:'timer-track',cx:50,cy:50,r:42}),ring),clock);
 const progress = h('div', { class: 'tide-progress' }, h('i'));
 const top = h('div', { class: 'tide-top' }, eyebrow, title, prompt, meta);
 const hearts = h('div', { class: 'tide-hearts', 'aria-label': 'Hearts' });
 const input = h('input', { class: 'tide-input word-field', placeholder: 'Your answer…', 'aria-label': 'Your category answer', maxlength: 70, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
 const submit = h('button', { class: 'tide-submit btn green word-send', type: 'submit', 'aria-label':'Submit answer' }, '➜');
 const saved = h('div', { class: 'tide-saved', role: 'status', 'aria-live': 'polite' });
 const form = h('form', { class: 'tide-form word-form' }, input, submit);
 const note = h('div', { class: 'tide-note' });
 const startButton = h('button', { class: 'btn green', type: 'button', onClick: start }, 'Summon the tide');
 const bottom = h('div', { class: 'tide-bottom' }, h('div',{class:'turn-row'},timer,hearts), saved, form, note, startButton);
 const caption = h('div', { class: 'tide-caption' });
 const spray = h('div', { class: 'tide-screen-spray', 'aria-hidden': true });
 const el = h('div', { class: 'tide-hud', hidden: true }, top, bottom, caption, spray);
 let st, key = '', pending = null, locked = null, raf = 0, lastSecond = null;
 function frame() {
  raf = 0; if (el.hidden || !st) return;
  const m = st.match, remaining = Math.max(0, st.deadline - performance.now());
  setText(clock, m?.phase === 'tideAnswer' ? (remaining/1000).toFixed(1) : m?.phase === 'countdown' ? (remaining/1000).toFixed(1) : '');
  ring.style.strokeDashoffset = String(circumference * (1-Math.min(1,remaining/TIDE.answer)));
  timer.classList.toggle('urgent',remaining < 5000);
  progress.firstChild.style.transform = `scaleX(${Math.min(1, remaining / TIDE.answer)})`;
  clock.classList.toggle('urgent', remaining < 5000);
  if (m?.phase === 'tideAnswer') {
   const sec = Math.ceil(remaining/1000);
   if (sec !== lastSecond && sec > 0 && sec <= 5) sfx.tick(sec === 1);
   lastSecond = sec; if (!remaining) { input.disabled = submit.disabled = true; }
  }
  if (m?.phase === 'tideIntro') {
   const t = (TIDE.intro - remaining)/1000;
   setText(caption, t<4?'The ocean is pulling back…':t<8?'Here comes the tide!':t<15?'HOLD ON TO YOUR CHAIR!':t<19?'Your answer builds your escape.':'More letters → more height.');
   spray.style.opacity = t > 10 && t < 13 ? String(.55 * Math.max(0, 1 - Math.abs(t - 11.5)/1.5)) : '0';
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
  setText(saved, msg.ok ? locked ? `✓ ${locked.word.toUpperCase()} · ${locked.length} blocks saved` : 'Your answer stays secret until the reveal.' : `${msg.error}${locked ? ` Saved: ${locked.word.toUpperCase()}.` : ''}`);
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
  const intro = phase === 'tideIntro'; el.classList.toggle('cinematic', intro);el.classList.toggle('ending',phase==='ended');
  caption.hidden = !intro; bottom.hidden = intro;
  eyebrow.textContent = active && !intro ? `WORD TIDE   ·   ROUND ${m.round || 1} / ${TIDE.rounds}` : 'THE OCEAN IS RISING';
  title.hidden = active && !intro && phase !== 'ended';
  const winners = m?.tide?.winners || [];
  prompt.textContent = phase === 'tideAnswer' ? m.tide.category.prompt : phase === 'tideReveal' ? 'BUILD YOUR WAY UP!' : phase === 'tideFlood' ? 'INCOMING WAVE' : phase === 'tideResolve' ? part && !part.alive ? 'Swept away — watch the survivors' : m.tide.towers[st.you]?.rescued ? 'Heart lost. Rescued for another round!' : 'Above water. Still in the game.' : phase === 'ended' ? winners.length ? `${winners.map(id=>st.players.get(id)?.name||'Player').join(' & ')} ${winners.length>1?'share the win!':'survives!'}` : 'The ocean wins this time.' : 'Type a long answer to climb above the waves.';
  meta.textContent = active && !intro ? `↑ Next wave: ${m.tide.rise} blocks · ${m.participants.filter(p=>p.alive).length} survivors${m.practice?' · Practice':''}` : 'Every letter builds your tower. Stay above the water to survive.';
  timer.hidden = phase !== 'tideAnswer';
  const typing = phase === 'tideAnswer' && part?.alive;
  form.hidden = saved.hidden = !typing; input.disabled = submit.disabled = !typing;
  hearts.hidden = !part || !active;
  hearts.textContent = part ? '♥'.repeat(part.hearts) + '♡'.repeat(Math.max(0,TIDE.hearts-part.hearts)) : '';
  hearts.setAttribute('aria-label', `${part?.hearts || 0} of five hearts`);
  note.textContent = !active ? 'Everyone in the room joins the next wave.' : phase === 'tideAnswer' && !part?.alive ? 'Watching the survivors · You join the next game.' : phase === 'tideReveal' ? 'More letters → more height!' : phase === 'ended' ? 'The tide is taking its final bow…' : '';
  startButton.hidden = active || !(st.hostId === st.you || st.isAdmin);
  if (!raf) raf = requestAnimationFrame(frame);
 }
 return { el, update, receipt };
}
