// The tilted, bubbly "Finish The Word!" logo with the "DOG → GREY → Y.." chain underneath.

import { h } from './dom.js';

function letters(text, colors, offset) {
  return [...text].map((ch, i) => h('span', {
    class: 'll',
    style: { '--c': colors[i % colors.length], '--i': offset + i, '--r': `${((i * 37) % 9) - 4}deg` },
  }, ch));
}

function chainWord(plain, green) {
  return h('span', { class: 'lc' }, plain, h('span', { class: 'lc-hi' }, green));
}

export function createLogo() {
  return h('div', { class: 'logo', role: 'img', 'aria-label': 'Finish The Word!' },
    h('div', { class: 'logo-top', 'aria-hidden': 'true' },
      h('span', { class: 'lw' }, letters('FINISH', ['#ffd43b'], 0)),
      h('span', { class: 'lw' }, letters('THE', ['#ffffff'], 6)),
    ),
    h('div', { class: 'logo-main', 'aria-hidden': 'true' },
      letters('WORD!', ['#ff5a5f', '#ffb627', '#45b1ff', '#3ddc54', '#ffffff'], 9)),
    h('div', { class: 'logo-chain', 'aria-hidden': 'true' },
      chainWord('DO', 'G'), h('span', { class: 'lc-arrow' }, '→'),
      chainWord('GRE', 'Y'), h('span', { class: 'lc-arrow' }, '→'),
      h('span', { class: 'lc' }, h('span', { class: 'lc-hi' }, 'Y'), '..'),
    ),
  );
}
