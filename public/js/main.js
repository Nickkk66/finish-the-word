import { createAnimationTester } from './ui/animation-tester.js';
import { TIDE, TIDE_PHASES } from './shared/word-tide.js';
import { createPresenceCheck } from './ui/presence.js';
import { createTideHud } from './ui/word-tide.js';
import { isRouletteMode, fireDamage } from './shared/roulette.js';
// Boot + glue: profile → world (menu mode) → menu → connect → wire net <-> world <-> UI.

import { DEFAULT_SETTINGS, MAX_PLAYERS, SEAT_COUNT, PROTOCOL_VERSION, ROOM_CODE_REGEX, makeRoomCode, EMOTES, HINT_PRICE, OBBY } from './shared/constants.js';
import { LIGHTHOUSE_ROOM } from './world/lighthouse-interior.js';
import { BLOCKS, CHAIRS, PETS_BY_ID, BACK_BLING, CARDS_BY_ID, CARD_BOXES, rollBlock } from './shared/catalog.js';
import { tradeInventory } from './shared/trade.js';
import {
  profile, exportProfile, onProfileChange, setName, setLook, buyOrEquipChair, payForBlock, addPet, equipPet,
  recordWord, recordMatch, captureMatchProgress, finishMatchProgress, setSetting, claimFree, recordFreePlayTime, flushFreePlayTime, FREE_COINS,
  buyOrEquip, mergePet, deletePet, addCard, grantCard, refundMatch, consumeCard, reconcileCards, spendCoins, grantCoins, recordObby, level,
  adjustCoins, grantPetTier, setCapeColor, completeTrade, syncWins,
} from './profile.js';
import { createHandles, guestHandleToken } from './handles.js';
import { createAccount } from './account.js';
import { accountPanel } from './ui/panels/account.js';
import { createNet, apiUrl } from './net.js';
import { initAudio, setSoundEnabled, sfx } from './audio.js';
import { h, fmt, isTextField, formatDuration, replay } from './ui/dom.js';
import { trackViewport } from './ui/viewport.js';
import { createMenu, cleanCode } from './ui/menu.js';
import { createHud } from './ui/hud.js';
import { createRouletteHud } from './ui/roulette.js';
import { rouletteEntryDetails } from './ui/roulette-copy.js';
import { createPlayerList } from './ui/playerList.js';
import { createChat } from './ui/chat.js';
import { createSidebar } from './ui/sidebar.js';
import { createPanelHost } from './ui/panel.js';
import { chairsPanel } from './ui/panels/chairs.js';
import { petsPanel } from './ui/panels/pets.js';
import { freePanel } from './ui/panels/free.js';
import { settingsPanel, gameSettingsPanel } from './ui/panels/settings.js';
import { createCardTray } from './ui/card-tray.js';
import { cardsPanel } from './ui/panels/cards.js';
import { profilePanel } from './ui/panels/profile.js';
import { tradePanel } from './ui/panels/trade.js';
import { initFx, toast, banner, confetti, countdownPop, rewardPop } from './ui/fx.js';
import { initOverlays, setBusy, showError, confirmDialog, cancelConfirmation, closeOverlay } from './ui/overlays.js';
import { playHatch } from './ui/hatch.js';
import { cardArt } from './ui/art.js';

const RECONNECT_OVERLAY_DELAY_MS = 700;
const LOADOUT_DEBOUNCE_MS = 250;
const MATCH_PHASES = new Set(['choosing', 'typing', 'cardReveal', 'roundEnd', 'roulette', 'rouletteReveal', ...TIDE_PHASES]);
const TITLE = document.title;

const REASONS = {
  not_word: () => 'Not a word!',
  used: () => 'Already used!',
  wrong_start: () => `Must start with ${(state.match?.prefix || '').toUpperCase()}!`,
  too_short: () => 'Too short!',
  invalid_chars: () => 'Letters only!',
};
const ERRORS = {
  seat_taken: 'That seat is taken!',
  not_host: 'Only the host can do that.',
  rate_limited: 'Whoa, slow down!',
};

// ------------------------------------------------------------------ state

const state = {
  code: null,
  you: profile.id,
  hostId: null,
  settings: { ...DEFAULT_SETTINGS },
  players: new Map(),      // id -> Player
  match: null,             // last MatchState
  deadline: 0,             // performance.now() when the current phase ends
  inRoom: false,           // welcome received
  lastFail: null,          // last `fail` message (for the roundEnd status line)
  roundStartCount: null,   // match.wordCount when the current round started (null = unknown)
  rouletteShown: false, rouletteModeShown: null, rouletteEntry: 0, betPending: null,
  isAdmin: false, public: false, table: 'classic', zone: 'island',
  hintPending: null, hintWord: null, hintTurn: null, cardPending: null, cardUsedTurn: null,
  bannedPlayers: new Map(),
  adminRooms: [],
  adminLeaders: [],
  trade: null,
  tradePending: false,
};

const net = createNet();
const uiRoot = document.getElementById('ui');
let world = null;

// World-side bookkeeping so we only send changes.
const bubbles = new Set();         // ids with a speech bubble
let lastWord = null;               // { id, word } — the accepted word still shown in a bubble
let tileId = null;                 // who has the letter tile
let statusKeys = new Map();        // id -> JSON of the last setPlayerStatus
let leaderboardKey = '';
let shopKey = '';
let lastKeySound = 0;
let standPending = false;
let purchasePending = false;
let requestedPublic = false;
let teleporting = false;
let lastEmoteAt = 0;
let turnConfirmation = null;
let unlockToken = '';
let crateRevealOpen = false;
let targeting = null;
try { localStorage.removeItem('ftw_admin_v1'); } catch {}

async function purchase(item, commit, stillValid = () => true) {
  if (purchasePending || crateRevealOpen || state.hintPending) return false;
  if (profile.coins < item.price) { toast(`You need ${fmt(item.price - profile.coins)} more coins.`, 'bad'); return false; }
  purchasePending = true;
  try {
    const yes = await confirmDialog({ title: `Buy ${item.name}?`, message: `Price: ${fmt(item.price)} coins. Your balance: ${fmt(profile.coins)} coins.`, ok: 'Buy', tone: 'green' });
    if (!yes || !stillValid() || profile.coins < item.price) return false;
    return commit();
  } finally { purchasePending = false; }
}

function syncLoadout() { sendLoadout({ chair: profile.equippedChair, pet: profile.equippedPet, petTier: profile.equippedPetTier, back: profile.equippedBack, capeColor: profile.capeColor, level: level(), wins: profile.wins, cards: { ...profile.cards }, profile: exportProfile(), inventory: tradeInventory(profile) }); }

// ------------------------------------------------------------------ UI

initFx(uiRoot);
initOverlays(uiRoot);
trackViewport();
initAudio();
setSoundEnabled(profile.settings.sound);

