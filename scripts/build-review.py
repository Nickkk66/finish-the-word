"""Build one self-contained review page from the user's feedback and rendered game assets."""
import json
from pathlib import Path
s=Path('docs/review-template.html').read_text()
decoder=json.JSONDecoder()
data,_=decoder.raw_decode(s[s.index('const data=')+11:])
feedback=json.loads(Path('docs/review-feedback.json').read_text())
visuals=json.loads(Path('docs/review-visuals.json').read_text())
patches={
'bunny':'Classic: +1 second on your turns. The Last Sip: +1 second to decide. Word Tide: 10% heart protection.',
'froggy':'Classic: +1 allowed mistake per turn. Keep 10% poison resistance and 15% Tide guard.',
'piggy':'Classic: +3 seconds on your own turns, replacing next-player sabotage. Keep 5% winner bonus within the house payout cap and 5% Tide guard.',
'foxy':'Classic: the next player loses 1 second, replacing your +3-second bonus. The Last Sip: 15% poison resistance. Word Tide: 10% heart protection.',
'owl':'Classic: +3 seconds on your turns. The Last Sip: +3 seconds to decide. Word Tide: 25% heart protection.',
'unicorn':'Automatically block the first lethal poison once per match in The Last Sip. No consent popup; the spent shield stays spent through re-equipping and reconnecting. Keep one automatic heart shield in Classic/Tide. Rare label, but scarce crate odds (suggested 3%) so it remains hard to obtain.',
'robot':'Classic: proposed +4 seconds on your turn. The Last Sip: replace decision time with a percentage benefit — suggested 30% poison resistance. Word Tide: proposed 20% protection. The 30% value is a draft for your approval.',
}
for item in data['pets']:
 key=item['id'].replace('pet-','')
 if key in patches:item['proposal']=patches[key]
 if key=='frostbite':item.update(name='Frostbite · Ice Penguin',icon='🐧',proposal='A blue-white penguin. Classic: cancel the first Blaze trigger each match. The Last Sip: one automatic antidote against lethal poison. Tide: 15% guard. Consumed counters stay visible.')
 if key=='badger':item.update(name='Ironhide · Rhino',icon='🦏',proposal='Replace the badger/Bulwark with a recognizable rhino. Classic: reduce timer penalties from Grizzly and Time Tax by 1 second; not Blaze. The Last Sip: +1 pass. Tide: 10% guard.')
keep={'card-skip','card-time_tax','card-pressure','card-heart','card-slow_burn','card-lifeline'}
data['cards']=[item for item in data['cards'] if item['id'] in keep]
for item in data['cards']:
 if item['id']=='card-pressure':item['proposal']='The target gets 2 fewer allowed mistakes on every remaining turn of this match (minimum 1). Lasts through all their turns; ends with the match.'
 if item['id']=='card-heart':item['proposal']='Royal-only. 50% chance to remove one heart from the chosen player; a pet shield can block a successful hit. The 5% crate odds are separate from the 50% hit chance.'
 if item['id']=='card-slow_burn':item['proposal']='Remove 1 second on each of the target’s next two turns. Copies stack their time penalty. Keep a 6-second turn floor so stacked copies cannot create impossible turns.'
 if item['id']=='card-lifeline':item['proposal']='50% chance to restore one heart, up to the target’s starting maximum. Cannot revive eliminated players. Royal crate.'
