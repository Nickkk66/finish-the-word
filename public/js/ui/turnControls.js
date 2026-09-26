// Controls shown only to the local player on their turn: the word input and the letter picker.
// Both are opened with a "turn key" so repeated HUD renders during the same turn don't reset them.

import { h, replay, isTextField } from './dom.js';
import { sfx } from '../audio.js';
import { MAX_WORD_LENGTH } from '../shared/constants.js';
import { profile } from '../profile.js';

const TYPING_THROTTLE_MS = 80;
const RESULT_TIMEOUT_MS = 2500;   // re-allow submitting if a result never arrives

function plainKey(e) {
  return !e.ctrlKey && !e.metaKey && !e.altKey && !isTextField(document.activeElement) && !document.querySelector('.overlay, .panel:not(.leaving)');
}

/** onSubmit(word), onTyping(text) — text is sent throttled (~80ms). */
export function createWordInput({ onSubmit, onTyping }) {
  const input = h('input', {
    class: 'word-field', type: 'text', maxlength: MAX_WORD_LENGTH, autocomplete: 'off', autocorrect: 'off',
    autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Type your word',
  });
  const form = h('form', { class: 'word-form', hidden: true },
    input,
    h('button', { type: 'submit', class: 'btn green word-send', 'aria-label': 'Submit word' }, '➜'));

  let turn = null;        // turn key while open
  let prefix = '';
  let pending = false;    // waiting for the server's result
  let pendingTimer = 0;
  let sentText = '';
  let throttleTimer = 0;

  function flushTyping() {
    sentText = input.value;
    onTyping(sentText);
  }

  function scheduleTyping() {
    if (throttleTimer) return;
    flushTyping();
    throttleTimer = setTimeout(() => {
      throttleTimer = 0;
      if (turn && input.value !== sentText) flushTyping();
    }, TYPING_THROTTLE_MS);
  }

  input.addEventListener('input', () => {
    const clean = input.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, MAX_WORD_LENGTH);
    if (clean !== input.value) input.value = clean;
    // Warn (without blocking) when the word no longer matches the required start.
    form.classList.toggle('mismatch', !clean.startsWith(prefix.slice(0, clean.length)));
    form.classList.remove('ok');
    sfx.key();
    scheduleTyping();
  });

  function submit() {
    const word = input.value;
    if (!turn || pending || !word) return;
    pending = true;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pending = false; }, RESULT_TIMEOUT_MS);
    sfx.submit();
    onSubmit(word);
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  // Typing anywhere on your turn goes into the box.
  document.addEventListener('keydown', (e) => {
    if (!turn || !plainKey(e)) return;
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      input.focus({ preventScroll: true });
      input.value += e.key;
      input.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter' || e.key === 'Backspace') {
      e.preventDefault();
      input.focus({ preventScroll: true });
      if (e.key === 'Enter') submit();
      else {
        input.value = input.value.slice(0, -1);
        input.dispatchEvent(new Event('input'));
      }
    }
  });

  return {
    el: form,
    open(pfx, turnKey) {
      if (turn === turnKey) return;
      turn = turnKey;
      prefix = pfx;
      pending = false;
      sentText = '';
      input.value = profile.settings.prefillPrefix !== false ? pfx : '';
      input.placeholder = `${pfx.toUpperCase()}...`;
      form.classList.remove('ok', 'mismatch');
      form.hidden = false;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    },
    close() {
      if (!turn) return;
      turn = null;
      clearTimeout(throttleTimer);
      throttleTimer = 0;
      form.hidden = true;
      if (document.activeElement === input) input.blur();
    },
    /** Server verdict on the last submission. */
    result(ok) {
      pending = false;
      clearTimeout(pendingTimer);
      if (ok) {
        form.classList.add('ok');
      } else {
        replay(form, 'shake');
        input.select();
      }
    },
  };
}

/** Three big letter buttons for the chooser. Keys 1-3 or the letter itself also pick. */
export function createLetterPicker({ onPick }) {
  const row = h('div', { class: 'picker-row' });
  const el = h('div', { class: 'picker', hidden: true }, row);
  let turn = null;
  let options = [];
  let buttons = [];
  let picked = false;

  function pick(i) {
    if (!turn || picked || !options[i]) return;
    picked = true;
    buttons.forEach((b, j) => {
      b.disabled = true;
      b.classList.toggle('chosen', i === j);
    });
    onPick(options[i]);
  }

  document.addEventListener('keydown', (e) => {
    if (!turn || picked || !plainKey(e)) return;
    const n = Number(e.key);
    const i = n >= 1 && n <= options.length ? n - 1 : options.indexOf(e.key.toLowerCase());
    if (i >= 0) {
      e.preventDefault();
      pick(i);
    }
  });

  return {
    el,
    open(letters, turnKey) {
      if (turn === turnKey) return;
      turn = turnKey;
      options = letters.slice(0, 3);
      picked = false;
      buttons = options.map((letter, i) => h('button', {
        type: 'button', class: 'letter-btn', style: { '--d': `${i * 0.08}s` }, 'aria-label': `Pick ${letter.toUpperCase()}`, onClick: () => pick(i),
      }, h('span', { class: 'letter-key' }, String(i + 1)), h('span', { class: 'letter-char' }, letter.toUpperCase())));
      row.replaceChildren(...buttons);
      el.hidden = false;
    },
    close() {
      if (!turn) return;
      turn = null;
      el.hidden = true;
    },
  };
}
