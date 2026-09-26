import { h, replay } from '../dom.js';
import { icons } from '../icons.js';
import { profile } from '../../profile.js';
import { MODES, BOT_LEVELS } from '../../shared/constants.js';
import { choiceDialog, confirmDialog } from '../overlays.js';
import { TABLES, CHAIRS } from '../../shared/catalog.js';

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
      let adminExpanded = false;
      const adminToggle = button('Open admin tools', () => { adminExpanded = !adminExpanded; update(); }, 'purple');
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
        notice, adminToggle, admin, h('div', { class: 'leave-row' }, button('Leave room', actions.leave, 'red')), version, secret);
      let adminKey = '';
      function update() {
        sound.set(profile.settings.sound); quality.set(profile.settings.quality); prefill.set(profile.settings.prefillPrefix); view.set(profile.settings.view === 'first' ? 'first' : 'third');
        const host = state.hostId === state.you || state.isAdmin;
        notice.textContent = host ? 'Change match rules in Game Settings.' : 'Only the host can change game rules. Your personal settings above are always yours to change.';
        notice.classList.toggle('restricted', !host);
        version.textContent = `v2.0 · ${actions.ping() ?? '—'} ms`;
        if (state.unlockFailed) { replay(version, 'shake'); state.unlockFailed = false; }
        adminToggle.hidden = !state.isAdmin;
        adminToggle.textContent = adminExpanded ? 'Close admin tools' : 'Open admin tools';
        admin.hidden = !state.isAdmin || !adminExpanded;
        if (!state.isAdmin || !adminExpanded) return;
        const key = [...state.players.values()].map((p) => `${p.id}:${p.name}`).join('|');
        if (key === adminKey && admin.childElementCount) return;
        adminKey = key;
        const target = h('select', { class: 'field', 'aria-label': 'Admin target' }, [...state.players.values()].map((p) => h('option', { value: p.id }, p.name)));
        const amount = h('input', { class: 'field', type: 'number', min: -1000000000, max: 1000000000, value: 100, 'aria-label': 'Coin amount, negative to remove' });
        const chair = h('select', { class: 'field', 'aria-label': 'Chair to sell' }, CHAIRS.filter(v => v.id !== 'wooden').map(v => h('option', { value: v.id }, `${v.name} · refund ${Math.floor(v.price / 2)}`)));
        const freeMerge = h('input', { type: 'checkbox', checked: !!state.adminFreeMerge, onChange: e => { state.adminFreeMerge = e.target.checked; actions.refreshPanels(); } });
        const announcement = h('input', { class: 'field', maxlength: 120, placeholder: 'Announcement', 'aria-label': 'Announcement' });
        const tag = h('input', { type: 'checkbox', 'aria-label': 'Show admin tag', onChange: (e) => actions.admin('tag', { on: e.target.checked }) });
        admin.replaceChildren(h('h3', { class: 'section-title stroke' }, 'Admin'),
          h('div', { class: 'host-tools' }, button('Take host', () => actions.admin('takeHost')), button('Force start', () => actions.admin('forceStart')),
            button('End match', () => actions.admin('endMatch'), 'red'), button('Reset room', () => actions.admin('reset'), 'red')),
          h('div', { class: 'set-group' }, row('Player', target), row('Coin amount (+/−)', amount),
            h('div', { class: 'host-tools' }, button('Set coins', () => actions.admin('coins', { id: target.value, operation: 'set', amount: Number(amount.value) })),
              button('Add / remove coins', () => actions.admin('coins', { id: target.value, operation: 'add', amount: Number(amount.value) })),
              button('Remove global wins', () => actions.admin('removeLeaderboard', { id: target.value }), 'red'),
              button('Teleport to player', () => actions.teleportToPlayer(target.value))),
            row('Sell owned chair', chair), button('Sell chair · half refund', () => actions.admin('sellChair', { id: target.value, chairId: chair.value }), 'orange'),
            row('Free admin merges', freeMerge),
            row('Announcement', announcement), h('div', { class: 'host-tools' }, button('Announce in room', () => { actions.admin('announce', { text: announcement.value }); announcement.value = ''; }),
              button('Announce globally', () => { actions.admin('announce', { text: announcement.value, global: true }); announcement.value = ''; }, 'purple')), row('Show ADMIN tag', tag)));
      }
      update(); const timer = setInterval(update, 2000); return { update, unmount: () => clearInterval(timer) };
    },
  };
}

