import { h, s, setText, replay } from './dom.js';
import { TIDE } from '../shared/word-tide.js';
import { sfx } from '../audio.js';
import { WRECK, wreckStage } from '../shared/tide-wreck.js';
import { TIDE_FLIGHT } from '../shared/tide-flight.js';
export function createTideHud({ send, start, onHint, onGiveUp, onSpectate }) {
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
 const input = h('input', { class: 'tide-input word-field', placeholder: 'Your answer…', 'aria-label': 'Your category answer', maxlength: 70, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
 const submit = h('button', { class: 'tide-submit btn green word-send', type: 'submit', 'aria-label':'Submit answer' }, '➜');
 const form = h('form', { class: 'tide-form word-form' }, input, submit);
 const note = h('div', { class: 'tide-note' });
 const startButton = h('button', { class: 'btn green', type: 'button', onClick: start }, 'Summon the tide');
 const hint = h('button', {type:'button',class:'btn small yellow',onClick:onHint}, `Answer · ${TIDE.hintPrice}`);
 const tools = h('div', {class:'turn-tools'}, hint);
 const giveUp=h('button',{class:'btn small red tide-give-up',type:'button',title:'Space to give up (outside text fields)',onClick:()=>onGiveUp?onGiveUp():send({t:'stand'})},'Stand up · Give up');
 const damage=h('div',{class:'tide-damage-flash','aria-hidden':'true'});
 const bottom = h('div', { class: 'tide-bottom' }, h('div',{class:'turn-row'},timer), tools, form, note, startButton);
 const caption = h('div', { class: 'tide-caption' });
 const spray = h('div', { class: 'tide-screen-spray', 'aria-hidden': true });
 const credit=h('div',{class:'tide-shark-credit',hidden:true},h('a',{href:'https://poly.pizza/m/8Ke5qCnWxsZ',target:'_blank',rel:'noopener'},'Shark'), ' / ',h('a',{href:'https://poly.pizza/m/c307K4BlGr2',target:'_blank',rel:'noopener'},'Piranha'),' · Poly by Google · CC BY 3.0');
 const parachuteCredit=h('div',{class:'tide-shark-credit',hidden:true},h('a',{href:'https://poly.pizza/m/3Z7vJ96JIEB',target:'_blank',rel:'noopener'},'Parachute'),' · Poly by Google · CC BY 3.0');
 let watchingId=null, watchingMatch=null, watchingView='follow';
 const watchingName=h('strong',{},'Watching');
 const previous=h('button',{type:'button',class:'btn small blue','aria-label':'Watch previous player',onClick:()=>cycle(-1)},'←');
 const next=h('button',{type:'button',class:'btn small blue','aria-label':'Watch next player',onClick:()=>cycle(1)},'→');
 const perspective=h('button',{type:'button',class:'btn small yellow',onClick:()=>{watchingView=watchingView==='follow'?'overhead':'follow';refreshSpectator();}},'View: Follow');
 const spectator=h('div',{class:'tide-spectator',hidden:true},h('div',{class:'tide-watch-target'},previous,watchingName,next),perspective);
 function survivors(){return st?.match?.participants.filter(p=>p.alive&&st.players.get(p.id)?.connected!==false)||[];}
 function cycle(direction){const list=survivors();if(!list.length)return;const index=list.findIndex(p=>p.id===watchingId);watchingId=list[(Math.max(0,index)+direction+list.length)%list.length].id;refreshSpectator();}
 function refreshSpectator(){
  const m=st?.match, own=m?.participants.find(p=>p.id===st.you);
  spectator.hidden=!m?.tide||!!own?.alive||m.phase==='ended';
  if(spectator.hidden)return;
  if(watchingMatch!==m.matchId){watchingMatch=m.matchId;watchingId=null;watchingView='follow';}
  const list=survivors();if(!list.some(p=>p.id===watchingId))watchingId=list[0]?.id||null;
  watchingName.textContent=watchingId?`Watching ${st.players.get(watchingId)?.name||'Player'}`:'No survivors';
  previous.disabled=next.disabled=list.length<2;perspective.disabled=!watchingId;
  perspective.textContent=watchingView==='follow'?'View: Follow':'View: Overhead';
  onSpectate?.(watchingId,watchingView);
 }
 const el = h('div', { class: 'tide-hud', hidden: true }, top, bottom, caption, spray,credit,parachuteCredit,giveUp,damage,spectator);
 let st, key = '', pending = null, locked = null, raf = 0, lastSecond = null, observed=null, received=0, lastHearts=null, heartMatch=null;
 function frame() {
  raf = 0; if (el.hidden || !st) return;
  const m = st.match, remaining = Math.max(0, st.localPreview ? m.phaseEndsIn : st.deadline - performance.now());
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
  parachuteCredit.hidden=m?.phase!=='tideIntro'||m.skipIntro||remaining>TIDE.intro-TIDE_FLIGHT.deploy*1000;
  if (m?.phase === 'tideIntro' && !m.skipIntro) {
   const t = (TIDE.intro - remaining)/1000;
   setText(caption, t<3?'The ocean is pulling back…':t<5?'THE GROUND IS SHAKING!':t<TIDE_FLIGHT.deploy?'Here comes the tide!':t<TIDE_FLIGHT.tuck?'PARACHUTES OPEN!':'Coming in to land…');
   spray.style.opacity = t > 10 && t < 13 ? String(.55 * Math.max(0, 1 - Math.abs(t - 11.5)/1.5)) : '0';
  } else {
   spray.style.opacity = '0';
   const towers=Object.values(m?.tide?.towers||{}), age=w=>(w.ageMs+(st.localPreview?0:performance.now()-received))/1000;
   const own=m?.tide?.towers[st.you]?.wreck;
   const wreck=own&&age(own)>=0&&age(own)<WRECK.rescued?own:towers.map(t=>t.wreck).find(w=>w&&age(w)>=0&&age(w)<WRECK.gone);
   const stage=wreck&&wreckStage(age(wreck));
   caption.hidden=!wreck||stage==='complete';
   setText(caption,{shake:'HOLD ON!',break:'YOUR CHAIR SHATTERED!',fall:'INTO THE WATER!',swim:'SWIM FOR THE PLATFORM!',warningJump:'A FIN IN THE DISTANCE…',stalk:'IT’S COMING BACK…',breach:'SHARK!',grab:'CAUGHT!',drag:'DRAGGED AWAY…',sink:'DOWN INTO THE DEEP…',rescue:'ANOTHER HEART. ANOTHER CHANCE.'}[stage]||'');
  }
  credit.hidden=!Object.values(m?.tide?.towers||{}).some(t=>t.wreck&&(t.wreck.ageMs+(st.localPreview?0:performance.now()-received))/1000>=WRECK.water&&(t.wreck.ageMs+(st.localPreview?0:performance.now()-received))/1000<WRECK.swarmEnd);
  raf = requestAnimationFrame(frame);
 }
 form.addEventListener('submit', e => {
  e.preventDefault(); if (input.disabled || pending || !input.value.trim()) return;
  pending = crypto.randomUUID(); submit.disabled = true; form.classList.remove('answer-saved');
  send({ t: 'tideAnswer', matchId: st.match.matchId, round: st.match.round, requestId: pending, answer: input.value });
  sfx.submit();
 });
 function receipt(msg) {
  if (msg.matchId !== st?.match?.matchId || msg.round !== st?.match?.round) return;
  if (msg.requestId && msg.requestId !== pending) return;
  pending = null; locked = msg.locked || locked;
  submit.disabled = input.disabled;
  form.classList.toggle('invalid', !msg.ok);
  form.classList.toggle('answer-saved', !!msg.ok && !!locked);
  if (!msg.ok) replay(form, 'answer-bounce');
  if (msg.ok && locked) {submit.textContent='✓';submit.setAttribute('aria-label','Answer saved');replay(submit,'tide-saved-pop');}
  if (msg.requestId) (msg.ok ? sfx.pick : sfx.wrong)();
 }
 function update(state, on) {
  st = state; el.hidden = !on;
  if (!on) { if (raf) cancelAnimationFrame(raf); raf = 0; key = ''; pending = locked = null; return; }
  if(observed!==st.match){observed=st.match;received=performance.now();}
  const m = st.match, phase = m?.phase || 'lobby', part = m?.participants.find(p => p.id === st.you), active = !!m?.tide;
  const nextKey = `${m?.matchId}:${m?.round}:${phase}`;
  if (nextKey !== key) {
   key = nextKey; pending = null;submit.textContent='➜';submit.setAttribute('aria-label','Submit answer');
   if (phase === 'tideAnswer') { input.value = ''; locked = null; form.classList.remove('invalid', 'answer-saved'); if (part?.alive) { sfx.turn(); if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { if (!el.hidden && !input.disabled) input.focus({preventScroll:true}); }, 100); } }
   if (phase === 'tideReveal') sfx.correct();
   if (phase === 'tideFlood') sfx.tideWave();
   if (phase === 'tideResolve' && part && m.tide.towers[st.you]?.rescued) sfx.heart();
   if (phase === 'ended' && !m.cancelled) sfx.win();
  }
  const intro = phase === 'tideIntro' && !m.skipIntro; el.classList.toggle('cinematic', intro);el.classList.toggle('ending',phase==='ended');
  caption.hidden = !intro; bottom.hidden = intro;
  eyebrow.textContent = active && !intro ? `WORD TIDE   ·   ROUND ${m.round || 1} / ${TIDE.rounds}` : 'THE OCEAN IS RISING';
  title.hidden = active && !intro && phase !== 'ended';
  const winners = m?.tide?.winners || [];
  prompt.textContent = phase === 'tideAnswer' ? m.tide.category.prompt : phase === 'tideReveal' ? 'BUILD YOUR WAY UP!' : phase === 'tideFlood' ? 'INCOMING WAVE' : phase === 'tideResolve' ? part && !part.alive ? 'Swept away — watch the survivors' : m.tide.towers[st.you]?.shielded ? 'Your pet saved a heart. Rescued!' : m.tide.towers[st.you]?.rescued ? 'Heart lost. Keep going!' : 'Above water. Still in the game.' : phase === 'ended' ? m.cancelled ? 'The room owner ended the game.' : winners.length ? `${winners.map(id=>st.players.get(id)?.name||'Player').join(' & ')} ${winners.length>1?'share the win!':'survives!'}` : 'The ocean wins this time.' : 'Get ready…';
  meta.textContent = active && !intro ? `↑ Next wave: ${m.tide.rise} blocks${m.practice?' · Practice':''}` : '';
  timer.hidden = phase !== 'tideAnswer';
  const typing = phase === 'tideAnswer' && part?.alive;
  form.hidden = tools.hidden = !typing; input.disabled = submit.disabled = !typing;
  giveUp.hidden = !active || !part?.alive || phase==='ended' || st.localPreview;
  if (heartMatch !== m?.matchId) {heartMatch=m?.matchId;lastHearts=part?.hearts ?? null;}
  if (part && lastHearts!=null && part.hearts<lastHearts) {replay(damage,'tide-damage-active');sfx.heart();}
  lastHearts=part?.hearts ?? null;
  note.textContent = !active ? 'Everyone in the room joins the next wave.' : phase === 'tideAnswer' && !part?.alive ? 'Watching the survivors · You join the next game.' : phase === 'ended' ? 'The tide is taking its final bow…' : '';
  hint.disabled = !!st.hintPending || st.hintTurn === m?.turnId;
  hint.textContent = st.hintPending ? 'Finding answer…' : st.hintTurn === m?.turnId ? 'Answer purchased' : `Answer · ${TIDE.hintPrice}`;
  startButton.hidden = active || !(st.hostId === st.you || st.isAdmin);
  refreshSpectator();
  if (!raf) raf = requestAnimationFrame(frame);
 }
 input.addEventListener('input', () => {form.classList.remove('invalid', 'answer-saved');submit.textContent='➜';submit.setAttribute('aria-label','Submit answer');});
 return { el, update, receipt, answer(word, result) { input.value = word; if(result?.locked) {pending=null;receipt({...result,t:'tideAnswerResult',requestId:undefined});} else form.requestSubmit(); } };
}
