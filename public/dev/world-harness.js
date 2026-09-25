// Dev harness for the World API: a local player plus 7 fake players (some seated, two
// walking via applyMoves), a simulated match (letter tiles, typed bubbles, effects), chat
// bubbles, leaderboard, shop state and prompts. Query: ?quality=low, ?menu, ?stub.

import { createWorld } from '/js/world/world.js';
import { BLOCKS, CHAIRS, NOOB_LOOK, PETS, rollBlock } from '/js/shared/catalog.js';

const params = new URLSearchParams(location.search);
const world = await createWorld({ container: document.getElementById('game'), labelLayer: document.getElementById('labels') });
window.world = world; // for poking at it from the console
if (params.get('quality') === 'low') world.setQuality('low');
world.start();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => (document.getElementById('log').textContent = msg);

// ---- Players ----
const players = new Map();
const add = (p) => {
  players.set(p.id, p);
  world.addPlayer(p);
};
const patch = (id, fields) => {
  const p = { ...players.get(id), ...fields };
  players.set(id, p);
  world.updatePlayer(p);
};
const mk = (id, name, seat, chair, pet, look, pos = null) => ({
  id, name, isBot: id !== 'me', isHost: id === 'me', connected: true, look, chair, pet, seat, wins: 0, pos,
});

add(mk('me', 'You', -1, 'wooden', 'doggy', NOOB_LOOK));
world.setLocalPlayer('me');
add(mk('b1', 'Builderman', 2, 'throne', 'dragon', { skin: '#ffd9b3', shirt: '#e53935', pants: '#263238', hair: '#3b2314', hairStyle: 1, face: 1 }));
add(mk('b2', 'Guest_1337', 3, 'toilet', 'doggy', { ...NOOB_LOOK, hairStyle: 0 }));
add(mk('b3', 'PixelPanda', 5, 'slime', 'unicorn', { skin: '#eab892', shirt: '#ec407a', pants: '#f5f5f5', hair: '#f2c14e', hairStyle: 3, face: 3 }));
add(mk('b4', 'xX_Ninja_Xx', 6, 'gamer', 'robot', { skin: '#c68642', shirt: '#212121', pants: '#b71c1c', hair: '#111111', hairStyle: 2, face: 2 }));
add(mk('b5', 'SirTypesALot', 1, 'electric', 'froggy', { skin: '#8d5524', shirt: '#8e24aa', pants: '#1e3a8a', hair: '#e8e8e8', hairStyle: 1, face: 0 }));
add(mk('b6', 'Bacon_Boi', -1, 'glass', 'bunny', { skin: '#ffd9b3', shirt: '#43a047', pants: '#1e3a8a', hair: '#b5561c', hairStyle: 1, face: 0 }, { x: 8, y: 0, z: 30, ry: 0 }));
add(mk('b7', 'LuckyLuna', -1, 'flower', 'owl', { skin: '#f2f3f3', shirt: '#00acc1', pants: '#6a1b9a', hair: '#d81b60', hairStyle: 3, face: 1 }, { x: 15, y: 0, z: 0, ry: 0 }));

// Two walkers streamed at 10 Hz like the server's `moves` batches.
setInterval(() => {
  const t = performance.now() / 1000;
  const a = t * 1.1;
  const hop = Math.max(0, Math.sin(t * 2.3)) > 0.97;
  world.applyMoves([
    { id: 'b6', x: 9 + Math.cos(a) * 6, y: hop ? 2 : 0, z: 34 + Math.sin(a) * 6, ry: Math.atan2(-Math.sin(a), Math.cos(a)), anim: hop ? 'jump' : 'walk' },
    { id: 'b7', x: 15, y: 0, z: Math.sin(t * 0.35) * 20, ry: Math.cos(t * 0.35) > 0 ? 0 : Math.PI, anim: 'walk' },
  ]);
}, 100);

// ---- Shop / prompts / interactions (a tiny fake "server") ----
const profile = { coins: 5000, owned: new Set(['wooden', 'glass']), equipped: 'wooden' };
const syncShop = () => world.setShopState({ ownedChairs: [...profile.owned], equippedChair: profile.equipped });
syncShop();

world.setPromptResolver((i) => {
  if (i.type === 'seat') return { text: 'Sit', key: 'E', enabled: true };
  if (i.type === 'shopChair') {
    const chair = CHAIRS.find((c) => c.id === i.chairId);
    if (profile.equipped === chair.id) return { text: 'Equipped', key: 'E', enabled: false };
    if (profile.owned.has(chair.id)) return { text: 'Equip', key: 'E', enabled: true };
    return { text: `Buy $${chair.price.toLocaleString()}`, key: 'E', enabled: profile.coins >= chair.price };
  }
  if (i.type === 'block') {
    const block = BLOCKS.find((b) => b.id === i.blockId);
    return { text: `Open $${block.price}`, key: 'E', enabled: profile.coins >= block.price };
  }
  return null;
});

world.onInteract((i) => {
  log('onInteract ' + JSON.stringify(i));
  if (i.type === 'seat') patch('me', { seat: i.seat });
  else if (i.type === 'stand') patch('me', { seat: -1 });
  else if (i.type === 'shopChair') {
    const chair = CHAIRS.find((c) => c.id === i.chairId);
    if (!profile.owned.has(chair.id)) {
      profile.coins -= chair.price;
      profile.owned.add(chair.id);
    }
    profile.equipped = chair.id;
    patch('me', { chair: chair.id });
    syncShop();
  } else if (i.type === 'block') {
    const block = BLOCKS.find((b) => b.id === i.blockId);
    profile.coins -= block.price;
    world.playEffect('me', 'hatch');
    patch('me', { pet: rollBlock(block) });
  }
});

