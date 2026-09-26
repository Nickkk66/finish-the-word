// Shared constants used by BOTH the server (src/) and the browser client (public/js/).
// Keep this file dependency-free (plain ES module, no DOM / no Node APIs).

export const PROTOCOL_VERSION = 3;

// ---- Rooms -------------------------------------------------------------------
export const MAX_PLAYERS = 8;            // humans + bots per room
export const SEAT_COUNT = 8;             // seats around the table
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const ROOM_CODE_REGEX = /^[A-Z0-9]{4,8}$/;
export const NAME_MAX = 16;
export const CHAT_MAX = 120;

export function makeRoomCode(random = Math.random) {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return s;
}

// ---- Word rules --------------------------------------------------------------
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 30;
export const BASE_MISTAKES = 5;          // wrong submissions allowed per turn

// ---- Timing (ms) -------------------------------------------------------------
export const COUNTDOWN_MS = 8000;        // after 2+ players are seated
export const CHOOSE_MS = 10000;          // chooser picks a starting letter
export const ROUND_END_MS = 2500;        // pause after someone loses a heart
export const MATCH_END_MS = 7000;        // winner celebration before back to lobby
export const MIN_TURN_MS = 6000;         // shrinking timer floor (before pet modifiers)
export const ABS_MIN_TURN_MS = 4000;     // floor after sabotage
export const RECONNECT_GRACE_MS = 20000;

export const DEFAULT_SETTINGS = Object.freeze({
  hearts: 2,          // 1..3
  turnSeconds: 15,    // 10 | 15 | 20
  petAbilities: true,
  mode: 'classic',
  botLevel: 'normal',
  public: false,
});

export const MODES = [
  { id: 'classic', name: 'Classic', description: 'The original word chain.', hearts: 2, turnSeconds: 15 },
  { id: 'blitz', name: 'Blitz', description: 'Eight seconds, getting faster.', hearts: 1, turnSeconds: 8 },
  { id: 'long', name: 'Long Words', description: 'Five letters minimum, then longer.', hearts: 2, turnSeconds: 20 },
  { id: 'double', name: 'Double Trouble', description: 'Carry the last two letters.', hearts: 2, turnSeconds: 15 },
  { id: 'sudden', name: 'Sudden Death', description: 'One heart. One mistake.', hearts: 1, turnSeconds: 15 },
  { id: 'random', name: 'Random Letter', description: 'Any letter in the last word can be next.', hearts: 2, turnSeconds: 15 },
  { id: 'chaos', name: 'Chaos', description: 'A new twist every round.', hearts: 2, turnSeconds: 15 },
  { id: 'roulette', name: 'Roulette', description: 'The cursed cup. Drink or pass. Last awake wins.', hearts: 1, turnSeconds: 10 },
  { id: 'custom', name: 'Custom', description: 'Your own room rules.', hearts: 2, turnSeconds: 15 },
];
export const MODE_IDS = new Set(MODES.map((m) => m.id));
export const BOT_LEVELS = {
  easy: { name: 'Easy', minLength: 3, maxLength: 6, think: [3000, 7000], wpm: [25, 35], wrongChance: .20, blankChance: .12, pressureBelow: 8, pressurePerSecond: .04 },
  normal: { name: 'Normal', minLength: 3, maxLength: 7, think: [2000, 5000], wpm: [35, 50], wrongChance: .12, blankChance: .07, pressureBelow: 7, pressurePerSecond: .03 },
  hard: { name: 'Hard', minLength: 3, maxLength: 9, think: [1500, 4000], wpm: [55, 75], wrongChance: .06, blankChance: .03, pressureBelow: 6, pressurePerSecond: .02 },
};
export const EMOTES = ['dance', 'dance2', 'dance3', 'wave', 'point', 'cheer', 'laugh'];
export const FLAIRS = {
  first_word: { label: 'FIRST WORD!', coins: 2, color: '#ffd43b' },
  close_call: { label: 'CLOSE CALL!', coins: 5, color: '#ffb347' },
  buzzer: { label: 'BUZZER BEATER!', coins: 10, color: '#ff615e' },
  huge_word: { label: 'HUGE WORD!', coins: 0, color: '#b88bff' },
  rare_letter: { label: 'RARE LETTER!', coins: 3, color: '#d0a0ff' },
  double_clear: { label: 'DOUBLE CLEAR!', coins: 3, color: '#5edfff' },
  speed_demon: { label: 'SPEED DEMON!', coins: 5, color: '#ffb347' },
  combo_3: { label: 'COMBO x3!', coins: 0, color: '#ffb347' },
  combo_5: { label: 'ON FIRE!', coins: 0, color: '#ff684b' },
  combo_8: { label: 'UNSTOPPABLE!', coins: 0, color: '#fa5aca' },
  flawless: { label: 'FLAWLESS!', coins: 25, color: '#ffe070' },
  comeback: { label: 'COMEBACK!', coins: 15, color: '#78ebc2' },
};

// ---- Economy -----------------------------------------------------------------
export const START_COINS = 300;
export const REWARDS = Object.freeze({ participation: 5, perWord: 10, win: 0, winPerMinute: 15, maxWin: 1800 });
export const HINT_PRICE = 250;
export const PET_MERGE_COUNT = 3;
export const PET_MAX_TIER = 3;

// ---- World layout (owned by the world module; server does not use these) ----
// 1 unit = 1 Roblox stud. Y is up. Ground is y = 0.
export const LAYOUT = {
  tableCenter: { x: 0, z: 0 },
  tableRadius: 5.5,
  tableHeight: 3.0,
  seatRadius: 7.6,
  seatHeight: 2.0,       // top of chair seat; seated avatar hips sit here
  spawn: { x: 0, y: 0, z: 26 },
  islandRadius: 70,
  portal: { x: 0, z: 77.5 },
};

export const OBBY = {
  spawn: { x: 600, y: 20, z: 0 },
  finish: { x: 600, y: 30, z: -150 },
  killY: 0,
  reward: 50,
  cooldownMs: 10 * 60 * 1000,
  minFinishMs: 30000,
};
