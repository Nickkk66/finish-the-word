// Avatar editor: color swatches, hair style / face selectors, Random + Noob presets.

import { h } from './dom.js';
import {
  SKIN_COLORS, SHIRT_COLORS, PANTS_COLORS, HAIR_COLORS, HAIR_STYLES, FACES, NOOB_LOOK, randomLook, sanitizeLook,
} from '../shared/catalog.js';

const COLOR_ROWS = [
  ['Skin', 'skin', SKIN_COLORS],
  ['Shirt', 'shirt', SHIRT_COLORS],
  ['Pants', 'pants', PANTS_COLORS],
  ['Hair', 'hair', HAIR_COLORS],
];
const OPTION_ROWS = [
  ['Hair style', 'hairStyle', HAIR_STYLES],
  ['Face', 'face', FACES],
];

/** onChange(look) fires on every edit. */
export function createAvatarEditor({ look, onChange }) {
  let current = sanitizeLook(look);
  const controls = [];   // { key, value, el }

  // Color rows store the color itself; option rows store the index (look.hairStyle / look.face).
  function row(label, key, values, byIndex, makeButton) {
    const buttons = values.map((value, i) => {
      const stored = byIndex ? i : value;
      const el = makeButton(value);
      el.addEventListener('click', () => change({ [key]: stored }));
      controls.push({ key, value: stored, el });
      return el;
    });
    return h('div', { class: 'ae-row' }, h('div', { class: 'ae-label' }, label), h('div', { class: `ae-options ae-${key}` }, buttons));
  }

  const rows = [
    ...COLOR_ROWS.map(([label, key, colors]) => row(label, key, colors, false, (color) =>
      h('button', { type: 'button', class: 'swatch', style: { '--sw': color }, 'aria-label': `${label} color ${color}` }))),
    ...OPTION_ROWS.map(([label, key, names]) => row(label, key, names, true, (name) =>
      h('button', { type: 'button', class: 'seg-btn' }, name))),
  ];

  const presets = h('div', { class: 'ae-presets' },
    h('button', { type: 'button', class: 'btn small purple', onClick: () => change(randomLook()) }, '🎲 Random'),
    h('button', { type: 'button', class: 'btn small yellow', onClick: () => change(NOOB_LOOK) }, 'Noob'),
  );

  const el = h('div', { class: 'avatar-editor' }, rows, presets);

  function sync() {
    for (const c of controls) c.el.setAttribute('aria-pressed', String(current[c.key] === c.value));
  }

  function change(patch) {
    current = sanitizeLook({ ...current, ...patch });
    sync();
    onChange(current);
  }

  sync();
  return {
    el,
    set(next) {
      current = sanitizeLook(next);
      sync();
    },
  };
}
