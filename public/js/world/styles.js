// CSS for everything the world puts in the DOM: projected labels (name tags, speech /
// chat bubbles, letter tiles, prompts, shop signs) and the touch controls overlay.
// Injected once; every class is prefixed `w-`.

const OUTLINE = (px, c = '#1b1b1b') => {
  const d = (px * 0.7).toFixed(1);
  return [
    `${px}px 0 ${c}`, `-${px}px 0 ${c}`, `0 ${px}px ${c}`, `0 -${px}px ${c}`,
    `${d}px ${d}px ${c}`, `-${d}px ${d}px ${c}`, `${d}px -${d}px ${c}`, `-${d}px -${d}px ${c}`,
  ].join(',');
};

const CSS = `
.w-layer { pointer-events: none; overflow: hidden; user-select: none; -webkit-user-select: none;
  font-family: 'Fredoka', 'Nunito', 'Trebuchet MS', system-ui, sans-serif; font-weight: 600; }
.w-layer.w-hidden { visibility: hidden; }
.w-lbl { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; will-change: transform;
  white-space: nowrap; display: none; }

/* Per-player stack, bottom to top: name row, turn arrow, letter tile, speech bubble, chat. */
.w-stack { display: flex; flex-direction: column-reverse; align-items: center; gap: 5px; }
.w-namerow { display: flex; align-items: center; gap: 6px; }
.w-name { color: #fff; font-size: 19px; font-weight: 700; letter-spacing: .2px;
  text-shadow: ${OUTLINE(2)}, 0 3px 4px rgba(0,0,0,.35); }
.w-name.w-dim { opacity: .5; }
.w-hearts { color: #ff3b4a; font-size: 18px; letter-spacing: 1px; text-shadow: ${OUTLINE(1.6)}; }
.w-out { background: #ff3b4a; color: #fff; font-size: 13px; font-weight: 700; padding: 1px 8px;
  border-radius: 8px; border: 2px solid #1b1b1b; letter-spacing: .5px; }
.w-arrow { color: #ffd43b; font-size: 26px; line-height: 20px; text-shadow: ${OUTLINE(2.2)};
  animation: w-bob .7s ease-in-out infinite alternate; }
.w-tile { min-width: 72px; height: 72px; padding: 0 14px; box-sizing: border-box; background: #fff;
  border: 3px solid #1b1b1b; border-radius: 18px; box-shadow: 0 6px 0 rgba(0,0,0,.28);
  color: #151515; font-size: 50px; font-weight: 700; line-height: 64px; text-align: center;
  letter-spacing: 2px; text-transform: uppercase; }
.w-tile.w-anim { animation: w-pop .5s cubic-bezier(.2,1.8,.4,1); }
.w-bubble { position: relative; margin-bottom: 11px; padding: 4px 16px 5px; background: #fff; color: #151515;
  border: 3px solid #1b1b1b; border-radius: 16px; box-shadow: 0 5px 0 rgba(0,0,0,.25);
  font-size: 28px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
.w-bubble::before, .w-bubble::after { content: ''; position: absolute; left: 50%; transform: translateX(-50%);
  width: 0; height: 0; border-style: solid; border-color: transparent; }
.w-bubble::before { bottom: -16px; border-width: 15px 11px 0; border-top-color: #1b1b1b; }
.w-bubble::after { bottom: -10px; border-width: 11px 8px 0; border-top-color: #fff; }
.w-bubble .w-hl { color: #3ddc54; text-decoration: underline; text-decoration-thickness: 4px;
  text-underline-offset: 4px; }
.w-bubble .w-dots { color: #8a8f98; letter-spacing: 3px; }
.w-bubble.w-good { animation: w-good .7s ease-out; }
.w-bubble.w-bad { animation: w-shake .45s linear; color: #ff3b4a; }
.w-chats { display: flex; flex-direction: column; align-items: center; gap: 5px; margin-bottom: 6px; }
.w-chat { position: relative; max-width: 230px; padding: 6px 12px; background: rgba(255,255,255,.96);
  color: #2b2d31; border-radius: 13px; box-shadow: 0 3px 8px rgba(0,0,0,.25); font-size: 16px;
  font-weight: 600; line-height: 1.25; text-align: center; white-space: normal; overflow-wrap: anywhere;
  animation: w-chat-in .25s ease-out, w-chat-out .45s ease-in 5.55s forwards; }
.w-chat:not(:last-child) { opacity: .8; }
.w-chat:last-child::after { content: ''; position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%);
  border: solid transparent; border-width: 9px 7px 0; border-top-color: rgba(255,255,255,.96); }

/* Shop chair / lucky block signs. */
.w-sign { display: flex; flex-direction: column; align-items: center; line-height: 1.05; }
.w-sign-name { color: #fff; font-size: 23px; font-weight: 700; text-shadow: ${OUTLINE(2.2)}; }
.w-sign-sub { font-size: 16px; font-weight: 700; text-shadow: ${OUTLINE(1.8)}; margin-top: 2px; }
.w-sign-price { color: #57e36a; font-size: 21px; font-weight: 700; text-shadow: ${OUTLINE(2)}; margin-top: 3px; }
.w-sign-price.w-owned { color: #fff; }
.w-sign-price.w-equipped { color: #ffd43b; }

/* Roblox-style ProximityPrompt. */
.w-prompt { pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 10px;
  padding: 7px 18px 7px 7px; background: rgba(18,20,26,.64); border-radius: 999px; color: #fff;
  font-size: 20px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,.25);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.w-prompt .w-key { width: 36px; height: 36px; border-radius: 10px; background: #fff; color: #1b1b1b;
  display: grid; place-items: center; font-size: 20px; box-shadow: inset 0 -3px 0 rgba(0,0,0,.2);
  transition: transform .08s; }
.w-prompt:hover .w-key { transform: scale(1.07); }
.w-prompt:active .w-key { transform: scale(.92); }
.w-prompt.w-disabled { cursor: default; opacity: .65; }
.w-prompt.w-disabled .w-key { background: #a3a7ad; }
.w-prompt.w-enter { animation: w-prompt-in .18s ease-out; }

/* Touch controls. */
.w-touch { position: fixed; inset: 0; pointer-events: none; z-index: 3; display: none; }
.w-touch.w-on { display: block; }
.w-joy { position: absolute; left: 0; top: 0; width: 124px; height: 124px; margin: -62px 0 0 -62px;
  border-radius: 50%; background: rgba(255,255,255,.14); border: 3px solid rgba(255,255,255,.55);
  box-sizing: border-box; display: none; }
.w-joy.w-on { display: block; }
.w-joy-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
  border-radius: 50%; background: rgba(255,255,255,.8); box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.w-jump { position: absolute; right: max(22px, env(safe-area-inset-right)); bottom: max(26px, env(safe-area-inset-bottom));
  width: 84px; height: 84px; border-radius: 50%; pointer-events: auto; touch-action: none;
  background: rgba(255,255,255,.18); border: 3px solid rgba(255,255,255,.6); box-sizing: border-box;
  display: grid; place-items: center; -webkit-tap-highlight-color: transparent; }
.w-jump.w-pressed { background: rgba(255,255,255,.38); transform: scale(.94); }
.w-jump svg { width: 42px; height: 42px; }

@keyframes w-bob { from { transform: translateY(-3px); } to { transform: translateY(4px); } }
@keyframes w-pop { 0% { transform: scale(.2); opacity: 0; } 60% { opacity: 1; } 100% { transform: scale(1); } }
@keyframes w-good { 0% { transform: scale(1); box-shadow: 0 5px 0 rgba(0,0,0,.25), 0 0 0 0 rgba(61,220,84,.9); }
  35% { transform: scale(1.12); border-color: #2fb344; box-shadow: 0 5px 0 rgba(0,0,0,.25), 0 0 0 10px rgba(61,220,84,.45); }
  100% { transform: scale(1); box-shadow: 0 5px 0 rgba(0,0,0,.25), 0 0 0 18px rgba(61,220,84,0); } }
@keyframes w-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px) rotate(-2deg); }
  40% { transform: translateX(7px) rotate(2deg); } 60% { transform: translateX(-5px); } 80% { transform: translateX(4px); } }
@keyframes w-chat-in { from { transform: translateY(8px) scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes w-chat-out { to { opacity: 0; transform: translateY(-6px); } }
@keyframes w-prompt-in { from { transform: scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }
`;

export function ensureWorldStyles() {
  if (document.getElementById('w-world-styles')) return;
  const style = document.createElement('style');
  style.id = 'w-world-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}
