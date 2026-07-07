// ゲーム全体の設定値
export const CONFIG = {
  gameVersion: '3.1.0', // FEVER頻度調整（スコア仕様変更）につきv3.1.0 / leaderboardはv2へ世代交代
  bpm: 156,
  beatSec: 60 / 156, // ≒ 0.3846秒

  song: {
    id: 'song001',
    durationSec: 240, // 4:00
  },

  assets: {
    bgm: 'bgm.mp3',
    background: '背景.png',
  },

  // 曲セクションと広告密度（start: 秒）
  sections: [
    { name: 'INTRO',           start: 0,   minActive: 3, maxActive: 5,  spawnBeats: 2 },
    { name: 'VERSE1',          start: 26,  minActive: 4, maxActive: 6,  spawnBeats: 1.5 },
    { name: 'PRE-CHORUS',      start: 50,  minActive: 5, maxActive: 7,  spawnBeats: 1 },
    { name: 'CHORUS1',         start: 64,  minActive: 6, maxActive: 8,  spawnBeats: 1 },
    { name: 'DROP',            start: 98,  minActive: 7, maxActive: 10, spawnBeats: 0.5 },
    { name: 'POST-DROP BUILD', start: 110, minActive: 6, maxActive: 9,  spawnBeats: 0.75 },
    { name: 'CHORUS2',         start: 120, minActive: 7, maxActive: 10, spawnBeats: 0.75 },
    { name: 'BREAKDOWN',       start: 149, minActive: 4, maxActive: 6,  spawnBeats: 1.5 },
    { name: 'FINAL CHORUS',    start: 209, minActive: 8, maxActive: 12, spawnBeats: 0.5 },
    { name: 'OUTRO',           start: 247, minActive: 3, maxActive: 5,  spawnBeats: 2 },
  ],

  // タップ判定（最寄り拍からのズレ ms）
  judge: {
    windows: [
      { name: 'PERFECT', ms: 80,       mult: 1.2 },
      { name: 'GREAT',   ms: 140,      mult: 1.0 },
      { name: 'GOOD',    ms: 220,      mult: 0.7 },
      { name: 'OK',      ms: Infinity, mult: 0.4 },
    ],
  },

  score: {
    base: 1000,
    comboRate: 0.01,   // 1 + combo * 0.01
    comboCap: 3.0,
    // 同色連続倍率（index = 連続数, 5以上は最後の値）
    streakMults: [1.0, 1.0, 1.1, 1.25, 1.45, 1.7],
  },

  colors: {
    names: ['red', 'blue', 'yellow', 'green'],
    sameColorChance: 0.4, // 直前タップ色と同色にする確率
  },

  fever: {
    gaugeMax: 100,
    // 花火大会のフィナーレのように「1曲に1〜2回」の特別な時間にする
    // （同色ストリーク倍率で早く貯まるので、狙うプレイヤーほど2回目に届く）
    gainBase: 0.65,     // 1消去あたりの基本ゲージ上昇
    gainPerfectBonus: 0.25,
    durationSec: 10,
    minActive: 9,
    maxActive: 12,
    spawnBeats: 0.5,
    bonusPerKill: 5000, // 5000 + combo * 100
    bonusComboUnit: 100,
    bonusPerfectMult: 1.2,
  },

  banner: {
    lifeSec: 9,        // 放置でMissになるまで（通常時）
    lifeSecFever: 5,   // FEVER中は回転を速く
    minWidthPx: 110,
    maxWidthPx: 300,
    widthVwMin: 0.34,
    widthVwMax: 0.58,
    maxRotateDeg: 14,
    xSeparationPx: 62, // ×印同士の最低距離
    xHitPx: 48,        // ×印ヒットエリア（44px以上）
  },

  hud: {
    topSafePx: 118,    // HUDを隠さないための上部マージン
    bottomSafePx: 84,
    sideSafePx: 34,
  },

  // コンボ節目演出（fixed到達時 + 100超はstepAbove刻み）
  comboMilestones: {
    fixed: [10, 25, 50, 100],
    stepAbove: 50,
  },

  // 同色ストリーク節目
  streakMilestones: [3, 5, 7],
  streakRingFrom: 7, // これ以上でタップ位置にリング演出

  // ランキング（Phase 3）。スコア仕様を変えたら leaderboardId も変えること
  // （古いスコアと新しいスコアを混ぜないための世代管理）。
  leaderboard: {
    id: 'adbreaker_song001_v2', // FEVER頻度調整で旧スコアと比較不能になったため世代交代

    fetchLimit: 50,
    nameMaxLen: 12,
    defaultName: 'ANON',
    // クライアント側妥当性チェックの上限（firestore.rulesと揃えること）
    limits: {
      scoreMax: 30000000,
      maxComboMax: 2000,
      clearedAdsMax: 2000,
      missCountMax: 2000,
      judgementMax: 5000,
      feverCountMax: 20,
      feverClearedAdsMax: 2000,
      feverBonusMax: 30000000,
      streakMax: 2000,
      // 実プレイ時間（ポーズ除外）: 曲長 4:00 ± 20秒
      playDurationMinMs: 220000,
      playDurationMaxMs: 260000,
    },
  },

  // 星座演出: タップの軌跡（全色）が輝線でつながり、この数で12星座判定して完成
  constellation: {
    starsToComplete: 7,
  },

  // 流れ星エフェクト（Phase 4A）。Canvas粒子数の上限
  trail: {
    maxParticlesNormal: 300,
    maxParticlesFever: 600,
    maxParticlesReduced: 250,
  },

  // TARGET COLOR CHALLENGE（Phase 4A）。
  // ランキングスコア・FEVERゲージには影響させない（affectsScore: false を変えないこと）
  brainChallenge: {
    enabled: true,
    affectsScore: false,
    startAfterSeconds: 20,
    durationBeats: 16,
    cooldownBeats: 24,
    allowedSections: ['VERSE1', 'PRE-CHORUS', 'CHORUS1', 'POST-DROP BUILD', 'CHORUS2', 'BREAKDOWN'],
    disabledDuringFever: true,
    targetHitLabel: 'TARGET HIT!',
    resetLabel: 'BRAIN RESET',
  },

  // ランク閾値（FEVER1〜2回/曲の新スコア経済に合わせて再調整。
  // 参考: 2タップ/秒のほぼ最適プレイでFEVER3回・約163万点）
  ranks: [
    { name: 'S', min: 1200000 },
    { name: 'A', min: 800000 },
    { name: 'B', min: 500000 },
    { name: 'C', min: 250000 },
    { name: 'D', min: 0 },
  ],
};

// スコアからランクを返す
export function rankFor(score) {
  for (const r of CONFIG.ranks) {
    if (score >= r.min) return r.name;
  }
  return 'D';
}

// 現在時刻(秒)からセクション設定を返す
export function sectionAt(time) {
  const s = CONFIG.sections;
  for (let i = s.length - 1; i >= 0; i--) {
    if (time >= s[i].start) return s[i];
  }
  return s[0];
}