const actions = {
  roulette(action) { net.send({ t: 'roulette', action, turnId: state.match?.turnId }); },
  async enterRoulette(amount = 25) {
    if (state.betPending) return;
    if (!Number.isSafeInteger(amount) || amount < 25 || amount > profile.coins) return toast('Enter a whole number from 25 up to your coin balance.', 'bad');
    if(profile.wins<1)return toast('Earn 1 trophy to play The Last Sip. You keep the trophy.','bad');
    if (!await confirmDialog({ title: 'Join the cursed table?', details: rouletteEntryDetails(amount), ok: 'Place entry', tone: 'purple' })) return;
    state.betPending = { requestId: crypto.randomUUID(), amount, balance: profile.coins };
    net.send({ t: 'bet', ...state.betPending }); refreshRoom();
  },
  openAccount() { panels.open(PANELS.account); },
  refreshPanels() { panels.refresh(); },
  closePanels() { panels.close(); cancelConfirmation(); },
  accountRegister: async credentials => {await handles.ensure();return account.register({...credentials,handleToken:guestHandleToken()});},
  accountReset: credentials => account.reset(credentials),
  accountRecovery: () => account.recovery(),
  async accountLogin(credentials) {
    if (await confirmDialog({ title: 'Load your account?', message: 'Your guest progress stays saved on this device. Logging in loads your account and returns you to the menu.', ok: 'Log in' })) await account.login(credentials);
  },
  accountLogout: () => account.logout(),
  async accountUseCloud() {
    if (await confirmDialog({ title: 'Load cloud progress?', message: 'This replaces the progress on this screen with your latest cloud save. A backup stays on this device.', ok: 'Load save' })) await account.useCloud();
  },
  chair(chairId) { return actions.cosmetic('chair', chairId); },
  async cosmetic(kind, id) {
    if (!['chair', 'back'].includes(kind)) return;
    const catalog = kind === 'chair' ? CHAIRS : BACK_BLING;
    const item = catalog.find((v) => v.id === id);
    if (!item) return;
    const owned = kind === 'chair' ? profile.ownedChairs : profile.ownedBacks;
    const finish = () => {
      const result = buyOrEquip(kind, id);
      if (result === 'poor' || result === 'invalid') return false;
      syncLoadout(); sfx.coin(); toast(`${item.name} ${result === 'bought' ? 'purchased and equipped' : 'equipped'}!`, 'good'); return true;
    };
    if (owned.includes(id)) return finish();
    if(item.secret)return toast('Secret accessories can only be given by an admin.','info');
    return purchase(item, finish);
  },
  async openBlock(blockId) {
    const block = BLOCKS.find((b) => b.id === blockId);
    if (!block) return;
    if (isAliveParticipant()) {
      toast('Finish your match first!', 'bad');
      return;
    }
    return purchase(block, () => {
    if (crateRevealOpen || !payForBlock(block)) return false;
    crateRevealOpen = true;
    const petId = rollBlock(block);
    addPet(petId);
    sidebar.markNew('pets');
    panels.close();
    net.send({ t: 'celebrate', kind: 'hatch' });
    playHatch(uiRoot, { thumbnail: actions.thumbnail, block, petId, count: profile.pets[petId], onClose: () => { crateRevealOpen = false; }, onEquip: () => actions.equipPet(petId) });
    return true;
    }, () => !isAliveParticipant() && state.inRoom);
  },
  equipPet(petId, tier = 1) {
    equipPet(petId, tier);
    syncLoadout();
    const pet = PETS_BY_ID[profile.equippedPet];
    toast(pet ? `${pet.name}, tier ${tier}, is following you!` : 'Pet unequipped.', pet ? 'good' : 'info');
  },
  async mergePet(id, tier) {
    const pet = PETS_BY_ID[id];
    const free = state.isAdmin && state.adminFreeMerge;
    if (!pet || tier >= 3 || (!free && profile.petTiers[id]?.[tier] < 3)) return;
    if (await confirmDialog({ title: `Merge ${pet.name}?`, message: free ? `Admin free merge: create one tier ${tier + 1} ${pet.name} without using copies.` : `Use 3 tier ${tier} copies to make 1 tier ${tier + 1} ${pet.name}. Abilities stay the same.`, ok: free ? 'Create free' : 'Merge 3', tone: 'purple' })) {
      if (free) net.send({ t: 'admin', action: 'freeMerge', petId: id, tier });
      else if (mergePet(id, tier)) { syncLoadout(); toast(`${pet.name} is now tier ${tier + 1}!`, 'good'); }
    }
  },
  async deletePet(id, tier) {
    if (await confirmDialog({ title: `Delete ${PETS_BY_ID[id].name}?`, message: `Remove 1 tier ${tier} copy permanently. You own ${profile.petTiers[id]?.[tier] || 0}.`, ok: 'Delete one' })) {
      if (deletePet(id, tier)) syncLoadout();
    }
  },
  async openCardBox(boxId) {
    const box = CARD_BOXES.find((v) => v.id === boxId);
    const available = () => state.inRoom && !(MATCH_PHASES.has(state.match?.phase) && state.match?.participants?.some(p => p.id === state.you && p.alive));
    if (!box || !available()) { toast('Open card boxes when you are not playing a match.', 'info'); return; }
    return purchase(box, () => {
      if (crateRevealOpen || !payForBlock(box)) return false;
      crateRevealOpen = true;
      const id = rollBlock(box); addCard(id); syncLoadout(); panels.close(); sidebar.markNew('cards');
      const card = CARDS_BY_ID[id]; sfx.hatch();
      net.send({ t: 'celebrate', kind: 'hatch' });
      const reveal = h('div', { class: 'card-reveal-front', hidden: true },
        h('div', { class: 'card-purchase-stamp stroke' }, 'NEW CARD!'),
        h('div', { class: 'overlay-title stroke' }, card.name), cardArt(card),
        h('span', { class: `card-rarity rarity-${card.rarity.toLowerCase()}` }, card.rarity),
        h('p', { class: 'overlay-text' }, card.description),
        h('button', { type: 'button', class: 'btn green', onClick: () => closeReveal() }, 'Nice!'));
      const mystery = h('div', { class: 'card-mystery', 'aria-hidden': 'true' }, '?');
      const overlay = h('div', { class: 'overlay card-reveal' }, h('div', { class: 'overlay-card' }, mystery, reveal));
      let revealed = false;
      const showReveal = () => { if (revealed) return; revealed = true; mystery.remove(); reveal.hidden = false; reveal.querySelector('button').focus({ preventScroll: true }); sfx.hatch(); confetti(60); toast(`${card.name} added to your cards!`, 'good', 4000); };
      const revealTimer = setTimeout(showReveal, 1050);
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!revealed) showReveal(); } };
      function closeReveal() { if (overlay.classList.contains('leaving')) return; crateRevealOpen = false; clearTimeout(revealTimer); document.removeEventListener('keydown', onKey, true); closeOverlay(overlay); }
      document.addEventListener('keydown', onKey, true);
      uiRoot.append(overlay);
      return true;
    }, available);
  },
  async hint() {
    const m = state.match;
    const tide = m?.phase === 'tideAnswer' && m.participants.some(p => p.id === state.you && p.alive);
    if ((!tide && (m?.phase !== 'typing' || m.typerId !== state.you)) || state.hintPending || state.hintTurn === m.turnId) return;
    const turnId = m.turnId;
    const price = tide ? TIDE.hintPrice : HINT_PRICE;
    if (profile.coins < price) return toast(`You need ${fmt(price - profile.coins)} more coins.`, 'bad');
    const requestId = crypto.randomUUID();
    state.hintPending = { requestId, turnId };
    setTimeout(() => { if (state.hintPending?.requestId === requestId) { state.hintPending = null; refreshRoom(); toast('Try Answer again.', 'info'); } }, 8000);
    if (!net.send({ t: 'hint', turnId, requestId, balance: profile.coins })) state.hintPending = null;
    hud.update(state); tideHud.update(state, state.settings.mode === 'word_tide');
  },
  beginCardTarget() { openCards(); },
  useCard(cardId, targetId) {
    if (state.cardPending) return;
    state.cardPending = { requestId: crypto.randomUUID(), matchId: state.match?.matchId, cardId, targetId, style: profile.settings.cardStyle };
    if (!net.send({ t: 'queueCard', ...state.cardPending })) state.cardPending = null;
    cardTray.update();
  },
  cancelQueuedCard() { actions.useCard(null, null); },
  setCardStyle(style) { setSetting('cardStyle', style); if (state.cardQueue) actions.useCard(state.cardQueue.cardId, state.cardQueue.targetId); },
  thumbnail: (kind, id, size) => world ? world.renderThumbnail(kind, id, size) : Promise.reject(new Error('World not ready')),
  preference: setSetting,
  setView(view) { world?.setFirstPerson(view === 'first'); setSetting('view', view); if (view === 'first') toast('First-person view. Press P to return to third person.', 'info', 5000); },
  returnToIsland() { if (state.zone === 'obby' || state.zone === 'lighthouse') return onInteract({ type: 'portal', to: 'island' }); },
  unlock: (code) => net.send({ t: 'unlock', code }),
  testAnimations() { if(!state.isAdmin)return;state.showAnimationTester=true;animationTester.toggle(true);panels.close(); },
  toggleAnimationTester(on) { if (!state.isAdmin) return;state.showAnimationTester=!!on;animationTester.toggle(on); },
  admin: (action, fields = {}) => net.send({ t: 'admin', action, ...fields }),
  async joinAdminRoom(code) {
    if (!ROOM_CODE_REGEX.test(code) || code === state.code) return;
    if (isAliveParticipant() && !(await confirmForfeit(`Leave this game and join ${code}?`, 'Join room'))) return;
    leaveRoom();
    await joinRoom(code, code === 'PUBLIC');
  },
  teleportToPlayer(id) {
    const x = state.players.get(id)?.pos?.x;
    if (!Number.isFinite(x)) return;
    state.zone = x > 400 ? 'obby' : x > 250 ? 'lighthouse' : 'island';
    world.teleportToPlayer(id);
    hud.update(state);
  },
  async moderate(action, id) {
    if (action === 'unban' || await confirmDialog({ title: `${action === 'ban' ? 'Ban' : 'Kick'} ${nameOf(id)}?`, message: action === 'ban' ? 'They cannot rejoin this room.' : 'They will leave this room and the current match.', ok: action === 'ban' ? 'Ban' : 'Kick' })) return net.send({ t: 'mod', action, id });
    return false;
  },
  claimFree(anchor) {
    if (!claimFree()) return;
    sfx.coin();
    rewardPop(`+${FREE_COINS} 💵`, anchor);
  },
  setSound(on) {
    setSetting('sound', on);
    setSoundEnabled(on);
  },
  setQuality(level) {
    setSetting('quality', level);
    world?.setQuality(level);
  },
  hostSettings(patch) {
    net.send({ t: 'host', action: 'settings', settings: patch });
  },
  host(action) {
    net.send({ t: 'host', action });
  },
  async leave() {
    if (isAliveParticipant() && !(await confirmForfeit('Leave the room?', 'Leave'))) return;
    leaveRoom();
  },
  async rename(name) {
    try{await handles.rename(name);return true;}catch(error){toast(error.message,'bad');return false;}
  },
  setLook(look) {
    setLook(look);
    sendLoadout({ look: profile.look });
  },
  setCapeColor(color) {
    if (setCapeColor(color)) sendLoadout({ capeColor: profile.capeColor });
  },
  ping: () => net.rtt,
  tradeRequest(targetId) { net.send({ t: 'tradeRequest', targetId }); },
  tradeRespond(id, accept) { net.send({ t: 'tradeRespond', id, accept }); },
  tradeOffer(offer) { if (state.trade && !state.tradePending) { state.tradePending = true; panels.refresh(); net.send({ t: 'tradeOffer', id: state.trade.id, offer, profile: exportProfile(), inventory: tradeInventory(profile) }); } },
  tradeAccept(id) { if (!state.tradePending) net.send({ t: 'tradeAccept', id, profile: exportProfile(), inventory: tradeInventory(profile) }); },
  tradeUnaccept(id) { net.send({ t: 'tradeUnaccept', id }); },
  tradeCancel(id) { net.send({ t: 'tradeCancel', id }); },
  async sellWins() {
    if (!state.inRoom || state.account?.status !== 'saved') return toast('Sign in and enter a room to sell wins.', 'bad');
    if (profile.wins < 5) return toast('You need 5 wins to sell.', 'bad');
    if (await confirmDialog({ title: 'Sell 5 wins?', message: 'Your profile and leaderboard will lose 5 wins. You will receive 1,000 coins.', ok: 'Sell wins', tone: 'orange' })) net.send({ t: 'sellWins', requestId: crypto.randomUUID() });
  },
};

