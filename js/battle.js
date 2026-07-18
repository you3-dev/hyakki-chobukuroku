'use strict';

const HAND_SIZE = 4;
const HAND_MAX = 7;
const ENERGY_MAX = 6;

let B = null; // 進行中の戦闘

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startBattle(group, opts) {
  B = {
    enemies: group,
    expMult: (opts && opts.expMult) || 1,
    boss: !!(opts && opts.boss),
    turn: 0, energy: 0, block: 0,
    draw: shuffle(G.deck.slice()), discard: [], hand: [],
    killExp: 0, captured: [], levelUps: [], expGained: 0,
    log: [], over: null,
    deckAtStart: G.deck.slice(),
  };
  group.forEach(e => { if (e.sp) markSeen(e.sp); });
  startTurn();
}

function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (B.hand.length >= HAND_MAX) return;
    if (B.draw.length === 0) {
      if (B.discard.length === 0) return;
      B.draw = shuffle(B.discard);
      B.discard = [];
    }
    B.hand.push(B.draw.pop());
  }
}

function startTurn() {
  B.turn++;
  B.block = 0;
  B.energy = Math.min(2 + B.turn, ENERGY_MAX);
  drawCards(Math.max(0, HAND_SIZE - B.hand.length));
}

function aliveEnemies() { return B.enemies.filter(e => e.state === 'alive'); }

function addLog(m) { B.log.push(m); if (B.log.length > 4) B.log.shift(); }

function enemyExpValue(e) { return e.boss ? e.expValue : EXP_BY_TIER[e.tier]; }

// Lv/★補正込みのカード数値
// 攻/防/回復: +1/Lv +2/★、毒: +1/★、ドロー: ★2以上で+1、弱体: 固定
function cardValues(u) {
  const s = SPECIES[u.sp], e = s.effect;
  const star = u.star || 0;
  const nb = (unitLevel(u) - 1) + star * 2;
  return {
    dmg: e.dmg ? e.dmg + nb : 0,
    dmgAll: e.dmgAll ? e.dmgAll + nb : 0,
    block: e.block ? e.block + nb : 0,
    heal: e.heal ? e.heal + nb : 0,
    poison: e.poison ? e.poison + star : 0,
    weaken: e.weaken || 0,
    draw: e.draw ? e.draw + Math.floor(star / 2) : 0,
  };
}

function dealDamage(enemy, base, atkElement) {
  const mult = elementMult(atkElement, enemy.element);
  const dmg = Math.max(1, Math.round(base * mult));
  enemy.hp -= dmg;
  enemy.advTag = mult > 1;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.state = 'dead';
    B.killExp += enemyExpValue(enemy);
  }
  return { dmg, mult };
}

function multText(mult) { return mult > 1 ? '(効果抜群)' : mult < 1 ? '(いまひとつ)' : ''; }

function playCard(uid, targetIdx) {
  const u = getUnit(uid);
  if (!u || !B.hand.includes(uid)) return { err: 'そのカードは使えない' };
  const s = SPECIES[u.sp];
  if (B.energy < s.cost) return { err: '霊力が足りない' };
  const v = cardValues(u);
  const needsTarget = v.dmg > 0 || v.poison > 0 || v.weaken > 0;
  let target = null;
  if (needsTarget) {
    target = B.enemies[targetIdx];
    if (!target || target.state !== 'alive') return { err: '対象の敵をタップ' };
  }
  if (v.dmg) {
    const r = dealDamage(target, v.dmg, s.element);
    addLog(`${s.name}の一撃! ${target.name}に${r.dmg}${multText(r.mult)}`);
  }
  if (v.poison && target.state === 'alive') {
    target.poison += v.poison;
    addLog(`${target.name}は毒を受けた(毒${target.poison})`);
  }
  if (v.weaken && target.state === 'alive') {
    target.weak += v.weaken;
    addLog(`${target.name}の腕が鈍った(弱体${target.weak})`);
  }
  if (v.dmgAll) {
    const hits = aliveEnemies().map(e => dealDamage(e, v.dmgAll, s.element).dmg);
    addLog(`${s.name}が薙ぎ払う! 全体に${hits.join('/')}`);
  }
  if (v.block) { B.block += v.block; addLog(`${s.name}が守りを固めた(防御+${v.block})`); }
  if (v.heal) { R.hp = Math.min(R.maxHp, R.hp + v.heal); addLog(`${s.name}の癒やし(HP+${v.heal})`); }
  if (v.draw) { drawCards(v.draw); addLog(`${s.name}が札を差し出す(${v.draw}枚)`); }
  B.energy -= s.cost;
  B.hand = B.hand.filter(id => id !== uid);
  B.discard.push(uid);
  checkWin();
  return {};
}

// ===== 調伏 =====
function canCapture(e) { return !e.boss && e.state === 'alive' && e.hp / e.maxHp <= 0.30; }

