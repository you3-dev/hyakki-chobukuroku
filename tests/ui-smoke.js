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
globalThis.styleCss = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

const code = ['js/version.js', 'js/time.js', 'js/data.js', 'js/art.js', 'js/achievements.js', 'js/progression.js', 'js/state.js', 'js/run.js', 'js/battle.js', 'js/main.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

const testBody = `
let fails = 0;
function check(name, fn) {
  try { appStub.innerHTML = ''; fn(); if (!appStub.innerHTML) throw new Error('empty html'); console.log('ok  :', name); }
  catch (e) { fails++; console.log('FAIL:', name, '-', e.message); }
}

check('boot: title', () => {
  if (screen !== 'title') throw new Error('起動時にタイトルではない: ' + screen);
  render();
  if (!appStub.innerHTML.includes('百鬼調伏録')) throw new Error('タイトル名がない');
  if (!appStub.innerHTML.includes('>はじめる<')) throw new Error('新規開始ボタンがない');
  if (!['title-guide', 'title-record', 'title-settings'].every(action => appStub.innerHTML.includes('data-action="' + action + '"'))) throw new Error('タイトルの補助導線が不足');
});
check('M5-B: 初回導入3画面とスキップ', () => {
  if (G.ui.onboardingSeen) throw new Error('新規セーブが導入済みになっている');
  handleAction('title-enter'); render();
  if (screen !== 'tutorial' || !appStub.innerHTML.includes('百鬼と歩む夜へ')) throw new Error('導入1画面目へ進めない');
  handleAction('tutorial-next'); render();
  if (!appStub.innerHTML.includes('弱らせて調伏') || !appStub.innerHTML.includes('HP 3 / 12')) throw new Error('調伏説明がない');
  handleAction('tutorial-next'); render();
  if (!appStub.innerHTML.includes('憑合で新たな妖怪へ')) throw new Error('憑合説明がない');
  handleAction('tutorial-next'); render();
  if (screen !== 'home' || !G.ui.onboardingSeen) throw new Error('導入完了後に拠点へ進めない');
  G.ui.onboardingSeen = false; screen = 'title';
  handleAction('title-enter'); handleAction('tutorial-skip'); render();
  if (screen !== 'home' || !G.ui.onboardingSeen) throw new Error('導入をスキップできない');
});
check('home', () => { screen = 'home'; render(); });
check('M5-G: 拠点見出しをコンパクト化', () => {
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('<h1>調伏師の拠点</h1>')) throw new Error('拠点見出しがない');
  if (appStub.innerHTML.includes('<h1>百鬼調伏録</h1>')) throw new Error('ゲームタイトルが拠点に重複している');
  if (!styleCss.includes('.home-hero h1 {') || !styleCss.includes('font-size: 1.08rem')) throw new Error('拠点見出しが縮小されていない');
});
check('home(次の目標・位階導線)', () => {
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('次の目標') || !appStub.innerHTML.includes('data-action="nav-ranks"')) throw new Error('次目標または位階導線がない');
  if (!appStub.innerHTML.includes('まずは最初の夜行へ') || !appStub.innerHTML.includes('最初の夜行へ')) throw new Error('初夜行の強調導線がない');
  if (!appStub.innerHTML.includes('dashboard-grid') || !appStub.innerHTML.includes('home-summary')) throw new Error('拠点の情報階層がM5-C共通構造でない');
});
check('home(イラスト差し替え)', () => {
  if (!ART.includes('onibi')) throw new Error('サンプルアートが未登録');
  render();
  if (!appStub.innerHTML.includes('assets/art/onibi.svg')) throw new Error('imgタグに切り替わっていない');
});
check('home(イラスト拡大ボタン)', () => {
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('data-action="unit-detail"')) throw new Error('拡大ボタンがない');
});
check('home(実績導線・複数達成通知)', () => {
  const snapshot = JSON.stringify(G);
  G.stats.captures = 1; G.stats.fusions = 1;
  syncAchievementState(G);
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('data-action="nav-achievements"') || !appStub.innerHTML.includes('NEW 2')) throw new Error('実績導線またはNEW件数がない');
  if (!appStub.innerHTML.includes('初調伏') || !appStub.innerHTML.includes('初憑合')) throw new Error('複数達成通知が欠けている');
  handleAction('achievement-notice-dismiss');
  if (unseenAchievementIds(G).length !== 0 || appStub.innerHTML.includes('achievement-notice')) throw new Error('達成通知を閉じられない');
  G = JSON.parse(snapshot); save();
});
check('title/home(全時間帯テーマ)', () => {
  const cases = [
    [new Date(2026, 6, 18, 7, 0), 'morning'],
    [new Date(2026, 6, 18, 12, 0), 'day'],
    [new Date(2026, 6, 18, 18, 0), 'evening'],
    [new Date(2026, 6, 18, 22, 0), 'night'],
    [new Date(2026, 6, 18, 2, 0), 'witching'],
  ];
  for (const [date, id] of cases) {
    gameTimeProvider = () => gameTimeAt(date);
    screen = 'title'; render();
    if (!appStub.innerHTML.includes('time-' + id) || !appStub.innerHTML.includes('time-context')) throw new Error('title ' + id + 'のテーマ/時刻表示がない');
    screen = 'home'; render();
    if (!appStub.innerHTML.includes('time-' + id) || !appStub.innerHTML.includes('time-context')) throw new Error('home ' + id + 'のテーマ/時刻表示がない');
  }
  gameTimeProvider = currentGameTime;
});
check('時間バナーの説明導線', () => {
  gameTimeProvider = () => gameTimeAt(new Date(2026, 6, 18, 22, 0));
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('data-action="time-help-open"')) throw new Error('時間バナーが操作できない');
  handleAction('time-help-open');
  if (!timeHelpOpen || !appStub.innerHTML.includes('time-help-dialog')) throw new Error('説明パネルが開かない');
  if (!appStub.innerHTML.includes('手持ち妖怪の札性能は変わらない')) throw new Error('性能への影響説明がない');
  if (!appStub.innerHTML.includes(SPECIES.chochin.encounter.hint) || !appStub.innerHTML.includes(SPECIES.satori.encounter.hint)) throw new Error('出現ヒントが揃っていない');
  if (!appStub.innerHTML.includes('提灯お化け') || !appStub.innerHTML.includes('不知火')) throw new Error('夜に出会いやすい妖怪がない');
  handleAction('time-help-dex');
  if (timeHelpOpen || screen !== 'dex') throw new Error('図鑑へ遷移できない');
  gameTimeProvider = currentGameTime;
});
check('reduced-motion対応CSS', () => {
  if (!styleCss.includes('@media (prefers-reduced-motion: reduce)') || !styleCss.includes('animation: none !important') || !styleCss.includes('body.motion-reduced *')) throw new Error('reduced-motion指定がない');
  appStub.innerHTML = '<span>CSS検査済み</span>';
});
check('M5-A UI基盤トークン・共通状態', () => {
  const tokens = ['--color-surface', '--color-accent', '--color-danger', '--space-1', '--radius-md', '--shadow-card', '--tap-min', '--focus-ring'];
  if (tokens.some(token => !styleCss.includes(token + ':'))) throw new Error('UIトークンが不足');
  if (!styleCss.includes('min-height: var(--tap-min)') || !styleCss.includes(':focus-visible') || !styleCss.includes('.btn:disabled')) throw new Error('タップ領域・フォーカス・無効状態の共通指定が不足');
  appStub.innerHTML = '<span>UI基盤CSS検査済み</span>';
});
check('M5-C: 共通画面ヘッダー・戻る操作', () => {
  const screens = ['deck', 'fusion', 'items', 'dex', 'achievements', 'ranks', 'save', 'dungeon'];
  for (const name of screens) {
    screen = name; render();
    if (!appStub.innerHTML.includes('screen-header') || !appStub.innerHTML.includes('screen-actions')) throw new Error(name + 'の共通構造が不足');
  }
  if (!styleCss.includes('.screen-actions {') || !styleCss.includes('.screen-header {') || !styleCss.includes('.dashboard-grid {')) throw new Error('M5-C共通CSSが不足');
});
check('M5-D: 専用演出・読み上げ・動きの抑制', () => {
  celebrationQueue = [];
  queueCelebration('capture', '調伏成功', '提灯お化け', '新たな仲間が百鬼へ加わった', '🧧', 'chochin');
  screen = 'home'; render();
  if (!appStub.innerHTML.includes('celebration-card') || !appStub.innerHTML.includes('aria-describedby="celebration-detail"')) throw new Error('専用演出のdialogがない');
  handleAction('celebration-dismiss');
  if (celebrationQueue.length) throw new Error('専用演出を閉じられない');
  if (!styleCss.includes('@keyframes celebration-enter') || !styleCss.includes('.screen-enter') || !styleCss.includes('.enemy.capture-target { animation:')) throw new Error('節目・画面・調伏可能の演出が不足');
  if (!styleCss.includes('body.motion-reduced *') || !styleCss.includes('animation: none !important')) throw new Error('設定による演出抑制が不足');
  screen = 'fusion'; fusionSel = []; render();
  if (!appStub.innerHTML.includes('class="unit-select-hit"') || !appStub.innerHTML.includes('aria-label="鬼火を選択"')) throw new Error('選択カードの独立したキーボード操作が不足');
});
check('deck', () => { screen = 'deck'; render(); });
check('dungeon(d2ロック中)', () => {
  screen = 'dungeon'; render();
  if (!appStub.innerHTML.includes('踏破ごとに+15')) throw new Error('最大HP成長の表示が仕様と違う');
  if (!appStub.innerHTML.includes('class="node-card locked"') || !appStub.innerHTML.includes('aria-disabled="true"')) throw new Error('ロック状態が明示されない');
  if (!appStub.innerHTML.includes('最初はここ') || !appStub.innerHTML.includes('node-card recommended')) throw new Error('宵の小径が初回推奨になっていない');
});
check('dungeon(全解放)', () => {
  G.dungeonClears.d1 = 1; G.dungeonClears.d2 = 1; G.dungeonClears.d3 = 1; render();
  if (!appStub.innerHTML.includes('百鬼の試練')) throw new Error('最終夜行が表示されない');
  G.dungeonClears.d1 = 0; G.dungeonClears.d2 = 0; G.dungeonClears.d3 = 0;
});
check('dex', () => { screen = 'dex'; render(); });
check('dex(未発見・目撃の出現条件ヒント)', () => {
  const oldYuki = G.dex.yukionna;
  delete G.dex.chochin;
  G.dex.yukionna = 1;
  screen = 'dex'; render();
  if (!appStub.innerHTML.includes(SPECIES.chochin.encounter.hint)) throw new Error('未発見の条件ヒントがない');
  if (!appStub.innerHTML.includes(SPECIES.yukionna.encounter.hint)) throw new Error('目撃済みの条件ヒントがない');
  if (oldYuki == null) delete G.dex.yukionna; else G.dex.yukionna = oldYuki;
});
check('achievements(一覧・報酬受取)', () => {
  const snapshot = JSON.stringify(G);
  Object.keys(SPECIES).slice(0, 10).forEach(id => { G.dex[id] = 2; });
  syncAchievementState(G);
  handleAction('nav-achievements');
  const cards = (appStub.innerHTML.match(/class="achievement-card /g) || []).length;
  if (screen !== 'achievements' || cards !== ACHIEVEMENTS.length) throw new Error('実績11件を表示できない');
  if (!appStub.innerHTML.includes('data-action="achievement-claim"') || !appStub.innerHTML.includes('夜行開始時の調伏札 +1')) throw new Error('報酬受取導線がない');
  handleAction('achievement-claim', 'dex_10');
  if (!achievementRewardClaimed(G, 'dex_10') || !appStub.innerHTML.includes('受取済み')) throw new Error('報酬を受け取れない');
  G = JSON.parse(snapshot); save(); screen = 'home'; render();
});
check('ranks(一覧・一度きりの呪具選択)', () => {
  const snapshot = JSON.stringify(G);
  G.roster[0].star = 3; save();
  handleAction('nav-ranks');
  const rows = (appStub.innerHTML.match(/class="rank-row /g) || []).length;
  if (screen !== 'ranks' || rows !== PROGRESSION_MILESTONES.length) throw new Error('位階の節目一覧がない');
  if (!appStub.innerHTML.includes('data-action="rank-choice"')) throw new Error('入門呪具の選択肢がない');
  handleAction('rank-choice', 'first_star3:oniudewa');
  if (!progressionChoiceClaimed(G, 'first_star3') || !appStub.innerHTML.includes('選択済み')) throw new Error('位階報酬を受け取れない');
  G = JSON.parse(snapshot); save(); screen = 'home'; render();
});
check('items(空)', () => { screen = 'items'; render(); });
check('items(所持・装備あり)', () => {
  gainItem('oniudewa'); gainItem('tengugeta');
  equipItem(G.roster[0].uid, 'oniudewa');
  itemSel = 'tengugeta';
  render();
  if (!appStub.innerHTML.includes('選択中') || !appStub.innerHTML.includes('装備中')) throw new Error('呪具の選択・装備状態が文字で分からない');
  itemSel = null;
});
check('save', () => { screen = 'save'; render(); });
check('fusion(選択なし)', () => { screen = 'fusion'; fusionSel = []; render(); });
check('fusion(異種・レシピあり)', () => {
  const a = G.roster.find(u => u.sp === 'onibi');
  const b = G.roster.find(u => u.sp === 'tanuki');
  fusionSel = [a.uid, b.uid]; render();
  if (!appStub.innerHTML.includes('完成予定 Lv')) throw new Error('異種憑合の完成予定Lvがない');
  if (!appStub.innerHTML.includes('unit-badge">選択中')) throw new Error('選択した妖怪が文字で分からない');
});
check('fusion(同種・重ねプレビュー)', () => {
  const pair = G.roster.filter(u => u.sp === 'onibi');
  fusionSel = [pair[0].uid, pair[1].uid]; render();
  if (!appStub.innerHTML.includes('完成予定 Lv')) throw new Error('重ねの完成予定Lvがない');
});
check('fusion(異種・不一致)', () => {
  const a = G.roster.find(u => u.sp === 'onibi');
  const b = G.roster.find(u => u.sp === 'karakasa');
  fusionSel = [a.uid, b.uid]; render();
});

startRun('d1');
check('node', () => {
  gotoNodeScreen(); render();
  if (!appStub.innerHTML.includes('route-card') || !appStub.innerHTML.includes('role="button"')) throw new Error('分かれ道の選択構造が不足');
});
check('event(宝)', () => { E = { kind: 'treasure', msg: 'テスト' }; screen = 'event'; render(); });
check('event(宝の2択)', () => {
  E = { kind: 'treasure-choice', options: [{ kind: 'fuda', extra: 2 }, { kind: 'item', id: 'juzu' }] };
  screen = 'event'; render();
  if (!appStub.innerHTML.includes('data-action="treasure-choice"') || !appStub.innerHTML.includes('癒やしの数珠')) throw new Error('宝の選択肢がない');
});
check('event(茶屋)', () => { E = { kind: 'rest' }; screen = 'event'; render(); });

R.depth = 1;
startBattle(makeGroup('battle'), { expMult: 1 });
check('battle(通常・未踏破は手加減なし)', () => {
  screen = 'battle'; render();
  if (appStub.innerHTML.includes('data-action="toggle-mercy"')) throw new Error('未踏破で手加減ボタンが出ている');
  if (!appStub.innerHTML.includes('最初の調伏を狙おう')) throw new Error('初調伏の戦闘ヒントがない');
  if (!appStub.innerHTML.includes('battle-section-label') || !appStub.innerHTML.includes('role="log"') || !appStub.innerHTML.includes('aria-live="polite"')) throw new Error('戦闘の情報階層・読み上げが不足');
  if (!appStub.innerHTML.includes('class="hand-card') || !appStub.innerHTML.includes('role="button" tabindex="0"')) throw new Error('戦闘カードのキーボード操作が不足');
});
check('battle(オート・手加減解放/切替)', () => {
  G.dungeonClears.d1 = 1; render();
  if (!appStub.innerHTML.includes('data-action="auto-battle"') || !appStub.innerHTML.includes('手加減 OFF')) throw new Error('踏破後の操作が解放されない');
  handleAction('toggle-mercy');
  if (!B.mercy || !appStub.innerHTML.includes('手加減 ON') || !appStub.innerHTML.includes('aria-pressed="true"')) throw new Error('手加減ON表示に切り替わらない');
  handleAction('toggle-mercy');
  G.dungeonClears.d1 = 0;
});
check('battle(手加減HP1表示・44px)', () => {
  G.dungeonClears.d1 = 1; B.mercy = true; B.enemies[0].hp = 1; B.enemies[0].mercyTag = true; render();
  if (!appStub.innerHTML.includes('手加減・HP1') || !appStub.innerHTML.includes('mercy-spared')) throw new Error('HP1の手加減表示がない');
  if (!styleCss.includes('.battle-actions .btn { min-height: 44px; }')) throw new Error('手加減を含む戦闘ボタンが44px未満');
  B.mercy = false; B.enemies[0].mercyTag = false; G.dungeonClears.d1 = 0;
});
check('battle(調伏モード・毒弱体表示)', () => {
  captureMode = true;
  B.enemies[0].hp = 1; B.enemies[0].poison = 2; B.enemies[0].weak = 1; B.enemies[0].rage = 1;
  render();
  if (!appStub.innerHTML.includes('aria-pressed="true"') || !appStub.innerHTML.includes('✓ 🧧')) throw new Error('調伏モードが色以外で分からない');
  captureMode = false;
});
check('battle(勝利オーバーレイ)', () => {
  for (const e of aliveEnemies()) dealDamage(e, 999, null);
  checkWin(); render();
  if (!appStub.innerHTML.includes('role="dialog"') || !appStub.innerHTML.includes('aria-modal="true"')) throw new Error('勝敗モーダルの役割がない');
});
check('runend(通常)', () => {
  screen = 'runend'; render();
  if (!appStub.innerHTML.includes('result-page-card') || !appStub.innerHTML.includes('capture-summary')) throw new Error('夜行結果の共通カードがない');
});
check('runend(踏破)', () => { R.clear = true; render(); });
check('runend(百鬼の試練エンディング)', () => {
  R.dungeon = 'trial'; R.clear = true; G.dungeonClears.trial = 1; screen = 'runend'; render();
  if (!appStub.innerHTML.includes('百鬼調伏録・結') || !appStub.innerHTML.includes('大調伏師')) throw new Error('エンディングまたは称号がない');
  G.dungeonClears.trial = 0; R.dungeon = 'd1';
});

// アクションを一通り叩く
check('action: nav遷移', () => {
  ['nav-deck','nav-fusion','nav-items','nav-dex','nav-achievements','nav-ranks','nav-guide','nav-settings','nav-save','nav-home'].forEach(a => handleAction(a));
});
check('M5-B: タイトルの遊び方・設定・記録', () => {
  clearRun(); R = null; B = null;
  screen = 'title'; render();
  if (!appStub.innerHTML.includes('>続きから<')) throw new Error('既存記録の続きから表示がない');
  handleAction('title-guide'); render();
  if (screen !== 'guide' || !appStub.innerHTML.includes('最初の一夜')) throw new Error('遊び方を開けない');
  handleAction('tutorial-replay'); render();
  if (screen !== 'tutorial') throw new Error('導入を再確認できない');
  handleAction('tutorial-skip'); render();
  if (screen !== 'guide') throw new Error('再確認後に遊び方へ戻らない');
  handleAction('utility-back');
  handleAction('title-settings'); render();
  const beforeMotion = G.ui.reducedMotion;
  handleAction('setting-motion'); render();
  if (G.ui.reducedMotion === beforeMotion || !appStub.innerHTML.includes('aria-pressed="true"')) throw new Error('演出設定を切り替えられない');
  handleAction('setting-motion');
  handleAction('utility-back');
  handleAction('title-record'); render();
  if (screen !== 'save' || !appStub.innerHTML.includes('タイトルへ戻る')) throw new Error('タイトルから記録を開けない');
  handleAction('utility-back');
  if (screen !== 'title') throw new Error('記録からタイトルへ戻れない');
});
check('action: タイトルから拠点へ', () => {
  clearRun(); R = null; B = null; screen = 'title';
  handleAction('title-enter');
  if (screen !== 'home') throw new Error('拠点へ進んでいない: ' + screen);
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
  celebrationQueue = [];
  const pair = G.roster.filter(u => u.sp === 'onibi');
  if (pair.length >= 2) {
    handleAction('fusion-select', String(pair[0].uid));
    handleAction('fusion-select', String(pair[1].uid));
    handleAction('fusion-exec');
    const merged = G.roster.find(u => u.sp === 'onibi' && u.star === 1);
    if (!merged) throw new Error('重ね結果がない');
    if (!celebrationQueue.some(c => c.kind === 'star')) throw new Error('★上昇の専用演出がない');
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
check('M5-G: JSONバックアップUIと復元', () => {
  screen = 'save'; render();
  if (!appStub.innerHTML.includes('data-action="save-json"') || !appStub.innerHTML.includes('id="save-file-input"')) throw new Error('JSON保存・復元導線がない');
  if (!appStub.innerHTML.includes('ホーム画面版はSafariの7日制限の対象外')) throw new Error('PWA保存説明が不正確');
  const snapshot = JSON.stringify(G);
  const json = exportSaveJson();
  G.stats.runs = 997;
  if (!finishSaveImport(json, '復元済み')) throw new Error('JSONをUI経由で復元できない');
  if (JSON.stringify(G) !== snapshot || toast !== '復元済み') throw new Error('JSON復元結果が一致しない');
});

// M1: ラン途中セーブ
check('resume(進行中ランあり)', () => {
  handleAction('run-close');
  startRun('d1');
  R.depth = 1;
  startBattle(makeGroup('battle'), { expMult: 1 });
  R = null; B = null; // リロードを模擬
  if (!peekRun()) throw new Error('ランが保存されていない');
  screen = 'title'; render();
  if (!appStub.innerHTML.includes('夜行を再開')) throw new Error('タイトルに再開ボタンがない');
  handleAction('title-enter');
  if (screen !== 'resume') throw new Error('再開確認画面へ進んでいない: ' + screen);
  if (!appStub.innerHTML.includes('夜行を再開する')) throw new Error('再開確認ボタンがない');
  if (!appStub.innerHTML.includes('btn btn-danger') || !appStub.innerHTML.includes('諦めて拠点へ')) throw new Error('破棄操作が危険階層でない');
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
