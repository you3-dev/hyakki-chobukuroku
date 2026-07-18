// アセット整合チェック: ARTに登録されたidのSVGが存在し、仕様を満たすか
// 実行: node tests/art-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const code = ['js/data.js', 'js/art.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
vm.runInThisContext(code);

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL:', msg); } else console.log('ok  :', msg); }

const validIds = new Set([
  ...Object.keys(SPECIES),
  ...Object.keys(ITEMS),
  ...Object.values(DUNGEONS).map(d => d.boss.id),
]);

for (const id of ART) {
  ok(validIds.has(id), `${id}: 実在するid`);
  const p = path.join(ROOT, 'assets', 'art', `${id}.svg`);
  if (!fs.existsSync(p)) { fails++; console.log(`FAIL: ${id}.svg が存在しない`); continue; }
  const svg = fs.readFileSync(p, 'utf8');
  ok(svg.includes('viewBox="0 0 128 128"'), `${id}.svg: viewBox 128x128`);
  // xmlns名前空間のURLは必須なので除外し、外部読み込み(script/image/href)のみ検出
  ok(!/<script|<image|xlink:href|href\s*=\s*["']https?:/i.test(svg), `${id}.svg: 外部参照・scriptなし`);
  ok(fs.statSync(p).size <= 20 * 1024, `${id}.svg: 20KB以下`);
}
// 置き忘れ(SVGはあるのにART未登録)の検出
const artDir = path.join(ROOT, 'assets', 'art');
const orphans = fs.readdirSync(artDir)
  .filter(f => f.endsWith('.svg'))
  .map(f => f.replace(/\.svg$/, ''))
  .filter(id => !ART.includes(id));
ok(orphans.length === 0, `ART未登録のSVGなし${orphans.length ? ' → ' + orphans.join(',') : ''}`);

console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
