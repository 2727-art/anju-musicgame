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
import { TrailManager } from './trailManager.js';
import { BrainChallengeManager } from './brainChallengeManager.js';
import { matchZodiac } from './zodiacMatcher.js';
import { tellFortune, tellDailyFortune } from './fortuneTeller.js';
import { ZODIAC_LIST } from './zodiacMatcher.js';
import { loadZodiacStore, saveZodiacStore } from './zodiacCollectionStore.js';
import { cachedBlobURL } from './assetCache.js';

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
  setTrail: $('set-trail'), setBrain: $('set-brain'),
  // Phase 4A
  trailLayer: $('trail-layer'),
  brainPanel: $('brain-panel'), brainDot: $('brain-dot'),
  brainColorName: $('brain-color-name'), brainGaugeFill: $('brain-gauge-fill'),
  brainChain: $('brain-chain'),
  resultBrain: $('result-brain'), resultBrainStats: $('result-brain-stats'),
  stage: $('stage'),
  fortuneNote: $('fortune-note'), zodiacCollection: $('zodiac-collection'),
  resultFortune: $('result-fortune'), rfPerfect: $('rf-perfect'),
  rfZodiac: $('rf-zodiac'), rfStars: $('rf-stars'),
  rfText: $('rf-text'), rfLucky: $('rf-lucky'),
  // 商業風FEVER HUD
  scoreDelta: $('score-delta'),
  fcNum: $('fc-num'), fcJudge: $('fc-judge'),
  feverBonusValue: $('fever-bonus-value'), feverBonusDelta: $('fever-bonus-delta'),
  fbbKills: $('fbb-kills'), fbbTotal: $('fbb-total'),
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

// BGMはローディング中にキャッシュ優先でダウンロードしてから src をセットする
// （読み込み完了までSTARTを出さないので「無音でゲームが始まる」ことがない）
const audio = new Audio();
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
const trailMgr = new TrailManager({ canvas: els.trailLayer, settings });
const brainMgr = new BrainChallengeManager({ settings });

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
// Phase 4A: 流れ星の始点管理
let lastTapByColor = {};   // 通常時: 色ごとの前回タップ位置 {x, y}
let feverLastTap = null;   // FEVER中: 前回タップ位置
let reachNotified = false; // ゲージ90%の「REACH」演出を1チャージ1回にする
let feverFinaleFired = false; // FEVER終盤のしだれ柳フィナーレを1回だけ
let constellationCount = 0;           // 完成した星座の数（ローカル表示のみ）
let zodiacStore = loadZodiacStore();  // プレイをまたぐ永続コレクション（localStorage）
const chipMap = new Map();            // symbol → chip要素
const runZodiacs = new Set();         // このランで完成した星座（リザルト表示用）
const zodiacRunCounts = new Map();    // name → {zodiac, count}（今日の運勢の「星回り」判定用）
let colorTapCounts = { red: 0, blue: 0, yellow: 0, green: 0 }; // ラッキーカラー判定用
let zodiacPerfectThisRun = false;

function isSmartphoneViewport() {
  const coarsePointer =
    (window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false) ||
    navigator.maxTouchPoints > 0;
  const hoverNone = window.matchMedia ? window.matchMedia('(hover: none)').matches : false;
  const screenMin = Math.min(window.screen.width || window.innerWidth, window.screen.height || window.innerHeight);
  const viewportMin = Math.min(window.innerWidth, window.innerHeight);
  return coarsePointer && hoverNone && Math.min(screenMin, viewportMin) <= 600;
}

