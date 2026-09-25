#!/usr/bin/env node
// The engine behind the double-click launchers (*.command). No dependencies.
//
//   node scripts/control.mjs            interactive menu
//   node scripts/control.mjs play       run the game on this computer
//   node scripts/control.mjs online     test, deploy to Cloudflare, save to GitHub, turn GitHub Pages on
//   node scripts/control.mjs offline    turn the Cloudflare site and GitHub Pages off (--yes skips the question)
//   node scripts/control.mjs check      make sure everything works

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', '.bin', 'wrangler');
const LOCAL_URL = 'http://127.0.0.1:8787';
const CHECK_PORT = 8790;           // private server for `check`, so it never clashes with a running game
const OFFLINE_CONFIG = path.join(ROOT, 'wrangler.offline.toml');
const SYNC_FILES = ['index.html', 'js/main.js', 'js/net.js', 'js/world/world.js', 'js/shared/constants.js'];

// The Cloudflare host lives in net.js (the client needs it too); the Pages URL follows from the git remote.
const GAME_SERVER = readFileSync(path.join(ROOT, 'public/js/net.js'), 'utf8').match(/GAME_SERVER = '([^']+)'/)[1];
const CLOUDFLARE_URL = `https://${GAME_SERVER}`;
let REPO = null;       // 'owner/name'
let PAGES_URL = null;

// ---------------------------------------------------------------- output

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { bold: paint(1), dim: paint(2), red: paint(31), green: paint(32), yellow: paint(33), blue: paint(34), magenta: paint(35), cyan: paint(36) };
const say = (s = '') => console.log(s);
const title = (s) => say(`\n${c.bold(c.magenta('━━ ' + s + ' ━━'))}`);
const step = (s) => say(`\n${c.cyan('▶')} ${c.bold(s)}`);
const ok = (s) => say(`  ${c.green('✔')} ${s}`);
const warn = (s) => say(`  ${c.yellow('!')} ${s}`);
const bad = (s) => say(`  ${c.red('✖')} ${s}`);
const info = (s) => say(`  ${c.dim(s)}`);
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tail(text, lines = 12) {
  for (const line of stripAnsi(text).split('\n').filter((l) => l.trim()).slice(-lines)) info(`  ${line}`);
}

// ---------------------------------------------------------------- processes

