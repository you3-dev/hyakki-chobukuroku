let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL:', msg); } else console.log('ok  :', msg); }

// --- 時間帯・月相(M3-A: まだゲーム挙動には影響させない) ---
{
  const bandCases = [
    [0, 59, 'night'], [1, 0, 'witching'], [4, 59, 'witching'], [5, 0, 'morning'],
    [10, 59, 'morning'], [11, 0, 'day'], [16, 59, 'day'], [17, 0, 'evening'],
    [19, 59, 'evening'], [20, 0, 'night'],
  ];
  for (const [hour, minute, expected] of bandCases) {
    const actual = timeBandAt(new Date(2026, 6, 18, hour, minute)).id;
    ok(actual === expected, `時間帯境界 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}=${expected}`);
  }

  const newMoon = new Date(MOON_REFERENCE_UTC_MS);
  const afterDays = days => new Date(MOON_REFERENCE_UTC_MS + days * DAY_MS);
  ok(moonPhaseAt(newMoon).id === 'new' && moonAgeDaysAt(newMoon) < 1e-9, '月相基準日時=新月/月齢0');
  ok(moonPhaseAt(afterDays(SYNODIC_MONTH_DAYS / 4)).id === 'first-quarter', '代表月齢=上弦');
  ok(moonPhaseAt(afterDays(SYNODIC_MONTH_DAYS / 2)).id === 'full', '代表月齢=満月');
  ok(moonPhaseAt(afterDays(SYNODIC_MONTH_DAYS * 3 / 4)).id === 'last-quarter', '代表月齢=下弦');
  ok(moonPhaseAt(afterDays(SYNODIC_MONTH_DAYS)).id === 'new', '1朔望月後=新月');

  const beforeMonthEnd = new Date(Date.UTC(2026, 0, 31, 23, 59));
  const afterMonthStart = new Date(Date.UTC(2026, 1, 1, 0, 1));
  const ageDelta = moonAgeDaysAt(afterMonthStart) - moonAgeDaysAt(beforeMonthEnd);
  ok(Math.abs(ageDelta - 2 / (24 * 60)) < 1e-9, '月またぎでも月齢が連続');
  const context = gameTimeAt(newMoon);
  ok(context.label.includes(context.timeBand.name) && context.label.includes(context.moonPhase.name), '表示文言に時間帯・月相を含む');
  let invalidRejected = false;
  try { gameTimeAt(new Date('invalid')); } catch (e) { invalidRejected = e instanceof TypeError; }
  ok(invalidRejected, '不正な日時を拒否');
}

// --- 初期化 ---
load();
ok(G.roster.length === 6, '初期手持ち6体');
ok(G.deck.length === 6, '初期デッキ6枚');
ok(G.roster.every(u => u.star === 0), '初期★0');
ok(dexOwnedCount() === 5, '初期図鑑5種(鬼火重複)');
ok(G.achievements && G.achievements.unlocked.length === 0, '初期実績は未達成');
ok(G.achievements.seen.length === 0, '初期実績の確認済み記録は空');
ok(G.achievementRewards && G.achievementRewards.claimed.length === 0, '初期の実績報酬は未受取');
ok(G.ui && !G.ui.onboardingSeen && !G.ui.reducedMotion, 'M5-B新規開始: 初回導入は未確認・演出は標準');

// --- M4-A: 実績データ・達成判定 ---
{
  const fixture = () => ({
    roster: [], dex: {}, dungeonClears: { d1: 0, d2: 0, d3: 0 },
    stats: { runs: 0, clears: 0, captures: 0, fusions: 0 }, achievements: { unlocked: [] },
  });
  const dexWith = count => {
    const dex = {};
    Object.keys(SPECIES).slice(0, count).forEach(id => { dex[id] = 2; });
    return dex;
  };
  const progress = (id, game) => achievementProgress(achievementDefinition(id), game);

  ok(ACHIEVEMENTS.length === 11 && new Set(ACHIEVEMENTS.map(def => def.id)).size === 11, '実績11件のIDが一意');
  ok(ACHIEVEMENTS.every(def => def.id && def.name && def.description && def.condition && def.condition.target > 0), '実績の共通形式が揃う');

  const pure = fixture();
  pure.stats.captures = 1;
  const pureBefore = JSON.stringify(pure);
  evaluateAchievements(pure);
  ok(JSON.stringify(pure) === pureBefore, '実績評価はセーブデータを書き換えない');

  const stats = fixture();
  ok(!progress('first_capture', stats).done && !progress('first_fusion', stats).done, '調伏・憑合0回は未達成');
  stats.stats.captures = 1; stats.stats.fusions = 1;
  ok(progress('first_capture', stats).done && progress('first_fusion', stats).done, '調伏・憑合1回で達成');

  const clears = fixture();
  clears.dungeonClears = { d1: 1, d2: 1, d3: 1 };
  ok(['clear_d1', 'clear_d2', 'clear_d3'].every(id => progress(id, clears).done), '各ダンジョン1回踏破で実績達成');

  const stars = fixture();
  stars.roster = [{ star: 2 }];
  ok(!progress('first_star3', stars).done, '★2は★3実績未達成');
  stars.roster[0].star = 3;
  ok(progress('first_star3', stars).done, '★3で実績達成');

  for (const target of [10, 25, 50]) {
    const dexGame = fixture();
    dexGame.dex = dexWith(target - 1);
    ok(!progress(`dex_${target}`, dexGame).done, `図鑑${target - 1}種は${target}種実績未達成`);
    dexGame.dex = dexWith(target);
    ok(progress(`dex_${target}`, dexGame).done, `図鑑${target}種で実績達成`);
  }

  const legends = fixture();
  FOUR_GOD_IDS.slice(0, 3).forEach(id => { legends.dex[id] = 2; });
  ok(!progress('four_gods', legends).done, '四神3種は未達成');
  legends.dex.suzaku = 2;
  ok(progress('four_gods', legends).done, '四神4種で達成');
  ok(!progress('nurarihyon', legends).done, 'ぬらりひょん未使役は未達成');
  legends.dex.nurarihyon = 2;
  ok(progress('nurarihyon', legends).done, 'ぬらりひょん使役で達成');

  const lasting = fixture();
  lasting.roster = [{ star: 3 }];
  lasting.achievements.unlocked = ['unknown_old_id'];
  const firstSync = syncAchievementState(lasting);
  lasting.roster = [];
  const secondSync = syncAchievementState(lasting);
  ok(firstSync.includes('first_star3') && secondSync.length === 0, '新規達成は一度だけ検出');
  ok(progress('first_star3', lasting).done && !lasting.achievements.unlocked.includes('unknown_old_id'), '達成後に条件が消えても保持し不正IDは除去');
}

