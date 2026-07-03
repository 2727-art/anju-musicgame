// エントリポイント：プリロード → START → ゲームループ
import { CONFIG, rankFor } from './config.js';
import { AD_DIR, AD_IMAGES } from './assetManifest.js';
import { Deck } from './deck.js';
import { RhythmClock } from './rhythmClock.js';
import { BannerManager } from './bannerManager.js';
import { ScoreManager } from './scoreManager.js';
import { FeverManager } from './feverManager.js';
import { AudioManager } from './audioManager.js';
import { HapticsManager } from './hapticsManager.js';
import { EffectManager } from './effectManager.js';
import { SettingsManager } from './settingsManager.js';
import { makeSeed, mulberry32 } from './random.js';
import { loadBest, saveIfBest } from './localRecordManager.js';
import { buildPlayResult } from './playResultBuilder.js';
import * as leaderboard from './leaderboardManager.js';
import { loadPlayerName, savePlayerName } from './playerNameManager.js';

const $ = (id) => document.getElementById(id);

const els = {
  loading: $('loading'), loadingBar: $('loading-bar'), loadingText: $('loading-text'),
  start: $('start-screen'), startBtn: $('start-btn'), startBest: $('start-best'),
  hud: $('hud'), score: $('score'), combo: $('combo'), comboWrap: $('combo-wrap'),
  streak: $('streak'), feverFill: $('fever-fill'), feverLabel: $('fever-label'),
  feverBonus: $('fever-bonus'), section: $('section-name'),
  pauseBtn: $('pause-btn'), pauseOverlay: $('pause-overlay'), resumeBtn: $('resume-btn'),
  bannerLayer: $('banner-layer'), xLayer: $('x-layer'), fxLayer: $('fx-layer'),
  debug: $('debug'), flash: $('flash'),
  milestone: $('milestone'), streakNote: $('streak-note'), edgeFlash: $('edge-flash'),
  result: $('result-screen'), resultRank: $('result-rank'), resultScore: $('result-score'),
  resultNewBest: $('result-newbest'), resultStats: $('result-stats'),
  resultBest: $('result-best'), resultSeed: $('result-seed'),
  retryBtn: $('retry-btn'),
  settingsOverlay: $('settings-overlay'), settingsBtn: $('settings-btn'),
  settingsBtnStart: $('settings-btn-start'), settingsClose: $('settings-close'),
  setBgm: $('set-bgm'), setSe: $('set-se'), setHaptics: $('set-haptics'),
  setEffects: $('set-effects'), setDebug: $('set-debug'),
  // ランキング（Phase 3）
  submitStatus: $('submit-status'), submitBtn: $('submit-btn'),
  rankingBtnResult: $('ranking-btn-result'), rankingBtnStart: $('ranking-btn-start'),
  submitModal: $('submit-modal'), nameInput: $('name-input'),
  submitConfirmBtn: $('submit-confirm-btn'), submitCancelBtn: $('submit-cancel-btn'),
  rankingModal: $('ranking-modal'), rankingStatus: $('ranking-status'),
  rankingList: $('ranking-list'), nameChangeBtn: $('name-change-btn'),
  rankingCloseBtn: $('ranking-close-btn'),
  bg: $('bg'),
};

els.bg.style.backgroundImage = `url("${encodeURIComponent(CONFIG.assets.background)}")`;

const audio = new Audio(encodeURIComponent(CONFIG.assets.bgm));
audio.preload = 'auto';

const settings = new SettingsManager();
const clock = new RhythmClock(audio);
const scoreMgr = new ScoreManager();
const feverMgr = new FeverManager();
const audioMgr = new AudioManager();
const haptics = new HapticsManager(settings);
const effects = new EffectManager({
  layer: els.fxLayer,
  milestoneEl: els.milestone,
  streakNoteEl: els.streakNote,
  edgeFlashEl: els.edgeFlash,
  settings,
});