/** Runs a command in the project folder. `show` streams interesting lines as they arrive. */
function sh(cmd, args, { show = null, env = {} } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env } });
    } catch (err) {
      resolve({ code: -1, out: String(err) });
      return;
    }
    const onData = (d) => {
      const text = String(d);
      out += text;
      if (!show) return;
      for (const line of stripAnsi(text).split('\n')) if (show.test(line)) info(line.trim());
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => resolve({ code: -1, out: out + String(err) }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

const servers = new Set();

function startServer(port, extra = []) {
  const child = spawn(WRANGLER, ['dev', '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false', ...extra], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const server = { child, log: '' };
  const onData = (d) => { server.log = (server.log + d).slice(-20000); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  servers.add(server);
  child.on('exit', () => servers.delete(server));
  return server;
}

async function stopServer(server) {
  const { child } = server;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([once(child, 'exit'), sleep(6000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function shutdown(code) {
  await Promise.all([...servers].map(stopServer));
  rmSync(OFFLINE_CONFIG, { force: true });
  process.exit(code);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => shutdown(130));

function openUrl(url) {
  if (process.env.FTW_NO_BROWSER) return;   // automated runs
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

async function copy(text) {
  if (process.platform !== 'darwin') return false;
  const child = spawn('pbcopy');
  child.stdin.end(text);
  const [code] = await once(child, 'close');
  return code === 0;
}

// ---------------------------------------------------------------- web + GitHub helpers

async function get(url, timeoutMs = 10000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store', redirect: 'follow' });
    return { status: res.status, text: await res.text() };
  } catch {
    return { status: 0, text: '' };
  }
}

/** Polls `test` until it returns truthy or time runs out, printing a dot every few seconds. */
async function waitFor(test, timeoutMs, everyMs = 3000) {
  const end = Date.now() + timeoutMs;
  let dots = 0;
  for (;;) {
    const value = await test();
    if (value) {
      if (dots && tty) process.stdout.write('\n');
      return value;
    }
    if (Date.now() > end) break;
    if (tty) process.stdout.write(dots++ ? '.' : '    ');
    await sleep(everyMs);
  }
  if (dots && tty) process.stdout.write('\n');
  return null;
}

/** Runs the GitHub CLI, retrying a few times when the network (not GitHub's answer) was the problem. */
async function gh(args) {
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    r = await sh('gh', args);
    if (r.code === 0 || !/timeout|timed out|connection|EOF|reset by peer|TLS|x509|dial tcp|no such host/i.test(r.out)) break;
    await sleep(2000 * (attempt + 1));
  }
  return r;
}

let ghReady = false;
async function hasGitHub() {
  if (!ghReady) ghReady = (await gh(['auth', 'status'])).code === 0;
  return ghReady;
}

/** true / false, or null when GitHub can't be asked. */
async function pagesEnabled() {
  if (!REPO || !(await hasGitHub())) return null;
  const r = await gh(['api', `repos/${REPO}/pages`, '--jq', '.status']);
  if (r.code === 0) return true;
  return /404|Not Found/i.test(r.out) ? false : null;
}

async function latestPagesRun(sha) {
  const r = await gh(['run', 'list', '--repo', REPO, '--workflow', 'pages.yml', '--limit', '10',
    '--json', 'databaseId,headSha,status,conclusion,createdAt']);
  if (r.code !== 0) return null;
  try {
    const runs = JSON.parse(r.out);
    return (sha ? runs.filter((run) => run.headSha === sha) : runs)[0] ?? null;
  } catch {
    return null;
  }
}

async function gitOut(args) {
  const r = await sh('git', args);
  return r.code === 0 ? r.out.trim() : null;
}

// ---------------------------------------------------------------- setup

async function setup() {
  if (!existsSync(WRANGLER)) {
    step('First run: installing what the game needs (about a minute)…');
    const r = await sh('npm', ['install'], { show: /added|up to date|ERR/i });
    if (r.code !== 0) {
      bad('npm install failed.');
      tail(r.out);
      await pause();
      process.exit(1);
    }
  }
  const remote = await gitOut(['remote', 'get-url', 'origin']);
  const m = remote?.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) {
    REPO = `${m[1]}/${m[2]}`;
    PAGES_URL = `https://${m[1].toLowerCase()}.github.io/${m[2]}/`;
  }
}

// ---------------------------------------------------------------- keyboard

function keypress() {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      process.stdin.once('data', (d) => resolve(String(d).trim()[0]?.toLowerCase() ?? ''));
      process.stdin.once('end', () => resolve(''));
      process.stdin.resume();
    });
  }
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (d) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const key = String(d);
      if (key === '\u0003') shutdown(130);                 // Ctrl+C
      else if (key.startsWith('\u001b[')) resolve('?');    // arrow/function keys: ignore
      else resolve(key[0].toLowerCase());
    });
  });
}

async function pause(message = 'Press any key to continue…') {
  if (!process.stdin.isTTY) return;
  say(`\n${c.dim(message)}`);
  await keypress();
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  say(`\n${c.bold(question)} ${c.dim('(y/n)')}`);
  return (await keypress()) === 'y';
}

// ---------------------------------------------------------------- status

async function status() {
  const [cf, pagesOn, pagesPage, local] = await Promise.all([
    get(`${CLOUDFLARE_URL}/api/health`),
    pagesEnabled(),
    PAGES_URL ? get(PAGES_URL) : { status: 0 },
    get(`${LOCAL_URL}/api/health`, 1500),
  ]);
  return {
    cloudflare: cf.status === 200 ? 'on' : cf.status === 0 ? 'unknown' : 'off',
    pages: pagesOn === false ? 'off' : pagesOn && pagesPage.status === 200 ? 'on' : pagesOn ? 'starting' : 'unknown',
    local: local.status === 200 ? 'on' : 'off',
  };
}

