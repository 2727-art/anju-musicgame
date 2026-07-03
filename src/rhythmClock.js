// BGMの currentTime を唯一の時間源とするクロック。
// setInterval には依存せず、毎フレーム読み出して使う。
import { CONFIG, sectionAt } from './config.js';

export class RhythmClock {
  constructor(audioEl) {
    this.audio = audioEl;
  }

  get time() {
    return this.audio.currentTime;
  }

  get beat() {
    return this.time / CONFIG.beatSec;
  }

  // 曲頭からの拍番号（デバッグ表示・セクション境界調整用）
  get beatIndex() {
    return Math.floor(this.beat);
  }

  get section() {
    return sectionAt(this.time);
  }

  // 最寄りの拍からのズレ(ms)。タップ判定に使う。
  nearestBeatOffsetMs(time = this.time) {
    const beatSec = CONFIG.beatSec;
    const phase = time / beatSec;
    const nearest = Math.round(phase);
    return Math.abs(phase - nearest) * beatSec * 1000;
  }
}