const panelCtx = { state, actions };
const PANELS = {
  chairs: chairsPanel(panelCtx),
  pets: petsPanel(panelCtx),
  free: freePanel(panelCtx),
  profile: profilePanel(panelCtx),
  settings: settingsPanel(panelCtx),
  gameSettings: gameSettingsPanel(panelCtx),
  cards: cardsPanel(panelCtx),
  trade: tradePanel(panelCtx),
  account: accountPanel(panelCtx),
};

const hud = createHud({ onSubmit: submitWord, onTyping: sendTyping, onPick: (letter) => net.send({ t: 'pick', letter }), onHint: actions.hint, onCards: openCards, onReturn: actions.returnToIsland });
const cardTray = createCardTray(uiRoot, state, actions);
function openCards() {
  if (MATCH_PHASES.has(state.match?.phase)) { panels.close(); cardTray.toggle(); }
  else panels.open(PANELS.cards);
}
const rouletteHud = createRouletteHud({ onAction: actions.roulette, onEnter: actions.enterRoulette, onStart: () => actions.host('start') });
const playerList = createPlayerList();
const chat = createChat({ onSend: sendChat, onEmote: playEmote });
const panels = createPanelHost(uiRoot);
const sidebar = createSidebar({ onInvite: invite, openPanel: (id) => id === 'cards' ? openCards() : panels.open(PANELS[id]), onView: toggleView });
const tideHud = createTideHud({ onHint: actions.hint, onGiveUp: () => onInteract({type:'stand'}), send: msg => net.send(msg), start: () => actions.host('start') });
const presenceCheck = createPresenceCheck({ net, inRoom: () => state.inRoom });
const gameUi = h('div', { class: 'game-ui', hidden: true }, hud.el, rouletteHud.el, tideHud.el, playerList.el, chat.el, sidebar.el);

const invited = cleanCode(new URLSearchParams(location.search).get('room'));
const menu = createMenu({
  invitedCode: ROOM_CODE_REGEX.test(invited) ? invited : null,
  actions: { rename: actions.rename, play: joinRoom, quickplay, openAccount: actions.openAccount, toggleSound: () => actions.setSound(!profile.settings.sound) },
});
uiRoot.prepend(gameUi, menu.el);
const animationTester=createAnimationTester({state,preview:match=>{state.animationPreview=match;refreshMode();}});uiRoot.append(animationTester.el);

// Button click sound everywhere in the UI.
uiRoot.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button:not(:disabled)')) sfx.click();
});

// WASD must not move the avatar while any text field has focus.
function syncWorldInput() {
  world?.setInputEnabled(!isTextField(document.activeElement));
}
document.addEventListener('focusin', syncWorldInput);
document.addEventListener('focusout', () => setTimeout(syncWorldInput, 0));
document.addEventListener('keydown', (e) => {
  if (e.code==='Space' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && state.inRoom && !state.animationPreview && state.match?.mode==='word_tide' && isAliveParticipant() && !isTextField(e.target) && !isTextField(document.activeElement) && !document.querySelector('.panel-layer:not([hidden]),.overlay:not(.leaving):not([hidden])')) {
    e.preventDefault();e.stopPropagation();onInteract({type:'stand'});return;
  }
  if (e.key === 'Escape') { cancelCardTarget(); cardTray.close(); }
  if (e.key.toLowerCase() === 'c' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && state.inRoom && !isTextField(document.activeElement) && !document.querySelector('.overlay:not(.leaving)')) {
    e.preventDefault(); openCards(); return;
  }
  if (e.key.toLowerCase() !== 'p' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !state.inRoom || isTextField(document.activeElement) || isMyTurn(state.match || {}) || state.match?.phase === 'choosing' || document.querySelector('.overlay:not(.leaving):not([hidden])')) return;
  e.preventDefault(); toggleView();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) document.title = TITLE;
});

let profileSnapshotTimer;
onProfileChange(() => {
  clearTimeout(profileSnapshotTimer);
  profileSnapshotTimer = setTimeout(() => { if (state.inRoom) net.send({ t: 'loadout', profile: exportProfile() }); }, 200);
  sidebar.update();
  menu.refresh();
  panels.refresh();
  setSoundEnabled(profile.settings.sound);
  syncShop();
  world?.setPetCollection(profile.discoveredPets);
  world?.setQuality(profile.settings.quality);
  if (!state.inRoom) state.you = profile.id;
  if (state.inRoom) { hud.update(state); playerList.update(state); }
});

// ------------------------------------------------------------------ world

const worldReady = loadWorld();
const account = createAccount({
  onChange(value) { state.account = value; panels.refresh(); if (value.status === 'saved') syncRemoteWins(); },
  beforeReplace() {
    if (state.inRoom || state.code) leaveRoom();
    shopKey = '';
  },
});

async function loadWorld() {
  const stub = new URLSearchParams(location.search).has('stubworld');
  try {
    const { createWorld } = await import(stub ? '../dev/stub-world.js' : './world/world.js');
    const w = await createWorld({ container: document.getElementById('game'), labelLayer: document.getElementById('labels') });
    world = w;
    w.setQuality(profile.settings.quality);
    w.setMenuMode(true);
    w.setFirstPerson(profile.settings.view === 'first');
    sidebar.setView(profile.settings.view === 'first');
    w.onViewChange((on) => { setSetting('view', on ? 'first' : 'third'); sidebar.setView(on); });
    w.setPetCollection(profile.discoveredPets);
    w.setLeaderboardTitle('MOST WINS · ALL TIME');
    w.onLocalMove((move) => net.send({ t: 'move', ...move }));
    w.onInteract(onInteract);
    w.onRouletteShock?.(id => { replay(gameUi,'roulette-shock'); if(id===state.you)replay(gameUi,'damage-hit'); });
    w.setPromptResolver(resolvePrompt);
    syncShop();
    w.start();
    return w;
  } catch (err) {
    console.error('World failed to start', err);
    setBusy(null);
    showError({
      title: "Couldn't start the 3D world",
      message: 'Your browser may not support WebGL, or the game failed to load. Try reloading or another browser.',
      buttons: [{ label: 'Reload', tone: 'green', onClick: () => location.reload() }],
    });
    throw err;
  }
}

function syncShop() {
  const key = `${profile.ownedChairs.join(',')}|${profile.equippedChair}`;
  if (!world || key === shopKey) return;
  shopKey = key;
  world.setShopState({ ownedChairs: [...profile.ownedChairs], equippedChair: profile.equippedChair });
}

async function syncLeaderboard() {
  if (!world || !state.inRoom || Date.now() - Number(leaderboardKey || 0) < 10000) return;
  leaderboardKey = String(Date.now());
  try {
    const response = await fetch(apiUrl('/api/leaderboard'));
    if (!response.ok) return;
    const { top } = await response.json();
    if (Array.isArray(top)) world.setLeaderboard(top);
  } catch { /* keep last known board while offline */ }
}
setInterval(syncLeaderboard, 60000);

