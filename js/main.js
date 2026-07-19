'use strict';

const app = document.getElementById('app');

let screen = 'title';       // title | home | deck | fusion | dex | achievements | ranks | save | dungeon | node | battle | event | runend | resume
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
  if (opt.type === 'battle') { startBattle(makeGroup('battle'), { expMult: dg.expMult }); screen = 'battle'; }
  else if (opt.type === 'elite') { startBattle(makeGroup('elite'), { expMult: dg.expMult * 2, elite: true }); screen = 'battle'; }
  else if (opt.type === 'boss') { startBattle(makeGroup('boss'), { boss: true, expMult: dg.expMult }); screen = 'battle'; }
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
    screen = 'event';
  } else if (opt.type === 'rest') {
    E = { kind: 'rest' };
    screen = 'event';
  }
}

// ===== アクション =====
function handleAction(action, arg) {
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

    case 'title-enter':
      screen = peekRun() ? 'resume' : 'home';
      setToast('');
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
    case 'nav-save': screen = 'save'; setToast(''); break;
    case 'reset-save':
      if (confirm('セーブデータを消して最初からやり直しますか?')) { resetSave(); clearRun(); R = null; B = null; screen = 'home'; }
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
      const res = fuseUnits(fusionSel[0], fusionSel[1]);
      if (res.unit) { fusionResult = res.unit; fusionSel = []; }
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
        const r = tryCapture(idx);
        setToast(r.err || '');
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
      if (importSave(val)) { clearRun(); R = null; B = null; setToast('引継ぎ完了!'); }
      else setToast('引継ぎコードが正しくない');
      break;
    }
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
      break;
    }
  }
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
  handleAction(t.dataset.action, t.dataset.arg);
});

// ===== 部品 =====
function statusBar() {
  const dg = currentDungeon();
  return `<div class="statusbar">
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
  const action = o.action ? `data-action="${o.action}" data-arg="${u.uid}"` : '';
  const itemMark = u.item && ITEMS[u.item] ? ` ${ITEMS[u.item].emoji}` : '';
  const badge = o.badge || (o.selected ? (o.selectedLabel || '選択中') : '');
  return `<div class="${cls.join(' ')}" ${action}>
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
    <section class="unit-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="unit-detail-title">
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

function toastHtml() { return toast ? `<div class="toast">${esc(toast)}</div>` : ''; }

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
    <section class="unit-detail-dialog time-help-dialog" role="dialog" aria-modal="true" aria-labelledby="time-help-title">
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
  const buttonText = pendingRun ? '🌙 夜行を再開' : (hasProgress ? '記録から続ける' : '調伏の夜をはじめる');
  const buttonSub = pendingRun
    ? `${DUNGEONS[pendingRun.r.dungeon].name} ${pendingRun.r.depth}/${DUNGEONS[pendingRun.r.dungeon].length}歩`
    : (hasProgress ? `図鑑 ${dexOwnedCount()}/${Object.keys(SPECIES).length}　踏破 ${st.clears}` : '最初の夜行は「宵の小径」から');
  app.innerHTML = `<main class="title-screen time-${time.timeBand.id}" data-time-band="${time.timeBand.id}">
    <div class="title-moon" aria-hidden="true"></div>
    <div class="title-art" aria-hidden="true">
      <span class="title-art-side">${artHtml('karakasa', '☂️')}</span>
      <span class="title-art-main">${artHtml('onibi', '🔥')}</span>
      <span class="title-art-side">${artHtml('tanuki', '🦝')}</span>
    </div>
    <section class="title-copy" aria-labelledby="game-title">
      <p class="title-kicker">妖怪デッキ構築ローグライト</p>
      <h1 id="game-title">百鬼調伏録</h1>
      <p class="title-reading">ひゃっきちょうぶくろく</p>
      <p class="title-tagline">倒すか、従えるか。百鬼を率いて夜を往け。</p>
    </section>
    ${timeContextHtml(time)}
    <div class="title-guide" aria-label="遊び方の要点">
      <div><span>🧧</span><strong>弱らせて調伏</strong><small>敵の体力30%以下が好機</small></div>
      <div><span>🔮</span><strong>集めて憑合</strong><small>組み合わせから新たな妖怪へ</small></div>
    </div>
    <div class="title-actions">
      <button class="title-enter-btn" type="button" data-action="title-enter">
        <span>${buttonText}</span><small>${buttonSub}</small>
      </button>
      <p>自動保存・完全オフライン対応予定</p>
    </div>
  </main>`;
}

