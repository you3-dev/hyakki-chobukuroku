// M5-E: Service Worker・オフライン資産・iOS/PWA設定の静的整合検査
// 実行: node tests/pwa-check.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let fails = 0;
function ok(condition, label) {
  if (condition) console.log('ok  :', label);
  else { fails++; console.log('FAIL:', label); }
}

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const pwa = fs.readFileSync(path.join(ROOT, 'js/pwa.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));

const assetBlock = sw.match(/const APP_ASSETS = \[([\s\S]*?)\];/);
const assets = assetBlock ? [...assetBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
ok(assets.length > 70, '全ゲーム資産をプリキャッシュ対象に列挙');
ok(new Set(assets).size === assets.length, 'プリキャッシュ資産に重複なし');
for (const asset of assets.filter(value => value !== './')) {
  ok(fs.existsSync(path.join(ROOT, asset.replace(/^\.\//, ''))), `キャッシュ資産が存在: ${asset}`);
}

const artContext = {};
require('vm').runInNewContext(`${fs.readFileSync(path.join(ROOT, 'js/art.js'), 'utf8')}
this.raster = RASTER_ART; this.vector = VECTOR_ART;`, artContext);
const runtimeArtFiles = [
  ...artContext.raster.map(id => `${id}.webp`),
  ...artContext.vector.map(id => `${id}.svg`),
];
ok(runtimeArtFiles.every(name => assets.includes(`./assets/art/${name}`)), `実装用妖怪・ボス・呪具アート ${runtimeArtFiles.length}枚を全てキャッシュ`);
for (const icon of manifest.icons || []) ok(assets.includes(`./${icon.src}`), `manifestアイコンをキャッシュ: ${icon.src}`);
ok(assets.includes('./assets/title/title-keyart.webp'), '採用したタイトル看板アートをキャッシュ');

ok(/CACHE_PREFIX/.test(sw) && /CACHE_VERSION/.test(sw), 'キャッシュ名を版管理');
ok(/addEventListener\('install'/.test(sw) && /cache\.addAll\(APP_ASSETS\)/.test(sw) && /skipWaiting/.test(sw), 'installで全資産を保存');
ok(/addEventListener\('activate'/.test(sw) && /caches\.delete/.test(sw) && /clients\.claim/.test(sw), 'activateで旧キャッシュ削除・即時制御');
ok(/request\.mode === 'navigate'/.test(sw) && /caches\.match\('\.\/index\.html'\)/.test(sw), 'オフライン画面遷移をindexへフォールバック');
ok(/url\.origin !== self\.location\.origin/.test(sw), '同一オリジンのGETだけを処理');

ok(index.includes('<script src="js/pwa.js"></script>'), 'PWA登録スクリプトを読み込む');
ok(index.includes('viewport-fit=cover') && !index.includes('user-scalable=no'), 'iOSセーフエリアとピンチ拡大に対応');
ok(/serviceWorker\.register\('\.\/sw\.js'/.test(pwa), '相対scopeでService Workerを登録');
ok(/controllerchange/.test(pwa) && /最新版を利用できます/.test(pwa), '更新版の適用導線を表示');
ok(/addEventListener\('offline'/.test(pwa) && /オフラインで起動中/.test(pwa), 'オフライン状態を通知');
ok(/display-mode: standalone/.test(pwa) && /navigator\.standalone/.test(pwa), 'ホーム画面起動を識別');
ok(css.includes('env(safe-area-inset-left)') && css.includes('env(safe-area-inset-right)'), '左右セーフエリア・Dynamic Islandを回避');
ok(css.includes('.pwa-status') && css.includes('min-height: 44px'), 'PWA通知を44px操作で表示');

ok(manifest.display === 'standalone' && manifest.orientation === 'any', '縦横対応のstandalone PWA');
ok(manifest.lang === 'ja' && Array.isArray(manifest.display_override), 'manifestの言語・表示フォールバック');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
