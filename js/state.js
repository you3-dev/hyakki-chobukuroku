'use strict';

const SAVE_KEY = 'hyakki_proto_v1';
const EXP_TABLE = [0, 6, 14, 26, 42]; // 累計EXP閾値(Lv1..5)
const LEVEL_MAX = 5;
const STAR_MAX = 3;
const DECK_MAX = 20;
const DECK_MIN = 5;

let G = null; // 永続データ(手持ち・デッキ・図鑑・戦績)

function levelFromExp(exp) {
  let lv = 1;
  for (let i = 1; i < EXP_TABLE.length; i++) if (exp >= EXP_TABLE[i]) lv = i + 1;
  return Math.min(lv, LEVEL_MAX);
}
function unitLevel(u) { return levelFromExp(u.exp); }
function getUnit(uid) { return G.roster.find(u => u.uid === uid); }
function deckMinSize() { return Math.min(DECK_MIN, G.roster.length); }

function addUnit(sp, exp) {
  const u = { uid: G.nextUid++, sp, exp: exp || 0, star: 0 };
  G.roster.push(u);
  if (G.deck.length < DECK_MAX) G.deck.push(u.uid);
  markOwned(sp);
  return u;
}

function newGame() {
  G = {
    nextUid: 1, roster: [], deck: [], found: [], dex: {},
    dungeonClears: { d1: 0, d2: 0, d3: 0 },
    stats: { runs: 0, clears: 0, captures: 0, fusions: 0 },
  };
  ['onibi', 'onibi', 'karakasa', 'tanuki', 'kamaitachi', 'kodama'].forEach(sp => addUnit(sp, 0));
  save();
}

function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); }

function load() {
  try {
    const j = localStorage.getItem(SAVE_KEY);
    if (j) { G = JSON.parse(j); sanitize(); return; }
  } catch (e) { /* 壊れたセーブは作り直す */ }
  newGame();
}

function sanitize() {
  G.roster = (G.roster || []).filter(u => SPECIES[u.sp]);
  G.found = G.found || [];
  G.dex = G.dex || {};
  G.stats = G.stats || { runs: 0, clears: 0, captures: 0, fusions: 0 };
  // 検証版セーブからの移行: クリア数はd1のものとみなす
  G.dungeonClears = G.dungeonClears || { d1: G.stats.clears || 0, d2: 0, d3: 0 };
  G.roster.forEach(u => { if (u.star == null) u.star = 0; markOwned(u.sp); });
  const uids = new Set(G.roster.map(u => u.uid));
  G.deck = (G.deck || []).filter(id => uids.has(id));
  if (G.deck.length === 0) G.deck = G.roster.slice(0, DECK_MAX).map(u => u.uid);
}

function resetSave() { localStorage.removeItem(SAVE_KEY); newGame(); }

// ===== 図鑑 =====
// dex[sp]: 1=目撃 2=使役(所持経験)
function markSeen(sp) { if (!G.dex[sp]) { G.dex[sp] = 1; save(); } }
function markOwned(sp) { if ((G.dex[sp] || 0) < 2) G.dex[sp] = 2; }
function dexOwnedCount() { return Object.values(G.dex).filter(v => v === 2).length; }

// ===== セーブの書き出し/読み込み(iOSの7日削除対策) =====
function exportSave() {
  return 'HYAKKI1.' + btoa(unescape(encodeURIComponent(JSON.stringify(G))));
}
function importSave(str) {
  try {
    const s = String(str).trim();
    if (!s.startsWith('HYAKKI1.')) return false;
    const data = JSON.parse(decodeURIComponent(escape(atob(s.slice(8)))));
    if (!data || !Array.isArray(data.roster) || !data.nextUid) return false;
    G = data;
    sanitize();
    save();
    return true;
  } catch (e) { return false; }
}

// ===== 憑合 =====
function findRecipe(spA, spB) {
  return RECIPES.find(r =>
    (r.pair[0] === spA && r.pair[1] === spB) || (r.pair[0] === spB && r.pair[1] === spA));
}

// 同種→重ね(★+1)、異種→レシピ変化。戻り値 {unit} または {err}
function fuseUnits(uidA, uidB) {
  const a = getUnit(uidA), b = getUnit(uidB);
  if (!a || !b || a === b) return { err: '2体を選んで' };
  if (a.sp === b.sp) {
    const star = Math.max(a.star, b.star) + 1;
    if (star > STAR_MAX) return { err: `これ以上重ねられない(★${STAR_MAX}が上限)` };
    const exp = Math.max(a.exp, b.exp);
    G.roster = G.roster.filter(u => u !== a && u !== b);
    G.deck = G.deck.filter(id => id !== uidA && id !== uidB);
    const nu = addUnit(a.sp, exp);
    nu.star = star;
    G.stats.fusions++;
    save();
    return { unit: nu };
  }
  const rec = findRecipe(a.sp, b.sp);
  if (!rec) return { err: 'この組み合わせは反応しない' };
  const lv = Math.max(1, Math.min(LEVEL_MAX, Math.floor((unitLevel(a) + unitLevel(b)) / 2)));
  G.roster = G.roster.filter(u => u !== a && u !== b);
  G.deck = G.deck.filter(id => id !== uidA && id !== uidB);
  const nu = addUnit(rec.result, EXP_TABLE[lv - 1]);
  if (!G.found.includes(rec.result)) G.found.push(rec.result);
  G.stats.fusions++;
  save();
  return { unit: nu };
}