function renderHome() {
  const time = gameTimeProvider();
  const st = G.stats;
  const achievementCount = G.achievements.unlocked.length;
  const unseenCount = unseenAchievementIds(G).length;
  const unclaimedCount = unclaimedAchievementRewardIds(G).length;
  const rank = currentProgressionRank(G);
  const ending = finalTrialCleared(G);
  const rosterHtml = G.roster.map(u => unitCard(u, { inDeck: G.deck.includes(u.uid) })).join('');
  app.innerHTML = `<main class="home-time-shell time-${time.timeBand.id} ${ending ? 'ending-unlocked' : ''}" data-time-band="${time.timeBand.id}"><div class="screen home">
    <h1 class="title">${ending ? '百鬼調伏録・暁' : '百鬼調伏録'}</h1>
    <p class="subtitle">${ending ? '大調伏師として、明けた夜をさらに歩め' : '妖怪を調伏し、百鬼の図鑑を埋めよ'}</p>
    ${ending ? '<div class="ending-home-banner">🌅 百鬼の試練 踏破済み — 称号「大調伏師」</div>' : ''}
    ${timeContextHtml(time)}
    <div class="stats-line">位階 ${rank.value}/${rank.max}「${rank.name}」 | 図鑑 ${dexOwnedCount()}/${Object.keys(SPECIES).length} | 出撃${st.runs} / 踏破${st.clears} / 調伏${st.captures} / 憑合${st.fusions}</div>
    ${progressionGoalHtml()}
    <div class="btn-row">
      <button class="btn btn-primary btn-big" data-action="start-run">🌙 夜行に出る</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-action="nav-deck">編成 (${G.deck.length}/${DECK_MAX})</button>
      <button class="btn" data-action="nav-fusion">憑合</button>
      <button class="btn" data-action="nav-items">呪具 (${itemTotal()})</button>
      <button class="btn" data-action="nav-dex">図鑑</button>
      <button class="btn achievement-home-btn" data-action="nav-achievements">🏆 実績 ${achievementCount}/${ACHIEVEMENTS.length}${unseenCount ? `<span class="achievement-new">NEW ${unseenCount}</span>` : ''}${unclaimedCount ? `<span class="achievement-claimable">受取 ${unclaimedCount}</span>` : ''}</button>
      <button class="btn" data-action="nav-ranks">🎖️ 位階 ${rank.value}/${rank.max}</button>
      <button class="btn" data-action="nav-save">記録</button>
    </div>
    <h2 class="h2">手持ち妖怪 (${G.roster.length})</h2>
    <div class="grid">${rosterHtml}</div>
    ${toastHtml()}
  </div></main>`;
}

