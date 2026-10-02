import { h, s } from './dom.js';
import { PRESENCE_REPLY_MS } from '../shared/presence.js';

export function createPresenceCheck({ net, inRoom }) {
  let overlay = null, card, button, clock, ring, token = null, deadline = 0, frame = 0, moveTimer = 0, lastActivity = -Infinity, previousFocus;
  const circumference = 2 * Math.PI * 42;
  function move() {
    if (!card) return;
    const margin = 12, width = card.offsetWidth, height = card.offsetHeight;
    const x = margin + Math.random() * Math.max(0, innerWidth - width - margin * 2);
    const y = margin + Math.random() * Math.max(0, innerHeight - height - margin * 2);
    card.style.left = `${x}px`; card.style.top = `${y}px`;
  }
  function hide() {
    cancelAnimationFrame(frame); clearInterval(moveTimer);
    overlay?.remove(); overlay = card = null; token = null;
    previousFocus?.focus?.({ preventScroll: true }); previousFocus = null;
  }
  function tick() {
    if (!overlay) return;
    const left = Math.max(0, deadline - performance.now());
    clock.textContent = `${Math.ceil(left / 1000)}s`;
    ring.style.strokeDashoffset = String(circumference * (1 - left / PRESENCE_REPLY_MS));
    card.classList.toggle('urgent', left <= 10000);
    if (left <= 0) button.disabled = true;
    frame = requestAnimationFrame(tick);
  }
  function show(msg) {
    hide(); token = msg.token; deadline = performance.now() + msg.remainingMs;
    ring = s('circle', { class: 'timer-ring', cx: 50, cy: 50, r: 42, 'stroke-dasharray': circumference });
    clock = h('div', { class: 'timer-num' });
    button = h('button', { type: 'button', class: 'btn green presence-confirm', onClick: event => {
      if (!event.isTrusted || performance.now() >= deadline || button.disabled) return;
      if (net.send({ t: 'presenceReply', token })) button.disabled = true;
    } }, "I'm here!");
    card = h('div', { class: 'presence-card', tabindex: -1, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'presence-title', 'aria-describedby': 'presence-message' },
      h('h2', { id: 'presence-title', class: 'stroke' }, 'Still there?'),
      h('p', { id: 'presence-message' }, 'Tap below within 30 seconds to stay in the game.'),
      h('div', { class: 'timer presence-clock', role: 'timer', 'aria-label': 'Time left to respond' },
        s('svg', { viewBox: '0 0 100 100', 'aria-hidden': true }, s('circle', { class: 'timer-track', cx: 50, cy: 50, r: 42 }), ring), clock), button);
    overlay = h('div', { class: 'presence-overlay' }, card);
    overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Tab') { event.preventDefault(); button.focus({ preventScroll: true }); }
    });
    previousFocus = document.activeElement;
    document.body.append(overlay); card.focus({ preventScroll: true }); move(); tick(); moveTimer = setInterval(move, 6000);
  }
  function activity(event) {
    if (!event.isTrusted || !inRoom() || overlay || performance.now() - lastActivity < 1000) return;
    if (event.type === 'pointermove' && !event.buttons) return;
    if (event.type === 'pointerdown' && !event.target.closest('button, a, input, select, textarea, [role="button"], .joystick')) return;
    if (net.send({ t: 'activity' })) lastActivity = performance.now();
  }
  for (const name of ['pointerdown', 'pointermove', 'keydown', 'input', 'wheel']) document.addEventListener(name, activity, { capture: true, passive: true });
  window.addEventListener('resize', move);
  net.on('presenceCheck', show);
  net.on('presencePaused',msg=>{if(msg.token===token)hide();});
  net.on('presenceCleared', msg => { if (msg.token === token) hide(); });
  return { hide };
}