function statusLine(label, state, url) {
  const badge = {
    on: c.green('● ONLINE '),
    off: c.red('○ OFFLINE'),
    starting: c.yellow('◐ STARTING'),
    unknown: c.yellow('? UNKNOWN'),
  }[state];
  say(`  ${label.padEnd(26)} ${badge}  ${state === 'off' ? '' : c.dim(url ?? '')}`);
}

// ---------------------------------------------------------------- actions

async function play({ fromMenu = false } = {}) {
  title('Play on this computer');
  if ((await get(`${LOCAL_URL}/api/health`, 1500)).status === 200) {
    ok(`The game is already running at ${c.bold(LOCAL_URL)} — opening it.`);
    openUrl(LOCAL_URL);
    return;
  }
  step('Starting the game…');
  const server = startServer(8787);
  const up = await waitFor(async () => server.child.exitCode !== null
    || (await get(`${LOCAL_URL}/api/health`, 1500)).status === 200, 90000, 1000);
  if (!up || server.child.exitCode !== null) {
    bad("The game didn't start. Here's what it said:");
    tail(server.log);
    await stopServer(server);
    return;
  }
  ok(`The game is running at ${c.bold(LOCAL_URL)}`);
  openUrl(LOCAL_URL);
  info('Opened it in your browser. Open more tabs or windows to add more players.');
  info('This copy only works on this computer. To play with friends, put the game online instead.');
  if (!process.stdin.isTTY) {
    await new Promise(() => {});   // no keyboard: run until the process is stopped
  }
  say(`\n${c.bold(fromMenu ? 'Press any key to stop the game and go back to the menu.' : 'Press any key to stop the game')} ${c.dim('(or just close this window)')}`);
  await keypress();
  step('Stopping the game…');
  await stopServer(server);
  ok('Stopped.');
}

async function goOnline() {
  title('Put the game online');

  step('Checking the game (running the tests)…');
  const tests = await sh('npm', ['test']);
  if (tests.code !== 0) {
    bad('Some tests failed, so nothing was uploaded. The online game is unchanged.');
    tail(tests.out, 20);
    return false;
  }
  ok(`All ${tests.out.match(/pass (\d+)/)?.[1] ?? ''} tests passed`);

  step('Uploading to Cloudflare…');
  const deploy = await sh(WRANGLER, ['deploy'], { show: /Uploaded \d+ of|Deployed|No updated asset|✘|ERROR/i });
  if (deploy.code !== 0) {
    bad('Uploading to Cloudflare failed.');
    if (/login|auth|token/i.test(deploy.out)) info('You may need to sign in again: run "npx wrangler login" once.');
    tail(deploy.out);
    return false;
  }
  ok('Cloudflare has the latest version');

  let pagesOn = await pagesEnabled();
  let pagesTurnedOn = false;
  if (pagesOn === null) {
    warn("Couldn't reach GitHub, so GitHub Pages was skipped (is the GitHub CLI signed in? run \"gh auth login\").");
  } else {
    step('Turning on GitHub Pages…');
    if (pagesOn) {
      ok('GitHub Pages is on');
    } else {
      const r = await gh(['api', '-X', 'POST', `repos/${REPO}/pages`, '-f', 'build_type=workflow']);
      pagesOn = r.code === 0;
      pagesTurnedOn = pagesOn;
      if (pagesOn) ok('GitHub Pages turned on');
      else { bad("Couldn't turn on GitHub Pages."); tail(r.out); }
    }
  }

  step('Saving your changes to GitHub…');
  const pushed = await saveToGitHub();

  // A push starts a Pages build by itself; otherwise start one when Pages was off or never built this commit.
  const head = await gitOut(['rev-parse', 'HEAD']);
  if (pagesOn && !pushed) {
    const run = await latestPagesRun(head);
    if (pagesTurnedOn || !run || run.conclusion === 'failure') {
      const r = await gh(['workflow', 'run', 'pages.yml', '--repo', REPO, '--ref', 'main']);
      if (r.code === 0) info('Started a GitHub Pages build');
      else warn("Couldn't start the GitHub Pages build.");
    }
  }

  step('Waiting for everything to come online…');
  const cfUp = await waitFor(async () => (await get(`${CLOUDFLARE_URL}/api/health`)).status === 200, 90000);
  if (cfUp) ok(`Cloudflare: ${c.bold(CLOUDFLARE_URL)}`);
  else bad('The Cloudflare site did not come online in time. Try "Check that everything works" in a minute.');

  if (pagesOn) {
    info('GitHub Pages is building (this usually takes about a minute)');
    const run = await waitFor(async () => {
      const r = await latestPagesRun(head);
      return r?.status === 'completed' ? r : null;
    }, 300000, 5000);
    if (run?.conclusion !== 'success') {
      bad(`The GitHub Pages build ${run ? `ended with "${run.conclusion}"` : 'is taking longer than usual'}. See https://github.com/${REPO}/actions`);
    } else {
      const page = await waitFor(async () => (await get(PAGES_URL)).status === 200, 120000);
      if (page) ok(`GitHub Pages: ${c.bold(PAGES_URL)}`);
      else warn('GitHub Pages built fine but is still switching on. It should appear within a few minutes.');
    }
  }

  if (cfUp) {
    say(`\n${c.green(c.bold('🎉 The game is online!'))} Send friends this link: ${c.bold(CLOUDFLARE_URL)}`);
    if (await copy(CLOUDFLARE_URL)) info('(The link is copied — paste it into a message.)');
  }
  return !!cfUp;
}

