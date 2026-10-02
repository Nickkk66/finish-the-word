// Cosmetics + pets catalog shared by server and client.
// Server reads pet abilities from here; client reads names/prices/visuals.

export const RARITIES = {
  Common:    { color: '#b0b7c3', order: 0 },
  Uncommon:  { color: '#4cd964', order: 1 },
  Rare:      { color: '#3aa0ff', order: 2 },
  Epic:      { color: '#b45cff', order: 3 },
  Legendary: { color: '#ffb300', order: 4 },
  Secret: { color: '#e79bff', order: 5 },
};

// ---- Avatar customization ----------------------------------------------------
export const SKIN_COLORS  = ['#f5cd30', '#ffd9b3', '#eab892', '#c68642', '#8d5524', '#5c3a21', '#f2f3f3', '#a3a2a5'];
export const SHIRT_COLORS = ['#e53935', '#0d69ac', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#212121', '#ffffff', '#00acc1', '#ec407a'];
export const PANTS_COLORS = ['#a4bd47', '#1e3a8a', '#263238', '#4e342e', '#2e7d32', '#6a1b9a', '#37474f', '#b71c1c', '#f5f5f5'];
export const HAIR_COLORS  = ['#b5561c', '#3b2314', '#f2c14e', '#111111', '#e8e8e8', '#d81b60', '#1e88e5', '#7cb342'];
export const HAIR_STYLES  = ['Bald', 'Bacon', 'Spiky', 'Long'];     // look.hairStyle index
export const FACES        = ['Smile', 'Grin', 'Cool', 'Wow'];        // look.face index

// Classic "noob" look, used as a preset in the menu.
export const NOOB_LOOK = { skin: '#f5cd30', shirt: '#0d69ac', pants: '#a4bd47', hair: '#b5561c', hairStyle: 0, face: 0 };

export function randomLook(random = Math.random) {
  const pick = (a) => a[Math.floor(random() * a.length)];
  return {
    skin: pick(SKIN_COLORS),
    shirt: pick(SHIRT_COLORS),
    pants: pick(PANTS_COLORS),
    hair: pick(HAIR_COLORS),
    hairStyle: 1 + Math.floor(random() * (HAIR_STYLES.length - 1)),
    face: Math.floor(random() * FACES.length),
  };
}

// Validates/normalizes an untrusted look object (used by server + client).
export function sanitizeLook(look) {
  const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback);
  const int = (v, max, fallback) => (Number.isInteger(v) && v >= 0 && v < max ? v : fallback);
  const l = look && typeof look === 'object' ? look : {};
  return {
    skin: hex(l.skin, NOOB_LOOK.skin),
    shirt: hex(l.shirt, NOOB_LOOK.shirt),
    pants: hex(l.pants, NOOB_LOOK.pants),
    hair: hex(l.hair, NOOB_LOOK.hair),
    hairStyle: int(l.hairStyle, HAIR_STYLES.length, 1),
    face: int(l.face, FACES.length, 0),
  };
}

// ---- Chairs (cosmetic seats, bought with coins) ------------------------------
// Displayed in a row in the lobby shop; the equipped chair replaces your seat
// at the table while you sit there.
export const CHAIRS = [
  { id: 'wooden',   name: 'Wooden',   rarity: 'Common',    price: 0 },
  { id: 'glass',    name: 'Glass',    rarity: 'Common',    price: 800 },
  { id: 'goop',     name: 'Goop',     rarity: 'Uncommon',  price: 1000 },
  { id: 'toilet',   name: 'Toilet',   rarity: 'Uncommon',  price: 1200 },
  { id: 'slime',    name: 'Slime',    rarity: 'Uncommon',  price: 1600 },
  { id: 'flower',   name: 'Flower',   rarity: 'Uncommon',  price: 2800 },
  { id: 'swing',    name: 'Swing',    rarity: 'Rare',      price: 4000 },
  { id: 'gamer',    name: 'Gamer',    rarity: 'Rare',      price: 6000 },
  { id: 'electric', name: 'Electric', rarity: 'Epic',      price: 10000 },
  { id: 'throne',   name: 'Throne',   rarity: 'Legendary', price: 25000 },
];
export const CHAIR_IDS = new Set(CHAIRS.map((c) => c.id));

