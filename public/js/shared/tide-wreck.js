export const WRECK = Object.freeze({ shake: .8, break: 1.05, water: 2.3, jump: 6, land: 7.4, breach: 11, fish: 13.4, grab: 14, drag: 15.5, sink: 17, gone: 18, rescued: 18, cameraEnd: 23, swarmEnd: 26, finaleDelay: 5 });
export function wreckStage(seconds) {
  if (seconds < 0) return 'waiting';
  if (seconds < WRECK.shake) return 'shake';
  if (seconds < WRECK.break) return 'break';
  if (seconds < WRECK.water) return 'fall';
  if (seconds < WRECK.jump) return 'swim';
  if (seconds < WRECK.land) return 'warningJump';
  if (seconds < WRECK.breach) return 'stalk';
  if (seconds < WRECK.grab) return 'breach';
  if (seconds < WRECK.drag) return 'grab';
  if (seconds < WRECK.sink) return 'drag';
  if (seconds < WRECK.gone) return 'sink';
  return 'gone';
}