// --- M4-C: 新規達成の確認状態 ---
{
  const noticeGame = {
    roster: [], dex: {}, dungeonClears: { d1: 0, d2: 0, d3: 0 },
    stats: { runs: 0, clears: 0, captures: 1, fusions: 1 },
    achievements: { unlocked: [], seen: [] }, achievementRewards: { claimed: [] },
  };
  syncAchievementState(noticeGame);
  ok(unseenAchievementIds(noticeGame).join(',') === 'first_capture,first_fusion', '同時達成した実績をすべて未確認として保持');
  markAchievementIdsSeen(noticeGame);
  ok(unseenAchievementIds(noticeGame).length === 0 && noticeGame.achievements.seen.length === 2, '実績確認後にNEW状態を解除');
  noticeGame.dungeonClears.d1 = 1;
  syncAchievementState(noticeGame);
  ok(unseenAchievementIds(noticeGame).join(',') === 'clear_d1', '確認後の新規達成だけを通知');
}

// --- M4-B: 図鑑節目報酬・永続保存 ---
{
  const rewardGame = {
    roster: [], dex: {}, dungeonClears: { d1: 0, d2: 0, d3: 0 },
    stats: { runs: 0, clears: 0, captures: 0, fusions: 0 },
    achievements: { unlocked: [] }, achievementRewards: { claimed: [] },
  };
  const speciesIds = Object.keys(SPECIES);
  speciesIds.slice(0, 10).forEach(id => { rewardGame.dex[id] = 2; });
  syncAchievementState(rewardGame);

  ok(ACHIEVEMENTS.filter(def => def.reward).map(def => def.id).join(',') === 'dex_10,dex_25,dex_50', '図鑑10・25・50に報酬を設定');
  ok(!claimAchievementReward(rewardGame, 'dex_25').ok, '未達成の図鑑25報酬は受取不可');
  ok(claimAchievementReward(rewardGame, 'dex_10').ok, '達成した図鑑10報酬を受取');
  ok(rewardGame.achievements.unlocked.includes('dex_10') && rewardGame.achievementRewards.claimed.includes('dex_10'), '達成状態と受取状態を分離保存');
  ok(!claimAchievementReward(rewardGame, 'dex_10').ok && achievementRewardTotal(rewardGame, 'startFuda') === 1, '同じ報酬を二重取得しない');
  ok(unclaimedAchievementRewardIds(rewardGame).length === 0, '受取後は未受取報酬一覧から除外');
  ok(runInitialFuda(rewardGame) === 4, '図鑑10報酬で次回の初期調伏札4枚');

  speciesIds.slice(10, 50).forEach(id => { rewardGame.dex[id] = 2; });
  syncAchievementState(rewardGame);
  ok(claimAchievementReward(rewardGame, 'dex_25').ok && claimAchievementReward(rewardGame, 'dex_50').ok, '図鑑25・50報酬を順次受取');
  ok(achievementRewardTotal(rewardGame, 'startFuda') === 3 && runInitialFuda(rewardGame) === 6, '図鑑報酬は累積して初期調伏札最大6枚');
  rewardGame.achievementRewards.claimed.push('unknown_reward');
  sanitizeAchievementRewardState(rewardGame);
  ok(!rewardGame.achievementRewards.claimed.includes('unknown_reward'), '未知の報酬IDを移行時に除去');
}

// 実際のラン開始、引継ぎ、進行中ランへの非遡及を一時ゲーム状態で確認
{
  const originalGame = G;
  G = JSON.parse(JSON.stringify(G));
  Object.keys(SPECIES).slice(0, 10).forEach(id => { G.dex[id] = 2; });
  syncAchievementState(G);
  ok(claimReward('dex_10').ok, '永続データで図鑑10報酬を受取');
  G = null;
  load();
  ok(G.achievementRewards.claimed.includes('dex_10'), 'リロード後も報酬受取状態を保持');
  const rewardCode = exportSave();
  G.achievementRewards.claimed = [];
  ok(importSave(rewardCode) && G.achievementRewards.claimed.includes('dex_10'), '引継ぎコードで報酬受取状態を復元');
  startRun('d1');
  ok(R.fuda === 4, '受取済み報酬を夜行開始時に反映');
  Object.keys(SPECIES).slice(10, 25).forEach(id => { G.dex[id] = 2; });
  syncAchievementState(G);
  ok(claimReward('dex_25').ok && R.fuda === 4, '進行中の夜行へ新しい恒久報酬を遡及しない');
  clearRun(); R = null; B = null;
  G = originalGame;
  save();
}

// --- 属性 ---
ok(elementMult('wood', 'earth') === 1.5, '木剋土=1.5');
ok(elementMult('earth', 'wood') === 0.75, '土は木に0.75');
ok(elementMult('fire', null) === 1, '無属性=1.0');

// --- 憑合完成予定Lv ---
{
  const unit = (sp, lv) => ({ sp, exp: EXP_TABLE[lv - 1] });
  ok(fusionResultLevel(unit('onibi', 1), unit('tanuki', 1)) === 1, '異種Lv1+Lv1→完成予定Lv1');
  ok(fusionResultLevel(unit('onibi', 1), unit('tanuki', 5)) === 3, '異種Lv1+Lv5→完成予定Lv3');
  ok(fusionResultLevel(unit('onibi', 1), unit('onibi', 5)) === 5, '同種Lv1+Lv5→高いLv5を維持');
}

