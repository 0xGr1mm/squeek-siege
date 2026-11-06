// Squeek Siege — game state and simulation. No rendering here.
import type { Round } from './data';

export const COLS = 22;
export const ROWS = 13;
export const WAVES_PER_SIEGE = 15;

// ---------- seeded randomness ----------
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const txBytes = (tx: string) => {
  const hex = tx.replace(/^0x/, '').padEnd(64, '0');
  const out: number[] = [];
  for (let i = 0; i < 64; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16) || 0);
  return out;
};

// ---------- definitions ----------
export type TowerKind = 'spitter' | 'cannon' | 'coil' | 'fog';
export type EnemyKind = 'mite' | 'zip' | 'beetle' | 'jammer';

export interface TowerDef {
  kind: TowerKind;
  name: string;
  blurb: string;
  cost: number;
  upgrade: [number, number];
  range: number; // cells
  dmg: number;
  rate: number; // shots per second
  power: number; // power per shot (fog: per second)
  color: string;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  spitter: { kind: 'spitter', name: 'Seed Spitter', blurb: 'Cheap, quick, single target.', cost: 50, upgrade: [55, 100], range: 2.5, dmg: 7, rate: 1.8, power: 0.25, color: '#f5c451' },
  cannon: { kind: 'cannon', name: 'Cheek Cannon', blurb: 'Lobs stuffed cheeks. Splash damage.', cost: 110, upgrade: [100, 170], range: 2.4, dmg: 20, rate: 0.55, power: 1.2, color: '#ff8a4c' },
  coil: { kind: 'coil', name: 'Whisker Coil', blurb: 'Chain zap, pierces armor. Power hungry.', cost: 150, upgrade: [130, 210], range: 2.2, dmg: 13, rate: 0.9, power: 1.6, color: '#7fd4ff' },
  fog: { kind: 'fog', name: 'Nap Fog', blurb: 'Makes everything nearby sleepy and slow.', cost: 80, upgrade: [70, 120], range: 1.7, dmg: 0, rate: 0, power: 0.3, color: '#b79cff' },
};
export const TOWER_ORDER: TowerKind[] = ['spitter', 'cannon', 'coil', 'fog'];

interface EnemyDef { hp: number; speed: number; armor: number; reward: number; lives: number; color: string; size: number }
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  mite: { hp: 22, speed: 1.5, armor: 0, reward: 3, lives: 1, color: '#e0773d', size: 1 },
  zip: { hp: 13, speed: 2.8, armor: 0, reward: 3, lives: 1, color: '#ff4fd8', size: 0.85 },
  beetle: { hp: 75, speed: 0.95, armor: 3, reward: 8, lives: 2, color: '#9bd65a', size: 1.2 },
  jammer: { hp: 520, speed: 0.6, armor: 4, reward: 60, lives: 10, color: '#ff4b5c', size: 2 },
};

// ---------- entities ----------
export interface Enemy {
  id: number; kind: EnemyKind; hp: number; maxHp: number; speed: number; armor: number;
  d: number; x: number; y: number; slow: number; alive: boolean; hitFlash: number; wobble: number;
}
export interface Tower {
  id: number; kind: TowerKind; level: number; cx: number; cy: number; cool: number; spent: number; aim: number; kick: number; kills: number;
}
export interface Shot { x: number; y: number; from: number; target: number; dmg: number; speed: number; splash: number; color: string; alive: boolean }
export interface Fx { kind: 'zap' | 'ring' | 'dot' | 'text'; x: number; y: number; x2?: number; y2?: number; t: number; ttl: number; color: string; text?: string; vx?: number; vy?: number; r?: number }

