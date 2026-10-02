// The accessory and hands share one pose, so the strum stays on the strings.
export function guitarPose(time, blend) {
  const beat = Math.sin(time * 9);
  return {
    x: Math.sin(Math.PI * blend) * 1.8,
    y: .12 + blend * .13 + beat * .012 * blend,
    z: -.72 + blend * 1.44,
    yaw: Math.PI * (1 - blend),
    roll: .42 + beat * .012 * blend,
    strum: Math.sin(time * 9),
  };
}

// Landmarks on the native GLB, normalized to its 3.3-unit fitted height.
const scale = 3.3 / (1.031850624 + .012696028);
export const GUITAR_CONTACTS = {
  strum: [0, (.30 - .509577298) * scale, (.062 - .002553606) * scale],
  neck: [0, (.72 - .509577298) * scale, (.062 - .002553606) * scale],
};
