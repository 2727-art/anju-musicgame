// ゲーム設定の管理（localStorage保存）。
const KEY = 'adbreaker.settings.v1';

const DEFAULTS = {
  bgmVol: 0.8,       // 0.0 - 1.0
  seVol: 0.8,        // 0.0 - 1.0
  haptics: true,
  effects: 'NORMAL', // NORMAL | REDUCED
  debug: true,
  trail: true,       // 流れ星エフェクト（Phase 4A）
  brain: true,       // TARGET COLOR CHALLENGE（Phase 4A）
};

export class SettingsManager {
  constructor() {
    this.data = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) {
          if (typeof parsed[k] === typeof DEFAULTS[k]) this.data[k] = parsed[k];
        }
        if (this.data.effects !== 'NORMAL' && this.data.effects !== 'REDUCED') {
          this.data.effects = 'NORMAL';
        }
      }
    } catch (e) {
      console.warn('設定の読み込みに失敗したためデフォルトを使用します。', e);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      // 保存できなくてもゲームは続行
    }
  }
}
