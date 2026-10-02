import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudProfile } from '../src/accounts.js';

const storage = new Map();
globalThis.localStorage = { getItem:k => storage.get(k) || null, setItem:(k,v) => storage.set(k,v) };
globalThis.window = { addEventListener() {} };
const { profile, replaceProfile, recordFreePlayTime, freeReadyIn, claimFree, FREE_COOLDOWN_MS } = await import('../public/js/profile.js');

test('free reward accumulates separate in-game sessions, never elapsed offline time', () => {
  replaceProfile({id:'rewardtester',coins:10,lastFreeClaim:1});
  assert.equal(freeReadyIn(),900000);
  assert.equal(claimFree(Date.now()+86400000),false);
  recordFreePlayTime(300000);
  assert.equal(freeReadyIn(),600000);
  const saved=JSON.parse(storage.get('ftw_profile_v1'));
  replaceProfile(saved);
  assert.equal(freeReadyIn(Date.now()+86400000),600000);
  recordFreePlayTime(600000);
  assert.equal(freeReadyIn(),0);
  assert.equal(claimFree(),true);
  assert.equal(profile.coins,110);
  assert.equal(claimFree(),false);
  assert.equal(freeReadyIn(),FREE_COOLDOWN_MS);
});

test('playtime progress and selected player-list style survive cloud normalization',()=>{
  const result=cloudProfile({id:'rewardtester',freePlayMs:300000,settings:{playerListStyle:'portrait'}});
  assert.equal(result.freePlayMs,300000);
  assert.equal(result.settings.playerListStyle,'portrait');
  assert.equal(cloudProfile({freePlayMs:9999999}).freePlayMs,900000);
  assert.equal(cloudProfile({freePlayMs:-1}).freePlayMs,0);
  assert.equal(cloudProfile({settings:{playerListStyle:'unknown'}}).settings.playerListStyle,'classic');
});
