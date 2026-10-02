import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from './helpers.js';
import {TIDE_BANK,validateTideAnswer} from '../src/tide-bank.js';
import {TIDE, tideWaterProgress, tideSubmerged} from '../public/js/shared/word-tide.js';
function setup(){const r=createRoom();const a=r.join('alice'),b=r.join('bob');r.send(a,{t:'host',action:'settings',settings:{mode:'word_tide'}});return {r,a,b};}
function answer(r,c,word,id='one'){r.send(c,{t:'tideAnswer',matchId:r.engine.match.matchId,round:r.engine.match.round,requestId:id,answer:word});}
test('bank has 60 original categories and normalized forms cannot inflate points',()=>{
 assert.equal(TIDE_BANK.length,60);assert.equal(new Set(TIDE_BANK.map(c=>c.id)).size,60);
 for(const c of TIDE_BANK){assert.ok(c.answers.length>=10,c.id);for(const word of c.answers)assert.ok(validateTideAnswer(c.id,word),word);}
 assert.equal(validateTideAnswer('mammal',' HIPPO ').length,5);
 assert.equal(validateTideAnswer('mammal','hippopotamus').length,12);
 assert.equal(validateTideAnswer('ocean','great-white shark').length,15);
 assert.equal(validateTideAnswer('fruit','extremely gigantic watermelon'),null);
 assert.equal(validateTideAnswer('fruit','apple!'),null);
 for (const [plural, singular] of [['DOGS','dog'], ['cats','cat'], ['guinea pigs','guinea pig'], ['mice','mouse'], ['canaries','canary']])
  assert.equal(validateTideAnswer('pet',plural).length,plural.replace(/[^a-z]/gi,'').length);
 assert.equal(validateTideAnswer('pet','hot dogs'),null);
 assert.deepEqual(validateTideAnswer('footwear','shoes'),{word:'shoes',letters:'SHOES',length:5});
});
test('private replaceable answers, reconnect and replay build only once at deadline',()=>{
 const {r,a,b}=setup();assert.equal(r.engine.match.phase,'tideIntro');r.clock.advance(TIDE.intro);
 const m=r.engine.match,c=m.tide.category,word=c.answers[0],replacement=c.answers.at(-1);
 answer(r,a,word);assert.equal(a.last('tideAnswerResult').locked.word,word);
 assert.equal(b.all('tideAnswerResult').length,0);assert.equal(m.tide.towers.alice.height,2);
 assert.ok(!JSON.stringify(r.engine.matchView()).includes('answers'));assert.equal(r.engine.matchView().tide.towers.alice.answer,'');
 answer(r,a,replacement,'two');answer(r,a,'not a valid answer','three');assert.equal(a.last('tideAnswerResult').locked.word,replacement);
 const again=r.join('alice');assert.equal(again.last('welcome').tidePrivate.locked.word,replacement);
 answer(r,again,word,'two');assert.equal(m.tide.answers.get('alice').word,replacement);
 answer(r,b,replacement);r.clock.advance(TIDE.answer);assert.equal(m.phase,'tideReveal');
 const length=validateTideAnswer(c.id,replacement).length;
 assert.equal(m.tide.towers.alice.height,2+length);assert.equal(m.tide.towers.bob.height,2+length);
 answer(r,again,word,'late');assert.equal(m.tide.towers.alice.height,2+length);
 assert.equal(m.tide.water,0);r.clock.advance(TIDE.reveal);assert.equal(m.phase,'tideFlood');
 assert.deepEqual(r.errors,[]);
});
test('flood removes one heart after reveal and rescues without granting earned letters',()=>{
 const {r}=setup();r.clock.advance(TIDE.intro+TIDE.answer+TIDE.reveal);
 const m=r.engine.match;assert.equal(m.participants[0].hearts,5);
 assert.ok(Object.values(m.tide.towers).every(t=>!t.wreck));
 r.clock.advance(TIDE.flood);assert.equal(m.phase,'tideResolve');
 for(const p of m.participants){assert.equal(p.hearts,4);assert.equal(m.tide.towers[p.id].height,m.tide.water+2);assert.equal(m.tide.towers[p.id].earned,0);}
 r.clock.advance(TIDE.resolve);assert.equal(m.round,2);assert.equal(m.participants[0].hearts,4);assert.deepEqual(r.errors,[]);
});
test('simultaneous drowning shares exact tie, settlements replay without another award',()=>{
 const {r,a,b}=setup();r.clock.advance(TIDE.intro+5*(TIDE.answer+TIDE.reveal+TIDE.flood+TIDE.resolve));
 assert.equal(r.engine.match.phase,'ended');assert.deepEqual(r.engine.match.tide.winners,['alice','bob']);
 assert.equal(a.last('tideReward').coins,105);assert.equal(b.last('tideReward').won,true);
 r.engine.endTide(['alice']);assert.equal(a.all('tideReward').length,1);
 const again=r.join('alice');assert.equal(again.last('tideReward').matchId,a.last('tideReward').matchId);assert.deepEqual(r.errors,[]);
});
test('round cap, fair ties, no paid tools, and cancellation restore lobby safely',()=>{
 const {r,a}=setup();r.clock.advance(TIDE.intro);const m=r.engine.match;
 r.send(a,{t:'queueCard',requestId:'card',matchId:m.matchId,cardId:'heartbreaker',targetId:'bob'});assert.equal(a.last('cardQueueResult').ok,false);
 m.round=12;for(const tower of Object.values(m.tide.towers)){tower.height=300;tower.earned=100;}
 r.clock.advance(TIDE.answer+TIDE.reveal+TIDE.flood+TIDE.resolve);assert.equal(m.phase,'ended');assert.equal(m.tide.winners.length,2);
 r.clock.advance(TIDE.outro);assert.ok(['countdown','lobby'].includes(r.engine.match.phase));
 r.send(a,{t:'host',action:'start'});r.send(a,{t:'host',action:'endMatch'});assert.equal(r.engine.match.phase,'ended');assert.equal(r.engine.match.cancelled,true);r.clock.advance(TIDE.outro);assert.ok(['countdown','lobby'].includes(r.engine.match.phase));assert.deepEqual(r.errors,[]);
});
test('forfeit during intro settles once, mode changes wait, disconnect retains answer until grace',()=>{
 const {r,a,b}=setup();r.send(a,{t:'host',action:'settings',settings:{mode:'classic'}});assert.equal(r.engine.match.mode,'word_tide');
 r.send(b,{t:'stand'});assert.equal(r.engine.match.phase,'ended');assert.deepEqual(r.engine.match.tide.winners,['alice']);r.clock.advance(TIDE.outro);assert.equal(r.engine.settings.mode,'classic');assert.deepEqual(r.errors,[]);
 const x=setup();x.r.clock.advance(TIDE.intro);answer(x.r,x.a,x.r.engine.match.tide.category.answers[0]);x.r.engine.disconnect(x.a);x.r.clock.advance(1000);assert.ok(x.r.engine.match.tide.answers.get('alice'));x.r.join('alice');x.r.clock.advance(20000);assert.ok(x.r.engine.players.has('alice'));assert.deepEqual(x.r.errors,[]);
});
test('twelve answered rounds cap rewards, exclude spectators and accept at most one answer per round',()=>{
 const {r,a,b}=setup();const viewer=r.join('viewer');r.clock.advance(TIDE.intro);
 for(let round=1;round<=12;round++){
  const m=r.engine.match;assert.equal(m.phase,'tideAnswer');
  const word=[...m.tide.category.answers].sort((a,b)=>b.replace(/[^a-z]/g,'').length-a.replace(/[^a-z]/g,'').length)[0];
  answer(r,a,word,`a${round}`);answer(r,b,word,`b${round}`);answer(r,viewer,word,`v${round}`);
  assert.equal(viewer.last('tideAnswerResult').ok,false);
  r.clock.advance(TIDE.answer+TIDE.reveal+TIDE.flood+TIDE.resolve);
 }
 assert.equal(r.engine.match.phase,'ended');assert.equal(a.last('tideReward').words,12);
 assert.equal(a.last('tideReward').coins,225);assert.equal(b.last('tideReward').coins,225);
 assert.equal(viewer.all('tideReward').length,0);assert.deepEqual(r.errors,[]);
});

