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

**Roulette — The Last Sip:** choose Roulette in Game Settings → Mode. Its seven-second asteroid intro closes the menus, darkens the map and leaves the table lit. Enter with 25, 100 or 500 game coins. Every turn multiplies the stacked prize by 1.2 (up to ×100) and poison chance by 1.25 (starting at 16.7%, capped at 95%). Drink or pass in 10 seconds; timeout drinks, and each player gets one pass until the next knockout. Last awake wins. A poisoned player slumps and releases a skull ghost. Standing in asteroid fire/craters costs 25 coins every five continuous seconds; leaving stops the drain. Bets require a fresh confirmation each match.

**Merging:** three matching pets create the next tier (up to 3). Higher tiers are larger with a blue/gold aura; their gameplay ability stays the same. Capes support static/rainbow colors in Profile → Back Bling.

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