// --- データ整合 ---
ok(Object.keys(SPECIES).length === 55, 'M6-B: 妖怪55種');
ok(RECIPES.length === 54, 'M6-B: レシピ54通り');
ok(RECIPES.every(r => SPECIES[r.result] && SPECIES[r.pair[0]] && SPECIES[r.pair[1]]), 'レシピ参照整合');
{
  const pairKeys = RECIPES.map(r => r.pair.slice().sort().join('+'));
  const materialCounts = Object.fromEntries(Object.keys(SPECIES).map(id => [id, 0]));
  RECIPES.forEach(r => r.pair.forEach(id => { materialCounts[id]++; }));
  const wild = Object.values(SPECIES).filter(s => s.tier > 0);
  ok(new Set(pairKeys).size === pairKeys.length, 'M6-A: 素材ペアに重複なし');
  ok(wild.every(s => materialCounts[s.id] >= 1), 'M6-A: 野生33種すべてが憑合素材になる');
  ok(Math.max(...wild.map(s => materialCounts[s.id])) <= 4, 'M6-A: 野生素材の使用頻度は最大4レシピ');
  ok(findRecipe('nekomata', 'kudagitsune').result === 'kyubi'
    && findRecipe('amanojaku', 'dorotabo').result === 'tatarigami'
    && findRecipe('kasha', 'shiranui').result === 'suzaku', 'M6-A: 新しい序盤・中盤・終盤レシピ');
  ok(findRecipe('tanuki', 'itsumade').result === 'furi'
    && findRecipe('hitotsume', 'kasha').result === 'wanyudo'
    && findRecipe('amefuri', 'umibozu').result === 'isonade', 'M6-B: 五行追加妖怪の代表レシピ');
  ok(['furi', 'wanyudo', 'nurikabe', 'tesso', 'isonade'].every(id =>
    RECIPES.filter(r => r.result === id).length === 2), 'M6-B: 追加5種に各2通りの憑合経路');
}
ok(DUNGEON_ORDER.every(d => {
  const dg = DUNGEONS[d];
  return dg.pools.t1.every(s => SPECIES[s] && SPECIES[s].tier === 1) &&
         dg.pools.t2.every(s => SPECIES[s] && SPECIES[s].tier === 2);
}), 'ダンジョン出現テーブルのtier整合');
ok(Object.values(SPECIES).filter(s => s.tier === 0).length === 22, '憑合限定22種');
ok(Object.values(SPECIES).every(s => s.tier === 0 || (s.enemy && s.enemy.hp > 0)), '野生種は敵ステータスを持つ');
ok(Object.keys(ITEMS).length === 8, '呪具8種');
const conditionedSpecies = Object.values(SPECIES).filter(s => s.encounter);
ok(conditionedSpecies.length === 5, '時間/月相条件付き妖怪5種');
ok(conditionedSpecies.every(s => s.encounter.hint && s.encounter.weight >= 1), '条件付き妖怪にヒント・重みあり');
ok(conditionedSpecies.every(s =>
  (!s.encounter.timeBands || s.encounter.timeBands.every(id => TIME_BANDS.some(x => x.id === id))) &&
  (!s.encounter.moonPhases || s.encounter.moonPhases.every(id => MOON_PHASES.some(x => x.id === id)))
), '出現条件IDの整合');
{
  const dayNew = { timeBand: 'day', moonPhase: 'new' };
  const nightNew = { timeBand: 'night', moonPhase: 'new' };
  const dayFull = { timeBand: 'day', moonPhase: 'full' };
  ok(encounterPool(['onibi', 'chochin'], dayNew).join(',') === 'onibi', '昼は提灯お化けを通常候補から除外');
  ok(encounterPool(['onibi', 'chochin'], nightNew).filter(id => id === 'chochin').length === 2, '夜は提灯お化けの重み2');
  const fullPool = encounterPool(['gaikotsu', 'hyakume', 'satori'], dayFull);
  ok(fullPool.filter(id => id === 'hyakume').length === 4 && fullPool.filter(id => id === 'satori').length === 4, '満月レア2種の重み4');
  const offMoonPool = encounterPool(['gaikotsu', 'hyakume', 'satori'], dayNew);
  ok(offMoonPool.filter(id => id === 'hyakume').length === 1 && offMoonPool.filter(id => id === 'satori').length === 1, '満月外もレア2種へ低確率で到達可能');
  ok(encounterPool(['chochin'], dayNew)[0] === 'chochin', '条件で候補0件なら元テーブルへフォールバック');
  const contexts = TIME_BANDS.flatMap(band => MOON_PHASES.map(moon => ({ timeBand: band.id, moonPhase: moon.id })));
  ok(contexts.every(time => DUNGEON_ORDER.every(id =>
    encounterPool(DUNGEONS[id].pools.t1, time).length > 0 && encounterPool(DUNGEONS[id].pools.t2, time).length > 0
  )), '全時間帯×月相で全ダンジョンの出現候補あり');
}
// 憑合限定種はすべてレシピの結果に登場する(作れない種がいない)
{
  const results = new Set(RECIPES.map(r => r.result));
  const unreachable = Object.values(SPECIES).filter(s => s.tier === 0 && !results.has(s.id));
  ok(unreachable.length === 0, `憑合限定種は全て作成可能 ${unreachable.map(s => s.id).join(',')}`);
}

// --- ダンジョン解放 ---
ok(dungeonUnlocked('d1') && !dungeonUnlocked('d2') && !dungeonUnlocked('d3'), '初期はd1のみ');
ok(runMaxHp() === 30, '初期最大HP30');
G.dungeonClears.d1 = 1;
ok(dungeonUnlocked('d2') && runMaxHp() === 45, 'd1踏破でd2解放+HP45');
G.dungeonClears.d1 = 0;

// --- ラン開始・戦闘 ---
runTimeProvider = () => gameTimeAt(new Date(2026, 6, 18, 22, 0));
startRun('d1');
ok(R.hp === 30 && R.fuda === 3 && R.dungeon === 'd1', 'ラン初期値');
ok(R.time.timeBand === 'night' && validRunTime(R.time), '出撃開始時の時間帯・月相をランへ固定');
runTimeProvider = () => gameTimeAt(new Date(2026, 6, 19, 12, 0));
ok(encounterPool(['onibi', 'chochin'], R.time).includes('chochin'), '端末時刻が変わってもランの出現条件は固定');
runTimeProvider = currentGameTime;
R.depth = 1;
const group = makeGroup('battle');
ok(group.length >= 1 && group.length <= 2 && group.every(e => e.tier === 1), 'd1序盤: tier1のみ1-2体');
startBattle(group);
ok(B.turn === 1 && B.energy === 3, 'T1霊力3');
ok(B.hand.length === 4, '初手4枚');
ok(group.every(e => G.dex[e.sp] >= 1), '遭遇で図鑑に目撃記録');

const atkUid = B.hand.find(uid => cardValues(getUnit(uid)).dmg > 0);
if (atkUid) {
  const idx = B.enemies.indexOf(aliveEnemies()[0]);
  const before = B.enemies[idx].hp;
  const r = playCard(atkUid, idx);
  ok(!r.err, '攻撃カード使用');
  ok(B.enemies[idx].hp < before || B.enemies[idx].state === 'dead', 'ダメージ反映');
}

// M4.6: 未踏破中は手加減フラグを立てても致死ダメージを止めない
{
  const strong = addUnit('onibi', EXP_TABLE[LEVEL_MAX - 1]); strong.star = STAR_MAX;
  const enemy = makeEnemy('onibi', 1, 1);
  startBattle([enemy]); B.hand = [strong.uid]; B.energy = ENERGY_MAX; B.mercy = true;
  playCard(strong.uid, 0);
  ok(!mercyAvailable() && enemy.state === 'dead', 'M4.6: 未踏破ダンジョンでは手加減不可');
  G.roster = G.roster.filter(u => u !== strong); G.deck = G.deck.filter(id => id !== strong.uid);
}
B.energy = 0;
if (B.hand[0]) ok(playCard(B.hand[0], 0).err === '霊力が足りない', '霊力不足エラー');

// --- 毒・弱体 ---
{
  const dog = addUnit('okuriinu', 0);
  const yuki = addUnit('yukionna', 0);
  startBattle([makeEnemy('kappa', 1, 1)]);
  B.hand = [dog.uid, yuki.uid];
  B.energy = 6;
  const e = B.enemies[0];
  playCard(dog.uid, 0);
  ok(e.poison === 2, '送り犬で毒2付与');
  playCard(yuki.uid, 0);
  ok(e.weak === 2, '雪女で弱体2付与');
  const baseAtk = e.atk;
  ok(enemyAtk(e) === Math.max(0, baseAtk - 2), '弱体で攻撃減');
  const hpBefore = e.hp;
  R.hp = 30;
  endTurn();
  ok(e.state !== 'alive' || (e.hp === hpBefore - 2 && e.poison === 1), '毒ダメージ2→毒1に減衰');
  // 後始末: 追加ユニットを除去
  G.roster = G.roster.filter(u => u !== dog && u !== yuki);
  G.deck = G.deck.filter(id => id !== dog.uid && id !== yuki.uid);
}

