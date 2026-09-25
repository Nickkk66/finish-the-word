# Finish The Word! (web)

A 3D, Roblox-style browser copy of the Roblox word-chain game **Finish The Word!**
Up to 8 players per room; share the invite link (`/?room=CODE`) to play together.

**Play:** https://finish-the-word.nickkk66.workers.dev or https://nickkk66.github.io/finish-the-word/
(same rooms on both).

**Rules:** sit at the table (2+ players, or ask the host to add bots). Type a word that starts with the
last letter of the previous word — sometimes the last *two* letters. No repeats, 5 mistakes per turn, and the
timer shrinks as the chain grows. Run out of time or mistakes and you lose a heart; last player standing wins.
Coins buy chairs and lucky blocks (pets with abilities).

**Controls:** WASD / arrows move, Space jumps (or stands up from a seat), E interacts, drag to orbit the camera,
scroll to zoom, `/` to chat. Phones get a joystick and a jump button.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8787. Other scripts: `npm test` (server unit tests), `npm run smoke` (end-to-end check
against a running dev server), `npm run build:words` (regenerate the word lists).

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
