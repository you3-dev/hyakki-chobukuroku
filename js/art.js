'use strict';

// 妖怪・ボスは拡大表示に耐えるWebP、呪具は軽量なSVGを使う。
// 再臨ボスは通常版と別idにして、百鬼の試練だけ差分アートへ切り替える。
const RASTER_ART = [
  // 宵の小径(d1)の野生種
  'onibi', 'chochin', 'karakasa', 'tanuki', 'kamaitachi', 'nekomata',
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
  'furi', 'wanyudo', 'nurikabe', 'tesso', 'isonade',
  // 通常ボス・再臨ボス
  'gashadokuro', 'shutendoji', 'orochi',
  'gashadokuro-revenant', 'shutendoji-revenant', 'orochi-revenant',
];

const VECTOR_ART = [
  'oniudewa', 'iwakabuto', 'juzu', 'dokuga',
  'tengugeta', 'kanzashi', 'senrigan', 'shibarinawa',
];

const ART = [...RASTER_ART, ...VECTOR_ART];

function artHtml(id, emoji) {
  const extension = RASTER_ART.includes(id) ? 'webp' : (VECTOR_ART.includes(id) ? 'svg' : '');
  return extension
    ? `<img class="sprite sprite-${extension}" src="assets/art/${id}.${extension}" alt="${emoji}" loading="lazy" decoding="async">`
    : emoji;
}