let state = 'loading'; // loading | ready | playing | paused | ended
let settingsOpen = false;
let bannerMgr = null;
let deck = null;
let lastTappedColor = null;
let nextSpawnBeat = 0;
let displayScore = 0;      // カウントアップ表示用
let payoutAnim = null;     // FEVER精算アニメ {from,to,start,dur}
let runSeed = 0;
let rng = Math.random;     // startGameでseed付き乱数に差し替える
const rnd = () => rng();   // deck/bannerManagerへ渡す参照（差し替えが効くように関数で包む）
let startedAt = 0;
let pausedAccumMs = 0;     // ポーズ中の累計時間（playDurationMsから除外する）
let pauseStartedAt = 0;
let lastPlayResult = null; // ランキング送信用に保持
let submitModalMode = 'submit'; // 'submit' | 'name-only'

// ---------- 設定の反映 ----------
function applySettings() {
  audio.volume = settings.get('bgmVol');
  audioMgr.setVolume(settings.get('seVol'));
  els.debug.style.display = settings.get('debug') ? '' : 'none';
  document.body.classList.toggle('fx-reduced', settings.get('effects') === 'REDUCED');
}

function syncSettingsUI() {
  els.setBgm.value = String(Math.round(settings.get('bgmVol') * 100));
  els.setSe.value = String(Math.round(settings.get('seVol') * 100));
  els.setHaptics.textContent = settings.get('haptics') ? 'ON' : 'OFF';
  els.setHaptics.classList.toggle('off', !settings.get('haptics'));
  els.setEffects.textContent = settings.get('effects');
  els.setEffects.classList.toggle('off', settings.get('effects') === 'REDUCED');
  els.setDebug.textContent = settings.get('debug') ? 'ON' : 'OFF';
  els.setDebug.classList.toggle('off', !settings.get('debug'));
}

