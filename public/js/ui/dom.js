// Tiny DOM helpers. All text goes through textContent / text nodes — never innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(el, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) {
        if (v != null) el.style.setProperty(prop, String(v));
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * h('button', { class: 'btn', onClick }, 'Label', childNode)
 * props: class, text, style ({'--var': v, color: v}), on<Event> handlers, other attributes.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** Same as h() but for SVG elements. */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** Sets textContent only when it changed (cheap to call every frame). */
export function setText(el, text) {
  const t = String(text);
  if (el.textContent !== t) el.textContent = t;
}

/** Restarts a CSS animation class on an element. */
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** 754000 → "12:34" */
export function formatDuration(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function isTextField(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** Stable bright color for a name (Roblox-style chat / player list name colors). */
const NAME_COLORS = ['#ff5a5f', '#45b1ff', '#4ee06a', '#c38cff', '#ff9f40', '#ffd84d', '#ff7ac6', '#3fe0d0'];
export function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}
