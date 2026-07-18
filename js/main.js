'use strict';

const app = document.getElementById('app');

let screen = 'home';        // home | deck | fusion | dex | save | dungeon | node | battle | event | runend | resume
let selCard = null;         // 選択中の手札uid
let captureMode = false;
let toast = '';
let fusionSel = [];         // 憑合選択uid(最大2)
let fusionResult = null;    // 直近の憑合結果unit
let nodeOpts = null;        // 現在のノード2択
let E = null;               // イベント画面データ
let importText = '';        // 引継ぎコード入力
let itemSel = null;         // 呪具画面で選択中の呪具id

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
    case 'nav-home': screen = 'home'; setToast(''); break;
    case 'nav-deck': screen = 'deck'; setToast(''); break;
    case 'nav-fusion': screen = 'fusion'; fusionSel = []; fusionResult = null; setToast(''); break;
    case 'nav-dex': screen = 'dex'; setToast(''); break;
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
  }
  render();
}

app.addEventListener('click', (ev) => {
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
  return `<div class="${cls.join(' ')}" ${action}>
    <div class="unit-top"><span class="unit-emoji">${artHtml(s.id, s.emoji)}</span>${elemChip(s.element)}<span class="cost">◆${effCost(u)}</span></div>
    <div class="unit-name">${esc(s.name)}${starText(u)}</div>
    <div class="unit-lv">Lv${unitLevel(u)} ${s.role}${itemMark}</div>
    <div class="unit-effect">${effectText(u)}</div>
    ${o.badge ? `<div class="unit-badge">${o.badge}</div>` : ''}
  </div>`;
}

function toastHtml() { return toast ? `<div class="toast">${esc(toast)}</div>` : ''; }

// ===== 各画面 =====
function renderHome() {
  const st = G.stats;
  const rosterHtml = G.roster.map(u => unitCard(u, { inDeck: G.deck.includes(u.uid) })).join('');
  app.innerHTML = `<div class="screen home">
    <h1 class="title">百鬼調伏録</h1>
    <p class="subtitle">妖怪を調伏し、百鬼の図鑑を埋めよ</p>
    <div class="stats-line">図鑑 ${dexOwnedCount()}/${Object.keys(SPECIES).length} | 出撃${st.runs} / 踏破${st.clears} / 調伏${st.captures} / 憑合${st.fusions}</div>
    <div class="btn-row">
      <button class="btn btn-primary btn-big" data-action="start-run">🌙 夜行に出る</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-action="nav-deck">編成 (${G.deck.length}/${DECK_MAX})</button>
      <button class="btn" data-action="nav-fusion">憑合</button>
      <button class="btn" data-action="nav-items">呪具 (${itemTotal()})</button>
      <button class="btn" data-action="nav-dex">図鑑</button>
      <button class="btn" data-action="nav-save">記録</button>
    </div>
    <h2 class="h2">手持ち妖怪 (${G.roster.length})</h2>
    <div class="grid">${rosterHtml}</div>
    ${toastHtml()}
  </div>`;
}

function renderDungeon() {
  const cards = DUNGEON_ORDER.map(id => {
    const dg = DUNGEONS[id];
    const unlocked = dungeonUnlocked(id);
    const clears = G.dungeonClears[id] || 0;
    return `<div class="node-card ${unlocked ? '' : 'locked'}" data-action="choose-dungeon" data-arg="${id}">
      <div class="node-emoji">${unlocked ? dg.emoji : '🔒'}</div>
      <div class="node-name">${unlocked ? dg.name : '???'}</div>
      <div class="node-desc">${unlocked
        ? `全${dg.length}歩 / 踏破${clears}回${clears > 0 ? '<br>⚡式神代行 解放済み' : ''}`
        : `${DUNGEONS[dg.unlock].name}を踏破すると開通`}</div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="screen">
    <h2 class="h2">夜行 — 行き先を選ぶ</h2>
    <p class="hint">術士の最大HP: ${runMaxHp()}(ダンジョン踏破ごとに+10)</p>
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
            <button class="btn btn-primary" data-action="fusion-exec">重ねる(2体は1体になる)</button>
          </div>`;
    } else {
      const rec = findRecipe(a.sp, b.sp);
      if (rec) {
        const known = G.found.includes(rec.result);
        const rs = SPECIES[rec.result];
        preview = `<div class="fusion-preview ok">
          <div>${SPECIES[a.sp].emoji} × ${SPECIES[b.sp].emoji} → ${known ? rs.emoji + ' ' + rs.name : '❓ 何かが生まれそうだ…'}</div>
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
    </div>`;
  }).join('');
  const rosterHtml = G.roster.map(u => unitCard(u, {
    action: 'item-target',
    selected: !!u.item,
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
    const places = DUNGEON_ORDER.filter(d => DUNGEONS[d].pools.t1.includes(s.id) || DUNGEONS[d].pools.t2.includes(s.id))
      .map(d => DUNGEONS[d].emoji).join('');
    const habitat = s.tier === 0 ? '憑合のみ' : places;
    if (state === 2) {
      return `<div class="unit dex-item">
        <div class="unit-top"><span class="unit-emoji">${artHtml(s.id, s.emoji)}</span>${elemChip(s.element)}<span class="cost">◆${s.cost}</span></div>
        <div class="unit-name">${s.name}</div>
        <div class="unit-lv">${s.role} | ${habitat}</div>
        <div class="unit-effect">${s.desc}</div>
      </div>`;
    }
    if (state === 1) {
      return `<div class="unit dex-item dex-seen">
        <div class="unit-emoji">${artHtml(s.id, s.emoji)}</div>
        <div class="unit-name">${s.name}</div>
        <div class="unit-lv">目撃のみ | ${habitat}</div>
      </div>`;
    }
    return `<div class="unit dex-item dex-unknown">
      <div class="unit-emoji">❓</div>
      <div class="unit-name">???</div>
      <div class="unit-lv">${s.tier === 0 ? '憑合のみ' : '未発見'}</div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="screen">
    <h2 class="h2">図鑑 — 使役 ${dexOwnedCount()}/${Object.keys(SPECIES).length}</h2>
    <p class="hint">🏮宵の小径 🌫️深山の霧道 ⛩️百鬼の御堂</p>
    <div class="grid">${items}</div>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav-home">拠点へ戻る</button></div>
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
    <div class="btn-row"><button class="btn btn-small" data-action="abandon-run">夜行を諦める</button></div>
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
    return `<div class="hand-card ${selCard === uid ? 'selected' : ''} ${playable ? '' : 'disabled'}"
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
    overlay = `<div class="overlay"><div class="overlay-box">
      <h2>${win ? (B.boss ? '🌅 夜行の主を討った!' : '⭐ 勝利') : '💤 力尽きた…'}</h2>
      ${win ? `<p>EXP +${B.expGained}(デッキ全員)</p>` : '<p>調伏した妖怪は持ち帰れる。</p>'}
      ${drop}
      ${caps ? `<ul>${caps}</ul>` : ''}
      ${lvups ? `<ul>${lvups}</ul>` : ''}
      <button class="btn btn-primary btn-big" data-action="battle-continue">${win && !B.boss ? '先へ進む' : '結果へ'}</button>
    </div></div>`;
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
          <button class="btn ${captureMode ? 'btn-active' : ''}" data-action="toggle-capture">🧧 調伏札(残${R.fuda})</button>
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
    <div class="btn-row"><button class="btn" data-action="resume-discard">諦めて拠点へ</button></div>
  </div>`;
}

function renderRunEnd() {
  const caps = R.captured.map(u => `<li>${SPECIES[u.sp].emoji}${SPECIES[u.sp].name}(仲間になった)</li>`).join('');
  app.innerHTML = `<div class="screen center">
    <h2 class="h2">${R.clear ? '🌅 夜行踏破!' : '🌙 夜行終了'}</h2>
    <p>${R.clear ? `${currentDungeon().name}の主を討ち、夜が明けた。` : '今宵はここまで。'}</p>
    ${caps ? `<h3>今宵の調伏</h3><ul class="center-list">${caps}</ul>` : '<p class="hint">今宵の調伏はなし</p>'}
    <div class="btn-row"><button class="btn btn-primary btn-big" data-action="run-close">拠点へ帰る</button></div>
  </div>`;
}

function render() {
  switch (screen) {
    case 'home': renderHome(); break;
    case 'dungeon': renderDungeon(); break;
    case 'deck': renderDeck(); break;
    case 'fusion': renderFusion(); break;
    case 'dex': renderDex(); break;
    case 'items': renderItems(); break;
    case 'save': renderSave(); break;
    case 'node': renderNode(); break;
    case 'battle': renderBattle(); break;
    case 'event': renderEvent(); break;
    case 'runend': renderRunEnd(); break;
    case 'resume': renderResume(); break;
  }
}

load();
if (peekRun()) screen = 'resume';
render();