// ---------- プリロード ----------
function loadImage(name) {
  return new Promise((resolve) => {
    const url = `${encodeURIComponent(AD_DIR)}/${encodeURIComponent(name)}`;
    const img = new Image();
    img.onload = () => resolve({ name, url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => {
      console.warn(`広告画像の読み込みに失敗: ${name}`);
      resolve(null);
    };
    img.src = url;
  });
}

// 画像が1枚もない場合の仮バナー（canvasで生成）
function makePlaceholders() {
  const out = [];
  const texts = ['今すぐDL!!', '当選しました', '残り1名様', '激安SALE'];
  texts.forEach((t, i) => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = ['#ff2d95', '#7b2dff', '#ffb800', '#00d0ff'][i];
    g.fillRect(0, 0, 320, 200);
    g.fillStyle = '#fff';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText(t, 160, 115);
    out.push({ name: `placeholder-${i}`, url: c.toDataURL(), w: 320, h: 200 });
  });
  return out;
}

async function preloadAll() {
  const total = AD_IMAGES.length;
  let done = 0;
  const results = [];
  // 8並列で読み込み
  const queue = AD_IMAGES.slice();
  async function worker() {
    while (queue.length) {
      const name = queue.shift();
      const r = await loadImage(name);
      if (r) results.push(r);
      done++;
      const pct = total ? Math.round((done / total) * 100) : 100;
      els.loadingBar.style.width = `${pct}%`;
      els.loadingText.textContent = `広告を読み込み中… ${done}/${total}`;
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (results.length === 0) {
    console.warn('広告画像が見つからないため仮バナーで動作します。');
    return makePlaceholders();
  }
  return results;
}

// ---------- ×印の色選択（同色連続を少し出やすくする） ----------
function nextColor() {
  if (feverMgr.active) return 'gold';
  const names = CONFIG.colors.names;
  if (lastTappedColor && rnd() < CONFIG.colors.sameColorChance) {
    return lastTappedColor;
  }
  return names[Math.floor(rnd() * names.length)];
}

function flashScreen() {
  els.flash.classList.remove('on');
  void els.flash.offsetWidth; // 再トリガ
  els.flash.classList.add('on');
}

// ---------- コンボ・ストリーク節目 ----------
function isComboMilestone(combo) {
  const m = CONFIG.comboMilestones;
  if (m.fixed.includes(combo)) return true;
  const top = m.fixed[m.fixed.length - 1];
  return combo > top && (combo - top) % m.stepAbove === 0;
}

function onComboMilestone(combo) {
  effects.milestone(`${combo} COMBO!!`, combo >= 100 ? 'ms-big' : '');
  effects.edgeFlash(combo >= 100 ? 'ef-gold' : '');
  audioMgr.comboMilestone();
  haptics.comboMilestone();
}

function onStreakProgress(res, ad) {
  const sc = res.streakCount;
  if (sc === 3) {
    effects.streakNote(`SAME COLOR ×3`, `sn-${ad.color}`);
    audioMgr.sameColorStreak(3);
  } else if (sc === 5) {
    effects.streakNote(`SAME COLOR STREAK! ×${res.streakMult.toFixed(2)}`, `sn-${ad.color} sn-strong`);
    audioMgr.sameColorStreak(5);
  } else if (sc === 7) {
    effects.streakNote(`STREAK MAX!! ×${res.streakMult.toFixed(2)}`, `sn-${ad.color} sn-strong`);
    audioMgr.sameColorStreak(7);
  }
  if (sc >= CONFIG.streakRingFrom) {
    effects.ring(ad.xPos.x, ad.xPos.y, ad.color);
  }
}

// ---------- タップ処理 ----------
const judgeSe = {
  PERFECT: () => audioMgr.tapPerfect(),
  GREAT: () => audioMgr.tapGreat(),
  GOOD: () => audioMgr.tapGood(),
  OK: () => audioMgr.tapOk(),
};

function handleTap(ad) {
  const t = clock.time;
  const offset = clock.nearestBeatOffsetMs(t);
  const fever = feverMgr.active;
  const res = scoreMgr.onKill(ad.color, offset);

  if (fever) {
    const b = feverMgr.addBonus(scoreMgr.combo, res.judge.name);
    effects.pop(ad.xPos.x, ad.xPos.y - 30,
      `<b>FEVER +${b.toLocaleString()}</b><i class="j-GOLD">GOLD!!</i>`, 'pop-gold');
    effects.burst(ad.xPos.x, ad.xPos.y, 'gold', true);
    audioMgr.feverTap();
    haptics.feverTap();
  } else {
    lastTappedColor = ad.color;
    scoreMgr.addScore(res.points);
    feverMgr.addGauge(res.judge.name, res.streakMult, t);
    effects.pop(ad.xPos.x, ad.xPos.y - 30,
      `<b>+${res.points.toLocaleString()}</b><i class="j-${res.judge.name}">${judgeLabel(res.judge.name)}</i>`,
      `pop-${ad.color}`);
    effects.burst(ad.xPos.x, ad.xPos.y, ad.color, false);
    judgeSe[res.judge.name]();
    if (res.judge.name === 'PERFECT') haptics.perfect(); else haptics.tap();
    onStreakProgress(res, ad);
  }

  if (isComboMilestone(scoreMgr.combo)) onComboMilestone(scoreMgr.combo);

  bannerMgr.kill(ad, { fever });
  // 消した直後に最低枚数を割るなら即補充
  refill(t);
}

function judgeLabel(name) {
  return { PERFECT: 'PERFECT!!', GREAT: 'GREAT!', GOOD: 'GOOD', OK: 'OK' }[name] || name;
}

function handleMiss(ad) {
  scoreMgr.onMiss();
  effects.pop(ad.xPos.x, ad.xPos.y - 20, `<i class="j-MISS">MISS</i>`, 'pop-miss');
  audioMgr.miss();
  haptics.miss();
}

// ---------- スポーン制御 ----------
function currentDensity() {
  if (feverMgr.active) return CONFIG.fever;
  return clock.section;
}

function refill(songTime) {
  const cfg = currentDensity();
  let guard = 0;
  while (bannerMgr.activeCount < cfg.minActive && guard++ < 20) {
    const ok = bannerMgr.spawn({ color: nextColor(), songTime, fever: feverMgr.active });
    if (!ok) break;
  }
}

function spawnTick(songTime) {
  const cfg = currentDensity();
  const beatNow = clock.beat;
  if (nextSpawnBeat === 0) nextSpawnBeat = beatNow + cfg.spawnBeats;
  let guard = 0;
  while (beatNow >= nextSpawnBeat && guard++ < 12) {
    if (bannerMgr.activeCount < cfg.maxActive) {
      bannerMgr.spawn({ color: nextColor(), songTime, fever: feverMgr.active });
    }
    nextSpawnBeat += cfg.spawnBeats;
  }
  refill(songTime);
}

// ---------- FEVER ----------
feverMgr.onStart = () => {
  document.body.classList.add('fever');
  els.feverLabel.textContent = 'FEVER TIME!!';
  flashScreen();
  effects.milestone('FEVER TIME!!', 'ms-fever');
  effects.edgeFlash('ef-gold');
  audioMgr.feverStart();
  haptics.feverStart();
  // 画面上の既存×印も金色化して爆発感を出す
  for (const ad of bannerMgr.active) {
    if (ad.state === 'alive') {
      ad.color = 'gold';
      ad.xEl.className = 'xbtn c-gold';
    }
  }
};

feverMgr.onEnd = (payout, kills) => {
  document.body.classList.remove('fever');
  els.feverLabel.textContent = 'FEVER';
  flashScreen();
  audioMgr.feverEnd();
  effects.pop(window.innerWidth / 2, window.innerHeight * 0.4,
    `<b>FEVER BONUS<br>+${payout.toLocaleString()}</b><i class="j-GOLD">${kills} ADS CLOSED</i>`, 'pop-payout');
  // スコアへカウントアップ加算
  scoreMgr.addScore(payout);
  payoutAnim = { from: displayScore, to: scoreMgr.score, start: performance.now(), dur: 1000 };
};

// ---------- HUD ----------
function updateHud() {
  // スコアはカウントアップ演出
  if (payoutAnim) {
    const p = Math.min((performance.now() - payoutAnim.start) / payoutAnim.dur, 1);
    displayScore = Math.round(payoutAnim.from + (payoutAnim.to - payoutAnim.from) * (1 - Math.pow(1 - p, 3)));
    if (p >= 1) payoutAnim = null;
  } else {
    displayScore = scoreMgr.score;
  }
  els.score.textContent = displayScore.toLocaleString();
  els.combo.textContent = scoreMgr.combo;
  els.comboWrap.classList.toggle('hot', scoreMgr.combo >= 10);

  if (scoreMgr.streakCount >= 2 && !feverMgr.active) {
    els.streak.innerHTML = `<span class="dot d-${scoreMgr.streakColor}"></span>${scoreMgr.streakCount} STREAK ×${scoreMgr.streakMult().toFixed(2)}`;
    els.streak.style.visibility = 'visible';
    els.streak.classList.toggle('streak-hot', scoreMgr.streakCount >= 5);
  } else {
    els.streak.style.visibility = 'hidden';
    els.streak.classList.remove('streak-hot');
  }

  if (feverMgr.active) {
    const remain = feverMgr.remainingSec(clock.time);
    els.feverFill.style.width = `${(remain / CONFIG.fever.durationSec) * 100}%`;
    els.feverBonus.textContent = `FEVER BONUS +${feverMgr.bonus.toLocaleString()}`;
    els.feverBonus.style.visibility = 'visible';
  } else {
    els.feverFill.style.width = `${feverMgr.ratio * 100}%`;
    els.feverBonus.style.visibility = 'hidden';
  }

  els.section.textContent = feverMgr.active ? 'FEVER TIME' : clock.section.name;
}

function updateDebug() {
  if (!settings.get('debug')) return;
  const t = clock.time;
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  els.debug.textContent =
    `${m}:${s} b:${clock.beatIndex} | ${clock.section.name}${feverMgr.active ? ' (FEVER)' : ''}` +
    ` | ads:${bannerMgr.activeCount} | pool:${bannerMgr.pool.length} | seed:${runSeed}`;
}

// ---------- メインループ ----------
function loop() {
  if (state === 'playing') {
    const t = clock.time;
    feverMgr.update(t);
    spawnTick(t);
    bannerMgr.update(t);
    updateHud();
    updateDebug();
  } else if (payoutAnim) {
    updateHud(); // 精算カウントアップだけは続ける
  }
  requestAnimationFrame(loop);
}

// ---------- リザルト ----------
function showResult(result, bestInfo) {
  els.resultRank.textContent = result.rank;
  els.resultRank.className = `result-rank rank-${result.rank}`;
  els.resultScore.textContent = result.score.toLocaleString();
  els.resultNewBest.classList.toggle('hidden', !bestInfo.isNewBest);

  const j = result.judgementCounts;
  const rows = [
    ['MAX COMBO', result.maxCombo],
    ['CLEARED ADS', result.clearedAds],
    ['MISS', result.missCount],
    ['PERFECT', j.perfect],
    ['GREAT', j.great],
    ['GOOD', j.good],
    ['OK', j.ok],
    ['FEVER回数', result.fever.count],
    ['FEVER中消去', result.fever.clearedAds],
    ['FEVER BONUS合計', result.fever.totalBonus.toLocaleString()],
    ['最大同色STREAK', result.sameColor.maxStreak],
  ];
  els.resultStats.innerHTML = rows
    .map(([k, v]) => `<div class="stat-k">${k}</div><div class="stat-v">${v}</div>`)
    .join('');

  const best = bestInfo.best;
  els.resultBest.textContent = best
    ? `LOCAL BEST: ${best.bestScore.toLocaleString()} (${best.bestRank})`
    : '';
  els.resultSeed.textContent = `seed: ${result.seed}`;
  els.result.classList.remove('hidden');
}

function endGame() {
  if (state === 'ended') return;
  state = 'ended';
  // FEVER中に曲が終わったらボーナスを精算
  const leftover = feverMgr.forceEnd();
  if (leftover > 0) scoreMgr.addScore(leftover);
  document.body.classList.remove('fever');
  payoutAnim = null;
  bannerMgr.clearAll();

  const result = buildPlayResult({
    scoreMgr, feverMgr, seed: runSeed, startedAt, finishedAt: Date.now(), pausedMs: pausedAccumMs,
  });
  lastPlayResult = result;
  console.log('[PlayResult]', JSON.stringify(result));
  const bestInfo = saveIfBest(result);
  showResult(result, bestInfo);
  setSubmitStatus('', '');
  els.submitBtn.disabled = false;
}

// ---------- 状態遷移 ----------
function startGame() {
  state = 'playing';
  runSeed = makeSeed();
  rng = mulberry32(runSeed);
  deck.reset(rnd);
  startedAt = Date.now();
  pausedAccumMs = 0;
  els.start.classList.add('hidden');
  els.hud.classList.remove('hidden');
  audioMgr.init();          // ユーザー操作内でAudioContextを初期化
  applySettings();
  audio.currentTime = 0;
  audio.play().catch((e) => console.error('BGM再生に失敗:', e));
  nextSpawnBeat = 0;
  refill(0); // 開始直後に最低枚数を並べる
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  pauseStartedAt = Date.now();
  audio.pause();
  if (!settingsOpen) els.pauseOverlay.classList.remove('hidden');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  pausedAccumMs += Date.now() - pauseStartedAt;
  els.pauseOverlay.classList.add('hidden');
  audioMgr.init(); // resume（ユーザー操作内）
  audio.play().catch(() => {});
}

// ---------- 設定画面 ----------
function openSettings() {
  settingsOpen = true;
  if (state === 'playing') pauseGame(); // プレイ中は自動ポーズ
  els.pauseOverlay.classList.add('hidden');
  syncSettingsUI();
  els.settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  settingsOpen = false;
  els.settingsOverlay.classList.add('hidden');
  if (state === 'paused') els.pauseOverlay.classList.remove('hidden');
}

els.setBgm.addEventListener('input', () => {
  settings.set('bgmVol', Number(els.setBgm.value) / 100);
  applySettings();
});
els.setSe.addEventListener('input', () => {
  settings.set('seVol', Number(els.setSe.value) / 100);
  applySettings();
  audioMgr.tapGreat(); // 音量確認用に1音鳴らす
});
els.setHaptics.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  settings.set('haptics', !settings.get('haptics'));
  syncSettingsUI();
  haptics.tap();
});
els.setEffects.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  settings.set('effects', settings.get('effects') === 'NORMAL' ? 'REDUCED' : 'NORMAL');
  syncSettingsUI();
  applySettings();
});
els.setDebug.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  settings.set('debug', !settings.get('debug'));
  syncSettingsUI();
  applySettings();
});

