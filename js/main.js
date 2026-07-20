'use strict';

const app = document.getElementById('app');

let screen = 'title';       // title | tutorial | guide | settings | home | deck | fusion | dex | achievements | ranks | save | dungeon | node | battle | event | runend | resume
let selCard = null;         // 選択中の手札uid
let captureMode = false;
let toast = '';
let fusionSel = [];         // 憑合選択uid(最大2)
let fusionResult = null;    // 直近の憑合結果unit
let nodeOpts = null;        // 現在のノード2択
let E = null;               // イベント画面データ
let importText = '';        // 引継ぎコード入力
let itemSel = null;         // 呪具画面で選択中の呪具id
let detailUid = null;       // 拡大表示中の手持ち妖怪uid
let timeHelpOpen = false;   // 時間帯・月相の説明表示
let gameTimeProvider = currentGameTime; // テストでは固定日時のコンテキストへ差し替え可能
let tutorialStep = 0;       // 初回導入の現在ページ(0..2)
let tutorialExit = 'home';  // 初回導入/再確認後の戻り先
let utilityReturn = 'home'; // 遊び方・設定・記録から戻る画面
let celebrationQueue = []; // M5-D: 初見・調伏・解放などの短い専用演出
let lastRenderedScreen = null;
let focusReturnSelector = '';
let modalActiveLastRender = false;

const NODE_INFO = {
  battle:   { emoji: '⚔️', name: '戦闘',   desc: '妖怪と戦う。弱らせて調伏の好機' },
  elite:    { emoji: '👹', name: '強戦闘', desc: '強敵3体。EXP2倍・上位種が出る' },
  treasure: { emoji: '🎁', name: '宝',     desc: '調伏札を拾う(体力も少し回復)' },
  rest:     { emoji: '🍵', name: '茶屋',   desc: '休むか、札を仕入れるか' },
  boss:     { emoji: '💀', name: '夜行の主', desc: 'この夜路の主が待ち構える' },
};

function esc(s) { return String(s); }
function elemChip(el) {
  if (!el) return '<span class="chip" style="background:#555">無</span>';
  const e = ELEMENTS[el];
  return `<span class="chip" style="background:${e.color}">${e.name}</span>`;
}
function starText(u) { return u.star ? `<span class="star">${'★'.repeat(u.star)}</span>` : ''; }

function effectText(u) {
  const v = cardValues(u);
  const parts = [];
  if (v.dmg) parts.push(`敵1体に${v.dmg}`);
  if (v.dmgAll) parts.push(`敵全体に${v.dmgAll}`);
  if (v.poison) parts.push(`毒${v.poison}`);
  if (v.weaken) parts.push(`弱体${v.weaken}`);
  if (v.block) parts.push(`防御+${v.block}`);
  if (v.heal) parts.push(`HP回復${v.heal}`);
  if (v.draw) parts.push(`${v.draw}枚引く`);
  return parts.join('・');
}

function setToast(m) { toast = m || ''; }