// --- 調伏 ---
startBattle(makeGroup('battle'));
B.energy = 5;
const target = aliveEnemies()[0];
target.hp = Math.max(1, Math.floor(target.maxHp * 0.1));
ok(canCapture(target), 'HP10%で調伏可');
const rate = captureRate(target);
ok(rate >= 5 && rate <= 95, `成功率クランプ (${rate}%)`);
let captured = false;
for (let i = 0; i < 50 && !captured; i++) {
  R.fuda = 5; B.energy = 5;
  if (tryCapture(B.enemies.indexOf(target)).ok) captured = true;
  if (B.over) break;
}
ok(captured, '調伏成功する(確率試行)');
ok(G.dex[target.sp] === 2, '調伏で図鑑が使役に');

// --- 倒し切りでEXP ---
startBattle(makeGroup('battle'));
for (const e of aliveEnemies()) dealDamage(e, 999, null);
checkWin();
ok(B.over === 'win', '全滅で勝利');
ok(B.expGained > 0, '倒し切りでEXP付与');

// --- 敵ターンで死亡 ---
startBattle(makeGroup('battle'));
R.hp = 1;
B.block = 0;
endTurn();
ok(B.over === 'lose' && R.hp === 0, 'HP0で敗北');

// --- ボス(d1) ---
R.hp = 30;
R.depth = 9;
ok(nodeOptions()[0].type === 'boss', 'd1: 10歩目はボス');
R.depth = 10;
const bg = makeGroup('boss');
ok(bg[0].boss && bg[0].hp === 60, 'ボス生成');
startBattle(bg, { boss: true });
bg[0].hp = 1;
ok(!canCapture(bg[0]), 'ボス調伏不可');
B.turn = 3;
ok(enemyAtk(bg[0]) === 12, 'ボス3の倍数ターン強攻撃');
// ボス撃破でダンジョンクリア記録
dealDamage(bg[0], 999, null);
checkWin();
ok(B.over === 'win' && G.dungeonClears.d1 === 1 && R.clear, 'ボス撃破でd1クリア記録');
ok(dungeonUnlocked('d2'), 'd2解放');

// --- M4.6: 踏破済みダンジョンの手加減 ---
{
  const strong = addUnit('onibi', EXP_TABLE[LEVEL_MAX - 1]); strong.star = STAR_MAX;
  const aoe = addUnit('shiranui', EXP_TABLE[LEVEL_MAX - 1]); aoe.star = STAR_MAX;
  const poisoner = addUnit('okuriinu', EXP_TABLE[LEVEL_MAX - 1]); poisoner.star = STAR_MAX;

  const normalTarget = makeEnemy('onibi', 1, 1);
  startBattle([normalTarget]); B.hand = [strong.uid]; B.energy = ENERGY_MAX;
  playCard(strong.uid, 0);
  ok(mercyAvailable() && normalTarget.state === 'dead', 'M4.6: 手加減OFFなら高火力攻撃で通常どおり討伐');

  const spared = makeEnemy('onibi', 1, 1);
  startBattle([spared]); B.hand = [strong.uid]; B.energy = ENERGY_MAX; B.mercy = true;
  playCard(strong.uid, 0);
  ok(spared.state === 'alive' && spared.hp === 1 && spared.mercyTag, 'M4.6: 単体致死ダメージをHP1で止める');
  ok(canCapture(spared) && B.log.some(line => line.includes('手加減して')), 'M4.6: 手加減直後に調伏可能でログを表示');

  const sturdy = makeEnemy('kappa', 1, 1);
  const sturdyBefore = sturdy.hp;
  startBattle([sturdy]); B.hand = [strong.uid]; B.energy = ENERGY_MAX; B.mercy = true;
  playCard(strong.uid, 0);
  ok(sturdy.state === 'alive' && sturdy.hp < sturdyBefore && sturdy.hp > 1 && !sturdy.mercyTag, 'M4.6: 非致死の単体攻撃は通常ダメージ');

  const swept = makeEnemy('onibi', 1, 1);
  startBattle([swept]); B.hand = [aoe.uid]; B.energy = ENERGY_MAX; B.mercy = true;
  playCard(aoe.uid);
  ok(swept.state === 'dead', 'M4.6: 全体攻撃は手加減対象外');

  const poisoned = makeEnemy('onibi', 1, 1); poisoned.hp = 5;
  startBattle([poisoned]); B.hand = [poisoner.uid]; B.energy = ENERGY_MAX; B.mercy = true;
  playCard(poisoner.uid, 0);
  ok(poisoned.hp === 1 && poisoned.poison > 0, 'M4.6: 毒付き単体攻撃の直接ダメージはHP1で止める');
  R.hp = R.maxHp; endTurn();
  ok(poisoned.state === 'dead', 'M4.6: 継続毒ダメージは手加減対象外');

  const boss = makeGroup('boss')[0]; boss.hp = 10;
  startBattle([boss], { boss: true }); B.hand = [strong.uid]; B.energy = ENERGY_MAX; B.mercy = true;
  playCard(strong.uid, 0);
  ok(boss.state === 'dead', 'M4.6: ボスは手加減対象外');

  startBattle([makeEnemy('onibi', 1, 1)]);
  ok(B.mercy === false, 'M4.6: 別戦闘へ手加減ONを持ち越さない');
  G.roster = G.roster.filter(u => ![strong, aoe, poisoner].includes(u));
  G.deck = G.deck.filter(id => ![strong.uid, aoe.uid, poisoner.uid].includes(id));
}

// --- 重ね(同種憑合) ---
{
  const a = addUnit('onibi', 14); // Lv3
  const b = addUnit('onibi', 0);  // Lv1
  const res = fuseUnits(a.uid, b.uid);
  ok(res.unit && res.unit.sp === 'onibi' && res.unit.star === 1, '同種→★1');
  ok(unitLevel(res.unit) === 3, '重ねは高い方のLvを維持');
  const v = cardValues(res.unit);
  ok(v.dmg === 4 + 2 + 2, '★1+Lv3の数値(4+Lv2+★2)');
  // ★上限
  const c = addUnit('onibi', 0); c.star = 3;
  const d = addUnit('onibi', 0); d.star = 3;
  const res2 = fuseUnits(c.uid, d.uid);
  ok(!!res2.err, '★3同士は重ね不可');
  G.roster = G.roster.filter(u => u !== c && u !== d && u !== res.unit);
  G.deck = G.deck.filter(id => [c.uid, d.uid, res.unit.uid].indexOf(id) < 0);
}

// --- 異種憑合 ---
{
  const roster0 = G.roster.length;
  const onibi = G.roster.find(u => u.sp === 'onibi') || addUnit('onibi', 0);
  const tanuki = G.roster.find(u => u.sp === 'tanuki') || addUnit('tanuki', 0);
  const res = fuseUnits(onibi.uid, tanuki.uid);
  ok(res.unit && res.unit.sp === 'kyubi', '鬼火×狸=九尾');
  ok(G.found.includes('kyubi'), 'レシピ発見記録');
  ok(fuseUnits(G.roster[0].uid, G.roster[0].uid).err, '同一個体は憑合不可');
}

