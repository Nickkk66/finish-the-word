export function rouletteEntryDetails(amount = null) {
  return [
    { label: 'YOUR ENTRY', text: amount == null ? 'Choose a bet from 25 coins.' : `${amount.toLocaleString()} coins committed.`, tone: 'gold', prominent: true },
    { label: 'POISON ODDS', text: 'Bet above the table average to lower your risk.', tone: 'green' },
    { label: 'PAID PLAY', text: 'Two signed-in players, each with a win and a 24-hour-old account. Wins are kept.', tone: 'purple' },
    { label: 'YOUR TURN', text: 'Drink, pass once, or try a Double Sip with 60% poison risk.', tone: 'red' },
    { label: 'THE WINNER', text: 'Last awake takes the growing pot. Practice entries are returned.', tone: 'gold' },
  ];
}
