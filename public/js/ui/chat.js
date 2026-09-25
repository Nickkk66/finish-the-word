// Roblox-style chat (top-left): translucent log that fades when idle, "/" to focus, Enter to send, Esc to leave.
// On small screens it collapses behind a 💬 button with an unread badge.
// Messages are rendered with textContent only.

import { h, nameColor, isTextField, replay } from './dom.js';
import { CHAT_MAX, EMOTES } from '../shared/constants.js';

const MAX_MESSAGES = 60;
const IDLE_MS = 6000;            // background fades out
const FADE_TEXT_MS = 30000;      // messages fade out
const MIN_SEND_INTERVAL_MS = 650;

export function createChat({ onSend, onEmote }) {
  const log = h('div', { class: 'chat-log scroll', role: 'log', 'aria-live': 'polite' });
  const input = h('input', {
    class: 'chat-input', type: 'text', maxlength: CHAT_MAX, placeholder: 'To chat click here or press "/" key',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Chat message',
  });
  const badge = h('span', { class: 'chat-badge', hidden: true });
  const toggle = h('button', { type: 'button', class: 'chat-toggle', 'aria-label': 'Open chat' }, '💬', badge);
  const emotes = h('div', { class: 'emote-grid', hidden: true }, EMOTES.map((name) => h('button', { type: 'button', class: 'seg-btn', onClick: () => { onEmote(name); emotes.hidden = true; } }, name)));
  const emoteButton = h('button', { type: 'button', class: 'emote-button', 'aria-label': 'Emotes', onClick: () => { emotes.hidden = !emotes.hidden; } }, '☺');
  const el = h('div', { class: 'chat' }, toggle, h('div', { class: 'chat-box' }, log, h('div', { class: 'chat-entry' }, input, emoteButton), emotes));

  const compact = matchMedia('(max-width: 720px), (max-height: 520px)');
  let unread = 0;
  let lastSent = 0;
  let idleTimer = 0;
  let fadeTimer = 0;

  const engaged = () => document.activeElement === input || el.matches(':hover');
  const isHidden = () => compact.matches && !el.classList.contains('open');

  function wake() {
    el.classList.add('awake');
    el.classList.remove('faded');
    clearTimeout(idleTimer);
    clearTimeout(fadeTimer);
    idleTimer = setTimeout(() => { if (!engaged()) el.classList.remove('awake'); }, IDLE_MS);
    fadeTimer = setTimeout(() => { if (!engaged()) el.classList.add('faded'); }, FADE_TEXT_MS);
  }

  function setUnread(n) {
    unread = n;
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
  }

  function setOpen(open) {
    el.classList.toggle('open', open);
    toggle.setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
    if (open) {
      setUnread(0);
      wake();
    }
  }

  function focus() {
    setOpen(true);
    input.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => {
    const open = !el.classList.contains('open');
    setOpen(open);
    if (!open) input.blur();
  });
  el.addEventListener('pointerenter', wake);
  el.addEventListener('pointerleave', wake);
  input.addEventListener('focus', wake);
  input.addEventListener('blur', wake);

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();   // keep game shortcuts (letters, 1-3, Esc for panels) out of the chat box
    if (e.key === 'Escape') {
      input.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const text = input.value.replace(/\s+/g, ' ').trim();
      if (!text) {
        input.blur();
        return;
      }
      const now = Date.now();
      if (now - lastSent < MIN_SEND_INTERVAL_MS) {
        replay(input, 'shake');
        return;
      }
      lastSent = now;
      onSend(text.slice(0, CHAT_MAX));
      input.value = '';
      input.blur();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTextField(document.activeElement)) return;
    if (el.closest('[hidden]')) return;
    e.preventDefault();
    focus();
  });

  return {
    el,
    /** { name, text } for players, { system: true, text } for notices. */
    add({ name, text, system = false }) {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.append(system
        ? h('div', { class: 'chat-msg system' }, text)
        : h('div', { class: 'chat-msg' },
          h('span', { class: 'chat-name', style: { color: nameColor(name) } }, `${name}:`), ' ',
          h('span', { class: 'chat-text' }, text)));
      while (log.childElementCount > MAX_MESSAGES) log.firstElementChild.remove();
      if (nearBottom) log.scrollTop = log.scrollHeight;
      if (isHidden()) setUnread(unread + 1);
      wake();
    },
    clear() {
      log.replaceChildren();
      setUnread(0);
    },
  };
}
