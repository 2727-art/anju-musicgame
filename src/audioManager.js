// Web Audio APIで効果音を合成・再生する。外部音源ファイルは使わない。
// AudioContextはSTART時に初期化する（自動再生制限対策）。
// 音が鳴らせない環境でもゲーム進行は止めない（全メソッドがno-opになる）。
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
  }

  // STARTボタン押下時（ユーザー操作内）に呼ぶ
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) {
      console.warn('Web Audioを初期化できません。SEなしで続行します。', e);
      this.ctx = null;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // 基本トーン。freqEnd指定でピッチスライド。
  _tone({ freq, freqEnd, type = 'sine', dur = 0.1, vol = 0.4, delay = 0, attack = 0.005, filterFreq = 0 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      osc.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _safe(fn) {
    if (!this.ctx) return;
    try { fn(); } catch (e) { /* SE失敗でゲームは止めない */ }
  }

  // ---- タップ判定SE ----
  tapPerfect() {
    this._safe(() => {
      // きらっとした2音アルペジオ
      this._tone({ freq: 1568, type: 'triangle', dur: 0.09, vol: 0.35 });
      this._tone({ freq: 2349, type: 'sine', dur: 0.14, vol: 0.3, delay: 0.03 });
    });
  }

  tapGreat() {
    this._safe(() => {
      this._tone({ freq: 1175, type: 'triangle', dur: 0.09, vol: 0.3 });
      this._tone({ freq: 1760, type: 'sine', dur: 0.1, vol: 0.18, delay: 0.02 });
    });
  }

  tapGood() {
    this._safe(() => {
      this._tone({ freq: 740, type: 'square', dur: 0.05, vol: 0.16, filterFreq: 1800 });
    });
  }

  tapOk() {
    this._safe(() => {
      this._tone({ freq: 330, type: 'sine', dur: 0.07, vol: 0.18 });
    });
  }

  // ---- コンボ・ストリークSE ----
  comboMilestone() {
    this._safe(() => {
      this._tone({ freq: 784, type: 'triangle', dur: 0.1, vol: 0.32 });
      this._tone({ freq: 1175, type: 'triangle', dur: 0.16, vol: 0.32, delay: 0.08 });
    });
  }

  sameColorStreak(level) {
    this._safe(() => {
      // レベル(3/5/7)が上がるほど高いアルペジオ
      const base = level >= 7 ? 880 : level >= 5 ? 740 : 660;
      this._tone({ freq: base, type: 'sine', dur: 0.07, vol: 0.24 });
      this._tone({ freq: base * 1.25, type: 'sine', dur: 0.07, vol: 0.24, delay: 0.05 });
      this._tone({ freq: base * 1.5, type: 'sine', dur: 0.12, vol: 0.26, delay: 0.1 });
    });
  }

  // ---- FEVER SE ----
  feverStart() {
    this._safe(() => {
      this._tone({ freq: 220, freqEnd: 1760, type: 'sawtooth', dur: 0.4, vol: 0.25, filterFreq: 2600 });
      this._tone({ freq: 1568, type: 'sine', dur: 0.15, vol: 0.3, delay: 0.38 });
      this._tone({ freq: 2093, type: 'sine', dur: 0.25, vol: 0.3, delay: 0.44 });
    });
  }

  feverTap() {
    this._safe(() => {
      // コイン風の2音
      this._tone({ freq: 988, type: 'square', dur: 0.06, vol: 0.15, filterFreq: 3200 });
      this._tone({ freq: 1319, type: 'square', dur: 0.12, vol: 0.15, delay: 0.05, filterFreq: 3200 });
    });
  }

  feverEnd() {
    this._safe(() => {
      // 精算開始のご褒美コード
      this._tone({ freq: 1047, type: 'triangle', dur: 0.5, vol: 0.25 });
      this._tone({ freq: 1319, type: 'triangle', dur: 0.5, vol: 0.25, delay: 0.02 });
      this._tone({ freq: 1568, type: 'triangle', dur: 0.6, vol: 0.25, delay: 0.04 });
      this._tone({ freq: 262, type: 'sine', dur: 0.3, vol: 0.3 });
    });
  }

  // ---- Miss ----
  miss() {
    this._safe(() => {
      this._tone({ freq: 220, freqEnd: 150, type: 'sine', dur: 0.12, vol: 0.18, filterFreq: 900 });
    });
  }

  // ==== Phase 4A ====

  // 同色ストリークで音階が上がるタップ音（Cメジャーペンタトニック2オクターブ）。
  // streak 1〜12 で上昇、13以上は上限音+装飾音。高ストリークほど和音が厚くなる。
  playColorStreakTap({ streak = 1, judgement = 'GREAT' } = {}) {
    this._safe(() => {
      const SCALE = [
        523.25, 587.33, 659.25, 783.99, 880.0, 1046.5,
        1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32,
      ];
      const idx = Math.min(Math.max(streak, 1), 12) - 1;
      const freq = SCALE[idx];
      // ベル: 基音 + 2倍音（短く・控えめゲインで連打しても痛くない）
      this._tone({ freq, type: 'triangle', dur: 0.13, vol: 0.26 });
      this._tone({ freq: freq * 2, type: 'sine', dur: 0.18, vol: 0.09, delay: 0.01 });
      // 5連続以上: 完全5度を重ねてリーチ感（和音化）
      if (streak >= 5) {
        this._tone({ freq: freq * 1.5, type: 'triangle', dur: 0.12, vol: 0.12, delay: 0.01 });
      }
      // 7連続以上: 1オクターブ下の支え音で厚みを出す
      if (streak >= 7) {
        this._tone({ freq: freq / 2, type: 'sine', dur: 0.14, vol: 0.12 });
      }
      if (streak >= 13) {
        // 上限到達後は装飾グリスを足す（音階は上げ続けない）
        this._tone({ freq: 2637.02, type: 'sine', dur: 0.08, vol: 0.1, delay: 0.04 });
        this._tone({ freq: 3135.96, type: 'sine', dur: 0.1, vol: 0.08, delay: 0.08 });
      }
      if (judgement === 'PERFECT') {
        this._tone({ freq: freq * 4 > 4200 ? 4186 : freq * 4, type: 'sine', dur: 0.08, vol: 0.08, delay: 0.03 });
      }
    });
  }

  // FEVERゲージ90%到達の「リーチ」期待感ライザー（1チャージにつき1回）
  reachAnticipation() {
    this._safe(() => {
      this._tone({ freq: 440, freqEnd: 1760, type: 'sawtooth', dur: 0.6, vol: 0.14, filterFreq: 2400 });
      this._tone({ freq: 1318.51, type: 'sine', dur: 0.12, vol: 0.16, delay: 0.5 });
      this._tone({ freq: 1567.98, type: 'sine', dur: 0.14, vol: 0.16, delay: 0.58 });
      this._tone({ freq: 2093.0, type: 'sine', dur: 0.2, vol: 0.16, delay: 0.66 });
    });
  }

  // FEVER中の金色タップ音。タップ数で8段の上昇ランを繰り返す＋低音の打撃感
  playFeverGoldTap({ feverTapCount = 1 } = {}) {
    this._safe(() => {
      const RUN = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02];
      const freq = RUN[(Math.max(feverTapCount, 1) - 1) % RUN.length];
      this._tone({ freq, type: 'square', dur: 0.07, vol: 0.13, filterFreq: 3800 });
      this._tone({ freq: freq * 1.5, type: 'sine', dur: 0.11, vol: 0.08, delay: 0.04 });
      // 短い低音キックでタップの手応えを出す（連打しても痛くない極短音）
      this._tone({ freq: 150, freqEnd: 60, type: 'sine', dur: 0.07, vol: 0.16 });
      if (feverTapCount > 30) {
        this._tone({ freq: freq * 2, type: 'sine', dur: 0.08, vol: 0.06, delay: 0.06 });
      }
      if (feverTapCount > 60) {
        // 61タップ以上: 金色グリス追加（流星群の音）
        this._tone({ freq: freq * 2, freqEnd: freq * 3, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.05 });
      }
    });
  }

  // TARGET COLOR CHALLENGE 成功音（チェーンで少しずつ上がる）
  playBrainTargetHit({ brainStreak = 1 } = {}) {
    this._safe(() => {
      const base = 987.77 * (1 + Math.min(brainStreak, 7) * 0.04);
      this._tone({ freq: base, type: 'triangle', dur: 0.09, vol: 0.24 });
      this._tone({ freq: base * 1.335, type: 'triangle', dur: 0.14, vol: 0.24, delay: 0.06 });
    });
  }

  // Brain Chainリセット音（控えめ・不快にしない）
  playBrainReset() {
    this._safe(() => {
      this._tone({ freq: 330, freqEnd: 262, type: 'sine', dur: 0.14, vol: 0.1, filterFreq: 800 });
    });
  }
}
