// Small Chrome DevTools helper for browser verification, no runtime dependency.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function browser() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ftw-v2-browser-'));
  const binary = process.env.CHROME_BIN || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
  const processChrome = spawn(binary, ['--remote-debugging-pipe', `--user-data-dir=${directory}`, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const pending = new Map(), pages = new Map(); let seq = 0, buffer = '';
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timer });
      processChrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
  }
  processChrome.on('error', (error) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); });
  processChrome.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const msg = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (msg.id) {
        const p = pending.get(msg.id); if (!p) continue; pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(Error(msg.error.message)); else p.resolve(msg.result);
      } else {
        const page = pages.get(msg.sessionId); if (!page) continue;
        if (msg.method === 'Runtime.exceptionThrown') page.errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/fonts\.g/.test(msg.params.entry.url || '')) page.errors.push(msg.params.entry.text);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') page.errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
      }
    }
  });
  return {
    pages,
    async page(name, width = 1280, height = 800, mobile = false) {
      const { browserContextId } = await call('Target.createBrowserContext');
      const { targetId } = await call('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
      const cdp = (method, params) => call(method, params, sessionId);
      const page = { name, cdp, errors: [] }; pages.set(sessionId, page);
      await Promise.all([cdp('Runtime.enable'), cdp('Page.enable'), cdp('Log.enable'), cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }), cdp('Emulation.setFocusEmulationEnabled', { enabled: true })]);
      if (mobile) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
      page.eval = async (expression) => {
        const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result?.value;
      };
      page.nav = (url) => cdp('Page.navigate', { url });
      page.wait = async (expression, timeout = 20000) => {
        const end = Date.now() + timeout;
        while (Date.now() < end) { const value = await page.eval(expression).catch(() => false); if (value) return value; await delay(100); }
        throw Error(`${name} timed out: ${expression}; errors=${page.errors.join(';')}`);
      };
      page.click = (selector) => page.eval(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable selector: '+${JSON.stringify(selector)});e.click();return true;})()`);
      page.clickText = (text, selector = 'button') => page.eval(`(() => {const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)})&&!e.disabled&&e.getClientRects().length);if(!e)throw Error('Unavailable button: '+${JSON.stringify(text)});e.click();return true;})()`);
      page.send = (msg) => page.eval(`window.__ftw.net.send(${JSON.stringify(msg)})`);
      page.state = () => page.eval(`(()=>{const s=window.__ftw.state;return {...s,players:[...s.players.values()]};})()`);
      page.type = (text) => cdp('Input.insertText', { text });
      page.key = async (key, code, windowsVirtualKeyCode, text) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, text }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode }); };
      page.shot = async (label) => {
        await delay(350); // Let panel transitions settle before visual verification.
        mkdirSync('.e2e-shots', { recursive: true });
        const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
        const file = path.resolve('.e2e-shots', `${name}-${label}.png`); writeFileSync(file, Buffer.from(data, 'base64')); return file;
      };
      return page;
    },
    async close() {
      processChrome.kill(); await delay(150);
      for (const p of pending.values()) clearTimeout(p.timer); pending.clear();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
