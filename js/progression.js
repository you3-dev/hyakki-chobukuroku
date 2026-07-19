'use strict';

// M4.5: 既存実績を「次に目指すこと」と恒久解放へつなぐ進行表。
// 位階は達成した節目の数で決まり、節目自体は順不同でも失われない。
const PROGRESSION_RANK_NAMES = Object.freeze([
  '見習い', '若衆', '夜渡り', '十妖使い', '憑合師', '霧破り',
  '百妖頭', '御堂破り', '四神使い', '妖怪総大将', '百鬼蒐集家', '大調伏師',
]);

const PROGRESSION_MILESTONES = Object.freeze([
  { id: 'first_capture', name: '初めての調伏', description: '妖怪を1体調伏する', achievement: 'first_capture', area: 'dungeon', reward: '位階昇格と調伏師の歩みを記録' },
  { id: 'clear_d1', name: '宵の小径踏破', description: '宵の小径を初めて踏破する', achievement: 'clear_d1', area: 'dungeon', reward: '深山の霧道・術士HP+15・宵の式神代行/手加減' },
  { id: 'dex_10', name: '十妖怪使役', description: '図鑑で10種を使役する', achievement: 'dex_10', area: 'dex', reward: '次回夜行の初期調伏札+1' },
  { id: 'first_star3', name: '極めし一体', description: '★3の妖怪を作る', achievement: 'first_star3', area: 'fusion', reward: '入門呪具を1つ選んで獲得', choice: Object.freeze(['oniudewa', 'iwakabuto', 'juzu']) },
  { id: 'clear_d2', name: '深山の霧道踏破', description: '深山の霧道を初めて踏破する', achievement: 'clear_d2', area: 'dungeon', reward: '百鬼の御堂・術士HP+15・霧道の式神代行/手加減' },
  { id: 'dex_25', name: '二十五妖怪使役', description: '図鑑で25種を使役する', achievement: 'dex_25', area: 'dex', reward: '初期調伏札+1・宝で報酬を選択可能' },
  { id: 'clear_d3', name: '百鬼の御堂踏破', description: '百鬼の御堂を初めて踏破する', achievement: 'clear_d3', area: 'dungeon', reward: '百鬼の試練・術士HP+15・御堂の式神代行/手加減' },
  { id: 'four_gods', name: '四神制覇', description: '玄武・白虎・青龍・朱雀を使役する', achievement: 'four_gods', area: 'fusion', reward: '特別称号「四神使い」' },
  { id: 'nurarihyon', name: '総大将誕生', description: 'ぬらりひょんを使役する', achievement: 'nurarihyon', area: 'fusion', reward: '特別称号「妖怪総大将」' },
  { id: 'dex_50', name: '百鬼図鑑', description: '図鑑50種をすべて使役する', achievement: 'dex_50', area: 'dex', reward: '初期調伏札+1・百鬼蒐集家の証' },
  { id: 'final_trial', name: '百鬼の試練踏破', description: '最終夜行「百鬼の試練」を踏破する', dungeon: 'trial', area: 'dungeon', reward: 'エンディング・称号「大調伏師」・拠点の変化・試練の手加減' },
].map(Object.freeze));

function progressionMilestoneDefinition(id) {
  return PROGRESSION_MILESTONES.find(def => def.id === id) || null;
}

function progressionMilestoneDone(def, game) {
  if (def.achievement) {
    const achievement = achievementDefinition(def.achievement);
    return !!(achievement && achievementProgress(achievement, game).done);
  }
  if (def.dungeon) return Number((game.dungeonClears || {})[def.dungeon]) > 0;
  return false;
}

function progressionStatuses(game) {
  return PROGRESSION_MILESTONES.map(def => Object.assign({}, def, { done: progressionMilestoneDone(def, game) }));
}

function currentProgressionRank(game) {
  const value = progressionStatuses(game).filter(status => status.done).length;
  return { value, max: PROGRESSION_MILESTONES.length, name: finalTrialCleared(game) ? '大調伏師' : PROGRESSION_RANK_NAMES[value] };
}

function nextProgressionGoal(game, area) {
  const statuses = progressionStatuses(game);
  return statuses.find(status => !status.done && (!area || status.area === area)) || null;
}

function syncProgressionState(game) {
  const known = new Set(PROGRESSION_MILESTONES.map(def => def.id));
  const old = game.progression || {};
  const unlocked = new Set(Array.isArray(old.unlocked) ? old.unlocked.filter(id => known.has(id)) : []);
  const oldSeen = new Set(Array.isArray(old.seen) ? old.seen.filter(id => known.has(id)) : []);
  const newlyUnlocked = [];
  for (const def of PROGRESSION_MILESTONES) {
    if (!unlocked.has(def.id) && progressionMilestoneDone(def, game)) {
      unlocked.add(def.id);
      newlyUnlocked.push(def.id);
    }
  }
  const choices = {};
  for (const def of PROGRESSION_MILESTONES) {
    const itemId = old.choices && old.choices[def.id];
    if (def.choice && def.choice.includes(itemId) && unlocked.has(def.id)) choices[def.id] = itemId;
  }
  game.progression = {
    unlocked: PROGRESSION_MILESTONES.map(def => def.id).filter(id => unlocked.has(id)),
    seen: PROGRESSION_MILESTONES.map(def => def.id).filter(id => unlocked.has(id) && oldSeen.has(id)),
    choices,
  };
  return newlyUnlocked;
}

function unseenProgressionMilestoneIds(game) {
  const state = game.progression || {};
  const seen = new Set(state.seen || []);
  return (state.unlocked || []).filter(id => !seen.has(id));
}

function markProgressionMilestonesSeen(game, ids) {
  syncProgressionState(game);
  const targets = new Set(ids || game.progression.unlocked);
  const seen = new Set(game.progression.seen);
  game.progression.unlocked.forEach(id => { if (targets.has(id)) seen.add(id); });
  game.progression.seen = PROGRESSION_MILESTONES.map(def => def.id).filter(id => seen.has(id));
}

function progressionChoiceClaimed(game, id) {
  return !!(game.progression && game.progression.choices && game.progression.choices[id]);
}

function claimProgressionChoice(game, id, itemId) {
  const def = progressionMilestoneDefinition(id);
  syncProgressionState(game);
  if (!def || !def.choice || !def.choice.includes(itemId)) return { err: '選べない報酬' };
  if (!game.progression.unlocked.includes(id)) return { err: '位階条件が未達成' };
  if (progressionChoiceClaimed(game, id)) return { err: '位階報酬は受取済み' };
  game.items = game.items || {};
  game.items[itemId] = (game.items[itemId] || 0) + 1;
  game.progression.choices[id] = itemId;
  return { ok: true, itemId };
}

function treasureChoiceUnlocked(game) {
  return progressionMilestoneDone(progressionMilestoneDefinition('dex_25'), game);
}

function finalTrialCleared(game) {
  return Number((game.dungeonClears || {}).trial) > 0;
}