data['cards'] += [
 {'id':'card-arcane_ward','name':'Spellbreak · name proposal','icon':'✦','rarity':'Legendary','status':'Legendary card · proposed','old':'Not in the live game. Replaces the rejected Safety Net / Anchor designs.','proposal':'Choose yourself or anyone alive and arm an automatic ward. Arming reserves one owned copy; it cannot be manually disarmed. The next incoming hostile card is automatically blocked and consumes that copy, with no consent popup. It is a separate ARMED status, not the queued-card system. Re-arm after it triggers as often as you have copies; unused reservations return when the match ends or cancels. Proposed Royal-only 3% crate odds. Name options: Spellbreak (recommended), Hexguard, Mystic Barrier, Nullify, Enchanted Shield, Charmbreaker, or Aegis.'},
 {'id':'card-mirrored_shield','name':'Mirrored Shield','icon':'◇','rarity':'Legendary','status':'Legendary card · proposed','old':'Not in the live game. Replaces the rejected old Mirror proposal.','proposal':'Arm on yourself or another alive player. The next hostile card is automatically reflected to its original sender and consumes this card. Reflected cards never reflect again, preventing loops. No manual disarm; unused copy returns at match end. Re-arm with another copy after use. Proposed Royal-only 2% crate odds. Only one armed card defense per protected player; a second ward cannot overwrite it.'},
]
data['cards'] += [
 {'id':'card-echo_cast','name':'9 · Echo Cast','icon':'↻','rarity':'Rare','status':'Rare card · proposed','old':'Not in the live game. New idea for slot 9.','proposal':'Repeat the most recent non-Legendary card effect from this match on a player you choose. Spend Echo Cast, not a copy of the original card. Cannot copy Echo Cast or a reflected effect, so it cannot loop. Same targeting and effect limits as the original card. A flexible card without stealing permanent inventory.'},
 {'id':'card-letter_lock','name':'10 · Letter Lock','icon':'A','rarity':'Rare','status':'Rare card · proposed','old':'Not in the live game. New idea for slot 10.','proposal':'The target’s next answer must contain one additional common letter, shown before their turn starts. The server picks a letter only when multiple valid answers exist for the required prefix. Normal time and mistakes; one-turn duration, no stacking. Adds a word puzzle rather than another timer penalty.'},
 {'id':'card-double_take','name':'11 · Double Take','icon':'×2','rarity':'Epic','status':'Epic card · proposed','old':'Not in the live game. New idea for slot 11.','proposal':'On the target’s next turn, submit two different valid words with the same required prefix within the normal clock. Keep the first accepted answer visibly checked. Failure costs one normal heart, never two. Does not stack or apply mid-turn. Different from Double Trouble’s two-letter prefix rule.'},
 {'id':'card-card_jam','name':'12 · Card Jam','icon':'⊘','rarity':'Rare','status':'Rare card · proposed','old':'Not in the live game. New idea for slot 12.','proposal':'The target cannot play or arm new cards until their next word turn ends. Already armed Spellbreak/Mirrored Shield still protects them; already committed cards keep their effects. Does not affect answering, pets or inventory ownership. One temporary jam per player; cannot stack.'},
]
data['cards']=[item for item in data['cards'] if item['id'] not in {'card-echo_cast','card-letter_lock','card-double_take'}]
for item in data['cards']:
 item['status']=(item.get('rarity','')+' · Live card').strip(' ·');item['old']='Applied to the game.'
 if item['id']=='card-arcane_ward':item['name']='Nope';item['proposal']=item['proposal'].split(' Name options:')[0]
 if item['id']=='card-card_jam':item['name']='Card Jam'
 item['proposal']=item['proposal'].replace('Spellbreak','Nope').replace('Proposed Royal-only','Royal-only')
