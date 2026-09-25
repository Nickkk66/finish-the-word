# Finish The Word! (web) — v2 Build Spec & Contracts

## v2 implementation contract (September 25, 2026)

This section supersedes conflicting v1 details below. The owner authorized the entire 28-item handoff.
Lead owns shared constants/catalog, cosmetics.js/cosmetics-v2.js, documentation and integration; server,
world and UI agents own the remaining areas as assigned. All API calls work from GitHub Pages through
`net.apiUrl(path)` and all public JSON endpoints have CORS. Protocol version is 2.

### Shared catalog and behavior

`MODES` is an array of `{id,name,description,hearts,turnSeconds}`; `BOT_LEVELS` is an object keyed by difficulty;
`EMOTES` is an array of seven allowed names; `FLAIRS` maps IDs to `{label,coins,color}`. All are in constants.js.
`TABLES`, `BACK_BLING`, `CARDS`, `CARD_BOXES` are arrays in catalog.js, with `TABLE_IDS`, `BACK_IDS`,
`CARD_IDS`, `CARDS_BY_ID`. Catalog prices and odds are authoritative display data. `rollBlock` also rolls cards.
Tier merging consumes 3 identical same-tier pets and produces one at tier+1, capped at 3. Tiers are cosmetic:
pet abilities remain unchanged. Existing dragon pet Blaze uses `{type:'dragon',value:3,chance:.5}`: roll once
after its accepted word, on success cap the next typing turn at 3000ms after other modifiers. Other sabotage
pets still subtract seconds. Hints cost `HINT_PRICE=250`.

Winner bonus replaces the fixed 50 with `floor(min(1800, eligibleMs / 60000 * 15))`; word/combo/participation
and flair earnings remain separate. Only award the duration bonus when at least two human participants each
played a valid word. `eligibleMs` cannot exceed actual match duration or 30 seconds per accepted word.
This gives a 15-coin win bonus for a meaningful minute, up to 1800 for two hours. Coins/inventories remain the
existing casual localStorage economy; they cannot be made cheat-proof by trusting client counts. Cards have
server-enforced turn/target/count limits, but no account or server wallet migration is included in this release.

### Protocol additions

- Settings: `{hearts,turnSeconds,petAbilities,mode:'classic',botLevel:'normal',public:false}`; valid turn values
  8,10,15,20. Selecting a mode supplies its default hearts and turnSeconds before host overrides.
- `hello` and `loadout` add `back`, `table`, `level` (1–999), `petTier` (1–3), `cards:{cardId:count}`.
  `hello` additionally accepts `adminToken` and `public`. Card counts are registered outside active matches;
  the room's copy is consumed on successful use, never incremented by in-match loadouts.
- Player adds `back`, `level`, `petTier`, and `isAdmin` only if the admin tag is shown. Own admin authority is
  delivered privately as `welcome.isAdmin` and in `unlock` replies; do not expose hidden admins to other clients.
