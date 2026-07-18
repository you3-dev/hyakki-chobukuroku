'use strict';

// ===== 五行 =====
// 相剋: 木剋土, 土剋水, 水剋火, 火剋金, 金剋木
const ELEMENTS = {
  wood:  { id: 'wood',  name: '木', beats: 'earth', color: '#5eb87a' },
  fire:  { id: 'fire',  name: '火', beats: 'metal', color: '#e2574c' },
  earth: { id: 'earth', name: '土', beats: 'water', color: '#c9a24b' },
  metal: { id: 'metal', name: '金', beats: 'wood',  color: '#aab2c0' },
  water: { id: 'water', name: '水', beats: 'fire',  color: '#5b8dd9' },
};

// 属性倍率: attacker が defender を剋す → 1.5 / 剋される → 0.75
function elementMult(atk, def) {
  if (!atk || !def) return 1;
  if (ELEMENTS[atk].beats === def) return 1.5;
  if (ELEMENTS[def].beats === atk) return 0.75;
  return 1;
}

// ===== 妖怪 =====
// tier: 1=雑魚 2=上位種(調伏率-10%) 0=憑合限定(野生出現なし)
// effect: dmg(単体) dmgAll(全体) block heal draw poison(単体・毒) weaken(単体・攻撃弱体)
// 成長: dmg/dmgAll/block/heal は +1/Lv +2/★、poison は +1/★、draw は ★2以上で+1、weaken は固定
const SPECIES = {
  // --- 宵の小径(d1)の野生種 ---
  onibi:      { id: 'onibi', name: '鬼火', emoji: '🔥', element: 'fire', cost: 1, role: '攻', effect: { dmg: 4 }, tier: 1, enemy: { hp: 12, atk: 4 }, desc: '夜道に漂う火の玉。従えれば夜が明るい。' },
  chochin:    { id: 'chochin', name: '提灯お化け', emoji: '🏮', element: 'fire', cost: 1, role: '守', effect: { block: 4 }, tier: 1, enemy: { hp: 14, atk: 3 }, desc: '破れ提灯の付喪神。身を挺して主を守る。' },
  karakasa:   { id: 'karakasa', name: '唐傘お化け', emoji: '☂️', element: 'water', cost: 1, role: '守', effect: { block: 5 }, tier: 1, enemy: { hp: 15, atk: 3 }, desc: '一本足で跳ねる古傘。雨も刃も弾き返す。' },
  tanuki:     { id: 'tanuki', name: '化け狸', emoji: '🦝', element: 'earth', cost: 1, role: '妙', effect: { draw: 2 }, tier: 1, enemy: { hp: 13, atk: 4 }, desc: '化かし上手。懐から次の一手を出してくれる。' },
  kamaitachi: { id: 'kamaitachi', name: '鎌鼬', emoji: '🌪️', element: 'metal', cost: 1, role: '攻', effect: { dmg: 5 }, tier: 1, enemy: { hp: 12, atk: 5 }, desc: 'つむじ風に乗る三兄弟の末弟。手数が早い。' },
  kodama:     { id: 'kodama', name: '木霊', emoji: '🌳', element: 'wood', cost: 1, role: '妙', effect: { heal: 4 }, tier: 2, enemy: { hp: 16, atk: 3 }, desc: '古木に宿る精。こだまする声が傷を癒す。' },
  kappa:      { id: 'kappa', name: '河童', emoji: '🥒', element: 'water', cost: 2, role: '攻', effect: { dmg: 7 }, tier: 2, enemy: { hp: 22, atk: 6 }, desc: '相撲好きの川の主。組めば強い。' },
  yamawaro:   { id: 'yamawaro', name: '山童', emoji: '🐒', element: 'wood', cost: 2, role: '攻', effect: { dmg: 6 }, tier: 2, enemy: { hp: 20, atk: 5 }, desc: '山に棲む童。怪力で丸太を振り回す。' },
  tsuchigumo: { id: 'tsuchigumo', name: '土蜘蛛', emoji: '🕷️', element: 'earth', cost: 2, role: '攻', effect: { dmg: 5, block: 3 }, tier: 2, enemy: { hp: 24, atk: 6 }, desc: '糸で搦め捕り、殻で身を固める古豪。' },
  // --- 深山の霧道(d2)の野生種 ---
  hitotsume:  { id: 'hitotsume', name: '一つ目小僧', emoji: '👁️', element: 'fire', cost: 1, role: '攻', effect: { dmg: 3, weaken: 1 }, tier: 1, enemy: { hp: 13, atk: 4 }, desc: '大きな一つ目で睨まれると腕が鈍る。' },
  amanojaku:  { id: 'amanojaku', name: '天邪鬼', emoji: '😈', element: 'earth', cost: 1, role: '妙', effect: { block: 3, draw: 1 }, tier: 1, enemy: { hp: 14, atk: 4 }, desc: 'ひねくれ者の小鬼。逆張りが妙手を呼ぶ。' },
  okuriinu:   { id: 'okuriinu', name: '送り犬', emoji: '🐺', element: 'metal', cost: 1, role: '攻', effect: { dmg: 4, poison: 2 }, tier: 1, enemy: { hp: 14, atk: 5 }, desc: '夜道をつけてくる山犬。噛み傷は深く残る。' },
  yukionna:   { id: 'yukionna', name: '雪女', emoji: '❄️', element: 'water', cost: 2, role: '攻', effect: { dmg: 5, weaken: 2 }, tier: 2, enemy: { hp: 20, atk: 6 }, desc: '吹雪の化身。冷気が敵の腕を凍えさせる。' },
  karasutengu: { id: 'karasutengu', name: 'からす天狗', emoji: '🪶', element: 'wood', cost: 2, role: '攻', effect: { dmgAll: 4 }, tier: 2, enemy: { hp: 19, atk: 5 }, desc: '黒翼の剣士。旋風が敵陣を切り裂く。' },
  ogama:      { id: 'ogama', name: '大蝦蟇', emoji: '🐸', element: 'water', cost: 2, role: '守', effect: { block: 5, poison: 3 }, tier: 2, enemy: { hp: 24, atk: 5 }, desc: '岩ほどの蟇。毒の息を吐き、腹で受け止める。' },
  // --- 百鬼の御堂(d3)の野生種 ---
  gaikotsu:   { id: 'gaikotsu', name: '骸骨武者', emoji: '☠️', element: 'metal', cost: 2, role: '攻', effect: { dmg: 8 }, tier: 2, enemy: { hp: 22, atk: 7 }, desc: '戦場に果てた武者の亡骸。太刀筋は今も鋭い。' },
  kasha:      { id: 'kasha', name: '火車', emoji: '😼', element: 'fire', cost: 2, role: '攻', effect: { dmg: 6, poison: 2 }, tier: 2, enemy: { hp: 20, atk: 6 }, desc: '亡者を攫う怪猫。爪の火傷は膿んで痛む。' },
  hyakume:    { id: 'hyakume', name: '百目', emoji: '👀', element: 'earth', cost: 2, role: '妙', effect: { draw: 2, block: 3 }, tier: 2, enemy: { hp: 22, atk: 5 }, desc: '百の目が盤面のすべてを見通す。' },
  yamanba:    { id: 'yamanba', name: '山姥', emoji: '🧌', element: 'wood', cost: 2, role: '攻', effect: { dmg: 5, heal: 3 }, tier: 2, enemy: { hp: 21, atk: 6 }, desc: '山に棲む老婆。喰らった分だけ主に返す。' },
  onyudo:     { id: 'onyudo', name: '大入道', emoji: '🗿', element: 'earth', cost: 3, role: '攻', effect: { dmg: 9, block: 4 }, tier: 2, enemy: { hp: 28, atk: 7 }, desc: '見上げるほどの巨僧。一歩ごとに地が揺れる。' },
  shiranui:   { id: 'shiranui', name: '不知火', emoji: '🎆', element: 'fire', cost: 2, role: '攻', effect: { dmgAll: 5 }, tier: 2, enemy: { hp: 18, atk: 6 }, desc: '海上に連なる怪火。夜を焦がして燃え広がる。' },
  // --- 憑合限定 ---
  daitengu:   { id: 'daitengu', name: '大天狗', emoji: '👺', element: 'wood', cost: 2, role: '攻', effect: { dmgAll: 5 }, tier: 0, desc: '山嵐を起こし、敵陣をまとめて薙ぎ払う。' },
  kyubi:      { id: 'kyubi', name: '九尾の狐', emoji: '🦊', element: 'fire', cost: 2, role: '攻', effect: { dmg: 8, heal: 3 }, tier: 0, desc: '妖艶なる大妖。喰らった精気を主に分け与える。' },
  yoroi:      { id: 'yoroi', name: '鎧武者', emoji: '🛡️', element: 'metal', cost: 2, role: '守', effect: { block: 9 }, tier: 0, desc: '骸の鎧に宿る武人の魂。鉄壁。' },
  ryujin:     { id: 'ryujin', name: '龍神', emoji: '🐉', element: 'water', cost: 3, role: '攻', effect: { dmgAll: 9 }, tier: 0, desc: '大河の化身。逆巻く濁流が全てを呑む。' },
  omukade:    { id: 'omukade', name: '大百足', emoji: '🐛', element: 'earth', cost: 3, role: '攻', effect: { dmg: 13 }, tier: 0, desc: '山をも巻く巨躯。一撃は山崩れの如し。' },
  yatagarasu: { id: 'yatagarasu', name: '八咫烏', emoji: '🐦‍⬛', element: 'fire', cost: 2, role: '攻', effect: { dmgAll: 6 }, tier: 0, desc: '太陽を宿す三本足の霊鳥。灼熱の翼が敵陣を包む。' },
  muramasa:   { id: 'muramasa', name: '妖刀村正', emoji: '🗡️', element: 'metal', cost: 2, role: '攻', effect: { dmg: 10 }, tier: 0, desc: '血を求める妖刀。抜けば必ず斬る。' },
  tamamo:     { id: 'tamamo', name: '玉藻前', emoji: '👘', element: 'fire', cost: 3, role: '攻', effect: { dmg: 11, heal: 5 }, tier: 0, desc: '九尾の真の姿。傾国の美貌と底知れぬ妖力。' },
  kirin:      { id: 'kirin', name: '麒麟', emoji: '🦌', element: 'wood', cost: 3, role: '守', effect: { block: 8, heal: 6 }, tier: 0, desc: '聖獣の加護。主を守り、傷を癒す。' },
  nurarihyon: { id: 'nurarihyon', name: 'ぬらりひょん', emoji: '🌚', element: 'earth', cost: 3, role: '妙', effect: { dmgAll: 7, heal: 5 }, tier: 0, desc: '妖怪の総大将。気づけば上座に座っている。' },
};

