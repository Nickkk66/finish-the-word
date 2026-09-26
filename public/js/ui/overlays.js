// Blocking overlays: loading, "Reconnecting…", error cards, confirm dialogs.

import { h } from './dom.js';

let root = null;
let busyEl = null;
let busyTimer = 0;
let activeConfirm = null;
const EXIT_MS = 180;
export function closeOverlay(el) {
  if (!el || el.classList.contains('leaving')) return;
  el.classList.add('leaving');
  setTimeout(() => el.remove(), EXIT_MS);
}

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
  closeOverlay(busyEl);
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
        closeOverlay(el);
        b.onClick?.();
      },
    }, b.label))));
  return el;
}

/** Resolves true/false. Esc = cancel. */
export function cancelConfirmation() { activeConfirm?.(false); }

export function confirmDialog({ title, message, ok = 'OK', cancel = 'Cancel', tone = 'red' }) {
  if (activeConfirm) return Promise.resolve(false);
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      activeConfirm = null;
      closeOverlay(el);
      document.removeEventListener('keydown', onKey, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(false);
      }
      if (e.key === 'Tab') {
        const buttons = [...el.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        e.preventDefault();
        buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
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
    activeConfirm = done;
    okBtn.focus();
  });
}

/** Informational game-styled popup with a single close button. */
export function noticeDialog(title, message) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const done = () => { document.removeEventListener('keydown', onKey, true); closeOverlay(el); previousFocus?.isConnected && previousFocus.focus({ preventScroll: true }); resolve(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
    const el = overlay('notice', h('div', { class: 'overlay-title stroke' }, title),
      h('p', { class: 'overlay-text' }, message),
      h('button', { type: 'button', class: 'btn blue', onClick: done }, 'Got it'));
    document.addEventListener('keydown', onKey, true);
    el.querySelector('button').focus();
  });
}

/** In-game selection popup for settings that should never invoke a native OS menu. */
export function choiceDialog(title, choices) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const done = value => { document.removeEventListener('keydown', onKey, true); closeOverlay(el); previousFocus?.isConnected && previousFocus.focus({ preventScroll: true }); resolve(value); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    const el = overlay('choice', h('div', { class: 'overlay-title stroke' }, title),
      h('div', { class: 'choice-list' }, choices.map(({ label, description, value }) => h('button', {
        type: 'button', class: 'btn blue', onClick: () => done(value),
      }, h('span', {}, label), description ? h('small', {}, description) : null))),
      h('button', { type: 'button', class: 'btn grey small', onClick: () => done(null) }, 'Cancel'));
    document.addEventListener('keydown', onKey, true);
    el.querySelector('button').focus();
  });
}