/** Commits every change and pushes. Returns true when something new reached GitHub. */
async function saveToGitHub() {
  const changes = (await gitOut(['status', '--porcelain']))?.split('\n').filter(Boolean) ?? [];
  if (changes.length) {
    info(`${changes.length} changed file${changes.length === 1 ? '' : 's'}:`);
    for (const line of changes.slice(0, 8)) info(`  ${line.slice(3)}`);
    if (changes.length > 8) info(`  …and ${changes.length - 8} more`);
    await sh('git', ['add', '-A']);
    const commit = await sh('git', ['commit', '-m', `Update game (${new Date().toLocaleString()})`]);
    if (commit.code !== 0) {
      bad('Saving (git commit) failed:');
      tail(commit.out);
      return false;
    }
  }
  const ahead = Number(await gitOut(['rev-list', '--count', '@{u}..HEAD']) ?? 0);
  if (!ahead) {
    ok('Nothing new to save — GitHub already has everything');
    return false;
  }
  let push;
  for (let attempt = 0; attempt < 3; attempt++) {   // retry flaky connections
    push = await sh('git', ['push']);
    if (push.code === 0) break;
    await sleep(3000);
  }
  if (push.code !== 0) {
    bad('Uploading to GitHub (git push) failed:');
    tail(push.out);
    return false;
  }
  ok(`Saved to GitHub (${ahead} update${ahead === 1 ? '' : 's'})`);
  return true;
}

async function goOffline({ yes = false } = {}) {
  title('Take the game offline');
  if (!yes && !(await confirm("Players won't be able to open the game until you put it back online. Take it offline?"))) {
    info('Cancelled — nothing changed.');
    return;
  }

  step('Turning off the Cloudflare site…');
  // Switches off the public workers.dev address without deleting anything; "online" turns it back on.
  const config = readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8').replace(/^(name = .*)$/m, '$1\nworkers_dev = false');
  writeFileSync(OFFLINE_CONFIG, config);
  const r = await sh(WRANGLER, ['triggers', 'deploy', '-c', OFFLINE_CONFIG]);
  rmSync(OFFLINE_CONFIG, { force: true });
  if (r.code !== 0) {
    bad("Couldn't turn off the Cloudflare site.");
    tail(r.out);
  } else {
    const gone = await waitFor(async () => (await get(`${CLOUDFLARE_URL}/api/health`)).status !== 200, 90000);
    if (gone) ok('The Cloudflare site is offline');
    else warn('Cloudflare switched it off, but it can take a minute to disappear everywhere.');
  }

  step('Turning off GitHub Pages…');
  const pagesOn = await pagesEnabled();
  if (pagesOn === null) {
    warn("Couldn't reach GitHub (is the GitHub CLI signed in?), so GitHub Pages was left as it is.");
  } else if (!pagesOn) {
    ok('GitHub Pages was already off');
  } else {
    const del = await gh(['api', '-X', 'DELETE', `repos/${REPO}/pages`]);
    if (del.code !== 0) {
      bad("Couldn't turn off GitHub Pages.");
      tail(del.out);
    } else {
      const gone = await waitFor(async () => (await get(PAGES_URL)).status === 404, 90000, 5000);
      if (gone) ok('GitHub Pages is offline');
      else warn('GitHub Pages is switched off; the old page can take a few minutes to disappear.');
    }
  }
  say(`\n${c.bold('The game is offline.')} Double-click ${c.bold('"Put Game Online"')} whenever you want it back.`);
}

