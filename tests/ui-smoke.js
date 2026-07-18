// UI層スモーク: DOMスタブで全画面のrender関数が例外なくHTMLを生成できるか
// 実行: node tests/ui-smoke.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
globalThis.appStub = { innerHTML: '', addEventListener() {} };
globalThis.taStub = { value: '', focus() {}, select() {} };
globalThis.document = { getElementById(id) { return id === 'app' ? globalThis.appStub : globalThis.taStub; } };
globalThis.confirm = () => true;

const code = ['js/data.js', 'js/art.js', 'js/state.js', 'js/run.js', 'js/battle.js', 'js/main.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

const testBody = `
let fails = 0;
function check(name, fn) {
  try { appStub.innerHTML = ''; fn(); if (!appStub.innerHTML) throw new Error('empty html'); console.log('ok  :', name); }
  catch (e) { fails++; console.log('FAIL:', name, '-', e.message); }
}

check('home', () => { screen = 'home'; render(); });
check('home(イラスト差し替え)', () => {
  if (!ART.includes('onibi')) throw new Error('サンプルアートが未登録');
  render();
  if (!appStub.innerHTML.includes('assets/art/onibi.svg')) throw new Error('imgタグに切り替わっていない');
});
check('home(イラスト拡大ボタン)', () => {
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('data-action="unit-detail"')) throw new Error('拡大ボタンがない');
});
check('deck', () => { screen = 'deck'; render(); });
check('dungeon(d2ロック中)', () => { screen = 'dungeon'; render(); });
check('dungeon(全解放)', () => { G.dungeonClears.d1 = 1; G.dungeonClears.d2 = 1; render(); G.dungeonClears.d1 = 0; G.dungeonClears.d2 = 0; });
check('dex', () => { screen = 'dex'; render(); });
check('items(空)', () => { screen = 'items'; render(); });
check('items(所持・装備あり)', () => {
  gainItem('oniudewa'); gainItem('tengugeta');
  equipItem(G.roster[0].uid, 'oniudewa');
  render();
});
check('save', () => { screen = 'save'; render(); });
check('fusion(選択なし)', () => { screen = 'fusion'; fusionSel = []; render(); });
check('fusion(異種・レシピあり)', () => {
  const a = G.roster.find(u => u.sp === 'onibi');
  const b = G.roster.find(u => u.sp === 'tanuki');
  fusionSel = [a.uid, b.uid]; render();
});
check('fusion(同種・重ねプレビュー)', () => {
  const pair = G.roster.filter(u => u.sp === 'onibi');
  fusionSel = [pair[0].uid, pair[1].uid]; render();
});
check('fusion(異種・不一致)', () => {
  const a = G.roster.find(u => u.sp === 'onibi');
  const b = G.roster.find(u => u.sp === 'karakasa');
  fusionSel = [a.uid, b.uid]; render();
});

startRun('d1');
check('node', () => { gotoNodeScreen(); render(); });
check('event(宝)', () => { E = { kind: 'treasure', msg: 'テスト' }; screen = 'event'; render(); });
check('event(茶屋)', () => { E = { kind: 'rest' }; screen = 'event'; render(); });

R.depth = 1;
startBattle(makeGroup('battle'), { expMult: 1 });
check('battle(通常)', () => { screen = 'battle'; render(); });
check('battle(オートボタン表示)', () => { G.dungeonClears.d1 = 1; render(); G.dungeonClears.d1 = 0; });
check('battle(調伏モード・毒弱体表示)', () => {
  captureMode = true;
  B.enemies[0].hp = 1; B.enemies[0].poison = 2; B.enemies[0].weak = 1; B.enemies[0].rage = 1;
  render(); captureMode = false;
});
check('battle(勝利オーバーレイ)', () => {
  for (const e of aliveEnemies()) dealDamage(e, 999, null);
  checkWin(); render();
});
check('runend(通常)', () => { screen = 'runend'; render(); });
check('runend(踏破)', () => { R.clear = true; render(); });

// アクションを一通り叩く
check('action: nav遷移', () => {
  ['nav-deck','nav-fusion','nav-items','nav-dex','nav-save','nav-home'].forEach(a => handleAction(a));
});
check('action: 妖怪イラスト拡大/閉じる', () => {
  screen = 'home';
  const u = G.roster[0];
  handleAction('unit-detail', String(u.uid));
  if (detailUid !== u.uid) throw new Error('拡大対象が選択されていない');
  if (!appStub.innerHTML.includes('unit-detail-dialog')) throw new Error('詳細モーダルがない');
  if (!appStub.innerHTML.includes(SPECIES[u.sp].desc)) throw new Error('妖怪説明がない');
  handleAction('unit-detail-close');
  if (detailUid !== null || appStub.innerHTML.includes('unit-detail-dialog')) throw new Error('詳細モーダルが閉じていない');
});
check('action: 呪具の装備/解除', () => {
  screen = 'items';
  handleAction('item-select', 'tengugeta');
  const uid = G.roster[1].uid;
  handleAction('item-target', String(uid));
  if (getUnit(uid).item !== 'tengugeta') throw new Error('装備されていない');
  itemSel = null;
  handleAction('item-target', String(uid));
  if (getUnit(uid).item !== null) throw new Error('はずせていない');
});
check('action: 出撃フロー', () => {
  handleAction('start-run');
  handleAction('choose-dungeon', 'd1');
});
check('action: ロック中ダンジョン拒否', () => {
  handleAction('run-close');
  handleAction('start-run');
  handleAction('choose-dungeon', 'd3');
  if (R !== null) throw new Error('ロック中なのに出撃できた');
  render();
});
check('action: 重ねフロー', () => {
  screen = 'fusion';
  const pair = G.roster.filter(u => u.sp === 'onibi');
  if (pair.length >= 2) {
    handleAction('fusion-select', String(pair[0].uid));
    handleAction('fusion-select', String(pair[1].uid));
    handleAction('fusion-exec');
    const merged = G.roster.find(u => u.sp === 'onibi' && u.star === 1);
    if (!merged) throw new Error('重ね結果がない');
  } else render();
});
check('action: 引継ぎ読み込み(不正)', () => {
  screen = 'save';
  globalThis.taStub.value = 'invalid';
  handleAction('save-import');
});
check('action: 引継ぎ読み込み(正常)', () => {
  globalThis.taStub.value = exportSave();
  handleAction('save-import');
});

// M1: ラン途中セーブ
check('resume(進行中ランあり)', () => {
  handleAction('run-close');
  startRun('d1');
  R.depth = 1;
  startBattle(makeGroup('battle'), { expMult: 1 });
  R = null; B = null; // リロードを模擬
  if (!peekRun()) throw new Error('ランが保存されていない');
  screen = 'resume'; render();
  if (!appStub.innerHTML.includes('夜行を再開する')) throw new Error('再開ボタンがない');
});
check('action: 夜行を再開(戦闘へ復帰)', () => {
  handleAction('resume-run');
  if (screen !== 'battle') throw new Error('戦闘画面に復帰していない: ' + screen);
  if (!R || !B || B.over) throw new Error('R/Bが復元されていない');
});
check('action: 諦めて拠点へ', () => {
  if (!peekRun()) throw new Error('前提: 保存済みランがない');
  handleAction('resume-discard');
  if (peekRun()) throw new Error('ラン保存が消えていない');
  if (R !== null || screen !== 'home') throw new Error('拠点に戻っていない');
});

console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
`;

vm.runInThisContext(code + '\n' + testBody);