for item in data['pets']:item['status']='Live pet';item['proposal']=item['proposal'].replace('proposed ','').replace('suggested ','').replace('The 30% value is a draft for your approval.','')
data.pop('emotes',None)
data['accessories']=visuals['accessories']
data['rosters']=[v for v in visuals['rosters'] if v['id'] in {'roster-classic','roster-compact'}]
start=s.index('const data=');end=start+11+decoder.raw_decode(s[start+11:])[1]
s=s[:start]+'const data='+json.dumps(data,ensure_ascii=False).replace('<',r'\u003c')+s[end:]
s=s.replace('Finish the Word — balance workshop','Finish the Word — review workshop').replace('Your balance workshop','Your game workshop')
s=s.replace('Compare all 12 existing pets with suggested changes, review four counter pets, a 12-card lineup, and six victory animations. Suggestions are drafts until you approve them. Your notes save on this browser; export them to send back.', 'Choose goggles and player lists, then review pets and cards. Your JSON feedback is loaded; approved pet and card changes are now live. Victory emotes are excluded.')
s=s.replace('The eight new cards and four counter pets below are proposals.', 'Four new counter pets and all balance changes below remain proposals. Your rejected cards have been removed; All 12 card slots now have ideas. Spellbreak (name to choose) and Mirrored Shield are Legendary, with proposed Royal odds of 3% and 2%.')
s=s.replace('<div class="toolbar">', '<p class="note">Shop → Secrets: admin-only goggles. Bug Hunter Horns are reserved as gifts for bug finders.</p><div class="toolbar">')
s=s.replace('<div class="note"><strong>Crates:', '<details class="note"><summary>Crates and balance notes</summary><strong>Crates:',1).replace('equipped emotes after a server-confirmed win.</p></div>', 'equipped emotes after a server-confirmed win.</p></details>',1)
s=s.replace('<nav>', '<nav><button data-tab="accessories" aria-pressed="true">Black goggles</button><button data-tab="rosters" aria-pressed="false">Player lists</button>')
s=s.replace('<button data-tab="pets" aria-pressed="true">','<button data-tab="pets" aria-pressed="false">').replace('Cards (12 total)','Cards (9 live)')
s=s.replace('let notes={};try{notes=JSON.parse(localStorage.getItem(\'ftw-balance-feedback-v1\')||\'{}\')}catch{}', 'const suppliedNotes='+json.dumps(feedback['notes'],ensure_ascii=False)+';\nlet notes={...suppliedNotes};try{Object.assign(notes,JSON.parse(localStorage.getItem(\'ftw-balance-feedback-v1\')||\'{}\'))}catch{}')
s=s.replace("const pic=petImages[item.id.replace('pet-','')];", "const pic=petImages[item.id.replace('pet-','')];")
s=s.replace("a.append(text('div',pic?'':item.icon,'icon'),", "if(item.credit){const credit=document.createElement('a');credit.href=item.credit;credit.target='_blank';credit.rel='noopener';credit.textContent='CC0 source · fitted strap with custom black frames/lenses';a.append(credit)}if(item.images){const strip=document.createElement('div');strip.className='model-views';for(const [i,url]of item.images.entries()){const img=new Image();img.src=url;img.alt=item.name+(i?' side view':' front view');strip.append(img)}a.append(strip)}if(item.preview){const frame=document.createElement('iframe');frame.srcdoc=item.preview.replace('</style>','.plist-rows{max-height:none!important}</style>');frame.title=item.name+' player list preview';frame.className='roster-frame';a.append(frame)}a.append(text('div',pic||item.images||item.preview?'':item.icon,'icon'),")
s=s.replace('notes,catalog:data', 'notes,catalog:Object.fromEntries(Object.entries(data).map(([key,items])=>[key,items.map(({images,preview,...item})=>item)]))')
s=s.replace("render('pets');", "const hashTab=location.hash.slice(1),initialTab=Object.hasOwn(data,hashTab)?hashTab:'accessories';document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===initialTab)));render(initialTab);")
s=s.replace('render(b.dataset.tab)});', 'render(b.dataset.tab);history.replaceState(null,\'\',\'#\'+b.dataset.tab)});')
s=s.replace('</style>', 'a{color:#9cd6f2;font-size:12px}summary{cursor:pointer;font-weight:700}details.note{margin-bottom:12px}details.note[open] summary{margin-bottom:12px}.model-views{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px}.model-views img{width:100%;border-radius:10px;background:#e5e9ef}.roster-frame{width:100%;height:440px;border:0;border-radius:10px;background:#acd8e5}.grid:has(.roster-frame){grid-template-columns:repeat(auto-fit,minmax(310px,1fr))}article h2{font-size:23px}nav{overflow-x:auto}iframe{color-scheme:light}</style>')
import re
s=s.replace('Secret $1,500','Mystic $1,500').replace('proposal review','game review').replace('Pets (12 + 4 proposals)','Pets (16 live)')
s=re.sub(r'<p>Emote previews here.*?</p>','',s)
icons_path=Path('docs/pet-review-icons.json')
if icons_path.exists():s=s.replace('const data=', 'Object.assign(petImages,'+icons_path.read_text()+');\nconst data=',1)
s=re.sub(r'<button data-tab="emotes"[^>]*>.*?</button>','',s)
s=s.replace('All 12 card slots now have ideas. Spellbreak (name to choose) and Mirrored Shield are Legendary, with proposed Royal odds of 3% and 2%.','Nine approved cards are live. Nope and Mirrored Shield are Legendary with Royal odds of 3% and 2%.')
s=s.replace('Four new counter pets and all balance changes below remain proposals.','The approved pet and card changes below are live.').replace('Secret Block','Mystic Block')
s=s.replace('Crates:</strong> Starter $300, Mystic $1,500, Mythic $3,000.','Crates:</strong> Starter $300, Mystic $1,500, Mythic $3,000. Mystic and Mythic each have five exclusive pets. Mystic: Grizzly 25%, Pengu 25%, Shellback 20%, Ironhide 20%, Moon Moth 10%. Mythic: Hoot 40%, Frostbite 40%, Blaze 8%, Tick-Tock 8%, Sparkle 4%. Starter stays unchanged; all 16 pets remain obtainable.',1)
Path('public/review.html').write_text(s)
for name,tab in [('balance-review','pets'),('player-list-review','rosters'),('secret-accessories','accessories')]:
 Path(f'public/{name}.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=review.html#{tab}"><title>Finish the Word review</title><p><a href="review.html#{tab}">Open the combined game review</a></p></html>')
print('Built unified /review with goggles, roster comparisons and imported balance feedback.')
