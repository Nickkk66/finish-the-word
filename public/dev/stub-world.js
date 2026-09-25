// Dev stand-in for /js/world/world.js (load the game with ?stubworld=1).
// Implements the full World API (SPEC §5) as logging no-ops over a plain gradient background, plus a small
// debug panel: a roster that mirrors what the glue sends (seat, turn/out/hearts, letter tile, bubbles, chat)
// and buttons that fire onInteract() using the prompt resolver's labels. Space while seated = 'stand'.

import { CHAIRS, BLOCKS } from '/js/shared/catalog.js';
import { SEAT_COUNT } from '/js/shared/constants.js';

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text != null) node.textContent = text;
  return node;
}

export async function createWorld({ container }) {
  const log = (...args) => console.debug('[stub-world]', ...args);
  const players = new Map();   // id -> { p, bubble, tile, status, chat, effect }
  let localId = null;
  let menuMode = false;
  let inputEnabled = true;
  let interact = () => {};
  let resolve = () => null;

  container.append(el('div', 'position:absolute;inset:0;background:linear-gradient(#6ec3f4,#d5f1ff 62%,#5fbf3a 62.2%,#53ad31)'));
  const panel = el('div', 'position:absolute;right:10px;bottom:10px;width:310px;max-height:46vh;overflow:auto;padding:8px;'
    + 'font:600 12px/1.35 monospace;color:#fff;background:rgba(0,0,0,.6);border-radius:10px;pointer-events:auto;z-index:1');
  const roster = el('div');
  const buttons = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px');
  panel.append(el('div', 'font-weight:700;margin-bottom:4px', 'stub-world'), roster, buttons);
  container.append(panel);

  const targets = [
    ...Array.from({ length: SEAT_COUNT }, (_, seat) => ({ type: 'seat', seat })),
    { type: 'stand' },
    ...CHAIRS.slice(1, 4).map((c) => ({ type: 'shopChair', chairId: c.id })),
    ...BLOCKS.map((b) => ({ type: 'block', blockId: b.id })),
  ];

  function render() {
    panel.style.display = menuMode ? 'none' : '';
    roster.replaceChildren(...[...players.values()].map((e) => {
      const s = e.status;
      const bits = [
        `${e.p.id === localId ? '★' : ' '}${e.p.name} seat:${e.p.seat}`,
        s ? `${s.turn ? 'TURN ' : ''}${s.out ? 'OUT ' : ''}♥${s.hearts ?? '-'}` : '',
        e.tile ? `[${e.tile}]` : '',
        e.bubble ? `"${e.bubble.text}"(${e.bubble.tone},hl${e.bubble.highlight})` : '',
        e.chat ? `💬${e.chat}` : '',
        e.effect ? `✨${e.effect}` : '',
      ];
      return el('div', null, bits.filter(Boolean).join(' '));
    }));
    buttons.replaceChildren(...targets.map((t) => {
      const prompt = resolve(t);
      const label = `${t.type === 'seat' ? `S${t.seat} ` : t.chairId || t.blockId || ''} ${prompt ? prompt.text : '—'}`;
      const b = el('button', 'font:600 11px monospace;padding:2px 5px', label.trim());
      b.disabled = !prompt || prompt.enabled === false;
      b.onclick = () => interact(t);
      return b;
    }));
  }
  setInterval(render, 500);   // prompt labels depend on coins / seats

  window.addEventListener('keydown', (e) => {
    const me = players.get(localId);
    if (e.code === 'Space' && inputEnabled && !menuMode && me && me.p.seat >= 0) {
      e.preventDefault();
      interact({ type: 'stand' });
    }
  });

  const entry = (id) => players.get(id);
  const patch = (id, key, value) => {
    const e = entry(id);
    if (!e) return;
    e[key] = value;
    render();
  };

  return {
    start: () => log('start'),
    setMenuMode(on) { menuMode = on; log('menuMode', on); render(); },
    addPlayer(p) { players.set(p.id, { p }); render(); },
    updatePlayer(p) { patch(p.id, 'p', p); },
    removePlayer(id) { players.delete(id); render(); },
    setLocalPlayer(id) { localId = id; log('local', id); render(); },
    applyMoves() {},
    onLocalMove() {},
    setInputEnabled(on) { inputEnabled = on; },
    onInteract(cb) { interact = cb; },
    setPromptResolver(fn) { resolve = fn; },
    setBubble(id, bubble) { patch(id, 'bubble', bubble); },
    setChatBubble(id, text) {
      patch(id, 'chat', text);
      setTimeout(() => { if (entry(id)?.chat === text) patch(id, 'chat', null); }, 6000);
    },
    setLetterTile(id, letters) { patch(id, 'tile', letters); },
    setPlayerStatus(id, status) { patch(id, 'status', status); },
    playEffect(id, kind) {
      log('effect', id, kind);
      patch(id, 'effect', kind);
      setTimeout(() => { if (entry(id)?.effect === kind) patch(id, 'effect', null); }, 1500);
    },
    setShopState: (s) => log('shop', s),
    setLeaderboard: (rows) => log('leaderboard', rows),
    setCameraMode: (mode) => log('camera', mode),
    setQuality: (level) => log('quality', level),
  };
}
