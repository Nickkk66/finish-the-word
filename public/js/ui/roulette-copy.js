export function rouletteEntryDetails(amount = null) {
  return [
    { label: 'YOUR ENTRY', text: amount == null ? 'Choose a bet from 25 coins.' : `${amount.toLocaleString()} coins committed.`, tone: 'gold', prominent: true },
    { label: 'POISON ODDS', text: 'Everyone risks the smallest entry at the table. Higher unmatched amounts are returned.', tone: 'green' },
    { label: 'ENTRY REQUIREMENT', text: '1 trophy to play. You keep it. Paid rounds also need two signed-in players with 24-hour-old accounts.', tone: 'purple' },
    { label: 'YOUR TURN', text: 'Drink, pass once, or try a Double Sip with 60% poison risk.', tone: 'red' },
    { label: 'THE WINNER', text: 'Prize starts at 80% of matched entries and grows to 90% with full circuits. At least 10% stays with the house; unmatched coins are returned even if you lose. Last Sip wins do not award sellable trophies. Practice and cancelled entries are returned.', tone: 'gold' },
  ];
}
