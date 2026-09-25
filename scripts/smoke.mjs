// End-to-end smoke test against a running `wrangler dev` (npm run dev): HTTP routes, then
// two real WebSocket clients and a bot playing turns of a real match.
// Usage: npm run smoke            (SMOKE_URL=ws://host:port to target another server)
import { PROTOCOL_VERSION, makeRoomCode } from '../public/js/shared/constants.js';
import { createDictionary } from '../src/dictionary.js';
import WORDS from '../src/words.js';

const WS_BASE = (process.env.SMOKE_URL ?? 'ws://127.0.0.1:8787').replace(/\/+$/, '');
const HTTP_BASE = WS_BASE.replace(/^ws/, 'http');
const TARGET_WORDS = 8; // accepted words before the finale
const dict = createDictionary(WORDS);

function check(condition, what) {
  if (!condition) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
}

class Client {
  constructor(name, id = `smoke-${name}-${Math.random().toString(36).slice(2, 10)}`) {
    this.name = name;
    this.id = id;
    this.inbox = [];
    this.cursor = 0; // messages before this index have been consumed by next()
    this.notify = null;
  }

  connect(path) {
    this.ws = new WebSocket(`${WS_BASE}${path}`);
    this.closed = new Promise((resolve) => this.ws.addEventListener('close', resolve, { once: true }));
    this.ws.addEventListener('message', (event) => {
      this.inbox.push(JSON.parse(event.data));
      this.notify?.();
    });
    return new Promise((resolve, reject) => {
      const fail = () => reject(new Error(`${this.name}: cannot connect to ${WS_BASE} (is wrangler dev running?)`));
      const timer = setTimeout(fail, 10_000);
      this.ws.addEventListener('open', () => resolve(clearTimeout(timer)), { once: true });
      this.ws.addEventListener('error', () => fail(clearTimeout(timer)), { once: true });
    });
  }

  async join(code) {
    await this.connect(`/api/room/${code}`);
    this.send({ t: 'hello', id: this.id, name: this.name, v: PROTOCOL_VERSION, look: {}, chair: 'wooden', pet: null });
    return this.next((m) => m.t === 'welcome');
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  /** The next not-yet-consumed message passing `test` (waits for it if necessary). */
  async next(test, ms = 20_000) {
    const deadline = Date.now() + ms;
    for (;;) {
      while (this.cursor < this.inbox.length) {
        const msg = this.inbox[this.cursor++];
        if (test(msg)) return msg;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`${this.name}: timed out waiting for a message`);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, left);
        this.notify = () => resolve(clearTimeout(timer));
      });
    }
  }
}

async function http() {
  console.log(`HTTP ${HTTP_BASE}`);
  const health = await fetch(`${HTTP_BASE}/api/health`);
  check(health.status === 200 && (await health.text()) === 'ok', 'GET /api/health → 200 ok');
  const asset = await fetch(`${HTTP_BASE}/js/shared/constants.js`);
  check(asset.status === 200 && (await asset.text()).includes('PROTOCOL_VERSION'), 'GET /js/shared/constants.js → static asset');
  const plain = await fetch(`${HTTP_BASE}/api/room/ABCDE`);
  check(plain.status === 426, 'GET /api/room/ABCDE without Upgrade → 426');

  const bad = new Client('bad');
  await bad.connect('/api/room/no');
  const error = await bad.next((m) => m.t === 'error');
  check(error.code === 'bad_code', 'WebSocket to an invalid room code → error bad_code');
  check((await bad.closed).code === 1008, 'bad_code socket is closed (1008)');
}