// ---- Pets --------------------------------------------------------------------
// ability types (applied server-side when settings.petAbilities is on):
//   time      : +value seconds on your own turns
//   mistakes  : +value extra wrong guesses allowed per turn
//   shield    : blocks the first heart you would lose each match
//   sabotage  : after you play a valid word, the next player's turn is value seconds shorter
export const PETS = [
  // Starter Block pool
  { id: 'doggy',   name: 'Doggy',   rarity: 'Common',    emoji: '🐶', ability: { type: 'time', value: 1 },     model: { kind: 'dog',     body: '#d9a066', accent: '#8a5a2b' } },
  { id: 'kitty',   name: 'Kitty',   rarity: 'Common',    emoji: '🐱', ability: { type: 'mistakes', value: 1 }, model: { kind: 'cat',     body: '#f4a340', accent: '#ffffff' } },
  { id: 'bunny',   name: 'Bunny',   rarity: 'Uncommon',  emoji: '🐰', ability: { type: 'time', value: 1 },     model: { kind: 'bunny',   body: '#f5f5f5', accent: '#ff9ec7' } },
  { id: 'froggy',  name: 'Froggy',  rarity: 'Uncommon',  emoji: '🐸', ability: { type: 'mistakes', value: 1 }, model: { kind: 'frog',    body: '#6cc24a', accent: '#f7e26b' } },
  { id: 'piggy',   name: 'Piggy',   rarity: 'Uncommon',  emoji: '🐷', ability: { type: 'time', value: 3 }, model: { kind: 'pig',     body: '#ffb3c7', accent: '#e57399' } },
  { id: 'foxy',    name: 'Foxy',    rarity: 'Rare',      emoji: '🦊', ability: { type: 'sabotage', value: 1 },     model: { kind: 'fox',     body: '#ff7a1a', accent: '#ffffff' } },
  // Pets from upgraded blocks
  { id: 'bear',    name: 'Grizzly', rarity: 'Rare',      emoji: '🐻', ability: { type: 'sabotage', value: 2 }, model: { kind: 'bear',    body: '#7b4a2a', accent: '#d9b38c' } },
  { id: 'penguin', name: 'Pengu',   rarity: 'Rare',      emoji: '🐧', ability: { type: 'time', value: 3 },     model: { kind: 'penguin', body: '#1f2937', accent: '#ffffff' } },
  { id: 'owl',     name: 'Hoot',    rarity: 'Epic',      emoji: '🦉', ability: { type: 'time', value: 3 },     model: { kind: 'owl',     body: '#9c6b3c', accent: '#ffd166' } },
  { id: 'unicorn', name: 'Sparkle', rarity: 'Rare',      emoji: '🦄', ability: { type: 'shield', value: 1 },   model: { kind: 'unicorn', body: '#ffffff', accent: '#c77dff' } },
  { id: 'dragon',  name: 'Blaze',   rarity: 'Legendary', emoji: '🐲', ability: { type: 'dragon', value: 3, chance: .5 }, model: { kind: 'dragon',  body: '#e63946', accent: '#ffd60a' } },
  { id: 'robot',   name: 'Tick-Tock', rarity: 'Legendary', emoji: '🤖', ability: { type: 'time', value: 4 },   model: { kind: 'robot',   body: '#9fb4c7', accent: '#38bdf8' } },
];
PETS.push(
  {id:'shellback',name:'Shellback',rarity:'Rare',emoji:'🐢',ability:{type:'timeFloor',value:8},model:{kind:'turtle',body:'#6b994a',accent:'#395d32'}},
  {id:'frostbite',name:'Frostbite',rarity:'Epic',emoji:'🐧',ability:{type:'dragonGuard',value:1},model:{kind:'penguin',body:'#73c8ed',accent:'#f0fbff'}},
  {id:'badger',name:'Ironhide',rarity:'Rare',emoji:'🦏',ability:{type:'penaltyResist',value:1},model:{kind:'rhino',body:'#8b93a1',accent:'#e6dfc8'}},
  {id:'moth',name:'Moon Moth',rarity:'Epic',emoji:'🦋',ability:{type:'mistakeGuard',value:1},model:{kind:'moth',body:'#77759e',accent:'#cfc7ff'}}
);
// Abilities are locked at match start. Merging changes appearance, not power.
const SIP_ABILITIES = {
  doggy: { type: 'poisonResist', value: .05 }, kitty: { type: 'extraPass', value: 1 },
  bunny: { type: 'sipTime', value: 1 }, froggy: { type: 'poisonResist', value: .10 },
  piggy: { type: 'prizeBonus', value: .05 }, foxy: { type: 'poisonResist', value: .15 },
  bear: { type: 'prizeBonus', value: .10 }, penguin: { type: 'sipTime', value: 3 },
  owl: { type: 'sipTime', value: 3 }, unicorn: { type: 'antidote', value: 1 },
  dragon: { type: 'poisonResist', value: .25 }, robot: { type: 'poisonResist', value: .30 },
  shellback:{type:'poisonResist',value:.10},frostbite:{type:'antidote',value:1},badger:{type:'extraPass',value:1},moth:{type:'sipTime',value:2},
};
const TIDE_BONUSES = { doggy: 1, kitty: 2, bunny: 2, froggy: 3, piggy: 1, foxy: 2, bear: 2, penguin: 3, owl: 5, dragon: 4, robot: 4, shellback:2,frostbite:3,badger:2,moth:3 };
for (const pet of PETS) pet.abilities = {
  classic: pet.ability,
  roulette: SIP_ABILITIES[pet.id],
  word_tide: pet.id === 'unicorn' ? { type: 'tideShield', value: 1 } : { type: 'tideGuard', value: TIDE_BONUSES[pet.id] * .05 },
};
export const PETS_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p]));

