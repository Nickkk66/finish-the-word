// Word Tide wire timing and geometry. Answer bank stays on the server.
export const TIDE = Object.freeze({ intro: 18000, answer: 20000, reveal: 3000, flood: 3000, resolve: 2200, hearts: 5, rounds: 12, maxLetters: 40, rewardCap: 150, radius: 22, blockHeight: 2.2 });
export const TIDE_PHASES = ['tideIntro', 'tideAnswer', 'tideReveal', 'tideFlood', 'tideResolve'];
export const isTide = mode => mode === 'word_tide';
export const tideRise = (length, round) => Math.max(3, Math.ceil(length * [.65, .85, 1.05, 1.2][Math.min(3, Math.floor((round - 1) / 3))]));
export function tidePosition(seat) { const a = seat / 8 * Math.PI * 2; return { x: Math.sin(a) * TIDE.radius, z: Math.cos(a) * TIDE.radius, yaw: a + Math.PI }; }