// ---------- ランキング（Phase 3） ----------
function setSubmitStatus(msg, cls) {
  els.submitStatus.textContent = msg;
  els.submitStatus.className = `submit-status ${cls}`;
}

function openSubmitModal(mode) {
  submitModalMode = mode;
  els.nameInput.value = loadPlayerName() || '';
  els.submitConfirmBtn.textContent = mode === 'name-only' ? '保存する' : '送信する';
  els.submitModal.classList.remove('hidden');
}

async function doSubmit() {
  const name = savePlayerName(els.nameInput.value); // サニタイズして保存
  els.submitModal.classList.add('hidden');
  if (submitModalMode === 'name-only') {
    els.rankingStatus.textContent = `名前を「${name}」に変更しました（次回送信時にランキングへ反映されます）`;
    return;
  }
  setSubmitStatus('送信中…', '');
  els.submitBtn.disabled = true;
  const res = await leaderboard.submitScore(lastPlayResult, name);
  if (res.status === 'ok') {
    setSubmitStatus(res.message, 'ok');
  } else if (res.status === 'not-best') {
    setSubmitStatus(res.message, '');
    els.submitBtn.disabled = false;
  } else {
    setSubmitStatus(res.message, 'err');
    els.submitBtn.disabled = false;
  }
}

async function onSubmitPressed() {
  if (!lastPlayResult) return;
  setSubmitStatus('接続中…', '');
  const available = await leaderboard.initLeaderboard();
  if (!available) {
    setSubmitStatus('ランキング未設定です（firebaseConfig.js がありません）。ローカルベストは保存されています', 'err');
    return;
  }
  const valid = leaderboard.canSubmit(lastPlayResult);
  if (!valid.ok) {
    setSubmitStatus(`送信できません: ${valid.reason}`, 'err');
    return;
  }
  setSubmitStatus('', '');
  openSubmitModal('submit'); // 送信前の説明＋名前入力（毎回意思確認する）
}

