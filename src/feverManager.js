// FEVERゲージ・FEVER TIME・FEVER BONUS の管理。
import { CONFIG } from './config.js';

export class FeverManager {
  constructor() {
    this.gauge = 0;          // 0-100
    this.active = false;
    this.endsAt = 0;         // 曲時間ベース（一時停止で自動的に止まる）
    this.bonus = 0;          // FEVER中に蓄積するボーナス
    this.kills = 0;          // FEVER中に消した数
    this.onStart = null;     // コールバック
    this.onEnd = null;       // コールバック(bonus, kills)
    // リザルト・プレイログ用の累計
    this.feverCount = 0;
    this.totalKills = 0;
    this.totalBonus = 0;
  }

  get ratio() {
    return Math.min(this.gauge / CONFIG.fever.gaugeMax, 1);
  }

  // 通常時の消去でゲージを加算。FEVER中は加算しない。
  addGauge(judgeName, streakMult, songTime) {
    if (this.active) return;
    const f = CONFIG.fever;
    let gain = f.gainBase * streakMult;
    if (judgeName === 'PERFECT') gain += f.gainPerfectBonus;
    this.gauge += gain;
    if (this.gauge >= f.gaugeMax) {
      this.gauge = f.gaugeMax;
      this._start(songTime);
    }
  }

  _start(songTime) {
    this.active = true;
    this.endsAt = songTime + CONFIG.fever.durationSec;
    this.bonus = 0;
    this.kills = 0;
    this.feverCount++;
    if (this.onStart) this.onStart();
  }

  get remaining() {
    return Math.max(0, this.endsAt);
  }

  remainingSec(songTime) {
    return Math.max(0, this.endsAt - songTime);
  }

  // FEVER中の消去 → ボーナス蓄積
  addBonus(combo, judgeName) {
    const f = CONFIG.fever;
    let b = f.bonusPerKill + combo * f.bonusComboUnit;
    if (judgeName === 'PERFECT') b *= f.bonusPerfectMult;
    b = Math.round(b);
    this.bonus += b;
    this.kills++;
    return b;
  }

  // 毎フレーム呼ぶ。終了したら true を返しつつ onEnd を発火。
  update(songTime) {
    if (this.active && songTime >= this.endsAt) {
      this.active = false;
      const payout = this.bonus;
      const kills = this.kills;
      this.gauge = 0;
      this.totalKills += kills;
      this.totalBonus += payout;
      if (this.onEnd) this.onEnd(payout, kills);
      return true;
    }
    return false;
  }

  // 曲終了などで強制精算
  forceEnd() {
    if (!this.active) return 0;
    this.active = false;
    this.gauge = 0;
    this.totalKills += this.kills;
    this.totalBonus += this.bonus;
    return this.bonus;
  }
}
