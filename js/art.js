'use strict';

// イラスト完成済みのid一覧。assets/art/<id>.svg を置いてここにidを足すと
// 絵文字がイラストに切り替わる(妖怪・ボス・呪具すべて共通)
const ART = [
  'onibi', // 画風サンプル
  // 宵の小径(d1)の野生種
  'chochin', 'karakasa', 'tanuki', 'kamaitachi', 'nekomata',
  'kawauso', 'kodama', 'kappa', 'yamawaro', 'tsuchigumo',
  // 深山の霧道(d2)の野生種
  'hitotsume', 'amanojaku', 'okuriinu', 'dorotabo', 'kudagitsune',
  'amefuri', 'yukionna', 'karasutengu', 'ogama', 'nue', 'zashiki',
  // 百鬼の御堂(d3)の野生種
  'gaikotsu', 'kasha', 'hyakume', 'yamanba', 'onyudo',
  'shiranui', 'itsumade', 'nureonna', 'satori', 'umibozu', 'oboroguruma',
  // 憑合限定
  'daitengu', 'kyubi', 'yoroi', 'ryujin', 'omukade',
  'yatagarasu', 'muramasa', 'tsukumogami', 'tamamo',
  'kirin', 'hakutaku', 'tatarigami', 'genbu',
  'byakko', 'seiryu', 'suzaku', 'nurarihyon',
];

function artHtml(id, emoji) {
  return ART.includes(id)
    ? `<img class="sprite" src="assets/art/${id}.svg" alt="${emoji}">`
    : emoji;
}