function backupFileName() {
  const d = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `hyakki-save-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

function downloadBackupFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveJsonBackup() {
  try {
    // text/plainはiOSの共有先が扱いやすく、拡張子はJSONのまま維持する。
    const file = new File([exportSaveJson()], backupFileName(), { type: 'text/plain' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '百鬼調伏録 セーブデータ' });
        setToast('JSONバックアップを共有した');
      } catch (shareError) {
        if (shareError && shareError.name === 'AbortError') {
          setToast('保存をキャンセルした');
        } else {
          downloadBackupFile(file);
          setToast('共有できないためJSONを保存した');
        }
      }
    } else {
      downloadBackupFile(file);
      setToast('JSONバックアップを保存した');
    }
  } catch (error) {
    setToast(error && error.name === 'AbortError' ? '保存をキャンセルした' : 'JSONバックアップを保存できなかった');
  }
  render();
}

function finishSaveImport(text, successMessage) {
  if (importSave(text)) {
    clearRun(); R = null; B = null;
    setToast(successMessage);
    return true;
  }
  setToast('セーブデータが正しくない');
  return false;
}

function queueCelebration(kind, kicker, title, detail, icon, art) {
  celebrationQueue.push({ kind, kicker, title, detail, icon, art: art || '' });
}

function queueProgressionUnlocks(before) {
  const added = (G.progression && G.progression.unlocked || []).filter(id => !before.has(id));
  for (const id of added) {
    const def = progressionMilestoneDefinition(id);
    if (!def) continue;
    const rank = currentProgressionRank(G);
    queueCelebration('rank', '位階昇格', rank.name, `${def.name}を達成。${def.reward}`, '🎖️');
  }
}

function queueDungeonUnlocks(before) {
  for (const id of DUNGEON_ORDER) {
    if (!before[id] && dungeonUnlocked(id)) {
      const dg = DUNGEONS[id];
      queueCelebration('unlock', '新たな夜路', dg.name, 'ダンジョンが解放された', dg.emoji);
    }
  }
}

function celebrationHtml() {
  if (!celebrationQueue.length || (B && B.over && screen === 'battle')) return '';
  const c = celebrationQueue[0];
  const visual = c.art && SPECIES[c.art]
    ? `<div class="celebration-art">${artHtml(c.art, SPECIES[c.art].emoji)}</div>`
    : `<div class="celebration-icon" aria-hidden="true">${esc(c.icon)}</div>`;
  return `<div class="celebration-overlay" role="presentation">
    <section class="celebration-card celebration-${esc(c.kind)}" role="dialog" aria-modal="true" aria-labelledby="celebration-title" aria-describedby="celebration-detail" tabindex="-1">
      <div class="celebration-rays" aria-hidden="true"></div>${visual}
      <p>${esc(c.kicker)}</p><h2 id="celebration-title">${esc(c.title)}</h2>
      <div id="celebration-detail" class="celebration-detail">${esc(c.detail)}</div>
      <button class="btn btn-primary" type="button" data-action="celebration-dismiss">確認する</button>
    </section>
  </div>`;
}

function applyUiSettings() {
  const body = document.body;
  if (body && body.classList) body.classList.toggle('motion-reduced', !!G.ui.reducedMotion);
}

function applyPostRenderAccessibility(screenChanged) {
  if (!document.querySelector) return;
  const root = app.firstElementChild;
  if (screenChanged && root && root.classList) root.classList.add('screen-enter');
  const dialog = document.querySelector('.celebration-card, .unit-detail-dialog, .battle-result-card');
  if (dialog) {
    modalActiveLastRender = true;
    const first = dialog.querySelector && dialog.querySelector('button:not(:disabled), [tabindex="0"]');
    (first || dialog).focus();
    return;
  }
  if (focusReturnSelector) {
    const returned = document.querySelector(focusReturnSelector);
    focusReturnSelector = '';
    if (returned && returned.focus) { returned.focus(); modalActiveLastRender = false; return; }
  }
  if (screenChanged || modalActiveLastRender) {
    const target = document.querySelector('#app h1') || root;
    if (target && target.focus) {
      if (!target.hasAttribute || !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus();
    }
  }
  modalActiveLastRender = false;
}

// ===== 画面遷移 =====
function gotoNodeScreen() {
  nodeOpts = nodeOptions();
  screen = 'node';
  saveRun();
}

function chooseNode(i) {
  const opt = nodeOpts[i];
  if (!opt) return;
  R.depth++;
  nodeOpts = null;
  selCard = null; captureMode = false; setToast('');
  const dg = currentDungeon();
  if (opt.type === 'battle') startEncounter('battle', { expMult: dg.expMult });
  else if (opt.type === 'elite') startEncounter('elite', { expMult: dg.expMult * 2, elite: true });
  else if (opt.type === 'boss') startEncounter('boss', { boss: true, expMult: dg.expMult });
  else if (opt.type === 'treasure') {
    if (treasureChoiceUnlocked(G)) {
      E = { kind: 'treasure-choice', options: treasureChoiceOptions() };
      saveRun();
      screen = 'event';
      return;
    }
    const t = applyTreasure();
    const msg = t.kind === 'item'
      ? `古びた祠に呪具「${ITEMS[t.id].emoji}${ITEMS[t.id].name}」が眠っていた。体力も少し回復(+4)`
      : `古びた祠に調伏札が${t.extra}枚。体力も少し回復した(+4)`;
    E = { kind: 'treasure', msg };
    if (t.kind === 'item') {
      const item = ITEMS[t.id];
      queueCelebration('item', '呪具入手', item.name, item.desc, item.emoji);
    }
    screen = 'event';
  } else if (opt.type === 'rest') {
    E = { kind: 'rest' };
    screen = 'event';
  }
}

function startEncounter(kind, opts) {
  const group = makeGroup(kind);
  const firstSeen = group.filter(e => e.sp && !G.dex[e.sp]);
  startBattle(group, opts);
  screen = 'battle';
  if (firstSeen.length) {
    const species = SPECIES[firstSeen[0].sp];
    const more = firstSeen.length > 1 ? ` ほか${firstSeen.length - 1}種` : '';
    queueCelebration('discovery', '初見妖怪', species.name + more, '図鑑へ目撃記録を追加した', '👁️', species.id);
  }
}

// ===== アクション =====
function handleAction(action, arg) {
  const progressionBefore = new Set(G.progression && G.progression.unlocked || []);
  const dungeonBefore = Object.fromEntries(DUNGEON_ORDER.map(id => [id, dungeonUnlocked(id)]));
  switch (action) {
    case 'unit-detail': {
      const uid = Number(arg);
      if (getUnit(uid)) detailUid = uid;
      break;
    }
    case 'unit-detail-close': detailUid = null; break;
    case 'time-help-open': timeHelpOpen = true; break;
    case 'time-help-close': timeHelpOpen = false; break;
    case 'time-help-dex':
      timeHelpOpen = false;
      screen = 'dex';
      setToast('');
      break;
    case 'celebration-dismiss': celebrationQueue.shift(); break;

    case 'title-enter':
      if (peekRun()) screen = 'resume';
      else if (!G.ui.onboardingSeen) { tutorialStep = 0; tutorialExit = 'home'; screen = 'tutorial'; }
      else screen = 'home';
      setToast('');
      break;

    case 'title-guide': utilityReturn = 'title'; screen = 'guide'; setToast(''); break;
    case 'title-settings': utilityReturn = 'title'; screen = 'settings'; setToast(''); break;
    case 'title-record': utilityReturn = 'title'; screen = 'save'; setToast(''); break;
    case 'nav-guide': utilityReturn = 'home'; screen = 'guide'; setToast(''); break;
    case 'nav-settings': utilityReturn = 'home'; screen = 'settings'; setToast(''); break;
    case 'utility-back': screen = utilityReturn; setToast(''); break;
    case 'tutorial-next':
      if (tutorialStep < 2) tutorialStep++;
      else { G.ui.onboardingSeen = true; save(); screen = tutorialExit; }
      break;
    case 'tutorial-skip':
      G.ui.onboardingSeen = true;
      save();
      screen = tutorialExit;
      break;
    case 'tutorial-replay': tutorialStep = 0; tutorialExit = 'guide'; screen = 'tutorial'; break;
    case 'setting-motion':
      G.ui.reducedMotion = !G.ui.reducedMotion;
      save();
      applyUiSettings();
      break;

    case 'nav-home': screen = 'home'; setToast(''); break;
    case 'nav-deck': screen = 'deck'; setToast(''); break;
    case 'nav-fusion': screen = 'fusion'; fusionSel = []; fusionResult = null; setToast(''); break;
    case 'nav-dex': screen = 'dex'; setToast(''); break;
    case 'nav-achievements':
      markAchievementIdsSeen(G);
      save();
      screen = 'achievements';
      setToast('');
      break;
    case 'nav-ranks':
      markProgressionMilestonesSeen(G);
      save();
      screen = 'ranks';
      setToast('');
      break;
    case 'nav-items': screen = 'items'; itemSel = null; setToast(''); break;
    case 'nav-save': utilityReturn = 'home'; screen = 'save'; setToast(''); break;
    case 'reset-save':
      if (confirm('セーブデータを消して最初からやり直しますか?')) { resetSave(); clearRun(); R = null; B = null; tutorialStep = 0; screen = 'title'; }
      break;

    case 'start-run': screen = 'dungeon'; setToast(''); break;
    case 'choose-dungeon': {
      if (!dungeonUnlocked(arg)) { setToast('まだ道が開かれていない'); break; }
      startRun(arg);
      gotoNodeScreen();
      break;
    }
    case 'abandon-run':
      if (confirm('夜行を諦めて帰りますか?(調伏した妖怪は持ち帰れます)')) { clearRun(); screen = 'runend'; }
      break;
    case 'choose-node': chooseNode(Number(arg)); break;

    case 'deck-toggle': {
      const uid = Number(arg);
      if (G.deck.includes(uid)) {
        if (G.deck.length <= deckMinSize()) { setToast(`デッキは最低${deckMinSize()}枚必要`); break; }
        G.deck = G.deck.filter(id => id !== uid);
      } else {
        if (G.deck.length >= DECK_MAX) { setToast(`デッキは最大${DECK_MAX}枚まで`); break; }
        G.deck.push(uid);
      }
      save();
      break;
    }

    case 'item-select': {
      itemSel = (itemSel === arg) ? null : arg;
      setToast(itemSel ? `${ITEMS[itemSel].name}を装備する妖怪をタップ` : '');
      break;
    }
    case 'item-target': {
      const uid = Number(arg);
      if (itemSel) {
        if (equipItem(uid, itemSel)) {
          setToast('装備した');
          if (itemCount(itemSel) < 1) itemSel = null;
        } else setToast('装備できない');
      } else {
        const u = getUnit(uid);
        if (u && u.item) { unequipItem(uid); setToast('はずした'); }
        else setToast('呪具を選んでから妖怪をタップ');
      }
      break;
    }

    case 'fusion-select': {
      const uid = Number(arg);
      fusionResult = null;
      if (fusionSel.includes(uid)) fusionSel = fusionSel.filter(id => id !== uid);
      else { fusionSel.push(uid); if (fusionSel.length > 2) fusionSel.shift(); }
      break;
    }
    case 'fusion-exec': {
      if (fusionSel.length !== 2) break;
      const a = getUnit(fusionSel[0]), b = getUnit(fusionSel[1]);
      const same = a && b && a.sp === b.sp;
      const recipe = a && b && !same ? findRecipe(a.sp, b.sp) : null;
      const wasOwned = recipe ? G.dex[recipe.result] === 2 : true;
      const res = fuseUnits(fusionSel[0], fusionSel[1]);
      if (res.unit) {
        fusionResult = res.unit; fusionSel = [];
        const species = SPECIES[res.unit.sp];
        if (same) queueCelebration('star', '重ね成功', `${species.name} ${'★'.repeat(res.unit.star)}`, `札の力が★${res.unit.star}へ上昇した`, '★', species.id);
        else queueCelebration('fusion', wasOwned ? '憑合成功' : '憑合新種', species.name, `Lv${unitLevel(res.unit)}の新たな妖怪が生まれた`, '🔮', species.id);
      }
      else setToast(res.err);
      break;
    }

    case 'play-card': {
      const uid = Number(arg);
      captureMode = false;
      const u = getUnit(uid);
      if (!u) break;
      const v = cardValues(u);
      if (v.dmg || v.poison || v.weaken) {
        const alive = aliveEnemies();
        if (alive.length === 1) {
          const idx = B.enemies.indexOf(alive[0]);
          const r = playCard(uid, idx);
          setToast(r.err || '');
          selCard = null;
        } else if (selCard === uid) {
          selCard = null;
        } else {
          selCard = uid;
          setToast('対象の敵をタップ');
        }
      } else {
        const r = playCard(uid);
        setToast(r.err || '');
        selCard = null;
      }
      break;
    }
    case 'target-enemy': {
      const idx = Number(arg);
      if (captureMode) {
        const target = B.enemies[idx];
        const r = tryCapture(idx);
        setToast(r.err || '');
        if (r.ok && target) {
          const species = SPECIES[target.sp];
          queueCelebration('capture', '調伏成功', species.name, '新たな仲間が百鬼へ加わった', '🧧', species.id);
        }
        if (!r.err && (R.fuda < 1 || B.energy < 1)) captureMode = false;
      } else if (selCard !== null) {
        const r = playCard(selCard, idx);
        setToast(r.err || '');
        if (!r.err) selCard = null;
      }
      break;
    }
    case 'toggle-capture':
      captureMode = !captureMode;
      selCard = null;
      setToast(captureMode ? '調伏する敵をタップ(HP30%以下のみ)' : '');
      break;
    case 'toggle-mercy':
      if (!B || !mercyAvailable()) { setToast('この夜行を一度踏破すると手加減を使える'); break; }
      if (B.boss) { setToast('夜行の主に手加減は通じない'); break; }
      B.mercy = !B.mercy;
      setToast(B.mercy ? '手加減ON: 単体攻撃の致死ダメージをHP1で止める' : '手加減OFF');
      saveRun();
      break;
    case 'auto-battle':
      if (!autoAvailable()) { setToast('このダンジョンを一度踏破すると解放'); break; }
      selCard = null; captureMode = false; setToast('');
      autoResolveBattle();
      break;
    case 'end-turn':
      selCard = null; captureMode = false; setToast('');
      endTurn();
      break;
    case 'battle-continue':
      if (B.over === 'win' && !B.boss) { B = null; gotoNodeScreen(); }
      else { clearRun(); screen = 'runend'; }
      break;

    case 'rest-heal': applyRest('heal'); E = { kind: 'done', msg: '茶屋で一服。体力が回復した' }; break;
    case 'rest-fuda': applyRest('fuda'); E = { kind: 'done', msg: '茶屋の主人から調伏札を2枚仕入れた' }; break;
    case 'event-continue': E = null; gotoNodeScreen(); break;
    case 'treasure-choice': {
      const choice = E && E.kind === 'treasure-choice' ? E.options[Number(arg)] : null;
      const result = applyTreasureChoice(choice);
      if (result.err) { setToast(result.err); break; }
      const msg = result.kind === 'item'
        ? `選んだ呪具「${ITEMS[result.id].emoji}${ITEMS[result.id].name}」を手に入れた。体力も少し回復(+4)`
        : `選んだ調伏札を${result.extra}枚手に入れた。体力も少し回復(+4)`;
      E = { kind: 'done', msg };
      if (result.kind === 'item') {
        const item = ITEMS[result.id];
        queueCelebration('item', '呪具入手', item.name, item.desc, item.emoji);
      }
      break;
    }

    case 'run-close': clearRun(); R = null; B = null; screen = 'home'; break;

    case 'resume-run':
      if (loadRun()) { if (B) screen = 'battle'; else gotoNodeScreen(); }
      else { clearRun(); screen = 'home'; }
      break;
    case 'resume-discard': clearRun(); R = null; B = null; screen = 'home'; break;

    case 'save-import': {
      const ta = document.getElementById('import-text');
      const val = ta ? ta.value : importText;
      finishSaveImport(val, '引継ぎ完了!');
      break;
    }
    case 'save-json':
      saveJsonBackup();
      return; // 共有シートをユーザー操作中に直接開くため、完了後に再描画する
    case 'save-select': {
      const ta = document.getElementById('export-text');
      if (ta) { ta.focus(); ta.select(); }
      return; // 再レンダリングすると選択が消えるため
    }
    case 'achievement-claim': {
      const result = claimReward(arg);
      setToast(result.ok ? `報酬獲得: ${result.reward.label}` : result.err);
      break;
    }
    case 'achievement-notice-dismiss':
      markAchievementIdsSeen(G);
      save();
      break;
    case 'progression-notice-dismiss':
      markProgressionMilestonesSeen(G);
      save();
      break;
    case 'rank-choice': {
      const [milestoneId, itemId] = String(arg || '').split(':');
      const result = claimRankChoice(milestoneId, itemId);
      setToast(result.ok ? `位階報酬: ${ITEMS[itemId].emoji}${ITEMS[itemId].name}を獲得` : result.err);
      if (result.ok) {
        const item = ITEMS[itemId];
        queueCelebration('item', '位階報酬', item.name, item.desc, item.emoji);
      }
      break;
    }
  }
  if (B && B.itemDrop && !B.uiItemCelebrated) {
    const item = ITEMS[B.itemDrop];
    queueCelebration('item', B.boss ? '主からの戦利品' : '強敵からの戦利品', item.name, item.desc, item.emoji);
    B.uiItemCelebrated = true;
  }
  queueProgressionUnlocks(progressionBefore);
  queueDungeonUnlocks(dungeonBefore);
  render();
}

app.addEventListener('click', (ev) => {
  if (ev.target.matches && ev.target.matches('[data-time-help-backdrop]')) {
    handleAction('time-help-close');
    return;
  }
  if (ev.target.matches && ev.target.matches('[data-detail-backdrop]')) {
    handleAction('unit-detail-close');
    return;
  }
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  if (t.dataset.action === 'unit-detail') focusReturnSelector = `[data-action="unit-detail"][data-arg="${t.dataset.arg}"]`;
  else if (t.dataset.action === 'time-help-open') focusReturnSelector = '[data-action="time-help-open"]';
  handleAction(t.dataset.action, t.dataset.arg);
});

app.addEventListener('change', async (ev) => {
  if (!ev.target.matches || !ev.target.matches('#save-file-input')) return;
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    finishSaveImport(await file.text(), 'JSONバックアップを復元した');
  } catch (error) {
    setToast('JSONファイルを読み込めなかった');
  }
  render();
});

app.addEventListener('keydown', (ev) => {
  const dialog = document.querySelector && document.querySelector('[role="dialog"]');
  if (ev.key === 'Escape') {
    if (celebrationQueue.length && !(B && B.over && screen === 'battle')) handleAction('celebration-dismiss');
    else if (detailUid !== null) handleAction('unit-detail-close');
    else if (timeHelpOpen) handleAction('time-help-close');
    return;
  }
  if (ev.key === 'Tab' && dialog && dialog.querySelectorAll) {
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (focusable.length) {
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    return;
  }
  const target = ev.target.closest && ev.target.closest('[data-action]');
  if (!target || /^(INPUT|TEXTAREA|SELECT|A)$/.test(target.tagName)) return;
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    handleAction(target.dataset.action, target.dataset.arg);
  }
});

// ===== 部品 =====
function statusBar() {
  const dg = currentDungeon();
  return `<div class="statusbar" aria-label="夜行の状態">
    <span>${dg.emoji} ${R.depth}/${dg.length}</span>
    <span>❤️ ${R.hp}/${R.maxHp}</span>
    <span>🧧 札×${R.fuda}</span>
    ${B && !B.over ? `<span>🔮 霊力 ${B.energy}</span>` : ''}
  </div>`;
}

function unitCard(u, opts) {
  const s = SPECIES[u.sp];
  const o = opts || {};
  const cls = ['unit'];
  if (o.selected) cls.push('selected');
  if (o.inDeck) cls.push('indeck');
  if (o.action) cls.push('selectable');
  const selectButton = o.action ? `<button class="unit-select-hit" type="button" data-action="${o.action}" data-arg="${u.uid}" aria-label="${esc(s.name)}を${o.selected ? '選択解除' : '選択'}"></button>` : '';
  const itemMark = u.item && ITEMS[u.item] ? ` ${ITEMS[u.item].emoji}` : '';
  const badge = o.badge || (o.selected ? (o.selectedLabel || '選択中') : '');
  return `<div class="${cls.join(' ')}">${selectButton}
    <div class="unit-top"><button class="unit-art-btn" type="button" data-action="unit-detail" data-arg="${u.uid}" aria-label="${esc(s.name)}のイラストを拡大"><span class="unit-emoji">${artHtml(s.id, s.emoji)}</span><span class="zoom-mark" aria-hidden="true">＋</span></button>${elemChip(s.element)}<span class="cost">◆${effCost(u)}</span></div>
    <div class="unit-name">${esc(s.name)}${starText(u)}</div>
    <div class="unit-lv">Lv${unitLevel(u)} ${s.role}${itemMark}</div>
    <div class="unit-effect">${effectText(u)}</div>
    ${badge ? `<div class="unit-badge">${badge}</div>` : ''}
  </div>`;
}

function unitDetailHtml() {
  const u = getUnit(detailUid);
  if (!u) { detailUid = null; return ''; }
  const s = SPECIES[u.sp];
  const item = u.item && ITEMS[u.item];
  return `<div class="unit-detail-overlay" data-detail-backdrop role="presentation">
    <section class="unit-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="unit-detail-title" tabindex="-1">
      <button class="unit-detail-close" type="button" data-action="unit-detail-close" aria-label="閉じる">×</button>
      <div class="unit-detail-art">${artHtml(s.id, s.emoji)}</div>
      <h2 id="unit-detail-title">${esc(s.name)}${starText(u)}</h2>
      <div class="unit-detail-meta">
        ${elemChip(s.element)}
        <span>Lv${unitLevel(u)}</span>
        <span>${esc(s.role)}の札</span>
        <span class="cost">◆${effCost(u)}</span>
      </div>
      <p class="unit-detail-effect">${effectText(u)}</p>
      <p class="unit-detail-desc">${esc(s.desc)}</p>
      <p class="unit-detail-item">${item ? `呪具 ${item.emoji} ${esc(item.name)}` : '呪具 なし'}</p>
      <button class="btn btn-primary" type="button" data-action="unit-detail-close">閉じる</button>
    </section>
  </div>`;
}

function screenHeader(kicker, title, subtitle, meta) {
  return `<header class="screen-header">
    <div class="screen-heading"><p>${esc(kicker)}</p><h1>${esc(title)}</h1>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}</div>
    ${meta ? `<div class="screen-meta">${meta}</div>` : ''}
  </header>`;
}

function sectionHeader(title, meta, description) {
  return `<div class="section-header"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>${meta ? `<strong>${meta}</strong>` : ''}</div>`;
}

function backActions(action, label, extra) {
  return `<div class="screen-actions">${extra || ''}<button class="btn btn-primary" type="button" data-action="${action}">${esc(label)}</button></div>`;
}

function toastHtml() { return toast ? `<div class="toast" role="status" aria-live="polite">${esc(toast)}</div>` : ''; }

function timeContextHtml(context) {
  return `<button class="time-context" type="button" data-action="time-help-open" aria-haspopup="dialog" aria-label="現在の時間帯と月相。タップして出現の変化を見る">
    <span class="time-moon" aria-hidden="true">${context.moonPhase.icon}</span>
    <span class="time-copy"><strong>${esc(context.timeBand.name)}・${esc(context.moonPhase.name)}</strong><small>${esc(context.timeBand.text)}</small></span>
    <span class="time-more" aria-hidden="true">？</span>
  </button>`;
}

function encounterConditionText(species) {
  const rule = species.encounter;
  if (rule.timeBands) return rule.timeBands.map(id => TIME_BANDS.find(x => x.id === id).name).join('・');
  if (rule.moonPhases) return rule.moonPhases.map(id => MOON_PHASES.find(x => x.id === id).name).join('・');
  return '';
}

function timeHelpHtml() {
  const context = gameTimeProvider();
  const conditioned = Object.values(SPECIES).filter(s => s.encounter);
  const boosted = conditioned.filter(s => encounterMatches(s.id, {
    timeBand: context.timeBand.id,
    moonPhase: context.moonPhase.id,
  }));
  const boostedHtml = boosted.length
    ? `<ul class="time-help-active">${boosted.map(s => `<li>${artHtml(s.id, s.emoji)}<span><strong>${esc(s.name)}</strong><small>${esc(s.encounter.hint)}</small></span></li>`).join('')}</ul>`
    : '<p class="time-help-none">今は特に出会いやすくなる妖怪はいないようだ。</p>';
  const loreHtml = conditioned.map(s => `<li><strong>${esc(encounterConditionText(s))}：${esc(s.name)}</strong><span>${esc(s.encounter.hint)}</span></li>`).join('');

  return `<div class="unit-detail-overlay time-help-overlay" data-time-help-backdrop role="presentation">
    <section class="unit-detail-dialog time-help-dialog" role="dialog" aria-modal="true" aria-labelledby="time-help-title" tabindex="-1">
      <button class="unit-detail-close" type="button" data-action="time-help-close" aria-label="閉じる">×</button>
      <div class="time-help-heading"><span aria-hidden="true">${context.moonPhase.icon}</span><div><small>現在の空模様</small><h2 id="time-help-title">${esc(context.timeBand.name)}・${esc(context.moonPhase.name)}</h2></div></div>
      <p class="time-help-lead">時間帯と月相によって、夜行で出会う妖怪の傾向が変わる。</p>
      <h3>いま出会いやすい妖怪</h3>
      ${boostedHtml}
      <h3>時と月の言い伝え</h3>
      <ul class="time-help-lore">${loreHtml}</ul>
      <p class="time-help-note">変わるのは敵としての出現傾向だけ。手持ち妖怪の札性能は変わらない。出現条件は夜行へ出る時に決まり、その夜行が終わるまで固定される。</p>
      <div class="btn-row"><button class="btn btn-primary" type="button" data-action="time-help-dex">図鑑でヒントを見る</button><button class="btn" type="button" data-action="time-help-close">閉じる</button></div>
    </section>
  </div>`;
}

function achievementNoticeHtml() {
  const ids = unseenAchievementIds(G);
  if (!ids.length) return '';
  const names = ids.map(id => achievementDefinition(id)).filter(Boolean).map(def => esc(def.name));
  return `<aside class="achievement-notice" aria-live="polite" aria-label="新しく達成した実績">
    <span class="achievement-notice-icon" aria-hidden="true">🏆</span>
    <span><strong>実績達成!</strong><small>${names.join('・')}</small></span>
    <button type="button" data-action="achievement-notice-dismiss" aria-label="実績達成通知を閉じる">×</button>
  </aside>`;
}

function progressionGoalHtml(area, compact) {
  const goal = nextProgressionGoal(G, area);
  if (!goal) return `<section class="progression-goal complete"><strong>🏆 ${area ? '関連目標を達成済み' : 'すべての調伏目標を達成'}</strong></section>`;
  return `<section class="progression-goal ${compact ? 'compact' : ''}">
    <span aria-hidden="true">🧭</span><div><small>次の目標</small><strong>${esc(goal.name)}</strong><p>${esc(goal.description)} → ${esc(goal.reward)}</p></div>
    ${compact ? '' : '<button class="btn btn-small" type="button" data-action="nav-ranks">位階を見る</button>'}
  </section>`;
}

function progressionNoticeHtml() {
  const ids = unseenProgressionMilestoneIds(G);
  if (!ids.length) return '';
  const defs = ids.map(progressionMilestoneDefinition).filter(Boolean);
  return `<aside class="progression-notice" aria-live="polite" aria-label="新しい位階と解放">
    <span aria-hidden="true">✨</span><span><strong>位階昇格・新要素解放</strong><small>${defs.map(def => `${esc(def.name)}: ${esc(def.reward)}`).join(' / ')}</small></span>
    <button type="button" data-action="progression-notice-dismiss" aria-label="位階昇格通知を閉じる">×</button>
  </aside>`;
}

// ===== 各画面 =====
function renderTitle() {
  const time = gameTimeProvider();
  const pendingRun = peekRun();
  const st = G.stats;
  const hasProgress = st.runs > 0 || st.clears > 0 || st.captures > 0 || st.fusions > 0;
  const isNew = !G.ui.onboardingSeen && !hasProgress;
  const buttonText = pendingRun ? '🌙 夜行を再開' : (isNew ? 'はじめる' : '続きから');
  const buttonSub = pendingRun
    ? `${DUNGEONS[pendingRun.r.dungeon].name} ${pendingRun.r.depth}/${DUNGEONS[pendingRun.r.dungeon].length}歩`
    : (isNew ? '百鬼を率いる最初の夜へ' : `図鑑 ${dexOwnedCount()}/${Object.keys(SPECIES).length}　踏破 ${st.clears}`);
  const stateLabel = pendingRun ? '夜行の途中' : (isNew ? '新しい記録' : `位階「${currentProgressionRank(G).name}」`);
  app.innerHTML = `<main class="title-screen time-${time.timeBand.id}" data-screen="title" data-time-band="${time.timeBand.id}">
    <div class="title-moon" aria-hidden="true"></div>
    <div class="title-stars" aria-hidden="true"></div>
    <div class="title-art" aria-hidden="true">
      <span class="title-art-side">${artHtml('karakasa', '☂️')}</span>
      <span class="title-art-main">${artHtml('onibi', '🔥')}</span>
      <span class="title-art-side">${artHtml('tanuki', '🦝')}</span>
    </div>
    <section class="title-copy" aria-labelledby="game-title">
      <p class="title-kicker">妖怪デッキ構築ローグライト</p>
      <div class="title-logo"><span aria-hidden="true">百</span><h1 id="game-title">百鬼調伏録</h1></div>
      <p class="title-reading">ひゃっきちょうぶくろく</p>
      <p class="title-tagline">倒すか、従えるか。百鬼を率いて夜を往け。</p>
    </section>
    ${timeContextHtml(time)}
    <div class="title-guide" aria-label="遊び方の要点">
      <div><span>🧧</span><strong>弱らせて調伏</strong><small>敵の体力30%以下が好機</small></div>
      <div><span>🔮</span><strong>集めて憑合</strong><small>組み合わせから新たな妖怪へ</small></div>
    </div>
    <div class="title-actions">
      <p class="title-state">${stateLabel}</p>
      <button class="title-enter-btn" type="button" data-action="title-enter">
        <span>${buttonText}</span><small>${buttonSub}</small>
      </button>
      <nav class="title-menu" aria-label="タイトルメニュー">
        <button type="button" data-action="title-guide">遊び方</button>
        <button type="button" data-action="title-record">記録</button>
        <button type="button" data-action="title-settings">設定</button>
      </nav>
      <p class="title-autosave">自動保存・インストール対応 ・ v${APP_VERSION}</p>
    </div>
  </main>`;
}

function renderTutorial() {
  const slides = [
    {
      mark: '一', title: '百鬼と歩む夜へ', lead: 'あなたは、荒ぶる妖怪を鎮めて仲間にする調伏師。',
      body: '手持ち妖怪の札で夜道を進み、出会った百鬼を率いて図鑑を埋めよう。',
      art: `<div class="tutorial-party" aria-hidden="true"><span>${artHtml('karakasa', '☂️')}</span><span>${artHtml('onibi', '🔥')}</span><span>${artHtml('tanuki', '🦝')}</span></div>`,
    },
    {
      mark: '二', title: '弱らせて調伏', lead: '敵のHPを30%以下まで減らすと、調伏の好機。',
      body: '「調伏札」を選び、黄色く光る妖怪をタップしよう。倒してしまう前の見極めが肝心。',
      art: `<div class="tutorial-capture" aria-hidden="true"><span>${artHtml('chochin', '🏮')}</span><div><b>HP 3 / 12</b><i><em></em></i><strong>🧧 調伏可 83%</strong></div></div>`,
    },
    {
      mark: '三', title: '憑合で新たな妖怪へ', lead: '仲間が増えたら、拠点の「憑合」で二体を組み合わせよう。',
      body: '同じ妖怪は★が上がり、異なる妖怪からは新種が生まれる。組み合わせも図鑑に残る。',
      art: `<div class="tutorial-fusion" aria-hidden="true"><span>${artHtml('onibi', '🔥')}</span><b>×</b><span>${artHtml('tanuki', '🦝')}</span><b>→</b><span>${artHtml('kyubi', '🦊')}</span></div>`,
    },
  ];
  const slide = slides[tutorialStep] || slides[0];
  const last = tutorialStep === slides.length - 1;
  app.innerHTML = `<main class="tutorial-screen">
    <section class="tutorial-panel" aria-labelledby="tutorial-title">
      <div class="tutorial-progress" aria-label="全${slides.length}頁中${tutorialStep + 1}頁">
        ${slides.map((_, i) => `<span class="${i === tutorialStep ? 'active' : ''}">${i + 1}</span>`).join('')}
      </div>
      <p class="tutorial-mark">其ノ${slide.mark}</p>
      <h1 id="tutorial-title">${slide.title}</h1>
      ${slide.art}
      <p class="tutorial-lead">${slide.lead}</p>
      <p class="tutorial-body">${slide.body}</p>
      <div class="tutorial-actions">
        <button class="btn" type="button" data-action="tutorial-skip">${tutorialExit === 'guide' ? '遊び方へ戻る' : 'スキップ'}</button>
        <button class="btn btn-primary" type="button" data-action="tutorial-next">${last ? (tutorialExit === 'guide' ? '確認を終える' : '拠点へ向かう') : '次へ'}</button>
      </div>
    </section>
  </main>`;
}

function renderGuide() {
  app.innerHTML = `<main class="utility-screen"><div class="screen utility-content">
    <p class="utility-kicker">調伏師の手引き</p>
    <h1 class="h2">遊び方</h1>
    <div class="guide-grid">
      <article><span>🌙</span><div><strong>夜行へ出る</strong><p>分かれ道を選び、戦闘や茶屋を経て10歩目の主を目指す。</p></div></article>
      <article><span>🧧</span><div><strong>弱らせて調伏</strong><p>敵HP30%以下で調伏可能。黄色の「調伏可」が目印。</p></div></article>
      <article><span>🔮</span><div><strong>仲間を憑合</strong><p>同種は★上昇、異種は新種へ。完成予定Lvを確認して実行する。</p></div></article>
    </div>
    <section class="first-night-route" aria-labelledby="first-night-title">
      <h2 id="first-night-title">最初の一夜</h2>
      <ol><li>拠点で「夜行に出る」</li><li>「宵の小径」を選ぶ</li><li>戦闘で敵をHP30%以下へ</li><li>調伏札を選び、敵をタップ</li></ol>
    </section>
    <div class="btn-row"><button class="btn" type="button" data-action="tutorial-replay">3画面の導入を再確認</button></div>
    <div class="btn-row"><button class="btn btn-primary" type="button" data-action="utility-back">${utilityReturn === 'title' ? 'タイトルへ戻る' : '拠点へ戻る'}</button></div>
  </div></main>`;
}

function renderSettings() {
  const reduced = !!G.ui.reducedMotion;
  app.innerHTML = `<main class="utility-screen"><div class="screen utility-content">
    <p class="utility-kicker">環境設定</p>
    <h1 class="h2">設定</h1>
    <section class="setting-card">
      <div><strong>画面の演出</strong><p>光の呼吸やボタンの動きを抑える。端末の「視差効果を減らす」設定も自動で尊重する。</p></div>
      <button class="btn ${reduced ? 'btn-active' : ''}" type="button" data-action="setting-motion" aria-pressed="${reduced ? 'true' : 'false'}">${reduced ? '✓ 演出を減らす' : '標準の演出'}</button>
    </section>
    <section class="setting-card"><div><strong>保存について</strong><p>操作の節目でこの端末へ自動保存する。端末を移る場合は「記録」の引継ぎコードを利用する。</p></div></section>
    <div class="btn-row"><button class="btn btn-primary" type="button" data-action="utility-back">${utilityReturn === 'title' ? 'タイトルへ戻る' : '拠点へ戻る'}</button></div>
  </div></main>`;
}

function renderHome() {
  const time = gameTimeProvider();
  const st = G.stats;
  const achievementCount = G.achievements.unlocked.length;
  const unseenCount = unseenAchievementIds(G).length;
  const unclaimedCount = unclaimedAchievementRewardIds(G).length;
  const rank = currentProgressionRank(G);
  const ending = finalTrialCleared(G);
  const firstNight = st.runs === 0;
  const rosterHtml = G.roster.map(u => unitCard(u, { inDeck: G.deck.includes(u.uid) })).join('');
  app.innerHTML = `<main class="home-time-shell time-${time.timeBand.id} ${ending ? 'ending-unlocked' : ''}" data-time-band="${time.timeBand.id}"><div class="screen home">
    <header class="home-hero"><h1>調伏師の拠点</h1><span>${ending ? '大調伏師として、明けた夜をさらに歩め' : '妖怪を調伏し、百鬼の図鑑を埋めよ'}</span></header>
    ${ending ? '<div class="ending-home-banner">🌅 百鬼の試練 踏破済み — 称号「大調伏師」</div>' : ''}
    ${timeContextHtml(time)}
    <div class="home-summary" aria-label="進行状況"><span><small>位階</small><strong>${rank.name}</strong><b>${rank.value}/${rank.max}</b></span><span><small>図鑑</small><strong>${dexOwnedCount()}/${Object.keys(SPECIES).length}</strong><b>使役</b></span><span><small>夜行</small><strong>${st.clears}</strong><b>踏破</b></span><span><small>調伏</small><strong>${st.captures}</strong><b>体</b></span></div>
    <section class="home-primary-panel">
      ${progressionGoalHtml()}
      ${firstNight ? '<aside class="first-night-callout"><span>一</span><div><strong>まずは最初の夜行へ</strong><p>準備は整っている。「宵の小径」で調伏を一度試してみよう。</p></div></aside>' : ''}
      <div class="btn-row">
      <button class="btn btn-primary btn-big ${firstNight ? 'first-night-action' : ''}" data-action="start-run">🌙 ${firstNight ? '最初の夜行へ' : '夜行に出る'}</button>
      </div>
    </section>
    ${sectionHeader('支度と記録', '', '夜行前の準備や集めた記録を確認')}
    <nav class="dashboard-grid" aria-label="拠点メニュー">
      <button data-action="nav-deck"><span>🎴</span><strong>編成</strong><small>${G.deck.length}/${DECK_MAX}枚</small></button>
      <button data-action="nav-fusion"><span>🔮</span><strong>憑合</strong><small>新種・重ね</small></button>
      <button data-action="nav-items"><span>🧿</span><strong>呪具</strong><small>所持${itemTotal()}</small></button>
      <button data-action="nav-dex"><span>📖</span><strong>図鑑</strong><small>${dexOwnedCount()}/${Object.keys(SPECIES).length}</small></button>
      <button class="achievement-home-btn" data-action="nav-achievements"><span>🏆</span><strong>実績</strong><small>${achievementCount}/${ACHIEVEMENTS.length}${unseenCount ? `・NEW ${unseenCount}` : ''}${unclaimedCount ? `・受取 ${unclaimedCount}` : ''}</small></button>
      <button data-action="nav-ranks"><span>🎖️</span><strong>位階</strong><small>${rank.value}/${rank.max}</small></button>
      <button data-action="nav-guide"><span>📜</span><strong>遊び方</strong><small>手引き</small></button>
      <button data-action="nav-settings"><span>⚙️</span><strong>設定</strong><small>演出</small></button>
      <button data-action="nav-save"><span>💾</span><strong>記録</strong><small>引継ぎ</small></button>
    </nav>
    ${sectionHeader('手持ち妖怪', `${G.roster.length}体`, 'イラストをタップすると詳細を表示')}
    <div class="grid">${rosterHtml}</div>
    ${toastHtml()}
  </div></main>`;
}

function renderDungeon() {
  const firstNight = G.stats.runs === 0;
  const cards = DUNGEON_ORDER.map(id => {
    const dg = DUNGEONS[id];
    const unlocked = dungeonUnlocked(id);
    const clears = G.dungeonClears[id] || 0;
    const recommended = firstNight && id === 'd1';
    const classes = ['node-card'];
    if (!unlocked) classes.push('locked');
    if (recommended) classes.push('recommended');
    return `<div class="${classes.join(' ')}" data-action="choose-dungeon" data-arg="${id}" role="button" tabindex="${unlocked ? '0' : '-1'}" aria-label="${esc(dg.name)}${unlocked ? 'へ出撃' : '、未解放'}" aria-disabled="${unlocked ? 'false' : 'true'}">
      ${recommended ? '<div class="recommended-label">最初はここ</div>' : ''}
      <div class="node-emoji">${unlocked ? dg.emoji : '🔒'}</div>
      <div class="node-name">${unlocked ? dg.name : '???'}</div>
      <div class="node-desc">${unlocked
        ? `全${dg.length}歩 / 踏破${clears}回${clears > 0 ? '<br>⚡式神代行・🪶手加減 解放済み' : ''}`
        : `${DUNGEONS[dg.unlock].name}を踏破すると開通`}</div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="screen screen-shell dungeon-screen" data-screen="dungeon">
    ${screenHeader('夜行', '行き先を選ぶ', 'ダンジョン踏破ごとに+15、次の道も解放', `<span>❤️ 最大${runMaxHp()}</span>`)}
    <section class="content-panel goal-panel">${progressionGoalHtml('dungeon', true)}</section>
    ${sectionHeader('夜路', `${DUNGEON_ORDER.filter(dungeonUnlocked).length}/${DUNGEON_ORDER.length}開通`, '挑む場所を選択')}
    <div class="node-row dungeon-row">${cards}</div>
    ${backActions('nav-home', '拠点へ戻る')}
    ${toastHtml()}
  </div>`;
}

function renderDeck() {
  const rosterHtml = G.roster.map(u => unitCard(u, {
    action: 'deck-toggle',
    selected: G.deck.includes(u.uid),
    badge: G.deck.includes(u.uid) ? '出撃' : '',
  })).join('');
  app.innerHTML = `<div class="screen screen-shell deck-screen" data-screen="deck">
    ${screenHeader('夜行支度', '編成', '妖怪をタップして出撃札を入れ替える', `<span>${G.deck.length}/${DECK_MAX}枚</span>`)}
    <section class="content-panel deck-summary"><div><strong>出撃 ${G.deck.length}枚</strong><span>最低${deckMinSize()}枚・最大${DECK_MAX}枚</span></div><div class="deck-meter" role="progressbar" aria-label="編成枚数" aria-valuemin="${deckMinSize()}" aria-valuemax="${DECK_MAX}" aria-valuenow="${G.deck.length}"><span style="width:${Math.round(G.deck.length / DECK_MAX * 100)}%"></span></div></section>
    ${sectionHeader('手持ちから選ぶ', '「出撃」が編成中', 'イラストの＋は詳細、カード本体は編成切替')}
    <div class="grid">${rosterHtml}</div>
    ${backActions('nav-home', '編成を終える')}
    ${toastHtml()}
  </div>`;
}

function renderFusion() {
  const rosterHtml = G.roster.map(u => unitCard(u, {
    action: 'fusion-select',
    selected: fusionSel.includes(u.uid),
  })).join('');
  let preview = '';
  if (fusionResult) {
    const s = SPECIES[fusionResult.sp];
    preview = `<div class="fusion-preview ok">
      <div class="big-emoji">${artHtml(s.id, s.emoji)}</div>
      <div><b>${s.name}</b>${starText(fusionResult)} が生まれた!(Lv${unitLevel(fusionResult)})</div>
      <div class="hint">${s.desc}</div>
    </div>`;
  } else if (fusionSel.length === 2) {
    const a = getUnit(fusionSel[0]), b = getUnit(fusionSel[1]);
    if (a.sp === b.sp) {
      // 同種 → 重ね
      const s = SPECIES[a.sp];
      const star = Math.max(a.star, b.star) + 1;
      preview = star > STAR_MAX
        ? `<div class="fusion-preview ng">これ以上重ねられない(★${STAR_MAX}が上限)</div>`
        : `<div class="fusion-preview ok">
            <div>${s.emoji} 重ね: <b>${s.name}</b> が <span class="star">${'★'.repeat(star)}</span> になる(数値+2/★)</div>
            <div class="hint">完成予定 Lv${fusionResultLevel(a, b)} / ★${star}</div>
            <button class="btn btn-primary" data-action="fusion-exec">重ねる(2体は1体になる)</button>
          </div>`;
    } else {
      const rec = findRecipe(a.sp, b.sp);
      if (rec) {
        const known = G.found.includes(rec.result);
        const rs = SPECIES[rec.result];
        preview = `<div class="fusion-preview ok">
          <div>${SPECIES[a.sp].emoji} × ${SPECIES[b.sp].emoji} → ${known ? rs.emoji + ' ' + rs.name : '❓ 何かが生まれそうだ…'}</div>
          <div class="hint">完成予定 Lv${fusionResultLevel(a, b)} / ★0</div>
          <button class="btn btn-primary" data-action="fusion-exec">憑合する(2体は消える)</button>
        </div>`;
      } else {
        preview = `<div class="fusion-preview ng">この組み合わせは反応しない</div>`;
      }
    }
  } else {
    preview = `<div class="fusion-preview">妖怪を2体選ぶと反応が見える<br><span class="hint">同種2体は「重ね」で★が上がる</span></div>`;
  }
  const hints = RECIPES.map(r => {
    const a = SPECIES[r.pair[0]], b = SPECIES[r.pair[1]];
    const known = G.found.includes(r.result);
    const rs = SPECIES[r.result];
    return `<li>${a.emoji}${a.name} × ${b.emoji}${b.name} → ${known ? rs.emoji + rs.name : '???'}</li>`;
  }).join('');
  app.innerHTML = `<div class="screen screen-shell fusion-screen" data-screen="fusion">
    ${screenHeader('妖怪の組み合わせ', '憑合', '2体を選び、新種または★上昇へ', `<span>${fusionSel.length}/2体選択</span>`)}
    <section class="content-panel goal-panel">${progressionGoalHtml('fusion', true)}</section>
    <section class="fusion-workbench" aria-live="polite">${preview}</section>
    ${sectionHeader('素材を選ぶ', `${fusionSel.length}/2`, '選択中の妖怪には金の表示')}
    <div class="grid">${rosterHtml}</div>
    <details class="recipes"><summary>言い伝え(レシピヒント)</summary><ul>${hints}</ul></details>
    ${backActions('nav-home', '憑合を終える')}
    ${toastHtml()}
  </div>`;
}

function renderItems() {
  const inv = Object.values(ITEMS).map(it => {
    const n = itemCount(it.id);
    return `<div class="unit item-card ${itemSel === it.id ? 'selected' : ''} ${n < 1 ? 'item-empty' : ''}"
      ${n >= 1 ? `data-action="item-select" data-arg="${it.id}"` : ''}>
      <div class="unit-emoji">${it.emoji}</div>
      <div class="unit-name">${it.name}</div>
      <div class="unit-effect">${it.desc}</div>
      <div class="unit-lv">所持 ${n}</div>
      ${itemSel === it.id ? '<div class="unit-badge">選択中</div>' : ''}
    </div>`;
  }).join('');
  const rosterHtml = G.roster.map(u => unitCard(u, {
    action: 'item-target',
    selected: !!u.item,
    selectedLabel: '装備中',
  })).join('');
  app.innerHTML = `<div class="screen screen-shell items-screen" data-screen="items">
    ${screenHeader('夜行支度', '呪具', '妖怪1体につき1つ装備', `<span>袋 ${itemTotal()}個</span>`)}
    <section class="content-panel instruction-panel"><strong>装備手順</strong><p>① 呪具を選ぶ　② 妖怪を選ぶ。装備中の妖怪を選ぶとはずせる。</p></section>
    ${sectionHeader('呪具袋', `${itemTotal()}個`, '強戦闘・ボス・宝で入手')}
    <div class="grid">${inv}</div>
    ${sectionHeader('装備する妖怪', `${G.roster.filter(u => u.item).length}体が装備中`, itemSel && ITEMS[itemSel] ? `${ITEMS[itemSel].name}の装備先を選択` : '先に呪具を選択')}
    <div class="grid">${rosterHtml}</div>
    ${backActions('nav-home', '装備を終える')}
    ${toastHtml()}
  </div>`;
}

function renderDex() {
  const items = Object.values(SPECIES).map(s => {
    const state = G.dex[s.id] || 0;
    const places = STORY_DUNGEON_ORDER.filter(d => DUNGEONS[d].pools.t1.includes(s.id) || DUNGEONS[d].pools.t2.includes(s.id))
      .map(d => DUNGEONS[d].emoji).join('');
    const habitat = s.tier === 0 ? '憑合のみ' : places;
    const conditionHint = s.encounter ? `<div class="dex-hint">🌙 ${esc(s.encounter.hint)}</div>` : '';
    if (state === 2) {
      return `<div class="unit dex-item">
        <div class="unit-top"><span class="unit-emoji">${artHtml(s.id, s.emoji)}</span>${elemChip(s.element)}<span class="cost">◆${s.cost}</span></div>
        <div class="unit-name">${s.name}</div>
        <div class="unit-lv">${s.role} | ${habitat}</div>
        <div class="unit-effect">${s.desc}</div>
        ${conditionHint}
      </div>`;
    }
    if (state === 1) {
      return `<div class="unit dex-item dex-seen">
        <div class="unit-emoji">${artHtml(s.id, s.emoji)}</div>
        <div class="unit-name">${s.name}</div>
        <div class="unit-lv">目撃のみ | ${habitat}</div>
        ${conditionHint}
      </div>`;
    }
    return `<div class="unit dex-item dex-unknown${s.encounter ? ' dex-conditioned' : ''}">
      <div class="unit-emoji">❓</div>
      <div class="unit-name">???</div>
      <div class="unit-lv">${s.tier === 0 ? '憑合のみ' : '未発見'}</div>
      ${conditionHint}
    </div>`;
  }).join('');
  const seenCount = Object.values(G.dex).filter(v => v >= 1).length;
  app.innerHTML = `<div class="screen screen-shell dex-screen" data-screen="dex">
    ${screenHeader('百鬼の記録', '妖怪図鑑', '出会いと使役の記録', `<span>使役 ${dexOwnedCount()}/${Object.keys(SPECIES).length}</span>`)}
    <div class="collection-summary"><span><small>使役</small><strong>${dexOwnedCount()}</strong></span><span><small>目撃以上</small><strong>${seenCount}</strong></span><span><small>全妖怪</small><strong>${Object.keys(SPECIES).length}</strong></span></div>
    <section class="content-panel goal-panel">${progressionGoalHtml('dex', true)}</section>
    ${sectionHeader('妖怪一覧', '', '🏮宵の小径　🌫️深山の霧道　⛩️百鬼の御堂')}
    <div class="grid">${items}</div>
    ${backActions('nav-home', '図鑑を閉じる')}
    ${toastHtml()}
  </div>`;
}

function renderAchievements() {
  const statuses = evaluateAchievements(G);
  const unlockedCount = statuses.filter(status => status.done).length;
  const rewardCount = statuses.filter(status => status.reward).length;
  const claimedCount = statuses.filter(status => status.reward && achievementRewardClaimed(G, status.id)).length;
  const items = statuses.map(status => {
    const percent = Math.min(100, Math.round(status.value / status.target * 100));
    let rewardHtml = '<span class="achievement-record">達成記録</span>';
    if (status.reward) {
      if (!status.done) rewardHtml = `<span class="achievement-reward">🎁 ${esc(status.reward.label)}</span>`;
      else if (achievementRewardClaimed(G, status.id)) rewardHtml = `<span class="achievement-reward claimed">✓ 受取済み: ${esc(status.reward.label)}</span>`;
      else rewardHtml = `<button class="btn btn-primary btn-small" type="button" data-action="achievement-claim" data-arg="${status.id}">🎁 ${esc(status.reward.label)}を受け取る</button>`;
    }
    return `<article class="achievement-card ${status.done ? 'done' : ''}">
      <div class="achievement-card-head"><span class="achievement-medal" aria-hidden="true">${status.done ? '🏆' : '◌'}</span><div><h3>${esc(status.name)}</h3><p>${esc(status.description)}</p></div><strong>${status.done ? '達成' : `${status.value}/${status.target}`}</strong></div>
      <div class="achievement-progress" role="progressbar" aria-label="${esc(status.name)}の進捗" aria-valuemin="0" aria-valuemax="${status.target}" aria-valuenow="${status.value}"><span style="width:${percent}%"></span></div>
      <div class="achievement-card-foot">${rewardHtml}</div>
    </article>`;
  }).join('');
  app.innerHTML = `<div class="screen screen-shell achievements-screen" data-screen="achievements">
    ${screenHeader('調伏師の歩み', '実績', '達成条件と恒久報酬', `<span>${unlockedCount}/${ACHIEVEMENTS.length}達成</span>`)}
    <div class="collection-summary"><span><small>達成</small><strong>${unlockedCount}</strong></span><span><small>未達成</small><strong>${ACHIEVEMENTS.length - unlockedCount}</strong></span><span><small>報酬受取</small><strong>${claimedCount}/${rewardCount}</strong></span></div>
    <p class="achievement-guide">実績と報酬は最初から確認可能。図鑑の節目報酬は、受け取った次の夜行から調伏札へ反映される。</p>
    ${sectionHeader('実績一覧', '', '条件、進捗、報酬を確認')}
    <div class="achievement-list">${items}</div>
    ${backActions('nav-home', '実績を閉じる')}
    ${toastHtml()}
  </div>`;
}

function renderRanks() {
  const rank = currentProgressionRank(G);
  const rows = progressionStatuses(G).map((status, index) => {
    let choiceHtml = '';
    if (status.choice && status.done) {
      const chosen = G.progression.choices[status.id];
      choiceHtml = chosen
        ? `<div class="rank-choice-claimed">✓ 選択済み: ${ITEMS[chosen].emoji}${ITEMS[chosen].name}</div>`
        : `<div class="rank-choice-row">${status.choice.map(itemId => `<button class="btn btn-small" type="button" data-action="rank-choice" data-arg="${status.id}:${itemId}">${ITEMS[itemId].emoji}${ITEMS[itemId].name}</button>`).join('')}</div>`;
    }
    return `<article class="rank-row ${status.done ? 'done' : ''}">
      <span class="rank-number">${status.done ? '✓' : index + 1}</span><div><strong>${esc(status.name)}</strong><p>${esc(status.description)}</p><small>解放: ${esc(status.reward)}</small>${choiceHtml}</div>
    </article>`;
  }).join('');
  app.innerHTML = `<div class="screen screen-shell ranks-screen" data-screen="ranks">
    ${screenHeader('調伏師の歩み', '調伏師位階', '節目ごとの解放と報酬', `<span>${rank.value}/${rank.max}節目</span>`)}
    <div class="rank-current"><small>現在の位階</small><strong>${rank.name}</strong><span>${rank.value}/${rank.max}節目</span></div>
    <section class="content-panel goal-panel">${progressionGoalHtml(null, true)}</section>
    <p class="achievement-guide">既存のHP成長、ダンジョン・式神代行・図鑑報酬もここで振り返れる。節目は異なる順で達成しても失われない。</p>
    ${sectionHeader('位階の節目', '', '達成順にかかわらず記録される')}
    <div class="rank-list">${rows}</div>
    ${backActions('nav-home', '位階を閉じる', '<button class="btn" data-action="nav-achievements">実績と報酬</button>')}
    ${toastHtml()}
  </div>`;
}

function renderSave() {
  const backLabel = utilityReturn === 'title' ? 'タイトルへ戻る' : '拠点へ戻る';
  app.innerHTML = `<div class="screen screen-shell save-screen" data-screen="save">
    ${screenHeader('端末の記録', 'セーブ・バックアップ', '進行は操作の節目で自動保存', `<span>v${APP_VERSION}</span>`)}
    <section class="content-panel save-note"><strong>大切な記録を端末外にも控える</strong><p>ホーム画面版はSafariの7日制限の対象外だが、端末変更やブラウザデータ削除に備えてJSONを「ファイル」やクラウドへ保存すると安心。</p></section>
    <section class="save-card save-file-card"><div><span>1</span><h2>JSONバックアップ</h2><p>手持ち・図鑑・実績などをファイルで保存／復元する。進行中の夜行は含まれない</p></div><div class="save-file-actions"><button class="btn btn-primary" type="button" data-action="save-json">JSONを共有・保存</button><label class="btn file-input-label" for="save-file-input">JSONから復元<input id="save-file-input" class="visually-hidden" type="file" accept="application/json,text/plain,.json"></label></div></section>
    <section class="save-card"><div><span>2</span><h2>引継ぎコードを書き出す</h2><p>従来形式。現在の手持ちと進行を文字列にする</p></div><textarea id="export-text" class="save-text" readonly aria-label="書き出し用引継ぎコード">${exportSave()}</textarea><button class="btn" data-action="save-select">全選択してコピー用にする</button></section>
    <section class="save-card"><div><span>3</span><h2>引継ぎコードを読み込む</h2><p>別端末で控えたコードを復元する</p></div><textarea id="import-text" class="save-text" placeholder="引継ぎコードを貼り付け" aria-label="読み込む引継ぎコード"></textarea><button class="btn" data-action="save-import">引継ぎコードを読み込む</button></section>
    <section class="danger-zone"><div><strong>最初からやり直す</strong><p>手持ち、図鑑、実績をすべて初期状態へ戻す。</p></div><button class="btn btn-danger" data-action="reset-save">データを初期化</button></section>
    ${backActions('utility-back', backLabel)}
    ${toastHtml()}
  </div>`;
}

function renderNode() {
  const opts = nodeOpts.map((o, i) => {
    const info = NODE_INFO[o.type];
    return `<div class="node-card route-card" data-action="choose-node" data-arg="${i}" role="button" tabindex="0">
      <div class="route-number">道 ${i + 1}</div>
      <div class="node-emoji">${info.emoji}</div>
      <div class="node-name">${info.name}</div>
      <div class="node-desc">${info.desc}</div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="screen screen-shell node-screen" data-screen="node">
    ${statusBar()}
    ${screenHeader('夜行の分かれ道', currentDungeon().name, `${R.depth + 1}歩目 / 全${currentDungeon().length}歩`, '<span>道を1つ選択</span>')}
    ${sectionHeader('進む道', '', '選んだ先へ進むと戻れない')}
    <div class="node-row">${opts}</div>
    <div class="run-danger-action"><button class="btn btn-danger" data-action="abandon-run">夜行を諦めて帰る</button></div>
    ${toastHtml()}
  </div>`;
}

function renderEvent() {
  let body = '';
  if (E.kind === 'rest') {
    body = `<div class="big-emoji">🍵</div>
      <p>提灯の灯る茶屋を見つけた。</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="rest-heal">一服する(HP+${Math.round(R.maxHp * 0.4)})</button>
        <button class="btn btn-primary" data-action="rest-fuda">札を仕入れる(調伏札+2)</button>
      </div>`;
  } else if (E.kind === 'treasure-choice') {
    const buttons = E.options.map((option, index) => {
      const label = option.kind === 'item' ? `${ITEMS[option.id].emoji}${ITEMS[option.id].name}` : `🧧 調伏札+${option.extra}`;
      return `<button class="btn btn-primary" data-action="treasure-choice" data-arg="${index}">${label}</button>`;
    }).join('');
    body = `<div class="big-emoji">🎁</div><p>百妖頭の眼で、宝の気配を二つ見抜いた。どちらを持ち帰る?</p><div class="btn-row">${buttons}</div>`;
  } else {
    body = `<div class="big-emoji">${E.kind === 'treasure' ? '🎁' : '🍵'}</div>
      <p>${esc(E.msg)}</p>
      <div class="btn-row"><button class="btn btn-primary" data-action="event-continue">先へ進む</button></div>`;
  }
  app.innerHTML = `<div class="screen screen-shell event-screen" data-screen="event">${statusBar()}${screenHeader('夜行の出来事', E.kind === 'rest' ? '茶屋' : '道中の発見', '選択して夜行を続ける', '')}<section class="event-card">${body}</section>${toastHtml()}</div>`;
}

function enemyHtml(e, idx) {
  const dead = e.state !== 'alive';
  const ratio = e.maxHp ? e.hp / e.maxHp : 0;
  const capturable = canCapture(e);
  const cls = ['enemy'];
  if (dead) cls.push(e.state === 'captured' ? 'captured' : 'dead');
  if (capturable) cls.push('capturable');
  if (captureMode && capturable) cls.push('capture-target');
  if (e.mercyTag && e.state === 'alive') cls.push('mercy-spared');
  const ailments = [
    e.poison > 0 ? `<span class="poison">毒${e.poison}</span>` : '',
    e.weak > 0 ? `<span class="weakened">弱${e.weak}</span>` : '',
    e.rage > 0 ? `<span class="rage">怒×${e.rage}</span>` : '',
  ].filter(Boolean).join(' ');
  const actionLabel = dead ? `${e.name}、${e.state === 'captured' ? '調伏済み' : '討伐済み'}` : `${e.name}、HP${e.hp}/${e.maxHp}${capturable ? `、調伏可能${captureRate(e)}パーセント` : ''}`;
  return `<div class="${cls.join(' ')}" data-action="target-enemy" data-arg="${idx}" role="button" tabindex="${dead ? '-1' : '0'}" aria-disabled="${dead ? 'true' : 'false'}" aria-label="${esc(actionLabel)}">
    <div class="enemy-emoji">${artHtml(e.art, e.emoji)}</div>
    <div class="enemy-name">${esc(e.name)} ${elemChip(e.element)}</div>
    ${dead
      ? `<div class="enemy-state">${e.state === 'captured' ? '調伏!' : '討伐'}</div>`
      : `<div class="hpbar"><div class="hpfill" style="width:${Math.round(ratio * 100)}%"></div></div>
         <div class="enemy-hp">${e.hp}/${e.maxHp}</div>
         <div class="enemy-intent">攻撃予告: ${enemyAtk(e)} ${ailments}</div>
         ${e.mercyTag ? '<div class="mercy-mark">🪶 手加減・HP1</div>' : ''}
         ${capturable ? `<div class="cap-mark">🧧調伏可 ${captureRate(e)}%</div>` : ''}`}
  </div>`;
}

function renderBattle() {
  const enemies = B.enemies.map((e, i) => enemyHtml(e, i)).join('');
  const firstCaptureGuide = G.stats.captures === 0 && !B.boss;
  const captureReady = B.enemies.some(e => canCapture(e));
  const hand = B.hand.map(uid => {
    const u = getUnit(uid);
    if (!u) return '';
    const s = SPECIES[u.sp];
    const playable = B.energy >= effCost(u);
    const itemMark = u.item && ITEMS[u.item] ? ITEMS[u.item].emoji : '';
    return `<div class="hand-card ${selCard === uid ? 'selected' : ''} ${playable ? '' : 'disabled'}" role="button" tabindex="0" aria-pressed="${selCard === uid ? 'true' : 'false'}" aria-label="${esc(s.name)}の札、霊力${effCost(u)}、${esc(effectText(u))}${playable ? '' : '、霊力不足'}"
      data-action="play-card" data-arg="${uid}">
      <div class="unit-top"><span class="cost">◆${effCost(u)}</span>${elemChip(s.element)}</div>
      <div class="unit-emoji">${artHtml(s.id, s.emoji)}</div>
      <div class="unit-name">${esc(s.name)}${starText(u)}</div>
      <div class="unit-effect">${effectText(u)}</div>
      <div class="unit-lv">Lv${unitLevel(u)} ${itemMark}</div>
    </div>`;
  }).join('');

  let overlay = '';
  if (B.over) {
    const win = B.over === 'win';
    const lvups = B.levelUps.map(l => `<li>${l.emoji}${l.name} Lv${l.from}→${l.to}</li>`).join('');
    const caps = B.captured.map(u => `<li>${SPECIES[u.sp].emoji}${SPECIES[u.sp].name} を調伏!</li>`).join('');
    const drop = B.itemDrop && ITEMS[B.itemDrop]
      ? `<p class="drop-line">呪具「${ITEMS[B.itemDrop].emoji}${ITEMS[B.itemDrop].name}」を手に入れた!</p>` : '';
    overlay = `<div class="overlay" role="presentation"><section class="overlay-box battle-result-card ${win ? 'win' : 'lose'}" role="dialog" aria-modal="true" aria-labelledby="battle-result-title" tabindex="-1">
      <div class="result-mark" aria-hidden="true">${win ? '勝' : '敗'}</div>
      <h2 id="battle-result-title">${win ? (B.boss ? '🌅 夜行の主を討った!' : '⭐ 勝利') : '💤 力尽きた…'}</h2>
      ${win ? `<div class="result-summary"><span><small>獲得EXP</small><strong>+${B.expGained}</strong></span><span><small>調伏</small><strong>${B.captured.length}体</strong></span></div>` : '<p class="result-message">調伏した妖怪は持ち帰れる。</p>'}
      ${drop}
      ${caps ? `<ul>${caps}</ul>` : ''}
      ${lvups ? `<ul>${lvups}</ul>` : ''}
      <button class="btn btn-primary btn-big" data-action="battle-continue">${win && !B.boss ? '先へ進む' : '結果へ'}</button>
    </section></div>`;
  }

  app.innerHTML = `<div class="screen battle-screen" data-screen="battle">
    ${statusBar()}
    ${firstCaptureGuide ? `<aside class="battle-beginner-hint ${captureReady ? 'ready' : ''}"><strong>${captureReady ? '🧧 今が調伏の好機' : '最初の調伏を狙おう'}</strong><span>${captureReady ? '「調伏札」を選び、黄色く光る敵をタップ' : '札で敵のHPを30%以下まで減らす'}</span></aside>` : ''}
    <div class="battle-layout">
      <div class="battle-main">
        <div class="battle-section-label"><strong>敵妖怪</strong><span>${aliveEnemies().length}体</span></div>
        <div class="enemy-row">${enemies}</div>
        <div class="log" role="log" aria-live="polite" aria-label="戦闘記録"><strong>戦況</strong>${B.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>
      </div>
      <div class="battle-side">
        <div class="battle-section-label"><strong>手札</strong><span>霊力内で選択</span></div>
        <div class="hand-row">${hand}</div>
        <div class="battle-section-label action-label"><strong>行動</strong><span>札またはターン終了</span></div>
        <div class="btn-row battle-actions">
          <button class="btn ${captureMode ? 'btn-active' : ''}" data-action="toggle-capture" aria-pressed="${captureMode ? 'true' : 'false'}">${captureMode ? '✓ ' : ''}🧧 調伏札(残${R.fuda})</button>
          ${mercyAvailable() ? `<button class="btn ${B.mercy ? 'btn-active mercy-on' : ''}" data-action="toggle-mercy" aria-pressed="${B.mercy ? 'true' : 'false'}" ${B.boss ? 'disabled' : ''}>🪶 手加減 ${B.boss ? '無効' : (B.mercy ? 'ON' : 'OFF')}</button>` : ''}
          ${autoAvailable() ? `<button class="btn" data-action="auto-battle">⚡式神代行</button>` : ''}
          <button class="btn btn-primary" data-action="end-turn">ターン終了 ▶</button>
        </div>
      </div>
    </div>
    ${toastHtml()}
    ${overlay}
  </div>`;
}

function renderResume() {
  const d = peekRun();
  if (!d) { screen = 'home'; renderHome(); return; }
  const dg = DUNGEONS[d.r.dungeon];
  const inBattle = !!(d.b && !d.b.over);
  app.innerHTML = `<div class="screen result-screen resume-screen" data-screen="resume">
    <section class="result-page-card"><div class="result-page-icon">🌙</div><p class="utility-kicker">保存された夜行</p><h1>進行中の夜行がある</h1>
    <div class="run-summary"><strong>${dg.emoji} ${dg.name}</strong><span>${d.r.depth}/${dg.length}歩</span><span>❤️ ${d.r.hp}/${d.r.maxHp}</span><span>🧧 ${d.r.fuda}枚${inBattle ? '・戦闘中' : ''}</span></div>
    <p class="result-message">再開すると${inBattle ? 'そのターンの頭から戦闘の' : '分かれ道から'}続きが遊べる。諦めても調伏済みの妖怪は手元に残る。</p>
    <div class="result-actions"><button class="btn btn-primary btn-big" data-action="resume-run">夜行を再開する</button><button class="btn btn-danger" data-action="resume-discard">諦めて拠点へ</button></div></section>
  </div>`;
}

function renderRunEnd() {
  const caps = R.captured.map(u => `<li>${SPECIES[u.sp].emoji}${SPECIES[u.sp].name}(仲間になった)</li>`).join('');
  const ending = R.clear && R.dungeon === 'trial';
  app.innerHTML = `<div class="screen result-screen runend-screen" data-screen="runend"><section class="result-page-card ${R.clear ? 'clear' : ''}">
    <div class="result-page-icon">${ending || R.clear ? '🌅' : '🌙'}</div><p class="utility-kicker">夜行の記録</p>
    <h1>${ending ? '百鬼調伏録・結' : (R.clear ? '夜行踏破!' : '夜行終了')}</h1>
    <p class="result-message">${ending ? '三たび立ちはだかった夜行の主を越え、百鬼を率いる者として本当の夜明けを迎えた。' : (R.clear ? `${currentDungeon().name}の主を討ち、夜が明けた。` : '今宵はここまで。')}</p>
    ${ending ? '<div class="ending-title">特別称号「大調伏師」</div><p class="hint">物語の区切り。図鑑や編成、任意の周回はこの先も続けられる。</p>' : ''}
    <section class="capture-summary"><h2>今宵の調伏</h2>${caps ? `<ul class="center-list">${caps}</ul>` : '<p class="hint">今宵の調伏はなし</p>'}</section>
    <div class="result-actions"><button class="btn btn-primary btn-big" data-action="run-close">拠点へ帰る</button></div>
  </section></div>`;
}

function render() {
  applyUiSettings();
  const screenChanged = screen !== lastRenderedScreen;
  switch (screen) {
    case 'title': renderTitle(); break;
    case 'tutorial': renderTutorial(); break;
    case 'guide': renderGuide(); break;
    case 'settings': renderSettings(); break;
    case 'home': renderHome(); break;
    case 'dungeon': renderDungeon(); break;
    case 'deck': renderDeck(); break;
    case 'fusion': renderFusion(); break;
    case 'dex': renderDex(); break;
    case 'achievements': renderAchievements(); break;
    case 'ranks': renderRanks(); break;
    case 'items': renderItems(); break;
    case 'save': renderSave(); break;
    case 'node': renderNode(); break;
    case 'battle': renderBattle(); break;
    case 'event': renderEvent(); break;
    case 'runend': renderRunEnd(); break;
    case 'resume': renderResume(); break;
  }
  if (detailUid !== null) app.innerHTML += unitDetailHtml();
  if (timeHelpOpen) app.innerHTML += timeHelpHtml();
  if (!['title', 'tutorial', 'guide', 'settings'].includes(screen)) app.innerHTML += achievementNoticeHtml();
  if (!['title', 'tutorial', 'guide', 'settings'].includes(screen)) app.innerHTML += progressionNoticeHtml();
  app.innerHTML += celebrationHtml();
  applyPostRenderAccessibility(screenChanged);
  lastRenderedScreen = screen;
}

load();
screen = 'title';
render();
