# Finish The Word! (web)

A 3D, Roblox-style browser copy of the Roblox word-chain game **Finish The Word!**
Up to 8 players per room; share the invite link (`/?room=CODE`) to play together.

**Play:** https://finish-the-word.nickkk66.workers.dev or https://nickkk66.github.io/finish-the-word/
(same rooms on both).

**Rules:** sit at the table (2+ players, or ask the host to add bots). Type a word that starts with the
last letter of the previous word — sometimes the last *two* letters. No repeats, 5 mistakes per turn, and the
timer shrinks as the chain grows. Run out of time or mistakes and you lose a heart; last player standing wins.
Coins buy chairs, tables, back accessories, pet blocks, collectible card boxes, and exact-answer hints.

Version 2 includes seven game modes, public matchmaking, a persistent global wins board, adjustable bots,
WPM combos, pet merging (three copies per tier, maximum tier 3), and separate consumable cards. Walk near a
pet block to see its odds and undiscovered silhouettes. Prefix letters are pre-filled by default; turn this off
in personal Settings. The pier portal leads to an obstacle course while you wait for the next match.

Winner bonuses grow by 15 coins per minute of meaningful play, separately from word/combo rewards. Coins
and inventories are saved in your browser; this is a casual economy, not an account-backed wallet.

**Controls:** WASD / arrows move, Space jumps (or stands up from a seat), E interacts, drag to orbit the camera,
scroll to zoom, `/` to chat, P to toggle first person (outside typing), and `/e dance` for emotes.
Phones get a joystick, jump button, emote picker, and view toggle.

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
running server (set `CHROME_BIN` if needed). Screenshots remain in the ignored `.e2e-shots/` folder.

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
