// Headless balance check: a simple greedy bot plays many sieges.
import { SNAPSHOT } from '../src/snapshot';
import { newGame, pickWindow, hashStr, step, build, upgrade, upgradeCost, startWave, giveTreat, canBuild, TOWERS, COLS, ROWS, type Game, type TowerKind } from '../src/game';

function coverage(g: Game, x: number, y: number, r: number) {
  let n = 0;
  for (const k of g.pathCells) { const [px, py] = k.split(',').map(Number); if (Math.hypot(px - x, py - y) <= r) n++; }
  return n;
}
function bestSpot(g: Game, kind: TowerKind) {
  let best: [number, number] | null = null, bs = -1;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!canBuild(g, x, y)) continue;
    const s = coverage(g, x, y, TOWERS[kind].range) + (x / COLS) * 0.5;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  return best;
}
function play(label: string, skill: number) {
  const g = newGame(pickWindow(SNAPSHOT, hashStr(label)), label);
  const plan: TowerKind[] = ['spitter', 'spitter', 'cannon', 'spitter', 'fog', 'coil', 'cannon', 'spitter', 'coil', 'cannon', 'fog', 'coil', 'cannon', 'coil'];
  let pi = 0, t = 0;
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 3600) {
    // act a few times per second
    if (Math.floor(t * 2) !== Math.floor((t + 1 / 60) * 2)) {
      const k = plan[pi % plan.length];
      if (g.seeds >= TOWERS[k].cost * (1 + (1 - skill))) { const s = bestSpot(g, k); if (s && build(g, k, s[0], s[1])) pi++; }
      else if (skill > 0.5 && pi > 6) { const tw = g.towers.find((x) => upgradeCost(x) !== null && g.seeds >= upgradeCost(x)! + 40); if (tw) upgrade(g, tw); }
      if (skill > 0.7 && g.power < 8 && g.phase === 'wave' && g.seeds > 60) giveTreat(g);
      if (g.phase === 'build' && g.buildTimer < 20) startWave(g);
    }
    step(g, 1 / 60); t += 1 / 60;
  }
  return { wave: g.waveIndex, phase: g.phase, lives: g.lives, score: g.score, brown: g.stats.brownouts, towers: g.towers.length };
}
for (const skill of [0.3, 0.6, 0.9]) {
  const res = [] as ReturnType<typeof play>[];
  for (let d = 1; d <= 12; d++) res.push(play(`daily-${d}`, skill));
  const wins = res.filter((r) => r.phase === 'won').length;
  console.log(`skill ${skill}: wins ${wins}/12, waves reached`, res.map((r) => r.wave + (r.phase === 'won' ? '✓' : '')).join(' '), '| lives', res.map((r) => r.lives).join(','), '| brownouts', res.map(r=>r.brown).join(','));
}
