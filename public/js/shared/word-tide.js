// Word Tide wire timing and geometry. Answer bank stays on the server.
export const TIDE = Object.freeze({ intro: 24000, hintPrice: 500, avatarHeadHeight: 5.6, outro: 14000, answer: 20000, reveal: 4000, flood: 3000, resolve: 2200, hearts: 5, rounds: 12, maxLetters: 40, winnerBonus: 100, rewardCap: 300, radius: 22, blockHeight: 2.2 });
export const TIDE_PHASES = ['tideIntro', 'tideAnswer', 'tideReveal', 'tideFlood', 'tideResolve'];
export const isTide = mode => mode === 'word_tide';
export const tideRise = (length, round) => Math.max(3, Math.ceil(length * [.65, .85, 1.05, 1.2][Math.min(3, Math.floor((round - 1) / 3))]));
// One clock drives the new blocks, platform, chair and rider.
export function tideBuildUnits(added, progress, reduced = false) {
 const step = Math.max(0, Math.min(added, progress * added));
 if (reduced || step >= added) return step;
 const whole = Math.floor(step), fraction = Math.min(1, (step - whole) * 3);
 return whole + fraction * fraction * (3 - 2 * fraction);
}
export function tidePosition(seat, count = 8) { const a = seat / Math.max(8, count) * Math.PI * 2, radius = Math.max(TIDE.radius, count * 1.65); return { x: Math.sin(a) * radius, z: Math.cos(a) * radius, yaw: a + Math.PI }; }

// A fatal loss completes at the current waterline before the next rise begins.
export function tideWaterProgress(match, elapsed) {
 if (match.phase !== 'tideFlood') return 1;
 const hold = (match.tide.holdMs || 0) / 1000;
 const k = Math.max(0, Math.min(1, (elapsed - hold) / (TIDE.flood / 1000)));
 return k * k * (3 - 2 * k);
}

export const tideSubmerged = (height, water) => water * TIDE.blockHeight > height * TIDE.blockHeight + TIDE.avatarHeadHeight + .05;