export interface WavePlan { index: number; round: Round; spawns: { kind: EnemyKind; at: number }[]; boss: boolean; tag: 'nap-ish' | 'jog' | 'zoomies' }

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export interface Game {
  seedLabel: string;
  path: { x: number; y: number }[]; // polyline in cell coordinates (cell centers)
  pathLen: number;
  segLens: number[];
  pathCells: Set<string>;
  wheel: { cx: number; cy: number }; // top-left cell of the 2x2 wheel
  blocked: Set<string>;
  waves: WavePlan[];
  waveIndex: number; // index of the current/next wave
  phase: Phase;
  phaseT: number; // time in phase
  buildTimer: number; // auto-start countdown
  spawnQueue: { kind: EnemyKind; at: number }[];
  enemies: Enemy[];
  towers: Tower[];
  shots: Shot[];
  fx: Fx[];
  seeds: number;
  lives: number;
  maxLives: number;
  power: number;
  maxPower: number;
  wheelAngle: number;
  wheelSpin: number; // visual angular velocity
  tickTimer: number;
  treat: number; // seconds of treat left
  overdrive: boolean; // Squeektoshi is running right now
  liveRpm: number;
  score: number;
  kills: number;
  leaks: number;
  waveLeaks: number;
  time: number;
  nextId: number;
  rand: () => number;
  stats: { powerMade: number; brownouts: number };
}

const key = (x: number, y: number) => `${x},${y}`;

// ---------- map ----------
function buildPath(r: () => number) {
  const startY = 2 + Math.floor(r() * (ROWS - 4));
  const pts: { x: number; y: number }[] = [{ x: -1, y: startY }];
  let x = 0;
  let y = startY;
  const endX = COLS - 3;
  while (x < endX - 2) {
    const step = 3 + Math.floor(r() * 3);
    x = Math.min(endX - 2, x + step);
    pts.push({ x, y });
    let ny = y;
    for (let tries = 0; tries < 10 && Math.abs(ny - y) < 2; tries++) ny = 1 + Math.floor(r() * (ROWS - 2));
    y = ny;
    pts.push({ x, y });
  }
  // final approach must have room for the 2x2 wheel (rows y-1..y)
  y = Math.max(1, Math.min(ROWS - 1, y));
  pts.push({ x: endX, y });
  const cells = new Set<string>();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    let cx = a.x, cy = a.y;
    while (cx !== b.x || cy !== b.y) {
      if (cx >= 0) cells.add(key(cx, cy));
      cx += dx; cy += dy;
    }
    cells.add(key(b.x, b.y));
  }
  // continuous cell space: cell (i, j) spans [i, i+1], so centres sit at +0.5
  const centred = pts.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  // walk into the middle of the 2x2 wheel
  centred.push({ x: COLS - 1, y });
  return { pts: centred, cells, wheel: { cx: COLS - 2, cy: y - 1 } };
}

// ---------- waves from real rounds ----------
export function planWaves(rounds: Round[]): WavePlan[] {
  return rounds.map((round, i) => {
    const b = txBytes(round.tx);
    const r = rng(hashStr(round.tx));
    const work = round.work;
    // early waves are gentle; the round's real work matters more as the siege goes on
    const budget = Math.round(8 + work * (0.03 + 0.005 * i) + i * 6);
    const wMite = 3 + (b[0] % 4);
    const wZip = i >= 2 ? 1 + (b[1] % 4) : 0;
    const wBeetle = i >= 3 ? b[2] % 4 : 0;
    const cost: Record<EnemyKind, number> = { mite: 2, zip: 2, beetle: 5, jammer: 0 };
    const spawns: { kind: EnemyKind; at: number }[] = [];
    let left = budget;
    let t = 0;
    const total = wMite + wZip + wBeetle;
    let streak: EnemyKind = 'mite';
    while (left > 1) {
      // clumps: keep the same kind for a little while, like bursts of wheel activity
      if (spawns.length === 0 || r() < 0.3) {
        const p = r() * total;
        streak = p < wMite ? 'mite' : p < wMite + wZip ? 'zip' : 'beetle';
      }
      if (cost[streak] > left) streak = 'mite';
      spawns.push({ kind: streak, at: t });
      left -= cost[streak];
      t += streak === 'zip' ? 0.32 : streak === 'beetle' ? 0.9 : 0.55;
      if (r() < 0.08) t += 1.2; // breather
    }
    const last = i === rounds.length - 1;
    const boss = (work >= 440 && i >= 6) || last;
    if (boss) spawns.push({ kind: 'jammer', at: t + 1.5 });
    const tag: WavePlan['tag'] = work >= 440 ? 'zoomies' : work >= 150 ? 'jog' : 'nap-ish';
    return { index: i, round, spawns, boss, tag };
  });
}