async function check() {
  title('Check that everything works');
  const tally = { pass: 0, warn: 0, fail: 0 };
  const pass = (s) => { tally.pass++; ok(s); };
  const soft = (s) => { tally.warn++; warn(s); };
  const fail = (s) => { tally.fail++; bad(s); };

  step('The game code');
  const tests = await sh('npm', ['test']);
  if (tests.code === 0) pass(`All ${tests.out.match(/pass (\d+)/)?.[1] ?? ''} tests pass`);
  else { fail('Some tests fail:'); tail(tests.out, 15); }

  step('Playing on this computer');
  const server = startServer(CHECK_PORT, ['--inspector-port', String(CHECK_PORT + 1), '--persist-to', '.wrangler/state-check']);
  const localUp = await waitFor(async () => server.child.exitCode !== null
    || (await get(`http://127.0.0.1:${CHECK_PORT}/api/health`, 1500)).status === 200, 90000, 1000);
  if (localUp && server.child.exitCode === null) {
    const smoke = await sh('node', ['scripts/smoke.mjs'], { env: { SMOKE_URL: `ws://127.0.0.1:${CHECK_PORT}` } });
    if (/SMOKE OK/.test(smoke.out)) pass('A full test game (2 players + a bot) works locally');
    else { fail('The local test game failed:'); tail(smoke.out); }
  } else {
    fail("The local game server didn't start:");
    tail(server.log);
  }
  await stopServer(server);

  step(`Online game (Cloudflare) — ${CLOUDFLARE_URL}`);
  const health = await get(`${CLOUDFLARE_URL}/api/health`);
  if (health.status === 200) {
    const home = await get(CLOUDFLARE_URL);
    if (home.status === 200 && /Finish The Word/.test(home.text)) pass('The website loads');
    else fail(`The website returned an error (HTTP ${home.status})`);
    const smoke = await sh('node', ['scripts/smoke.mjs'], { env: { SMOKE_URL: `wss://${GAME_SERVER}` } });
    if (/SMOKE OK/.test(smoke.out)) pass('A full online test game (2 players + a bot) works');
    else { fail('The online test game failed:'); tail(smoke.out); }
    await compareFiles(`${CLOUDFLARE_URL}/`, 'Cloudflare', pass, soft);
  } else if (health.status === 0) {
    fail("Couldn't reach Cloudflare (is the internet working?)");
  } else {
    soft('The online game is OFFLINE (turned off). Use "Put Game Online" to turn it on.');
  }

  step(`GitHub Pages — ${PAGES_URL ?? '(no GitHub repo)'}`);
  const pagesOn = await pagesEnabled();
  if (pagesOn === null) {
    soft("Couldn't ask GitHub (is the GitHub CLI signed in?)");
  } else if (!pagesOn) {
    soft('GitHub Pages is OFFLINE (turned off). Use "Put Game Online" to turn it on.');
  } else {
    const run = await latestPagesRun();
    if (run?.conclusion === 'success') pass('The latest GitHub Pages build succeeded');
    else if (run?.status !== 'completed') soft('A GitHub Pages build is still running');
    else fail(`The latest GitHub Pages build failed — see https://github.com/${REPO}/actions`);
    const page = await get(PAGES_URL);
    if (page.status === 200 && /Finish The Word/.test(page.text)) pass('The website loads');
    else soft(`The website isn't showing yet (HTTP ${page.status}); it can take a few minutes after turning on`);
    if (page.status === 200) await compareFiles(PAGES_URL, 'GitHub Pages', pass, soft);
  }

  step('Saved to GitHub');
  const changes = (await gitOut(['status', '--porcelain']))?.split('\n').filter(Boolean).length ?? 0;
  const ahead = Number(await gitOut(['rev-list', '--count', '@{u}..HEAD']) ?? 0);
  if (!changes && !ahead) pass('Everything is saved to GitHub');
  else soft(`${changes + ahead} change${changes + ahead === 1 ? ' is' : 's are'} not on GitHub yet ("Put Game Online" saves them)`);

  const color = tally.fail ? c.red : tally.warn ? c.yellow : c.green;
  say(`\n${color(c.bold(tally.fail ? '✖ Something is broken.' : tally.warn ? '✔ Everything works (with notes above).' : '✔ Everything works!'))} `
    + c.dim(`${tally.pass} passed, ${tally.warn} note${tally.warn === 1 ? '' : 's'}, ${tally.fail} failed`));
  return tally.fail === 0;
}