test('selecting Word Tide starts immediately with everyone in the room and independent platforms',()=>{
 const r=createRoom(); const owner=r.join('owner');
 for(let i=0;i<12;i++)r.join(`guest${i}`);
 r.send(owner,{t:'host',action:'settings',settings:{mode:'word_tide'}});
 const m=r.engine.match;assert.equal(m.phase,'tideIntro');assert.equal(m.participants.length,13);
 assert.equal(new Set(Object.values(m.tide.towers).map(t=>t.seat)).size,13);
 assert.equal(r.engine.players.get('owner').seat,-1);
 assert.deepEqual(r.errors,[]);
});
test('solo Word Tide begins as practice and lasts beyond the first successful round',()=>{
 const r=createRoom(),a=r.join('alice');r.send(a,{t:'host',action:'settings',settings:{mode:'word_tide'}});
 assert.equal(r.engine.match.phase,'tideIntro');assert.equal(r.engine.match.practice,true);
 r.clock.advance(TIDE.intro);answer(r,a,r.engine.match.tide.category.answers.at(-1));
 r.clock.advance(TIDE.answer+TIDE.reveal+TIDE.flood+TIDE.resolve);
 assert.equal(r.engine.match.round,2);assert.equal(r.engine.match.phase,'tideAnswer');
});
test('common abbreviations, spelling variants and newly requested answers are recognized fairly',()=>{
 for(const [cat,words] of Object.entries({dinosaur:['t rex','t-rex','trex','T. Rex'],clothing:['rain coat','weather jacket'],headwear:['head dress','vail','veil'],technology:['phone','cell tower','iphone'],color:['velvet','burgundy','cerulean']}))
  for(const word of words)assert.ok(validateTideAnswer(cat,word),`${cat}: ${word}`);
 assert.equal(validateTideAnswer('dinosaur','t-rex').length,4);
 assert.equal(validateTideAnswer('headwear','vail').length,4);
 assert.equal(validateTideAnswer('color','very very dark blue'),null);
});

