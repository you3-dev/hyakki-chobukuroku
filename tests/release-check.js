// M5-F: release candidate version and documentation consistency check
// Run: node tests/release-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let fails = 0;
function ok(condition, label) {
  if (condition) console.log('ok  :', label);
  else { fails++; console.log('FAIL:', label); }
}
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const versionSource = read('js/version.js');
const context = {};
vm.runInNewContext(`${versionSource}\nthis.version = APP_VERSION; this.label = APP_RELEASE_LABEL;`, context);
const version = context.version;
const sw = read('sw.js');
const index = read('index.html');
const main = read('js/main.js');
const readme = read('README.md');
const plan = read('docs/開発計画.md');
const release = read('docs/リリース確認.md');

ok(/^\d+\.\d+\.\d+-rc\.\d+$/.test(version), `RC version format: ${version}`);
ok(context.label === 'Release Candidate 1', 'release label is defined');
ok(sw.includes(`const CACHE_VERSION = '${version}'`), 'app and cache versions match');
ok(sw.includes("'./js/version.js'"), 'version script is precached');
ok(index.indexOf('js/version.js') < index.indexOf('js/main.js'), 'version loads before UI');
ok(main.includes('v${APP_VERSION}'), 'title displays the release version');
ok(readme.includes(version), 'README states the RC version');
ok(release.includes(version), 'release checklist states the RC version');
ok(release.includes('GitHub Pages') && release.includes('iPhone'), 'external verification targets are listed');
ok(release.includes('- [ ]'), 'unverified device/deployment checks remain unchecked');
ok(plan.includes('M5-F') && plan.includes('RC1'), 'development plan reports the partial RC status');
ok(/バックアップ|引継ぎ/.test(readme) && /更新/.test(readme), 'README explains backup and update operation');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
