import { h } from './dom.js';
import {modelArt} from './art.js';
import { PETS, CARDS, CHAIRS, BACK_BLING,RARITIES } from '../shared/catalog.js';

const button = (label, onClick) => h('button', { type: 'button', class: 'btn small purple', onClick }, label);
const row = (label, input) => h('label', { class: 'set-row' }, h('span', { class: 'set-label' }, label), input);

export function createAdminProfileEditor({ state, actions }) {
  const search = h('input', { class: 'field', placeholder: 'Name, account or player ID', 'aria-label': 'Search saved profiles' });
  const results = h('div', { class: 'admin-room-players' });
  const editor = h('div');
  const el = h('section', { class: 'admin-profile-editor' }, h('h3', { class: 'section-title stroke' }, 'Full user profiles'),
    row('Find saved accounts', search), button('Search accounts', () => actions.admin('listProfiles', { search: search.value })), results, editor);
  let loaded, draft;
  function update() {
    results.replaceChildren(...(state.adminProfiles || []).map(user => button(`${user.name} · ${user.username}`, () => {
      state.adminProfile = null;
      actions.admin('getProfile', { id: user.id });
    })));
    const data = state.adminProfile;
    if (loaded === data) return;
    loaded = data;
    editor.replaceChildren();
    if (!data?.profile) { editor.append(h('p', { class: 'panel-note' }, 'Choose an online player below or search saved accounts, including offline users.')); return; }
    draft = structuredClone(data.profile);
    const controls = [];
    const form = h('div', { class: 'set-group' });
    function field(label, value, write, numeric = false, maximum = 1000000000) {
      const input = h('input', { class: 'field', type: numeric ? 'number' : 'text', ...(numeric ? { min: 0, max: maximum, step: 1 } : {}), value, 'aria-label': label });
      controls.push(() => {
        const value = numeric ? Number(input.value) : input.value;
        if (numeric && (!Number.isSafeInteger(value) || value < 0 || value > maximum)) throw new Error(`${label}: use a whole number from 0 to ${maximum.toLocaleString()}.`);
        write(value);
      });
      form.append(row(label, input));
    }
    editor.append(h('p', { class: 'panel-note' }, `${draft.name} · ${draft.id}${data.username ? ` · Account: ${data.username} · Created: ${new Date(data.createdAt).toLocaleString()}` : ' · Guest (online profile)'}`));
    field('Display name', draft.name, v => draft.name = v);
    for (const key of ['coins', 'wins', 'xp', 'gamesPlayed', 'wordsTyped', 'bestWpm', 'bestCombo', 'bestObbyMs'])
      field(({ coins: 'Money (coins)', xp: 'XP' })[key] || key.replace(/[A-Z]/g, v => ` ${v.toLowerCase()}`), draft[key] || 0, v => draft[key] = v, true);
    field('Last free claim (timestamp)', draft.lastFreeClaim || 0, v => draft.lastFreeClaim = v, true, Number.MAX_SAFE_INTEGER);
    field('Longest word', draft.longestWord || '', v => draft.longestWord = v);
    form.append(h('h3', {}, 'Pet inventory'));
    const petGrid=h('div',{class:'admin-pet-grid'}),petCards=[];
    const petSearch=h('input',{class:'field',placeholder:'Find a pet…','aria-label':'Find pet in profile',onInput:filterPets});
    const ownedOnly=h('input',{type:'checkbox','aria-label':'Show only owned pets',onChange:filterPets});
    function filterPets(){for(const item of petCards)item.card.hidden=!item.pet.name.toLowerCase().includes(petSearch.value.toLowerCase())||(ownedOnly.checked&&!item.inputs.some(input=>Number(input.value)>0));}
    for(const pet of PETS){
      const inputs=[],total=h('small',{}),tiers=h('div',{class:'admin-pet-tiers'});
      const card=h('article',{class:'admin-pet-card','data-pet':pet.id,style:{'--pet-color':RARITIES[pet.rarity].color}},
        h('div',{class:'admin-pet-heading'},modelArt(actions,'pet',pet.id,pet.name,128),h('div',{},h('strong',{},pet.name),total)),tiers);
      function refreshTotal(){total.textContent=pet.rarity+' · '+inputs.reduce((sum,input)=>sum+(Number(input.value)||0),0)+' owned';filterPets();}
      for(const tier of [1,2,3]){
        const label=`${pet.name} · Tier ${tier}`,input=h('input',{class:'field',type:'number',min:0,max:1000000000,step:1,value:draft.petTiers?.[pet.id]?.[tier]||0,'aria-label':label,onInput:refreshTotal});inputs.push(input);
        const step=delta=>{input.value=Math.max(0,Math.min(1000000000,(Number(input.value)||0)+delta));refreshTotal();};
        tiers.append(h('div',{class:'admin-pet-tier','data-tier':tier},h('strong',{},'Tier '+tier),input,
          h('div',{class:'admin-pet-stepper'},h('button',{type:'button',class:'btn small grey','aria-label':`Remove one ${label}`,onClick:()=>step(-1)},'−'),h('button',{type:'button',class:'btn small purple','aria-label':`Add one ${label}`,onClick:()=>step(1)},'+'))));
        controls.push(()=>{const value=Number(input.value);if(!Number.isSafeInteger(value)||value<0||value>1000000000)throw Error(label+': enter a whole quantity from 0 to 1,000,000,000.');draft.petTiers||={};draft.petTiers[pet.id]||={};draft.petTiers[pet.id][tier]=value;draft.pets||={};draft.pets[pet.id]=[1,2,3].reduce((sum,t)=>sum+(draft.petTiers[pet.id][t]||0),0);});
      }
      petCards.push({pet,card,inputs});refreshTotal();petGrid.append(card);
    }
    form.append(h('div',{class:'admin-pet-toolbar'},petSearch,h('label',{},ownedOnly,' Owned only')),petGrid);
    form.append(h('h3', {}, 'Cards'));
    for (const card of CARDS) field(card.name, draft.cards[card.id] || 0, v => draft.cards[card.id] = v, true);
    for (const [label, key, catalog, initial] of [['Chairs', 'ownedChairs', CHAIRS, 'wooden'], ['Back items', 'ownedBacks', BACK_BLING, 'none']]) {
      form.append(h('h3', {}, label));
      for (const item of catalog) {
        const input = h('input', { type: 'checkbox', checked: draft[key].includes(item.id), disabled: item.id === initial, 'aria-label': `Own ${item.name}` });
        controls.push(() => { draft[key] = draft[key].filter(id => id !== item.id); if (input.checked) draft[key].push(item.id); });
        form.append(row(item.name, input));
      }
    }
    const message = h('p', { class: 'panel-note', role: 'status' });
    const raw = h('textarea', { class: 'field', rows: 18, 'aria-label': 'Full profile JSON', style: { width: '100%', 'font-family': 'monospace' } });
    const advanced = h('details', {}, h('summary', {}, 'Advanced · appearance, equipment, settings and history (JSON)'),
      h('p', {}, 'Refresh JSON after changing fields above. Apply JSON to save advanced edits. Player ID stays fixed; values must match the game catalogs.'),
      button('Refresh JSON from fields', () => { try { controls.forEach(fn => fn()); raw.value = JSON.stringify(draft, null, 2); message.textContent = ''; } catch (error) { message.textContent = error.message; } }), raw,
      button('Apply JSON and save profile', () => { try { save(JSON.parse(raw.value)); } catch (error) { message.textContent = error.message; } }));
    function save(profile) {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Enter a profile object.');
      message.textContent = 'Saving…';
      actions.admin('saveProfile', { id: data.id, roomCode: state.adminRooms.find(room => room.players?.some(p => p.id === data.id))?.code || (state.players.has(data.id) ? state.code : undefined), revision: data.revision, profile });
    }
    raw.value = JSON.stringify(draft, null, 2);
    editor.append(form, button('Save profile changes', () => {
      try { controls.forEach(fn => fn()); save(draft); } catch (error) { message.textContent = error.message; }
    }), button('Reload profile', () => actions.admin('getProfile', { id: data.id, roomCode: state.adminRooms.find(room => room.players?.some(p => p.id === data.id))?.code || state.code })), message, advanced);
  }
  update();
  return { el, update };
}
