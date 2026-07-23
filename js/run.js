'use strict';

let R = null; // 進行中のラン(RUN_KEYへ随時保存。リロード後に再開可)
let runTimeProvider = currentGameTime; // 出撃時だけ実時計を読み、ラン中はR.timeへ固定
const RUN_FUDA_BASE = 3;

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }

// 術士の最大HP: ダンジョン踏破で成長
function runMaxHp() {
  return 30 + 15 * STORY_DUNGEON_ORDER.filter(d => G.dungeonClears[d] > 0).length;
}

function dungeonUnlocked(id) {
  const dg = DUNGEONS[id];
  return !dg.unlock || G.dungeonClears[dg.unlock] > 0;
}

function runInitialFuda(game) {
  return RUN_FUDA_BASE + achievementRewardTotal(game, 'startFuda');
}

function runTimeSnapshot(context) {
  return { timeBand: context.timeBand.id, moonPhase: context.moonPhase.id, label: context.label };
}

function validRunTime(time) {
  return time && TIME_BANDS.some(x => x.id === time.timeBand) && MOON_PHASES.some(x => x.id === time.moonPhase);
}

function startRun(dungeonId) {
  const hp = runMaxHp();
  R = { dungeon: dungeonId, depth: 0, hp, maxHp: hp, fuda: runInitialFuda(G), captured: [], clear: false, time: runTimeSnapshot(runTimeProvider()) };
  B = null;
  G.stats.runs++;
  save();
  saveRun();
}

// ===== ラン途中セーブ =====
// R/Bを引継ぎコード(G)とは別キーで保存する。captured等のユニットはuidで持ち、復元時にrosterへ結び直す
const RUN_KEY = 'hyakki_run_v1';

function serializeRun() {
  return {
    r: Object.assign({}, R, { captured: R.captured.map(u => u.uid) }),
    b: B ? Object.assign({}, B, { captured: B.captured.map(u => u.uid) }) : null,
  };
}

function saveRun() {
  if (!R) { clearRun(); return; }
  localStorage.setItem(RUN_KEY, JSON.stringify(serializeRun()));
}

function clearRun() { localStorage.removeItem(RUN_KEY); }

// 保存済みランの中身を覗く(壊れていればnull)
function peekRun() {
  try {
    const d = JSON.parse(localStorage.getItem(RUN_KEY));
    if (!d || !d.r || !DUNGEONS[d.r.dungeon]) return null;
    return d;
  } catch (e) { return null; }
}

function loadRun() {
  const d = peekRun();
  if (!d) return false;
  const toUnits = uids => (uids || []).map(uid => getUnit(uid)).filter(Boolean);
  R = Object.assign({}, d.r, { captured: toUnits(d.r.captured) });
  const timeMigrated = !validRunTime(R.time);
  if (timeMigrated) R.time = runTimeSnapshot(runTimeProvider());
  if (d.b) {
    B = Object.assign({}, d.b, { captured: toUnits(d.b.captured) });
    B.mercy = mercyAvailable() && !B.boss ? !!B.mercy : false;
    const uids = new Set(G.roster.map(u => u.uid));
    ['draw', 'discard', 'hand', 'deckAtStart'].forEach(k => { B[k] = (B[k] || []).filter(id => uids.has(id)); });
  } else B = null;
  if (timeMigrated) saveRun();
  return true;
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
    sp: spId, art: spId, boss: false, name: s.name, emoji: s.emoji, element: s.element, tier: s.tier,
    maxHp: hp, hp, atk: Math.round(s.enemy.atk * atkScale),
    rage: 0, poison: 0, weak: 0, advTag: false, snareTag: false, state: 'alive',
  };
}

function encounterMatches(spId, time) {
  const rule = SPECIES[spId] && SPECIES[spId].encounter;
  if (!rule) return true;
  if (rule.timeBands && !rule.timeBands.includes(time.timeBand)) return false;
  if (rule.moonPhases && !rule.moonPhases.includes(time.moonPhase)) return false;
  return true;
}

// 条件一致種はweight分だけ候補へ入れる。候補0件なら元テーブルへ戻し、進行不能を防ぐ。
function encounterPool(ids, time) {
  const eligible = [];
  for (const id of ids) {
    const rule = SPECIES[id].encounter;
    const matches = encounterMatches(id, time);
    const rawWeight = rule ? (matches ? rule.weight : rule.offWeight) : 1;
    const weight = Math.max(0, Math.floor(rawWeight || 0));
    for (let i = 0; i < weight; i++) eligible.push(id);
  }
  return eligible.length ? eligible : ids.slice();
}

function makeGroup(kind) {
  const dg = currentDungeon();
  const seg = depthSegment(R.depth);
  const hpSc = dg.hpScale[seg], atkSc = dg.atkScale[seg];
  if (kind === 'boss') {
    const bosses = dg.bosses || [dg.boss];
    return bosses.map(b => ({
      sp: null, art: b.art || b.id, boss: true, name: b.name, emoji: b.emoji, element: null, tier: 0,
      maxHp: b.hp, hp: b.hp, atk: b.atk, bigAtk: b.bigAtk, expValue: b.expValue,
      rage: 0, poison: 0, weak: 0, advTag: false, snareTag: false, state: 'alive',
    }));
  }
  const t1 = encounterPool(dg.pools.t1, R.time);
  const t2 = encounterPool(dg.pools.t2, R.time);
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

function treasureChoiceOptions() {
  return [
    { kind: 'fuda', extra: Math.random() < 0.4 ? 2 : 1 },
    { kind: 'item', id: randomItemId() },
  ];
}

function applyTreasureChoice(choice) {
  if (!choice || !['item', 'fuda'].includes(choice.kind)) return { err: '宝を選べない' };
  if (choice.kind === 'item' && !ITEMS[choice.id]) return { err: '呪具を選べない' };
  R.hp = Math.min(R.maxHp, R.hp + 4);
  if (choice.kind === 'item') {
    gainItem(choice.id);
    save();
    saveRun();
    return { kind: 'item', id: choice.id };
  }
  const extra = Math.max(1, Math.min(2, Number(choice.extra) || 1));
  R.fuda += extra;
  saveRun();
  return { kind: 'fuda', extra };
}

// 宝: 30%で呪具、70%で調伏札。どちらでもHP+4
function applyTreasure() {
  const options = treasureChoiceOptions();
  return applyTreasureChoice(Math.random() < 0.3 ? options[1] : options[0]);
}

function applyRest(choice) {
  if (choice === 'heal') R.hp = Math.min(R.maxHp, R.hp + Math.round(R.maxHp * 0.4));
  else R.fuda += 2;
  saveRun();
}
