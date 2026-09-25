import { PETS_BY_ID, CARDS_BY_ID } from '../shared/catalog.js';
import { Label } from './labels.js';

export class BlockPreview extends Label {
  constructor(labels, thumbnails) {
    super(labels, 'w-odds', { maxDist: 40, minScale: 0.75, maxScale: 1, scaleRef: 18 });
    this.thumbnails = thumbnails;
    this.visible = false;
    this.clampToViewport = true;
    this.owned = new Set();
    this.boxId = null;
    this.images = [];
  }
  setCollection(ids) {
    this.owned = new Set(ids ?? []);
    for (const { img, id } of this.images) img.classList.toggle('w-unknown', !this.owned.has(id));
  }
  showBox(def, spot, cards = false) {
    this.visible = true;
    // Anchored above the model, leaving its interaction prompt below.
    this.anchor.set(spot.x + 3.6, spot.promptY + 5.2, spot.z);
    if (this.boxId === def.id) return;
    this.boxId = def.id;
    this.images = [];
    const title = document.createElement('div'); title.className = 'w-odds-title'; title.textContent = def.name;
    const grid = document.createElement('div'); grid.className = 'w-odds-grid';
    const weights = Object.entries(def.odds);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [id, weight] of weights) {
      const item = (cards ? CARDS_BY_ID : PETS_BY_ID)[id];
      const cell = document.createElement('div'); cell.className = 'w-odds-cell';
      if (!cards) {
        const img = document.createElement('img'); img.alt = item.name; img.classList.toggle('w-unknown', !this.owned.has(id));
        this.images.push({ img, id }); cell.append(img);
        this.thumbnails.render('pet', id, 128).then(url => { img.src = url; }).catch(() => {});
      } else {
        const art = document.createElement('span');
        art.textContent = ({ skip: '»', time_tax: '−2s', pressure: '!', heart: '♥' })[id] ?? '✦';
        art.style.cssText = `font-size:26px;display:grid;place-items:center;width:38px;height:48px;background:${item.color ?? '#c6afff'};color:#172035;border:2px solid white;border-radius:6px;transform:rotate(-6deg)`;
        cell.append(art);
      }
      const name = document.createElement('span'); name.textContent = item.name;
      const percent = document.createElement('strong');
      // Catalog weights use exact finite decimals. Non-terminating odds show an exact fraction.
      const probability = weight * 100 / total;
      percent.textContent = Number.isInteger(probability * 1000) ? `${probability}%` : `${weight}/${total}`;
      cell.append(name, percent); grid.append(cell);
    }
    const caption = document.createElement('div'); caption.className = 'w-odds-caption';
    caption.textContent = cards ? 'One card per box · separate from pets' : 'Collect a pet to reveal its colors';
    this.el.replaceChildren(title, grid, caption);
  }
}
