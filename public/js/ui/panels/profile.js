// Profile: avatar, name, lifetime stats, and the avatar editor (changes are sent as a loadout).

import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { createAvatarPreview } from '../avatar.js';
import { createAvatarEditor } from '../avatarEditor.js';
import { profile, cleanName } from '../../profile.js';
import { CHAIRS, PETS } from '../../shared/catalog.js';
import { NAME_MAX } from '../../shared/constants.js';

/** actions.rename(name), actions.setLook(look) */
export function profilePanel({ actions }) {
  return {
    id: 'profile',
    title: 'Profile',
    color: 'blue',
    icon: icons.face,
    mount(body) {
      const preview = createAvatarPreview(profile.look);
      const editor = createAvatarEditor({
        look: profile.look,
        onChange: (look) => {
          preview.set(look);
          actions.setLook(look);
        },
      });
      const nameInput = h('input', {
        class: 'field', type: 'text', maxlength: NAME_MAX, value: profile.name, autocomplete: 'off',
        autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Your name',
      });
      nameInput.addEventListener('input', () => {
        const clean = cleanName(nameInput.value);
        if (clean !== nameInput.value) nameInput.value = clean;
      });
      nameInput.addEventListener('change', () => {
        actions.rename(nameInput.value);
        nameInput.value = profile.name;
      });
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') nameInput.blur();
      });

      const stats = h('div', { class: 'stats' });
      body.append(
        h('div', { class: 'profile-top' },
          h('div', { class: 'avatar-stage' }, preview.el),
          h('div', { class: 'profile-side' },
            h('label', { class: 'field-label' }, 'Name', nameInput),
            stats)),
        h('h3', { class: 'section-title stroke' }, 'Customize'),
        editor.el);

      function stat(emoji, label, value) {
        return h('div', { class: 'stat' },
          h('span', { class: 'stat-emoji', 'aria-hidden': 'true' }, emoji),
          h('span', { class: 'stat-label' }, label),
          h('span', { class: 'stat-value' }, value));
      }

      function update() {
        const petKinds = PETS.filter((p) => profile.pets[p.id] > 0).length;
        const winRate = profile.gamesPlayed ? `${Math.round((profile.wins / profile.gamesPlayed) * 100)}%` : '—';
        stats.replaceChildren(
          stat('🏆', 'Wins', fmt(profile.wins)),
          stat('🎮', 'Games', fmt(profile.gamesPlayed)),
          stat('📈', 'Win rate', winRate),
          stat('🔤', 'Words typed', fmt(profile.wordsTyped)),
          stat('📏', 'Longest word', profile.longestWord ? profile.longestWord.toUpperCase() : '—'),
          stat('💵', 'Coins', fmt(profile.coins)),
          stat('🐾', 'Pets found', `${petKinds}/${PETS.length}`),
          stat('🪑', 'Chairs', `${profile.ownedChairs.length}/${CHAIRS.length}`));
        if (document.activeElement !== nameInput) nameInput.value = profile.name;
        preview.set(profile.look);
        editor.set(profile.look);
      }
      update();
      return { update };
    },
  };
}