export function petAbility(petId, mode) {
  const key = mode === 'roulette' || mode === 'roulette_deadly' ? 'roulette' : mode === 'word_tide' ? mode : 'classic';
  return PETS_BY_ID[petId]?.abilities[key] || null;
}

export function petAbilityRows(pet) {
  return [['CLASSIC', pet.abilities.classic], ['THE LAST SIP', pet.abilities.roulette], ['WORD TIDE', pet.abilities.word_tide]]
    .map(([mode, ability]) => ({ mode, text: abilityText(ability) }));
}

export function abilityText(ability) {
  if (!ability) return 'No ability';
  switch (ability.type) {
    case 'timeFloor': return `Timer penalties cannot reduce your turn below ${ability.value}s`;
    case 'dragonGuard': return 'Block the first Blaze trigger / match';
    case 'penaltyResist': return 'Timer penalties reduced by 1s';
    case 'mistakeGuard': return 'Block the first mistake-reduction card / match';
    case 'time': return `+${ability.value}s on your turns`;
    case 'mistakes': return `+${ability.value} guesses / turn`;
    case 'shield': return 'Save 1 heart / match';
    case 'sabotage': return `Next player: −${ability.value}s`;
    case 'dragon': return '50%: next player gets 3s';
    case 'poisonResist': return `−${Math.round(ability.value * 100)}% poison risk`;
    case 'extraPass': return `+${ability.value} pass / match`;
    case 'sipTime': return `+${ability.value}s to decide`;
    case 'prizeBonus': return `+${Math.round(ability.value * 100)}% winner pot`;
    case 'antidote': return 'Block 1 poison / match';
    case 'tideShield': return 'Save 1 heart / match';
    case 'tideGuard': return `${Math.round(ability.value * 100)}%: protect a heart`;
    default: return '';
  }
}

// Lucky blocks: walk up + press E in the lobby to open (costs coins).
// odds are relative weights.
export const BLOCKS = [
  { id: 'starter', name: 'Starter Block', price: 300,  color: '#ffd43b',
    odds: { doggy: 35, kitty: 30, bunny: 15, froggy: 10, piggy: 7, foxy: 3 } },
  { id: 'secret',  name: 'Mystic Block',  price: 1500, color: '#9b5de5',
    odds: { bear: 25, penguin: 25, shellback: 20, badger: 20, moth: 10 } },
  { id: 'mythic', name: 'Mythic Block', price: 3000, color: '#ff8357',
    odds: { owl: 40, frostbite: 40, dragon: 8, robot: 8, unicorn: 4 } },
];

export function rollBlock(block, random = Math.random) {
  const entries = Object.entries(block.odds);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = random() * total;
  for (const [id, w] of entries) {
    if ((r -= w) < 0) return id;
  }
  return entries[entries.length - 1][0];
}

