import { h } from '../dom.js';
import { icons } from '../icons.js';

/** Optional accounts: guests can always play; registration saves their current progress. */
export function accountPanel({ state, actions }) {
  return { id: 'account', title: 'Your Account', color: 'blue', icon: icons.face,
    mount(body) {
      let mode = 'login';
      let pending = false;
      let localError = '';
      const intro = h('p', { class: 'panel-note' }, 'No account needed to play. Create one to keep your collection and play on another device.');
      const status = h('p', { class: 'account-status', role: 'status', 'aria-live': 'polite' });
      const username = h('input', { class: 'field', name: 'username', required: true, minlength: 3, maxlength: 20, autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
      const password = h('input', { class: 'field', name: 'password', type: 'password', required: true, minlength: 5, maxlength: 128, autocomplete: 'current-password' });
      const confirm = h('input', { class: 'field', name: 'confirm-password', type: 'password', minlength: 5, maxlength: 128, autocomplete: 'new-password' });
      const confirmLabel = h('label', { class: 'field-label', hidden: true }, 'Confirm password', confirm);
      const recoveryInput = h('input', { class: 'field', name: 'recovery-code', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false' });
      const recoveryLabel = h('label', { class: 'field-label', hidden: true }, 'Recovery code', recoveryInput);
      const submit = h('button', { type: 'submit', class: 'btn green block' }, 'Log in');
      const note = h('p', { class: 'account-help' });
      const tabs = ['login', 'register', 'reset'].map((id) => h('button', { type: 'button', class: 'seg-btn', onClick: () => { mode = id; localError = ''; password.value = confirm.value = ''; update(); } }, id === 'login' ? 'Log in' : id === 'register' ? 'Create account' : 'Reset password'));
      const form = h('form', { class: 'account-form' }, h('div', { class: 'seg' }, tabs),
        h('label', { class: 'field-label' }, 'Username', username),
        recoveryLabel, h('label', { class: 'field-label' }, mode === 'reset' ? 'New password' : 'Password', password), confirmLabel, note, submit);
      const recoveryCode = h('code', { class: 'recovery-code' });
      const recoveryBox = h('div', { class: 'recovery-box', hidden: true },
        h('strong', {}, 'Save this recovery code now'),
        h('p', {}, 'Use it to set a new password if you forget yours. The code appears only once; a new one replaces the old one.'),
        recoveryCode,
        h('button', { type: 'button', class: 'btn small blue', onClick: () => navigator.clipboard.writeText(recoveryCode.textContent).then(() => { localError = 'Recovery code copied.'; update(); }).catch(() => {}) }, 'Copy code'));
      const newRecovery = h('button', { type: 'button', class: 'btn small blue', onClick: async () => {
        pending = true; localError = ''; update();
        try { await actions.accountRecovery(); } catch (error) { localError = error.message || 'Could not create recovery code.'; }
        finally { pending = false; update(); }
      } }, 'Generate recovery code');
      const cloud = h('button', { type: 'button', class: 'btn blue', hidden: true, onClick: async () => {
        pending = true; update();
        try { await actions.accountUseCloud(); } catch (error) { localError = error.message || 'Could not load your cloud save.'; }
        finally { pending = false; update(); }
      } }, 'Load cloud save');
      const logout = h('button', { type: 'button', class: 'btn small grey', onClick: async () => {
        pending = true; localError = ''; update();
        try { await actions.accountLogout(); } catch (error) { localError = error.message || 'Could not log out.'; }
        finally { pending = false; update(); }
      } }, 'Log out');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (pending || !form.reportValidity()) return;
        if (mode !== 'login' && password.value !== confirm.value) { localError = 'The passwords don’t match.'; update(); return; }
        pending = true; localError = ''; update();
        try {
          const credentials = { username: username.value.trim(), password: password.value, ...(mode === 'reset' ? { recoveryCode: recoveryInput.value.trim() } : {}) };
          await (mode === 'register' ? actions.accountRegister(credentials) : mode === 'reset' ? actions.accountReset(credentials) : actions.accountLogin(credentials));
          password.value = confirm.value = '';
          recoveryInput.value = '';
        } catch (error) { localError = error.message || 'Could not connect. Please try again.'; }
        finally { pending = false; update(); }
      });
      body.append(intro, status, form, recoveryBox, newRecovery, cloud, logout);
      function update() {
        const account = state.account || {};
        const signedIn = !!account.username;
        const busy = pending || !!account.busy;
        form.hidden = signedIn;
        logout.hidden = !signedIn;
        newRecovery.hidden = !signedIn;
        recoveryBox.hidden = !account.recoveryCode;
        recoveryCode.textContent = account.recoveryCode || '';
        cloud.hidden = !signedIn || account.status !== 'conflict';
        status.classList.toggle('error', !!(localError || account.error));
        status.textContent = localError || account.error || (busy ? 'Connecting…' : signedIn
          ? `Signed in as ${account.username} · ${account.status === 'saving' ? 'Saving…' : account.status === 'conflict' ? 'Newer progress exists on another device. Load the cloud save to continue.' : account.status === 'expired' ? 'Session expired — log out and log in again.' : account.status === 'offline' ? 'Offline — reconnect to save.' : 'Progress saved to your account'}`
          : 'Playing as a guest — progress is saved in this browser.');
        tabs.forEach((tab, i) => { tab.setAttribute('aria-pressed', String(['login', 'register', 'reset'][i] === mode)); tab.disabled = busy; });
        confirmLabel.hidden = mode === 'login'; confirm.required = mode !== 'login';
        recoveryLabel.hidden = mode !== 'reset'; recoveryInput.required = mode === 'reset';
        password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        submit.textContent = busy ? 'Please wait…' : mode === 'register' ? 'Create & save my progress' : mode === 'reset' ? 'Set new password' : 'Log in';
        note.textContent = mode === 'register' ? 'Use 3–20 letters, numbers or underscores for your username and at least 5 characters for your password. Save the recovery code shown after signup.' : mode === 'reset' ? 'Enter the recovery code you saved when signing up, then choose a new password (at least 5 characters).' : 'Logging in loads this account’s collection and progress. Your current guest save stays on this device.';
        for (const control of [username, password, confirm, recoveryInput, submit, logout, cloud, newRecovery]) control.disabled = busy;
      }
      update(); return { update };
    },
  };
}