// ===== ダンジョン =====
// hpScale/atkScale: [序盤, 中盤, 終盤] の敵倍率。expMult: 獲得EXP倍率
const DUNGEONS = {
  d1: {
    id: 'd1', name: '宵の小径', emoji: '🏮', length: 10,
    hpScale: [1.0, 1.15, 1.3], atkScale: [1.0, 1.15, 1.3], expMult: 1, unlock: null,
    pools: {
      t1: ['onibi', 'chochin', 'karakasa', 'tanuki', 'kamaitachi'],
      t2: ['kodama', 'kappa', 'yamawaro', 'tsuchigumo'],
    },
    boss: { id: 'gashadokuro', name: 'がしゃどくろ', emoji: '💀', hp: 60, atk: 8, bigAtk: 12, expValue: 15 },
  },
  d2: {
    id: 'd2', name: '深山の霧道', emoji: '🌫️', length: 12,
    hpScale: [1.35, 1.55, 1.75], atkScale: [1.15, 1.25, 1.35], expMult: 2, unlock: 'd1',
    pools: {
      t1: ['hitotsume', 'amanojaku', 'okuriinu', 'tanuki', 'kamaitachi'],
      t2: ['yukionna', 'karasutengu', 'ogama', 'kappa', 'kodama'],
    },
    boss: { id: 'shutendoji', name: '酒呑童子', emoji: '👹', hp: 95, atk: 10, bigAtk: 15, expValue: 25 },
  },
  d3: {
    id: 'd3', name: '百鬼の御堂', emoji: '⛩️', length: 14,
    hpScale: [1.7, 2.0, 2.3], atkScale: [1.25, 1.4, 1.55], expMult: 3, unlock: 'd2',
    pools: {
      t1: ['onibi', 'hitotsume', 'amanojaku', 'okuriinu'],
      t2: ['gaikotsu', 'kasha', 'hyakume', 'yamanba', 'onyudo', 'shiranui', 'tsuchigumo', 'yamawaro'],
    },
    boss: { id: 'orochi', name: '八岐大蛇', emoji: '🐍', hp: 140, atk: 12, bigAtk: 18, expValue: 40 },
  },
};
const DUNGEON_ORDER = ['d1', 'd2', 'd3'];

