import { h } from './dom.js';
import { petAbilityRows } from '../shared/catalog.js';

export const petAbilitySummary = pet => petAbilityRows(pet).map(row => `${row.mode}: ${row.text}`).join(' · ');
export function petAbilities(pet) {
  return h('div', { class: 'pet-abilities' }, petAbilityRows(pet).map(row =>
    h('div', { class: 'pet-ability-row' }, h('strong', {}, `${row.mode}:`), h('span', {}, row.text))));
}
