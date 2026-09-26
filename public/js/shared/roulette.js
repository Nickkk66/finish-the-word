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