test('switching an active word game into Word Tide refunds it and starts the room event',()=>{
 const r=createRoom(),a=r.join('alice'),b=r.join('bob');
 r.send(a,{t:'sit',seat:0});r.send(b,{t:'sit',seat:1});r.send(a,{t:'host',action:'start'});
 const old=r.engine.match.matchId;r.send(a,{t:'host',action:'settings',settings:{mode:'word_tide'}});
 assert.equal(r.engine.match.phase,'tideIntro');assert.notEqual(r.engine.match.matchId,old);
 assert.equal(a.last('matchRefund').matchId,old);assert.equal(b.last('matchRefund').matchId,old);
 assert.deepEqual(r.errors,[]);
});

test('only zero hearts wreck a chair; flood waits for the loss, reconnect and finale never replay it',()=>{
 const {r,a,b}=setup();r.clock.advance(TIDE.intro);
 const m=r.engine.match;m.participants.find(p=>p.id==='bob').hearts=1;
 r.clock.advance(TIDE.answer+TIDE.reveal);
 const w=m.tide.towers.bob.wreck;
 assert.equal(m.phase,'tideFlood');assert.equal(m.participants.find(p=>p.id==='bob').alive,false);
 assert.equal(w.rescue,false);assert.equal(w.water,0);assert.equal(m.tide.holdMs,26000);
 assert.equal(m.tide.towers.alice.wreck,undefined);
 assert.equal(r.engine.matchView().tide.towers.bob.wreck.ageMs,0);
 r.clock.advance(3400);const reconnect=r.join('bob');
 assert.equal(reconnect.last('welcome').match.tide.towers.bob.wreck.ageMs,3400);
 r.clock.advance(22600+TIDE.flood+TIDE.resolve);
 assert.equal(m.phase,'ended');assert.deepEqual(m.tide.winners,['alice']);
 assert.equal(m.tide.towers.bob.wreck,w);assert.equal(m.tide.towers.alice.wreck,undefined);
 assert.equal(m.tide.endingHoldMs,0);
 r.clock.advance(TIDE.outro);assert.ok(['lobby','countdown'].includes(r.engine.match.phase));assert.deepEqual(r.errors,[]);
});

