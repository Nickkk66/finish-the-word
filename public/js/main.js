// Boot + glue: profile → world (menu mode) → menu → connect → wire net <-> world <-> UI.

import { DEFAULT_SETTINGS, MAX_PLAYERS, PROTOCOL_VERSION, ROOM_CODE_REGEX, makeRoomCode } from './shared/constants.js';
import { BLOCKS, CHAIRS, PETS_BY_ID, rollBlock } from './shared/catalog.js';
import {
  profile, onProfileChange, setName, setLook, buyOrEquipChair, payForBlock, addPet, equipPet,
  recordWord, recordMatch, setSetting, claimFree, FREE_COINS,
} from './profile.js';
import { createNet } from './net.js';
import { initAudio, setSoundEnabled, sfx } from './audio.js';
import { h, fmt, isTextField } from './ui/dom.js';
import { trackViewport } from './ui/viewport.js';
import { createMenu, cleanCode } from './ui/menu.js';
import { createHud } from './ui/hud.js';
import { createPlayerList } from './ui/playerList.js';
import { createChat } from './ui/chat.js';
import { createSidebar } from './ui/sidebar.js';
import { createPanelHost } from './ui/panel.js';
import { chairsPanel } from './ui/panels/chairs.js';
import { petsPanel } from './ui/panels/pets.js';
import { freePanel } from './ui/panels/free.js';
import { settingsPanel } from './ui/panels/settings.js';
import { profilePanel } from './ui/panels/profile.js';
import { initFx, toast, banner, confetti, countdownPop, rewardPop } from './ui/fx.js';
import { initOverlays, setBusy, showError, confirmDialog } from './ui/overlays.js';
import { playHatch } from './ui/hatch.js';

const RECONNECT_OVERLAY_DELAY_MS = 700;
const LOADOUT_DEBOUNCE_MS = 250;
const MATCH_PHASES = new Set(['choosing', 'typing', 'roundEnd']);
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

// ------------------------------------------------------------------ UI

initFx(uiRoot);
initOverlays(uiRoot);
trackViewport();
initAudio();
setSoundEnabled(profile.settings.sound);

const actions = {
  chair(chairId) {
    const chair = CHAIRS.find((c) => c.id === chairId);
    const result = buyOrEquipChair(chairId);
    if (result === 'invalid') return;
    if (result === 'poor') {
      sfx.wrong();
      toast(`Not enough 💵! You need ${fmt(chair.price - profile.coins)} more.`, 'bad');
      return;
    }
    if (result === 'bought') {
      sfx.coin();
      toast(`🪑 You bought the ${chair.name} chair!`, 'good');
    } else {
      toast(`🪑 ${chair.name} chair equipped!`, 'good');
    }
    sendLoadout({ chair: profile.equippedChair });
  },
  openBlock(blockId) {
    const block = BLOCKS.find((b) => b.id === blockId);
    if (!block) return;
    if (isAliveParticipant()) {
      toast('Finish your match first!', 'bad');
      return;
    }
    if (!payForBlock(block)) {
      sfx.wrong();
      toast(`Not enough 💵! The ${block.name} costs ${fmt(block.price)}.`, 'bad');
      return;
    }
    const petId = rollBlock(block);
    addPet(petId);
    panels.close();
    world.playEffect(state.you, 'hatch');
    playHatch(uiRoot, { block, petId, count: profile.pets[petId], onEquip: () => actions.equipPet(petId) });
  },
  equipPet(petId) {
    equipPet(petId);
    sendLoadout({ pet: profile.equippedPet });
    const pet = PETS_BY_ID[profile.equippedPet];
    toast(pet ? `${pet.emoji} ${pet.name} is following you!` : 'Pet unequipped.', pet ? 'good' : 'info');
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
    net.send({ t: 'host', action: 'settings', settings: { ...state.settings, ...patch } });
  },
  host(action) {
    net.send({ t: 'host', action });
  },
  async leave() {
    if (isAliveParticipant() && !(await confirmForfeit('Leave the room?', 'Leave'))) return;
    leaveRoom();
  },
  rename(name) {
    if (setName(name)) sendLoadout({ name: profile.name });
  },
  setLook(look) {
    setLook(look);
    sendLoadout({ look: profile.look });
  },
  ping: () => net.rtt,
};

const panelCtx = { state, actions };
const PANELS = {
  chairs: chairsPanel(panelCtx),
  pets: petsPanel(panelCtx),
  free: freePanel(panelCtx),
  profile: profilePanel(panelCtx),
  settings: settingsPanel(panelCtx),
};