// --- 呪具 ---
{
  G.items = {};
  gainItem('oniudewa'); gainItem('tengugeta'); gainItem('shibarinawa');
  const u = addUnit('kappa', 0); // コスト2・攻7
  ok(equipItem(u.uid, 'oniudewa'), '呪具を装備できる');
  ok(itemCount('oniudewa') === 0, '装備で在庫が減る');
  ok(cardValues(u).dmg === 10, '鬼の腕輪で攻撃7→10');
  ok(equipItem(u.uid, 'tengugeta'), '付け替えできる');
  ok(itemCount('oniudewa') === 1, '付け替えで元の呪具が袋へ戻る');
  ok(effCost(u) === 1, '天狗の下駄でコスト2→1');
  const k1 = addUnit('kamaitachi', 0); // コスト1
  gainItem('tengugeta');
  ok(equipItem(k1.uid, 'tengugeta') && effCost(k1) === 1, 'コスト下限は1');
  ok(unequipItem(k1.uid) && itemCount('tengugeta') === 1, 'はずすと袋へ戻る');

  // 縛りの縄: 攻撃した敵の調伏率+10
  const s1 = addUnit('onibi', 0);
  ok(equipItem(s1.uid, 'shibarinawa'), '縛りの縄を装備');
  startRun('d1'); R.depth = 1;
  startBattle([makeEnemy('chochin', 1, 1)]);
  B.hand = [s1.uid]; B.energy = 6;
  playCard(s1.uid, 0);
  const en = B.enemies[0];
  if (en.state === 'alive') {
    en.hp = Math.max(1, Math.floor(en.maxHp * 0.2));
    const base = 50 + Math.round((0.30 - en.hp / en.maxHp) * 150);
    ok(captureRate(en) === base + 10, '縄で調伏成功率+10');
  } else ok(true, '縄テスト: 敵撃破のためスキップ');

  // 憑合で装備中呪具が戻る
  const f1 = addUnit('onibi', 0), f2 = addUnit('onibi', 0);
  gainItem('juzu');
  equipItem(f1.uid, 'juzu');
  const juzuBefore = itemCount('juzu');
  const fres = fuseUnits(f1.uid, f2.uid);
  ok(fres.unit && itemCount('juzu') === juzuBefore + 1, '憑合で装備中呪具が袋へ戻る');

  // 座敷童子の札生成
  const z = addUnit('zashiki', 0);
  startBattle([makeEnemy('onibi', 1, 1)]);
  B.hand = [z.uid]; B.energy = 6;
  const fudaBefore = R.fuda;
  playCard(z.uid);
  ok(R.fuda === fudaBefore + 1, '座敷童子で調伏札+1');

  // 宝は札か呪具
  const t = applyTreasure();
  ok(t.kind === 'fuda' || t.kind === 'item', '宝の結果種別');

  // ボス撃破で呪具確定ドロップ
  R.depth = 10;
  const bgroup = makeGroup('boss');
  startBattle(bgroup, { boss: true, expMult: 1 });
  const totBefore = itemTotal();
  dealDamage(bgroup[0], 999, null);
  checkWin();
  ok(B.itemDrop && itemTotal() === totBefore + 1, 'ボス撃破で呪具ドロップ');
}

// --- セーブ書き出し/読み込み ---
{
  save();
  const code = exportSave();
  const snapshot = JSON.stringify(G);
  ok(code.startsWith('HYAKKI1.'), '引継ぎコード形式');
  G.stats.runs = 999;
  ok(importSave(code), '引継ぎコード読み込み成功');
  ok(JSON.stringify(G) === snapshot, '読み込みで状態復元');
  ok(!importSave('でたらめ'), '不正コードは拒否');

  const json = exportSaveJson();
  const backup = JSON.parse(json);
  ok(backup.format === 'HYAKKI_SAVE' && backup.version === 1 && backup.appVersion === APP_VERSION && backup.exportedAt, 'M5-G: JSONバックアップ形式');
  G.stats.runs = 998;
  ok(importSave(json), 'M5-G: JSONバックアップ読み込み成功');
  ok(JSON.stringify(G) === snapshot, 'M5-G: JSONバックアップで状態復元');
  ok(!importSave('{"format":"HYAKKI_SAVE","version":99,"data":{}}'), 'M5-G: 未対応JSON版を拒否');
}

// --- セーブ/ロード往復 ---
{
  save();
  const snapshot = JSON.stringify(G);
  G = null;
  load();
  ok(JSON.stringify(G) === snapshot, 'セーブ/ロード往復一致');
}

// --- M4-D: 新規/M3旧セーブ/引継ぎコードの3経路 ---
{
  localStorage.removeItem(SAVE_KEY);
  load();
  ok(G.achievements.unlocked.length === 0 && G.achievements.seen.length === 0
    && G.achievementRewards.claimed.length === 0, 'M4-D新規開始: 実績・確認・報酬状態を初期化');

  const oldRoster = Object.keys(SPECIES).slice(0, 10).map((sp, index) => ({ uid: index + 1, sp, exp: index === 0 ? 10 : 0 }));
  const old = { nextUid: 11, roster: oldRoster, deck: oldRoster.map(u => u.uid), found: [], stats: { runs: 5, clears: 2, captures: 3, fusions: 1 } };
  localStorage.setItem(SAVE_KEY, JSON.stringify(old));
  load();
  ok(G.roster.every(u => u.star === 0), '旧セーブ: star補完');
  ok(G.dungeonClears.d1 === 2, '旧セーブ: クリア数をd1へ移行');
  ok(G.dex.onibi === 2, '旧セーブ: 図鑑を所持から復元');
  ok(['first_capture', 'first_fusion', 'clear_d1', 'dex_10'].every(id => G.achievements.unlocked.includes(id)), '旧セーブ: 実績を既存記録から補完');
  ok(G.achievementRewards.claimed.length === 0, '旧セーブ: 報酬受取状態を未受取で補完');
  ok(G.ui.onboardingSeen && !G.ui.reducedMotion, 'M5-B旧セーブ: 導入済みとして設定を補完');

  ok(claimReward('dex_10').ok, 'M4-D旧セーブ: 補完した実績報酬を一度受取');
  const migratedCode = exportSave();
  G.achievements = { unlocked: [], seen: [] };
  G.achievementRewards = { claimed: [] };
  ok(importSave(migratedCode), 'M4-D引継ぎ: 移行済みコードを復元');
  ok(G.achievements.unlocked.includes('dex_10') && G.achievementRewards.claimed.join(',') === 'dex_10', 'M4-D引継ぎ: 達成・受取状態を保持');
  ok(!claimReward('dex_10').ok && G.achievementRewards.claimed.length === 1, 'M4-D引継ぎ: 復元後も報酬を二重取得しない');
}

