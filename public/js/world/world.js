// createWorld(): the 3D island, players and effects behind the World API (docs/SPEC.md §5).

import * as THREE from 'three';
import { LAYOUT, SEAT_COUNT, OBBY } from '../shared/constants.js';
import { BLOCKS, CHAIRS, CARD_BOXES, RARITIES } from '../shared/catalog.js';
import { createTerrain } from './terrain.js';
import { createProps } from './props.js';
import { createTable } from './table.js';
import { createLobby } from './lobby.js';
import { PlayerEntity } from './player.js';
import { LabelLayer, Label, Prompt, Sign } from './labels.js';
import { CharacterMotor, Input, isTouchDevice } from './controls.js';
import { CameraRig } from './camera.js';
import { Effects } from './effects.js';
import { setTextureAnisotropy } from './textures.js';
import { DECK, groundHeight, seatX, seatZ } from './layout.js';
import { wrapAngle } from './math.js';
import { createThumbnails } from './thumbnails.js';
import { BlockPreview } from './block-preview.js';
import { createObby } from './obby.js';
import { createAmbient } from './ambient.js';

const MOVE_INTERVAL = 100; // ms: local moves are sent at most 10×/s
const STAND = Object.freeze({ type: 'stand' });

/** Waits (bounded) for Fredoka so canvas text (boards) uses it. */
async function loadFonts() {
  if (!document.fonts?.load) return;
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    await Promise.race([Promise.all([document.fonts.load('700 48px Fredoka'), document.fonts.load('600 20px Fredoka')]), timeout]);
  } catch {
    // Fallback fonts are fine.
  }
}

function defaultPrompt(i) {
  if (i.type === 'seat') return { text: 'Sit', key: 'E', enabled: true };
  if (i.type === 'shopChair') return { text: 'Buy', key: 'E', enabled: true };
  if (i.type === 'block') return { text: 'Open', key: 'E', enabled: true };
  if (i.type === 'cardBox') return { text: 'Open cards', key: 'E', enabled: true };
  return null;
}

