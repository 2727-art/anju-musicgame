// ハプティクス（振動）管理。非対応環境（iOS Safari等）では何もしない。
export class HapticsManager {
  constructor(settings) {
    this.settings = settings;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  vibrate(pattern) {
    if (!this.supported || !this.settings.get('haptics')) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // 失敗してもゲームは止めない
    }
  }

  tap()            { this.vibrate(8); }
  perfect()        { this.vibrate(12); }
  comboMilestone() { this.vibrate(20); }
  feverStart()     { this.vibrate([30, 40, 30]); }
  feverTap()       { this.vibrate(10); }
  miss()           { this.vibrate(20); }
}
