// TARGET COLOR CHALLENGE（Phase 4A）。
// 通常時だけ発生する軽い脳トレ要素。
// 重要: ランキングスコア・コンボ・FEVERゲージ・Firestore payloadには一切影響させない。
// 統計はローカルリザルト表示専用（Firestoreへは送らない）。
import { CONFIG } from './config.js';

export class BrainChallengeManager {
  constructor({ settings }) {
    this.settings = settings;
    this.active = false;
    this.targetColor = null;
    this.endBeat = 0;
    this.nextAllowedBeat = 0;
    this.stats = this._freshStats();
  }

  _freshStats() {
    return { brainChain: 0, maxBrainChain: 0, targetHits: 0, targetResets: 0, totalChallenges: 0 };
  }

  get enabled() {
    return CONFIG.brainChallenge.enabled && this.settings.get('brain');
  }

  // ゲーム開始時にリセット
  resetRun() {
    this.active = false;
    this.targetColor = null;
    this.endBeat = 0;
    this.nextAllowedBeat = 0;
    this.stats = this._freshStats();
  }

  isTarget(color) {
    return this.active && color === this.targetColor;
  }

  // 残り時間ゲージ用（1→0）
  remainingRatio(beat) {
    if (!this.active) return 0;
    return Math.max(0, Math.min(1, (this.endBeat - beat) / CONFIG.brainChallenge.durationBeats));
  }

  // FEVER突入などで即終了（ペナルティなし・チェーンは維持）
  forceEnd() {
    if (!this.active) return false;
    this.active = false;
    this.targetColor = null;
    return true;
  }

  // 毎フレーム呼ぶ。'start' | 'end' | null を返す
  update({ beat, sectionName, fever, songTime, rng }) {
    const c = CONFIG.brainChallenge;
    const allowed = this.enabled &&
      !(fever && c.disabledDuringFever) &&
      songTime >= c.startAfterSeconds &&
      c.allowedSections.includes(sectionName);

    if (this.active) {
      if (!allowed || beat >= this.endBeat) {
        this.active = false;
        this.targetColor = null;
        this.nextAllowedBeat = beat + c.cooldownBeats;
        return 'end';
      }
      return null;
    }

    if (allowed && beat >= this.nextAllowedBeat) {
      const names = CONFIG.colors.names;
      this.active = true;
      this.targetColor = names[Math.floor(rng() * names.length)];
      this.endBeat = beat + c.durationBeats;
      this.stats.totalChallenges++;
      return 'start';
    }
    return null;
  }

  // タップ時に呼ぶ。'hit' | 'reset' | null（非アクティブ時）を返す。
  // reset でも通常コンボ・スコアには触れない（呼び出し側でも減点しないこと）
  onTap(color) {
    if (!this.active) return null;
    if (color === this.targetColor) {
      this.stats.brainChain++;
      this.stats.targetHits++;
      this.stats.maxBrainChain = Math.max(this.stats.maxBrainChain, this.stats.brainChain);
      return 'hit';
    }
    this.stats.brainChain = 0;
    this.stats.targetResets++;
    return 'reset';
  }
}