function requestSmartphoneFullscreen() {
  if (!isSmartphoneViewport()) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;

  const root = document.documentElement;
  try {
    const result = root.requestFullscreen
      ? root.requestFullscreen({ navigationUI: 'hide' })
      : (root.webkitRequestFullscreen || root.msRequestFullscreen)?.call(root);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (e) {
    // Fullscreen APIは端末・ブラウザ差が大きいので、失敗してもゲーム開始を優先する。
  }
}

function makeChipEl(symbol, name, dim) {
  const chip = document.createElement('span');
  chip.className = dim ? 'zc-chip zc-dim' : 'zc-chip';
  chip.textContent = symbol;
  chip.title = name;
  els.zodiacCollection.appendChild(chip);
  chipMap.set(symbol, chip);
  return chip;
}

// ゲーム開始時: 過去に集めた星座を薄点灯で並べる
function renderZodiacCollection() {
  chipMap.clear();
  runZodiacs.clear();
  els.zodiacCollection.textContent = '';
  for (const sym of zodiacStore.collected) {
    const z = ZODIAC_LIST.find((z) => z.symbol === sym);
    makeChipEl(sym, z ? z.name : sym, true);
  }
}

// 12星座コンプリートの特別演出（スコアには影響しない・周回制）
function zodiacPerfect() {
  zodiacPerfectThisRun = true;
  zodiacStore = { collected: [], laps: zodiacStore.laps + 1 };
  saveZodiacStore(zodiacStore);
  effects.milestone('✨ 12星座コンプリート!! ✨', 'ms-zodiac-perfect');
  effects.edgeFlash('ef-gold');
  flashScreen();
  trailMgr.zodiacPerfectBurst();
  audioMgr.zodiacPerfect();
  haptics.feverStart();
  // 全チップを順番にバウンスさせる
  let i = 0;
  for (const chip of chipMap.values()) {
    setTimeout(() => retrigger(chip, 'pop'), i * 90);
    i++;
  }
}

// コレクションに星座チップを点灯（ゴースト着地時に呼ばれる）
function addZodiacChip(zodiac) {
  let chip = chipMap.get(zodiac.symbol);
  if (!chip) chip = makeChipEl(zodiac.symbol, zodiac.name, false);
  chip.classList.remove('zc-dim'); // 過去分も今回完成で明るく
  retrigger(chip, 'pop');
  runZodiacs.add(zodiac.symbol);
  // 永続コレクションを更新し、12種そろったら特別演出
  if (!zodiacStore.collected.includes(zodiac.symbol)) {
    zodiacStore.collected.push(zodiac.symbol);
    saveZodiacStore(zodiacStore);
    if (zodiacStore.collected.length >= 12) zodiacPerfect();
  }
}

// ゴーストの飛び先＝その星座のチップ位置（未収集なら次のスロット）
function zodiacChipTarget(symbol) {
  const keys = [...chipMap.keys()];
  const idx = keys.includes(symbol) ? keys.indexOf(symbol) : chipMap.size;
  return {
    x: 20 + idx * 28,
    y: els.stage.clientHeight - 38,
  };
}

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
  els.setTrail.textContent = settings.get('trail') ? 'ON' : 'OFF';
  els.setTrail.classList.toggle('off', !settings.get('trail'));
  els.setBrain.textContent = settings.get('brain') ? 'ON' : 'OFF';
  els.setBrain.classList.toggle('off', !settings.get('brain'));
}

