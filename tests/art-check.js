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

// PWAアプリアイコン: PNG実寸・manifest/index参照の整合
function pngInfo(relativePath) {
  const p = path.join(ROOT, relativePath);
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  const isPng = b.length >= 26 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) return { isPng: false };
  return { isPng: true, width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

const iconSpecs = [
  ['assets/icons/app-icon-master.png', 1024],
  ['assets/icons/apple-touch-icon.png', 180],
  ['assets/icons/icon-192.png', 192],
  ['assets/icons/icon-512.png', 512],
  ['assets/icons/icon-maskable-512.png', 512],
  ['assets/icons/favicon-32.png', 32],
];
for (const [relativePath, size] of iconSpecs) {
  const info = pngInfo(relativePath);
  ok(info && info.isPng, `${relativePath}: PNG形式`);
  if (!info || !info.isPng) continue;
  ok(info.width === size && info.height === size, `${relativePath}: ${size}x${size}`);
  ok(info.colorType === 2, `${relativePath}: 不透明RGB`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const manifestIcons = manifest.icons || [];
for (const relativePath of ['assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png']) {
  ok(manifestIcons.some(icon => icon.src === relativePath), `manifest: ${relativePath}を参照`);
}
ok(manifestIcons.some(icon => icon.src === 'assets/icons/icon-maskable-512.png' && icon.purpose === 'maskable'), 'manifest: maskableアイコン指定');
ok(manifest.id === './' && manifest.scope === './' && manifest.start_url === './', 'manifest: GitHub Pages相対パス設定');
ok(!manifest.name.includes('検証版'), 'manifest: ホーム画面名から検証版表記を除去');

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(indexHtml.includes('rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-touch-icon.png"'), 'index: apple-touch-icon指定');
ok(indexHtml.includes('rel="icon" type="image/png" sizes="32x32" href="assets/icons/favicon-32.png"'), 'index: favicon指定');

console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
