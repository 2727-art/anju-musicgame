// スコア・コンボ・同色連続（ストリーク）の管理。
// Firebaseランキング等は後で leaderboardManager として分離して足せるよう、
// スコアの読み書きはこのクラスに閉じ込める。
import { CONFIG } from './config.js';

export class ScoreManager {
  constructor() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.streakColor = null;
    this.streakCount = 0;
    this.maxStreak = 0;
    this.lastJudge = null;
    // リザルト・プレイログ用の統計
    this.clearedAds = 0;
    this.missCount = 0;
    this.judgementCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, OK: 0 };
  }

  judge(offsetMs) {
    for (const w of CONFIG.judge.windows) {
      if (offsetMs <= w.ms) return w;
    }
    return CONFIG.judge.windows[CONFIG.judge.windows.length - 1];
  }

  comboMult() {
    return Math.min(1 + this.combo * CONFIG.score.comboRate, CONFIG.score.comboCap);
  }

  streakMult() {
    const m = CONFIG.score.streakMults;
    return m[Math.min(this.streakCount, m.length - 1)];
  }

  // 広告を消したときの処理。得点を計算して返す（FEVER中の加算はfeverManager側）。
  onKill(color, offsetMs) {
    const judge = this.judge(offsetMs);
    this.lastJudge = judge;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.clearedAds++;
    this.judgementCounts[judge.name]++;

    if (color === this.streakColor) {
      this.streakCount++;
    } else {
      this.streakColor = color;
      this.streakCount = 1;
    }
    // FEVER中の金色はストリーク記録の対象外
    if (color !== 'gold') this.maxStreak = Math.max(this.maxStreak, this.streakCount);

    const points = Math.round(
      CONFIG.score.base * judge.mult * this.comboMult() * this.streakMult()
    );
    return { judge, points, streakCount: this.streakCount, streakMult: this.streakMult() };
  }

  addScore(points) {
    this.score += points;
  }

  onMiss() {
    this.combo = 0;
    this.streakColor = null;
    this.streakCount = 0;
    this.missCount++;
  }
}