function captureRate(e) {
  const ratio = e.hp / e.maxHp;
  let rate = 50 + Math.round((0.30 - ratio) * 150);
  if (e.advTag) rate += 10;
  if (e.tier === 2) rate -= 10;
  rate -= e.rage * 5;
  return Math.max(5, Math.min(95, rate));
}

function tryCapture(idx) {
  const e = B.enemies[idx];
  if (!e || e.state !== 'alive') return { err: '対象がいない' };
  if (e.boss) return { err: 'ボスは調伏できない' };
  if (!canCapture(e)) return { err: 'まだ弱っていない(HP30%以下で調伏可)' };
  if (R.fuda < 1) return { err: '調伏札がない' };
  if (B.energy < 1) return { err: '霊力が足りない' };
  R.fuda--;
  B.energy--;
  const rate = captureRate(e);
  if (rand(100) < rate) {
    e.state = 'captured';
    const nu = addUnit(e.sp, 0);
    B.captured.push(nu);
    R.captured.push(nu);
    G.stats.captures++;
    if (G.deck.includes(nu.uid)) B.discard.push(nu.uid); // 即戦列入り
    addLog(`${e.name}を調伏した!(成功率${rate}%)`);
    save();
    checkWin();
    return { ok: true };
  }
  e.rage++;
  addLog(`調伏失敗…${e.name}は怒っている(攻+2)`);
  return { ok: false };
}

// ===== 敵ターン =====
function enemyAtk(e) {
  const base = (e.boss && B.turn % 3 === 0) ? e.bigAtk : e.atk;
  return Math.max(0, base - e.weak) + e.rage * 2;
}

function endTurn() {
  for (const e of B.enemies) {
    if (B.over) return;
    if (e.state !== 'alive') continue;
    // 毒: 行動前に現在値ぶんダメージ、その後1減る
    if (e.poison > 0) {
      e.hp -= e.poison;
      addLog(`${e.name}は毒に蝕まれた(${e.poison})`);
      e.poison--;
      if (e.hp <= 0) {
        e.hp = 0;
        e.state = 'dead';
        B.killExp += enemyExpValue(e);
        continue;
      }
    }
    let dmg = enemyAtk(e);
    const blocked = Math.min(B.block, dmg);
    B.block -= blocked;
    dmg -= blocked;
    if (dmg > 0) R.hp -= dmg;
    addLog(`${e.name}の攻撃! ${dmg > 0 ? `${dmg}ダメージ` : '完全に防いだ'}`);
    if (R.hp <= 0) { R.hp = 0; finishBattle(false); return; }
  }
  checkWin(); // 毒で全滅した場合
  if (!B.over) startTurn();
}

function checkWin() { if (!B.over && aliveEnemies().length === 0) finishBattle(true); }

function finishBattle(win) {
  B.over = win ? 'win' : 'lose';
  B.levelUps = [];
  if (win) {
    const gained = B.killExp * B.expMult;
    B.expGained = gained;
    if (gained > 0) {
      for (const uid of B.deckAtStart) {
        const u = getUnit(uid);
        if (!u) continue;
        const before = unitLevel(u);
        u.exp += gained;
        const after = unitLevel(u);
        if (after > before) B.levelUps.push({ name: SPECIES[u.sp].name, emoji: SPECIES[u.sp].emoji, from: before, to: after });
      }
    }
    if (B.boss) {
      R.clear = true;
      G.dungeonClears[R.dungeon] = (G.dungeonClears[R.dungeon] || 0) + 1;
      G.stats.clears++;
    }
  }
  save();
}

// ===== 式神代行(オートバトル) =====
// クリア済みダンジョンで解放。調伏は行わない(レア確保は手動で)
function autoAvailable() { return G.dungeonClears[R.dungeon] > 0; }

function autoResolveBattle() {
  let guard = 0;
  while (!B.over && guard++ < 60) {
    let acted = true;
    while (acted && !B.over) {
      acted = false;
      for (const uid of B.hand.slice()) {
        const u = getUnit(uid);
        if (!u) continue;
        if (B.energy < SPECIES[u.sp].cost) continue;
        const v = cardValues(u);
        const alive = aliveEnemies();
        if (!alive.length) break;
        if (v.dmg || v.poison || v.weaken) {
          const weakest = alive.reduce((m, e) => (e.hp < m.hp ? e : m));
          playCard(uid, B.enemies.indexOf(weakest));
          acted = true;
          break;
        }
        if (v.heal && R.hp >= R.maxHp && !v.dmgAll && !v.block && !v.draw) continue; // 全快時の回復は無駄撃ちしない
        playCard(uid);
        acted = true;
        break;
      }
    }
    if (!B.over) endTurn();
  }
  if (!B.over) finishBattle(false);
}