/** Warns when a site serves different game files than this folder has (i.e. it needs an update). */
async function compareFiles(baseUrl, label, pass, soft) {
  const stale = [];
  for (const file of SYNC_FILES) {
    const remote = await get(`${baseUrl}${file}?nocache=${Date.now()}`);
    const local = readFileSync(path.join(ROOT, 'public', file), 'utf8');
    if (remote.status !== 200 || remote.text !== local) stale.push(file);
  }
  if (!stale.length) pass(`${label} is running your latest version`);
  else soft(`${label} is running an older version than this folder ("Put Game Online" updates it)`);
}

// ---------------------------------------------------------------- menu

async function menu() {
  for (;;) {
    if (tty) console.clear();
    say(c.bold(`${c.red('F')}${c.yellow('I')}${c.green('N')}${c.blue('I')}${c.magenta('S')}${c.cyan('H')} THE ${c.green('WORD!')}`) + c.dim('   game launcher'));
    say(c.dim('Checking what is running…'));
    const s = await status();
    if (tty) process.stdout.write('\x1b[1A\x1b[2K');
    say('');
    statusLine('Online game (Cloudflare)', s.cloudflare, CLOUDFLARE_URL);
    statusLine('GitHub Pages copy', s.pages, PAGES_URL);
    statusLine('On this computer', s.local, LOCAL_URL);
    say(`
  ${c.bold('1')}  Play on this computer
  ${c.bold('2')}  Put the game online ${c.dim('(or update it with your changes)')}
  ${c.bold('3')}  Take the game offline
  ${c.bold('4')}  Check that everything works
  ${c.bold('5')}  Open the online game ${c.dim('(and copy the invite link)')}
  ${c.bold('Q')}  Quit
`);
    const key = await keypress();
    if (key === '1') await play({ fromMenu: true });
    else if (key === '2') await goOnline();
    else if (key === '3') await goOffline();
    else if (key === '4') await check();
    else if (key === '5') {
      openUrl(CLOUDFLARE_URL);
      await copy(CLOUDFLARE_URL);
      continue;
    } else if (key === 'q' || key === '\u001b' || key === '') break;
    else continue;
    await pause('Press any key to go back to the menu…');
  }
}

// ---------------------------------------------------------------- main

await setup();
const [command = 'menu', ...flags] = process.argv.slice(2);
const actions = {
  menu,
  play: () => play(),
  online: goOnline,
  offline: () => goOffline({ yes: flags.includes('--yes') }),
  check,
};
if (!actions[command]) {
  bad(`Unknown command "${command}". Use one of: ${Object.keys(actions).join(', ')}`);
  process.exit(1);
}
const result = await actions[command]();
if (command !== 'menu') await pause('Press any key to close…');
await shutdown(result === false ? 1 : 0);
