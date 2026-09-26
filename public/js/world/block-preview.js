import { PETS_BY_ID, CARDS_BY_ID } from '../shared/catalog.js';
import { Label } from './labels.js';
import { cardArt } from '../ui/art.js';

export class BlockPreview extends Label {
  constructor(labels, thumbnails) {
    super(labels, 'w-odds', { maxDist: 40, minScale: 1, maxScale: 1, centered: true });
    this.thumbnails = thumbnails;
    this.visible = false;
    this.besideAnchor = true;
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
    // Project the block itself, then place the panel beside it in screen space.
    this.anchor.set(spot.x, spot.promptY + 1.4, spot.z);
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
        this.thumbnails.render('pet', id, 192).then(url => { img.src = url; }).catch(() => {});
      } else {
        const art = cardArt(item);
        art.classList.add('w-odds-card-art');
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
