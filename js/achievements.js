'use strict';

const FOUR_GOD_IDS = Object.freeze(['genbu', 'byakko', 'seiryu', 'suzaku']);

// M4-A: 表示・報酬から独立した実績定義。conditionを純粋関数で評価する。
const ACHIEVEMENTS = Object.freeze([
  { id: 'first_capture', name: '初調伏', description: '初めて妖怪を調伏する', condition: { type: 'stat', key: 'captures', target: 1 } },
  { id: 'first_fusion', name: '初憑合', description: '初めて憑合または重ねを行う', condition: { type: 'stat', key: 'fusions', target: 1 } },
  { id: 'clear_d1', name: '宵の小径踏破', description: '宵の小径を踏破する', condition: { type: 'dungeon', id: 'd1', target: 1 } },
  { id: 'clear_d2', name: '深山の霧道踏破', description: '深山の霧道を踏破する', condition: { type: 'dungeon', id: 'd2', target: 1 } },
  { id: 'clear_d3', name: '百鬼の御堂踏破', description: '百鬼の御堂を踏破する', condition: { type: 'dungeon', id: 'd3', target: 1 } },
  { id: 'first_star3', name: '極めし一体', description: '★3の妖怪を作る', condition: { type: 'rosterStar', target: 3 } },
  { id: 'dex_10', name: '十妖怪使役', description: '図鑑で10種を使役済みにする', condition: { type: 'dexOwned', target: 10 } },
  { id: 'dex_25', name: '二十五妖怪使役', description: '図鑑で25種を使役済みにする', condition: { type: 'dexOwned', target: 25 } },
  { id: 'dex_50', name: '百鬼図鑑', description: '図鑑50種を使役済みにする', condition: { type: 'dexOwned', target: 50 } },
  { id: 'four_gods', name: '四神制覇', description: '玄武・白虎・青龍・朱雀をすべて使役する', condition: { type: 'speciesSet', ids: FOUR_GOD_IDS, target: FOUR_GOD_IDS.length } },
  { id: 'nurarihyon', name: '総大将誕生', description: 'ぬらりひょんを使役する', condition: { type: 'speciesSet', ids: ['nurarihyon'], target: 1 } },
].map(Object.freeze));

function achievementDefinition(id) {
  return ACHIEVEMENTS.find(def => def.id === id) || null;
}

function achievementConditionValue(def, game) {
  const condition = def.condition;
  const stats = game.stats || {};
  const dex = game.dex || {};
  switch (condition.type) {
    case 'stat': return Math.max(0, Number(stats[condition.key]) || 0);
    case 'dungeon': return Math.max(0, Number((game.dungeonClears || {})[condition.id]) || 0);
    case 'rosterStar': return (game.roster || []).reduce((max, unit) => Math.max(max, Number(unit.star) || 0), 0);
    case 'dexOwned': return Object.values(dex).filter(value => value === 2).length;
    case 'speciesSet': return condition.ids.filter(id => dex[id] === 2).length;
    default: return 0;
  }
}

// 戻り値はgameを書き換えない。doneは現在条件または保存済み達成IDのどちらかで成立する。
function achievementProgress(def, game) {
  const current = achievementConditionValue(def, game);
  const target = def.condition.target;
  const unlocked = !!(game.achievements && Array.isArray(game.achievements.unlocked)
    && game.achievements.unlocked.includes(def.id));
  const done = unlocked || current >= target;
  return { id: def.id, current, value: done ? target : Math.min(current, target), target, done };
}

function evaluateAchievements(game) {
  return ACHIEVEMENTS.map(def => Object.assign({}, def, achievementProgress(def, game)));
}

// 保存前・旧セーブ読込時に現在条件を達成IDへ反映する。報酬受取状態はM4-Bで別管理する。
function syncAchievementState(game) {
  const knownIds = new Set(ACHIEVEMENTS.map(def => def.id));
  const existing = game.achievements && Array.isArray(game.achievements.unlocked)
    ? game.achievements.unlocked.filter(id => knownIds.has(id))
    : [];
  const unlocked = new Set(existing);
  const newlyUnlocked = [];
  for (const def of ACHIEVEMENTS) {
    if (!unlocked.has(def.id) && achievementConditionValue(def, game) >= def.condition.target) {
      unlocked.add(def.id);
      newlyUnlocked.push(def.id);
    }
  }
  game.achievements = { unlocked: ACHIEVEMENTS.map(def => def.id).filter(id => unlocked.has(id)) };
  return newlyUnlocked;
}