test('ending during an elimination preserves the current waterline and existing animation',()=>{
 const {r,a}=setup();r.clock.advance(TIDE.intro);
 r.engine.match.participants.find(p=>p.id==='bob').hearts=1;
 r.clock.advance(TIDE.answer+TIDE.reveal+3000);
 const m=r.engine.match,w=m.tide.towers.bob.wreck;
 r.send(a,{t:'host',action:'endMatch'});
 assert.equal(m.cancelled,true);assert.equal(m.tide.towers.bob.wreck,w);
 assert.equal(m.tide.towers.alice.wreck,undefined);assert.equal(m.tide.endingHoldMs,23000);assert.equal(m.tide.endingWater,0);
 r.clock.advance(23000+TIDE.outro);assert.ok(['lobby','countdown'].includes(r.engine.match.phase));
});

test('Word Tide answer purchases validate alive round, balance, replay and cancellation refunds',()=>{
 const {r,a,b}=setup();r.clock.advance(TIDE.intro);const m=r.engine.match;
 r.send(a,{t:'hint',turnId:m.turnId,requestId:'poor',balance:0});assert.equal(a.last('hint').ok,false);
 r.send(a,{t:'hint',turnId:m.turnId,requestId:'paid',balance:1000});const receipt=a.last('hint');
 assert.equal(receipt.ok,true);assert.ok(validateTideAnswer(m.tide.category.id,receipt.word));assert.equal(receipt.cost,TIDE.hintPrice);
 assert.equal(b.all('hint').length,0);r.send(a,{t:'hint',turnId:m.turnId,requestId:'paid',balance:1000});assert.deepEqual(a.last('hint'),receipt);
 r.send(a,{t:'hint',turnId:m.turnId,requestId:'again',balance:1000});assert.equal(a.last('hint').reason,'already_bought');
 answer(r,a,receipt.word);assert.equal(a.last('tideAnswerResult').ok,true);
 r.send(a,{t:'host',action:'endMatch'});assert.equal(a.last('matchRefund').coins,TIDE.hintPrice);
});

test('visual water remains still for the elimination then rises smoothly over three seconds',()=>{
 const m={phase:'tideFlood',tide:{holdMs:18000}};
 for(const sec of [0,2,8,17.9,18])assert.equal(tideWaterProgress(m,sec),0);
 assert.equal(tideWaterProgress(m,19.5),.5);assert.equal(tideWaterProgress(m,21),1);
});

test('one shared waterline only hits avatars whose heads would be submerged',()=>{
 assert.equal(tideSubmerged(5,7),false);assert.equal(tideSubmerged(5,7.5),false);assert.equal(tideSubmerged(5,8),true);
 const {r}=setup();r.clock.advance(TIDE.intro);const m=r.engine.match;
 m.tide.rise=7;m.tide.towers.alice.height=5;m.tide.towers.bob.height=2;
 r.clock.advance(TIDE.answer+TIDE.reveal);assert.equal(m.tide.towers.alice.hitPending,false);assert.equal(m.tide.towers.bob.hitPending,true);
 r.clock.advance(TIDE.flood);assert.equal(m.participants.find(p=>p.id==='alice').hearts,5);assert.equal(m.participants.find(p=>p.id==='bob').hearts,4);
});


test('giving up before or during a wave holds that waterline until the shark sequence finishes',()=>{
 for(const midWave of [false,true]){
  const r=createRoom(),a=r.join('alice'),b=r.join('bob'),c=r.join('charlie');
  r.send(a,{t:'host',action:'settings',settings:{mode:'word_tide'}});
  r.clock.advance(TIDE.intro+(midWave?TIDE.answer+TIDE.reveal+1500:TIDE.answer-1000));
  const m=r.engine.match,previous=m.tide.water;
  r.send(c,{t:'stand'});const wreck=m.tide.towers.charlie.wreck;
  assert.equal(m.participants.find(p=>p.id==='charlie').alive,false);
  if(midWave){assert.equal(wreck.water,previous/2);assert.equal(m.tide.fromWater,previous/2);assert.equal(m.tide.holdMs,26000);}
  else {r.clock.advance(1000+TIDE.reveal);assert.equal(wreck.water,0);assert.equal(m.tide.holdMs,21000);}
  const hold=m.tide.holdMs;r.clock.advance(hold-1);assert.equal(m.phase,'tideFlood');
  assert.equal(tideWaterProgress(r.engine.matchView(),(m.duration-(m.endsAt-r.engine.now()))/1000),0);
  assert.equal(m.tide.towers.charlie.wreck,wreck);assert.deepEqual(r.errors,[]);
 }
});
