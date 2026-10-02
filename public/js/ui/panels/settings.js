import { createAdminProfileEditor } from '../admin-profile.js';
import { isRouletteMode, rouletteRules } from '../../shared/roulette.js';
import { h, replay } from '../dom.js';
import { icons } from '../icons.js';
import { profile } from '../../profile.js';
import { MODES, BOT_LEVELS } from '../../shared/constants.js';
import { choiceDialog, confirmDialog } from '../overlays.js';
import { CARDS } from '../../shared/catalog.js';
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
      const admin = h('div', { hidden: true });
      let adminExpanded = false;
      const adminToggle = button('Open admin tools', () => { adminExpanded = !adminExpanded; if (adminExpanded) actions.admin('listRooms'); update(); }, 'purple');
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
        notice, adminToggle, admin, h('div', { class: 'leave-row' }, button('Leave room', actions.leave, 'red')), version, secret);
      let adminKey = '';
      let lastRoomRequest = 0;
      const roomsView = h('div', { class: 'admin-room-list' });
      const leadersView = h('div', { class: 'admin-room-players' });
      const profileEditor = createAdminProfileEditor({ state, actions });
      let winTarget, winName, targetControl, selectedRoom = null;
      function selectAdminPlayer(person, roomCode = null) {
        state.adminProfile = null;
        actions.admin('getProfile', { id: person.id, roomCode: roomCode || state.adminRooms.find(room => room.players?.some(p => p.id === person.id))?.code });
        selectedRoom = roomCode || (state.players.has(person.id) ? state.code : state.adminRooms.find(room => room.players?.some(p => p.id === person.id))?.code || null);
        if (winTarget) { winTarget.value = person.id; winName.value = person.name; }
        if (targetControl && [...targetControl.options].some(option => option.value === person.id)) targetControl.value = person.id;
        admin.querySelector('.admin-target-note')?.replaceChildren(document.createTextNode(selectedRoom ? `Editing ${person.name}${selectedRoom !== state.code ? ` in ${selectedRoom}` : ''}.` : `${person.name} is offline. Load their saved profile to edit it.`));
      }
      function renderRooms() {
        const rows = state.adminRooms.map(room => {
          const join = button(room.code === state.code ? 'Here' : 'Join', () => actions.joinAdminRoom(room.code), room.code === state.code ? 'grey' : 'green');
          join.disabled = room.code === state.code;
          return h('div', { class: 'admin-room' },
            h('div', { class: 'admin-room-head' }, h('strong', {}, `${room.code} · ${room.public ? 'Public' : 'Private'} · ${room.humans} playing`), h('div', { class: 'host-tools' }, join,
              button('Shut down', async () => { if (await confirmDialog({ title: `Shut down ${room.code}?`, message: 'Everyone will leave this room. Any active game will be refunded.', ok: 'Shut down', tone: 'red' })) actions.admin('shutdownRoom', { code: room.code }); }, 'red'))),
            h('div', { class: 'admin-room-players' }, ...(room.players || []).map(person =>
              button(person.name, () => selectAdminPlayer(person, room.code), 'grey'))));
        });
        roomsView.replaceChildren(...(rows.length ? rows : [h('p', { class: 'panel-note' }, 'No rooms have players right now.')]));
        leadersView.replaceChildren(...(state.adminLeaders.length ? state.adminLeaders.map(person =>
          button(`${person.name} · ${person.wins}`, () => selectAdminPlayer(person), 'grey'))
          : [h('p', { class: 'panel-note' }, 'No leaderboard entries yet.')]));
      }
      function update() {
        playerList.set(profile.settings.playerListStyle); sound.set(profile.settings.sound); quality.set(profile.settings.quality); prefill.set(profile.settings.prefillPrefix); view.set(profile.settings.view === 'first' ? 'first' : 'third');
        const host = state.hostId === state.you || state.isAdmin;
        notice.textContent = host ? 'Change match rules in Game Settings.' : 'Only the host can change game rules. Your personal settings above are always yours to change.';
        notice.classList.toggle('restricted', !host);
        version.textContent = `v2.0 · ${actions.ping() ?? '—'} ms`;
        if (state.unlockFailed) { replay(version, 'shake'); state.unlockFailed = false; }
        adminToggle.hidden = !state.isAdmin;
        adminToggle.textContent = adminExpanded ? 'Close admin tools' : 'Open admin tools';
        admin.hidden = !state.isAdmin || !adminExpanded;
        if (!state.isAdmin || !adminExpanded) return;
        if (Date.now() - lastRoomRequest > 15000) { lastRoomRequest = Date.now(); actions.admin('listRooms'); }
        renderRooms();
        profileEditor.update();
        const key = [...state.players.values()].map((p) => `${p.id}:${p.name}`).join('|');
        if (key === adminKey && admin.childElementCount) return;
        adminKey = key;
        const target = h('select', { class: 'field', 'aria-label': 'Admin target' }, [...state.players.values()].map((p) => h('option', { value: p.id }, p.name)));
        targetControl = target;
        if (selectedRoom === null && target.value) selectedRoom = state.code;
        winTarget = h('input', { class: 'field', value: target.value || '', placeholder: 'Player ID', 'aria-label': 'Player ID for wins' });
        winName = h('input', { class: 'field', value: state.players.get(target.value)?.name || '', placeholder: 'Player name', 'aria-label': 'Player name for wins' });
        const winAmount = h('input', { class: 'field', type: 'number', min: 0, max: 1000000000, step: 1, value: 0, 'aria-label': 'Wins to set' });
        target.addEventListener('change', () => { winTarget.value = target.value; winName.value = state.players.get(target.value)?.name || ''; selectedRoom = state.code; selectAdminPlayer(state.players.get(target.value), state.code); });
        const amount = h('input', { class: 'field', type: 'number', min: -1000000000, max: 1000000000, value: 100, 'aria-label': 'Coin amount, negative to remove' });
        const card = h('select', { class: 'field', 'aria-label': 'Card to add' }, CARDS.map(v => h('option', { value: v.id }, v.name)));
        const freeMerge = h('input', { type: 'checkbox', checked: !!state.adminFreeMerge, onChange: e => { state.adminFreeMerge = e.target.checked; actions.refreshPanels(); } });
        const announcement = h('input', { class: 'field', maxlength: 120, placeholder: 'Announcement', 'aria-label': 'Announcement' });
        const animationToggle=h('input',{type:'checkbox',checked:!!state.showAnimationTester,'aria-label':'Show animation tester',onChange:e=>actions.toggleAnimationTester(e.target.checked)});
        const tag = h('input', { type: 'checkbox', 'aria-label': 'Show admin tag', onChange: (e) => actions.admin('tag', { on: e.target.checked }) });
        admin.replaceChildren(row('Preview player list in game', h('div', {class:'seg'}, button('Classic',()=>actions.preference('playerListStyle','classic')),button('Slim roster',()=>actions.preference('playerListStyle','compact')))),button('Test animations',actions.testAnimations,'purple'),row('Show / hide animation tester',animationToggle),h('h3', { class: 'section-title stroke' }, 'Admin'),
          h('div', { class: 'host-tools' }, button('Take host', () => actions.admin('takeHost')), button('Force start', () => actions.admin('forceStart')),
            button('End match', () => actions.admin('endMatch'), 'red'), button('Reset room', () => actions.admin('reset'), 'red')),
          profileEditor.el, h('div', { class: 'set-group' }, row('Player', target), h('p', { class: 'admin-target-note panel-note' }, 'Choose a player here or click one below.'), row('Coin amount (+/−)', amount),
            h('div', { class: 'host-tools' }, button('Set coins', () => { if(selectedRoom) actions.admin('coins', { id: winTarget.value, roomCode: selectedRoom, operation: 'set', amount: Number(amount.value) }); }),
              button('Add / remove coins', () => { if(selectedRoom) actions.admin('coins', { id: winTarget.value, roomCode: selectedRoom, operation: 'add', amount: Number(amount.value) }); }),
              button('Teleport to player', () => actions.teleportToPlayer(target.value))),
            row('Set player wins · ID', winTarget), row('Player name', winName), row('New wins', winAmount),
            button('Set wins and sync profile', async () => {
              const id = winTarget.value.trim(), wins = Number(winAmount.value);
              if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !Number.isSafeInteger(wins) || wins < 0 || wins > 1000000000) return;
              if (await confirmDialog({ title: 'Set player wins?', message: `Set ${winName.value || id} to ${wins} wins on their profile and the global leaderboard?`, ok: 'Set wins', tone: 'red' })) actions.admin('setWins', { id, name: winName.value, wins });
            }, 'red'),
            row('Free card', card), button('Add card for free', () => { if(selectedRoom) actions.admin('addCard', { id: winTarget.value, roomCode: selectedRoom, cardId: card.value }); }, 'purple'),
            row('Free admin merges', freeMerge),
            row('Announcement', announcement), h('div', { class: 'host-tools' }, button('Announce in room', () => { actions.admin('announce', { text: announcement.value }); announcement.value = ''; }),
              button('Announce globally', () => { actions.admin('announce', { text: announcement.value, global: true }); announcement.value = ''; }, 'purple')), row('Show ADMIN tag', tag),
            h('h3', { class: 'section-title stroke' }, 'Open rooms'), button('Refresh rooms', () => { lastRoomRequest = Date.now(); actions.admin('listRooms'); }, 'blue'), roomsView,
            h('h3', { class: 'section-title stroke' }, 'Leaderboard players'), leadersView));
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
