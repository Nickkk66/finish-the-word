// Shared constants used by BOTH the server (src/) and the browser client (public/js/).
// Keep this file dependency-free (plain ES module, no DOM / no Node APIs).

export const PROTOCOL_VERSION = 1;

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
});

// ---- Economy -----------------------------------------------------------------
export const START_COINS = 300;
export const REWARDS = Object.freeze({ participation: 5, perWord: 10, win: 50 });

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
};
