# Word Tide — build plan

September 30, 2026. Implemented after the owner authorized the build. This document preserves
the design plan; `docs/SPEC.md` records the resulting behavior. The owner also authorized finishing
and updating GitHub.
Confirmed requirements are distinguished below from implementation defaults proposed by this plan.

## Confirmed direction

- A game mode in the existing game, like Last Sip; preserve the other modes.
- A destructive tsunami shakes the screen and flattens the island. Dirt piles remain;
  recognizable blocks and card crates float randomly offshore.
- A later flood raises the water. Each player has a separate platform in a circular,
  Hunger Games-style arena and must build upward to avoid drowning.
- Long category answers earn height. Answers appear above players after the round ends.
  Each letter becomes one block, built sequentially with exaggerated cartoon pops.
  Typing must never build the tower early.
- Very tropical, very dramatic. Earlier brainstorming specifies five hearts and storm effects.

## Visual direction

A tropical paradise becomes a flooded tropical ruin. Warm sand, turquoise shallows, deep teal
ocean, palms, lush greens, coral-colored accents and sunset gold remain visible beneath a storm.
Use charcoal-blue storm clouds, violet lightning and bright white foam for contrast. Avoid a
uniform dark gray scene: players, letters, hearts and waterline must remain readable.

Preserve the existing toy-like, studded world. Platforms have chunky stone bases, wood/bamboo
trim, colored player markings and small tropical ornaments. Letter blocks use a player's accent
color with pale readable letters on several sides. Distant broken palms, floating leaves,
logs, dirt clumps and recognizable crates tell the destruction story. Keep debris away from
answer text and input. Rain is atmosphere, not a screen-covering curtain.

Arrange up to eight participant platforms around the former table site, facing inward.
Keep the local player prominent and several opponents visible. Empty platforms stay low or
submerged. Spectators use a safe overlook/camera view; late joiners spectate until next match.
The public room can retain its larger room population without requiring 40 active towers.

## Mode entry and opening cinematic

Select Word Tide through the mode picker. Selection shows tropical preview/rules; the destructive
cinematic begins at match start, following the Last Sip lifecycle. Proposed duration: 18 seconds.

| Time | Picture | Sound and camera |
| --- | --- | --- |
| 0–3s | Palm fronds shake. Clouds mass. The sea unnaturally retreats, exposing seabed. | Birds scatter, music drops out, deep rumble and light shake. |
| 3–6s | A huge turquoise wall curls across the horizon; its crest catches lightning. | Wide camera turn, growing ocean roar, one distant thunder crack. |
| 6–9s | Wave hits the shore and sweeps through the familiar island. Props tumble into spray. | Short strong impact shake; foam briefly fills the frame. |
| 9–12s | Foam clears: flattened ground, dirt piles, broken palms, card crates and blocks offshore. | Pull back over the wreckage; muffled sound opens into rain and sea. |
| 12–15s | Eight separate arena platforms thrust upward; players appear on their assigned tops. | Stone/wood impacts, dramatic music pulse, camera circles the arena. |
| 15–18s | A second surge washes over the flattened land and establishes the starting waterline. | Camera settles at the local tower; title: WORD TIDE. Then: Longer answers. Higher towers. Survive. |

The spray conceals the intact-to-ruined terrain swap. Only cinematic debris needs to fly;
do not simulate destruction of every mesh. Stage wave direction to fit the current island.
Spectators see the cinematic too. The server owns its start/end time. Reconnecting clients
join the current phase rather than restarting the intro. Input time begins after the cinematic.
Provide reduced shake/flashes using the existing settings pattern and platform preferences.

## Proposed playable rules

These are build defaults to use unless the owner changes them; they are not claims about the
reference games. Target roughly 4–6 minutes, with a hard limit of 12 rounds.

1. Start with five hearts and two letter-block units of clearance above the initial waterline.
2. All living players receive the same category and 20 seconds. Each chooses one answer and
   can replace it until the deadline. Validity feedback is private; opponents cannot see text.
3. At the deadline the server locks the latest valid submitted answer. No answer earns zero.
   A later invalid attempt does not silently erase a previously accepted answer; show which
   answer is currently locked in. No partial-word points.