export function pickWindow(all: Round[], seed: number, n = WAVES_PER_SIEGE): Round[] {
  if (all.length <= n) return all.slice();
  const start = seed % (all.length - n + 1);
  return all.slice(start, start + n);
}

export function newGame(rounds: Round[], seedLabel: string): Game {
  const seed = hashStr(seedLabel + ':' + (rounds[0]?.tx ?? ''));
  const r = rng(seed);
  const { pts, cells, wheel } = buildPath(r);
  const segLens: number[] = [];
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(l);
    pathLen += l;
  }
  const blocked = new Set<string>();
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) blocked.add(key(wheel.cx + dx, wheel.cy + dy));
  // a few sunflower-seed crates (pure decoration, block building)
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * (COLS - 3)), y = Math.floor(r() * ROWS);
    if (!cells.has(key(x, y))) blocked.add(key(x, y));
  }
  return {
    seedLabel, path: pts, pathLen, segLens, pathCells: cells, wheel, blocked,
    waves: planWaves(rounds), waveIndex: 0, phase: 'build', phaseT: 0, buildTimer: 45,
    spawnQueue: [], enemies: [], towers: [], shots: [], fx: [],
    seeds: 170, lives: 20, maxLives: 20, power: 40, maxPower: 100,
    wheelAngle: 0, wheelSpin: 0, tickTimer: 0.5, treat: 0, overdrive: false, liveRpm: 0,
    score: 0, kills: 0, leaks: 0, waveLeaks: 0, time: 0, nextId: 1, rand: r,
    stats: { powerMade: 0, brownouts: 0 },
  };
}

