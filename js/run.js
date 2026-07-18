'use strict';

let R = null; // 進行中のラン(保存しない=リロードで消える)

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }

// 術士の最大HP: ダンジョン踏破で成長
function runMaxHp() {
  return 30 + 15 * DUNGEON_ORDER.filter(d => G.dungeonClears[d] > 0).length;
}

function dungeonUnlocked(id) {
  const dg = DUNGEONS[id];
  return !dg.unlock || G.dungeonClears[dg.unlock] > 0;
}

function startRun(dungeonId) {
  const hp = runMaxHp();
  R = { dungeon: dungeonId, depth: 0, hp, maxHp: hp, fuda: 3, captured: [], clear: false };
  G.stats.runs++;
  save();
}

function currentDungeon() { return DUNGEONS[R.dungeon]; }

// 深度→倍率セグメント(序盤/中盤/終盤)
function depthSegment(d) {
  const len = currentDungeon().length;
  return d <= Math.ceil(len / 3) ? 0 : d <= Math.ceil(len * 2 / 3) ? 1 : 2;
}

// 次のノード2択(最終深度はボス固定)
function nodeOptions() {
  const d = R.depth + 1;
  if (d === currentDungeon().length) return [{ type: 'boss' }];
  const roll = () => {
    const r = Math.random();
    if (d >= 4) {
      if (r < 0.55) return { type: 'battle' };
      if (r < 0.70) return { type: 'elite' };
      if (r < 0.85) return { type: 'treasure' };
      return { type: 'rest' };
    }
    if (r < 0.62) return { type: 'battle' };
    if (r < 0.81) return { type: 'treasure' };
    return { type: 'rest' };
  };
  let a = roll(), b = roll();
  if (a.type === b.type && a.type !== 'battle') b = { type: 'battle' };
  return [a, b];
}

function makeEnemy(spId, hpScale, atkScale) {
  const s = SPECIES[spId];
  const hp = Math.round(s.enemy.hp * hpScale);
  return {
    sp: spId, boss: false, name: s.name, emoji: s.emoji, element: s.element, tier: s.tier,
    maxHp: hp, hp, atk: Math.round(s.enemy.atk * atkScale),
    rage: 0, poison: 0, weak: 0, advTag: false, state: 'alive',
  };
}

function makeGroup(kind) {
  const dg = currentDungeon();
  const seg = depthSegment(R.depth);
  const hpSc = dg.hpScale[seg], atkSc = dg.atkScale[seg];
  if (kind === 'boss') {
    const b = dg.boss;
    return [{
      sp: null, boss: true, name: b.name, emoji: b.emoji, element: null, tier: 0,
      maxHp: b.hp, hp: b.hp, atk: b.atk, bigAtk: b.bigAtk, expValue: b.expValue,
      rage: 0, poison: 0, weak: 0, advTag: false, state: 'alive',
    }];
  }
  const { t1, t2 } = dg.pools;
  if (kind === 'elite') {
    const ids = [pick(t2), pick(t1), Math.random() < 0.5 ? pick(t2) : pick(t1)];
    return ids.map(id => makeEnemy(id, hpSc, atkSc));
  }
  let count;
  if (seg === 0) count = 1 + (Math.random() < 0.5 ? 1 : 0);
  else if (seg === 1) count = 2;
  else count = 2 + (Math.random() < 0.4 ? 1 : 0);
  const ids = [];
  for (let i = 0; i < count; i++) {
    if (seg === 0) ids.push(pick(t1));
    else if (seg === 1) ids.push(Math.random() < 0.6 ? pick(t1) : pick(t2));
    else ids.push(Math.random() < 0.7 ? pick(t2) : pick(t1));
  }
  return ids.map(id => makeEnemy(id, hpSc, atkSc));
}

function applyTreasure() {
  const extra = Math.random() < 0.4 ? 2 : 1;
  R.fuda += extra;
  R.hp = Math.min(R.maxHp, R.hp + 4);
  return extra;
}

function applyRest(choice) {
  if (choice === 'heal') R.hp = Math.min(R.maxHp, R.hp + Math.round(R.maxHp * 0.4));
  else R.fuda += 2;
}
