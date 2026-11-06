# Squeek Siege

A tower defense game where the waves come from the real hamster running Squeekchain.

Rust mites want to jam Squeektoshi's wheel. You build towers beside the path with seeds; the towers burn **wheel power**, and the wheel turns at the pace the hamster really ran.

## How Squeekchain drives the game

| In the game | Comes from |
|---|---|
| Each wave | One real SqueekCore settlement on Sepolia with wheel work, read from `GET /v1/events` (`system.settlement_completed`). The wave card links its transaction. |
| Wave size | The round's accepted wheel passages (`workAdded`) |
| Which bugs come, and in what order | Bytes of that settlement's transaction hash |
| Wheel power during a wave | The round's real pace (`work / 600 s`, sped up 5×), ticking with the jitter of the measured passage gaps |
| Overdrive (1.5× power) | `GET /v1/status`: the WHEELY9000 reports `ACTIVE` and a non-zero RPM, i.e. Squeektoshi is running right now |
| Daily siege | The same 15 consecutive real rounds and map for everyone each UTC day |

The game is read-only: no wallet, no keys, no transactions. If the API can't be reached it falls back to a bundled snapshot of real settlements (`src/snapshot.ts`).

## Play

- `1`–`4` pick a tower, click to build, click a tower to upgrade/sell
- `Space` start the next wave early (pays a seed bonus)
- `T` give a treat: 6 s of zoomies, 2.5× wheel power
- `F` speed, `P` pause, right-click cancel

## Develop

```bash
npm install
npm run dev        # http://localhost:5181
npm run build
npx tsx scripts/sim.ts   # headless balance check with a greedy bot
```

Vite + TypeScript, canvas 2D, no runtime dependencies.
