import { h, replay } from '../dom.js';
import { icons } from '../icons.js';
import { profile } from '../../profile.js';
import { MODES, BOT_LEVELS } from '../../shared/constants.js';
import { TABLES } from '../../shared/catalog.js';

function segmented(options, onPick) {
  const buttons = options.map(([label, value]) => h('button', { type: 'button', class: 'seg-btn', onClick: () => onPick(value) }, label));
  return { el: h('div', { class: 'seg' }, buttons), set(value, disabled = false) {
    buttons.forEach((b, i) => { b.setAttribute('aria-pressed', String(options[i][1] === value)); b.disabled = disabled; });
  } };
}
const row = (label, control) => h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), control);
const button = (label, action, tone = 'blue') => h('button', { type: 'button', class: `btn small ${tone}`, onClick: action }, label);

export function settingsPanel({ state, actions }) {
  return { id: 'settings', title: 'Settings', color: 'grey', icon: icons.gear,
    mount(body) {
      const sound = segmented([['On', true], ['Off', false]], actions.setSound);
      const quality = segmented([['High', 'high'], ['Low', 'low']], actions.setQuality);
      const prefill = segmented([['On', true], ['Off', false]], (v) => actions.preference('prefillPrefix', v));
      const view = segmented([['Third person', 'third'], ['First person', 'first']], actions.setView);
      const notice = h('p', { class: 'host-notice' });
      const version = h('button', { type: 'button', class: 'version-entry' });
      const secret = h('input', { type: 'password', class: 'secret-entry', placeholder: '···', hidden: true, autocomplete: 'off', 'aria-label': 'Access code' });
      const admin = h('div', { hidden: true });
      let taps = [];
      version.addEventListener('click', () => {
        const now = Date.now(); taps = taps.filter((t) => now - t < 3000); taps.push(now);
        if (taps.length >= 5) { taps = []; secret.hidden = false; secret.focus(); }
      });
      secret.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { secret.value = ''; secret.hidden = true; }
        if (e.key === 'Enter') { actions.unlock(secret.value); secret.value = ''; secret.hidden = true; }
      });
      body.append(h('div', { class: 'set-group' }, row('Sound', sound.el), row('Graphics', quality.el)),
        h('h3', { class: 'section-title stroke' }, 'Controls'),
        h('div', { class: 'set-group' }, row('Camera · P to switch', view.el), row('Pre-fill required letters', prefill.el)),
        h('div', { class: 'set-group' }, row('Save across devices', button('Account', () => actions.openAccount()))),
        notice, admin, h('div', { class: 'leave-row' }, button('Leave room', actions.leave, 'red')), version, secret);
      let adminKey = '';
      function update() {
        sound.set(profile.settings.sound); quality.set(profile.settings.quality); prefill.set(profile.settings.prefillPrefix); view.set(profile.settings.view === 'first' ? 'first' : 'third');
        const host = state.hostId === state.you || state.isAdmin;
        notice.textContent = host ? 'Change match rules in Game Settings.' : 'Only the host can change game rules. Your personal settings above are always yours to change.';
        notice.classList.toggle('restricted', !host);
        version.textContent = `v2.0 · ${actions.ping() ?? '—'} ms`;
        if (state.unlockFailed) { replay(version, 'shake'); state.unlockFailed = false; }
        admin.hidden = !state.isAdmin;
        if (!state.isAdmin) return;
        const key = [...state.players.values()].map((p) => `${p.id}:${p.name}`).join('|');
        if (key === adminKey && admin.childElementCount) return;
        adminKey = key;
        const target = h('select', { class: 'field', 'aria-label': 'Admin target' }, [...state.players.values()].map((p) => h('option', { value: p.id }, p.name)));
        const amount = h('input', { class: 'field', type: 'number', min: 1, max: 100000, value: 100, 'aria-label': 'Coins to grant' });
        const announcement = h('input', { class: 'field', maxlength: 120, placeholder: 'Announcement', 'aria-label': 'Announcement' });
        const tag = h('input', { type: 'checkbox', 'aria-label': 'Show admin tag', onChange: (e) => actions.admin('tag', { on: e.target.checked }) });
        admin.replaceChildren(h('h3', { class: 'section-title stroke' }, 'Admin'),
          h('div', { class: 'host-tools' }, button('Take host', () => actions.admin('takeHost')), button('Force start', () => actions.admin('forceStart')),
            button('End match', () => actions.admin('endMatch'), 'red'), button('Reset room', () => actions.admin('reset'), 'red')),
          h('div', { class: 'set-group' }, row('Player', target), row('Coins', amount),
            h('div', { class: 'host-tools' }, button('Grant coins', () => actions.admin('grant', { id: target.value, coins: Number(amount.value) })),
              button('Remove global wins', () => actions.admin('removeLeaderboard', { id: target.value }), 'red'),
              button('Teleport to player', () => actions.teleportToPlayer(target.value))),
            row('Announcement', announcement), button('Announce', () => { actions.admin('announce', { text: announcement.value }); announcement.value = ''; }), row('Show ADMIN tag', tag)));
      }
      update(); const timer = setInterval(update, 2000); return { update, unmount: () => clearInterval(timer) };
    },
  };
}

