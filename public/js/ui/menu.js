// Main menu shown over the 3D world in menu mode: logo, name, avatar editor, create / join, how to play.

import { h, fmt, replay } from './dom.js';
import { createLogo } from './logo.js';
import { createAvatarPreview } from './avatar.js';
import { createAvatarEditor } from './avatarEditor.js';
import { icons } from './icons.js';
import { profile, cleanName, setName, setLook } from '../profile.js';
import { NAME_MAX, ROOM_CODE_REGEX, MAX_PLAYERS } from '../shared/constants.js';
import { apiUrl } from '../net.js';

const RULES = [
  ['🪑', 'Sit at the table with 2+ players (or ask the host to add bots).'],
  ['🔤', 'Type a word that starts with the letter shown.'],
  ['🔗', 'The next player starts with your LAST letter.'],
  ['⏱️', 'Beat the timer — 5 mistakes per turn. Fail and you lose a ❤️.'],
  ['🏆', 'Last one standing wins! Earn 💵 for chairs and pets.'],
];

export function cleanCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/**
 * actions.play(code | null) → Promise (null = create a new room)
 * actions.toggleSound()
 */
export function createMenu({ invitedCode, actions }) {
  const preview = createAvatarPreview(profile.look);
  const editor = createAvatarEditor({
    look: profile.look,
    onChange: (look) => {
      setLook(look);
      preview.set(look);
    },
  });

  const nameInput = h('input', {
    class: 'field name-input', type: 'text', maxlength: NAME_MAX, placeholder: 'Your name', value: profile.name,
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Your name',
  });
  nameInput.addEventListener('input', () => {
    const clean = cleanName(nameInput.value);
    if (clean !== nameInput.value) nameInput.value = clean;
  });
  const commitName = () => {
    setName(nameInput.value);
    nameInput.value = profile.name;
  };
  nameInput.addEventListener('change', commitName);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  const codeInput = h('input', {
    class: 'field code-input', type: 'text', maxlength: 8, placeholder: 'CODE', autocomplete: 'off',
    autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Room code',
  });
  const codeHint = h('div', { class: 'code-hint', hidden: true }, 'Room codes are 4–8 letters or numbers.');
  codeInput.addEventListener('input', () => {
    const clean = cleanCode(codeInput.value);
    if (clean !== codeInput.value) codeInput.value = clean;
    codeHint.hidden = true;
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinTyped(); });

  const buttons = [];
  const button = (label, cls, onClick) => {
    const b = h('button', { type: 'button', class: `btn ${cls}`, onClick }, label);
    buttons.push(b);
    return b;
  };

  const invite = invitedCode
    ? h('div', { class: 'invite-box' },
      h('div', { class: 'invite-title stroke' }, "You've been invited!"),
      button(h('span', null, 'Join Game ', h('span', { class: 'invite-code' }, invitedCode)), 'big green block pulse', () => play(invitedCode)))
    : null;
  const publicBtn = button('Play Public', 'big block green', () => play('public'));
  const createBtn = button('Create Private Game', 'big block blue', () => play(null));
  const joinBtn = button('Join', 'blue', joinTyped);
  const publicCount = h('p', { class: 'card-note' }, 'Finding public games…');
  const publicList = h('div', { class: 'public-room-list' });

  function joinTyped() {
    const code = cleanCode(codeInput.value);
    if (!ROOM_CODE_REGEX.test(code)) {
      codeHint.hidden = false;
      replay(codeInput, 'shake');
      codeInput.focus();
      return;
    }
    play(code);
  }

  let busy = false;
  async function play(code) {
    if (busy) return;
    commitName();
    busy = true;
    for (const b of buttons) b.disabled = true;
    try {
      if (code === 'public') await actions.quickplay();
      else await actions.play(code);
    } finally {
      busy = false;
      for (const b of buttons) b.disabled = false;
    }
  }

  const coins = h('span', { class: 'chip-num' });
  const wins = h('span', { class: 'chip-num' });
  const soundBtn = h('button', { type: 'button', class: 'round-btn', 'aria-label': 'Toggle sound', onClick: actions.toggleSound });

  const el = h('div', { class: 'menu' },
    h('div', { class: 'menu-scroll scroll' },
      h('header', { class: 'menu-head' }, createLogo()),
      h('div', { class: 'menu-cards' },
        h('section', { class: 'card play-card' },
          h('h2', { class: 'card-title stroke' }, 'Play'),
          h('label', { class: 'field-label' }, 'Your name', nameInput),
          invite,
          invite ? h('div', { class: 'or' }, 'or') : null,
          publicBtn, createBtn,
          h('button', { type: 'button', class: 'btn small grey block account-menu-button', onClick: () => actions.openAccount() }, 'Account · Save across devices'),
          h('div', { class: 'join-row' }, codeInput, joinBtn),
          codeHint,
          publicCount, publicList,
          h('p', { class: 'card-note' }, `Up to ${MAX_PLAYERS} players per table. Share the invite link with friends!`),
        ),
        h('section', { class: 'card avatar-card' },
          h('h2', { class: 'card-title stroke' }, 'Avatar'),
          h('div', { class: 'avatar-wrap' }, h('div', { class: 'avatar-stage' }, preview.el), editor.el),
        ),
        h('section', { class: 'card howto-card' },
          h('h2', { class: 'card-title stroke' }, 'How to play'),
          h('ol', { class: 'rules' }, RULES.map(([emoji, text]) => h('li', null, h('span', { class: 'rule-icon' }, emoji), h('span', null, text)))),
          h('div', { class: 'rules-example' },
            h('span', { class: 'ex-word' }, 'DO', h('b', null, 'G')), '→',
            h('span', { class: 'ex-word' }, 'GRE', h('b', null, 'Y')), '→',
            h('span', { class: 'ex-word' }, 'YELLO', h('b', null, 'W'))),
        ),
      ),
    ),
    h('div', { class: 'menu-corner' },
      h('div', { class: 'chip', title: 'Wins' }, '🏆', wins),
      h('div', { class: 'chip', title: 'Coins' }, '💵', coins),
      soundBtn,
    ),
  );

  function refresh() {
    coins.textContent = fmt(profile.coins);
    wins.textContent = fmt(profile.wins);
    soundBtn.replaceChildren(icons.sound(profile.settings.sound));
    if (document.activeElement !== nameInput) nameInput.value = profile.name;
    editor.set(profile.look);
    preview.set(profile.look);
  }
  refresh();
  async function refreshPublic() {
    if (el.hidden) return;
    try {
      const response = await fetch(apiUrl('/api/public'));
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      publicCount.textContent = `${data.players || 0} players in public games`;
      publicList.replaceChildren(...(data.rooms || []).slice(0, 3).map((room) =>
        h('button', { type: 'button', class: 'public-room', onClick: () => play(room.code) }, `${room.code} · ${room.humans}/${MAX_PLAYERS} players`, h('span', null, 'Join →'))));
    } catch { publicCount.textContent = 'Create a private game or try public games shortly.'; }
  }
  refreshPublic();
  setInterval(refreshPublic, 15000);

  return {
    el,
    refresh,
    show() {
      el.hidden = false;
      refresh();
      refreshPublic();
    },
    hide() {
      el.hidden = true;
    },
  };
}