export async function createWorld({ container, labelLayer }) {
  await loadFonts();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false; // updated once per frame before labels + render
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1500);

  const terrain = createTerrain(scene);
  const props = createProps(scene);
  const table = createTable(scene);
  const lobby = createLobby(scene);
  const colliders = [...props.colliders, ...table.colliders, ...lobby.colliders];
  const effects = new Effects(scene);
  const labels = new LabelLayer(labelLayer, canvas);
  const rig = new CameraRig(camera);
  const input = new Input(canvas, container);
  const motor = new CharacterMotor(colliders);
  const touch = isTouchDevice();
  const thumbnails = createThumbnails(renderer);
  const preview = new BlockPreview(labels, thumbnails);
  const obby = createObby(scene, labels);
  const ambient = createAmbient(scene);

  // ---- Lobby signs + interactables ----
  const shopSigns = CHAIRS.map((chair) => {
    const item = lobby.shopItems.find((s) => s.chairId === chair.id);
    const sign = new Sign(labels, { name: chair.name, sub: chair.rarity, subColor: RARITIES[chair.rarity]?.color });
    sign.anchor.set(item.x, item.labelY, item.z);
    return { chair, sign };
  });
  const shop = { owned: new Set(['wooden']), equipped: 'wooden' };
  function renderShop() {
    for (const { chair, sign } of shopSigns) {
      if (shop.equipped === chair.id) sign.setPrice('Equipped', 'equipped');
      else if (shop.owned.has(chair.id)) sign.setPrice('Owned', 'owned');
      else sign.setPrice('$' + chair.price.toLocaleString('en-US'));
    }
  }
  renderShop();
  for (const b of lobby.blocks) {
    const def = BLOCKS.find((d) => d.id === b.blockId);
    const sign = new Sign(labels, { name: def.name });
    sign.setPrice('$' + def.price.toLocaleString('en-US'));
    sign.anchor.set(b.x, b.labelY, b.z);
  }
  for (const b of lobby.cardBoxes) {
    const def = CARD_BOXES.find(d => d.id === b.boxId);
    const sign = new Sign(labels, { name: def.name, sub: 'CARDS', subColor: def.color });
    sign.setPrice('$' + def.price.toLocaleString('en-US')); sign.anchor.set(b.x, b.labelY, b.z);
  }

  const interactables = [];
  for (let s = 0; s < SEAT_COUNT; s++) {
    interactables.push({ i: { type: 'seat', seat: s }, x: seatX(s), z: seatZ(s), y: DECK.top + 3.4, range: 5.5, stamp: 0 });
  }
  for (const it of lobby.shopItems) {
    const px = it.x + Math.sin(it.ry) * 2.3;
    const pz = it.z + Math.cos(it.ry) * 2.3;
    interactables.push({ i: { type: 'shopChair', chairId: it.chairId }, x: it.x, z: it.z, px, pz, y: it.promptY, range: 5.2, stamp: 0 });
  }
  for (const b of lobby.blocks) {
    interactables.push({ i: { type: 'block', blockId: b.blockId }, x: b.x, z: b.z, y: b.promptY, range: 6, stamp: 0 });
  }
  for (const b of lobby.cardBoxes) interactables.push({ i: { type: 'cardBox', boxId: b.boxId }, x: b.x, z: b.z, y: b.promptY, range: 6, stamp: 0 });

  // ---- State ----
  const players = new Map();
  const cardTargets = new Map();
  const targetGeometry = new THREE.CylinderGeometry(2.2, 2.2, 6, 24, 1, true).translate(0, 3, 0);
  function clearCardTargets() {
    for (const { glow, label } of cardTargets.values()) {
      glow.removeFromParent(); glow.material.dispose(); label.destroy();
    }
    cardTargets.clear();
  }
  const targetRay = new THREE.Raycaster();
  let targetPointer = null;
  canvas.addEventListener('pointerdown', event => { targetPointer = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', event => {
    if (!targetPointer || Math.hypot(event.clientX - targetPointer.x, event.clientY - targetPointer.y) > 8 || !cardTargets.size) return;
    const rect = canvas.getBoundingClientRect();
    targetRay.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
    const hit = targetRay.intersectObjects([...cardTargets.values()].map(t => t.glow))[0];
    if (hit) cardTargets.get(hit.object.userData.playerId)?.select();
  });
  const seatOccupant = new Array(SEAT_COUNT).fill(null);
  const interactListeners = [];
  const moveListeners = [];
  const viewListeners = [];
  let firstPerson = false;
  let zone = 'island';
  let portalUntil = 0;
  let obbyStarted = 0;
  let obbyFinished = false;
  let checkpoint = { ...OBBY.spawn, index: 0 };
  let promptResolver = null;
  let localId = null;
  let menuMode = false;
  let cameraMode = 'follow';
  let viewW = 1;
  let viewH = 1;
  let raf = 0;

  const local = () => (localId ? players.get(localId) ?? null : null);

  function emitInteract(i) {
    for (const cb of interactListeners) cb({ ...i });
  }
  const prompt = new Prompt(labels, () => {
    if (prompt.target) emitInteract(prompt.target.i);
  });

  function refreshSeat(s) {
    const e = seatOccupant[s] ? players.get(seatOccupant[s]) : null;
    table.setChair(s, e ? e.data.chair : 'wooden');
  }
  function vacate(s, id) {
    if (s >= 0 && seatOccupant[s] === id) {
      seatOccupant[s] = null;
      refreshSeat(s);
    }
  }

  function applyCameraMode() {
    rig.setMode(menuMode ? 'menu' : cameraMode);
    rig.firstPerson = firstPerson && !menuMode;
    input.firstPerson = rig.firstPerson;
    const me = local();
    if (me) { me.avatar.root.visible = !rig.firstPerson; me.stack.visible = !rig.firstPerson; }
  }
  function updateInputActive() {
    input.setActive(!menuMode && !!local(), touch);
  }

  function attachLocal(e) {
    e.setLocal(true);
    motor.teleport(e.pos.x, e.pos.y, e.pos.z, e.yaw);
    rig.resetBehind(e.yaw);
    cameraMode = e.seat >= 0 ? 'table' : 'follow';
    applyCameraMode();
    updateInputActive();
  }

  function onLocalSeatChange(e) {
    if (e.seat >= 0) {
      cameraMode = 'table';
    } else {
      motor.teleport(e.pos.x, e.pos.y, e.pos.z, e.yaw);
      rig.resetBehind(e.yaw);
      cameraMode = 'follow';
    }
    applyCameraMode();
  }

  /** Seat to frame in table mode: our seat, else the one nearest to us. */
  function viewSeat() {
    const e = local();
    if (!e) return 0;
    if (e.seat >= 0) return e.seat;
    let best = 0;
    let bestD = Infinity;
    for (let s = 0; s < SEAT_COUNT; s++) {
      const d = Math.hypot(seatX(s) - e.pos.x, seatZ(s) - e.pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  // ---- Prompts: nearest in-range interactable whose resolver returns a prompt ----
  let frameNo = 0;
  function updatePrompt(e) {
    frameNo++;
    preview.visible = false;
    if (!e || e.seat >= 0 || menuMode) {
      prompt.set(null, null);
      return;
    }
    let nearBlock = null, nearDistance = 8;
    for (const spot of [...lobby.blocks, ...lobby.cardBoxes]) {
      const d = Math.hypot(spot.x - e.pos.x, spot.z - e.pos.z);
      if (d < nearDistance) { nearBlock = spot; nearDistance = d; }
    }
    if (nearBlock) {
      const cards = !!nearBlock.boxId;
      const def = (cards ? CARD_BOXES : BLOCKS).find(b => b.id === (nearBlock.boxId ?? nearBlock.blockId));
      preview.showBox(def, nearBlock, cards);
    }
    for (;;) {
      let best = null;
      let bestD = Infinity;
      for (const it of interactables) {
        if (it.stamp === frameNo || (it.i.type === 'seat' && seatOccupant[it.i.seat])) continue;
        const d = Math.hypot(it.x - e.pos.x, it.z - e.pos.z);
        if (d < it.range && d < bestD) {
          best = it;
          bestD = d;
        }
      }
      if (!best) {
        prompt.set(null, null);
        return;
      }
      const info = (promptResolver ?? defaultPrompt)(best.i);
      if (info) {
        prompt.anchor.set(best.px ?? best.x, best.y, best.pz ?? best.z);
        prompt.set(best, info);
        return;
      }
      best.stamp = frameNo; // hidden by the resolver: try the next nearest
    }
  }

  // ---- Local move emission: ≤10 Hz, only when the quantized state changed ----
  let lastSent = null;
  let lastSentAt = -Infinity;
  const q2 = (v) => Math.round(v * 100) / 100;
  function emitMove(now, e) {
    if (!e || e.seat >= 0 || menuMode || !moveListeners.length || now - lastSentAt < MOVE_INTERVAL) return;
    const x = q2(motor.pos.x);
    const y = q2(motor.pos.y);
    const z = q2(motor.pos.z);
    const ry = q2(wrapAngle(motor.yaw));
    const anim = motor.anim;
    if (lastSent && lastSent.x === x && lastSent.y === y && lastSent.z === z && lastSent.ry === ry && lastSent.anim === anim) return;
    lastSent = { x, y, z, ry, anim };
    lastSentAt = now;
    for (const cb of moveListeners) cb({ ...lastSent });
  }

  // ---- Resize / quality ----
  function resize() {
    viewW = container.clientWidth || window.innerWidth;
    viewH = container.clientHeight || window.innerHeight;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.fov = camera.aspect < 0.8 ? 70 : 60;
    camera.updateProjectionMatrix();
    labels.measure();
  }
  /** 'high': pixel ratio ≤ 2 + shadows · 'low': pixel ratio ≤ 1, no shadows. */
  function setQuality(level) {
    const low = level === 'low';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
    terrain.sun.castShadow = !low;
    ambient.setQuality(level);
    resize();
  }
  setQuality('high');
  new ResizeObserver(resize).observe(container);

  // ---- Frame loop ----
  const move = new THREE.Vector2();
  const focus = new THREE.Vector3();
  const shadowFocus = new THREE.Vector3();
  const head = new THREE.Vector3();
  const feet = new THREE.Vector3();
  let last = 0;
  let time = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;
    time += dt;

    const me = local();
    obby.update(time, dt);
    if (me && !menuMode) {
      if (me.seat >= 0) {
        if (input.consumeJumpPress()) emitInteract(STAND);
        input.consumeInteract();
      } else {
        input.readMove(move);
        const jumpPress = input.consumeJumpPress();
        motor.step(dt, move, rig.moveYaw, jumpPress || input.jumpHeld);
        if (zone === 'obby') {
          if (motor.pos.y < OBBY.killY || motor.contact?.kind === 'kill') {
            motor.teleport(checkpoint.x, checkpoint.y, checkpoint.z, Math.PI);
            me.place(checkpoint.x, checkpoint.y, checkpoint.z, Math.PI);
            rig.snapTarget = true; rig.blend = 1;
            emitInteract({ type: 'obbyRespawn' });
          }
          const pad = motor.grounded ? motor.standingOn : null;
          if (pad?.kind === 'checkpoint' && pad.checkpoint === checkpoint.index + 1) checkpoint = { x: pad.x, y: pad.y + pad.h / 2, z: pad.z, index: pad.checkpoint };
          if (pad?.kind === 'finish' && !obbyFinished && checkpoint.index === 3) {
            obbyFinished = true; emitInteract({ type: 'obbyFinish', ms: Math.round(now - obbyStarted) });
          }
        }
        me.setMotorState(motor);
        if (input.consumeInteract() && prompt.visible && prompt.enabled && prompt.target) emitInteract(prompt.target.i);
      }
      if (me.seat < 0 && now > portalUntil) {
        const targets = zone === 'island' ? [{ x: LAYOUT.portal.x, y: .25, z: LAYOUT.portal.z }] : [obby.returnPortal, obby.startReturn];
        if (targets.some(p => Math.hypot(me.pos.x - p.x, me.pos.z - p.z) < 1.8 && Math.abs(me.pos.y - p.y) < 3)) {
          portalUntil = now + 3500;
          emitInteract({ type: 'portal', to: zone === 'island' ? 'obby' : 'island' });
        }
      }
    }
    rig.orbit(input.orbitX, input.orbitY);
    rig.zoom(input.zoomDelta);
    input.orbitX = input.orbitY = input.zoomDelta = 0;

    for (const e of players.values()) e.tick(dt, time, now);
    for (const [id, target] of cardTargets) {
      const e = players.get(id);
      if (!e) continue;
      target.glow.position.copy(e.render);
      target.glow.material.opacity = .15 + .12 * (1 + Math.sin(time * 7));
      target.glow.scale.setScalar(1 + .04 * Math.sin(time * 7));
      target.label.anchor.set(e.render.x, e.render.y + 7, e.render.z);
    }
    table.update(time, dt);
    lobby.update(time, dt);
    terrain.update(time);
    ambient.update(time, dt, me?.pos);

    if (me) focus.copy(me.render);
    else focus.set(LAYOUT.spawn.x, 0, LAYOUT.spawn.z);
    rig.update(dt, time, focus, viewSeat());
    terrain.setSkyFocus(camera.position);
    effects.update(dt, camera);

    // Keep the tight shadow frustum where the camera is looking.
    if (rig.mode === 'menu') terrain.setShadowFocus(shadowFocus.set(0, 0, 0), 78);
    else if (rig.mode === 'table') terrain.setShadowFocus(shadowFocus.set(0, 0, 0), 30);
    else {
      shadowFocus.set(rig.target.x - Math.sin(rig.yaw) * 16, me?.render.y ?? 0, rig.target.z - Math.cos(rig.yaw) * 16);
      terrain.setShadowFocus(shadowFocus, 46);
    }

    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    updatePrompt(me);
    labels.update(camera, viewW, viewH);
    emitMove(now, me);
    renderer.render(scene, camera);
    thumbnails.tick();
  }

  // ---- World API ----
  const world = {
    start() {
      if (!raf) raf = requestAnimationFrame(frame);
    },

    setMenuMode(on) {
      menuMode = !!on;
      labels.setVisible(!menuMode);
      updateInputActive();
      applyCameraMode();
    },

    addPlayer(player) {
      if (!player || typeof player.id !== 'string') return;
      if (players.has(player.id)) {
        world.updatePlayer(player);
        return;
      }
      const e = new PlayerEntity({ scene, labels }, player);
      players.set(player.id, e);
      if (e.seat >= 0) {
        seatOccupant[e.seat] = e.id;
        refreshSeat(e.seat);
      }
      if (player.id === localId) attachLocal(e);
    },

    updatePlayer(player) {
      const e = players.get(player?.id);
      if (!e) {
        world.addPlayer(player);
        return;
      }
      const prevChair = e.data.chair;
      e.update(player);
      const seat = Number.isInteger(player.seat) && player.seat >= 0 && player.seat < SEAT_COUNT ? player.seat : -1;
      if (seat !== e.seat) {
        vacate(e.seat, e.id);
        if (seat >= 0) {
          e.sit(seat);
          seatOccupant[seat] = e.id;
          refreshSeat(seat);
        } else {
          e.stand();
        }
        if (e.isLocal) onLocalSeatChange(e);
      } else if (seat >= 0 && prevChair !== player.chair) {
        refreshSeat(seat);
      }
    },

    removePlayer(id) {
      const e = players.get(id);
      if (!e) return;
      vacate(e.seat, id);
      const target = cardTargets.get(id);
      if (target) { target.glow.removeFromParent(); target.glow.material.dispose(); target.label.destroy(); cardTargets.delete(id); }
      e.dispose();
      players.delete(id);
      updateInputActive();
    },

    setLocalPlayer(id) {
      const previous = local();
      if (previous) { previous.setLocal(false); previous.avatar.root.visible = true; previous.stack.visible = true; }
      localId = id;
      const e = local();
      if (e) attachLocal(e);
      else updateInputActive();
    },

    applyMoves(list) {
      if (!Array.isArray(list)) return;
      const now = performance.now();
      for (const m of list) {
        if (!m || m.id === localId) continue;
        players.get(m.id)?.pushMove(m, now);
      }
    },

    onLocalMove(cb) {
      moveListeners.push(cb);
    },

    setInputEnabled(on) {
      input.setEnabled(!!on);
    },

    onInteract(cb) {
      interactListeners.push(cb);
    },

    setPromptResolver(fn) {
      promptResolver = typeof fn === 'function' ? fn : null;
    },

    setBubble(id, bubble) {
      players.get(id)?.stack.setBubble(bubble);
    },

    setChatBubble(id, text) {
      if (text) players.get(id)?.stack.addChat(text);
    },

    setLetterTile(id, letters) {
      players.get(id)?.stack.setTile(letters);
    },

    setPlayerStatus(id, status) {
      players.get(id)?.setStatus(status || {});
    },

    playEffect(id, kind, data = {}) {
      const e = players.get(id);
      if (!e) return;
      e.headPosition(head);
      feet.copy(e.render);
      effects.burst(kind, head, feet);
      const a = e.avatar;
      if (kind === 'flair') {
        e.stack.flair(data.text ?? '', data.color);
        effects.burst('correct', head, feet);
        for (const other of players.values()) if (other.id !== id) other.avatar.flinch();
      }
      if (kind === 'correct') a.nod();
      else if (kind === 'wrong') a.shakeHead();
      else if (kind === 'heart') a.flinch();
      else if (kind === 'eliminated') { a.launch(); e.stack.flair('KO!', '#ff546b'); }
      else if (kind === 'win') a.playEmote('dance');
      else if (kind === 'hatch') a.cheer(1.2);
    },

    setShopState(state) {
      shop.owned = new Set(['wooden', ...(Array.isArray(state?.ownedChairs) ? state.ownedChairs : [])]);
      shop.equipped = state?.equippedChair || 'wooden';
      renderShop();
    },

    setLeaderboard(rows) {
      lobby.setLeaderboard(rows);
    },

    setLeaderboardTitle(title) { lobby.setLeaderboardTitle(title); },
    setTable(id) { table.setTable(id); },
    renderThumbnail: thumbnails.render,
    setPetCollection(ids) { preview.setCollection(ids); },
    beginCardTargeting(ids, onSelect) {
      clearCardTargets();
      for (const id of ids) {
        const e = players.get(id);
        if (!e) continue;
        const glow = new THREE.Mesh(targetGeometry, new THREE.MeshBasicMaterial({ color: '#78ffe2', transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide }));
        glow.userData.playerId = id; scene.add(glow);
        const label = new Label(labels, 'w-card-target', { minScale: .75, maxScale: 1, maxDist: 100 });
        const select = () => onSelect(id);
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = id === localId ? 'Choose me' : `Choose ${e.data.name}`;
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', select); label.el.append(button);
        cardTargets.set(id, { glow, label, select });
      }
    },
    cancelCardTargeting: clearCardTargets,
    playHatch(id) { world.playEffect(id, 'hatch'); },
    playPortal(id) {
      const e = players.get(id);
      if (!e || e.seat >= 0) return;
      e.avatar.portalT = 0;
      effects.ring(e.render, 12, 1.2, '#81eaff');
      effects.sparkRing(e.render, 50, ['#85f5ff', '#bf8fff', '#ffffff']);
    },
    playEmote(id, name) { players.get(id)?.avatar.playEmote(name); },
    setFirstPerson(on) {
      firstPerson = !!on; rig.firstPitch = 0; rig.seatedYaw = 0; rig.blend = 1;
      if (!firstPerson && document.pointerLockElement === canvas) document.exitPointerLock?.();
      applyCameraMode();
      for (const callback of viewListeners) callback(firstPerson);
    },
    onViewChange(cb) { viewListeners.push(cb); },
    teleportLocal(pos) {
      const me = local();
      if (!me || me.seat >= 0 || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
      const y = Number.isFinite(pos.y) ? pos.y : groundHeight(pos.x, pos.z);
      motor.teleport(pos.x, y, pos.z, pos.ry ?? Math.PI);
      me.place(pos.x, y, pos.z, pos.ry ?? Math.PI);
      rig.resetBehind(me.yaw); rig.blend = 1;
      lastSent = null; portalUntil = performance.now() + 2500;
    },
    teleportToPlayer(id) {
      const target = players.get(id);
      if (!target) return;
      world.setZone(target.pos.x > 400 ? 'obby' : 'island');
      world.teleportLocal({ x: target.pos.x + 3, y: target.pos.y, z: target.pos.z });
    },
    setZone(value) {
      zone = value === 'obby' ? 'obby' : 'island';
      obby.setVisible(zone === 'obby');
      motor.platforms = zone === 'obby' ? obby.platforms : null;
      if (zone === 'obby') {
        obbyStarted = performance.now(); obbyFinished = false; checkpoint = { ...OBBY.spawn, index: 0 };
      }
    },
    debugSnapshot() {
      return { zone, firstPerson, localPosition: local()?.pos.toArray() ?? null, checkpoint: { ...checkpoint },
        obbyElapsedMs: zone === 'obby' ? performance.now() - obbyStarted : 0,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        cardTargets: [...cardTargets.keys()], hatchAnimations: [...players.values()].filter(e => e.avatar.cheerT > 0).map(e => e.id), portalAnimations: [...players.values()].filter(e => e.avatar.portalT >= 0).map(e => e.id),
        grounded: motor.grounded, platformKind: motor.standingOn?.kind ?? null };
    },

    setCameraMode(mode) {
      if (mode !== 'follow' && mode !== 'table') return;
      cameraMode = mode;
      applyCameraMode();
    },

    setQuality,
  };
  return world;
}