4. Reveal the full answer above each player and build all towers simultaneously over 3 seconds.
   One alphabetic letter earns one block unit; spaces and punctuation earn no height.
   Multiword answers are allowed only where explicitly supported by the category bank.
5. Show INCOMING WAVE and its rise for 1 second, then raise the water over 2 seconds.
6. Resolve safety once after the flood. A platform top at/below the new waterline loses one
   heart. Show a brief cartoon dunk and rescue lift. No continuous heart drain while typing.
7. If a player has hearts left, a visibly distinct rescue section lifts their platform to two
   units above the water. Rescue height is not answer score. This prevents permanent drowning.
   The next wave can cost another heart if their next answer is too short.
8. Zero hearts eliminates the player: their tower cracks/collapses, the avatar splashes into
   the sea and switches to spectating. Keep the effect cartoonish and brief.
9. Last survivor wins. If everyone remaining reaches zero together, compare hearts immediately
   before that flood, then earned letter score. A remaining exact tie is a shared win.
   At round 12, compare remaining hearts, then earned letter score, with shared exact ties.

Duplicate answers from different players are allowed. Avoid repeating categories in a match.
Do not add an extra height bonus for longest answer in the initial build: its length already
provides the advantage. Instead give a golden overhead LONGEST ANSWER flourish, shared on ties.
Pets and consumable card effects remain inactive in Word Tide's first version; show that clearly
in the rules. Ordinary cosmetics remain equipped. No entry stakes or paid extra height.

### Water pacing

Each curated category carries a reference competitive answer length L, based on several common,
valid answers, rather than its single most obscure maximum. Proposed flood rise in block units:
rounds 1–3: ceil(0.65 L); rounds 4–6: ceil(0.85 L); rounds 7–9: ceil(1.05 L);
rounds 10–12: ceil(1.20 L). Minimum rise is three units. Explain the upcoming rise in the HUD
from the start of the answering phase. These values need playtesting before release.

Visual wave direction, thunder, drifting wreckage and occasional larger distant breakers vary
on a shared seed. Actual damaging floods follow the round schedule. Atmospheric waves can arrive
between rounds without surprise damage. Camera framing follows tower/water height as both rise.

## Letter construction and player camera

Blocks emerge beneath the platform, in answer order from bottom to top. Each starts small,
slightly rotated, expands past full size, then settles with a squash/bounce and small puff.
The player rides the platform smoothly upward with a subtle hop, rather than teleporting per letter.
Use staggered pops over the fixed three-second reveal; long answers use tighter spacing.
Raise pop pitch through a short musical scale, limit simultaneous sounds, and end with a chime.
Do not shake the camera on every block. Reserve major shake for tsunami/flood impacts.

Keep the entire current answer overhead through the reveal and briefly through the flood.
During typing show category, countdown, five-heart status, locked answer and next water rise.
No opponent answer leaks through avatars, chat typing, network match views or progress meters.
Mobile gets a generous input area and camera that keeps the platform visible above the keyboard.
Letters can remain on older blocks, but overhead text shows the latest answer only.

## Answer bank and references

Reference games:
- https://www.roblox.com/games/4162410081/Longest-Answer-Wins
- https://www.roblox.com/games/11238892040/Type-or-Die

Owner-supplied guides:
- https://www.scribd.com/document/627530758/Longest-Answer-Wins-Answer-KEY
- https://www.scribd.com/document/720579097/Type-or-die

Both guides were readable during research. No bank has been imported. Build an original bank,
using these for genre/category inspiration rather than bulk copying their compilation.
The Type or Die guide has misspellings and questionable matches; verify factual answers.
The reference game pages confirm longest-answer/rising-lava survival and Type or Die tower
building. Exact animations have not yet been verified through gameplay footage.

Initial target: 60 curated categories with at least 10 accepted answers each where appropriate,
balanced across familiar animals, foods, household objects, places, sports, nature and everyday
activities. Avoid categories with inherently tiny answer sets in the first release. Each entry
has id, prompt, difficulty, canonical answers, accepted aliases, display spelling, score spelling,
reference length and factual provenance where needed. Do not force tropical questions every round;
the setting is tropical, while categories remain varied.

