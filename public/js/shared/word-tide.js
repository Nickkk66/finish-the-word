// Word Tide wire timing and geometry. Answer bank stays on the server.
export const TIDE = Object.freeze({ intro: 24000, outro: 16000, answer: 20000, reveal: 4000, flood: 3000, resolve: 2200, hearts: 5, rounds: 12, maxLetters: 40, rewardCap: 150, radius: 22, blockHeight: 2.2 });
export const TIDE_PHASES = ['tideIntro', 'tideAnswer', 'tideReveal', 'tideFlood', 'tideResolve'];
export const isTide = mode => mode === 'word_tide';
export const tideRise = (length, round) => Math.max(3, Math.ceil(length * [.65, .85, 1.05, 1.2][Math.min(3, Math.floor((round - 1) / 3))]));
export function tidePosition(seat, count = 8) { const a = seat / Math.max(8, count) * Math.PI * 2, radius = Math.max(TIDE.radius, count * 1.65); return { x: Math.sin(a) * radius, z: Math.cos(a) * radius, yaw: a + Math.PI }; }