export function gameSettingsPanel({ state, actions }) {
  return { id: 'gameSettings', title: 'Game Settings', color: 'orange', icon: icons.gear,
    mount(body) {
      const mode = h('select', { class: 'field', 'aria-label': 'Game mode', onChange: (e) => {
        const value = MODES.find((v) => v.id === e.target.value);
        actions.hostSettings({ mode: value.id, hearts: value.hearts, turnSeconds: value.turnSeconds });
      } }, MODES.map((v) => h('option', { value: v.id }, `${v.name} — ${v.description}`)));
      const hearts = segmented([['1', 1], ['2', 2], ['3', 3]], (v) => actions.hostSettings({ hearts: v }));
      const turn = segmented([['8s', 8], ['10s', 10], ['15s', 15], ['20s', 20]], (v) => actions.hostSettings({ turnSeconds: v }));
      const pets = segmented([['On', true], ['Off', false]], (v) => actions.hostSettings({ petAbilities: v }));
      const bot = segmented(Object.entries(BOT_LEVELS).map(([id, v]) => [v.name, id]), (v) => actions.hostSettings({ botLevel: v }));
      const publicRoom = segmented([['Public', true], ['Private', false]], (v) => actions.hostSettings({ public: v }));
      const table = h('select', { class: 'field', 'aria-label': 'Room table', onChange: (e) => state.isAdmin ? actions.admin('table', { table: e.target.value }) : actions.cosmetic('table', e.target.value) });
      const notice = h('p', { class: 'host-notice' });
      const players = h('div', { class: 'moderation-list' });
      const banned = state.bannedPlayers;
      const unban = h('div', { class: 'moderation-list' });
      const tools = h('div', { class: 'host-tools' }, button('Add Bot', () => actions.host('addBot')), button('Remove Bot', () => actions.host('removeBot'), 'orange'), button('Start now', () => actions.host('start'), 'green'));
      body.append(notice, h('div', { class: 'set-group' }, row('Mode', mode), row('Hearts', hearts.el), row('Turn time', turn.el), row('Pet abilities', pets.el), row('Bots', bot.el), row('Room visibility', publicRoom.el), row('Table', table)), tools,
        h('h3', { class: 'section-title stroke' }, 'Players'), players, unban);
      function update() {
        const allowed = state.hostId === state.you || state.isAdmin;
        notice.textContent = allowed ? 'Changes apply to the next match.' : 'Only the host can change these game settings.';
        notice.classList.toggle('restricted', !allowed);
        mode.value = state.settings.mode; mode.disabled = !allowed;
        hearts.set(state.settings.hearts, !allowed); turn.set(state.settings.turnSeconds, !allowed); pets.set(state.settings.petAbilities, !allowed);
        bot.set(state.settings.botLevel, !allowed); publicRoom.set(!!state.public, !allowed); tools.hidden = !allowed;
        table.replaceChildren(...TABLES.filter((t) => state.isAdmin || profile.ownedTables.includes(t.id)).map((t) => h('option', { value: t.id }, t.name)));
        table.value = state.table || profile.equippedTable; table.disabled = !allowed;
        players.replaceChildren(...[...state.players.values()].map((p) => h('div', { class: 'moderation-row' }, h('span', null, `${p.name}${p.isBot ? ' · BOT' : ''}`),
          p.id !== state.you && allowed ? h('div', { class: 'host-tools' }, button('Kick', () => actions.moderate('kick', p.id), 'orange'), button('Ban', async () => { if (await actions.moderate('ban', p.id)) { banned.set(p.id, p.name); update(); } }, 'red')) : null)));
        unban.replaceChildren(...[...banned].map(([id, name]) => h('div', { class: 'moderation-row' }, `${name} · banned`, button('Unban', () => { actions.moderate('unban', id); banned.delete(id); update(); }))));
      }
      update(); return { update };
    },
  };
}
