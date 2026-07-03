// 流れ星・星屑エフェクト（Phase 4A）。
// 1枚のCanvasレイヤー（pointer-events: none / バナーより上・×印より下）に
// 上限付き粒子配列で描画する。外部ライブラリは使わない。
// Trail Effects OFF（settings.trail = false）なら粒子を一切出さない。
import { CONFIG } from './config.js';

// 色名 → RGB（styles.cssのネオンカラーと揃える）
const COLOR_RGB = {
  red: '255,59,78',
  blue: '45,168,255',
  yellow: '255,212,0',
  green: '53,224,106',
  gold: '255,201,60',
  miss: '150,150,165',
};

export class TrailManager {
  constructor({ canvas, settings }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.particles = [];
    this.fever = false;
    this.absorbTarget = { x: window.innerWidth / 2, y: 90 }; // FEVER BONUSカウンター位置（fever開始時に更新）
    this._last = performance.now();
    this._dirty = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const loop = (t) => { this._tick(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  get enabled() {
    return this.settings.get('trail');
  }

  get reduced() {
    return this.settings.get('effects') === 'REDUCED';
  }

  // 粒子数の上限（通常300 / FEVER600 / REDUCED250 / OFF0）
  get cap() {
    if (!this.enabled) return 0;
    if (this.reduced) return CONFIG.trail.maxParticlesReduced;
    return this.fever ? CONFIG.trail.maxParticlesFever : CONFIG.trail.maxParticlesNormal;
  }

  setFever(on) {
    this.fever = on;
  }

  setAbsorbTarget(x, y) {
    this.absorbTarget = { x, y };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.particles.length = 0;
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    this._dirty = false;
  }

  _add(p) {
    if (this.particles.length >= this.cap) return false;
    this.particles.push(p);
    return true;
  }

  _rgb(color) {
    return COLOR_RGB[color] || COLOR_RGB.gold;
  }

  // 星屑（dust）を1つ追加
  _dust(x, y, rgb, { speed = 60, size = 2.5, life = 500, up = 0 } = {}) {
    const ang = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.9);
    this._add({
      type: 'dust', x, y,
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v - up,
      size: size * (0.6 + Math.random() * 0.8),
      life, age: 0, rgb,
      twinkle: Math.random() < 0.35,
    });
  }

  // ---- 公開スポーンAPI ----

  // タップ位置の同色スパーク
  spawnTapSpark({ x, y, color, intensity = 1 }) {
    if (!this.enabled) return;
    const base = this.reduced ? 3 : 6;
    const n = Math.max(1, Math.round(base * intensity));
    const rgb = this._rgb(color);
    for (let i = 0; i < n; i++) this._dust(x, y, rgb, { speed: 90, life: 450 });
  }

  // 前回同色タップ位置 → 今回位置への色付き流れ星。streakが伸びるほど豪華に
  spawnColorTrail({ fromX, fromY, toX, toY, color, streak }) {
    if (!this.enabled) return;
    const rgb = this._rgb(color);
    // 到着点スパーク（streakで強く）
    this.spawnTapSpark({ x: toX, y: toY, color, intensity: Math.min(1 + streak * 0.2, 2.4) });
    if (streak < 2) return;

    const dist = Math.hypot(toX - fromX, toY - fromY);
    // streak段階: 2=短い尾 / 3-4=星粒 / 5-6=明確な流れ星 / 7+=光の軌道
    const tier = streak >= 7 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1 : 0;
    if (this.reduced && dist > window.innerHeight * 0.9) return; // REDUCEDでは超長距離は省略
    // 中間制御点（軽くカーブさせる）
    const mx = (fromX + toX) / 2 - (toY - fromY) * (0.12 + Math.random() * 0.12);
    const my = (fromY + toY) / 2 + (toX - fromX) * (0.12 + Math.random() * 0.12);
    this._add({
      type: 'comet',
      fx: fromX, fy: fromY, cx: mx, cy: my, tx: toX, ty: toY,
      t: 0,
      dur: Math.max(160, Math.min(420, dist * 0.9)),
      rgb,
      size: 2.5 + tier * 0.9,
      dustRate: (this.reduced ? 0.5 : 1) * (0.35 + tier * 0.35), // 1msあたりではなくフレームあたり期待値
      arriveBurst: tier >= 1 ? 3 + tier * 2 : 0,
      absorb: false,
    });
    if (tier >= 3 && !this.reduced) {
      this._add({ type: 'ring', x: toX, y: toY, r: 12, maxR: 60, life: 420, age: 0, rgb });
    }
  }

  // FEVER中の金色流れ星。feverTapCountが増えるほど豪華に
  spawnFeverTrail({ fromX, fromY, toX, toY, feverTapCount }) {
    if (!this.enabled) return;
    const rgb = COLOR_RGB.gold;
    const tier = feverTapCount > 60 ? 3 : feverTapCount > 30 ? 2 : feverTapCount > 10 ? 1 : 0;
    this.spawnTapSpark({ x: toX, y: toY, color: 'gold', intensity: 1.2 + tier * 0.4 });
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const mx = (fromX + toX) / 2 - (toY - fromY) * 0.15;
    const my = (fromY + toY) / 2 + (toX - fromX) * 0.15;
    this._add({
      type: 'comet',
      fx: fromX, fy: fromY, cx: mx, cy: my, tx: toX, ty: toY,
      t: 0,
      dur: Math.max(140, Math.min(360, dist * 0.7)),
      rgb,
      size: 3 + tier,
      dustRate: (this.reduced ? 0.5 : 1) * (0.5 + tier * 0.5),
      arriveBurst: 2 + tier * 2,
      absorb: false,
    });
    // 星屑がBONUSカウンターへ吸い込まれる（tierが上がるほど多く）
    this.spawnBonusAbsorb({ x: toX, y: toY, count: 1 + tier });
  }

  // BONUSカウンター方向へ吸い込まれる星屑
  spawnBonusAbsorb({ x, y, count = 2 }) {
    if (!this.enabled) return;
    const n = this.reduced ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      this._add({
        type: 'absorb', x, y,
        vx: Math.cos(ang) * 50,
        vy: Math.sin(ang) * 50,
        size: 1.8 + Math.random() * 1.6,
        life: 1400, age: 0,
        rgb: COLOR_RGB.gold,
      });
    }
  }

  // FEVER終了時：画面上の残り星屑をBONUSカウンターへ集める
  feverFinale() {
    if (!this.enabled) return;
    for (const p of this.particles) {
      if (p.type === 'dust') {
        p.type = 'absorb';
        p.life = 900;
        p.age = 0;
        p.rgb = COLOR_RGB.gold;
      }
    }
  }

  // ---- 更新・描画 ----

  _tick(now) {
    const dt = Math.min(50, now - this._last);
    this._last = now;
    const ps = this.particles;
    if (ps.length === 0) {
      if (this._dirty) {
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this._dirty = false;
      }
      return;
    }

    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    this._dirty = true;
    const at = this.absorbTarget;

    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      let dead = false;

      if (p.type === 'dust') {
        p.age += dt;
        p.x += p.vx * dt / 1000;
        p.y += p.vy * dt / 1000;
        p.vy += 30 * dt / 1000; // わずかな重力
        const k = 1 - p.age / p.life;
        if (k <= 0) { dead = true; }
        else {
          const a = p.twinkle ? k * (0.5 + 0.5 * Math.sin(p.age * 0.045)) : k;
          this._drawStar(ctx, p.x, p.y, p.size * (0.5 + k * 0.5), p.rgb, a);
        }
      } else if (p.type === 'comet') {
        p.t += dt / p.dur;
        const t = Math.min(p.t, 1);
        // 2次ベジェで頭の位置を計算
        const u = 1 - t;
        const x = u * u * p.fx + 2 * u * t * p.cx + t * t * p.tx;
        const y = u * u * p.fy + 2 * u * t * p.cy + t * t * p.ty;
        // 通過中に星屑を落とす
        if (Math.random() < p.dustRate) {
          this._dust(x, y, p.rgb, { speed: 25, size: 2, life: 380 });
        }
        // 頭のグロー
        this._drawStar(ctx, x, y, p.size * 1.6, p.rgb, 0.9);
        if (t >= 1) {
          for (let b = 0; b < p.arriveBurst; b++) this._dust(p.tx, p.ty, p.rgb, { speed: 70, life: 420 });
          dead = true;
        }
      } else if (p.type === 'ring') {
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { dead = true; }
        else {
          const r = p.r + (p.maxR - p.r) * k;
          ctx.globalAlpha = (1 - k) * 0.7;
          ctx.strokeStyle = `rgb(${p.rgb})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (p.type === 'absorb') {
        p.age += dt;
        // BONUSカウンターへ加速しながら吸い込まれる
        const dx = at.x - p.x;
        const dy = at.y - p.y;
        const dist = Math.hypot(dx, dy);
        const pull = 9 * dt / 1000;
        p.vx = p.vx * (1 - 2.2 * dt / 1000) + dx * pull;
        p.vy = p.vy * (1 - 2.2 * dt / 1000) + dy * pull;
        p.x += p.vx * dt / 1000;
        p.y += p.vy * dt / 1000;
        if (dist < 16 || p.age >= p.life) { dead = true; }
        else {
          const k = 1 - p.age / p.life;
          this._drawStar(ctx, p.x, p.y, p.size, p.rgb, 0.4 + k * 0.6);
        }
      }

      if (dead) ps.splice(i, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawStar(ctx, x, y, size, rgb, alpha) {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    // 外側グロー
    ctx.fillStyle = `rgba(${rgb},0.35)`;
    ctx.beginPath();
    ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
    ctx.fill();
    // コア
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    // 白い芯
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
