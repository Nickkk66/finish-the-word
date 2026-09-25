// DOM labels projected from world-space anchors every frame: per-player stacks (name tag,
// hearts / OUT, turn arrow, letter tile, speech bubble, chat bubbles), shop / lucky-block
// signs and the single interaction prompt. Only the prompt accepts pointer events.

import * as THREE from 'three';
import { ensureWorldStyles } from './styles.js';
import { clamp } from './math.js';

const _v = new THREE.Vector3();
const CHAT_MS = 6000;
const MAX_CHATS = 3;

function div(className, text) {
  const el = document.createElement('div');
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function show(el, on) {
  el.style.display = on ? '' : 'none';
}
/** Restarts a CSS animation class on `el`. */
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow so the animation starts over
  el.classList.add(cls);
}

/** Owns the label layer element and projects every label each frame. */
export class LabelLayer {
  constructor(layerEl, canvas) {
    ensureWorldStyles();
    this.el = layerEl;
    this.canvas = canvas;
    this.labels = new Set();
    this.offsetX = 0;
    this.offsetY = 0;
    layerEl.classList.add('w-layer');
    if (getComputedStyle(layerEl).position === 'static') {
      Object.assign(layerEl.style, { position: 'fixed', inset: '0' });
    }
  }

  add(label) {
    this.labels.add(label);
    this.el.appendChild(label.el);
  }

  remove(label) {
    this.labels.delete(label);
    label.el.remove();
  }

  setVisible(on) {
    this.el.classList.toggle('w-hidden', !on);
  }

  /** Re-reads where the canvas sits relative to the label layer (call on resize). */
  measure() {
    const a = this.canvas.getBoundingClientRect();
    const b = this.el.getBoundingClientRect();
    this.offsetX = a.left - b.left;
    this.offsetY = a.top - b.top;
  }

