import { isRouletteMode, rouletteRules } from '../../shared/roulette.js';
import { h, replay } from '../dom.js';
import { icons } from '../icons.js';
import { profile } from '../../profile.js';
import { MODES, BOT_LEVELS } from '../../shared/constants.js';
import { choiceDialog, confirmDialog } from '../overlays.js';
import { rouletteEntryDetails } from '../roulette-copy.js';

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
      const playerList = segmented([['Classic', 'classic'], ['Slim', 'compact']], v => actions.preference('playerListStyle', v));
      const view = segmented([['Third person', 'third'], ['First person', 'first']], actions.setView);
      const notice = h('p', { class: 'host-notice' });
      const version = h('button', { type: 'button', class: 'version-entry' });
      const secret = h('input', { type: 'password', class: 'secret-entry', placeholder: '···', hidden: true, autocomplete: 'off', 'aria-label': 'Access code' });
      const adminToggle=button('Open admin tools',actions.openAdminTools,'purple');
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
      body.append(h('div', { class: 'set-group' }, row('Sound', sound.el), row('Graphics', quality.el), row('Player list', playerList.el)),
        h('h3', { class: 'section-title stroke' }, 'Controls'),
        h('div', { class: 'set-group' }, row('Camera · P to switch', view.el), row('Pre-fill required letters', prefill.el)),
        h('div', { class: 'set-group' }, row('Save across devices', button('Account', () => actions.openAccount()))),
        notice, adminToggle, h('div', { class: 'leave-row' }, button('Leave room', actions.leave, 'red')), version, secret);
      function update() {
        playerList.set(profile.settings.playerListStyle); sound.set(profile.settings.sound); quality.set(profile.settings.quality); prefill.set(profile.settings.prefillPrefix); view.set(profile.settings.view === 'first' ? 'first' : 'third');
        const host = state.hostId === state.you || state.isAdmin;
        notice.textContent = host ? 'Change match rules in Game Settings.' : 'Only the host can change game rules. Your personal settings above are always yours to change.';
        notice.classList.toggle('restricted', !host);
        version.textContent = `v2.0 · ${actions.ping() ?? '—'} ms`;
        if (state.unlockFailed) { replay(version, 'shake'); state.unlockFailed = false; }
        adminToggle.hidden = !state.isAdmin;

      }
      update(); const timer = setInterval(update, 2000); return { update, unmount: () => clearInterval(timer) };
    },
  };
}

export function gameSettingsPanel({ state, actions }) {
  return { id: 'gameSettings', title: 'Game Settings', color: 'orange', icon: icons.gear,
    mount(body) {
      const mode = button('Choose mode', async () => {
        const visibleModes = MODES.filter(v => ['classic', 'roulette', 'roulette_deadly', 'word_tide'].includes(v.id));
        const sortedModes=[...visibleModes.filter(v=>!isRouletteMode(v.id)),...visibleModes.filter(v=>isRouletteMode(v.id))];
        const id = await choiceDialog('Choose a mode', sortedModes.map(v => ({ label: v.name, description: v.description, value: v.id, group: v.id === 'word_tide' ? 'Word Tide' : isRouletteMode(v.id) ? 'Roulette' : 'Finish the Word' })));
        if (isRouletteMode(id)) {
          if (!await confirmDialog({ title: rouletteRules(id).name, details: rouletteEntryDetails(), ok: 'Enter Last Sip', tone: 'purple' })) return;
          actions.closePanels();
        }
        if (id === 'word_tide') actions.closePanels();
        if (id) actions.hostSettings({ mode: id });
      });
      const custom = patch => actions.hostSettings({ ...((isRouletteMode(state.settings.mode) || state.settings.mode === 'word_tide') ? {} : { mode: 'custom' }), ...patch });
      const hearts = segmented([['1', 1], ['2', 2], ['3', 3]], (v) => custom({ hearts: v }));
      const turn = segmented([['8s', 8], ['10s', 10], ['15s', 15], ['20s', 20]], (v) => custom({ turnSeconds: v }));
      const pets = segmented([['On', true], ['Off', false]], (v) => custom({ petAbilities: v }));
      const swearing = segmented([['Off', false], ['On', true]], (v) => actions.hostSettings({ allowSwearing: v }));
      const bot = segmented(Object.entries(BOT_LEVELS).map(([id, v]) => [v.name, id]), (v) => custom({ botLevel: v }));
      const visibility = h('strong', { class: 'room-visibility' });
      const notice = h('p', { class: 'host-notice' });
      const players = h('div', { class: 'moderation-list' });
      const banned = state.bannedPlayers;
      const unban = h('div', { class: 'moderation-list' });
      const tools = h('div', { class: 'host-tools' }, button('Add Bot', () => { custom({}); actions.host('addBot'); }), button('Remove Bot', () => { custom({}); actions.host('removeBot'); }, 'orange'), button('Start now', () => actions.host('start'), 'green'), button('End game · refund all', () => actions.host('endMatch'), 'red'));
      body.append(notice, h('div', { class: 'set-group' }, row('Mode', mode), row('Hearts', hearts.el), row('Turn time', turn.el), row('Pet abilities', pets.el), row('Swearing', swearing.el), row('Bots', bot.el), row('Room visibility', visibility)), tools,
        h('h3', { class: 'section-title stroke' }, 'Players'), players, unban);
      function update() {
        const allowed = state.hostId === state.you || state.isAdmin;
        const title = state.isAdmin && state.hostId !== state.you ? 'Game Settings - Admin Forced' : 'Game Settings';
        const panel = body.closest('.panel');
        if (panel) { panel.querySelector('.panel-title').textContent = title; panel.setAttribute('aria-label', title); }
        const isRoulette = isRouletteMode(state.settings.mode) || state.settings.mode === 'word_tide';
        notice.textContent = allowed ? 'Changes apply to the next match.' : 'Only the host can change these game settings.';
        notice.classList.toggle('restricted', !allowed);
        mode.textContent = `Mode: ${MODES.find(v => v.id === state.settings.mode)?.name || 'Classic'} ▾`; mode.disabled = !allowed;
        hearts.set(state.settings.hearts, !allowed || isRoulette); turn.set(state.settings.turnSeconds, !allowed || isRoulette); pets.set(state.settings.petAbilities, !allowed);
        swearing.set(!!state.settings.allowSwearing, !allowed);
        bot.set(state.settings.botLevel, !allowed); visibility.textContent = state.public ? 'Main public room' : 'Private invite room'; tools.hidden = !allowed;
        players.replaceChildren(...[...state.players.values()].map((p) => h('div', { class: 'moderation-row' }, h('span', null, `${p.name}${p.isBot ? ' · BOT' : ''}`),
          p.id !== state.you && allowed ? h('div', { class: 'host-tools' }, button('Kick', () => actions.moderate('kick', p.id), 'orange'), button('Ban', () => actions.moderate('ban', p.id), 'red')) : null)));
        unban.replaceChildren(...[...banned].map(([id, name]) => h('div', { class: 'moderation-row' }, `${name} · banned`, button('Unban', () => actions.moderate('unban', id)))));
      }
      update(); return { update };
    },
  };
}
