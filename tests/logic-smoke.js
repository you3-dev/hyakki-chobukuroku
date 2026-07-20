// ロジック層スモークテスト: ゲームJSとテスト本体を1スクリプトに結合して実行
// 実行: node tests/logic-smoke.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};

const gameCode = ['js/version.js', 'js/time.js', 'js/data.js', 'js/art.js', 'js/achievements.js', 'js/progression.js', 'js/state.js', 'js/run.js', 'js/battle.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

const testCode = fs.readFileSync(path.join(__dirname, 'logic-body.js'), 'utf8');

vm.runInThisContext(gameCode + '\n' + testCode);