// ランキングの行はDOM生成し、プレイヤー名は必ずtextContentで入れる（XSS対策）
function renderRankingRows(rows) {
  els.rankingList.textContent = '';
  const me = leaderboard.myUid();
  const frag = document.createDocumentFragment();
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = row.uid === me ? 'rk-row me' : 'rk-row';
    const pos = document.createElement('span');
    pos.className = 'rk-pos';
    pos.textContent = String(i + 1);
    const name = document.createElement('span');
    name.className = 'rk-name';
    name.textContent = String(row.data.playerName ?? 'ANON'); // innerHTML禁止
    const score = document.createElement('span');
    score.className = 'rk-score';
    score.textContent = Number(row.data.score ?? 0).toLocaleString();
    const stats = document.createElement('span');
    stats.className = 'rk-stats';
    const d = row.data;
    let dateStr = '';
    try { dateStr = d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toLocaleDateString('ja-JP') : ''; } catch (e) { /* 表示のみ */ }
    stats.textContent =
      `RANK ${d.rank ?? '-'} / COMBO ${d.maxCombo ?? 0} / FEVER +${Number(d.feverTotalBonus ?? 0).toLocaleString()}${dateStr ? ' / ' + dateStr : ''}`;
    li.append(pos, name, score, stats);
    frag.appendChild(li);
  });
  els.rankingList.appendChild(frag);
}