let moves = 0;
world.onLocalMove(() => {
  moves++;
});
setInterval(() => {
  if (!document.getElementById('log').textContent.startsWith('onInteract')) log(`local moves sent/s: ${moves}`);
  moves = 0;
}, 1000);

const chatInput = document.getElementById('chatInput');
chatInput.addEventListener('focus', () => world.setInputEnabled(false));
chatInput.addEventListener('blur', () => world.setInputEnabled(true));
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim()) {
    world.setChatBubble('me', chatInput.value.trim());
    chatInput.value = '';
  }
});

// ---- Chat + leaderboard ----
const CHAT = ['hi guys!', 'gg', 'who wants to play?', 'that word was so hard lol', 'nice chair!!', 'E words are the worst', 'brb', 'LETS GOOO', 'how do u get the throne', 'my pet is so cute'];
setInterval(() => {
  const ids = [...players.keys()].filter((id) => id !== 'me');
  world.setChatBubble(ids[(Math.random() * ids.length) | 0], CHAT[(Math.random() * CHAT.length) | 0]);
}, 2600);
const wins = { Builderman: 12, PixelPanda: 9, 'xX_Ninja_Xx': 7, SirTypesALot: 4, Guest_1337: 2, You: 1 };
const pushBoard = () => world.setLeaderboard(Object.entries(wins).map(([name, w]) => ({ name, wins: w })));
pushBoard();

// ---- Simulated match among the seated bots ----
const WORDS = 'apple eagle elephant tiger rabbit turtle eggplant tomato orange elbow window wizard dragon notebook kitten nectar rocket tunnel lemon noodle'.split(' ');
let matchOn = true;
async function runMatch() {
  const seated = ['b5', 'b1', 'b2', 'b3', 'b4'];
  const hearts = Object.fromEntries(seated.map((id) => [id, 2]));
  const alive = [...seated];
  for (const id of seated) world.setPlayerStatus(id, { turn: false, out: false, hearts: 2 });
  let prefix = 'e';
  let k = 0;
  while (alive.length > 1 && matchOn) {
    const id = alive[k % alive.length];
    world.setPlayerStatus(id, { turn: true });
    world.setLetterTile(id, prefix);
    const word = WORDS.find((w) => w.startsWith(prefix) && Math.random() < 0.6) ?? prefix + 'xyz';
    world.setBubble(id, { text: '', highlight: 0 });
    await sleep(700);
    for (let n = 1; n <= word.length; n++) {
      world.setBubble(id, { text: word.slice(0, n), highlight: 0 });
      await sleep(110);
    }
    const good = WORDS.includes(word) && Math.random() < 0.8;
    if (good) {
      world.setBubble(id, { text: word, highlight: 1, tone: 'good' });
      world.playEffect(id, 'correct');
      prefix = word.at(-1);
      k++;
    } else {
      world.setBubble(id, { text: word, highlight: 0, tone: 'bad' });
      world.playEffect(id, 'wrong');
      await sleep(700);
      hearts[id]--;
      world.playEffect(id, 'heart');
      world.setPlayerStatus(id, { hearts: hearts[id] });
      if (hearts[id] <= 0) {
        world.playEffect(id, 'eliminated');
        world.setPlayerStatus(id, { out: true });
        alive.splice(alive.indexOf(id), 1);
      } else k++;
      prefix = 'etaor'[(Math.random() * 5) | 0];
    }
    await sleep(900);
    world.setPlayerStatus(id, { turn: false });
    world.setLetterTile(id, null);
    setTimeout(() => world.setBubble(id, null), 1500);
  }
  if (alive.length === 1 && matchOn) {
    world.playEffect(alive[0], 'win');
    wins[players.get(alive[0]).name] = (wins[players.get(alive[0]).name] ?? 0) + 1;
    pushBoard();
    await sleep(5000);
  }
  for (const id of seated) world.setPlayerStatus(id, { turn: false, out: false, hearts: null });
}
(async () => {
  for (;;) {
    if (matchOn) await runMatch();
    else await sleep(500);
  }
})();

// ---- Buttons ----
let menu = params.has('menu');
world.setMenuMode(menu);
let cam = 'follow';
let quality = params.get('quality') === 'low' ? 'low' : 'high';
let out = false;
document.getElementById('dev').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  b.blur();
  const fx = b.dataset.fx;
  if (fx) return world.playEffect('me', fx);
  switch (b.dataset.act) {
    case 'menu':
      world.setMenuMode((menu = !menu));
      break;
    case 'camera':
      world.setCameraMode((cam = cam === 'follow' ? 'table' : 'follow'));
      break;
    case 'quality':
      world.setQuality((quality = quality === 'high' ? 'low' : 'high'));
      break;
    case 'sit': {
      const me = players.get('me');
      const free = [0, 4, 7].find((s) => ![...players.values()].some((p) => p.seat === s));
      patch('me', { seat: me.seat >= 0 ? -1 : free ?? -1 });
      break;
    }
    case 'match':
      matchOn = !matchOn;
      break;
    case 'out':
      out = !out;
      world.setPlayerStatus('me', { out, hearts: out ? 0 : 2 });
      break;
  }
});
log(`pets: ${PETS.length}, chairs: ${CHAIRS.length} — WASD/Space/E, drag to orbit, wheel to zoom`);