// Scene styles selected by game mode. Tables are not player-owned or purchasable.
export const TABLES = [
  { id: 'classic', name: 'Classic' },
  { id: 'picnic', name: 'Picnic' },
  { id: 'glass', name: 'Glass' },
  { id: 'donut', name: 'Donut' },
  { id: 'poker', name: 'Poker' },
  { id: 'pizza', name: 'Pizza' },
  { id: 'ice', name: 'Ice' },
  { id: 'lava', name: 'Lava' },
  { id: 'galaxy', name: 'Galaxy' },
  { id: 'royal', name: 'Royal' },
];
export const TABLE_IDS = new Set(TABLES.map((v) => v.id));
export const BACK_BLING = [
  { id: 'none', name: 'None', rarity: 'Common', price: 0 },
  { id: 'backpack', name: 'Backpack', rarity: 'Common', price: 400 },
  { id: 'cape', name: 'Cape', rarity: 'Common', price: 700 },
  { id: 'angel', name: 'Angel Wings', rarity: 'Uncommon', price: 1500 },
  { id: 'devil', name: 'Devil Wings', rarity: 'Uncommon', price: 1500 },
  { id: 'sword', name: 'Sword', rarity: 'Rare', price: 3000 },
  { id: 'guitar', name: 'Guitar', rarity: 'Rare', price: 3500 },
  { id: 'jetpack', name: 'Jetpack', rarity: 'Epic', price: 20000 },
  { id: 'rainbow', name: 'Rainbow Cape', rarity: 'Epic', price: 25000 },
  { id: 'dragon', name: 'Dragon Wings', rarity: 'Legendary', price: 15000 },
  { id: 'halo', name: 'Golden Halo', rarity: 'Legendary', price: 25000 },
  { id: 'secret_crown', name: 'Secret Crown', rarity: 'Secret', secret: true, retired: true, price: null },
  { id: 'secret_scythe', name: 'Phantom Scythe', rarity: 'Secret', secret: true, retired: true, price: null },
  { id: 'secret_goggles_shield', name: 'Alpine Ski Goggles', rarity: 'Secret', secret: true, price: null, mount: 'head' },
  { id: 'secret_goggles_split', name: 'Storm Ski Goggles', rarity: 'Secret', secret: true, price: null, mount: 'head' },
  { id: 'secret_goggles_racer', name: 'Ridge Ski Goggles', rarity: 'Secret', secret: true, price: null, mount: 'head' },
  { id: 'secret_helmet', name: 'Bug Hunter Horns', rarity: 'Secret', secret: true, price: null },
];
export const SECRET_BACK_IDS = new Set(BACK_BLING.filter(item => item.secret).map(item => item.id));
export const BACK_IDS = new Set(BACK_BLING.map((v) => v.id));

// Consumables are separate from pets. Ownership follows the casual local profile economy;
// the room validates timing/targets and spends registered counts, never client-supplied effects.
export const CARDS = [
  { id: 'skip', name: 'Free Pass', rarity: 'Epic', effect: 'skip', description: "Skip your own or another player's next turn. No heart lost!", color: '#59d89c' },
  { id: 'time_tax', name: 'Time Tax', rarity: 'Uncommon', effect: 'time', value: 2, description: "Give the player you choose 2 fewer seconds on their next turn.", color: '#53baff' },
  { id: 'pressure', name: 'Narrow Margin', rarity: 'Rare', effect: 'mistakes', value: 2, description: 'The player you choose gets 2 fewer allowed mistakes on every remaining turn this match (at least 1).', color: '#a489ff' },
  { id: 'heart', name: 'Heartbreaker', rarity: 'Legendary', effect: 'heart', value: 1, description: "50% chance to remove a heart. A pet shield can block a hit.", color: '#ff668c' },
];
CARDS.push(
  {id:'slow_burn',name:'Slow Burn',rarity:'Rare',effect:'burn',value:1,description:'−1 second on each of the next two turns. Copies stack; minimum 6 seconds.',color:'#ff995b'},
  {id:'lifeline',name:'Lifeline',rarity:'Epic',effect:'heal',description:'50% chance to restore one heart. Cannot revive or exceed starting hearts.',color:'#84e7b4'},
  {id:'arcane_ward',name:'Nope',rarity:'Legendary',effect:'ward',description:'Arm on anyone alive. Automatically blocks the next hostile card. Cannot disarm; unused copy returns at match end.',color:'#bf89ff'},
  {id:'mirrored_shield',name:'Mirrored Shield',rarity:'Legendary',effect:'reflect',description:'Arm on anyone alive. Reflect the next hostile card to its sender once. Cannot disarm; unused copy returns at match end.',color:'#86d9ef'},
  {id:'card_jam',name:'Card Jam',rarity:'Rare',effect:'jam',description:'Target cannot play or arm new cards until their next word turn ends. Armed defenses still work.',color:'#e899cf'}
);
export const CARDS_BY_ID = Object.fromEntries(CARDS.map((v) => [v.id, v]));
export const CARD_IDS = new Set(CARDS.map((v) => v.id));
export const CARD_BOXES = [
  { id: 'card_crate', name: 'Card Crate', price: 500, color: '#19b5aa', odds: { time_tax: 50, pressure: 25, slow_burn:15, card_jam:10 }, x: -26, z: 26 },
  { id: 'royal_cards', name: 'Royal Card Crate', price: 1500, color: '#e7a928', odds: { skip: 4, time_tax: 26, pressure: 30, heart: 5, slow_burn:15, lifeline:8, arcane_ward:3, mirrored_shield:2, card_jam:7 }, x: -34, z: 20 },
];
