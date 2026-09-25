// Free coins: claim +FREE_COINS every FREE_COOLDOWN_MS, with a live countdown.

import { h, formatDuration } from '../dom.js';
import { icons } from '../icons.js';
import { FREE_COINS, FREE_COOLDOWN_MS, freeReadyIn } from '../../profile.js';

/** actions.claimFree(anchorEl) */
export function freePanel({ actions }) {
  return {
    id: 'free',
    title: 'Free Coins',
    color: 'pink',
    icon: icons.gift,
    mount(body) {
      const btn = h('button', { type: 'button', class: 'btn big green', onClick: () => actions.claimFree(btn) });
      body.append(h('div', { class: 'free-wrap' },
        h('div', { class: 'free-gift' }, icons.gift()),
        h('div', { class: 'free-amount stroke' }, `+${FREE_COINS} 💵`),
        h('p', { class: 'free-text' }, `Come back every ${FREE_COOLDOWN_MS / 60000} minutes for more free coins!`),
        btn));

      function update() {
        const wait = freeReadyIn();
        btn.disabled = wait > 0;
        btn.textContent = wait > 0 ? `Next in ${formatDuration(wait)}` : 'Claim!';
        btn.classList.toggle('pulse', wait === 0);
      }
      const timer = setInterval(update, 1000);
      update();
      return { update, unmount: () => clearInterval(timer) };
    },
  };
}
