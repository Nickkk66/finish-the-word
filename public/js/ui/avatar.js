// 2D blocky R6-style avatar preview (SVG) for the avatar editor and profile panel.

import { s } from './dom.js';
import { sanitizeLook } from '../shared/catalog.js';

const INK = '#1b1b1b';
const EDGE = { stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' };

// Hair shapes by HAIR_STYLES index: Bald, Bacon, Spiky, Long.
const HAIR = [
  null,
  'M47 34C44 14 56 5 71 5c15 0 25 9 23 27-3-5-7-8-12-9 1 5-1 9-5 11-2-6-8-10-15-10-5 1-10 4-15 10Z',
  'M47 33 45 13l8 5 2-14 8 9 7-12 6 11 8-9 3 12 9-5-2 23c-8-8-38-8-47 0Z',
  'M44 58c-3-28 3-51 27-51 23 0 30 23 26 51H87l1-27c-7-8-27-8-34 0l1 27Z',
];

function face(style) {
  const eyes = [
    s('ellipse', { cx: 62, cy: 28, rx: 2.8, ry: 4, fill: INK }),
    s('ellipse', { cx: 79, cy: 28, rx: 2.8, ry: 4, fill: INK }),
  ];
  const line = { fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' };
  switch (style) {
    case 1: // Grin
      return [
        ...eyes,
        s('path', { d: 'M59 36q11.5 14 23 0Z', fill: INK, 'stroke-linejoin': 'round', stroke: INK, 'stroke-width': 2 }),
        s('path', { d: 'M62 37h17l-2 3H64Z', fill: '#fff' }),
      ];
    case 2: // Cool (shades + smirk)
      return [
        s('path', { d: 'M54 24h14v6q-1 5-7 5t-7-5Zm19 0h14v6q-1 5-7 5t-7-5Zm-5 1h5', fill: INK, stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
        s('path', { d: 'M57 26h4M76 26h4', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
        s('path', { d: 'M63 41q9 3 16-3', ...line }),
      ];
    case 3: // Wow
      return [
        s('circle', { cx: 62, cy: 28, r: 4.2, fill: INK }),
        s('circle', { cx: 79, cy: 28, r: 4.2, fill: INK }),
        s('circle', { cx: 63.4, cy: 26.6, r: 1.3, fill: '#fff' }),
        s('circle', { cx: 80.4, cy: 26.6, r: 1.3, fill: '#fff' }),
        s('ellipse', { cx: 70.5, cy: 41, rx: 4, ry: 5, fill: INK }),
      ];
    default: // Smile
      return [...eyes, s('path', { d: 'M61 37q9.5 8 19 0', ...line })];
  }
}

function build(look) {
  const l = sanitizeLook(look);
  const hair = HAIR[l.hairStyle];
  return [
    s('ellipse', { cx: 70, cy: 177, rx: 46, ry: 6, fill: 'rgba(0,0,0,.18)' }),
    // legs
    s('rect', { x: 41, y: 112, width: 29, height: 60, rx: 3, fill: l.pants, ...EDGE }),
    s('rect', { x: 70, y: 112, width: 29, height: 60, rx: 3, fill: l.pants, ...EDGE }),
    // arms
    s('rect', { x: 12, y: 52, width: 29, height: 60, rx: 4, fill: l.skin, ...EDGE }),
    s('rect', { x: 99, y: 52, width: 29, height: 60, rx: 4, fill: l.skin, ...EDGE }),
    // torso
    s('rect', { x: 41, y: 52, width: 58, height: 60, rx: 3, fill: l.shirt, ...EDGE }),
    s('rect', { x: 45, y: 56, width: 50, height: 5, rx: 2.5, fill: '#fff', opacity: 0.25 }),
    // head
    s('rect', { x: 49, y: 11, width: 43, height: 41, rx: 13, fill: l.skin, ...EDGE }),
    s('rect', { x: 54, y: 14, width: 12, height: 5, rx: 2.5, fill: '#fff', opacity: 0.35 }),
    ...face(l.face),
    hair ? s('path', { d: hair, fill: l.hair, ...EDGE }) : null,
  ];
}

export function createAvatarPreview(look) {
  const el = s('svg', { viewBox: '0 0 140 186', class: 'avatar-preview', role: 'img', 'aria-label': 'Your avatar' });
  const set = (next) => el.replaceChildren(...build(next).filter(Boolean));
  set(look);
  return { el, set };
}
