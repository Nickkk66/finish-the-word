// Chunky "sticker" SVG icons: white shapes with a dark outline (stroke painted under the fill).

import { s } from './dom.js';

const INK = '#1b1b1b';
const OUTLINE = { stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'paint-order': 'stroke' };

function icon(cls, ...children) {
  return s('svg', { viewBox: '0 0 48 48', class: `icon ${cls}`, 'aria-hidden': 'true', focusable: 'false' }, ...children);
}

function shape(tag, attrs, fill = '#fff') {
  return s(tag, { ...OUTLINE, fill, ...attrs });
}

function gearPath(cx, cy, rOuter, rInner, teeth, rHole) {
  const step = (Math.PI * 2) / teeth;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    pts.push([a - step * 0.3, rInner], [a - step * 0.17, rOuter], [a + step * 0.17, rOuter], [a + step * 0.3, rInner]);
  }
  const ring = pts.map(([a, r], i) => `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`).join('');
  const hole = `M${cx + rHole} ${cy}A${rHole} ${rHole} 0 1 0 ${cx - rHole} ${cy}A${rHole} ${rHole} 0 1 0 ${cx + rHole} ${cy}Z`;
  return `${ring}Z${hole}`;
}

const HEART_PATH = 'M24 43C11 34 4 26 4 16.5 4 9.5 9.2 5 15 5c4 0 7.2 2.2 9 5.4C25.8 7.2 29 5 33 5c5.8 0 11 4.5 11 11.5C44 26 37 34 24 43Z';

export const icons = {
  invite: () => icon('i-invite',
    shape('circle', { cx: 17, cy: 15, r: 8 }),
    shape('path', { d: 'M3 40c0-8.5 6.3-14 14-14s14 5.5 14 14Z' }),
    shape('path', { d: 'M36 16h6v5h5v6h-5v5h-6v-5h-5v-6h5Z' }, '#7ef08d'),
  ),
  chair: () => icon('i-chair',
    shape('path', { d: 'M11 5h8v19h18v19h-7V32H19v11h-8Z' }),
  ),
  paw: () => icon('i-paw',
    shape('ellipse', { cx: 24, cy: 33, rx: 11, ry: 9 }),
    shape('ellipse', { cx: 10, cy: 21, rx: 4.5, ry: 6, transform: 'rotate(-20 10 21)' }),
    shape('ellipse', { cx: 19, cy: 11.5, rx: 5, ry: 6.5 }),
    shape('ellipse', { cx: 29, cy: 11.5, rx: 5, ry: 6.5 }),
    shape('ellipse', { cx: 38, cy: 21, rx: 4.5, ry: 6, transform: 'rotate(20 38 21)' }),
  ),
  gift: () => icon('i-gift',
    shape('path', { d: 'M24 14c-4-9-14-9-12-2 1 2 5 2 12 2Zm0 0c4-9 14-9 12-2-1 2-5 2-12 2Z' }, '#ff5ca8'),
    shape('rect', { x: 8, y: 22, width: 32, height: 21, rx: 3 }),
    shape('rect', { x: 5, y: 14, width: 38, height: 9, rx: 3 }),
    shape('rect', { x: 21, y: 14, width: 6, height: 29 }, '#ff5ca8'),
  ),
  gear: () => icon('i-gear',
    shape('path', { d: gearPath(24, 24, 20, 14.5, 8, 6), 'fill-rule': 'evenodd' }),
  ),
  face: () => icon('i-face',
    shape('rect', { x: 7, y: 7, width: 34, height: 33, rx: 10 }, '#f5cd30'),
    s('ellipse', { cx: 18, cy: 20, rx: 2.8, ry: 4, fill: INK }),
    s('ellipse', { cx: 30, cy: 20, rx: 2.8, ry: 4, fill: INK }),
    s('path', { d: 'M16 28q8 7 16 0', fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }),
  ),
  heart: () => icon('i-heart',
    shape('path', { d: HEART_PATH }, 'currentColor'),
    s('ellipse', { class: 'shine', cx: 13.5, cy: 14.5, rx: 4.2, ry: 2.6, transform: 'rotate(-38 13.5 14.5)', fill: '#fff', opacity: 0.75 }),
  ),
  close: () => icon('i-close',
    shape('path', { d: 'M13 9l11 11 11-11 4 4-11 11 11 11-4 4-11-11-11 11-4-4 11-11L9 13Z' }),
  ),
  sound: (on) => icon('i-sound',
    shape('path', { d: 'M6 18h8l10-9v30l-10-9H6Z' }),
    outlinedLine(on ? 'M31 17q5 7 0 14M37 12q9 12 0 24' : 'M31 18l11 12M42 18L31 30', on ? '#fff' : '#ff3b4a'),
  ),
};

/** A thick colored line with a dark outline (two stacked strokes). */
function outlinedLine(d, color) {
  const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  return [
    s('path', { ...line, stroke: INK, 'stroke-width': 9 }),
    s('path', { ...line, stroke: color, 'stroke-width': 4 }),
  ];
}