async function openRanking() {
  if (state === 'playing') pauseGame();
  els.rankingModal.classList.remove('hidden');
  els.rankingList.textContent = '';
  els.rankingStatus.textContent = '読み込み中…';
  const available = await leaderboard.initLeaderboard();
  if (!available) {
    els.rankingStatus.textContent =
      'ランキングは未設定です。firebaseConfig.js を設定すると全国ランキングが有効になります（README参照）';
    return;
  }
  await leaderboard.ensureSignedIn(); // 自分の行ハイライト用（失敗しても表示は続行）
  const rows = await leaderboard.getTopScores();
  if (rows === null) {
    els.rankingStatus.textContent = 'ランキングを取得できませんでした。時間をおいてお試しください';
    return;
  }
  if (rows.length === 0) {
    els.rankingStatus.textContent = 'まだ登録がありません。最初の1人になろう！';
    return;
  }
  els.rankingStatus.textContent = '';
  renderRankingRows(rows);
}

function closeRanking() {
  els.rankingModal.classList.add('hidden');
  if (state === 'paused') els.pauseOverlay.classList.remove('hidden');
}

els.submitBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); onSubmitPressed(); });
els.submitConfirmBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doSubmit(); });
els.submitCancelBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  els.submitModal.classList.add('hidden');
  if (submitModalMode === 'submit') setSubmitStatus('送信をキャンセルしました', '');
});
els.rankingBtnStart.addEventListener('pointerdown', (e) => { e.preventDefault(); openRanking(); });
els.rankingBtnResult.addEventListener('pointerdown', (e) => { e.preventDefault(); openRanking(); });
els.rankingCloseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); closeRanking(); });
els.nameChangeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); openSubmitModal('name-only'); });

