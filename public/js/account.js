// Optional cloud saves; guest play stays available even while the network is down.
import { exportProfile, replaceProfile, onProfileChange } from './profile.js';
import { apiUrl } from './net.js';

const KEY = 'ftw_account_v1', GUEST = 'ftw_guest_v1';
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch {} };

export function createAccount({ onChange, beforeReplace }) {
  let session = read(KEY), applying = false, timer, inFlight = null, generation = 0;
  const state = { username: session?.username || '', status: session ? 'connecting' : 'guest', busy: false, error: '' };
  const emit = () => onChange({ ...state });
  function status(value, error = '') { state.status = value; state.error = error; emit(); }
  async function request(path, method = 'GET', body, token = session?.token) {
    const response = await fetch(apiUrl(`/api/account/${path}`), {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Could not connect to your account.'), { status: response.status });
    return data;
  }
  function apply(profile) {
    beforeReplace();
    applying = true;
    try { replaceProfile(profile); } finally { applying = false; }
  }
  function failure(error) {
    status(error.status === 409 ? 'conflict' : error.status === 401 ? 'expired' : 'offline', error.message);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => save(), 700); }
  async function save() {
    if (inFlight) return inFlight;
    if (!session?.dirty || ['conflict', 'expired'].includes(state.status)) return;
    const current = session, ticket = generation, snapshot = exportProfile();
    status('saving');
    inFlight = (async () => {
      try {
        const result = await request('profile', 'PUT', { revision: current.revision, profile: snapshot }, current.token);
        if (ticket !== generation) return;
        current.revision = result.revision;
        current.dirty = JSON.stringify(snapshot) !== JSON.stringify(exportProfile());
        write(KEY, current); if (!current.dirty) write(`ftw_backup_${current.username}`, null); status(current.dirty ? 'saving' : 'saved');
      } catch (error) { if (ticket === generation) failure(error); }
      finally { inFlight = null; if (ticket === generation && current.dirty && state.status === 'saving') schedule(); }
    })();
    return inFlight;
  }
  onProfileChange(() => {
    if (applying || !session) return;
    session.dirty = true; write(KEY, session); schedule();
  });
  async function resume() {
    if (!session) { emit(); return; }
    const ticket = generation;
    try {
      const data = await request('me');
      if (ticket !== generation) return;
      if (session.dirty) {
        if (session.revision !== data.revision) { status('conflict', 'Another device has a newer save. Your local progress is still safe.'); return; }
        await save();
      } else {
        session.revision = data.revision; write(KEY, session); apply(data.profile); status('saved');
      }
    } catch (error) { if (ticket === generation) failure(error); }
  }
  async function authenticate(mode, credentials) {
    if (state.busy) return;
    state.busy = true; state.error = ''; emit();
    try {
      const data = await request(mode, 'POST', { ...credentials, ...(mode === 'register' ? { profile: exportProfile() } : {}) }, null);
      if (!session) write(GUEST, exportProfile());
      generation++; clearTimeout(timer);
      session = { username: data.username, token: data.token, revision: data.revision, dirty: false };
      write(KEY, session); state.username = data.username;
      const backup = read(`ftw_backup_${data.username}`);
      if (backup?.dirty && backup.profile?.id === data.profile.id) {
        session.dirty = true; session.revision = backup.revision; write(KEY, session);
        apply(backup.profile);
        if (backup.revision !== data.revision) status('conflict', 'This device has unsaved progress and another device has a newer cloud save.');
        else await save();
      } else { apply(data.profile); status('saved'); }
    } finally { state.busy = false; emit(); }
  }
  const ready = resume();
  window.addEventListener('online', () => { if (session && !['conflict', 'expired'].includes(state.status)) resume(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  // One active tab per browser profile avoids mixing two identities or racing local saves.
  window.addEventListener('storage', event => { if (event.key === KEY || event.key === 'ftw_profile_v1') location.reload(); });
  setInterval(() => { if (session?.dirty && state.status === 'offline') save(); }, 30000);
  return {
    ready, save,
    register: credentials => authenticate('register', credentials),
    login: credentials => authenticate('login', credentials),
    async useCloud() {
      const data = await request('me');
      write(`ftw_backup_${session.username}`, { profile: exportProfile(), revision: session.revision, dirty: false });
      generation++; session.revision = data.revision; session.dirty = false; write(KEY, session);
      apply(data.profile); status('saved');
    },
    async logout() {
      await save();
      if (session?.dirty && state.status === 'saving') await save();
      if (session) {
        // Retain even unsynced/conflicting progress before restoring the device's guest save.
        write(`ftw_backup_${session.username}`, { profile: exportProfile(), revision: session.revision, dirty: session.dirty });
        try { await request('logout', 'POST'); } catch { /* revoke on expiry when offline */ }
      }
      generation++; clearTimeout(timer); session = null; write(KEY, null); state.username = '';
      apply(read(GUEST) || {}); status('guest');
    },
  };
}
