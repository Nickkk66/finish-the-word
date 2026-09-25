import { h, fmt } from '../dom.js';
import { icons } from '../icons.js';
import { createAvatarPreview } from '../avatar.js';
import { createAvatarEditor } from '../avatarEditor.js';
import { modelArt } from '../art.js';
import { profile, cleanName, level } from '../../profile.js';
import { PETS, BACK_BLING } from '../../shared/catalog.js';
import { NAME_MAX } from '../../shared/constants.js';

export function profilePanel({ actions }) {
  return { id: 'profile', title: 'Profile', color: 'blue', icon: icons.face,
    mount(body) {
      let tab = 'Look';
      const preview = createAvatarPreview(profile.look);
      const editor = createAvatarEditor({ look: profile.look, onChange: (look) => { preview.set(look); actions.setLook(look); } });
      const name = h('input', { class: 'field', type: 'text', maxlength: NAME_MAX, value: profile.name, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Your name' });
      name.addEventListener('input', () => { name.value = cleanName(name.value); });
      name.addEventListener('change', () => { actions.rename(name.value); name.value = profile.name; });
      name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); });
      const levelText = h('span');
      const progress = h('progress', { max: 100, 'aria-label': 'Level progress' });
      const stats = h('div', { class: 'stats' });
      const tabContent = h('div', { class: 'profile-tab-content scroll' });
      const tabs = ['Look', 'Back Bling', 'Pets'].map((label) => h('button', { type: 'button', class: 'seg-btn', onClick: () => { tab = label; updateTab(); } }, label));
      body.append(h('div', { class: 'profile-columns' },
        h('div', { class: 'profile-summary' }, h('div', { class: 'avatar-stage' }, preview.el), h('label', { class: 'field-label' }, 'Name', name), h('div', { class: 'level-progress' }, levelText, progress), stats),
        h('div', { class: 'profile-customize' }, h('div', { class: 'seg profile-tabs' }, tabs), tabContent)));
      function updateTab() {
        tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === tab)));
        if (tab === 'Look') { tabContent.replaceChildren(editor.el); return; }
        const list = tab === 'Back Bling' ? BACK_BLING.filter((p) => profile.ownedBacks.includes(p.id)) : PETS.filter((p) => profile.pets[p.id]);
        tabContent.replaceChildren(h('div', { class: 'profile-collection' }, list.length ? list.map((item) => {
          const isBack = tab === 'Back Bling';
          const equipped = isBack ? profile.equippedBack === item.id : profile.equippedPet === item.id;
          return h('button', { type: 'button', class: `profile-item${equipped ? ' equipped' : ''}`, onClick: () => isBack ? actions.cosmetic('back', item.id) : actions.equipPet(item.id, [3, 2, 1].find((tier) => profile.petTiers[item.id]?.[tier])) },
            modelArt(actions, isBack ? 'back' : 'pet', item.id, item.name, 90), h('span', null, item.name), h('small', null, equipped ? 'Equipped' : 'Equip'));
        }) : h('p', { class: 'empty' }, 'Your collection will appear here.')));
      }
      function stat(label, value) { return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value', title: String(value) }, value)); }
      function update() {
        const lvl = level();
        const start = (lvl - 1) ** 2 * 100; const next = lvl ** 2 * 100;
        levelText.textContent = `Level ${lvl} · ${fmt(profile.xp)} XP`;
        progress.value = (profile.xp - start) / (next - start) * 100;
        stats.replaceChildren(stat('Wins', fmt(profile.wins)), stat('Games', fmt(profile.gamesPlayed)),
          stat('Win rate', profile.gamesPlayed ? `${Math.round(profile.wins / profile.gamesPlayed * 100)}%` : '—'), stat('Best WPM', profile.bestWpm || '—'),
          stat('Words', fmt(profile.wordsTyped)), stat('Longest word', profile.longestWord.toUpperCase() || '—'),
          stat('Pets found', `${profile.discoveredPets.length}/${PETS.length}`), stat('Coins', fmt(profile.coins)));
        if (document.activeElement !== name) name.value = profile.name;
        preview.set(profile.look); editor.set(profile.look); updateTab();
      }
      update(); return { update };
    },
  };
}
