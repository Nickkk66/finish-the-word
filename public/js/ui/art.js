import { h, s } from './dom.js';

/** A model thumbnail, intentionally no emoji placeholder. */
export function modelArt(actions, kind, id, name, size = 160) {
  const img = h('img', { class: 'model-thumb', alt: name, width: size, height: size });
  actions.thumbnail(kind, id, size).then((url) => { img.src = url; }).catch(() => { img.alt = name; });
  return img;
}

/** Small vector card illustrations remain sharp on mobile. */
export function cardArt(card) {
  const effect = typeof card.effect === 'string' ? card.effect : card.effect?.type;
  const symbol = effect === 'skip' ? 'M26 25L46 40 26 55Z M50 25V55' :
    effect === 'heart' ? 'M40 60L20 40C7 20 33 13 40 28C47 13 73 20 60 40Z M42 23L33 40 45 44 37 58' :
    effect === 'mistakes' ? 'M25 25L55 55M55 25L25 55' :
    'M40 20V40L52 47M28 12H52M58 19L65 26';
  return s('svg', { class: 'card-art', viewBox: '0 0 80 100', role: 'img', 'aria-label': card.name },
    s('rect', { x: 4, y: 3, width: 72, height: 94, rx: 10, fill: card.color || '#7d5ce0', stroke: '#202538', 'stroke-width': 4 }),
    s('circle', { cx: 40, cy: 40, r: 26, fill: '#ffffff22', stroke: '#ffffff99', 'stroke-width': 2 }),
    s('path', { d: symbol, stroke: '#fff', fill: effect === 'skip' ? '#fff' : 'none', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('path', { d: 'M19 77H61M26 85H54', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' }));
}

export function oddsText(weight, total) {
  const percent = weight * 100 / total;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(4))}%`;
}
