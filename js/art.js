'use strict';

// イラスト完成済みのid一覧。assets/art/<id>.svg を置いてここにidを足すと
// 絵文字がイラストに切り替わる(妖怪・ボス・呪具すべて共通)
const ART = [
  'onibi', // 画風サンプル
  // 宵の小径(d1)の野生種
  'chochin', 'karakasa', 'tanuki', 'kamaitachi', 'nekomata',
  'kawauso', 'kodama', 'kappa', 'yamawaro', 'tsuchigumo',
];

function artHtml(id, emoji) {
  return ART.includes(id)
    ? `<img class="sprite" src="assets/art/${id}.svg" alt="${emoji}">`
    : emoji;
}
