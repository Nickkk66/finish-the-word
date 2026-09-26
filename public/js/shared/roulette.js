// Shared presentation timing and server-checked hazard footprints.
export const ROULETTE_INTRO_MS = 7000;
export const ROULETTE_DRINK_MS = 4800;
export const ROULETTE_PASS_MS = 1700;
export const ROULETTE_HAZARDS = [
  {x:-20,z:4,r:4}, {x:21,z:18,r:4.5}, {x:-6,z:-33,r:4}, {x:33,z:-16,r:4.5},
];
export function sipLift(seconds) {
  const smooth = value => { const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x); };
  return seconds < .85 ? smooth(seconds/.85) : seconds < 2.45 ? 1 : 1-smooth((seconds-2.45)/.65);
}
export const inRouletteFire = pos => !!pos && pos.y < 2 && pos.y > -2 && ROULETTE_HAZARDS.some(h => Math.hypot(pos.x-h.x,pos.z-h.z)<h.r);

// Relative to the smallest entry, each doubling removes 20% of base risk,
// capped at 40%. Equal entries have equal odds; no bet buys immunity.
export function rouletteOdds(baseRisk, stake, minimumStake = 25) {
  const discount = Math.min(.4, Math.max(0, .2 * Math.log2(Math.max(1, stake / Math.max(25, minimumStake)))));
  return { risk: baseRisk * (1 - discount), reduction: baseRisk * discount };
}
export const METEOR_INTERVAL_MS = 180000;
export const METEOR_FLIGHT_MS = 2400;
export const METEOR_SITES = [{x:0,z:22},{x:0,z:-18},{x:15,z:-10}];
