// Panel host: one Roblox-style window at a time (colored frame, stroked title, big red ✕).
//
// A panel definition: { id, title, color: 'blue'|'orange'|..., icon: () => svg,
//                       mount(body) → { update?(), unmount?() } }

import { h } from './dom.js';
import { icons } from './icons.js';

export function createPanelHost(root) {
  let current = null;   // { def, instance, el }

  const layer = h('div', { class: 'panel-layer', hidden: true });
  root.append(layer);

  function close() {
    if (!current) return;
    current.instance.unmount?.();
    current.el.remove();
    current = null;
    layer.hidden = true;
  }

  function open(def) {
    if (current?.def.id === def.id) return close();
    close();
    const body = h('div', { class: 'panel-body scroll' });
    const el = h('div', { class: `panel panel-${def.id}`, style: { '--pc': `var(--${def.color})`, '--pc-hi': `var(--${def.color}-hi)`, '--pc-lo': `var(--${def.color}-lo)` }, role: 'dialog', 'aria-label': def.title },
      h('div', { class: 'panel-head' },
        h('span', { class: 'panel-icon' }, def.icon()),
        h('h2', { class: 'panel-title stroke' }, def.title)),
      h('button', { type: 'button', class: 'panel-close', 'aria-label': 'Close', onClick: close }, icons.close()),
      body);
    layer.replaceChildren(h('div', { class: 'panel-backdrop', 'data-pe': '', onClick: close }), el);
    layer.hidden = false;
    current = { def, el, instance: def.mount(body) || {} };
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) {
      e.preventDefault();
      close();
    }
  });

  return {
    open,
    close,
    /** Re-renders the dynamic parts of the open panel (after profile / room changes). */
    refresh() {
      current?.instance.update?.();
    },
    isOpen: (id) => current?.def.id === id,
  };
}