const hud = createHud({ onSubmit: submitWord, onTyping: sendTyping, onPick: (letter) => net.send({ t: 'pick', letter }) });
const playerList = createPlayerList();
const chat = createChat({ onSend: (text) => net.send({ t: 'chat', text }) });
const panels = createPanelHost(uiRoot);
const sidebar = createSidebar({ onInvite: invite, openPanel: (id) => panels.open(PANELS[id]) });
const gameUi = h('div', { class: 'game-ui', hidden: true }, hud.el, playerList.el, chat.el, sidebar.el);

const invited = cleanCode(new URLSearchParams(location.search).get('room'));
const menu = createMenu({
  invitedCode: ROOM_CODE_REGEX.test(invited) ? invited : null,
  actions: { play: joinRoom, toggleSound: () => actions.setSound(!profile.settings.sound) },
});
uiRoot.prepend(gameUi, menu.el);

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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) document.title = TITLE;
});

onProfileChange(() => {
  sidebar.update();
  menu.refresh();
  panels.refresh();
  setSoundEnabled(profile.settings.sound);
  syncShop();
});

// ------------------------------------------------------------------ world

const worldReady = loadWorld();

async function loadWorld() {
  const stub = new URLSearchParams(location.search).has('stubworld');
  try {
    const { createWorld } = await import(stub ? '../dev/stub-world.js' : './world/world.js');
    const w = await createWorld({ container: document.getElementById('game'), labelLayer: document.getElementById('labels') });
    world = w;
    w.setQuality(profile.settings.quality);
    w.setMenuMode(true);
    w.onLocalMove((move) => net.send({ t: 'move', ...move }));
    w.onInteract(onInteract);
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

function syncLeaderboard() {
  const rows = [...state.players.values()]
    .map((p) => ({ name: p.name, wins: p.wins }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  const key = JSON.stringify(rows);
  if (key === leaderboardKey) return;
  leaderboardKey = key;
  world.setLeaderboard(rows);
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
      const turn = (m.phase === 'typing' && p.id === m.typerId) || (m.phase === 'choosing' && p.id === m.chooserId);
      next.set(p.id, { turn, out: !p.alive, hearts: p.hearts });
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
  if (i.type === 'seat') {
    net.send({ t: 'sit', seat: i.seat });
  } else if (i.type === 'stand') {
    if (standPending) return;
    standPending = true;
    const ok = !isAliveParticipant() || await confirmForfeit('Stand up?', 'Stand up');
    standPending = false;
    if (ok) net.send({ t: 'stand' });
  } else if (i.type === 'shopChair') {
    actions.chair(i.chairId);
  } else if (i.type === 'block') {
    actions.openBlock(i.blockId);
  }
}

function resolvePrompt(i) {
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
    name: profile.name,
    look: profile.look,
    chair: profile.equippedChair,
    pet: profile.equippedPet,
    v: PROTOCOL_VERSION,
  };
}

function setUrlRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

async function joinRoom(code) {
  const roomCode = code || makeRoomCode();
  if (!world) setBusy('Loading...');
  try {
    await worldReady;
  } catch {
    return;   // error card already shown
  }
  state.code = roomCode;
  setUrlRoom(roomCode);
  menu.hide();
  setBusy('Joining room...', { action: { label: 'Cancel', onClick: leaveRoom } });
  net.connect(roomCode, hello);
}

/** Tears the room down locally and returns to the menu (the socket must already be closed). */
function exitRoom() {
  for (const id of [...state.players.keys()]) removePlayer(id);
  Object.assign(state, {
    code: null, hostId: null, settings: { ...DEFAULT_SETTINGS }, match: null, deadline: 0,
    inRoom: false, lastFail: null, roundStartCount: null,
  });
  bubbles.clear();
  statusKeys = new Map();
  lastWord = null;
  tileId = null;
  leaderboardKey = '';
  world.setLeaderboard([]);
  world.setMenuMode(true);
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

net.onState((s, reason) => {
  if (s === 'open') {
    setBusy(null);
  } else if (s === 'reconnecting' && state.inRoom) {
    setBusy('Reconnecting...', { delay: RECONNECT_OVERLAY_DELAY_MS, action: { label: 'Leave', onClick: leaveRoom } });
  } else if (s === 'closed' && reason !== 'user') {
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
  hud.update(state);
  playerList.update(state);
  panels.refresh();
  syncLeaderboard();
}

net.on('welcome', (msg) => {
  state.you = msg.you;
  state.code = msg.code;
  state.hostId = msg.hostId;
  state.settings = { ...DEFAULT_SETTINGS, ...msg.settings };
  const incoming = new Set(msg.players.map((p) => p.id));
  for (const id of [...state.players.keys()]) if (!incoming.has(id)) removePlayer(id);
  for (const p of msg.players) upsertPlayer(p);
  world.setLocalPlayer(state.you);
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
  refreshRoom();
});

net.on('player', ({ p }) => {
  upsertPlayer(p);
  refreshRoom();
});

net.on('leave', ({ id }) => {
  removePlayer(id);
  refreshRoom();
});

net.on('room', ({ hostId, settings }) => {
  const becameHost = hostId === state.you && state.hostId !== state.you;
  state.hostId = hostId;
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  if (becameHost) toast("👑 You're the host now!", 'good');
  refreshRoom();
});

net.on('match', ({ m }) => applyMatch(m));

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

net.on('result', ({ id, word, ok, reason, mistakes }) => {
  const mine = id === state.you;
  if (ok) {
    if (lastWord && lastWord.id !== id) setBubble(lastWord.id, null);
    lastWord = { id, word };
    const m = state.match;
    const next = m?.phase === 'typing' && m.chain.at(-1)?.word === word ? m.prefix.length : 1;
    setBubble(id, { text: word.toUpperCase(), highlight: next, tone: 'good' });
    world.playEffect(id, 'correct');
    sfx.correct();
    if (mine) {
      hud.wordResult(true);
      if (/^[a-z]+$/.test(word)) recordWord(word);   // the server may mask words (e.g. '####')
    }
    return;
  }
  setBubble(id, { text: word.toUpperCase(), highlight: 0, tone: 'bad' });
  world.playEffect(id, 'wrong');
  sfx.wrong(!mine);
  if (mine) {
    hud.wordResult(false);
    toast((REASONS[reason] || (() => 'Try again!'))(), 'bad', 1600);
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
  if (lastWord?.id !== id && bubbles.has(id)) setBubble(id, null);
  if (shielded) {
    sfx.pick();
    toast(`🛡️ ${mine ? 'Your' : `${nameOf(id)}'s`} pet blocked the hit!`, 'good');
  } else if (cause === 'timeout' || cause === 'mistakes') {
    world.playEffect(id, 'heart');
    sfx.heart();
    if (mine && hearts > 0) {
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

net.on('win', ({ id }) => {
  if (id) world.playEffect(id, 'win');
  sfx.win();
  confetti();
  banner(id ? `${nameOf(id).toUpperCase()} WINS!` : 'NO WINNER!', {
    sub: id === state.you ? "🏆 That's you! 🎉" : '🏆',
    tone: 'win',
    ms: 4500,
  });
});

net.on('reward', ({ coins, won, words }) => {
  recordMatch({ won, coins });
  setTimeout(() => {
    sfx.coin();
    rewardPop(`+${fmt(coins)} 💵`, sidebar.coinsEl);
    const why = words > 0 ? `${words} word${words === 1 ? '' : 's'}${won ? ' and the WIN' : ''}` : (won ? 'the WIN' : 'playing');
    toast(`💵 +${fmt(coins)} for ${why}!`, 'good', 3000);
  }, 1400);
});

net.on('picked', ({ id, letter }) => {
  sfx.pick();
  if (id !== state.you) toast(`${nameOf(id)} picked ${letter.toUpperCase()}!`, 'info', 1500);
});

net.on('chat', ({ id, name, text }) => {
  if (id == null) {
    chat.add({ system: true, text });
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

function applyMatch(m, resync = false) {
  const prev = state.match;
  state.match = m;
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
    setBubble(lastWord.id, { text: lastWord.word.toUpperCase(), highlight: m.prefix.length, tone: 'good' });
  }

  if (prev && !resync) phaseEffects(prev, m);
  if (!isMyTurn(m)) document.title = TITLE;
  hud.update(state);
  playerList.update(state);
  panels.refresh();
}

/** Local player must type or choose right now. */
function isMyTurn(m) {
  return (m.phase === 'typing' && m.typerId === state.you) || (m.phase === 'choosing' && m.chooserId === state.you);
}

// `?debug` exposes internals for automated tests and troubleshooting.
if (new URLSearchParams(location.search).has('debug')) {
  window.__ftw = { state, net, get world() { return world; } };
}

function phaseEffects(prev, m) {
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