function renderDungeon() {
  const cards = DUNGEON_ORDER.map(id => {
    const dg = DUNGEONS[id];
    const unlocked = dungeonUnlocked(id);
    const clears = G.dungeonClears[id] || 0;
    return `<div class="node-card ${unlocked ? '' : 'locked'}" data-action="choose-dungeon" data-arg="${id}" aria-disabled="${unlocked ? 'false' : 'true'}">
      <div class="node-emoji">${unlocked ? dg.emoji : '🔒'}</div>
      <div class="node-name">${unlocked ? dg.name : '???'}</div>
      <div class="node-desc">${unlocked
        ? `全${dg.length}歩 / 踏破${clears}回${clears > 0 ? '<br>⚡式神代行・🪶手加減 解放済み' : ''}`
        : `${DUNGEONS[dg.unlock].name}を踏破すると開通`}</div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="screen">
    <h2 class="h2">夜行 — 行き先を選ぶ</h2>
    <p class="hint">術士の最大HP: ${runMaxHp()}(ダンジョン踏破ごとに+15)</p>
    ${progressionGoalHtml('dungeon', true)}
    <div class="node-row dungeon-row">${cards}</div>
    <div class="btn-row"><button class="btn" data-action="nav-home">拠点へ戻る</button></div>
    ${toastHtml()}
  </div>`;
}

function renderDeck() {
  const rosterHtml = G.roster.map(u => unitCard(u, {
    action: 'deck-toggle',
    selected: G.deck.includes(u.uid),
    badge: G.deck.includes(u.uid) ? '出撃' : '',
  })).join('');
  app.innerHTML = `<div class="screen">
    <h2 class="h2">編成 — ${G.deck.length}/${DECK_MAX}枚(最低${deckMinSize()}枚)</h2>
    <p class="hint">タップでデッキに出し入れ</p>
    <div class="grid">${rosterHtml}</div>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
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
  app.innerHTML = `<div class="screen">
    <h2 class="h2">憑合(ひょうごう)</h2>
    ${progressionGoalHtml('fusion', true)}
    ${preview}
    <div class="grid">${rosterHtml}</div>
    <details class="recipes"><summary>言い伝え(レシピヒント)</summary><ul>${hints}</ul></details>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
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
  app.innerHTML = `<div class="screen">
    <h2 class="h2">呪具 — 妖怪1体に1つ装備</h2>
    <p class="hint">呪具をタップ→妖怪をタップで装備。装備中の妖怪をそのままタップではずす。強戦闘・ボス・宝で手に入る</p>
    <div class="grid">${inv}</div>
    <h2 class="h2">手持ち妖怪</h2>
    <div class="grid">${rosterHtml}</div>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
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
  app.innerHTML = `<div class="screen">
    <h2 class="h2">図鑑 — 使役 ${dexOwnedCount()}/${Object.keys(SPECIES).length}</h2>
    <p class="hint">🏮宵の小径 🌫️深山の霧道 ⛩️百鬼の御堂</p>
    ${progressionGoalHtml('dex', true)}
    <div class="grid">${items}</div>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
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
  app.innerHTML = `<div class="screen achievements-screen">
    <h2 class="h2">🏆 実績</h2>
    <p class="hint">達成 ${unlockedCount}/${ACHIEVEMENTS.length}　報酬 ${claimedCount}/${rewardCount}受取済み</p>
    <p class="achievement-guide">実績と報酬は最初からすべて確認できる。図鑑の節目報酬は、受け取った次の夜行から調伏札へ反映される。</p>
    <div class="achievement-list">${items}</div>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
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
  app.innerHTML = `<div class="screen ranks-screen">
    <h2 class="h2">🎖️ 調伏師位階</h2>
    <div class="rank-current"><small>現在の位階</small><strong>${rank.name}</strong><span>${rank.value}/${rank.max}節目</span></div>
    ${progressionGoalHtml(null, true)}
    <p class="achievement-guide">既存のHP成長、ダンジョン・式神代行・図鑑報酬もここで振り返れる。節目は異なる順で達成しても失われない。</p>
    <div class="rank-list">${rows}</div>
    <div class="btn-row"><button class="btn" data-action="nav-achievements">実績と報酬</button><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
    ${toastHtml()}
  </div>`;
}

function renderSave() {
  app.innerHTML = `<div class="screen">
    <h2 class="h2">記録(セーブ引継ぎ)</h2>
    <p class="hint">iPhoneのSafariは長期間開かないとデータが消えることがある。引継ぎコードを控えておくと安心。</p>
    <h3 class="h3">書き出し</h3>
    <textarea id="export-text" class="save-text" readonly>${exportSave()}</textarea>
    <div class="btn-row"><button class="btn btn-small" data-action="save-select">全選択(コピーして保管)</button></div>
    <h3 class="h3">読み込み</h3>
    <textarea id="import-text" class="save-text" placeholder="引継ぎコードを貼り付け"></textarea>
    <div class="btn-row"><button class="btn btn-primary" data-action="save-import">引継ぎコードを読み込む</button></div>
    <div class="footer"><button class="btn btn-danger btn-small" data-action="reset-save">データ初期化</button></div>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
    ${toastHtml()}
  </div>`;
}

function renderNode() {
  const opts = nodeOpts.map((o, i) => {
    const info = NODE_INFO[o.type];
    return `<div class="node-card" data-action="choose-node" data-arg="${i}">
      <div class="node-emoji">${info.emoji}</div>
      <div class="node-name">${info.name}</div>
      <div class="node-desc">${info.desc}</div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="screen">
    ${statusBar()}
    <h2 class="h2">${currentDungeon().name} — ${R.depth + 1}歩目</h2>
    <p class="hint">進む道を選べ</p>
    <div class="node-row">${opts}</div>
    <div class="btn-row"><button class="btn btn-danger btn-small" data-action="abandon-run">夜行を諦める</button></div>
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
  app.innerHTML = `<div class="screen center">${statusBar()}${body}${toastHtml()}</div>`;
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
  return `<div class="${cls.join(' ')}" data-action="target-enemy" data-arg="${idx}">
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
  const hand = B.hand.map(uid => {
    const u = getUnit(uid);
    if (!u) return '';
    const s = SPECIES[u.sp];
    const playable = B.energy >= effCost(u);
    const itemMark = u.item && ITEMS[u.item] ? ITEMS[u.item].emoji : '';
    return `<div class="hand-card ${selCard === uid ? 'selected' : ''} ${playable ? '' : 'disabled'}" aria-pressed="${selCard === uid ? 'true' : 'false'}"
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
    overlay = `<div class="overlay" role="presentation"><section class="overlay-box" role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
      <h2 id="battle-result-title">${win ? (B.boss ? '🌅 夜行の主を討った!' : '⭐ 勝利') : '💤 力尽きた…'}</h2>
      ${win ? `<p>EXP +${B.expGained}(デッキ全員)</p>` : '<p>調伏した妖怪は持ち帰れる。</p>'}
      ${drop}
      ${caps ? `<ul>${caps}</ul>` : ''}
      ${lvups ? `<ul>${lvups}</ul>` : ''}
      <button class="btn btn-primary btn-big" data-action="battle-continue">${win && !B.boss ? '先へ進む' : '結果へ'}</button>
    </section></div>`;
  }

  app.innerHTML = `<div class="screen battle-screen">
    ${statusBar()}
    <div class="battle-layout">
      <div class="battle-main">
        <div class="enemy-row">${enemies}</div>
        <div class="log">${B.log.map(l => `<div>${esc(l)}</div>`).join('')}</div>
      </div>
      <div class="battle-side">
        <div class="hand-row">${hand}</div>
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
  app.innerHTML = `<div class="screen center">
    <h2 class="h2">🌙 進行中の夜行がある</h2>
    <p>${dg.emoji} ${dg.name} — ${d.r.depth}/${dg.length}歩 / ❤️ ${d.r.hp}/${d.r.maxHp} / 🧧 札×${d.r.fuda}${inBattle ? '(戦闘中)' : ''}</p>
    <p class="hint">再開すると${inBattle ? 'そのターンの頭から戦闘の' : '分かれ道から'}続きが遊べる。諦めても調伏済みの妖怪は手元に残る。</p>
    <div class="btn-row"><button class="btn btn-primary btn-big" data-action="resume-run">夜行を再開する</button></div>
    <div class="btn-row"><button class="btn btn-danger" data-action="resume-discard">諦めて拠点へ</button></div>
  </div>`;
}

function renderRunEnd() {
  const caps = R.captured.map(u => `<li>${SPECIES[u.sp].emoji}${SPECIES[u.sp].name}(仲間になった)</li>`).join('');
  const ending = R.clear && R.dungeon === 'trial';
  app.innerHTML = `<div class="screen center">
    <h2 class="h2">${ending ? '🌅 百鬼調伏録・結' : (R.clear ? '🌅 夜行踏破!' : '🌙 夜行終了')}</h2>
    <p>${ending ? '三たび立ちはだかった夜行の主を越え、百鬼を率いる者として本当の夜明けを迎えた。' : (R.clear ? `${currentDungeon().name}の主を討ち、夜が明けた。` : '今宵はここまで。')}</p>
    ${ending ? '<div class="ending-title">特別称号「大調伏師」</div><p class="hint">物語の区切り。図鑑や編成、任意の周回はこの先も続けられる。</p>' : ''}
    ${caps ? `<h3>今宵の調伏</h3><ul class="center-list">${caps}</ul>` : '<p class="hint">今宵の調伏はなし</p>'}
    <div class="btn-row"><button class="btn btn-primary btn-big" data-action="run-close">拠点へ帰る</button></div>
  </div>`;
}

function render() {
  switch (screen) {
    case 'title': renderTitle(); break;
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
  if (screen !== 'title') app.innerHTML += achievementNoticeHtml();
  if (screen !== 'title') app.innerHTML += progressionNoticeHtml();
}

load();
screen = 'title';
render();