// ---------- プリロード ----------
async function loadImage(name) {
  const rawUrl = `${encodeURIComponent(AD_DIR)}/${encodeURIComponent(name)}`;
  try {
    // Cache Storage優先（2回目以降はネットワークを使わない）
    const url = await cachedBlobURL(rawUrl);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ name, url, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch (e) {
    console.warn(`広告画像の読み込みに失敗: ${name}`);
    return null;
  }
}

// BGMをキャッシュ優先・進捗表示付きで読み込み、再生可能になるまで待つ。
// これが終わるまでSTARTボタンは表示されない。
async function preloadBGM() {
  els.loadingBar.style.width = '0%';
  els.loadingText.textContent = '♪ 楽曲を読み込み中…';
  try {
    const url = await cachedBlobURL(encodeURIComponent(CONFIG.assets.bgm), (p) => {
      const pct = Math.round(p * 100);
      els.loadingBar.style.width = `${pct}%`;
      els.loadingText.textContent = `♪ 楽曲をダウンロード中… ${pct}%`;
    });
    audio.src = url;
  } catch (e) {
    // キャッシュもfetchも失敗 → 従来のストリーミング再生にフォールバック
    console.warn('BGMの事前読み込みに失敗。ストリーミング再生にフォールバックします。', e);
    audio.src = encodeURIComponent(CONFIG.assets.bgm);
  }
  els.loadingBar.style.width = '100%';
  // 再生可能になるまで待つ（blobなら即。フォールバック時は最大8秒で妥協して進む）
  if (audio.readyState < 4) {
    await new Promise((resolve) => {
      let tid = 0;
      const done = () => {
        audio.removeEventListener('canplaythrough', done);
        clearTimeout(tid);
        resolve();
      };
      audio.addEventListener('canplaythrough', done);
      tid = setTimeout(done, 8000);
      audio.load();
    });
  }
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
  // 直前色バイアスは通常4色のみ対象（金色は絶対に混ぜない）
  if (lastTappedColor && names.includes(lastTappedColor) && rnd() < CONFIG.colors.sameColorChance) {
    return lastTappedColor;
  }
  return names[Math.floor(rnd() * names.length)];
}

function flashScreen() {
  els.flash.classList.remove('on');
  void els.flash.offsetWidth; // 再トリガ
  els.flash.classList.add('on');
}

// CSSアニメーションの再トリガ（class付け直し）
function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// スコア増分表示（短時間の連続加算はまとめて「+N」表示）
let scoreDeltaAccum = 0;
let scoreDeltaTimer = 0;
function showScoreDelta(points) {
  scoreDeltaAccum += points;
  els.scoreDelta.textContent = `+${scoreDeltaAccum.toLocaleString()}`;
  retrigger(els.scoreDelta, 'bump');
  clearTimeout(scoreDeltaTimer);
  scoreDeltaTimer = setTimeout(() => { scoreDeltaAccum = 0; }, 900);
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
    effects.edgeFlash(`ef-${ad.color}`); // 同色のネオンフラッシュでリーチ感
  } else if (sc === 7) {
    effects.streakNote(`STREAK MAX!! ×${res.streakMult.toFixed(2)}`, `sn-${ad.color} sn-strong`);
    audioMgr.sameColorStreak(7);
    effects.edgeFlash(`ef-${ad.color}`);
  } else if (sc > 7 && sc % 5 === 0) {
    // 7超えは5刻みで縁フラッシュ（点滅しすぎない範囲で盛る）
    effects.edgeFlash(`ef-${ad.color}`);
    effects.streakNote(`${sc} CHAIN!!`, `sn-${ad.color} sn-strong`);
  }
  if (sc >= CONFIG.streakRingFrom) {
    effects.ring(ad.xPos.x, ad.xPos.y, ad.color);
  }
}