async function syncRemoteWins() {
  const id = profile.id;
  try {
    const response = await fetch(apiUrl(`/api/wins?id=${encodeURIComponent(id)}`));
    if (!response.ok || profile.id !== id) return;
    const value = await response.json();
    if (profile.id === id && syncWins(value) && state.inRoom) syncLoadout();
  } catch { /* retry on the next poll */ }
}
setInterval(syncRemoteWins, 10000);
const handles=createHandles({account});
account.ready.then(syncRemoteWins).catch(() => {});

function toggleView() {
  if (!state.inRoom) return;
  const on = profile.settings.view !== 'first';
  world.setFirstPerson(on); setSetting('view', on ? 'first' : 'third'); sidebar.setView(on);
  if (on) toast('First-person view. Press P to return to third person.', 'info', 5000);
}

function cancelCardTarget() {
  targeting?.el.remove();
  targeting = null;
  world?.cancelCardTargeting?.();
}

function playEmote(name) {
  if (!EMOTES.includes(name)) return;
  if (performance.now() - lastEmoteAt < 1000) return;
  lastEmoteAt = performance.now();
  world.playEmote(state.you, name); net.send({ t: 'emote', name });
}

function sendChat(text) {
  const command = text.match(/^\/(?:emote\s+|e\s*)(.*)$/i);
  if (!command) { net.send({ t: 'chat', text }); return; }
  const name = command[1].toLowerCase().replace(/\s+/g, '');
  if (EMOTES.includes(name)) playEmote(name);
  else chat.add({ system: true, text: `Emotes: ${EMOTES.join(', ')}. Try /e dance.` });
}

async function quickplay() {
  try {
    const response = await fetch(apiUrl('/api/quickplay'));
    if (!response.ok) throw new Error('Unavailable');
    const { code } = await response.json();
    if (!ROOM_CODE_REGEX.test(code)) throw new Error('Invalid room');
    await joinRoom(code, true);
  } catch { toast('Public games are unavailable. Try again shortly.', 'bad'); }
}

function setBubble(id, bubble) {
  world.setBubble(id, bubble);
  if (bubble) bubbles.add(id);
  else bubbles.delete(id);
}

function clearBubbles() {
  for (const id of bubbles) world.setBubble(id, null);
  bubbles.clear();
  lastWord = null;
}

function syncTile(m) {
  const owner = m.phase === 'typing' ? m.typerId : null;
  if (tileId && tileId !== owner && state.players.has(tileId)) world.setLetterTile(tileId, null);
  if (owner) world.setLetterTile(owner, m.prefix.toUpperCase());
  tileId = owner;
}

function syncStatuses(m) {
  const next = new Map();
  if (MATCH_PHASES.has(m.phase) || m.phase === 'ended') {
    for (const p of m.participants) {
      const turn = (['typing', 'roulette'].includes(m.phase) && p.id === m.typerId) || (m.phase === 'choosing' && p.id === m.chooserId);
      next.set(p.id, { turn, out: !p.alive, hearts: p.hearts, combo: p.combo || 0, roulette: isRouletteMode(m.mode) });
    }
  }
  for (const id of statusKeys.keys()) {
    if (!next.has(id) && state.players.has(id)) world.setPlayerStatus(id, { turn: false, out: false, hearts: null });
  }
  const keys = new Map();
  for (const [id, status] of next) {
    const key = JSON.stringify(status);
    keys.set(id, key);
    if (statusKeys.get(id) !== key && state.players.has(id)) world.setPlayerStatus(id, status);
  }
  statusKeys = keys;
}

function upsertPlayer(p) {
  if (state.players.has(p.id)) world.updatePlayer(p);
  else world.addPlayer(p);
  state.players.set(p.id, p);
}

function removePlayer(id) {
  if (!state.players.has(id)) return;
  world.removePlayer(id);
  state.players.delete(id);
  bubbles.delete(id);
  statusKeys.delete(id);
  if (tileId === id) tileId = null;
  if (lastWord?.id === id) lastWord = null;
}

// ------------------------------------------------------------------ interactions

function isAliveParticipant() {
  const m = state.match;
  return !!m && MATCH_PHASES.has(m.phase) && m.participants.some((p) => p.id === state.you && p.alive);
}

function confirmForfeit(title, ok) {
  return confirmDialog({ title, message: "You're still in the match — leaving now knocks you out.", ok, cancel: 'Keep playing' });
}

async function onInteract(i) {
  if (!state.inRoom) return;
  if (i.type === 'meteor') { net.send({t:'collectMeteor',id:i.id});
  } else if (i.type === 'seat') {
    net.send({ t: 'sit', seat: i.seat });
  } else if (i.type === 'stand') {
    if (standPending) return;
    standPending = true;
    const standingMatch=state.match?.matchId;
    const pendingEntry = state.players.get(state.you)?.rouletteBet;
    const ok = isAliveParticipant()
      ? await confirmForfeit('Stand up?', 'Stand up')
      : pendingEntry ? await confirmDialog({ title: 'Leave your seat?', message: `Your ${fmt(pendingEntry)} coin entry stays committed. Sit again to play, or leave and forfeit it.`, ok: 'Stand up' }) : true;
    standPending = false;
    if (ok && state.inRoom && standingMatch===state.match?.matchId && (!state.match?.tide || isAliveParticipant())) net.send({ t: 'stand' });
  } else if (i.type === 'shopChair') {
    actions.chair(i.chairId);
  } else if (i.type === 'block') {
    actions.openBlock(i.blockId);
  } else if (i.type === 'cardBox') {
    actions.openCardBox(i.boxId);
  } else if (i.type === 'portal' || i.type === 'lighthouseDoor') {
    if (teleporting || isAliveParticipant()) return;
    if((state.players.get(state.you)?.seat??-1)>=0){toast('Stand up to leave the table.', 'info');return;}
    teleporting = true;
    net.send({ t: 'celebrate', kind: 'portal', to: i.to });
    world.setTravelLocked(true);
    // A rejected or lost request must never teleport the client on its own.
    setTimeout(()=>{if(teleporting){teleporting=false;world.setTravelLocked(false);}},3500);
  } else if (i.type === 'obbyFinish') {
    recordObby(i.ms); net.send({ t: 'obby', event: 'finish', ms: i.ms });
    toast(`Obby finished in ${formatDuration(i.ms)}!`, 'good');
  } else if (i.type === 'obbyRespawn') {
    const flash = h('div', { class: 'respawn-flash' }); uiRoot.append(flash); setTimeout(() => flash.remove(), 450);
  }
}

function resolvePrompt(i) {
  if (i.type === 'meteor') return {text:'Collect +150 coins',key:'E',enabled:true};
  if (i.type === 'seat') {
    const me = state.players.get(state.you);
    if (!me || me.seat >= 0) return null;
    for (const p of state.players.values()) if (p.seat === i.seat) return null;
    return { text: 'Sit', key: 'E', enabled: true };
  }
  if (i.type === 'stand') {
    return (state.players.get(state.you)?.seat ?? -1) >= 0 ? { text: 'Stand up', key: 'Space', enabled: true } : null;
  }
  if (i.type === 'shopChair') {
    const chair = CHAIRS.find((c) => c.id === i.chairId);
    if (!chair) return null;
    if (profile.equippedChair === chair.id) return { text: 'Equipped', key: 'E', enabled: false };
    if (profile.ownedChairs.includes(chair.id)) return { text: 'Equip', key: 'E', enabled: true };
    return { text: `Buy $${fmt(chair.price)}`, key: 'E', enabled: profile.coins >= chair.price };
  }
  if (i.type === 'block') {
    const block = BLOCKS.find((b) => b.id === i.blockId);
    return block ? { text: `Open $${fmt(block.price)}`, key: 'E', enabled: profile.coins >= block.price } : null;
  }
  if (i.type === 'cardBox') {
    const box = CARD_BOXES.find((v) => v.id === i.boxId);
    return box ? { text: `Cards · $${fmt(box.price)}`, key: 'E', enabled: profile.coins >= box.price && !isAliveParticipant() } : null;
  }
  if (i.type === 'portal') return { text: i.to === 'obby' ? 'Travel to obby' : 'Return to island', key: 'E', enabled: !isAliveParticipant() };
  if (i.type === 'lighthouseDoor') return { text: i.to === 'lighthouse' ? 'Enter lighthouse' : 'Leave lighthouse', key: 'E', enabled: !isAliveParticipant() };
  return null;
}

let pendingLoadout = null;
let loadoutTimer = 0;
function sendLoadout(patch) {
  pendingLoadout = { ...pendingLoadout, ...patch };
  clearTimeout(loadoutTimer);
  loadoutTimer = setTimeout(() => {
    net.send({ t: 'loadout', ...pendingLoadout });
    pendingLoadout = null;
  }, LOADOUT_DEBOUNCE_MS);
}

function sendTyping(text) {
  net.send({ t: 'typing', text });
  setBubble(state.you, text ? { text: text.toUpperCase(), highlight: 0, tone: 'normal' } : null);
}

