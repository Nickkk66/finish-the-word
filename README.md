# Finish The Word! (web)

A 3D, Roblox-style browser copy of the Roblox word-chain game **Finish The Word!**
Up to 8 players per room; share the invite link (`/?room=CODE`) to play together.

**Play:** https://finish-the-word.nickkk66.workers.dev or https://nickkk66.github.io/finish-the-word/
(same rooms on both).

**Rules:** sit at the table (2+ players, or ask the host to add bots). Type a word that starts with the
last letter of the previous word — sometimes the last *two* letters. No repeats, 5 mistakes per turn, and the
timer shrinks as the chain grows. Run out of time or mistakes and you lose a heart; last player standing wins.
Coins buy chairs, tables, back accessories, pet blocks, collectible card boxes, and exact-answer hints.

Version 2 includes seven word modes plus Roulette and Custom settings, public matchmaking, a persistent global wins board, adjustable bots,
WPM combos, pet merging (three copies per tier, maximum tier 3), and separate consumable cards. Walk near a
pet block to see its odds and undiscovered silhouettes. Prefix letters are pre-filled by default; turn this off
in personal Settings. The pier portal leads to an obstacle course while you wait for the next match.

Winner bonuses grow by 15 coins per minute of meaningful play, separately from word/combo rewards. Coins
and inventories save in your browser by default. Optional accounts sync progress across devices; the economy still trusts client-reported progress.

**Roulette — The Last Sip:** choose Roulette in Game Settings → Mode. A 17-second intro warns in chat 10 seconds before meteors begin falling. Choose any whole-number entry of at least 25 game coins. The prize starts at 80% of pooled entries and grows by 4% per completed circuit, capped at 90% of entries including every card and pet bonus; the house keeps at least 10%. Risk starts at 2%, rising by 8 percentage points per circuit to 95%. Drink or pass in 10 seconds; timeout drinks, with one pass per match. Last awake wins. Fire and meteor footprints debit 50 coins each second, or halve a balance below 50. Paid games require two signed-in human accounts aged 24 hours and a recorded trophy each; practice/cancellations return entries.

**Merging:** three matching pets create the next tier (up to 3). Higher tiers are larger with a blue/gold aura; their gameplay ability stays the same. Pet cards list separate Classic, The Last Sip, and Word Tide effects. Capes support static/rainbow colors in Profile → Back Bling.

**Controls:** WASD / arrows move, Space jumps (or stands up from a seat), E interacts, drag to orbit the camera,
scroll to zoom, `/` to chat, C to open/close Cards, Escape to close panels, P to toggle first person (outside typing), and `/e dance` for emotes.
Phones get a joystick, jump button, and emote picker. Camera controls are in Settings → Controls.

**Accounts:** choose Account on the main menu or in Settings to create a username/password and save your
current progress. You can still play as a guest. Logging in on another device loads your saved collection;
logging out restores that device's guest profile. Save the one-time recovery code shown at signup; it lets
you set a new password if you forget yours. You can generate a new code while signed in.

**Owner tools:** in a room, open Settings, tap the version five times within three seconds, and enter your
private owner code. This reveals Admin tools; simply hosting a room does not grant admin coin powers.

## Double-click launchers (macOS)

No terminal commands needed. Double-click these in Finder:

| File | What it does |
|---|---|
| `Finish The Word.command` | A menu with live status: play locally, put online, take offline, check everything |
| `Play Locally.command` | Runs the game on this computer and opens it in your browser (close the window to stop) |
| `Put Game Online.command` | Runs the tests, uploads to Cloudflare, saves your changes to GitHub, turns GitHub Pages on |
| `Take Game Offline.command` | Turns off the Cloudflare site and GitHub Pages (asks first; nothing is deleted) |

They all run `scripts/control.mjs` (`node scripts/control.mjs [menu|play|online|offline|check]`).
The first run installs dependencies automatically. Needs Node.js, and for online/offline: `npx wrangler login`
and `gh auth login` once.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8787. Other scripts: `npm test` (server unit tests), `npm run smoke` (end-to-end check
against a running dev server), `npm run build:words` (regenerate the word lists).

Additional verification: `node test/worker.integration.mjs` runs an isolated real Worker with a disposable
test secret and checks persistent APIs; `node scripts/e2e.mjs match|shop|load` exercises Chrome against the
running server (set `CHROME_BIN` if needed). Run `node scripts/followup-check.mjs` for account, card-targeting, shared-animation and obby-return browser checks. Use `node scripts/revision-check.mjs` for the revised UI/admin tools, `node scripts/roulette-check.mjs` for a paid desktop/mobile Roulette match, and `node scripts/avatar-check.mjs` for the hair/cape gallery. `node scripts/roulette-hazard-check.mjs` checks automatic fire damage and stopping after leaving. The revision check expects a local disposable `ADMIN_CODE` override of `local-ui-test-only`. Screenshots remain in the ignored `.e2e-shots/` folder.

## Deploy

Runs on Cloudflare Workers + Durable Objects (free plan, always on): one Worker serves `public/` and routes each
room's WebSocket to its own Durable Object.

```bash
npx wrangler login
npm run deploy
```

