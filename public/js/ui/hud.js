// In-match HUD: top status line (+ prompt letters, chain strip), bottom timer ring + mistake circles,
// the local player's hearts, and the turn controls (word input / letter picker).
//
// update(state) is called on every match / player change; a rAF loop animates the timer from state.deadline.

import { h, s, setText } from './dom.js';
import { icons } from './icons.js';
import { createWordInput, createLetterPicker } from './turnControls.js';
import { countdownPop } from './fx.js';
import { sfx } from '../audio.js';
import { MODES, HINT_PRICE } from '../shared/constants.js';
import { profile } from '../profile.js';

const TIMER_R = 42;
const TIMER_C = 2 * Math.PI * TIMER_R;
const URGENT_MS = 5000;
const CHAIN_SHOWN = 4;
const ACTIVE_PHASES = new Set(['choosing', 'typing', 'roundEnd']);

const FAIL_TEXT = {
  timeout: (n) => ['⏰ ', n, ' ran out of time!'],
  mistakes: (n) => ['❌ ', n, ' made too many mistakes!'],
  forfeit: (n) => [n, ' left the table!'],
  left: (n) => [n, ' disconnected!'],
};

/** Length of the letters `next` reused from the end of `word` (2, 1 or 0 when they don't link). */
function overlap(word, next) {
  if (word.length >= 2 && next.startsWith(word.slice(-2))) return 2;
  return next[0] === word[word.length - 1] ? 1 : 0;
}