export function pointAt(g: Game, d: number) {
  let rem = Math.max(0, d);
  for (let i = 0; i < g.segLens.length; i++) {
    const l = g.segLens[i];
    if (rem <= l) {
      const a = g.path[i], b = g.path[i + 1];
      const t = l === 0 ? 0 : rem / l;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    rem -= l;
  }
  return { ...g.path[g.path.length - 1] };
}

// ---------- tower stats ----------
export function towerStats(t: { kind: TowerKind; level: number }) {
  const d = TOWERS[t.kind];
  const lv = t.level - 1;
  return {
    range: d.range + lv * 0.3,
    dmg: d.dmg * Math.pow(1.65, lv),
    rate: d.rate * (1 + lv * 0.12),
    power: d.power * (1 + lv * 0.35),
    chains: 3 + lv,
    slow: 0.35 + lv * 0.1,
    splash: 0.95 + lv * 0.15,
  };
}

export function canBuild(g: Game, cx: number, cy: number) {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
  const k = key(cx, cy);
  if (g.pathCells.has(k) || g.blocked.has(k)) return false;
  return !g.towers.some((t) => t.cx === cx && t.cy === cy);
}

export function build(g: Game, kind: TowerKind, cx: number, cy: number): boolean {
  const cost = TOWERS[kind].cost;
  if (g.seeds < cost || !canBuild(g, cx, cy) || g.phase === 'won' || g.phase === 'lost') return false;
  g.seeds -= cost;
  g.towers.push({ id: g.nextId++, kind, level: 1, cx, cy, cool: 0.2, spent: cost, aim: 0, kick: 0, kills: 0 });
  ring(g, cx + 0.5, cy + 0.5, TOWERS[kind].color, 0.9);
  return true;
}

export function upgradeCost(t: Tower) {
  return t.level >= 3 ? null : TOWERS[t.kind].upgrade[t.level - 1];
}
export function upgrade(g: Game, t: Tower): boolean {
  const c = upgradeCost(t);
  if (c === null || g.seeds < c) return false;
  g.seeds -= c;
  t.spent += c;
  t.level++;
  ring(g, t.cx + 0.5, t.cy + 0.5, '#ffffff', 1.1);
  return true;
}
export const sellValue = (t: Tower) => Math.floor(t.spent * 0.7);
export function sell(g: Game, t: Tower) {
  g.seeds += sellValue(t);
  g.towers = g.towers.filter((x) => x !== t);
  float(g, t.cx + 0.5, t.cy + 0.3, `+${sellValue(t)}`, '#f5c451');
}

// ---------- the hamster ----------
export const TREAT_COST = 20;
export function giveTreat(g: Game): boolean {
  if (g.seeds < TREAT_COST || g.treat > 0 || g.phase === 'won' || g.phase === 'lost') return false;
  g.seeds -= TREAT_COST;
  g.treat = 6;
  float(g, g.wheel.cx + 1, g.wheel.cy - 0.2, 'ZOOMIES!', '#f5c451');
  return true;
}

/** Wheel passages per second right now. During a wave it follows that round's real work (work / 600 s), sped up 5x. */
export function wheelRate(g: Game) {
  let rate: number;
  if (g.phase === 'wave') {
    const w = g.waves[g.waveIndex]?.round.work ?? 100;
    rate = Math.max(0.45, (w / 600) * 5);
  } else rate = 0.7;
  if (g.overdrive) rate *= 1.5;
  if (g.treat > 0) rate *= 2.5;
  return rate;
}

function wheelTick(g: Game) {
  const gain = 1;
  g.power = Math.min(g.maxPower, g.power + gain);
  g.stats.powerMade += gain;
  g.wheelSpin += 0.9;
  if (g.rand() < 0.35) {
    const wx = g.wheel.cx + 1, wy = g.wheel.cy + 1;
    g.fx.push({ kind: 'dot', x: wx + (g.rand() - 0.5), y: wy - 0.6, vx: (g.rand() - 0.5) * 0.6, vy: -1.2, t: 0, ttl: 0.7, color: '#7fd4ff' });
  }
}

// ---------- fx helpers ----------
function ring(g: Game, x: number, y: number, color: string, r: number) {
  g.fx.push({ kind: 'ring', x, y, t: 0, ttl: 0.45, color, r });
}
function float(g: Game, x: number, y: number, text: string, color: string) {
  g.fx.push({ kind: 'text', x, y, t: 0, ttl: 1, color, text, vy: -0.8 });
}
function burst(g: Game, x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = g.rand() * Math.PI * 2, s = 0.8 + g.rand() * 2.2;
    g.fx.push({ kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, ttl: 0.35 + g.rand() * 0.35, color });
  }
}

// ---------- flow ----------
export function startWave(g: Game) {
  if (g.phase !== 'build') return;
  const w = g.waves[g.waveIndex];
  if (!w) return;
  // calling early pays a little
  const early = Math.floor(Math.max(0, g.buildTimer) * 0.6);
  if (early > 0 && g.waveIndex > 0) {
    g.seeds += early;
    float(g, g.path[1].x, g.path[1].y - 0.5, `early +${early}`, '#f5c451');
  }
  g.phase = 'wave';
  g.phaseT = 0;
  g.waveLeaks = 0;
  g.spawnQueue = w.spawns.map((s) => ({ ...s }));
}

function spawn(g: Game, kind: EnemyKind) {
  const def = ENEMIES[kind];
  const i = g.waveIndex;
  const hpMult = 1 + 0.12 * i + 0.011 * i * i;
  const p = pointAt(g, 0);
  g.enemies.push({
    id: g.nextId++, kind, hp: def.hp * hpMult, maxHp: def.hp * hpMult, speed: def.speed, armor: def.armor,
    d: 0, x: p.x, y: p.y, slow: 0, alive: true, hitFlash: 0, wobble: g.rand() * 6,
  });
}

