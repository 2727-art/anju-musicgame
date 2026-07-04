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
    this.constels = []; // 星座（同色タップで描く輝線）。末尾が描画中のもの
    this.fever = false;
    this.w = 0; // ステージサイズ（resizeで更新）
    this.h = 0;
    this._last = performance.now();
    this._dirty = false;
    this.resize();
    this.absorbTarget = { x: this.w / 2, y: 90 }; // FEVER BONUSカウンター位置（fever開始時に更新）
    window.addEventListener('resize', () => this.resize());
    // ステージ（9:16固定）のサイズ変化に追従（resizeイベントが来ない環境対策）
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(this.canvas);
    }
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

  // 9:16ステージ（canvasはステージ全面）のCSSサイズに合わせて解像度を設定
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.particles.length = 0;
    this.constels.length = 0;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this._dirty = false;
  }

  // ---- 星座システム（タップの軌跡が星座になる） ----
  // どの色のタップでも星になる（星ごとに自分の色を保持）。
  // 同色だけで作ると純色星座、混色だとセグメントごとにグラデーションする虹色星座になる。

  // タップごとに星を追加。戻り値: 現在描いている星座の星の数
  constelTap({ x, y, color }) {
    if (!this.enabled || color === 'gold') return 0;
    let cur = this.constels[this.constels.length - 1];
    if (!cur || cur.mode !== 'building') {
      cur = { pts: [], mode: 'building', t: 0 };
      this.constels.push(cur);
      if (this.constels.length > 3) this.constels.shift(); // 上限
    }
    cur.pts.push({ x, y, color });
    return cur.pts.length;
  }

  // 描画中の星座の座標列（星座マッチング・運勢判定用）
  constelPoints() {
    const cur = this.constels[this.constels.length - 1];
    return cur && cur.mode === 'building' ? cur.pts.slice() : [];
  }

  // 星座完成 → プレイヤーの線が輝き、マッチした星座の「本来の形」（ghost）が重なって
  // 浮かび上がり、縮みながらコレクション（target）へ飛んで消える。
  // ghost: [[x,y],...] / target: {x,y}（省略時は左下）
  constelComplete({ ghost = [], target = null } = {}) {
    const cur = this.constels[this.constels.length - 1];
    if (!cur || cur.mode !== 'building') return;
    cur.mode = 'complete';
    cur.t = 0;
    cur.ghost = ghost;
    cur.ghostTarget = target || { x: 30, y: this.h - 40 };
    // ゴーストの重心（縮小・移動の基準点）
    let gx = 0, gy = 0;
    const src = ghost.length ? ghost : cur.pts.map((p) => [p.x, p.y]);
    for (const [x, y] of src) { gx += x; gy += y; }
    cur.ghostCx = gx / src.length;
    cur.ghostCy = gy / src.length;
    for (const p of cur.pts) {
      const rgb = this._rgb(p.color);
      for (let i = 0; i < (this.reduced ? 2 : 4); i++) this._dust(p.x, p.y, rgb, { speed: 80, life: 600 });
    }
    const last = cur.pts[cur.pts.length - 1];
    this.starburst(last.x, last.y, last.color, 8);
  }

  // FEVER突入などで描きかけを静かにフェード
  constelBreak() {
    const cur = this.constels[this.constels.length - 1];
    if (cur && cur.mode === 'building') cur.mode = 'fade';
  }

  // プレイヤーの星座線（色グラデーションのセグメント＋星ノード）を描く
  _drawPlayerConstel(ctx, c, alpha, width, now, whiteFlash) {
    const pts = c.pts;
    if (alpha <= 0) return;
    ctx.lineJoin = 'round';
    // セグメントごとに両端ノードの色をつなぐグラデーション輝線
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      const rgbA = this._rgb(a.color), rgbB = this._rgb(b.color);
      let stroke;
      if (whiteFlash) {
        stroke = 'rgba(255,255,255,0.95)';
      } else if (rgbA === rgbB) {
        stroke = `rgb(${rgbA})`;
      } else {
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, `rgb(${rgbA})`);
        g.addColorStop(1, `rgb(${rgbB})`);
        stroke = g;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.globalAlpha = alpha * 0.28;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width * 3.2;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    // 星ノード（十字のきらめき・各星ごとに位相をずらして瞬く・色は自分の色）
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      const tw = 0.7 + 0.3 * Math.sin(now * 0.005 + j * 1.7);
      const r = (whiteFlash ? 7 : 5) * tw;
      ctx.globalAlpha = alpha * tw;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r);
      ctx.stroke();
      ctx.fillStyle = `rgb(${this._rgb(p.color)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // マッチした星座の「本来の形」（淡青白のゴースト）を描く。
  // shift/scale で縮小しながらコレクションへ飛ぶ演出に使う
  _drawGhost(ctx, c, alpha, shiftX, shiftY, scale) {
    if (!c.ghost || c.ghost.length < 2 || alpha <= 0) return;
    const tx = (x) => shiftX + c.ghostCx + (x - c.ghostCx) * scale;
    const ty = (y) => shiftY + c.ghostCy + (y - c.ghostCy) * scale;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tx(c.ghost[0][0]), ty(c.ghost[0][1]));
    for (let j = 1; j < c.ghost.length; j++) ctx.lineTo(tx(c.ghost[j][0]), ty(c.ghost[j][1]));
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = 'rgb(190,220,255)';
    ctx.lineWidth = 7 * scale;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(235,245,255,0.95)';
    ctx.lineWidth = Math.max(1, 2.2 * scale);
    ctx.stroke();
    // ゴーストの星ノード
    for (const [x, y] of c.ghost) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#eaf4ff';
      ctx.beginPath();
      ctx.arc(tx(x), ty(y), Math.max(1.2, 3.4 * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 星座の更新と描画（particlesより先に呼び、線が下・粒が上になるようにする）
  _drawConstels(ctx, dt, now) {
    const cs = this.constels;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      if (c.mode === 'building') {
        this._drawPlayerConstel(ctx, c, 0.85, 2, now, false);
      } else if (c.mode === 'fade') {
        c.t += dt;
        const k = c.t / 600;
        if (k >= 1) { cs.splice(i, 1); continue; }
        this._drawPlayerConstel(ctx, c, 0.85 * (1 - k), 2, now, false);
      } else if (c.mode === 'complete') {
        c.t += dt;
        const T = c.t;
        // フェーズA(0-700ms): プレイヤー線が白熱フラッシュ＋ゴーストが浮かび上がる
        // フェーズB(700-1500ms): プレイヤー線がゴーストへ「昇華」してフェード
        // フェーズC(1500-2400ms): ゴーストが縮みながらコレクションへ飛んで消える
        if (T >= 2400) { cs.splice(i, 1); continue; }
        if (T < 700) {
          const k = T / 700;
          this._drawPlayerConstel(ctx, c, 1, 3.5 + Math.sin(k * Math.PI) * 2, now, true);
          this._drawGhost(ctx, c, 0.55 * k, 0, 0, 1);
        } else if (T < 1500) {
          const k = (T - 700) / 800;
          this._drawPlayerConstel(ctx, c, 1 - k, 3, now, false);
          this._drawGhost(ctx, c, 0.55, 0, 0, 1);
        } else {
          const k = (T - 1500) / 900;
          const e = k * k; // 加速しながら飛ぶ
          const shiftX = (c.ghostTarget.x - c.ghostCx) * e;
          const shiftY = (c.ghostTarget.y - c.ghostCy) * e;
          this._drawGhost(ctx, c, 0.55 * (1 - k), shiftX, shiftY, 1 - 0.85 * e);
        }
      }
    }
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
    const base = this.reduced ? 5 : 10;
    const n = Math.max(1, Math.round(base * intensity));
    const rgb = this._rgb(color);
    for (let i = 0; i < n; i++) this._dust(x, y, rgb, { speed: 120, size: 3, life: 500, up: 20 });
  }

  // 放射状のスターバースト（大きな瞬間用）
  starburst(x, y, color, rays = 8) {
    if (!this.enabled) return;
    const rgb = this._rgb(color);
    const n = this.reduced ? Math.ceil(rays / 2) : rays;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n;
      const v = 220 + Math.random() * 80;
      this._add({
        type: 'dust', x, y,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        size: 3.5, life: 550, age: 0, rgb, twinkle: true,
      });
    }
  }

  // 1本の流れ星を追加（内部ヘルパー）
  _comet(fromX, fromY, toX, toY, rgb, { size = 3, dustRate = 0.6, arriveBurst = 3, curve = 0.15 } = {}) {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const mx = (fromX + toX) / 2 - (toY - fromY) * (curve + Math.random() * 0.1);
    const my = (fromY + toY) / 2 + (toX - fromX) * (curve + Math.random() * 0.1);
    this._add({
      type: 'comet',
      fx: fromX, fy: fromY, cx: mx, cy: my, tx: toX, ty: toY,
      t: 0,
      dur: Math.max(150, Math.min(420, dist * 0.85)),
      rgb, size,
      dustRate: this.reduced ? dustRate * 0.5 : dustRate,
      arriveBurst,
      absorb: false,
    });
  }

  // 前回同色タップ位置 → 今回位置への色付き流れ星。streakが伸びるほど豪華に
  spawnColorTrail({ fromX, fromY, toX, toY, color, streak }) {
    if (!this.enabled) return;
    const rgb = this._rgb(color);
    // 到着点スパーク（streakで強く）
    this.spawnTapSpark({ x: toX, y: toY, color, intensity: Math.min(1 + streak * 0.25, 3) });
    if (streak < 2) return;

    const dist = Math.hypot(toX - fromX, toY - fromY);
    // streak段階: 2=短い尾 / 3-4=星粒 / 5-6=二重流れ星 / 7+=三連流れ星+光の軌道
    const tier = streak >= 7 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1 : 0;
    if (this.reduced && dist > this.h * 0.9) return; // REDUCEDでは超長距離は省略
    this._comet(fromX, fromY, toX, toY, rgb, {
      size: 3 + tier * 1.1,
      dustRate: 0.5 + tier * 0.45,
      arriveBurst: 3 + tier * 3,
    });
    // 5連続以上は流れ星を重ねてリーチ感を出す（少しずらした軌道のエコー）
    if (tier >= 2) {
      this._comet(fromX, fromY, toX, toY, rgb, { size: 2, dustRate: 0.3, arriveBurst: 0, curve: -0.22 });
    }
    if (tier >= 3) {
      this._comet(fromX, fromY, toX, toY, rgb, { size: 2, dustRate: 0.3, arriveBurst: 0, curve: 0.38 });
      this.starburst(toX, toY, color, 10);
      if (!this.reduced) {
        this._add({ type: 'ring', x: toX, y: toY, r: 12, maxR: 84, life: 480, age: 0, rgb });
      }
    }
  }

  // FEVER中の金色流れ星。feverTapCountが増えるほど豪華に
  spawnFeverTrail({ fromX, fromY, toX, toY, feverTapCount }) {
    if (!this.enabled) return;
    const tier = feverTapCount > 60 ? 3 : feverTapCount > 30 ? 2 : feverTapCount > 10 ? 1 : 0;
    this.spawnTapSpark({ x: toX, y: toY, color: 'gold', intensity: 1.5 + tier * 0.5 });
    this._comet(fromX, fromY, toX, toY, COLOR_RGB.gold, {
      size: 3.5 + tier * 1.2,
      dustRate: 0.7 + tier * 0.55,
      arriveBurst: 3 + tier * 3,
    });
    // 31タップ以上は二重の金色流れ星（流星群感）
    if (tier >= 2) {
      this._comet(fromX, fromY, toX, toY, COLOR_RGB.gold, { size: 2.2, dustRate: 0.35, arriveBurst: 0, curve: -0.25 });
    }
    // タップ点から金色シャード飛散＋放射光線（花火感）
    this.spawnShards({ x: toX, y: toY, count: 3 + tier, spread: 200 });
    this.spawnRays({ x: toX, y: toY, count: 4 + tier });
    // 星屑がBONUSカウンターへ吸い込まれる（tierが上がるほど多く）
    this.spawnBonusAbsorb({ x: toX, y: toY, count: 2 + tier * 2 });
  }

  // FEVER中に自動で画面を横切る金色アンビエント流星（_tickから呼ぶ）
  _ambientMeteor() {
    const w = this.w;
    const h = this.h;
    // 上端または左端から対角に流す
    const fromTop = Math.random() < 0.6;
    const fx = fromTop ? Math.random() * w : -30;
    const fy = fromTop ? -30 : Math.random() * h * 0.5;
    const tx = fx + w * (0.35 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -0.6);
    const ty = fy + h * (0.35 + Math.random() * 0.45);
    this._comet(fx, fy, tx, ty, COLOR_RGB.gold, {
      size: 2 + Math.random() * 2.5,
      dustRate: 0.55,
      arriveBurst: 0,
      curve: 0.05,
    });
  }

  // 金色の紙吹雪シャード（回転する多角形片）。fall=trueで上から降らせる
  spawnShards({ x, y, count = 6, spread = 160, fall = false }) {
    if (!this.enabled) return;
    const n = this.reduced ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      let vx, vy;
      if (fall) {
        vx = (Math.random() - 0.5) * 60;
        vy = 60 + Math.random() * 120;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const v = spread * (0.3 + Math.random() * 0.9);
        vx = Math.cos(ang) * v;
        vy = Math.sin(ang) * v - 40;
      }
      this._add({
        type: 'shard', x, y, vx, vy,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 9,
        size: 4 + Math.random() * 7,
        life: 1100 + Math.random() * 700,
        age: 0,
        tone: Math.random() < 0.5 ? 0 : 1, // 明/暗ゴールド
      });
    }
  }

  // タップ位置からの放射光線（REDUCEDでは省略）
  spawnRays({ x, y, count = 5 }) {
    if (!this.enabled || this.reduced) return;
    for (let i = 0; i < count; i++) {
      this._add({
        type: 'ray', x, y,
        ang: Math.random() * Math.PI * 2,
        len: 60 + Math.random() * 90,
        width: 3 + Math.random() * 4,
        life: 260, age: 0,
      });
    }
  }

  // 12星座コンプリートの全画面セレブレーション（色とりどりのスターバースト＋金シャワー）
  zodiacPerfectBurst() {
    if (!this.enabled) return;
    const colors = ['red', 'blue', 'yellow', 'green', 'gold'];
    for (let i = 0; i < (this.reduced ? 3 : 5); i++) {
      const x = this.w * (0.2 + Math.random() * 0.6);
      const y = this.h * (0.2 + Math.random() * 0.5);
      this.starburst(x, y, colors[i % colors.length], 12);
    }
    this.spawnShards({ x: this.w / 2, y: this.h * 0.3, count: 30, spread: 420 });
    this.spawnRays({ x: this.w / 2, y: this.h * 0.4, count: 10 });
  }

  // FEVER突入時の全画面メガバースト
  feverKickoff() {
    if (!this.enabled) return;
    const cx = this.w / 2;
    const cy = this.h * 0.35;
    this.starburst(cx, cy, 'gold', 14);
    this.spawnShards({ x: cx, y: cy, count: 26, spread: 380 });
    this.spawnRays({ x: cx, y: cy, count: 9 });
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
    // FEVER中はタップと無関係に金色流星群＋紙吹雪シャードを流し続ける（REDUCEDは半分の頻度）
    if (this.fever && this.enabled) {
      this._meteorTimer = (this._meteorTimer || 0) + dt;
      const interval = this.reduced ? 520 : 260;
      if (this._meteorTimer >= interval) {
        this._meteorTimer = 0;
        this._ambientMeteor();
        // 上端から金色シャードを降らせる
        this.spawnShards({ x: Math.random() * this.w, y: -16, count: this.reduced ? 1 : 2, fall: true });
      }
    }
    const ps = this.particles;
    if (ps.length === 0 && this.constels.length === 0) {
      if (this._dirty) {
        this.ctx.clearRect(0, 0, this.w, this.h);
        this._dirty = false;
      }
      return;
    }

    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    this._dirty = true;
    const at = this.absorbTarget;

    // 星座（輝線＋星ノード）を粒子より先に描く
    if (this.constels.length) this._drawConstels(ctx, dt, now);

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
      } else if (p.type === 'shard') {
        p.age += dt;
        const k = 1 - p.age / p.life;
        if (k <= 0 || p.y > this.h + 30) { dead = true; }
        else {
          p.vy += 260 * dt / 1000; // 重力
          p.x += p.vx * dt / 1000;
          p.y += p.vy * dt / 1000;
          p.rot += p.vr * dt / 1000;
          // 回転するひし形（明暗2トーンのゴールド片）
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 1.6);
          const s = p.size;
          ctx.fillStyle = p.tone === 0 ? '#ffe685' : '#e0a800';
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.62, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.62, 0);
          ctx.closePath();
          ctx.fill();
          // ハイライト（半面を明るく）
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.62, 0);
          ctx.lineTo(0, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      } else if (p.type === 'ray') {
        p.age += dt;
        const k = 1 - p.age / p.life;
        if (k <= 0) { dead = true; }
        else {
          // タップ点から伸びる細い三角形の光線
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          ctx.globalAlpha = k * 0.65;
          ctx.fillStyle = 'rgb(255,225,130)';
          const grow = 0.4 + 0.6 * Math.min(1, p.age / 80); // 一瞬で伸びる
          ctx.beginPath();
          ctx.moveTo(0, -p.width / 2);
          ctx.lineTo(0, p.width / 2);
          ctx.lineTo(p.len * grow, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
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