Normalize case, surrounding whitespace and supported punctuation. Score the recognized submitted
form, not an expanded alias: a short alias must not earn the long canonical name's height.
Explicitly list accepted variants; do not allow arbitrary adjective padding. Share normal game
filtering policy. Server bank determines validity and score; a plain English dictionary alone
cannot decide whether something belongs to the requested category.

## Assets and scene construction

Reuse existing island trees, table-area props, blocks and card crates so wreckage is recognizable.
Create original platforms, studded letter cubes, dirt piles and wave meshes in Three.js.
The wave uses an animated curved surface plus a bright foam crest, trailing white patches and
pooled spray particles. Make the tsunami large enough to dominate the horizon and cross the
island, rather than a scaled-up flat water plane. Rain, cloud layers, lightning and debris bobbing
are animated effects. Avoid full fluid simulation.

Extra logs, rocks and vegetation: Kenney Nature Kit, https://kenney.nl/assets/nature-kit
(330 assets, CC0). Backup: Quaternius Ultimate Nature Pack,
https://quaternius.com/packs/ultimatenature.html (150 assets, CC0, FBX/OBJ/Blend).
Choose a consistent subset, retain licenses and record actual selected model provenance.
No downloads or model selections have happened yet. Reuse licensed existing audio where suitable;
otherwise select and document sound sources during implementation. Do not assume audio exists.

## Implementation map

Inspect the current uncommitted working tree and Last Sip lifecycle before changing anything.
Preserve all recent changes; the live Worker is ahead of GitHub according to the active handoff.

- Shared: add Word Tide mode metadata/constants and an isolated category bank/rules module.
- Server: integrate cinematic, answering, reveal, flood, resolution and celebration phases with
  src/engine.js and room lifecycle. Store hearts, earned height, rescue height and last locked
  answer separately. Private answer acknowledgements include match/round/request identity.
  Server controls deadlines, validity, height, floods, elimination and settlement.
- Client: add mode picker entry, concise rules, simultaneous answer HUD and private acknowledgement
  handling through existing main/UI patterns. Avoid turn-based Finish the Word input assumptions.
- World: prefer a separate public/js/world/word-tide.js scene controller integrated through world.js.
  Reuse camera/effect/material conventions; add reversible terrain and prop visibility transitions.
- Lifecycle: prevent ordinary ground movement/travel during play; authoritative arena assignments
  survive reconnect. Existing disconnect/forfeit conventions apply without pausing every player.
  Mode exit, reset and room exit restore island, lighting, camera, controls, props and cosmetics.
- Economy: use ordinary participation/accepted-answer rewards, no WPM farming or roulette stakes.
  Proposed Word Tide total reward cap: 150 coins per player per match; resolve once using existing
  receipt conventions. Confirm compatibility with the current economy while implementing.

Build in this order: validated bank and server round loop; plain platforms and HUD; block reveal
and camera; flood/hearts/rescue; cinematic and tropical art; lifecycle/reconnect; polish and QA.
Do not deploy simply because the owner switches models; deployment requires their instruction.

## Completion checks

- Full match with at least two browsers; private answers stay private until the deadline.
- Replaced/late/replayed answers cannot add height twice or alter a locked round.
- Same valid answer across players, aliases, punctuation, invalid/empty answers and long answers work.
- All towers finish building before the water resolves damage; hearts drop at most once per flood.
- Rescue prevents permanent underwater trapping; elimination, simultaneous losses and round cap work.
- Intro visible to participants and spectators; reconnect works in every phase.
- Last Sip and Finish the Word still play normally; all scene state restores on exit/reset.
- Mobile keyboard/input, reduced shake/flashes and muted audio remain usable.
- Review screenshots/video of wave impact, wreckage, tropical storm, letter pops and flood at desktop
  and mobile sizes. Verify stable performance using pooled effects and instanced tower blocks.
- Run relevant server tests, existing suite and multiplayer browser checks. No production deployment
  or Git push as part of the planning task.