function damage(g: Game, e: Enemy, amount: number, pierce = false, src?: Tower) {
  if (!e.alive) return;
  const dealt = Math.max(amount * 0.25, amount - (pierce ? 0 : e.armor));
  e.hp -= dealt;
  e.hitFlash = 0.08;
  if (e.hp <= 0) {
    e.alive = false;
    const def = ENEMIES[e.kind];
    g.seeds += def.reward;
    g.score += def.reward * 10;
    g.kills++;
    if (src) src.kills++;
    burst(g, e.x, e.y, def.color, e.kind === 'jammer' ? 40 : 10);
    if (e.kind === 'jammer') float(g, e.x, e.y - 0.6, 'JAMMER DOWN', '#ff4b5c');
  }
}

export function step(g: Game, dt: number) {
  if (g.phase === 'won' || g.phase === 'lost') {
    updateFx(g, dt);
    return;
  }
  g.time += dt;
  g.phaseT += dt;
  if (g.treat > 0) g.treat = Math.max(0, g.treat - dt);

  // wheel: real cadence with a little jitter, like the measured gaps (p10 0.9 s, p90 1.4 s)
  g.tickTimer -= dt;
  while (g.tickTimer <= 0) {
    wheelTick(g);
    g.tickTimer += (1 / wheelRate(g)) * (0.85 + g.rand() * 0.45);
  }
  g.wheelSpin *= Math.pow(0.05, dt);
  g.wheelAngle += g.wheelSpin * dt * 2.2;

  if (g.phase === 'build') {
    g.buildTimer -= dt;
    if (g.buildTimer <= 0) startWave(g);
  }

  // spawns
  if (g.phase === 'wave') {
    while (g.spawnQueue.length && g.spawnQueue[0].at <= g.phaseT) spawn(g, g.spawnQueue.shift()!.kind);
  }

  // enemies: slow from fog
  for (const e of g.enemies) e.slow = 0;
  for (const t of g.towers) {
    if (t.kind !== 'fog') continue;
    const s = towerStats(t);
    const need = s.power * dt;
    if (g.power < need) continue; // fog goes dark without power
    let any = false;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - (t.cx + 0.5), e.y - (t.cy + 0.5)) <= s.range) {
        e.slow = Math.max(e.slow, e.kind === 'jammer' ? s.slow * 0.5 : s.slow);
        any = true;
      }
    }
    if (any) g.power -= need;
  }
  for (const e of g.enemies) {
    if (!e.alive) continue;
    e.d += e.speed * (1 - e.slow) * dt;
    const p = pointAt(g, e.d);
    e.x = p.x; e.y = p.y;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.d >= g.pathLen) {
      e.alive = false;
      const lost = ENEMIES[e.kind].lives;
      g.lives -= lost;
      g.leaks += lost;
      g.waveLeaks += lost;
      burst(g, e.x, e.y, '#ff4b5c', 14);
      float(g, g.wheel.cx + 1, g.wheel.cy, `-${lost}`, '#ff4b5c');
    }
  }

  // towers
  for (const t of g.towers) {
    if (t.kick > 0) t.kick = Math.max(0, t.kick - dt * 5);
    if (t.kind === 'fog') continue;
    const s = towerStats(t);
    t.cool -= dt;
    if (t.cool > 0) continue;
    const cx = t.cx + 0.5, cy = t.cy + 0.5;
    let target: Enemy | null = null;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - cx, e.y - cy) > s.range) continue;
      if (!target || e.d > target.d) target = e;
    }
    if (!target) { t.cool = 0.05; continue; }
    const powered = g.power >= s.power;
    if (powered) g.power -= s.power;
    else g.stats.brownouts++;
    t.cool = (1 / s.rate) * (powered ? 1 : 3.5);
    t.aim = Math.atan2(target.y - cy, target.x - cx);
    t.kick = 1;
    const dmg = powered ? s.dmg : s.dmg * 0.6;
    if (t.kind === 'spitter') {
      g.shots.push({ x: cx, y: cy, from: t.id, target: target.id, dmg, speed: 11, splash: 0, color: TOWERS.spitter.color, alive: true });
    } else if (t.kind === 'cannon') {
      g.shots.push({ x: cx, y: cy, from: t.id, target: target.id, dmg, speed: 6.5, splash: s.splash, color: TOWERS.cannon.color, alive: true });
    } else if (t.kind === 'coil') {
      let from = { x: cx, y: cy };
      const hit = new Set<number>();
      let cur: Enemy | null = target;
      for (let c = 0; c < s.chains && cur; c++) {
        g.fx.push({ kind: 'zap', x: from.x, y: from.y, x2: cur.x, y2: cur.y, t: 0, ttl: 0.16, color: TOWERS.coil.color });
        damage(g, cur, dmg * Math.pow(0.8, c), true, t);
        hit.add(cur.id);
        from = { x: cur.x, y: cur.y };
        let next: Enemy | null = null, best = 1.8;
        for (const e of g.enemies) {
          if (!e.alive || hit.has(e.id)) continue;
          const dd = Math.hypot(e.x - from.x, e.y - from.y);
          if (dd < best) { best = dd; next = e; }
        }
        cur = next;
      }
    }
  }

  // shots
  for (const s of g.shots) {
    if (!s.alive) continue;
    const tgt = g.enemies.find((e) => e.id === s.target && e.alive);
    if (!tgt) { s.alive = false; continue; }
    const dx = tgt.x - s.x, dy = tgt.y - s.y, dist = Math.hypot(dx, dy);
    const mv = s.speed * dt;
    if (dist <= mv + 0.05) {
      s.alive = false;
      const src = g.towers.find((t) => t.id === s.from);
      if (s.splash > 0) {
        ring(g, tgt.x, tgt.y, s.color, s.splash);
        for (const e of g.enemies) if (e.alive && Math.hypot(e.x - tgt.x, e.y - tgt.y) <= s.splash) damage(g, e, e === tgt ? s.dmg : s.dmg * 0.6, false, src);
      } else damage(g, tgt, s.dmg, false, src);
    } else {
      s.x += (dx / dist) * mv;
      s.y += (dy / dist) * mv;
    }
  }
  g.shots = g.shots.filter((s) => s.alive);
  g.enemies = g.enemies.filter((e) => e.alive);

  updateFx(g, dt);

  // end conditions
  if (g.lives <= 0) {
    g.lives = 0;
    g.phase = 'lost';
    return;
  }
  if (g.phase === 'wave' && g.spawnQueue.length === 0 && g.enemies.length === 0) {
    const bonus = 25 + g.waveIndex * 3;
    const perfect = g.waveLeaks === 0;
    g.seeds += bonus;
    g.score += perfect ? 300 : 100;
    g.waveIndex++;
    if (g.waveIndex >= g.waves.length) {
      g.phase = 'won';
      g.score += g.lives * 100 + Math.floor(g.seeds);
    } else {
      g.phase = 'build';
      g.phaseT = 0;
      g.buildTimer = 25;
      float(g, g.wheel.cx + 1, g.wheel.cy - 0.4, perfect ? `PERFECT +${bonus}` : `wave clear +${bonus}`, '#f5c451');
    }
  }
}

function updateFx(g: Game, dt: number) {
  for (const f of g.fx) {
    f.t += dt;
    if (f.vx !== undefined) f.x += f.vx * dt;
    if (f.vy !== undefined) f.y += f.vy * dt;
  }
  g.fx = g.fx.filter((f) => f.t < f.ttl);
}