  update(camera, width, height) {
    for (const l of this.labels) {
      let visible = l.visible;
      if (visible) {
        _v.copy(l.anchor).applyMatrix4(camera.matrixWorldInverse);
        const depth = -_v.z;
        if (depth < 1 || depth > l.maxDist) {
          visible = false;
        } else {
          _v.applyMatrix4(camera.projectionMatrix);
          if (_v.x < -1.25 || _v.x > 1.25 || _v.y < -1.3 || _v.y > 1.45) {
            visible = false;
          } else {
            let x = (_v.x * 0.5 + 0.5) * width + this.offsetX;
            let y = (0.5 - _v.y * 0.5) * height + this.offsetY;
            const s = clamp(l.scaleRef / depth, l.minScale, l.maxScale);
            if (l.viewportMargin && (x < l.viewportMargin * s || x > width - l.viewportMargin * s || y < 75 || y > height - 20)) {
              visible = false;
            }
            if (l.clampToViewport) {
              const half = l.el.offsetWidth * s / 2;
              x = clamp(x, half + 10, width - half - 10);
              y = clamp(y, l.el.offsetHeight * s + 85, height - 95);
            }
            if (Math.abs(x - l._x) > 0.2 || Math.abs(y - l._y) > 0.2 || Math.abs(s - l._s) > 0.003) {
              l.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) ${l.align} scale(${s.toFixed(3)})`;
              l._x = x;
              l._y = y;
              l._s = s;
            }
            const z = Math.round(clamp(2000 - depth * 10, 1, 2000));
            if (z !== l._z) {
              l.el.style.zIndex = String(z);
              l._z = z;
            }
          }
        }
      }
      if (visible !== l._shown) {
        l.el.style.display = visible ? 'block' : 'none';
        l._shown = visible;
      }
    }
  }
}

/** A DOM element pinned to a world position, scaled by distance within limits. */
export class Label {
  constructor(layer, className, { maxDist = 90, scaleRef = 22, minScale = 0.5, maxScale = 1.1, centered = false } = {}) {
    this.layer = layer;
    this.el = div('w-lbl ' + className);
    this.anchor = new THREE.Vector3();
    this.visible = true;
    this.maxDist = maxDist;
    this.scaleRef = scaleRef;
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.align = centered ? 'translate(-50%,-50%)' : 'translate(-50%,-100%)';
    if (centered) this.el.style.transformOrigin = '50% 50%';
    this._shown = false;
    this._x = Infinity; // last written transform (Infinity forces the first write)
    this._y = Infinity;
    this._s = Infinity;
    this._z = -1;
    layer.add(this);
  }

  destroy() {
    this.layer.remove(this);
  }
}

/** Everything floating above one player's head. */
export class HeadStack extends Label {
  constructor(layer) {
    super(layer, 'w-stack', { maxDist: 110, scaleRef: 24, minScale: 0.42, maxScale: 1.05 });
    this.nameRow = div('w-namerow');
    this.name = span('w-name');
    this.hearts = span('w-hearts');
    this.out = span('w-out', 'OUT');
    this.level = span('w-level');
    this.combo = span('w-combo');
    this.nameRow.append(this.level, this.name, this.combo, this.hearts, this.out);
    this.arrow = div('w-arrow', '▼');
    this.tile = div('w-tile');
    this.bubble = div('w-bubble');
    this.bubbleMain = span('');
    this.bubbleHl = span('w-hl');
    this.bubble.append(this.bubbleMain, this.bubbleHl);
    this.chats = div('w-chats');
    this.el.append(this.nameRow, this.arrow, this.tile, this.bubble, this.chats);
    this.local = false;
    this.letters = null;
    [this.hearts, this.out, this.arrow, this.tile, this.bubble].forEach((el) => show(el, false));
  }

  setName(name) {
    this.name.textContent = name;
  }
  setBadges(level = 1, admin = false, combo = 0) {
    this.level.textContent = admin ? '[ADMIN]' : `Lv ${level}`;
    this.combo.textContent = combo >= 3 ? `🔥 ${combo}` : '';
  }
  flair(text, color = '#ffd43b') {
    const el = div('w-flair', String(text).slice(0, 70));
    el.style.color = color;
    this.el.append(el);
    setTimeout(() => el.remove(), 2100);
  }

  /** The local player's own name tag is hidden (like Roblox). */
  setLocal(on) {
    this.local = on;
    show(this.nameRow, !on);
  }

  setConnected(on) {
    this.name.classList.toggle('w-dim', !on);
  }

  setHearts(n) {
    const count = Number.isInteger(n) && n > 0 ? Math.min(n, 5) : 0;
    this.hearts.textContent = '♥'.repeat(count);
    show(this.hearts, count > 0 && this.out.style.display === 'none');
  }

  setOut(on) {
    show(this.out, on);
    if (on) show(this.hearts, false);
  }

  setTurn(on) {
    show(this.arrow, on);
  }

  setTile(letters) {
    const text = letters ? String(letters).toUpperCase().slice(0, 4) : null;
    if (text === this.letters) return;
    this.letters = text;
    show(this.tile, !!text);
    if (text) {
      this.tile.textContent = text;
      replay(this.tile, 'w-anim');
    }
  }

  /** bubble: { text, highlight, tone } | null */
  setBubble(bubble) {
    if (!bubble) {
      show(this.bubble, false);
      return;
    }
    const text = String(bubble.text ?? '').toUpperCase().slice(0, 40);
    const n = clamp(bubble.highlight | 0, 0, text.length);
    if (text && Number.isInteger(bubble.prefixIndex) && bubble.prefixIndex >= 0 && bubble.prefixIndex < text.length) {
      this.bubbleMain.textContent = '';
      const index = bubble.prefixIndex;
      this.bubbleMain.append(document.createTextNode(text.slice(0, index)), span('w-hl', text[index]), document.createTextNode(text.slice(index + 1)));
      this.bubbleHl.textContent = '';
    } else if (text) {
      this.bubbleMain.className = '';
      this.bubbleMain.textContent = text.slice(0, text.length - n);
      this.bubbleHl.textContent = text.slice(text.length - n);
    } else {
      this.bubbleMain.className = 'w-dots';
      this.bubbleMain.textContent = '•••';
      this.bubbleHl.textContent = '';
    }
    show(this.bubble, true);
    this.bubble.classList.remove('w-good', 'w-bad');
    if (bubble.tone === 'good' || bubble.tone === 'bad') replay(this.bubble, bubble.tone === 'good' ? 'w-good' : 'w-bad');
  }

  addChat(text) {
    const el = div('w-chat', String(text).slice(0, 200));
    this.chats.appendChild(el);
    while (this.chats.children.length > MAX_CHATS) this.chats.firstChild.remove();
    setTimeout(() => el.remove(), CHAT_MS);
  }
}

/** Floating sign above a shop chair or lucky block: name, optional colored line, price. */
export class Sign extends Label {
  constructor(layer, { name, sub = null, subColor = '#fff' }) {
    super(layer, 'w-sign', { maxDist: 42, scaleRef: 20, minScale: 0.45, maxScale: 1 });
    this.viewportMargin = 200;
    this.el.append(div('w-sign-name', name));
    if (sub) {
      const s = div('w-sign-sub', sub);
      s.style.color = subColor;
      this.el.append(s);
    }
    this.price = div('w-sign-price');
    this.el.append(this.price);
    this.state = null;
  }

  /** state: 'price' | 'owned' | 'equipped' */
  setPrice(text, state = 'price') {
    if (this.price.textContent !== text) this.price.textContent = text;
    if (state !== this.state) {
      this.state = state;
      this.price.classList.toggle('w-owned', state === 'owned');
      this.price.classList.toggle('w-equipped', state === 'equipped');
    }
  }
}

/** The one visible Roblox ProximityPrompt (nearest interactable). Click / tap activates it. */
export class Prompt extends Label {
  constructor(layer, onActivate) {
    super(layer, 'w-prompt-wrap', { maxDist: 200, scaleRef: 1, minScale: 1, maxScale: 1, centered: true });
    this.box = div('w-prompt');
    this.key = div('w-key');
    this.text = span('w-text');
    this.box.append(this.key, this.text);
    this.el.append(this.box);
    this.visible = false;
    this.enabled = false;
    this.target = null;
    this.box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.enabled) onActivate();
    });
  }

  /** Shows the prompt for `target` (an interactable) or hides it when `info` is null. */
  set(target, info) {
    if (!info) {
      this.visible = false;
      this.target = null;
      return;
    }
    const text = String(info.text ?? '');
    const key = String(info.key ?? 'E');
    const enabled = info.enabled !== false;
    if (target !== this.target) replay(this.box, 'w-enter');
    this.target = target;
    this.visible = true;
    if (this.text.textContent !== text) this.text.textContent = text;
    if (this.key.textContent !== key) this.key.textContent = key;
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      this.box.classList.toggle('w-disabled', !enabled);
    }
  }
}