export function createHud({ onSubmit, onTyping, onPick, onHint, onCards }) {
  // ---- top
  const statusText = h('span', { class: 'status-text stroke' });
  const statusTiles = h('span', { class: 'status-tiles' });
  const statusSub = h('div', { class: 'status-sub stroke', hidden: true });
  const chainEl = h('div', { class: 'chain', hidden: true });
  const badges = h('div', { class: 'match-badges stroke' });
  const top = h('div', { class: 'hud-top' }, badges, h('div', { class: 'status', role: 'status' }, statusText, statusTiles), statusSub, chainEl);

  // ---- bottom center
  const ring = s('circle', { class: 'timer-ring', cx: 50, cy: 50, r: TIMER_R, 'stroke-dasharray': TIMER_C.toFixed(2) });
  const timerNum = h('div', { class: 'timer-num' });
  const timer = h('div', { class: 'timer', hidden: true },
    s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' },
      s('circle', { class: 'timer-face', cx: 50, cy: 50, r: 47 }),
      s('circle', { class: 'timer-track', cx: 50, cy: 50, r: TIMER_R }),
      ring),
    timerNum);
  const mistakesEl = h('div', { class: 'mistakes', hidden: true });
  // Hearts live in the turn row: inline next to the timer on touch screens, pinned bottom-left with a mouse.
  const heartsEl = h('div', { class: 'hearts', hidden: true });
  const turnRow = h('div', { class: 'turn-row' }, heartsEl, timer, mistakesEl);
  const wordInput = createWordInput({ onSubmit, onTyping });
  const picker = createLetterPicker({ onPick });
  const hintButton = h('button', { type: 'button', class: 'btn small yellow', onClick: onHint }, `Hint · ${HINT_PRICE}`);
  const cardsButton = h('button', { type: 'button', class: 'btn small purple', onClick: onCards }, 'Use a card');
  const tools = h('div', { class: 'turn-tools', hidden: true }, hintButton, cardsButton);
  const hintAnswer = h('div', { class: 'hint-answer', hidden: true, role: 'status' });
  const combo = h('div', { class: 'combo-meter stroke', hidden: true });

  const el = h('div', { class: 'hud', hidden: true }, top, h('div', { class: 'hud-bottom' }, combo, turnRow, picker.el, hintAnswer, tools, wordInput.el));

  let st = null;           // latest app state
  let turnKey = '';
  let lastSecond = null;
  let statusKey = '';
  let tilesKey = '';
  let chainKey = '';
  let mistakesKey = '';
  let heartsKey = '';
  let shownHearts = null;
  let raf = 0;

  const nameOf = (id) => st.players.get(id)?.name ?? 'Someone';

  // ------------------------------------------------------------ status line
  function statusView(secondsLeft) {
    const m = st.match;
    const me = st.you;
    const phase = m ? m.phase : 'lobby';
    if (phase === 'lobby') {
      const seated = [...st.players.values()].filter((p) => p.seat >= 0).length;
      if ((st.players.get(me)?.seat ?? -1) < 0) return { parts: ['Sit at the table to play! (2+ players)'] };
      return { parts: [seated >= 2 ? 'Get ready...' : 'Waiting for another player to sit...'] };
    }
    if (phase === 'countdown') return { parts: [`Match starting in ${Math.max(1, secondsLeft)}`] };
    if (phase === 'choosing') {
      if (m.chooserId === me) return { parts: ['Choose a letter for ', { name: nameOf(nextTyper(m)) }, '!'] };
      return { parts: [{ name: nameOf(m.chooserId) }, ' is choosing a letter...'] };
    }
    if (phase === 'typing') {
      const tiles = m.prefix.toUpperCase();
      if (m.typerId === me) return { parts: ['Type a word starting with...'], tiles };
      return { parts: [{ name: nameOf(m.typerId) }, ' is typing...'], tiles, small: true };
    }
    if (phase === 'roundEnd') {
      const f = st.lastFail;
      if (!f) return { parts: ['Next round starting...'] };
      const name = { name: nameOf(f.id) };
      if (f.shielded) return { parts: ['🛡️ ', name, "'s pet blocked the hit!"] };
      return { parts: (FAIL_TEXT[f.cause] || FAIL_TEXT.timeout)(name) };
    }
    return { parts: m.winnerId ? ['🏆 ', { name: nameOf(m.winnerId) }, ' wins!'] : ['Match over!'] };
  }

  function nextTyper(m) {
    const order = m.participants;
    const start = order.findIndex((p) => p.id === m.chooserId);
    for (let k = 1; k <= order.length; k++) {
      const p = order[(start + k) % order.length];
      if (p.alive && p.id !== m.chooserId) return p.id;
    }
    return null;
  }

  function renderStatus(secondsLeft) {
    const view = statusView(secondsLeft);
    const key = JSON.stringify(view);
    if (key === statusKey) return;
    statusKey = key;
    statusText.replaceChildren(...view.parts.map((p) => (typeof p === 'string' ? p : h('span', { class: 'status-name' }, p.name))));
    const tiles = view.tiles || '';
    statusTiles.classList.toggle('small', !!view.small);
    if (tiles !== tilesKey) {
      tilesKey = tiles;
      statusTiles.replaceChildren(...[...tiles].map((ch, i) => h('span', { class: 'tile', style: { '--i': i } }, ch)));
    }
  }

  function renderSub(m, part) {
    let text = '';
    if (st.zone === 'obby' && m && ACTIVE_PHASES.has(m.phase)) text = 'Match starting — take the portal back to play next round!';
    else if (m && ACTIVE_PHASES.has(m.phase)) {
      if (part && !part.alive) text = "You're out! Cheer on the others 📣";
      else if (!part) text = (st.players.get(st.you)?.seat ?? -1) >= 0 ? "You'll play in the next match" : 'Sit at the table to join the next match';
    }
    statusSub.hidden = !text;
    setText(statusSub, text);
  }

  // ------------------------------------------------------------ chain strip
  function renderChain(m) {
    const inRound = st.roundStartCount == null ? Infinity : m.wordCount - st.roundStartCount;
    const show = (m.phase === 'typing' || m.phase === 'roundEnd') && m.chain.length > 0 && inRound > 0;
    if (!show) {
      chainEl.hidden = true;
      chainKey = '';
      return;
    }
    const words = m.chain.map((c) => c.word);
    const max = Math.min(CHAIN_SHOWN, inRound);
    let start = words.length - 1;
    while (start > 0 && words.length - start < max && overlap(words[start - 1], words[start]) > 0) start--;
    const shown = words.slice(start);
    const tail = m.phase === 'typing' ? m.prefix.length : 0;
    const key = `${shown.join(',')}|${tail}`;
    if (key === chainKey) return;
    const grew = chainKey.split('|')[0] !== shown.join(',');
    chainKey = key;
    chainEl.hidden = false;
    const nodes = [];
    shown.forEach((word, i) => {
      const hi = i < shown.length - 1 ? overlap(word, shown[i + 1]) : tail;
      const isNew = grew && i === shown.length - 1;
      if (i > 0) nodes.push(h('span', { class: 'chain-arrow' }, '→'));
      nodes.push(h('span', { class: `chain-word${isNew ? ' new' : ''}` },
        word.slice(0, word.length - hi).toUpperCase(),
        hi ? h('span', { class: 'hi' }, word.slice(-hi).toUpperCase()) : null));
    });
    chainEl.replaceChildren(...nodes);
  }

  // ------------------------------------------------------------ mistakes & hearts
  function renderMistakes(used, max) {
    const key = `${used}/${max}`;
    if (key === mistakesKey) return;
    const prevUsed = mistakesKey ? Number(mistakesKey.split('/')[0]) : 0;
    mistakesKey = key;
    mistakesEl.setAttribute('aria-label', `${max - used} of ${max} mistakes left`);
    const nodes = [];
    for (let i = 0; i < max; i++) {
      const usedIdx = max - 1 - i;   // used circles fill in from the right
      const isUsed = usedIdx < used;
      const fresh = isUsed && usedIdx >= prevUsed;
      nodes.push(h('div', { class: `mistake${isUsed ? ' used' : ''}${fresh ? ' fresh' : ''}` },
        s('svg', { viewBox: '0 0 28 28', 'aria-hidden': 'true' },
          s('path', { class: 'x-out', d: 'M9 9l10 10M19 9L9 19' }),
          s('path', { class: 'x-in', d: 'M9 9l10 10M19 9L9 19' }),
          s('path', { class: 'crack', d: 'M14 1l-3 7 5 4-4 6 3 4-2 5' }))));
    }
    mistakesEl.replaceChildren(...nodes);
  }

  function renderHearts(part) {
    const key = part ? `${part.hearts}/${part.maxHearts}/${part.alive}` : '';
    if (key === heartsKey) return;
    heartsKey = key;
    heartsEl.hidden = !part;
    if (!part) {
      shownHearts = null;
      return;
    }
    const lostNow = shownHearts != null && part.hearts < shownHearts;
    const nodes = [];
    for (let i = 0; i < part.maxHearts; i++) {
      const lost = i >= part.hearts;
      const breaking = lostNow && lost && i < shownHearts;
      nodes.push(h('span', { class: `heart${lost ? ' lost' : ''}${breaking ? ' breaking' : ''}` }, icons.heart()));
    }
    if (!part.alive) nodes.push(h('span', { class: 'out-tag stroke' }, 'OUT'));
    heartsEl.replaceChildren(...nodes);
    shownHearts = part.hearts;
  }

  // ------------------------------------------------------------ timer loop
  function isMyClock(m) {
    return (m.phase === 'typing' && m.typerId === st.you) || (m.phase === 'choosing' && m.chooserId === st.you);
  }

  function onSecond(m, secondsLeft) {
    if (m.phase === 'countdown') {
      renderStatus(secondsLeft);
      if (secondsLeft >= 1 && secondsLeft <= 3) {
        countdownPop(secondsLeft);
        sfx.countdown();
      }
    } else if (isMyClock(m) && secondsLeft >= 1 && secondsLeft <= 5) {
      sfx.tick(secondsLeft === 1);
      if (secondsLeft <= 3) sfx.heartbeat();
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const m = st?.match;
    if (!m) return;
    const remaining = Math.max(0, st.deadline - performance.now());
    if (m.phase === 'typing' || m.phase === 'choosing') {
      const total = m.phaseDuration || m.phaseEndsIn || 1;
      ring.style.strokeDashoffset = (TIMER_C * (1 - Math.min(1, remaining / total))).toFixed(1);
      setText(timerNum, (Math.floor(remaining / 100) / 10).toFixed(1));
      timer.classList.toggle('urgent', remaining < URGENT_MS);
    }
    const secondsLeft = Math.ceil(remaining / 1000);
    if (secondsLeft !== lastSecond) {
      lastSecond = secondsLeft;
      onSecond(m, secondsLeft);
    }
  }

  // ------------------------------------------------------------ public
  function update(state) {
    st = state;
    const m = st.match;
    const phase = m ? m.phase : 'lobby';
    const part = m && m.participants.find((p) => p.id === st.you);
    const key = m ? `${phase}|${m.turnId}|${m.round}|${m.typerId}|${m.chooserId}|${m.wordCount}` : 'lobby';
    if (key !== turnKey) {
      turnKey = key;
      // Seed with the current second so a phase change never fires a stale tick / countdown pop.
      lastSecond = m?.phaseEndsIn != null ? Math.ceil(Math.max(0, st.deadline - performance.now()) / 1000) : null;
    }

    renderStatus(m?.phase === 'countdown' ? lastSecond : null);
    renderSub(m, part);
    badges.textContent = `${st.public ? 'Public' : 'Private'} · ${MODES.find((v) => v.id === (m?.mode || st.settings.mode))?.name || 'Classic'}${m?.minLength > 3 ? ` · ${m.minLength}+ letters` : ''}${m?.wordCount ? ` · Chain ${m.wordCount}` : ''}`;
    const comboCount = m?.participants.find((p) => p.id === (m.typerId || st.you))?.combo || 0;
    combo.hidden = comboCount < 3;
    const multiplier = comboCount >= 8 ? 3 : comboCount >= 5 ? 2 : 1.5;
    const comboText = `${multiplier}× COMBO · ${comboCount} fast words`;
    if (combo.textContent !== comboText) { combo.textContent = comboText; combo.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 220 }); }
    const myTyping = phase === 'typing' && m.typerId === st.you && part?.alive;
    tools.hidden = !myTyping;
    hintButton.disabled = !!st.hintPending || st.hintTurn === m?.turnId || profile.coins < HINT_PRICE;
    hintButton.textContent = st.hintPending ? 'Finding hint…' : st.hintTurn === m?.turnId ? 'Hint purchased' : `Hint · ${HINT_PRICE}`;
    cardsButton.disabled = !!st.cardPending || st.cardUsedTurn === m?.turnId || !Object.values(profile.cards).some((n) => n > 0);
    hintAnswer.hidden = !myTyping || !st.hintWord;
    hintAnswer.textContent = st.hintWord ? `Your hint: ${st.hintWord.toUpperCase()}` : '';

    timer.hidden = !(phase === 'typing' || phase === 'choosing');
    mistakesEl.hidden = phase !== 'typing';
    if (phase === 'typing') renderMistakes(m.mistakes, m.maxMistakes);
    else mistakesKey = '';

    renderHearts(part && (ACTIVE_PHASES.has(phase) || phase === 'ended') ? part : null);
    if (m) renderChain(m);
    else chainEl.hidden = true;

    if (phase === 'typing' && m.typerId === st.you && part?.alive) wordInput.open(m.prefix, key);
    else wordInput.close();
    if (phase === 'choosing' && m.chooserId === st.you && m.options?.length) picker.open(m.options, key);
    else picker.close();
    el.classList.toggle('my-turn', phase === 'typing' && m.typerId === st.you);
  }

  return {
    el,
    update,
    wordResult: (ok) => wordInput.result(ok),
    show() {
      el.hidden = false;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    hide() {
      el.hidden = true;
      cancelAnimationFrame(raf);
      raf = 0;
      wordInput.close();
      picker.close();
    },
  };
}
