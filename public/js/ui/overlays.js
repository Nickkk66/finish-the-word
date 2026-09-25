// Blocking overlays: loading, "Reconnecting…", error cards, confirm dialogs.

import { h } from './dom.js';

let root = null;
let busyEl = null;
let busyTimer = 0;

export function initOverlays(el) {
  root = el;
}

function overlay(cls, ...children) {
  const el = h('div', { class: `overlay ${cls}` }, h('div', { class: 'overlay-card', role: 'dialog', 'aria-modal': 'true' }, ...children));
  root.append(el);
  return el;
}

function hideBusy() {
  clearTimeout(busyTimer);
  busyEl?.remove();
  busyEl = null;
}

/**
 * Spinner overlay. text = null hides it. Optional { delay, action: { label, onClick } }.
 * Used for "Loading…", "Joining…" and "Reconnecting…".
 */
export function setBusy(text, { delay = 0, action = null } = {}) {
  hideBusy();
  if (!text) return;
  const show = () => {
    busyEl = overlay('busy',
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('div', { class: 'overlay-title stroke' }, text),
      action ? h('button', { type: 'button', class: 'btn grey small', onClick: action.onClick }, action.label) : null);
  };
  if (delay > 0) busyTimer = setTimeout(show, delay);
  else show();
}

/** Error card with buttons: [{ label, tone, onClick }]. Clicking any button closes it. */
export function showError({ title, message, buttons }) {
  const el = overlay('error',
    h('div', { class: 'overlay-emoji', 'aria-hidden': 'true' }, '⚠️'),
    h('div', { class: 'overlay-title stroke' }, title),
    h('p', { class: 'overlay-text' }, message),
    h('div', { class: 'overlay-buttons' }, buttons.map((b) => h('button', {
      type: 'button',
      class: `btn ${b.tone || 'blue'}`,
      onClick: () => {
        el.remove();
        b.onClick?.();
      },
    }, b.label))));
  return el;
}

/** Resolves true/false. Esc = cancel. */
export function confirmDialog({ title, message, ok = 'OK', cancel = 'Cancel', tone = 'red' }) {
  return new Promise((resolve) => {
    const done = (value) => {
      el.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(false);
      }
    };
    const okBtn = h('button', { type: 'button', class: `btn ${tone}`, onClick: () => done(true) }, ok);
    const el = overlay('confirm',
      h('div', { class: 'overlay-title stroke' }, title),
      h('p', { class: 'overlay-text' }, message),
      h('div', { class: 'overlay-buttons' },
        h('button', { type: 'button', class: 'btn grey', onClick: () => done(false) }, cancel),
        okBtn));
    document.addEventListener('keydown', onKey, true);
    okBtn.focus();
  });
}