function submitWord(word) {
  net.send({ t: 'submit', word });
}

function fallbackCopy(text) {
  const ta = h('textarea', { style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function invite() {
  if (!state.code) return;
  // Keep the page path so links work when the game is served from a subfolder (GitHub Pages).
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', state.code);
  const link = url.href;
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    copied = fallbackCopy(link);
  }
  sidebar.showInvite({ code: state.code, link, copied });
}

// ------------------------------------------------------------------ joining / leaving

function hello() {
  return {
    t: 'hello',
    id: profile.id,
    inputDevice:matchMedia('(pointer: fine)').matches&&!navigator.maxTouchPoints?'desktop':'touch',
    name: profile.name,
    look: profile.look,
    chair: profile.equippedChair,
    pet: profile.equippedPet,
    petTier: profile.equippedPetTier, back: profile.equippedBack, capeColor: profile.capeColor, level: level(),
    wins: profile.wins,
    cards: { ...profile.cards }, profile: exportProfile(), inventory: tradeInventory(profile), adminToken: unlockToken || undefined, accountToken: account.token() || undefined, handleToken: handles.token() || undefined, public: requestedPublic,
    v: PROTOCOL_VERSION,
  };
}

function setUrlRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

async function joinRoom(code, isPublic = false) {
  requestedPublic = isPublic;
  const roomCode = code || makeRoomCode();
  if (!world) setBusy('Loading...');
  try {
    await Promise.all([worldReady, account.ready]);
    await handles.ensure();
  } catch {
    toast('Could not join. Your handle may be taken or the connection is unavailable. Try changing your handle.','bad');return;
  }
  state.code = roomCode;
  setUrlRoom(roomCode);
  menu.hide();
  setBusy('Joining room...', { action: { label: 'Cancel', onClick: leaveRoom } });
  net.connect(roomCode, hello);
}

/** Tears the room down locally and returns to the menu (the socket must already be closed). */
function exitRoom() {
  flushFreePlayTime();
  presenceCheck.hide();
  state.trade = null;
  state.tradePending = false;
  state.adminProfile = null;
  state.adminProfiles = [];
  state.adminRooms = [];
  state.adminLeaders = [];
  cancelCardTarget();
  cardTray.close(); world?.clearCards(); state.cardQueue = null;
  animationTester.stop();state.showAnimationTester=false;animationTester.toggle(false);
  cancelConfirmation(); state.hintPending = null; state.cardPending = null;
  state.bannedPlayers.clear();
  for (const id of [...state.players.keys()]) removePlayer(id);
  Object.assign(state, {
    code: null, hostId: null, settings: { ...DEFAULT_SETTINGS }, match: null, deadline: 0,
    inRoom: false, lastFail: null, roundStartCount: null, rouletteShown: false, rouletteModeShown: null, rouletteEntry: 0, betPending: null,
    isAdmin: false, public: false, zone: 'island', hintWord: null, hintTurn: null, cardUsedTurn: null,
  });
  bubbles.clear();
  statusKeys = new Map();
  lastWord = null;
  tileId = null;
  leaderboardKey = '';
  world.setLeaderboard([]);
  world.setMenuMode(true);
  world.setRoulette?.(false, null);
  world.clearCards();
  rouletteHud.update(state, false);
  tideHud.update(state, false); world?.setTide?.(null); document.body.classList.remove("tide-scene", "tide-cinema");
  world.setZone('island');
  teleporting=false;world.setTravelLocked(false);travelOverlay?.remove();
  panels.close();
  hud.hide();
  chat.clear();
  gameUi.hidden = true;
  document.title = TITLE;
  setUrlRoom(null);
  menu.show();
}

function leaveRoom() {
  net.close();
  setBusy(null);
  exitRoom();
}

const CLOSE_REASONS = {
  room_shutdown: { title: 'Room shut down', message: 'The room was shut down. You can join another room or create a new one.' },
  inactive: { title: 'Removed for inactivity', message: 'You did not respond to the 30-second check. Join a room again when you are ready to play.' },
  automated_activity:{title:'Repeated movement detected',message:'You were removed after a sustained automated movement loop without gameplay.'},
  kicked: { title: 'Removed from room', message: 'You were kicked by the room owner.' },
  banned: { title: 'Banned from room', message: 'You were banned by the room owner. You can join another room.' },
  room_full: {
    title: 'Room is full',
    message: `This table already has ${MAX_PLAYERS} players. Try another room or create your own!`,
  },
  bad_hello: {
    title: "Couldn't join",
    message: 'The game was updated. Refresh the page to get the latest version.',
    retry: { label: 'Refresh', onClick: () => location.reload() },
  },
  rejected: {
    title: "Couldn't join",
    message: 'The room refused the connection. Try again in a moment or create a new game.',
    retry: { label: 'Try again', rejoin: true },
  },
  bad_code: {
    title: 'Invalid room code',
    message: 'That room code does not exist. Check the invite link or create a new game.',
  },
  replaced: {
    title: 'Playing in another tab',
    message: 'You opened this room in another tab or window, so this one was disconnected.',
    retry: { label: 'Play here', rejoin: true },
  },
};

let rewardConnected = false;
let rewardTickAt = performance.now();
setInterval(() => {
  const now = performance.now();
  if (state.inRoom && rewardConnected) recordFreePlayTime(Math.min(2000, now - rewardTickAt));
  rewardTickAt = now;
}, 1000);
net.onState((s, reason) => {
  rewardConnected = s === 'open';
  rewardTickAt = performance.now();
  if (s === 'open') {
    setBusy(null);
  } else if (s === 'reconnecting' && state.inRoom) {
    setBusy('Reconnecting...', { delay: RECONNECT_OVERLAY_DELAY_MS, action: { label: 'Leave', onClick: leaveRoom } });
  } else if (s === 'closed' && reason !== 'user') {
    if (reason === 'bad_hello') {
      const marker = `ftw_reloaded_protocol_${PROTOCOL_VERSION}`;
      try { if (!sessionStorage.getItem(marker)) { sessionStorage.setItem(marker, '1'); location.reload(); return; } } catch { /* refresh remains available below */ }
    }
    const info = CLOSE_REASONS[reason] || { title: 'Disconnected', message: 'Lost the connection to the room.' };
    const code = state.code;
    setBusy(null);
    exitRoom();
    const buttons = [{ label: 'Menu', tone: 'grey' }];
    if (info.retry) {
      buttons.push({
        label: info.retry.label,
        tone: 'green',
        onClick: info.retry.rejoin ? () => joinRoom(code) : info.retry.onClick,
      });
    }
    showError({ title: info.title, message: info.message, buttons });
  }
});

// ------------------------------------------------------------------ server messages

const nameOf = (id) => state.players.get(id)?.name ?? 'Someone';

function refreshRoom() {
  animationTester.update();
  hud.update(state);
  refreshMode();
  playerList.update(state);
  cardTray.update();
  panels.refresh();
  syncLeaderboard();
  sidebar.setRole(state.hostId === state.you || state.isAdmin);
}
let rouletteIntroTimer=0, rouletteIntroElement=null;
function clearRouletteIntro(){clearTimeout(rouletteIntroTimer);rouletteIntroTimer=0;rouletteIntroElement?.remove();rouletteIntroElement=null;uiRoot.classList.remove('roulette-cinematic');}
function refreshMode() {
  const m = state.animationPreview || state.match;
  const shownState = state.animationPreview ? {...state,localPreview:true,match:m,deadline:performance.now()+m.phaseEndsIn} : state;
  const active = state.inRoom && (MATCH_PHASES.has(m?.phase) || m?.phase === 'ended' ? isRouletteMode(m.mode) : isRouletteMode(state.settings.mode));
  rouletteHud.update(state, active && state.zone!=='lighthouse');
  const tideMode = state.inRoom && (MATCH_PHASES.has(m?.phase) || m?.phase === 'ended' ? m.mode : state.settings.mode) === 'word_tide';
  tideHud.update(shownState, tideMode);
  world?.setTide?.(tideMode && m?.tide ? m : null);
  document.body.classList.toggle('tide-scene', !!(tideMode && m?.tide));
  document.body.classList.toggle('tide-cinema', !!(tideMode && m?.phase === 'tideIntro'));
  if (tideMode || active && state.zone!=='lighthouse') hud.hide(); else if (state.inRoom) hud.show();
  world?.setRoulette?.(active, m, state.rouletteEntry, MATCH_PHASES.has(m?.phase) || m?.phase === 'ended' ? m.mode : state.settings.mode);
  const rouletteMode = MATCH_PHASES.has(m?.phase) || m?.phase === 'ended' ? m.mode : state.settings.mode;
  if (active && (!state.rouletteShown || state.rouletteModeShown !== rouletteMode) && state.zone!=='lighthouse') {
    panels.close(); cancelConfirmation();
    clearRouletteIntro();uiRoot.classList.add('roulette-cinematic');
    rouletteIntroElement=h('div',{class:'roulette-intro'},'Something has found us.');uiRoot.append(rouletteIntroElement);
    rouletteIntroTimer=setTimeout(clearRouletteIntro,17000);
  }
  if (!active) clearRouletteIntro();
  state.rouletteShown=active; state.rouletteModeShown=active?rouletteMode:null;
}

net.on('welcome', (msg) => {
  if (msg.cards) reconcileCards(msg.cards, msg.cardReceipts);
  state.cardQueue = msg.cardQueue; state.cardPending = null;
  state.you = msg.you;
  const identity=msg.players.find(p=>p.id===msg.you);if(identity)setName(identity.name);
  state.code = msg.code;
  state.hostId = msg.hostId;
  state.isAdmin = !!msg.isAdmin;
  state.public = !!msg.public;
  state.table = msg.table || 'classic';
  world.setTable(state.table);
  state.settings = { ...DEFAULT_SETTINGS, ...msg.settings };
  state.rouletteEntry = msg.rouletteEntry || 0;
  world?.setMeteor(msg.meteor);
  const incoming = new Set(msg.players.map((p) => p.id));
  for (const id of [...state.players.keys()]) if (!incoming.has(id)) removePlayer(id);
  for (const p of msg.players) upsertPlayer(p);
  world.setLocalPlayer(state.you);
  state.zone=msg.zone || 'island';world.setZone(state.zone);
  const own=msg.players.find(p=>p.id===msg.you);if(own?.pos&&own.seat<0)world.teleportLocal(own.pos);
  teleporting=false;world.setTravelLocked(false);
  clearBubbles();
  state.lastFail = null;
  state.roundStartCount = null;
  if (!state.inRoom) {
    state.inRoom = true;
    setUrlRoom(msg.code);
    world.setMenuMode(false);
    menu.hide();
    gameUi.hidden = false;
    hud.show();
    chat.add({ system: true, text: `Welcome to room ${msg.code}! Press Invite to bring friends.` });
  }
  applyMatch(msg.match, true);
  if (msg.tidePrivate) tideHud.receipt(msg.tidePrivate);
  if (state.betPending) net.send({ t: 'bet', ...state.betPending });
  refreshRoom();
});

net.on('player', ({ p }) => {
  if(p.id===state.you)setName(p.name);
  upsertPlayer(p);
  refreshRoom();
});

net.on('leave', ({ id }) => {
  removePlayer(id);
  refreshRoom();
});

net.on('tradeState', trade => {
  const firstInvite = trade.stage === 'invite' && trade.requesterId !== state.you && state.trade?.id !== trade.id;
  state.trade = trade;
  state.tradePending = false;
  if (firstInvite) { toast(`${trade.peerName} wants to trade with you.`, 'good'); panels.open(PANELS.trade); }
  else if (!panels.isOpen('trade')) panels.open(PANELS.trade);
  else panels.refresh();
});
net.on('tradeClosed', ({ reason }) => { state.trade = null; state.tradePending = false; if(panels.isOpen('trade'))panels.close(); toast(reason || 'Trade canceled.'); });
net.on('tradeError', ({ message }) => { state.tradePending = false; panels.refresh(); toast(message || 'Trade could not continue.', 'bad'); });
net.on('tradeComplete', result => {
  state.trade = null;
  state.tradePending = false;
  if(panels.isOpen('trade'))panels.close();
  if (completeTrade(result)) { syncLoadout(); sfx.coin(); toast(`Trade completed with ${result.partner}.`, 'good'); }
});

net.on('room', ({ hostId, settings, table, public: isPublic, rouletteEntry = 0 }) => {
  const becameHost = hostId === state.you && state.hostId !== state.you;
  state.hostId = hostId;
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  state.public = !!isPublic;
  state.rouletteEntry = rouletteEntry;
  if (table) { state.table = table; world.setTable(table); }
  if (becameHost) toast("👑 You're the host now!", 'good');
  refreshRoom();
});

net.on('match', ({ m }) => applyMatch(m));
net.on('tideAnswerResult', msg => tideHud.receipt(msg));
net.on('tideReward', reward => { if (recordMatch(reward)) { syncLoadout(); if (!reward.practice) { sfx.coin(); toast(`Word Tide · +${reward.coins} coins`, 'good'); } } });

net.on('moves', ({ list }) => world.applyMoves(list));

net.on('typing', ({ id, text }) => {
  if (id === state.you) return;
  setBubble(id, text ? { text: text.toUpperCase(), highlight: 0, tone: 'normal' } : null);
  const now = performance.now();
  if (text && now - lastKeySound > 45) {
    lastKeySound = now;
    sfx.key(true);
  }
});

net.on('result', ({ id, word, ok, reason, mistakes, wpm = 0, combo = 0, coins = 0, flairs = [], paidAnswer = false }) => {
  const mine = id === state.you;
  if (ok) {
    if (lastWord && lastWord.id !== id) setBubble(lastWord.id, null);
    lastWord = { id, word };
    const m = state.match;
    const next = m?.phase === 'typing' && m.chain.at(-1)?.word === word ? m.prefix.length : 1;
    setBubble(id, { text: word.toUpperCase(), highlight: next, tone: 'good' });
    world.playEffect(id, 'correct');
    if (combo >= 3) {
      world.playEffect(id, 'streak');
      world.playEffect(id, 'flair', { text: `${combo} WORD STREAK!`, color: '#ffe45c' });
    }
    world.playEffect(id, 'flair', { text: `x${wpm} WPM`, color: '#8deaff' });
    flairs.forEach((flair, index) => setTimeout(() => world.playEffect(id, 'flair', { text: flair.label, color: flair.color }), 450 + index * 550));
    world.setPlayerStatus(id, { combo });
    sfx.correct();
    if (mine) {
      hud.wordResult(true);
      if (/^[a-z]+$/.test(word)) {
        const result = recordWord(word, wpm, combo, paidAnswer);
        if (result.record) world.playEffect(id, 'flair', { text: `NEW RECORD! ${word.toUpperCase()}`, color: '#ffe45c' });
        if (result.levelUp) { world.playEffect(id, 'flair', { text: `LEVEL ${level()}!`, color: '#ffe45c' }); sfx.levelUp(); }
        syncLoadout();
      }
      if (coins) { world.playEffect(id, 'coin'); rewardPop(`+${coins} 💵`, sidebar.coinsEl); sfx.coin(combo); }
    }
    return;
  }
  setBubble(id, { text: word.toUpperCase(), highlight: 0, tone: 'bad' });
  world.playEffect(id, 'wrong');
  sfx.wrong(!mine);
  if (mine) {
    hud.wordResult(false);
    if (reason !== 'not_word') toast((REASONS[reason] || (() => 'Try again!'))(), 'bad', 1600);
  }
  const m = state.match;
  if (m?.phase === 'typing' && m.typerId === id && Number.isInteger(mistakes)) {
    state.match = { ...m, mistakes };
    hud.update(state);
  }
});

net.on('fail', (msg) => {
  const { id, cause, hearts, shielded } = msg;
  const mine = id === state.you;
  state.lastFail = msg;
  if(mine){cancelCardTarget();if(panels.isOpen('cards'))panels.close();}
  if (lastWord?.id !== id && bubbles.has(id)) setBubble(id, null);
  if (shielded) {
    sfx.pick();
    toast(`🛡️ ${mine ? 'Your' : `${nameOf(id)}'s`} pet blocked the hit!`, 'good');
  } else if (cause === 'timeout' || cause === 'mistakes') {
    world.playEffect(id, 'heart');
    sfx.heart();
    if (mine) replay(gameUi, 'damage-hit');
    if (mine && hearts > 0) {
      replay(gameUi, 'heart-hit');
      banner(cause === 'timeout' ? "⏰ Time's up!" : '❌ Too many mistakes!', { sub: `−1 ❤️ (${hearts} left)`, tone: 'bad' });
    } else if (!mine) {
      toast(`💔 ${nameOf(id)} lost a heart!`, 'bad');
    }
  }
  hud.update(state);
});

net.on('elim', ({ id }) => {
  world.playEffect(id, 'eliminated');
  sfx.eliminated();
  if (id === state.you) banner('KNOCKED OUT!', { sub: 'Better luck next time!', tone: 'bad', ms: 3000 });
  else toast(`💥 ${nameOf(id)} was knocked out!`);
});

net.on('win', ({ id, mode, flairs = [], practice = false, practiceReason = '' }) => {
  if (mode === 'word_tide') { leaderboardKey = ''; syncLeaderboard(); return; }
  if (practice) { banner('PRACTICE COMPLETE', { sub: practiceReason || 'No match coins or wins.', tone: 'good', ms: 4500 }); return; }
  if (id) world.playEffect(id, 'win');
  if (id) world.playEmote(id, 'dance');
  flairs.forEach((flair, i) => setTimeout(() => world.playEffect(id, 'flair', { text: flair.label, color: flair.color }), 500 + i * 600));
  leaderboardKey = ''; syncLeaderboard();
  sfx.win();
  banner(id ? `${nameOf(id).toUpperCase()} WINS!` : 'NO WINNER!', {
    sub: id === state.you ? "🏆 That's you! 🎉" : '🏆',
    tone: 'win',
    ms: 4500,
  });
});

net.on('reward', (reward) => {
  const { coins, won, words } = reward;
  const before = level();
  if (!recordMatch(reward)) return;
  if (reward.practice) { syncLoadout(); toast('Practice finished: no match coins or wins.', 'info'); return; }
  if (level() > before) { sfx.levelUp(); toast(`Level ${level()}!`, 'good'); }
  syncLoadout();
  setTimeout(() => {
    sfx.coin();
    world.playEffect(state.you, 'reward');
    rewardPop(`+${fmt(coins)} 💵`, sidebar.coinsEl);
    const why = words > 0 ? `${words} word${words === 1 ? '' : 's'}${won ? ' and the WIN' : ''}` : (won ? 'the WIN' : 'playing');
    toast(`💵 +${fmt(coins)} for ${why}!`, 'good', 3000);
  }, 1400);
});

net.on('picked', ({ id, letter }) => {
  sfx.pick();
  if (id !== state.you) toast(`${nameOf(id)} picked ${letter.toUpperCase()}!`, 'info', 1500);
});

net.on('chat', ({ id, name, text, tone }) => {
  if (id == null) {
    chat.add({ system: true, text, tone });
  } else {
    chat.add({ name, text });
    world.setChatBubble(id, text);
  }
  sfx.chat();
});

// Fatal errors (room_full, bad_hello, bad_code) arrive as a 'closed' connection state instead.
net.on('error', ({ code, message }) => {
  toast(ERRORS[code] || message || 'Something went wrong.', 'bad');
});

net.on('hint', (msg) => {
  const pending = state.hintPending;
  if (!pending || pending.requestId !== msg.requestId || pending.turnId !== msg.turnId) return;
  state.hintPending = null;
  const tide = state.match?.phase === 'tideAnswer' && state.match.participants.some(p => p.id === state.you && p.alive);
  const current = (tide || state.match?.phase === 'typing' && state.match.typerId === state.you) && state.match.turnId === msg.turnId;
  if (msg.ok && current && state.hintTurn !== msg.turnId && spendCoins(tide ? TIDE.hintPrice : HINT_PRICE)) {
    state.hintTurn = msg.turnId; state.hintWord = msg.word;
    if (tide) tideHud.answer(msg.word, msg); else submitWord(msg.word);
  } else if (!msg.ok && current) toast(msg.reason === 'already_bought' ? 'You already bought this turn’s answer.' : 'No answer available. You were not charged.', 'info');
  hud.update(state); tideHud.update(state, state.settings.mode === 'word_tide');
});
net.on('cardQueue', ({ queue, reason }) => {
  state.cardQueue = queue; cardTray.update();
  if (reason) toast('Card plan cancelled. Your card remains in inventory.', 'info');
});
net.on('cardQueueResult', msg => {
  if (state.cardPending?.requestId !== msg.requestId) return;
  state.cardPending = null;
  if (!msg.ok) toast('The turn locked or that target is unavailable. Card not queued.', 'info');
  cardTray.update(); hud.update(state);
});
net.on('cardReturned',({cardId,receipt})=>{if(grantCard(cardId,receipt)){syncLoadout();toast(`${CARDS_BY_ID[cardId]?.name} unused copy returned.`,'good');}});
net.on('cardDefense',({targetId,cardId,reflected})=>chat.add({system:true,text:`${nameOf(targetId)}: ${CARDS_BY_ID[cardId]?.name} ${reflected?'reflected':'blocked'} the incoming card.`}));
net.on('petCounter',({id,kind})=>chat.add({system:true,text:`${nameOf(id)}: ${kind}.`}));
net.on('cardResult', msg => {
  if (msg.ok) {
    consumeCard(msg.cardId, `card:${msg.requestId}`); state.cardUsedTurn = msg.turnId;
    // A winning Heartbreaker receipt follows endMatch: replace any debounced stale counts.
    if (!MATCH_PHASES.has(state.match?.phase)) syncLoadout();
  }
  else if (msg.turnId === state.match?.turnId) toast('That card could not be used. It remains in your inventory.', 'info');
  cardTray.update(); hud.update(state);
});
net.on('cardUsed', (event) => {
  const { actorId, targetId, cardId, effect, shielded } = event;
  const card = CARDS_BY_ID[cardId];
  if(effect==='skipped'){
    world.playEffect(targetId,'skipped');
    chat.add({system:true,text:`${nameOf(targetId)} used their Free Pass: turn skipped, no heart lost.`});return;
  }
  if(!card)return;
  if (actorId === state.you) cardTray.close();
  const result=event.effect==='armed'?'armed · automatic protection':event.blocked?'blocked by protection':event.hit===false?'chance missed · no effect':card.effect==='burn'?'−1s on the next two turns':card.effect==='heal'?'heart restored (up to starting hearts)':card.effect==='jam'?'new card plays blocked until next turn ends':card.effect==='skip'?'next turn skipped · no heart lost':
    card.effect==='time'?'−2 seconds next turn':
    card.effect==='mistakes'?'2 fewer mistakes for this match · minimum 1':
    shielded?'pet shield blocked Heartbreaker':'lost 1 heart';
  const effectTarget=event.actualTargetId||targetId;
  const message=card.effect==='skip'&&!event.blocked ? `${nameOf(effectTarget)} has their next turn skipped!` : `${nameOf(effectTarget)}: ${result}${event.reflected?' · reflected':''}`;
  world.playCard(actorId,targetId,cardId,message,event);
  world.playEffect(effectTarget, 'flair', { text: result, color: card.color });
  toast(`${nameOf(actorId)} played ${card.name}. ${message}`, 'info', 5500);
  chat.add({ system: true, text: `${nameOf(actorId)} played ${card.name} on ${nameOf(targetId)} — ${result}.` });
});
net.on('emote', ({ id, name }) => world.playEmote(id, name));
let travelOverlay=null;
net.on('travelRejected',()=>{teleporting=false;world.setTravelLocked(false);travelOverlay?.remove();travelOverlay=null;});
net.on('travel',({id,to,pos})=>{
  if(id!==state.you){world.finishPortal(id,pos);return;}
  state.zone=to;world.setZone(to);world.teleportLocal(pos);world.finishPortal(id,pos);
  if(to==='obby')net.send({t:'obby',event:'start'});
  refreshRoom();
  setTimeout(()=>{travelOverlay?.remove();travelOverlay=null;teleporting=false;world.setTravelLocked(false);},250);
});
net.on('celebrate', ({ id, kind, to, door }) => {
  if (kind === 'portal') {
    world.playPortal(id,door);
    if(id===state.you){
      teleporting=true;world.setTravelLocked(true);
      const code=state.code;
      setTimeout(()=>{if(!teleporting||!state.inRoom||state.code!==code)return;travelOverlay?.remove();travelOverlay=h('div',{class:'teleport-overlay'},h('div',{class:'stroke'},to==='lighthouse'?'The lightkeeper calls…':to==='obby'?'Traveling to the obby…':'Returning to the island…'));uiRoot.append(travelOverlay);},650);
    }
  }
  else if (kind === 'hatch') world.playHatch(id);
});
net.on('unlock', ({ ok, token }) => {
  if (ok) {
    state.isAdmin = true; unlockToken = token;
    refreshRoom();
  } else { state.unlockFailed = true; panels.refresh(); }
});
net.on('adminProfiles', ({ users }) => { state.adminProfiles = users || []; panels.refresh(); });
net.on('adminProfile', data => { state.adminProfile = data; panels.refresh(); if (data.saved) toast('Profile saved.', 'good'); });
net.on('profileAdjusted', async data => {
  await account.applyAdminProfile(data);
  syncLoadout(); panels.refresh(); toast('An admin updated your profile.', 'info');
});
net.on('adminRooms', ({ rooms, leaders }) => { state.adminRooms = Array.isArray(rooms) ? rooms : []; state.adminLeaders = Array.isArray(leaders) ? leaders : []; panels.refresh(); });
net.on('adminRoomShutdown', ({ code }) => { state.adminRooms = state.adminRooms.filter(room => room.code !== code); panels.refresh(); toast(`${code} shut down.`, 'good'); });
net.on('winsSync', value => { if (syncWins(value)) { syncLoadout(); toast(`Your wins are now ${fmt(value.wins)}.`, 'good'); } });
net.on('winsSetResult', ({ name, wins }) => { toast(`${name}'s wins set to ${fmt(wins)}.`, 'good'); leaderboardKey = ''; syncLeaderboard(); });
net.on('winsSold', result => {
  const changed = syncWins(result);
  const credited = grantCoins(result.coins, result.receipt);
  if (changed || credited) { syncLoadout(); panels.refresh(); leaderboardKey = ''; syncLeaderboard(); toast('Sold 5 wins for 1,000 coins.', 'good'); }
});
net.on('modResult', ({ action, id, name }) => {
  if (action === 'ban') state.bannedPlayers.set(id, name);
  if (action === 'unban') state.bannedPlayers.delete(id);
  panels.refresh();
});
net.on('announce', ({ text }) => banner(text, { tone: 'win', ms: 5000 }));
let latestGlobalNotice = 0;
try { latestGlobalNotice = Number(sessionStorage.getItem('ftw_global_notice_id')) || 0; } catch {}
async function pollGlobalAnnouncements() {
  if (!state.inRoom) return;
  try {
    const response = await fetch(apiUrl(`/api/announcements?since=${latestGlobalNotice}`));
    if (!response.ok) return;
    const { notices } = await response.json();
    for (const notice of notices || []) {
      if (notice.id <= latestGlobalNotice) continue;
      latestGlobalNotice = notice.id;
      banner(`GLOBAL: ${notice.text}`, { tone: 'win', ms: 6500 });
    }
    sessionStorage.setItem('ftw_global_notice_id', String(latestGlobalNotice));
  } catch { /* retry next poll */ }
}
setInterval(pollGlobalAnnouncements, 5000);
net.on('grant', ({ coins, reason, grantId }) => {
  if (grantCoins(coins, grantId)) { sfx.coin(); rewardPop(`+${fmt(coins)} 💵`, sidebar.coinsEl); toast(`${reason === 'obby' ? 'Obby reward' : 'Coin grant'}: +${fmt(coins)} coins`, 'good'); }
});
net.on('coinAdjust', ({ operation, amount, receipt }) => {
  if (adjustCoins(operation, amount, receipt)) toast(`Coins ${operation === 'set' ? 'set to' : 'changed by'} ${fmt(amount)}.`, 'good');
});
net.on('petMergeGrant', ({ petId, tier, receipt }) => {
  if (grantPetTier(petId, tier, receipt)) { syncLoadout(); sidebar.markNew('pets'); toast(`Free tier ${tier} ${PETS_BY_ID[petId]?.name || 'pet'} added.`, 'good'); }
});
net.on('betResult', result => {
  if (state.betPending?.requestId === result.requestId) state.betPending = null;
  if (result.ok) adjustCoins('add', -result.amount, `bet:${result.receipt}`);
  else if (result.error) toast(result.error, 'bad');
  refreshRoom();
});
net.on('meteor', ({meteor,collected}) => world?.setMeteor(meteor,collected));
net.on('adminCard', ({ cardId, receipt }) => { if (grantCard(cardId, receipt)) { syncLoadout(); sidebar.markNew('cards'); toast(`${CARDS_BY_ID[cardId]?.name || 'Card'} added for free.`, 'good'); } });
net.on('adminCardResult', ({ cardId }) => toast(`${CARDS_BY_ID[cardId]?.name || 'Card'} granted successfully.`, 'good'));
net.on('adminPetResult', ({ petId, name }) => toast(`${PETS_BY_ID[petId]?.name || 'Pet'} collected for ${name}.`, 'good'));
net.on('matchRefund', refund => { if (refundMatch(refund)) { syncLoadout(); toast('Game ended. Your entry, answer purchases, and played cards were refunded.', 'good'); } });
net.on('meteorReward', ({coins,receipt}) => { if (grantCoins(coins,receipt)) { sfx.coin(); rewardPop(`+${fmt(coins)} 💵`,sidebar.coinsEl); toast('Meteor collected: +150 coins','good'); } });
net.on('hazardDebit', ({ amount, belowMinimum, receipt }) => { const damage = belowMinimum === 'halve' ? fireDamage(profile.coins) : Math.min(profile.coins,amount); if (adjustCoins('add', -damage, receipt)) { world?.playEffect(state.you, 'flair', {text:`−${damage} COINS · FIRE`,color:'#ff8a4b'}); replay(gameUi,'damage-hit'); sfx.thud(); } });
net.on('stakeRefund', ({ coins, receipt }) => { if (grantCoins(coins, receipt) && coins) toast(`${fmt(coins)} entry coins returned.`, 'good'); });
net.on('rouletteReward', reward => {
  if (recordMatch(reward)) { if (reward.coins) sfx.coin(); toast(reward.practice ? `${fmt(reward.coins)} entry coins returned from practice.` : `${fmt(reward.coins)} coins · ${reward.bonuses[0].label}`, 'good'); syncLoadout(); }
});
net.on('rouletteOut', ({ id }) => { world?.knockOutRoulette?.(id); if(id===state.you)replay(gameUi,'damage-hit'); sfx.thud(); });

function applyMatch(m, resync = false) {
  const prev = state.match;
  if (m.matchId && MATCH_PHASES.has(m.phase) && m.matchId !== prev?.matchId) captureMatchProgress(m.matchId);
  if (m.matchId && m.phase === 'ended') finishMatchProgress(m.matchId);
  state.match = m;
  if (m.phase === 'tideIntro' && prev?.matchId !== m.matchId) { panels.close(); cancelConfirmation(); }
  world?.setMatch?.(m);
  if(m.phase==='lobby'||m.startedAt!==prev?.startedAt)world.clearCards();
  if (resync) world.restoreCards(m.cardHistory || []);
  cardTray.update();
  if(prev?.phase==='typing'&&prev.typerId===state.you&&(m.phase!=='typing'||m.typerId!==state.you||m.turnId!==prev.turnId)&&panels.isOpen('cards'))panels.close();
  if (prev?.turnId !== m.turnId || !['typing','tideAnswer'].includes(m.phase)) {
    cancelCardTarget();
    if (turnConfirmation != null) { cancelConfirmation(); turnConfirmation = null; }
    state.hintPending = null; state.hintWord = null;
    // Accepted card replies may follow an immediate match-end snapshot; preserve pending receipt.
  }
  if (prev && MATCH_PHASES.has(prev.phase) && !MATCH_PHASES.has(m.phase)) syncLoadout();
  state.deadline = m.phaseEndsIn != null ? performance.now() + m.phaseEndsIn : 0;

  if (m.phase === 'lobby' || m.phase === 'countdown') {
    clearBubbles();
    state.lastFail = null;
    state.roundStartCount = null;
  } else if (m.phase === 'choosing' && (!prev || prev.phase !== 'choosing' || prev.round !== m.round)) {
    clearBubbles();                    // new round: drop stale bubbles
    state.roundStartCount = m.wordCount;
  }

  syncTile(m);
  syncStatuses(m);

  // Now that the next prefix is known, highlight exactly the letters the next player must reuse.
  if (lastWord && m.phase === 'typing' && m.chain.at(-1)?.word === lastWord.word) {
    setBubble(lastWord.id, { text: lastWord.word.toUpperCase(), highlight: m.prefix.length, prefixIndex: m.prefixIndex, tone: 'good' });
  }

  if (prev && !resync) phaseEffects(prev, m);
  if (!isMyTurn(m)) document.title = TITLE;
  hud.update(state);
  playerList.update(state);
  cardTray.update();
  panels.refresh();
  refreshMode();
}

/** Local player must type or choose right now. */
function isMyTurn(m) {
  return (m.phase === 'tideAnswer' && m.participants?.some(p => p.id === state.you && p.alive)) || (['typing', 'roulette'].includes(m.phase) && m.typerId === state.you) || (m.phase === 'choosing' && m.chooserId === state.you);
}

// `?debug` exposes internals for automated tests and troubleshooting.
if (new URLSearchParams(location.search).has('debug')) {
  window.__ftw = { state, net, actions, profile, hud, get world() { return world; } };
}

function phaseEffects(prev, m) {
  if (m.twist && (m.round !== prev.round || m.twist.id !== prev.twist?.id)) banner(`TWIST: ${m.twist.name.toUpperCase()}!`, { tone: 'win', ms: 3000 });
  if (m.wordCount > prev.wordCount && m.wordCount % 10 === 0) {
    const scorer = m.chain.at(-1)?.id;
    if (scorer) world?.playEffect(scorer, 'flair', { text: `${m.wordCount} WORD CHAIN!`, color: '#ffe45c' });
    sfx.coin();
  }
  if (prev.phase === 'countdown' && m.phase === 'choosing') {
    countdownPop('GO!');
    sfx.countdown(true);
  }
  const newTurn = prev.phase !== m.phase || prev.wordCount !== m.wordCount || prev.typerId !== m.typerId;
  if (isMyTurn(m) && (!isMyTurn(prev) || newTurn)) {
    sfx.turn();
    panels.close();
    if (document.hidden) document.title = `⏰ Your turn! | ${TITLE}`;
  }
}
