'use strict';

// ===== 現実時間コンテキスト =====
// 月相の基準: 2000-01-06 18:14 UTC (新月)。周期は平均朔望月。
const DAY_MS = 24 * 60 * 60 * 1000;
const SYNODIC_MONTH_DAYS = 29.530588;
const MOON_REFERENCE_UTC_MS = Date.UTC(2000, 0, 6, 18, 14);

const TIME_BANDS = Object.freeze([
  Object.freeze({ id: 'morning', name: '朝', text: '朝靄が夜路の名残を包む' }),
  Object.freeze({ id: 'day', name: '昼', text: '陽光の下で妖気が息を潜める' }),
  Object.freeze({ id: 'evening', name: '夕', text: '逢魔が時の気配が満ちる' }),
  Object.freeze({ id: 'night', name: '夜', text: '百鬼が夜道を歩きはじめる' }),
  Object.freeze({ id: 'witching', name: '丑三つ', text: '夜の底で妖気が最も濃くなる' }),
]);

// 各区分は月齢0・1/8・2/8…を中心とする。
const MOON_PHASES = Object.freeze([
  Object.freeze({ id: 'new', name: '新月', icon: '🌑', text: '月影のない夜' }),
  Object.freeze({ id: 'waxing-crescent', name: '満ちゆく三日月', icon: '🌒', text: '細い光が満ちてゆく' }),
  Object.freeze({ id: 'first-quarter', name: '上弦', icon: '🌓', text: '半月が夜を分かつ' }),
  Object.freeze({ id: 'waxing-gibbous', name: '満ちゆく月', icon: '🌔', text: '満月へ妖気が高まる' }),
  Object.freeze({ id: 'full', name: '満月', icon: '🌕', text: '月光が夜路を満たす' }),
  Object.freeze({ id: 'waning-gibbous', name: '欠けゆく月', icon: '🌖', text: '満ちた光が静かに欠ける' }),
  Object.freeze({ id: 'last-quarter', name: '下弦', icon: '🌗', text: '半月が夜明けを待つ' }),
  Object.freeze({ id: 'waning-crescent', name: '有明月', icon: '🌘', text: '残る月影が新月へ還る' }),
]);

function validGameDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('有効なDateを指定してください');
  }
  return date;
}

// 端末のローカル時刻で判定する。
function timeBandAt(date) {
  const hour = validGameDate(date).getHours();
  if (hour >= 5 && hour < 11) return TIME_BANDS[0];
  if (hour >= 11 && hour < 17) return TIME_BANDS[1];
  if (hour >= 17 && hour < 20) return TIME_BANDS[2];
  if (hour >= 20 || hour < 1) return TIME_BANDS[3];
  return TIME_BANDS[4];
}

function moonAgeDaysAt(date) {
  const elapsedDays = (validGameDate(date).getTime() - MOON_REFERENCE_UTC_MS) / DAY_MS;
  return ((elapsedDays % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
}

function moonPhaseAt(date) {
  const ageDays = moonAgeDaysAt(date);
  const fraction = ageDays / SYNODIC_MONTH_DAYS;
  const index = Math.floor(fraction * MOON_PHASES.length + 0.5) % MOON_PHASES.length;
  return Object.assign({ ageDays, fraction }, MOON_PHASES[index]);
}

// 任意日時から表示に必要な情報をまとめる純粋関数。M3-B以降もこの入口を使う。
function gameTimeAt(date) {
  const timeBand = timeBandAt(date);
  const moonPhase = moonPhaseAt(date);
  return {
    timeBand,
    moonPhase,
    label: `${timeBand.name}・${moonPhase.icon}${moonPhase.name}`,
    text: `${timeBand.text}。${moonPhase.text}。`,
  };
}

// 実時計を読む唯一の入口。ゲーム側で直接new Date()を呼ばない。
function currentGameTime() { return gameTimeAt(new Date()); }