- `welcome` / `room` add `table` and `public`.
- MatchState adds `turnId` (unique increasing number across a room's matches), `mode`, `minLength`,
  `prefixIndex`, `twist:{id,name}|null`, `startedAt`, plus participant `combo` and pending card effects.
- `result ok:true` adds `{wpm,combo,coins,flairs:[{id,label,coins,color}]}`. `win` adds `flairs` in the same shape.
  `reward` adds `{matchId,durationMs,eligibleMs,bestWpm,bestCombo,bonuses:[{label,coins}]}`. Only credit once.
- C→S `hint {turnId,requestId,balance}` → private S→C
  `hint {ok,turnId,requestId,word?,cost?,reason?}`. Validate phase, current typer, balance>=250, unused answer,
  current mode min length and once per turn. Repeated request ID returns same result. No charge for failure;
  UI reserves the purchase while pending and debits once on an accepted, current-turn response.
- C→S `useCard {turnId,requestId,cardId,targetId}` → private
  `cardResult {ok,turnId,requestId,cardId,targetId,reason?}`, and on success broadcast
  `cardUsed {actorId,targetId,cardId,effect}`. One card per actor turn; alive other-player targets only.
  `skip` queues skipping the target's next typing turn; `time_tax` removes 2 seconds (normal floor applies);
  `pressure` removes 2 allowed mistakes (floor 1); `heart` removes 1 heart immediately through shield/elim logic.
  Repeated IDs cannot spend twice. Invalid uses do not consume cards. Clear pending effects on match end.
- C→S `emote {name}` → S→C `emote {id,name}` to others; sender animates locally. At most once/second.
- C→S `unlock {code}` → private `unlock {ok,token?}`. Code lives only in env.ADMIN_CODE; disabled if absent.
  Five attempts/connection and hashed IP/10min. Persist HMAC admin token locally; verify on hello. No code logs.
- C→S `mod {action:'kick'|'ban'|'unban',id}`; owner/admin. Owner cannot moderate an admin.
  S→C `kicked {reason}`, close 4001 or 4002; no automatic reconnect. Ban ID and hashed IP for room lifetime.
- C→S `admin {action,...}` where actions are `takeHost`, `forceStart`, `endMatch`, `reset`, `announce` (text),
  `grant` (id,coins<=100000), `removeLeaderboard` (id), `tag` (on), `table` (table).
  S→C `announce {text}`, `grant {coins,reason}`. Admin teleport is local. Admin UI lives in Settings.
- C→S `obby {event:'start'|'finish',ms?}`; grant 50 once/10min/player, minimum legitimate run 30s.
- New errors include `banned`, `not_allowed`; default rate limits apply to every new message type.
- `GET /api/leaderboard` → `{top:[{name,wins}]}` (30s edge cache), global human wins only with 2+ humans.
- `GET /api/public` → `{rooms:[{code,humans}],players}`; `GET /api/quickplay` → `{code}`.
  Public room heartbeat <=once/2s, keep alive while inhabited, entries expire in 60s. Private rooms stay unlisted.

### World additions

`setTable(id)`, `renderThumbnail(kind,id,size=160) → Promise<dataURL>` (kind chair/table/pet/back/block/cardBox),
`setFirstPerson(on)`, `onViewChange(cb)`, `playEmote(id,name)`, `playEffect(id,'flair',{text,color})`,
`setPlayerStatus(id,{combo,...})`, `teleportLocal(pos)`, `setZone('island'|'obby')`,
`setPetCollection(ownedIds)` (ever-discovered pet IDs), `setLeaderboardTitle(text)`.
`onInteract` adds `{type:'portal',to:'obby'|'island'}`, `{type:'obbyFinish',ms}`, `{type:'obbyRespawn'}`,
and `{type:'cardBox',boxId}`. Portal runs automatically on entry; UI owns 1.4s overlay and halfway teleport.
`OBBY.spawn`, `.finish`, `.killY` are shared; world/obby.js owns platform layout and motion/collision data.
Root cosmetics exports `buildTable`, `buildBackBling`, `buildPortal`, `buildCardBox` via cosmetics.js;
returned groups use `userData.update(t,dt,seated=false)`. Back bling origin is torso center, geometry behind z=-.5.
Table origin is deck-top center, its surface at LAYOUT.tableHeight; models have distinct details/animations.

### UI and profile

Migrate profiles without losing coins/pets: retain `pets` as derived total counts and add `petTiers[id][tier]`,
`equippedPetTier`, `discoveredPets` (ever obtained; deletion does not re-hide discoveries), `cards`, owned/equipped
table/back, `xp`, `bestWpm`, `bestCombo`, `bestObbyMs`, and settings `prefillPrefix:true`, `view`.
Every paid action uses the existing confirmation dialog; equipped owned items don't charge. Merge/delete also
confirm. Hint/Card pending state is bound to turnId; buttons hidden when unavailable. Prefix prefills once per
turn and remains editable. Programmatic prefill must not start WPM's first-keystroke clock.
Settings retains sound/graphics/personal preferences and a prominent non-host notice. Separate Game Settings
appears only for owner/admin. Hidden admin entry opens after 5 version taps/3s. Shop tabs chairs/tables/back;
Cards separate from Pets. All inventory/odds art uses model or vector art; hatch reveal retains the pet emoji.
Profile uses two columns at desktop with tabs for Look/Back Bling/Pets and fits at 700px height.

---

A 3D, Roblox-style, browser multiplayer copy of the Roblox game **"Finish The Word!"** (by Table Game X).
Up to **8 players per room**, joined via an **invite link** (`https://<host>/?room=CODE`).
Hosted on **Cloudflare Workers + Durable Objects** (always on, free tier): one Worker serves the static
client and routes WebSockets to one Durable Object per room.

This file is the single source of truth. Every module must follow the contracts here exactly.
Shared code: `public/js/shared/constants.js`, `public/js/shared/catalog.js` (import these; do not duplicate values).

---

## 1. The original game (what we are copying)

- Lobby: bright green grassy island (Roblox stud-textured grass, blocky cube-leaf trees, sand paths, water all
  around, a red/white lighthouse, fluffy clouds). Players walk around (WASD, Space jump, E interact).
- A wooden **table with chairs**. Sit at the table with other players to start a match.
- A row of **chairs for sale** (Wooden, Glass, Goop, Toilet, Slime, Flower, Swing, …, Throne) with name/rarity/price
  labels. **Lucky blocks** (yellow "?" Starter Block, purple Secret Block) you buy with coins to hatch random **pets**
  that float next to you and give abilities.
- Leaderboard boards ("Most Wins"). HUD: left-side buttons (Invite, Store, Free), bottom-left 🏆 wins and 💵 cash,
  bottom-center round buttons (Chairs, Pets, Profile).
- **Match**: one player is shown a few letters and picks one; the next player must type a word starting with it.
  Then each player types a word starting with the **last letter of the previous word** ("DOG → GREY → Y..").
  Occasionally the prompt is the **last TWO letters** (harder). No repeated words. Each turn has a **15s timer**
  that shrinks as the game goes on. You may make up to **5 mistakes** (invalid submissions) per turn, refilled each
  turn. Timer runs out (or mistakes run out) → you **lose a heart** (2 hearts), and a fresh round starts with a
  new letter pick. Lose all hearts → knocked out. Last player standing wins. Everyone earns coins.
- In-match look: "Type a word starting with..." at top center (white bold text, dark outline), a big white letter
  tile above the current typer's head, a white speech bubble above the typer showing the word as it's typed (last
  letter highlighted **green**), 2 red hearts bottom-left, a white circular countdown ("13.9") bottom-center with
  5 red ✕ circles (mistakes) beside it.
- Font: Roblox's **Fredoka One** look → use Google Font `Fredoka` (600/700) with a dark text stroke everywhere.

## 2. Repository layout & ownership

```
package.json, wrangler.toml, src/**, scripts/**, test/**   -> SERVER agent
public/js/world/** (except cosmetics.js), public/dev/world.html -> WORLD agent
public/js/world/cosmetics.js, public/dev/cosmetics.html      -> COSMETICS agent
public/index.html, public/css/**, public/js/main.js, public/js/net.js,
public/js/audio.js, public/js/profile.js, public/js/ui/**,
public/favicon.svg, public/dev/stub-world.js                 -> UI agent
public/js/shared/**, docs/SPEC.md                            -> lead (read-only for agents; ask lead to change)
public/vendor/three/**                                       -> vendored three.js r186 (do not edit)
```

Client code is plain ES modules loaded by the browser (no bundler). Always use **relative** paths
(`../shared/constants.js`, `./css/base.css`): the client is also served from a subfolder on GitHub Pages
(`https://nickkk66.github.io/finish-the-word/`), where root-relative `/js/...` paths break. Three.js via the
import map in `index.html`:

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/addons/" } }
</script>
```
Available addons: `three/addons/geometries/RoundedBoxGeometry.js`, `three/addons/utils/BufferGeometryUtils.js`
(copy more from `node_modules/three/examples/jsm/` into `public/vendor/three/addons/` if needed).

## 3. Networking

- WebSocket URL: `ws(s)://<host>/api/room/<CODE>` where CODE matches `ROOM_CODE_REGEX` (uppercase).
- Invite link: `https://<host>/?room=<CODE>`. Codes are generated client-side with `makeRoomCode()`.
  Any valid code works: the room is created lazily on first connect.
- `GET /api/health` → `200 ok`.
- All messages are JSON objects with a `t` (type) field. Unknown types are ignored.

### Public Player object
```js
{
  id: string,             // stable client id (from localStorage) or 'bot-xxxx'
  name: string,           // sanitized, ≤16 chars
  isBot: boolean,
  isHost: boolean,
  connected: boolean,     // false during reconnect grace
  look: { skin, shirt, pants, hair, hairStyle, face },   // see catalog.sanitizeLook
  chair: string,          // equipped chair id (catalog CHAIRS), default 'wooden'
  pet: string|null,       // equipped pet id (catalog PETS) or null
  seat: number,           // -1 = not seated, else 0..7
  wins: number,           // wins in this room session
  pos: { x, y, z, ry, anim } | null   // last known transform (null → client places at LAYOUT.spawn)
}
```

### MatchState
```js
{
  phase: 'lobby' | 'countdown' | 'choosing' | 'typing' | 'roundEnd' | 'ended',
  phaseEndsIn: number|null,     // ms left in this phase at send time (countdown/choosing/typing/roundEnd/ended)
  phaseDuration: number|null,   // total ms of this phase (for progress rings)
  participants: [ { id, hearts, maxHearts, alive, words, shield } ],  // turn order (= seat order); [] in lobby/countdown
  chooserId: string|null,       // choosing phase: who picks the letter
  options: string[]|null,       // choosing phase: 3 lowercase letters (only chooser may pick)
  typerId: string|null,         // typing phase: whose turn
  prefix: string|null,          // typing phase: required start (lowercase, 1 or 2 letters)
  mistakes: number,             // typing phase: mistakes used by typer this turn
  maxMistakes: number,          // typing phase: allowed mistakes for this typer (5 + pet bonus)
  chain: [ { id, word } ],      // last ≤12 accepted words this match, oldest first
  wordCount: number,            // accepted words this match
  round: number,                // increments each time a new letter is chosen
  winnerId: string|null,        // ended phase
}
```
Clients compute a local deadline: `deadline = performance.now() + phaseEndsIn` on receipt.

### Client → Server
| msg | fields | notes |
|---|---|---|
| `hello` | `id, name, look, chair, pet, v` | MUST be first. `v` = PROTOCOL_VERSION. Same `id` as an existing player = resume/take over (old socket closed with code 4000). |
| `move` | `x, y, z, ry, anim` | ≤10/s, only when changed. anim ∈ `idle, walk, jump, fall`. Ignored while seated. |
| `sit` | `seat` | 0..7. Rejected if taken or you are an active participant. |
| `stand` | – | Alive participant standing = forfeit (knocked out). |
| `pick` | `letter` | chooser only, must be one of `options`. |
| `typing` | `text` | typer only; live text for the speech bubble (a-z, ≤30). ≤20/s. |
| `submit` | `word` | typer only. |
| `chat` | `text` | ≤120 chars, ~1 per 600ms. |
| `loadout` | `name?, look?, chair?, pet?` | change appearance / name any time. |
| `host` | `action: 'start'|'addBot'|'removeBot'|'settings', settings?` | host only. settings: `{hearts:1..3, turnSeconds:10|15|20, petAbilities:bool}` (applies next match). |
| `ping` | `c` | server replies `pong`. |

### Server → Client
| msg | fields | notes |
|---|---|---|
| `welcome` | `you, code, hostId, settings, players:[Player], match:MatchState` | after hello. |
| `player` | `p: Player` | a player joined or changed (upsert by id). |
| `leave` | `id` | player removed. |
| `room` | `hostId, settings` | host or settings changed. |
| `match` | `m: MatchState` | whenever match state changes (full snapshot). |
| `moves` | `list: [{id,x,y,z,ry,anim}]` | batched ~10Hz, only changed, never includes recipient. |
| `typing` | `id, text` | typer's live text (not echoed to typer). |
| `result` | `id, word, ok, reason?, mistakes?` | submission result. reason ∈ `not_word, wrong_start, used, too_short, invalid_chars`. |
| `fail` | `id, cause, hearts, shielded` | cause ∈ `timeout, mistakes, forfeit, left`. shielded = pet shield absorbed it (hearts unchanged). |
| `elim` | `id` | knocked out (0 hearts). |
| `win` | `id` | match winner (id may be null). |
| `reward` | `coins, won, words` | only to that player at match end. |
| `picked` | `id, letter` | chooser picked (for effects). |
| `chat` | `id, name, text` | `id:null, name:'System'` for system notices (joins, leaves, winner). |
| `pong` | `c, s` | s = server Date.now(). |
| `error` | `code, message` | codes: `room_full, bad_hello, not_host, seat_taken, rate_limited, bad_code`. `room_full`/`bad_hello` → server closes socket. |

## 4. Game rules (server-authoritative, see constants.js for numbers)

- Room holds ≤ `MAX_PLAYERS` (humans + bots). If full and a human joins while bots are not in an active match,
  a bot is removed to make space; otherwise `error room_full`.
- Host = first human; passes to the next human by join order. Bots are never host. No humans left → room resets
  (bots removed, timers cleared).
- **Countdown**: in `lobby`, when ≥2 players are seated → `countdown` (`COUNTDOWN_MS`). Drops below 2 → `lobby`.
  Host `start` skips the countdown. At the end, all seated players become participants (seat order). Anyone who
  sits during a match waits for the next one.
- **Round start**: `choosing` phase (`CHOOSE_MS`). chooser gets 3 distinct letters: two sampled by how many
  dictionary words start with them, plus one "hard" letter from `jkqvwxyz`. Timeout → random option.
  First round: chooser = random participant. Later rounds: chooser = the player who just failed if still alive,
  else the nearest alive player *before* them in turn order. Typer = next alive player after the chooser.
- **Typing**: turn time = `max(MIN_TURN_MS, turnSeconds*1000 − floor(wordCount/3)*1000)` + pet `time` bonus −
  pending `sabotage` (never below `ABS_MIN_TURN_MS`). Valid word: lowercase a-z only, length ≥ `MIN_WORD_LENGTH`,
  starts with `prefix`, in the dictionary, not already used this match. Invalid → `result ok:false`, mistakes++;
  mistakes reach `maxMistakes` → fail(`mistakes`). Timeout → fail(`timeout`).
- **Valid word** → chain push, typer `words++`, next typer = next alive player; next prefix = last letter, or the last
  **two** letters with probability `min(0.30, 0.04 + 0.012*wordCount)` if ≥25 unused dictionary words start with
  them. Phase stays `typing` (new turn, new timer, mistakes reset).
- **Fail** → if typer has an unused `shield` pet ability: shield consumed, no heart lost (`shielded:true`).
  Else hearts−1; 0 hearts → `elim`. ≤1 alive → `ended` (`MATCH_END_MS`, `win`, rewards). Else `roundEnd`
  (`ROUND_END_MS`) then a new `choosing` round.
- **Rewards** (humans): `participation + perWord*words + (winner ? win : 0)` coins via `reward`. Winner's room
  `wins++` (broadcast `player`). After `ended` → `lobby`; players stay seated, so the countdown restarts if ≥2.
- **Disconnect**: player stays (`connected:false`) for `RECONNECT_GRACE_MS`; their turns time out normally.
  After grace: removed; if alive participant → fail cause `left` with hearts→0, `elim`.
- **Pet abilities** (only if `settings.petAbilities`), from the player's equipped `pet` → `PETS_BY_ID[pet].ability`:
  `time` (+s own turns), `mistakes` (+maxMistakes), `shield` (first heart loss per match blocked),
  `sabotage` (after your valid word the next turn is shorter by value s).
- **Bots** (host adds/removes): fun names, random look/pet, sit in the first free seat. Think 1.5–5s (scaled to the
  turn time), "type" the word progressively via `typing` updates (~90–160ms/char), then submit. ~10% chance to
  first submit a plausible wrong word, ~8% chance to blank (time out). Prefer common words (bot list), fall back to
  the full dictionary. As chooser: pick after 1–2.5s.
- Sanitize everything from clients: names (letters/digits/space/_-.' ≤16, fallback `Player1234`), chat (strip
  control chars, ≤120), words (trim, lowercase). Rate-limit chat/typing/move/submit.

## 5. Client architecture

```
index.html          import map, Google Font Fredoka, root containers: #game (3D), #labels (world DOM labels), #ui (HUD)
js/main.js          boot: profile → menu → connect → wire net <-> world <-> ui
js/net.js           WebSocket client: connect(code), auto-reconnect w/ backoff, send(msg), on(type, fn), latency
js/profile.js       localStorage profile (id, name, look, coins, wins, stats, ownedChairs, equippedChair, pets{id:count}, equippedPet, sound)
js/audio.js         WebAudio-synthesized SFX (no audio files)
js/ui/*.js          menu, HUD, chat, shop/pets/profile/settings panels, toasts, letter picker, word input
js/world/world.js   createWorld() → World API (below)
js/world/cosmetics.js  buildChair / buildPet / buildLuckyBlock (procedural three.js models)
```

### World API (`public/js/world/world.js`)
```js
export async function createWorld({ container, labelLayer }) → world

world.start()                         // start render loop (requestAnimationFrame)
world.setMenuMode(on)                 // on: slow cinematic orbit of the island, no local control, labels hidden
world.addPlayer(player)               // Player object (see §3). Creates avatar, name tag, pet, handles seat.
world.updatePlayer(player)            // full Player object; update look/name/chair/pet/seat (sit/stand animations)
world.removePlayer(id)
world.setLocalPlayer(id)              // this avatar is keyboard/touch controlled; camera follows it
world.applyMoves(list)                // [{id,x,y,z,ry,anim}] remote transforms (interpolate smoothly)
world.onLocalMove(cb)                 // cb({x,y,z,ry,anim}) — throttled ≤10Hz, only on change
world.setInputEnabled(on)             // false while a text input has focus (WASD must not move)
world.onInteract(cb)                  // cb(i) when player presses E / taps a prompt. i is one of:
                                      //   {type:'seat', seat}  {type:'shopChair', chairId}  {type:'block', blockId}  {type:'stand'}
                                      //   ('stand' = local seated player pressed Space/jump)
world.setPromptResolver(fn)           // fn(i) → { text:'Sit', key:'E', enabled:true } | null (null hides prompt)
world.setBubble(id, bubble|null)      // bubble: { text, highlight: n trailing letters green, tone:'normal'|'good'|'bad' }
world.setChatBubble(id, text)         // Roblox bubble chat, auto-fades ~6s
world.setLetterTile(id, letters|null) // big white tile with black letters above head (current typer's prompt)
world.setPlayerStatus(id, { turn, out, hearts })  // turn: glow ring/arrow; out: greyed + "OUT" tag + dizzy
world.playEffect(id, kind)            // 'correct' | 'wrong' | 'heart' | 'eliminated' (launch into air, spin, land back) | 'win' (confetti + cheer) | 'hatch'
world.setShopState({ ownedChairs:[ids], equippedChair })   // shop row labels: price / Owned / Equipped
world.setLeaderboard(rows)            // [{name, wins}] shown on the in-world "Most Wins" board
world.setCameraMode(mode)             // 'follow' | 'table' (auto 'table' when local player is seated)
world.setQuality(level)               // 'high' | 'low' (shadows/pixel ratio)
```
Seats: 8 around the table (`LAYOUT`), seat `i` at angle `i * 45°`. A seated avatar sits on its chair facing the
table center; the chair model at a seat is the seated player's `chair` style (empty seats show `wooden`).
Model conventions: models face **+Z**, origin at floor level; avatar ≈5 units tall (Roblox R6 proportions:
legs 2, torso 2×2×1, head ~1.2); chair seat top at `LAYOUT.seatHeight` (2.0); table top at 3.0.

### Cosmetics API (`public/js/world/cosmetics.js`)
```js
export function buildChair(chairId) → THREE.Group   // origin floor-center, sitter faces +Z, seat top y=2.0, footprint ≤3×3, height ≤6
export function buildPet(petId) → THREE.Group       // ≈1.2–1.6 units, origin bottom-center, faces +Z; optional group.userData.update(t, dt) for idle anim
export function buildLuckyBlock(blockId) → THREE.Group  // ≈3-unit cube with "?" on faces, origin bottom-center; optional userData.update(t, dt)
export function disposeObject(obj)                  // free geometries/materials/textures
```

## 6. Visual style

Bright, saturated, toy-like Roblox look. Grass `#5fbf3a`/`#53ad31` stud checker; sand `#e8d9a8`; water `#2f9be0`
(slightly transparent, gently animated); sky gradient `#6ec3f4 → #d5f1ff` with blocky/puffy white clouds; wood
`#9a6a3f`. Soft sun shadows. UI: Fredoka 600/700, white text with 3–4px dark stroke (`#1b1b1b`), chunky rounded
buttons with dark outline + bottom shadow, rarity colors from `RARITIES`. Hearts `#ff3b4a`, timer ring `#2f7dff`,
mistake circles `#ff4d4d` with white ✕, highlight green `#3ddc54`.