// FEVERゲージ90%で「REACH!!」（パチンコのリーチ的な期待感演出）
function checkReach() {
  if (feverMgr.active || reachNotified) return;
  if (feverMgr.ratio >= 0.9) {
    reachNotified = true;
    els.feverLabel.textContent = 'REACH!!';
    $('fever-gauge').classList.add('reach');
    audioMgr.reachAnticipation();
    haptics.comboMilestone();
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
  const { x: tapX, y: tapY } = ad.xPos;

  if (fever) {
    const b = feverMgr.addBonus(scoreMgr.combo, res.judge.name);
    // 商業風HUD更新: 巨大コンボ＋虹判定＋BONUS増分
    els.fcNum.textContent = scoreMgr.combo;
    retrigger(els.fcNum, 'bump');
    els.fcJudge.textContent = judgeLabel(res.judge.name);
    els.feverBonusDelta.textContent = `+${b.toLocaleString()}`;
    retrigger(els.feverBonusDelta, 'bump');
    effects.pop(tapX, tapY - 30,
      `<b>FEVER +${b.toLocaleString()}</b><i class="j-GOLD">GOLD!!</i>`, 'pop-gold');
    effects.burst(tapX, tapY, 'gold', true);
    // 金色流れ星（前回FEVERタップ位置から接続）＋BONUSカウンターへの星屑吸い込み
    if (feverLastTap) {
      trailMgr.spawnFeverTrail({
        fromX: feverLastTap.x, fromY: feverLastTap.y,
        toX: tapX, toY: tapY, feverTapCount: feverMgr.kills,
      });
    } else {
      trailMgr.spawnTapSpark({ x: tapX, y: tapY, color: 'gold', intensity: 1.4 });
      trailMgr.spawnBonusAbsorb({ x: tapX, y: tapY, count: 2 });
    }
    feverLastTap = { x: tapX, y: tapY };
    // 花火: キル数でスターマイン→菊花→しだれ柳と豪華になる
    const fwTier = feverMgr.kills > 35 ? 3 : feverMgr.kills > 15 ? 2 : 1;
    trailMgr.firework({ x: tapX, y: tapY, tier: fwTier });
    if (fwTier >= 2 && rnd() < 0.25) trailMgr.skyRocket({ tier: fwTier }); // ときどき打ち上げも

    audioMgr.playFeverGoldTap({ feverTapCount: feverMgr.kills });
    haptics.feverTap();
  } else {
    lastTappedColor = ad.color;
    scoreMgr.addScore(res.points);
    showScoreDelta(res.points);
    feverMgr.addGauge(res.judge.name, res.streakMult, t);
    checkReach();

    // TARGET COLOR CHALLENGE 判定（スコア・コンボ・ゲージには一切影響しない）
    let brainResult = null;
    if (brainMgr.active) {
      brainResult = brainMgr.onTap(ad.color);
      if (brainResult === 'hit') {
        effects.pop(tapX, tapY - 54,
          `<i class="j-BRAIN">${CONFIG.brainChallenge.targetHitLabel} ×${brainMgr.stats.brainChain}</i>`, '');
        audioMgr.playBrainTargetHit({ brainStreak: brainMgr.stats.brainChain });
        haptics.tap();
      } else if (brainResult === 'reset') {
        // 失敗演出は控えめに（通常Miss扱いにしない・コンボも切らない）
        effects.pop(tapX, tapY - 54,
          `<i class="j-BRAINR">${CONFIG.brainChallenge.resetLabel}</i>`, '');
        audioMgr.playBrainReset();
      }
    }

    effects.pop(tapX, tapY - 30,
      `<b>+${res.points.toLocaleString()}</b><i class="j-${res.judge.name}">${judgeLabel(res.judge.name)}</i>`,
      `pop-${ad.color}${res.streakCount >= 5 ? ' pop-hot' : ''}`);
    effects.burst(tapX, tapY, ad.color, false);

    // 色付き流れ星: 同色2連続以上なら前回同色位置から接続、それ以外はスパークのみ
    const prev = lastTapByColor[ad.color];
    const trailIntensity = brainResult === 'hit' ? 1.6 : 1;
    if (res.streakCount >= 2 && prev) {
      trailMgr.spawnColorTrail({
        fromX: prev.x, fromY: prev.y, toX: tapX, toY: tapY,
        color: ad.color, streak: res.streakCount,
      });
    } else {
      trailMgr.spawnTapSpark({ x: tapX, y: tapY, color: ad.color, intensity: trailIntensity });
    }
    lastTapByColor[ad.color] = { x: tapX, y: tapY };

    // 星座: どの色のタップも星になり輝線でつながる（広告を消した副産物・スコアには無関係）。
    // 規定数で12星座判定 → 本来の形のゴーストが重なり、コレクションへ飛んでいく
    colorTapCounts[ad.color] = (colorTapCounts[ad.color] || 0) + 1;
    const starCount = trailMgr.constelTap({ x: tapX, y: tapY, color: ad.color });
    if (starCount >= CONFIG.constellation.starsToComplete) {
      const pts = trailMgr.constelPoints();
      const zodiac = matchZodiac(pts);
      trailMgr.constelComplete({ ghost: zodiac.ghost, target: zodiacChipTarget(zodiac.symbol) });
      constellationCount++;
      const zc = zodiacRunCounts.get(zodiac.name) || { zodiac, count: 0 };
      zc.count++;
      zodiacRunCounts.set(zodiac.name, zc);
      effects.milestone(`${zodiac.symbol} ${zodiac.name} COMPLETE!!`, 'ms-zodiac');
      // 今日の運勢風コメント（ラッキーカラー＝実際に描いた星の最頻色）
      const fortune = tellFortune(rnd, pts.map((p) => p.color));
      els.fortuneNote.textContent = `✧ ${fortune.text} ✧`;
      retrigger(els.fortuneNote, 'show');
      audioMgr.constellationComplete();
      haptics.comboMilestone();
      // ゴーストが飛び終わったタイミングでコレクションに点灯
      setTimeout(() => addZodiacChip(zodiac), 2400);
    }

    // 同色2連続以上は音階上昇タップ音、初回（streak 1）は既存の判定SE
    if (res.streakCount >= 2) {
      audioMgr.playColorStreakTap({ streak: res.streakCount, judgement: res.judge.name });
    } else {
      judgeSe[res.judge.name]();
    }
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
  // 「閉じ損ねた」感を足す小さなノイズ粒子（星座は壊さない＝消せなかった広告が星にならないだけ）
  trailMgr.spawnTapSpark({ x: ad.xPos.x, y: ad.xPos.y, color: 'miss', intensity: 0.6 });
  audioMgr.miss();
  haptics.miss();
}

// ---------- Brain Challenge UI ----------
const COLOR_JP = { red: '赤', blue: '青', yellow: '黄', green: '緑' };

function showBrainPanel(color) {
  els.brainPanel.className = `bp-${color}`;
  els.brainColorName.textContent = COLOR_JP[color] || color;
  els.brainChain.textContent = `BRAIN ×${brainMgr.stats.brainChain}`;
  els.brainPanel.classList.remove('hidden');
}

function hideBrainPanel() {
  els.brainPanel.classList.add('hidden');
}

// ターゲット色の×印に控えめなパルスリングを付け外しする
function markTargetXButtons() {
  for (const ad of bannerMgr.active) {
    if (ad.state !== 'alive') continue;
    ad.xEl.classList.toggle('x-target', brainMgr.isTarget(ad.color));
  }
}

// ---------- スポーン制御 ----------
function currentDensity() {
  if (feverMgr.active) return CONFIG.fever;
  return clock.section;
}

// スポーンの共通経路。Brain Challenge中はターゲット色×印へマーキングも行う
function spawnOne(songTime) {
  const ad = bannerMgr.spawn({ color: nextColor(), songTime, fever: feverMgr.active });
  if (ad && brainMgr.isTarget(ad.color)) ad.xEl.classList.add('x-target');
  return ad;
}

function refill(songTime) {
  const cfg = currentDensity();
  let guard = 0;
  while (bannerMgr.activeCount < cfg.minActive && guard++ < 20) {
    if (!spawnOne(songTime)) break;
  }
}

function spawnTick(songTime) {
  const cfg = currentDensity();
  const beatNow = clock.beat;
  if (nextSpawnBeat === 0) nextSpawnBeat = beatNow + cfg.spawnBeats;
  let guard = 0;
  while (beatNow >= nextSpawnBeat && guard++ < 12) {
    if (bannerMgr.activeCount < cfg.maxActive) {
      spawnOne(songTime);
    }
    nextSpawnBeat += cfg.spawnBeats;
  }
  refill(songTime);
}

// ---------- FEVER ----------
feverMgr.onStart = () => {
  document.body.classList.add('fever');
  els.feverLabel.textContent = ''; // ゲージ内文字は消す（上部の装飾バナーが出る）
  els.fcNum.textContent = scoreMgr.combo;
  els.fcJudge.textContent = '';
  els.feverBonusDelta.textContent = '';
  flashScreen();
  effects.milestone('FEVER TIME!!', 'ms-fever');
  effects.edgeFlash('ef-gold');
  trailMgr.feverKickoff(); // 金色シャード＋光線のメガバースト
  audioMgr.feverStart();
  haptics.feverStart();
  // REACH表示を解除して次チャージに備える
  reachNotified = false;
  feverFinaleFired = false;
  $('fever-gauge').classList.remove('reach');
  // Brain ChallengeはFEVER中は停止（ペナルティなし）
  brainMgr.forceEnd();
  hideBrainPanel();
  // 金色Trailモードへ。吸い込み先=FEVER BONUSカウンター位置（ステージ座標系）をキャッシュ
  feverLastTap = null;
  trailMgr.constelBreak(); // 星座はFEVER中は休止
  trailMgr.setFever(true);
  const r = els.feverBonus.getBoundingClientRect();
  const s = els.stage.getBoundingClientRect();
  trailMgr.setAbsorbTarget(
    (r.left - s.left + r.width / 2) || els.stage.clientWidth / 2,
    (r.top - s.top + r.height / 2) || 110
  );
  // 画面上の既存ボタンも金色★化して爆発感を出す（ターゲットリングも解除）
  for (const ad of bannerMgr.active) {
    bannerMgr.recolor(ad, 'gold');
    ad.xEl.classList.remove('x-target');
  }
};

feverMgr.onEnd = (payout, kills) => {
  document.body.classList.remove('fever');
  els.feverLabel.textContent = 'FEVER';
  flashScreen();
  audioMgr.feverEnd();
  // 残り星屑をBONUSカウンターへ集めて精算感を出す
  trailMgr.feverFinale();
  trailMgr.setFever(false);
  feverLastTap = null;
  lastTapByColor = {}; // FEVER前の位置は古いので接続しない
  // 場に残った金色★ボタンを通常の×（赤青黄緑）へ戻す
  // （金色が残らない・以降の色抽選にも金色が混ざらない）
  for (const ad of bannerMgr.active) {
    if (ad.state === 'alive' && ad.color === 'gold') {
      bannerMgr.recolor(ad, CONFIG.colors.names[Math.floor(rnd() * CONFIG.colors.names.length)]);
    }
  }
  effects.pop(els.stage.clientWidth / 2, els.stage.clientHeight * 0.4,
    `<b>FEVER BONUS<br>+${payout.toLocaleString()}</b><i class="j-GOLD">${kills} ADS CLOSED</i>`, 'pop-payout');
  // スコアへカウントアップ加算
  scoreMgr.addScore(payout);
  showScoreDelta(payout);
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
    els.feverBonusValue.textContent = feverMgr.bonus.toLocaleString();
    els.feverBonus.style.visibility = 'visible';
    // 下部ゴールドバー
    els.fbbKills.textContent = `FEVER BONUS × ${feverMgr.kills}`;
    els.fbbTotal.textContent = feverMgr.bonus.toLocaleString();
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
function updateBrain() {
  const ev = brainMgr.update({
    beat: clock.beat,
    sectionName: clock.section.name,
    fever: feverMgr.active,
    songTime: clock.time,
    rng: rnd,
  });
  if (ev === 'start') {
    showBrainPanel(brainMgr.targetColor);
    effects.streakNote(`TARGET: ${COLOR_JP[brainMgr.targetColor]}!`, `sn-${brainMgr.targetColor} sn-strong`);
    markTargetXButtons();
  } else if (ev === 'end') {
    hideBrainPanel();
    markTargetXButtons(); // リング解除
  }
  if (brainMgr.active) {
    els.brainGaugeFill.style.width = `${brainMgr.remainingRatio(clock.beat) * 100}%`;
    els.brainChain.textContent = `BRAIN ×${brainMgr.stats.brainChain}`;
  }
}

function loop() {
  if (state === 'playing') {
    const t = clock.time;
    feverMgr.update(t);
    // FEVER終盤: 空一面のしだれ柳フィナーレ（1回だけ）
    if (feverMgr.active && !feverFinaleFired && feverMgr.remainingSec(t) <= 2.2) {
      feverFinaleFired = true;
      trailMgr.willowFinale();
      audioMgr.fireworkBoom();
    }
    updateBrain();
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
    // ローカル表示のみ（ランキングpayloadには含めない）
    ['星座コンプリート', `${constellationCount}${runZodiacs.size ? ' ' + [...runZodiacs].join('') : ''}`],
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

// リザルトの「今日の運勢」カード。
// 星回り = このランで最も多く完成した星座（未完成なら最頻タップ色の四元素から日替わりで導出）。
// ラッキーカラー = 実際に最もタップした色。すべて表示専用でスコア・ランキングに影響しない。
function fillFortuneCard() {
  const dateKey = new Date().toISOString().slice(0, 10);
  const luckyColor = Object.entries(colorTapCounts).sort((a, b) => b[1] - a[1])[0][0];
  let zName, zSym;
  const top = [...zodiacRunCounts.values()].sort((a, b) => b.count - a.count)[0];
  if (top) {
    zName = top.zodiac.name;
    zSym = top.zodiac.symbol;
  } else {
    // 四元素対応: 赤=火 / 青=水 / 緑=地 / 黄=風 から日替わりで1座
    const GROUPS = {
      red: ['おひつじ座', 'しし座', 'いて座'],
      blue: ['かに座', 'さそり座', 'うお座'],
      green: ['おうし座', 'おとめ座', 'やぎ座'],
      yellow: ['ふたご座', 'てんびん座', 'みずがめ座'],
    };
    const g = GROUPS[luckyColor] || GROUPS.red;
    zName = g[new Date().getDate() % 3];
    zSym = (ZODIAC_LIST.find((z) => z.name === zName) || { symbol: '✧' }).symbol;
  }
  const f = tellDailyFortune({
    dateKey, zodiacName: zName, zodiacSymbol: zSym, luckyColor,
    stats: {
      constellations: constellationCount,
      maxStreak: scoreMgr.maxStreak,
      zodiacPerfect: zodiacPerfectThisRun,
    },
  });
  els.rfZodiac.textContent = `本日の星回り: ${f.zodiacLine}`;
  els.rfStars.textContent = f.stars;
  els.rfText.textContent = f.text;
  els.rfLucky.textContent = `ラッキーカラー: ${f.luckyColorJp} ／ ラッキーアイテム: ${f.luckyItem}`;
  if (zodiacPerfectThisRun) {
    els.rfPerfect.textContent = `⭐ 12星座コンプリート達成！（${zodiacStore.laps}周目）`;
    els.rfPerfect.classList.remove('hidden');
  } else if (zodiacStore.laps > 0) {
    els.rfPerfect.textContent = `🌟 12星座コンプリート ${zodiacStore.laps}周 達成済み`;
    els.rfPerfect.classList.remove('hidden');
  } else {
    els.rfPerfect.classList.add('hidden');
  }
  els.resultFortune.classList.remove('hidden');
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
  trailMgr.clear();
  hideBrainPanel();

  // Firestoreへ送るpayloadはPhase 3.6と同一（Brain統計は含めない）
  const result = buildPlayResult({
    scoreMgr, feverMgr, seed: runSeed, startedAt, finishedAt: Date.now(), pausedMs: pausedAccumMs,
  });
  lastPlayResult = result;
  console.log('[PlayResult]', JSON.stringify(result));
  const bestInfo = saveIfBest(result);
  showResult(result, bestInfo);

  fillFortuneCard();

  // Brain Trainingの結果はローカル表示のみ（スコア・ランク・ランキング・ローカルベストに影響しない）
  const bs = brainMgr.stats;
  if (settings.get('brain') && bs.totalChallenges > 0) {
    els.resultBrainStats.innerHTML =
      `<span>TARGET HIT <b>${bs.targetHits}</b></span>` +
      `<span>MAX CHAIN <b>${bs.maxBrainChain}</b></span>` +
      `<span>RESET <b>${bs.targetResets}</b></span>`;
    els.resultBrain.classList.remove('hidden');
  } else {
    els.resultBrain.classList.add('hidden');
  }

  setSubmitStatus('', '');
  els.submitBtn.disabled = false;
}

// ---------- 状態遷移 ----------
function startGame() {
  requestSmartphoneFullscreen();
  state = 'playing';
  runSeed = makeSeed();
  rng = mulberry32(runSeed);
  deck.reset(rnd);
  startedAt = Date.now();
  pausedAccumMs = 0;
  // Phase 4A リセット
  lastTapByColor = {};
  feverLastTap = null;
  reachNotified = false;
  constellationCount = 0;
  zodiacRunCounts.clear();
  colorTapCounts = { red: 0, blue: 0, yellow: 0, green: 0 };
  zodiacPerfectThisRun = false;
  renderZodiacCollection();
  $('fever-gauge').classList.remove('reach');
  trailMgr.clear();
  trailMgr.setFever(false);
  brainMgr.resetRun();
  hideBrainPanel();
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
els.setTrail.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  settings.set('trail', !settings.get('trail'));
  if (!settings.get('trail')) trailMgr.clear(); // OFF即時反映
  syncSettingsUI();
});
els.setBrain.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  settings.set('brain', !settings.get('brain'));
  if (!settings.get('brain')) {
    brainMgr.forceEnd();
    hideBrainPanel();
    if (bannerMgr) markTargetXButtons();
  }
  syncSettingsUI();
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
  await preloadBGM(); // BGMが再生可能になるまでSTARTを出さない
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
  window.__adbreaker = { audio, scoreMgr, feverMgr, settings, trailMgr, brainMgr };
  loop();
})();