export function gameSettingsPanel({ state, actions }) {
  return { id: 'gameSettings', title: 'Game Settings', color: 'orange', icon: icons.gear,
    mount(body) {
      const mode = button('Choose mode', async () => {
        const id = await choiceDialog('Choose a mode', MODES.filter(v => v.id !== 'custom').map(v => ({ label: v.name, description: v.description, value: v.id })));
        if (id === 'roulette') {
          if (!await confirmDialog({ title: 'The Last Sip', message: 'Choose your own entry, from 25 game coins. Each doubling above the smallest entry removes 20% of base poison risk, capped at 40% off. Equal bets have equal odds. Every turn multiplies the prize by 1.05 and poison chance by 1.25 (up to 95%). Drink or pass within 10 seconds; one pass each until a knockout. Last awake takes the prize. Asteroid fire drains 25 coins per 5 seconds standing inside it.', ok: 'Enter Roulette', tone: 'purple' })) return;
          actions.closePanels();
        }
        if (id) actions.hostSettings({ mode: id });
      });
      const custom = patch => actions.hostSettings({ ...(state.settings.mode === 'roulette' ? {} : { mode: 'custom' }), ...patch });
      const hearts = segmented([['1', 1], ['2', 2], ['3', 3]], (v) => custom({ hearts: v }));
      const turn = segmented([['8s', 8], ['10s', 10], ['15s', 15], ['20s', 20]], (v) => custom({ turnSeconds: v }));
      const pets = segmented([['On', true], ['Off', false]], (v) => custom({ petAbilities: v }));
      const bot = segmented(Object.entries(BOT_LEVELS).map(([id, v]) => [v.name, id]), (v) => custom({ botLevel: v }));
      const publicRoom = segmented([['Public', true], ['Private', false]], (v) => custom({ public: v }));
      const table = button('Choose table', async () => {
        const choices = TABLES.filter(t => state.isAdmin || profile.ownedTables.includes(t.id));
        const id = await choiceDialog('Choose a table', choices.map(v => ({ label: v.name, value: v.id })));
        if (!id) return;
        if (state.isAdmin) actions.admin('table', { table: id });
        else actions.cosmetic('table', id);
        custom({});
      });
      const notice = h('p', { class: 'host-notice' });
      const players = h('div', { class: 'moderation-list' });
      const banned = state.bannedPlayers;
      const unban = h('div', { class: 'moderation-list' });
      const tools = h('div', { class: 'host-tools' }, button('Add Bot', () => { custom({}); actions.host('addBot'); }), button('Remove Bot', () => { custom({}); actions.host('removeBot'); }, 'orange'), button('Start now', () => actions.host('start'), 'green'));
      body.append(notice, h('div', { class: 'set-group' }, row('Mode', mode), row('Hearts', hearts.el), row('Turn time', turn.el), row('Pet abilities', pets.el), row('Bots', bot.el), row('Room visibility', publicRoom.el), row('Table', table)), tools,
        h('h3', { class: 'section-title stroke' }, 'Players'), players, unban);
      function update() {
        const allowed = state.hostId === state.you || state.isAdmin;
        const isRoulette = state.settings.mode === 'roulette';
        notice.textContent = allowed ? 'Changes apply to the next match.' : 'Only the host can change these game settings.';
        notice.classList.toggle('restricted', !allowed);
        mode.textContent = `Mode: ${MODES.find(v => v.id === state.settings.mode)?.name || 'Classic'} ▾`; mode.disabled = !allowed;
        hearts.set(state.settings.hearts, !allowed || isRoulette); turn.set(state.settings.turnSeconds, !allowed || isRoulette); pets.set(state.settings.petAbilities, !allowed || isRoulette);
        bot.set(state.settings.botLevel, !allowed); publicRoom.set(!!state.public, !allowed); tools.hidden = !allowed;
        table.textContent = isRoulette ? 'Cursed table · included' : `Table: ${TABLES.find(v => v.id === state.table)?.name || 'Classic'} ▾`; table.disabled = !allowed || isRoulette;
        players.replaceChildren(...[...state.players.values()].map((p) => h('div', { class: 'moderation-row' }, h('span', null, `${p.name}${p.isBot ? ' · BOT' : ''}`),
          p.id !== state.you && allowed ? h('div', { class: 'host-tools' }, button('Kick', () => actions.moderate('kick', p.id), 'orange'), button('Ban', async () => { if (await actions.moderate('ban', p.id)) { banned.set(p.id, p.name); update(); } }, 'red')) : null)));
        unban.replaceChildren(...[...banned].map(([id, name]) => h('div', { class: 'moderation-row' }, `${name} · banned`, button('Unban', () => { actions.moderate('unban', id); banned.delete(id); update(); }))));
      }
      update(); return { update };
    },
  };
}
