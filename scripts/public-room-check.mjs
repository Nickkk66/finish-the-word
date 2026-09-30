import assert from 'node:assert/strict';
import { browser } from './browser.mjs';

const b = await browser();
try {
  const a = await b.page('public-a'), c = await b.page('public-b');
  for (const page of [a, c]) {
    await page.nav('http://127.0.0.1:8787/?debug=1');
    await page.wait('window.__ftw?.world');
    await page.clickText('Play Public');
    await page.wait('window.__ftw.state.inRoom');
    assert.equal((await page.state()).code, 'PUBLIC');
    assert.equal((await page.state()).public, true);
  }
  await a.wait('window.__ftw.state.players.size===2');
  await a.send({ t: 'host', action: 'settings', settings: { public: false } });
  await a.wait('window.__ftw.state.settings.public===true');
  assert.equal(await (await fetch('http://127.0.0.1:8787/api/quickplay')).json().then(v => v.code), 'PUBLIC');
  assert.deepEqual([...a.errors, ...c.errors], []);
  console.log('PASS Play Public joins one permanent visible room');
} finally { await b.close(); }
