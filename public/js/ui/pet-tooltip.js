import { h } from './dom.js';
import { petAbilities } from './pet-abilities.js';

let tooltip, timer, owner;

export function hidePetTooltip() {
  clearTimeout(timer);
  timer = null;
  owner?.removeAttribute('aria-describedby');
  owner = null;
  tooltip?.remove();
  tooltip = null;
}

export function attachPetTooltip(element, pet) {
  const show = () => {
    if (!element.isConnected) return;
    hidePetTooltip();
    owner = element;
    tooltip = h('div', { id: 'pet-stat-tooltip', class: 'pet-stat-tooltip', role: 'tooltip' },
      h('strong', {}, pet.name), petAbilities(pet));
    document.body.append(tooltip);
    const rect = element.getBoundingClientRect(), width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    tooltip.style.top = `${rect.bottom + height + 12 < innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)}px`;
    element.setAttribute('aria-describedby', tooltip.id);
  };
  const schedule = () => { hidePetTooltip(); timer = setTimeout(show, 2000); };
  element.addEventListener('pointerenter', schedule);
  element.addEventListener('pointerleave', hidePetTooltip);
  element.addEventListener('pointercancel', hidePetTooltip);
  element.addEventListener('focus', schedule);
  element.addEventListener('blur', hidePetTooltip);
  element.addEventListener('click', hidePetTooltip);
}

window.addEventListener('scroll', hidePetTooltip, true);
window.addEventListener('keydown', event => { if (event.key === 'Escape') hidePetTooltip(); });