// --- M4-D: 全実績の同時到達可能性 ---
{
  const completeGame = {
    roster: [{ uid: 1, sp: 'nurarihyon', exp: 0, star: 3 }],
    dex: {}, dungeonClears: { d1: 1, d2: 1, d3: 1 },
    stats: { runs: 3, clears: 3, captures: 1, fusions: 1 },
    achievements: { unlocked: [], seen: [] }, achievementRewards: { claimed: [] },
  };
  Object.keys(SPECIES).forEach(id => { completeGame.dex[id] = 2; });
  syncAchievementState(completeGame);
  ok(completeGame.achievements.unlocked.length === ACHIEVEMENTS.length, 'M4-D: 全11実績を同一セーブで到達可能');
  ok(evaluateAchievements(completeGame).every(status => status.done), 'M4-D: 全実績の条件判定が達成状態になる');
}

// --- M4.5: 目標・位階・一度きりの選択報酬 ---
{
  const progressionGame = {
    roster: [], dex: {}, items: {}, dungeonClears: { d1: 0, d2: 0, d3: 0, trial: 0 },
    stats: { runs: 0, clears: 0, captures: 0, fusions: 0 },
    achievements: { unlocked: [], seen: [] }, achievementRewards: { claimed: [] },
    progression: { unlocked: [], seen: [], choices: {} },
  };
  ok(PROGRESSION_MILESTONES.length === 11 && nextProgressionGoal(progressionGame).id === 'first_capture', 'M4.5: 最初の次目標は初調伏');
  progressionGame.stats.captures = 1;
  syncAchievementState(progressionGame);
  syncProgressionState(progressionGame);
  ok(currentProgressionRank(progressionGame).value === 1 && unseenProgressionMilestoneIds(progressionGame).join(',') === 'first_capture', 'M4.5: 節目達成で位階と解放通知を更新');
  markProgressionMilestonesSeen(progressionGame);
  ok(unseenProgressionMilestoneIds(progressionGame).length === 0, 'M4.5: 位階通知を確認済みにできる');

  progressionGame.roster = [{ uid: 1, sp: 'onibi', exp: 0, star: 3 }];
  syncAchievementState(progressionGame);
  syncProgressionState(progressionGame);
  const itemBefore = progressionGame.items.oniudewa || 0;
  ok(claimProgressionChoice(progressionGame, 'first_star3', 'oniudewa').ok, 'M4.5: ★3報酬の入門呪具を選択');
  ok(progressionGame.items.oniudewa === itemBefore + 1, 'M4.5: 選択した呪具を一度だけ加算');
  ok(!claimProgressionChoice(progressionGame, 'first_star3', 'juzu').ok && progressionGame.items.juzu == null, 'M4.5: 位階選択報酬を二重取得しない');

  Object.keys(SPECIES).slice(0, 25).forEach(id => { progressionGame.dex[id] = 2; });
  syncAchievementState(progressionGame);
  syncProgressionState(progressionGame);
  ok(treasureChoiceUnlocked(progressionGame), 'M4.5: 図鑑25種で宝の選択肢を解放');

  progressionGame.dungeonClears.trial = 1;
  syncProgressionState(progressionGame);
  ok(finalTrialCleared(progressionGame) && progressionGame.progression.unlocked.includes('final_trial'), 'M4.5: 最終夜行踏破を位階へ記録');
}

// --- M4.5: 百鬼の試練の解放・既存ボス再利用 ---
{
  localStorage.removeItem(SAVE_KEY);
  load();
  ok(!dungeonUnlocked('trial'), 'M4.5: 百鬼の試練は初期ロック');
  G.dungeonClears.d1 = 1; G.dungeonClears.d2 = 1; G.dungeonClears.d3 = 1;
  save();
  ok(dungeonUnlocked('trial') && runMaxHp() === 75, 'M4.5: d3踏破で百鬼の試練を解放しHP上限75');
  startRun('trial');
  R.depth = DUNGEONS.trial.length;
  const finalBosses = makeGroup('boss');
  ok(finalBosses.length === 3 && finalBosses.every(enemy => enemy.boss), 'M4.5: 最終戦は既存3ボスの再臨');
  const fudaBeforeChoice = R.fuda;
  const itemBeforeChoice = itemTotal();
  const choiceResults = treasureChoiceOptions();
  ok(choiceResults.length === 2 && choiceResults.some(x => x.kind === 'fuda') && choiceResults.some(x => x.kind === 'item'), 'M4.5: 宝で札と呪具の2択を生成');
  applyTreasureChoice(choiceResults.find(x => x.kind === 'fuda'));
  ok(R.fuda > fudaBeforeChoice && itemTotal() === itemBeforeChoice, 'M4.5: 宝の札選択だけを反映');
  G.roster[0].star = 3;
  save();
  ok(claimRankChoice('first_star3', 'juzu').ok, 'M4.5: 永続セーブで位階選択報酬を受取');
  const rankRewardCode = exportSave();
  const juzuAfterClaim = itemCount('juzu');
  G.progression.choices = {}; G.items.juzu = 0;
  ok(importSave(rankRewardCode) && progressionChoiceClaimed(G, 'first_star3') && itemCount('juzu') === juzuAfterClaim, 'M4.5: 引継ぎで位階報酬の選択と個数を保持');
  ok(!claimRankChoice('first_star3', 'oniudewa').ok && itemCount('juzu') === juzuAfterClaim, 'M4.5: 引継ぎ後も位階報酬を二重取得しない');
  clearRun(); R = null; B = null;
}

// --- 式神代行(オート) ---
{
  localStorage.removeItem(SAVE_KEY);
  load();
  G.dungeonClears.d1 = 1;
  startRun('d1');
  R.depth = 1;
  startBattle(makeGroup('battle'), { expMult: 1 });
  ok(autoAvailable(), 'クリア済みでオート解放');
  B.mercy = true;
  autoResolveBattle();
  ok(B.over === 'win' || B.over === 'lose', 'オートで戦闘が決着');
  ok(B.captured.length === 0, 'オートでは調伏しない');
  ok(B.mercy === false, 'M4.6: 式神代行は手加減を使わない');
}

