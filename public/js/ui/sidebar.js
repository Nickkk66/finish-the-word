// Left-side square icon buttons (Invite, Chairs, Pets, Free, Profile, Settings), the bottom-left
// 🏆 wins / 💵 coins counters (animated count-up) and the invite popover.

import { h, fmt, replay, formatDuration } from './dom.js';
import { icons } from './icons.js';
import { profile, freeReadyIn } from '../profile.js';

function createCounter(emoji, cls, label) {
  const num = h('span', { class: 'counter-num' });
  const el = h('div', { class: `counter ${cls}`, title: label, 'aria-label': label }, h('span', { class: 'counter-icon', 'aria-hidden': 'true' }, emoji), num);
  let shown = null;
  let raf = 0;
  return {
    el,
    set(value) {
      if (shown === null) {
        shown = value;
        num.textContent = fmt(value);
        return;
      }
      if (value === shown) return;
      const from = shown;
      const t0 = performance.now();
      const dur = Math.min(1200, 350 + Math.abs(value - from) * 3);
      shown = value;
      if (value > from) replay(el, 'bump');
      cancelAnimationFrame(raf);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        num.textContent = fmt(from + (value - from) * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
  };
}

/** onInvite() copies the link; openPanel(id) with id in chairs|pets|free|profile|settings. */
export function createSidebar({ onInvite, openPanel, onView }) {
  const freeBadge = h('span', { class: 'side-badge', hidden: true });
  const defs = [
    ['invite', 'Invite', 'green', icons.invite, onInvite],
    ['chairs', 'Shop', 'orange', icons.chair, () => openPanel('chairs')],
    ['pets', 'Pets', 'purple', icons.paw, () => openPanel('pets')],
    ['cards', 'Cards', 'blue', icons.gift, () => openPanel('cards')],
    ['free', 'Free', 'pink', icons.gift, () => openPanel('free'), freeBadge],
    ['profile', 'Profile', 'blue', icons.face, () => openPanel('profile')],
    ['gameSettings', 'Game Settings', 'orange', icons.gear, () => openPanel('gameSettings')],
    ['settings', 'Settings', 'grey', icons.gear, () => openPanel('settings')],
  ];
  const buttons = Object.fromEntries(defs.map(([id, label, color, icon, onClick, badge]) => [id,
    h('button', { type: 'button', class: `side-btn ${color}`, 'aria-label': label, onClick },
      h('span', { class: 'side-face' }, icon()),
      h('span', { class: 'side-label stroke' }, label),
      badge || null)]));

  // ---- invite popover
  const popCode = h('div', { class: 'invite-pop-code' });
  const popMsg = h('div', { class: 'invite-pop-msg' });
  const popLink = h('div', { class: 'invite-pop-link' });
  const shareBtn = navigator.share ? h('button', { type: 'button', class: 'btn small green' }, 'Share') : null;
  const pop = h('div', { class: 'invite-pop', hidden: true, 'data-pe': '' },
    h('div', { class: 'invite-pop-title stroke' }, 'Invite friends!'),
    popCode, popMsg, popLink, shareBtn);
  let popTimer = 0;
  let shareUrl = '';
  shareBtn?.addEventListener('click', () => {
    navigator.share({ title: 'Finish The Word!', text: 'Join my Finish The Word! game!', url: shareUrl }).catch(() => {});
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !buttons.invite.contains(e.target)) pop.hidden = true;
  });

  const wins = createCounter('🏆', 'wins', 'Wins');
  const coins = createCounter('💵', 'coins', 'Coins');
  const view = h('button', { type: 'button', class: 'view-button', onClick: onView }, '1st Person (P)');
  buttons.gameSettings.hidden = true;

  const el = h('div', { class: 'sidebar' },
    h('nav', { class: 'side', 'aria-label': 'Menu' }, Object.values(buttons), pop),
    h('div', { class: 'counters' }, wins.el, coins.el), view);

  function updateFree() {
    const wait = freeReadyIn();
    freeBadge.hidden = false;
    freeBadge.classList.toggle('ready', wait === 0);
    freeBadge.textContent = wait === 0 ? '!' : formatDuration(wait);
  }
  setInterval(() => { if (!el.hidden) updateFree(); }, 1000);

  function update() {
    wins.set(profile.wins);
    coins.set(profile.coins);
    updateFree();
  }
  update();

  return {
    el,
    update,
    coinsEl: coins.el,
    setRole(allowed) { buttons.gameSettings.hidden = !allowed; },
    setView(on) { view.setAttribute('aria-pressed', String(on)); view.textContent = `${on ? '✓ ' : ''}1st Person (P)`; },
    showInvite({ code, link, copied }) {
      popCode.replaceChildren(...[...code].map((ch) => h('span', { class: 'mini-tile' }, ch)));
      popMsg.textContent = copied ? '✅ Link copied!' : 'Copy this link:';
      popMsg.classList.toggle('ok', copied);
      popLink.textContent = link;
      shareUrl = link;
      pop.hidden = false;
      replay(pop, 'pop');
      clearTimeout(popTimer);
      popTimer = setTimeout(() => { pop.hidden = true; }, 6000);
    },
  };
}