audio.addEventListener('ended', endGame);
els.startBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startGame(); });
els.pauseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); pauseGame(); });
els.resumeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); resumeGame(); });
els.retryBtn.addEventListener('pointerdown', () => location.reload());
els.settingsBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); openSettings(); });
els.settingsBtnStart.addEventListener('pointerdown', (e) => { e.preventDefault(); openSettings(); });
els.settingsClose.addEventListener('pointerdown', (e) => { e.preventDefault(); closeSettings(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------- 起動 ----------
(async () => {
  applySettings();
  const images = await preloadAll();
  deck = new Deck(images.map((im) => im.name), rnd);
  bannerMgr = new BannerManager({
    bannerLayer: els.bannerLayer,
    xLayer: els.xLayer,
    images,
    deck,
    onTap: handleTap,
    onMiss: handleMiss,
    rng: rnd,
  });
  const best = loadBest();
  els.startBest.textContent = best ? `LOCAL BEST: ${best.bestScore.toLocaleString()} (${best.bestRank})` : '';
  state = 'ready';
  els.loading.classList.add('hidden');
  els.start.classList.remove('hidden');
  // 開発用フック（デバッグ・動作確認用。ゲームロジックからは使わない）
  window.__adbreaker = { audio, scoreMgr, feverMgr, settings };
  loop();
})();