// --- ラン途中セーブ(M1) ---
{
  localStorage.removeItem(SAVE_KEY);
  clearRun();
  load();

  // 戦闘外: ラン開始時点で保存され、分かれ道から再開できる
  startRun('d1');
  ok(peekRun() && peekRun().b === null, 'ラン開始で保存(戦闘なし)');

  // M3-C以前のランは、復元時の日時を一度だけ補完して以後固定する
  const legacyRun = peekRun();
  delete legacyRun.r.time;
  localStorage.setItem(RUN_KEY, JSON.stringify(legacyRun));
  runTimeProvider = () => gameTimeAt(new Date(2026, 6, 18, 2, 0));
  R = null; B = null;
  ok(loadRun() && R.depth === 0 && B === null, '戦闘外の復元');
  ok(R.time.timeBand === 'witching' && validRunTime(R.time), '旧ランへ復元時の時間コンテキストを補完');
  runTimeProvider = () => gameTimeAt(new Date(2026, 6, 18, 12, 0));
  R = null; B = null;
  ok(loadRun() && R.time.timeBand === 'witching', '旧ラン補完は一度だけで以後固定');
  runTimeProvider = currentGameTime;

  // 戦闘中: ターン頭の状態が保存され、ターン途中の変化は巻き戻る
  R.depth = 1;
  startBattle(makeGroup('battle'), { expMult: 1 });
  const legacyMercyRun = peekRun();
  delete legacyMercyRun.b.mercy;
  localStorage.setItem(RUN_KEY, JSON.stringify(legacyMercyRun));
  R = null; B = null;
  ok(loadRun() && B.mercy === false, 'M4.6: 旧ランの手加減状態をOFFで補完');
  B.mercy = true; saveRun(); R = null; B = null;
  ok(loadRun() && B.mercy === false, 'M4.6: 未踏破ダンジョンの不正な手加減ONを復元時に解除');
  G.dungeonClears.d1 = 1;
  B.mercy = true; saveRun(); R = null; B = null;
  ok(loadRun() && B.mercy === true, 'M4.6: 踏破済みダンジョンの手加減ONを途中再開で復元');
  B.mercy = false; saveRun();
  const snap = JSON.stringify(serializeRun());
  const handAtTurnStart = B.hand.join(',');
  R.hp -= 7; B.energy = 0; B.hand = []; B.enemies[0].hp = 1;
  ok(loadRun(), '戦闘中の保存を復元できる');
  ok(JSON.stringify(serializeRun()) === snap, '復元でターン頭の状態に一致');
  ok(B.hand.join(',') === handAtTurnStart, '手札がターン頭に戻る');

  // 調伏成功は即時上書き保存され、復元しても妖怪が二重にならない
  const cap = aliveEnemies()[0];
  cap.hp = 1;
  let captured2 = false;
  for (let i = 0; i < 60 && !captured2; i++) {
    R.fuda = 9; B.energy = 9;
    captured2 = !!tryCapture(B.enemies.indexOf(cap)).ok;
  }
  if (captured2) {
    const rosterLen = G.roster.length;
    ok(loadRun(), '調伏後の保存を復元できる');
    ok(G.roster.length === rosterLen, '復元で手持ちが増減しない');
    ok(B.enemies.some(e => e.state === 'captured'), '復元後も調伏済みのまま(二重調伏不可)');
    ok(R.captured.every(u => G.roster.includes(u)), '復元したcapturedはrosterの個体を指す');
  } else ok(false, '調伏成功する(確率試行・ランセーブ)');

  // ノードイベントでも保存が更新される
  R.depth++;
  applyTreasure();
  const d = peekRun();
  ok(d && d.r.depth === R.depth && d.r.hp === R.hp && d.r.fuda === R.fuda, '宝でラン保存が更新される');

  // 引継ぎコードにラン状態は含めない(手持ちだけ持ち運ぶ)
  const dec = JSON.parse(decodeURIComponent(escape(atob(exportSave().slice(8)))));
  ok(dec.dungeon === undefined && dec.hand === undefined && dec.enemies === undefined, '引継ぎコードにラン状態を含めない');

  clearRun();
  ok(!peekRun() && !loadRun(), 'clearRunで保存が消える');
}

// --- M3-D/M6-B: 全時間帯×代表月相の敵編成・全55種到達性 ---
{
  const representativePhases = ['new', 'first-quarter', 'full', 'last-quarter'];
  const contexts = TIME_BANDS.flatMap(band => representativePhases.map(moonPhase => ({ timeBand: band.id, moonPhase })));
  const previousR = R;
  const originalRandom = Math.random;
  let seed = 0x3d2026;
  Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);

  let groupsGenerated = 0;
  let enemiesGenerated = 0;
  let conditionLeaks = 0;
  let missingBossGroups = 0;
  const conditionalCounts = Object.fromEntries(conditionedSpecies.map(s => [s.id, 0]));
  try {
    for (const time of contexts) {
      for (const dungeon of DUNGEON_ORDER) {
        const dg = DUNGEONS[dungeon];
        const depths = [1, Math.ceil(dg.length / 2), dg.length - 1];
        for (const depth of depths) {
          R = { dungeon, depth, time };
          for (let i = 0; i < 80; i++) {
            const kind = i % 4 === 0 ? 'elite' : 'battle';
            const group = makeGroup(kind);
            groupsGenerated++;
            enemiesGenerated += group.length;
            for (const enemy of group) {
              if (SPECIES[enemy.sp].encounter) {
                conditionalCounts[enemy.sp]++;
                const rule = SPECIES[enemy.sp].encounter;
                if (!encounterMatches(enemy.sp, time) && !(rule.offWeight > 0)) conditionLeaks++;
              }
            }
          }
        }
        R = { dungeon, depth: dg.length, time };
        const boss = makeGroup('boss');
        groupsGenerated++;
        if (boss.length < 1 || !boss.every(enemy => enemy.boss)) missingBossGroups++;
      }
    }
  } finally {
    Math.random = originalRandom;
    R = previousR;
  }
  console.log('時間連動編成シミュ:', JSON.stringify({ contexts: contexts.length, groupsGenerated, enemiesGenerated, conditionalCounts }));
  ok(conditionLeaks === 0, '条件外の妖怪が敵編成へ混入しない');
  ok(missingBossGroups === 0, '全時間帯×代表月相×全ダンジョンでボス編成あり');
  ok(Object.values(conditionalCounts).every(count => count > 0), '条件付き5種が対応する時間/月相で出現');

  // 野生種を起点に、材料2種が到達済みの憑合結果を反復追加する。
  const reachable = new Set(Object.values(SPECIES).filter(s => s.tier > 0 &&
    DUNGEON_ORDER.some(d => DUNGEONS[d].pools.t1.includes(s.id) || DUNGEONS[d].pools.t2.includes(s.id)) &&
    contexts.some(time => encounterMatches(s.id, time))).map(s => s.id));
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const recipe of RECIPES) {
      if (!reachable.has(recipe.result) && recipe.pair.every(id => reachable.has(id))) {
        reachable.add(recipe.result);
        expanded = true;
      }
    }
  }
  const unreachable = Object.keys(SPECIES).filter(id => !reachable.has(id));
  ok(reachable.size === 55 && unreachable.length === 0, `妖怪55種すべてに到達経路あり ${unreachable.join(',')}`);

  const allowedConditionKeys = new Set(['timeBands', 'moonPhases', 'weight', 'offWeight', 'hint']);
  ok(conditionedSpecies.every(s => Object.keys(s.encounter).every(key => allowedConditionKeys.has(key))), '長期固定の暦日・季節条件なし');
  ok(['hyakume', 'satori'].every(id => SPECIES[id].encounter.offWeight > 0), '満月レアも全月相で低確率出現し取得不能期間なし');
}

