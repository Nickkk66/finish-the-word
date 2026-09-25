// Settings: sound, graphics quality, ping; room settings + bots + "Start now" for the host; leave room.

import { h } from '../dom.js';
import { icons } from '../icons.js';
import { profile } from '../../profile.js';

/** Segmented buttons: options = [[label, value], ...]. */
function segmented(options, onPick) {
  const buttons = options.map(([label, value]) =>
    h('button', { type: 'button', class: 'seg-btn', onClick: () => onPick(value) }, label));
  return {
    el: h('div', { class: 'seg' }, buttons),
    set(value, disabled = false) {
      buttons.forEach((b, i) => {
        b.setAttribute('aria-pressed', String(options[i][1] === value));
        b.disabled = disabled;
      });
    },
  };
}

function row(label, control) {
  return h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), control);
}

/**
 * state: app state (hostId, you, settings, match, players)
 * actions: setSound, setQuality, hostSettings(patch), host(action), leave, ping()
 */
export function settingsPanel({ state, actions }) {
  return {
    id: 'settings',
    title: 'Settings',
    color: 'grey',
    icon: icons.gear,
    mount(body) {
      const sound = segmented([['On', true], ['Off', false]], actions.setSound);
      const quality = segmented([['High', 'high'], ['Low', 'low']], actions.setQuality);
      const ping = h('span', { class: 'set-value' });

      const hearts = segmented([['1', 1], ['2', 2], ['3', 3]], (v) => actions.hostSettings({ hearts: v }));
      const turn = segmented([['10s', 10], ['15s', 15], ['20s', 20]], (v) => actions.hostSettings({ turnSeconds: v }));
      const pets = segmented([['On', true], ['Off', false]], (v) => actions.hostSettings({ petAbilities: v }));
      const roomTitle = h('h3', { class: 'section-title stroke' });
      const hostLine = h('p', { class: 'panel-note' });
      const start = h('button', { type: 'button', class: 'btn green', onClick: () => actions.host('start') }, '▶ Start now');
      const hostTools = h('div', { class: 'host-tools' },
        h('button', { type: 'button', class: 'btn blue small', onClick: () => actions.host('addBot') }, '🤖 Add Bot'),
        h('button', { type: 'button', class: 'btn orange small', onClick: () => actions.host('removeBot') }, 'Remove Bot'),
        start);

      body.append(
        h('h3', { class: 'section-title stroke' }, 'Game'),
        h('div', { class: 'set-group' },
          row('🔊 Sound', sound.el),
          row('✨ Graphics', quality.el),
          row('📶 Ping', ping)),
        roomTitle,
        hostLine,
        h('div', { class: 'set-group' },
          row('❤️ Hearts', hearts.el),
          row('⏱️ Turn time', turn.el),
          row('🐾 Pet abilities', pets.el)),
        hostTools,
        h('div', { class: 'leave-row' },
          h('button', { type: 'button', class: 'btn red', onClick: actions.leave }, '🚪 Leave room')));

      function update() {
        const isHost = state.hostId === state.you;
        const phase = state.match?.phase ?? 'lobby';
        const seated = [...state.players.values()].filter((p) => p.seat >= 0).length;
        const ms = actions.ping();
        sound.set(profile.settings.sound);
        quality.set(profile.settings.quality);
        ping.textContent = ms == null ? '—' : `${ms} ms`;
        roomTitle.textContent = `Room ${state.code ?? ''}`;
        const host = state.players.get(state.hostId);
        hostLine.textContent = isHost
          ? "👑 You're the host. Changes apply to the next match."
          : `👑 Host: ${host ? host.name : '—'}. Only the host can change these.`;
        hearts.set(state.settings.hearts, !isHost);
        turn.set(state.settings.turnSeconds, !isHost);
        pets.set(state.settings.petAbilities, !isHost);
        hostTools.hidden = !isHost;
        start.disabled = !(phase === 'lobby' || phase === 'countdown') || seated < 2;
      }
      update();
      const timer = setInterval(update, 2000);   // keeps the ping fresh
      return { update, unmount: () => clearInterval(timer) };
    },
  };
}