// ===== 憑合レシピ(異種・順不同) =====
// 同種×同種は「重ね」(★+1)としてレシピ不要で常に成立
const RECIPES = [
  { pair: ['yamawaro', 'kamaitachi'], result: 'daitengu' },
  { pair: ['kodama', 'kamaitachi'], result: 'daitengu' },
  { pair: ['onibi', 'tanuki'], result: 'kyubi' },
  { pair: ['kappa', 'karakasa'], result: 'ryujin' },
  { pair: ['kappa', 'kodama'], result: 'ryujin' },
  { pair: ['yukionna', 'ogama'], result: 'ryujin' },
  { pair: ['chochin', 'kamaitachi'], result: 'yoroi' },
  { pair: ['karakasa', 'kamaitachi'], result: 'yoroi' },
  { pair: ['tsuchigumo', 'onibi'], result: 'omukade' },
  { pair: ['tsuchigumo', 'tanuki'], result: 'omukade' },
  { pair: ['ogama', 'tsuchigumo'], result: 'omukade' },
  { pair: ['karasutengu', 'onibi'], result: 'yatagarasu' },
  { pair: ['karasutengu', 'shiranui'], result: 'yatagarasu' },
  { pair: ['gaikotsu', 'kamaitachi'], result: 'muramasa' },
  { pair: ['yoroi', 'gaikotsu'], result: 'muramasa' },
  { pair: ['kyubi', 'yukionna'], result: 'tamamo' },
  { pair: ['kyubi', 'hyakume'], result: 'tamamo' },
  { pair: ['daitengu', 'yamanba'], result: 'kirin' },
  { pair: ['daitengu', 'kodama'], result: 'kirin' },
  { pair: ['kyubi', 'ryujin'], result: 'nurarihyon' },
];

const EXP_BY_TIER = { 1: 2, 2: 4 };