// --- 自動プレイ: d1→d2→d3を成長込みで通しシミュレーション ---
localStorage.removeItem(SAVE_KEY);
load();
Object.keys(SPECIES).forEach(id => { G.dex[id] = 2; });
syncAchievementState(G);
ACHIEVEMENTS.filter(def => def.reward).forEach(def => claimAchievementReward(G, def.id));
ok(achievementRewardTotal(G, 'startFuda') === 3 && runInitialFuda(G) === 6, 'M4-D: 全図鑑報酬でも初期調伏札は最大6枚');
let simSeed = 0x4d3444;
Math.random = () => {
  simSeed = (Math.imul(simSeed, 1664525) + 1013904223) >>> 0;
  return simSeed / 0x100000000;
};
const simResult = {};
let simRunCount = 0;
let allRewardRunsStartedAtSix = true;
for (const dgId of STORY_DUNGEON_ORDER) {
  // d3は呪具なしAIで数〜10ラン想定(開発計画の基準値)。運の下振れでのフレークを避けるため上限に余裕を持たせる
  const maxTries = dgId === 'd3' ? 25 : 15;
  let clears = 0, tries = 0;
  while (clears < 1 && tries < maxTries) {
    tries++;
    if (!dungeonUnlocked(dgId)) break;
    startRun(dgId);
    simRunCount++;
    allRewardRunsStartedAtSix = allRewardRunsStartedAtSix && R.fuda === 6;
    while (R.hp > 0 && !R.clear) {
      const opts = nodeOptions();
      const opt = opts[rand(opts.length)];
      R.depth++;
      if (opt.type === 'treasure') { applyTreasure(); continue; }
      if (opt.type === 'rest') { applyRest(R.hp < R.maxHp * 0.6 ? 'heal' : 'fuda'); continue; }
      startBattle(makeGroup(opt.type === 'boss' ? 'boss' : opt.type),
        opt.type === 'boss' ? { boss: true, expMult: DUNGEONS[dgId].expMult } : { expMult: DUNGEONS[dgId].expMult * (opt.type === 'elite' ? 2 : 1) });
      let guard = 0;
      while (!B.over && guard++ < 60) {
        let acted = true;
        while (acted && !B.over) {
          acted = false;
          for (const e of B.enemies) {
            if (canCapture(e) && R.fuda > 0 && B.energy >= 1) {
              tryCapture(B.enemies.indexOf(e)); acted = true;
              if (B.over) break;
            }
          }
          if (B.over) break;
          for (const uid of B.hand.slice()) {
            const u = getUnit(uid);
            if (!u || B.energy < SPECIES[u.sp].cost) continue;
            const v = cardValues(u);
            const alive = aliveEnemies();
            if ((v.dmg || v.poison || v.weaken) && alive.length) { playCard(uid, B.enemies.indexOf(alive[0])); acted = true; break; }
            if (!v.dmg && !v.poison && !v.weaken) { playCard(uid); acted = true; break; }
          }
        }
        if (!B.over) endTurn();
      }
      if (guard >= 60) { fails++; console.log('FAIL: 戦闘60ターン超過', dgId); break; }
      if (B.over === 'lose') break;
    }
    if (R.clear) clears++;
    // ラン後の育成(人間の行動を模擬): 同種2体は重ねて★を上げる
    let fusedSomething = true;
    while (fusedSomething) {
      fusedSomething = false;
      const bySp = {};
      for (const u of G.roster) (bySp[u.sp] = bySp[u.sp] || []).push(u);
      for (const sp in bySp) {
        const list = bySp[sp].sort((x, y) => (y.star - x.star) || (y.exp - x.exp));
        if (list.length >= 2 && Math.max(list[0].star, list[1].star) < STAR_MAX) {
          if (fuseUnits(list[0].uid, list[1].uid).unit) { fusedSomething = true; break; }
        }
      }
    }
    // 編成整理(人間の行動を模擬): 強い順に12枚まで
    const score = u => unitLevel(u) * 2 + u.star * 3 + SPECIES[u.sp].cost;
    const sorted = G.roster.slice().sort((x, y) => score(y) - score(x));
    G.deck = sorted.slice(0, Math.max(deckMinSize(), 12)).map(u => u.uid);
    save();
  }
  simResult[dgId] = { clears, tries };
  if (clears === 0) break;
}
console.log('通しシミュ結果:', JSON.stringify(simResult));
console.log('M4-D報酬込み評価:', JSON.stringify({ runs: simRunCount, initialFuda: runInitialFuda(G), captures: G.stats.captures }));
ok(simResult.d1 && simResult.d1.clears > 0, 'd1を踏破可能');
ok(simResult.d2 && simResult.d2.clears > 0, 'd2を踏破可能(成長込み)');
ok(simResult.d3 && simResult.d3.clears > 0, 'd3を踏破可能(成長込み)');
ok(simRunCount >= 3 && allRewardRunsStartedAtSix, 'M4-D: 報酬込みで3ラン以上を実行し毎回6枚開始');
ok(RUN_FUDA_BASE === 3 && achievementRewardTotal(G, 'startFuda') === 3, 'M4-D: 報酬は戦闘能力でなく初期調伏札+3に限定');

// --- M4.5: 育成済み編成で百鬼の試練を通し踏破 ---
localStorage.removeItem(SAVE_KEY);
load();
G.roster = []; G.deck = []; G.nextUid = 1;
['suzaku', 'seiryu', 'ryujin', 'daitengu', 'yatagarasu', 'shiranui', 'tamamo', 'kirin', 'hakutaku', 'genbu', 'byakko', 'nurarihyon'].forEach(sp => {
  const unit = addUnit(sp, EXP_TABLE[LEVEL_MAX - 1]);
  unit.star = STAR_MAX;
});
G.dungeonClears = { d1: 1, d2: 1, d3: 1, trial: 0 };
G.deck = G.roster.map(unit => unit.uid);
save();
let finalSeed = 0x4d3435;
Math.random = () => {
  finalSeed = (Math.imul(finalSeed, 1664525) + 1013904223) >>> 0;
  return finalSeed / 0x100000000;
};
let finalTries = 0;
while (!finalTrialCleared(G) && finalTries++ < 5) {
  startRun('trial');
  while (R.hp > 0 && !R.clear) {
    const opts = nodeOptions();
    let opt = R.hp < R.maxHp * 0.55 ? opts.find(x => x.type === 'rest') : null;
    opt = opt || opts.find(x => x.type === 'treasure') || opts.find(x => x.type === 'battle') || opts[0];
    R.depth++;
    if (opt.type === 'treasure') { applyTreasure(); continue; }
    if (opt.type === 'rest') { applyRest(R.hp < R.maxHp * 0.75 ? 'heal' : 'fuda'); continue; }
    startBattle(makeGroup(opt.type === 'boss' ? 'boss' : opt.type), {
      boss: opt.type === 'boss', elite: opt.type === 'elite',
      expMult: DUNGEONS.trial.expMult * (opt.type === 'elite' ? 2 : 1),
    });
    autoResolveBattle();
    if (B.over === 'lose') break;
  }
}
console.log('M4.5最終夜行シミュ:', JSON.stringify({ tries: finalTries, clears: G.dungeonClears.trial }));
ok(finalTrialCleared(G), 'M4.5: 育成・編成済みなら百鬼の試練を踏破可能');
ok(currentProgressionRank(G).name === '大調伏師' && G.progression.unlocked.includes('final_trial'), 'M4.5: 最終踏破で大調伏師とエンディングを解放');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