async function game() {
  const code = makeRoomCode();
  console.log(`WebSocket ${WS_BASE}/api/room/${code}`);
  const alice = new Client('Alice');
  const bob = new Client('Bob');
  const welcome = await alice.join(code);
  check(welcome.you === alice.id && welcome.hostId === alice.id && welcome.code === code, 'Alice joins and is host');
  const bobWelcome = await bob.join(code);
  check(bobWelcome.players.length === 2 && bobWelcome.hostId === alice.id, 'Bob joins and sees Alice');

  alice.send({ t: 'ping', c: 7 });
  const pong = await alice.next((m) => m.t === 'pong');
  check(pong.c === 7 && typeof pong.s === 'number', 'ping → pong');

  alice.send({ t: 'chat', text: 'good luck, you shit' });
  const chat = await bob.next((m) => m.t === 'chat' && m.id === alice.id);
  check(chat.text === 'good luck, you ####', `chat is filtered: "${chat.text}"`);

  alice.send({ t: 'host', action: 'addBot' });
  const bot = (await bob.next((m) => m.t === 'player' && m.p.isBot)).p;
  check(bot.seat === 0, `host adds bot ${bot.name} in seat 0`);

  alice.send({ t: 'sit', seat: 1 });
  await bob.next((m) => m.t === 'player' && m.p.id === alice.id && m.p.seat === 1);
  bob.send({ t: 'sit', seat: 1 });
  check((await bob.next((m) => m.t === 'error')).code === 'seat_taken', 'Bob cannot take Alice’s seat');
  bob.send({ t: 'sit', seat: 2 });
  // Over the internet Alice's "start" could otherwise overtake Bob's "sit" and begin the match without him.
  await bob.next((m) => m.t === 'player' && m.p.id === bob.id && m.p.seat === 2);
  const countdown = await alice.next((m) => m.t === 'match' && m.m.phase === 'countdown');
  check(countdown.m.phaseEndsIn > 0, 'seated players start the countdown');
  alice.send({ t: 'host', action: 'start' });
  const choosing = await alice.next((m) => m.t === 'match' && m.m.phase === 'choosing');
  check(choosing.m.participants.map((p) => p.id).join() === [bot.id, alice.id, bob.id].join(), 'host starts: bot, Alice and Bob play');

  // Play from Alice's point of view: humans act when it is their turn, the bot plays itself.
  const humans = { [alice.id]: alice, [bob.id]: bob };
  const nameOf = (id) => (id === bot.id ? bot.name : humans[id].name);
  const used = new Set();
  const wordsBy = { [alice.id]: 0, [bob.id]: 0, [bot.id]: 0 };
  let botOut = false;
  let acted = null;
  let msg = choosing;
  for (;;) {
    if (msg.t === 'result' && msg.ok) {
      used.add(msg.word);
      wordsBy[msg.id]++;
      console.log(`      ${nameOf(msg.id)}: ${msg.word}`);
    } else if (msg.t === 'fail') {
      console.log(`      ${nameOf(msg.id)} failed (${msg.cause}), hearts ${msg.hearts}`);
      if (msg.cause === 'mistakes') {
        check(msg.hearts === 1 && !msg.shielded, 'five wrong words cost a heart');
        break;
      }
    } else if (msg.t === 'elim') {
      botOut ||= msg.id === bot.id;
    } else if (msg.t === 'match') {
      const m = msg.m;
      const turn = `${m.phase}:${m.round}:${m.wordCount}`;
      if (m.phase === 'choosing' && humans[m.chooserId] && acted !== turn) {
        acted = turn;
        humans[m.chooserId].send({ t: 'pick', letter: m.options[0] });
      } else if (m.phase === 'typing' && humans[m.typerId] && acted !== turn) {
        acted = turn;
        const typer = humans[m.typerId];
        const total = Object.values(wordsBy).reduce((a, b) => a + b, 0);
        if (total >= TARGET_WORDS && (wordsBy[bot.id] >= 2 || botOut)) {
          for (const suffix of 'abcde') typer.send({ t: 'submit', word: `${m.prefix}qzx${suffix}` });
        } else {
          const word = dict.randomWithPrefix(m.prefix, used);
          typer.send({ t: 'typing', text: word.slice(0, 2) });
          typer.send({ t: 'submit', word });
        }
      }
    }
    msg = await alice.next((m) => ['match', 'result', 'fail', 'elim'].includes(m.t), 30_000);
  }

  check(wordsBy[alice.id] >= 1 && wordsBy[bob.id] >= 1, 'both humans played valid words');
  check(wordsBy[bot.id] >= 1, `the bot played ${wordsBy[bot.id]} words on its own`);
  check(bob.inbox.some((m) => m.t === 'typing' && m.id === bot.id), 'the bot typed progressively');
  check(bob.inbox.some((m) => m.t === 'typing' && m.id === alice.id) || alice.inbox.some((m) => m.t === 'typing' && m.id === bob.id), 'live typing is relayed');
  check(!alice.inbox.some((m) => m.t === 'typing' && m.id === alice.id), 'typing is never echoed to the typer');

  // Same id from a new socket takes over; the old socket is closed with 4000.
  const alice2 = new Client('Alice', alice.id);
  const resumed = await alice2.join(code);
  check(resumed.you === alice.id && resumed.match.participants.length === 3, 'Alice resumes from a second socket');
  check((await alice.closed).code === 4000, 'the replaced socket is closed with 4000');

  alice2.ws.close();
  bob.ws.close();
}

try {
  await http();
  await game();
  console.log('SMOKE OK');
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
