// Transient screen effects: toasts, big banners, countdown numbers, DOM confetti, reward pops.

import { h } from './dom.js';

const CONFETTI_COLORS = ['#ff5a5f', '#ffd43b', '#45b1ff', '#3ddc54', '#c38cff', '#ff9f40', '#ffffff'];

let layer = null;
let toastBox = null;
let bannerEl = null;
let bannerTimer = 0;

export function initFx(root) {
  toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  layer = h('div', { class: 'fx-layer' }, toastBox);
  root.append(layer);
}

function removeLater(el, ms) {
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  }, ms);
}

/** Small pill message under the status line. tone: 'info' | 'good' | 'bad'. */
export function toast(text, tone = 'info', ms = 2200) {
  const el = h('div', { class: `toast ${tone}` }, text);
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
  removeLater(el, ms);
}

/** Big centered banner (one at a time). tone: 'info' | 'good' | 'bad' | 'win'. */
export function banner(title, { sub = null, tone = 'info', ms = 2600 } = {}) {
  if (bannerEl) bannerEl.remove();
  clearTimeout(bannerTimer);
  const el = h('div', { class: `banner ${tone}` },
    h('div', { class: 'banner-title' }, title),
    sub ? h('div', { class: 'banner-sub' }, sub) : null);
  bannerEl = el;
  layer.append(el);
  bannerTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
    if (bannerEl === el) bannerEl = null;
  }, ms);
}

/** Huge "3", "2", "1", "GO!" in the middle of the screen. */
export function countdownPop(text) {
  const el = h('div', { class: 'count-pop' }, String(text));
  layer.append(el);
  setTimeout(() => el.remove(), 950);
}

export function confetti(count = 150) {
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const w = 7 + Math.random() * 8;
    box.append(h('i', {
      style: {
        left: `${Math.random() * 100}%`,
        width: `${w.toFixed(1)}px`,
        height: `${(w * (0.4 + Math.random() * 0.8)).toFixed(1)}px`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        '--dx': `${Math.round((Math.random() - 0.5) * 260)}px`,
        '--rot': `${Math.round((Math.random() - 0.5) * 1600)}deg`,
        'animation-duration': `${(2.4 + Math.random() * 1.8).toFixed(2)}s`,
        'animation-delay': `${(Math.random() * 0.7).toFixed(2)}s`,
      },
    }));
  }
  layer.append(box);
  setTimeout(() => box.remove(), 5500);
}

/** "+120 💵" floating up from an element (e.g. the coins counter). */
export function rewardPop(text, anchor) {
  const r = anchor && anchor.getClientRects().length ? anchor.getBoundingClientRect() : null;
  const el = h('div', {
    class: 'reward-pop',
    style: r ? { left: `${Math.round(r.left + r.width / 2)}px`, top: `${Math.round(r.top)}px` } : { left: '50%', top: '45%' },
  }, text);
  layer.append(el);
  setTimeout(() => el.remove(), 1900);
}