GitHub Pages hosts a static copy of `public/` (workflow: `.github/workflows/pages.yml`, runs on every push to
`main`). Pages can't run the multiplayer server, so on `*.github.io` the client connects to the Worker's rooms
(`GAME_SERVER` in `public/js/net.js`).

## Layout

- `src/` — Worker entry, room Durable Object, game engine, dictionary, bots
- `public/` — browser client (three.js world in `js/world/`, HUD/menus in `js/ui/`, glue in `js/main.js`)
- `public/js/shared/` — constants and the cosmetics catalog shared by server and client
- `docs/SPEC.md` — protocol and module contracts
- `public/dev/` — visual test harnesses (not deployed; serve `public/` statically to use them)

Word Tide accepts animal plurals such as DOGS and builds four blocks for DOGS, three for DOG. Its winner bonus is 100 coins, with a 300-coin match cap. Owner cancellation plays the tide retreat and returns spent items.

After a random 2 minutes 15 seconds to five minutes without interaction, players receive a moving “Still there?” check with a 30-second clock. Missing the check removes them from the room and forfeits the game; pings, automatic loadout updates, and reconnecting do not clear it.

Checks and removals pause during active rounds and animations. Overdue AFK players cannot collect
match winnings. Sustained, precisely repeated desktop movement paths trigger an automatic removal;
stationary packets and generic key spam cannot keep resetting presence forever.

Handles are editable and globally unique, ignoring case. They remain reserved offline until changed,
and changing one immediately frees its old spelling for another player. Trading supports collection
items only; cash transfers are disabled on the server and in the UI.

Word Tide only fractures the equipped chair when the player runs out of hearts. Water holds at
its current level during the fall, distant fin approach, warning jump, second approach, and attack,
then rises. The existing licensed shark and piranha models are credited in
`public/assets/word-tide/SOURCES.md`. Large piranhas surface and attack through a five-second camera hold after the shark dives. Fifteen avatar pieces and detached accessories remain afloat with a spreading blood pool while the
eliminated player spectates. Ordinary lost hearts keep the chair intact; wins and End All never
replay deaths. The normal finale celebrates the winner and restores the island in 14 seconds.

Word Tide shares Finish the Word's heart icons and Answer button (500 coins). Invalid answers
briefly bounce with a red focus ring; editing restores the ordinary blue ring. The sidebar reserves
the measured chat height, including expanded mobile chat. Last Sip's asteroid cutscene runs when
activating its mode, once per activation, rather than when starting individual matches.

Successful Tide submissions animate Enter into a checkmark. Each submitted letter adds exactly one block; Tide pets protect hearts instead of adding bonus blocks. Ordinary heart loss happens only after the water covers the avatar’s head and flashes the screen edges red. The intro launches players during the quake, then lands them with swaying parachutes. Admins can open Settings → Open admin tools → Test animations to show or hide local previews of the intro, shark sequence, and retreat. Stand up · Give up asks for confirmation, then forfeits Tide and follows its normal elimination and spectating sequence.

Tide’s launch uses an abrupt upward impulse, air resistance, and a tumbling pose. Its bundled premade parachute has thick mesh ropes. Players tuck into their seated pose before reaching the chair; Space outside text fields and menus opens the same give-up confirmation as Finish the Word. The stable canopy stays independent of the avatar’s tumble. Shark jumps and dives follow continuous curves; its mouth reaches the actual head before carrying it away. Head labels show handles without a “YOU” suffix.

Tide free fall is 30% faster after the apex; canopy descent keeps its previous path and speed. The shark wake churns and fades with the water. The swimmer stays outside the full shark model’s turning envelope, including its tail, and blood becomes visible at the bite.

Admin tools include a Full user profiles editor: select an online player or search saved accounts (including offline users), edit money, pet quantities by tier, cards, cosmetics and stats, then save. Advanced JSON covers appearance, equipment, settings and history. Account edits persist in the cloud and reach connected rooms; guest edits persist on the connected browser. Trades exchange items only; money cannot be offered.

Free coins require 15 accumulated minutes connected in-game. Progress survives sessions; offline time gives no credit. Classic remains the default player list. Settings offers Classic and Slim; admin tools can switch them immediately in game. `/review#rosters` compares both.

One self-contained `/review` page combines three real black head-mounted ski-goggle choices, roster previews, pet/card balance proposals updated from user feedback, and victory animations. Previous review URLs redirect to that page. The three goggles are admin-only secret gifts; Bug Hunter Horns are retained for bug finders.

Approved October balance update: Mystic Block replaces the visible Secret Block name, keeping its saved ID. Sixteen pets include Shellback, Frostbite (ice penguin), Ironhide (rhino), and Moon Moth. Nine cards include Nope (Royal 3%) and Mirrored Shield (Royal 2%), both Legendary, plus Slow Burn, Lifeline and Card Jam. Echo Cast, Letter Lock, Double Take and victory emotes are excluded. Last Sip matches every entry to the smallest stake, returns unmatched coins even to losers, and funds its 80–90% shared prize only from matched entries. Last Sip wins do not award sellable trophies; word games still do.
