// Lucky block hatch overlay: block drops in → shakes harder and harder → burst → pet card with rarity glow.

import { h } from './dom.js';
import { sfx } from '../audio.js';
import { PETS_BY_ID, RARITIES, abilityText } from '../shared/catalog.js';

const SHAKES = [500, 1000, 1450];   // ms timeline of the three shakes
const REVEAL_AT = 1950;

/** count = how many of this pet you own now; onEquip() equips it. */
export function playHatch(root, { block, petId, count, onEquip }) {
  const pet = PETS_BY_ID[petId];
  const rarity = RARITIES[pet.rarity];
  const timers = [];
  let revealed = false;

  const blockEl = h('div', { class: 'hatch-block', style: { '--bc': block.color } }, h('span', { class: 'hatch-q' }, '?'));
  const equipBtn = h('button', { type: 'button', class: 'btn green', onClick: () => { onEquip(); close(); } }, 'Equip');
  const okBtn = h('button', { type: 'button', class: 'btn blue', onClick: () => close() }, 'Nice!');
  const card = h('div', { class: 'hatch-card', hidden: true },
    h('div', { class: 'hatch-badge stroke' }, count > 1 ? `×${count}` : 'NEW!'),
    h('div', { class: 'hatch-emoji', 'aria-hidden': 'true' }, pet.emoji),
    h('div', { class: 'hatch-name stroke' }, pet.name),
    h('span', { class: 'pill', style: { '--pc': rarity.color } }, pet.rarity),
    h('p', { class: 'hatch-ability' }, abilityText(pet.ability)),
    h('div', { class: 'overlay-buttons' }, equipBtn, okBtn));
  const el = h('div', { class: 'overlay hatch', style: { '--rc': rarity.color }, role: 'dialog', 'aria-label': `You hatched ${pet.name}!` },
    h('div', { class: 'hatch-title stroke' }, `Opening ${block.name}...`),
    h('div', { class: 'hatch-stage' }, h('div', { class: 'hatch-rays', 'aria-hidden': 'true' }), blockEl, card));
  const title = el.firstElementChild;

  function reveal() {
    if (revealed) return;
    revealed = true;
    timers.forEach(clearTimeout);
    blockEl.remove();
    el.classList.add('revealed');
    title.textContent = pet.rarity === 'Legendary' ? 'LEGENDARY!!' : 'You hatched...';
    card.hidden = false;
    sfx.hatch();
    equipBtn.focus({ preventScroll: true });
  }

  // Enter / Space / Esc skip to the reveal; afterwards Esc closes (Enter / Space press the focused button).
  function onKey(e) {
    const skip = !revealed && ['Enter', ' ', 'Escape'].includes(e.key);
    if (!skip && !(revealed && e.key === 'Escape')) return;
    e.preventDefault();
    e.stopPropagation();
    if (skip) reveal();
    else close();
  }

  function close() {
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey, true);
    el.remove();
  }

  SHAKES.forEach((ms, i) => timers.push(setTimeout(() => {
    blockEl.className = `hatch-block shake${i + 1}`;
    sfx.thud();
  }, ms)));
  timers.push(setTimeout(reveal, REVEAL_AT));
  el.addEventListener('click', () => { if (!revealed) reveal(); });
  document.addEventListener('keydown', onKey, true);
  root.append(el);
}
