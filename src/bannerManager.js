// 広告バナーの生成・配置・寿命・オブジェクトプール管理。
// バナー本体(#banner-layer)と×印(#x-layer)は別レイヤーにして、
// ×印が常に最前面に来るようにする。
import { CONFIG } from './config.js';

const X_CORNERS = ['tl', 'tr', 'bl', 'br', 'center'];

export class BannerManager {
  constructor({ bannerLayer, xLayer, images, deck, onTap, onMiss, rng = Math.random }) {
    this.bannerLayer = bannerLayer;
    this.xLayer = xLayer;
    this.images = images;   // {name, url, w, h} の配列（プリロード済み）
    this.deck = deck;       // 91枚デッキ（ファイル名を引く）
    this.onTap = onTap;     // (ad) => void
    this.onMiss = onMiss;   // (ad) => void
    this.rng = rng;         // seed付き疑似乱数（配置・サイズ・角度・×位置に使用）
    this.pool = [];
    this.active = [];
    this.zCounter = 10;
    this.byName = new Map(images.map((im) => [im.name, im]));
  }

  get activeCount() {
    return this.active.filter((a) => a.state === 'alive').length;
  }

  setRng(rng) {
    this.rng = rng;
  }

  _acquire() {
    let ad = this.pool.pop();
    if (!ad) {
      const bannerEl = document.createElement('div');
      bannerEl.className = 'banner';
      const img = document.createElement('img');
      img.draggable = false;
      img.alt = '';
      bannerEl.appendChild(img);

      const xEl = document.createElement('button');
      xEl.className = 'xbtn';
      xEl.type = 'button';
      xEl.innerHTML = '<span class="xmark">×</span>';

      ad = { bannerEl, img, xEl, state: 'free', color: null, dieAt: 0, removeAt: 0, xPos: { x: 0, y: 0 } };
      // リスナーはプール生成時に1回だけ登録し、要素ごと使い回す
      xEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ad.state === 'alive') this.onTap(ad);
      });
    }
    return ad;
  }

  _release(ad) {
    ad.state = 'free';
    ad.bannerEl.remove();
    ad.xEl.remove();
    ad.bannerEl.className = 'banner';
    ad.xEl.className = 'xbtn';
    this.pool.push(ad);
  }

  // ×印の色をセット（'red'|'blue'|'yellow'|'green'|'gold'）
  _applyColor(ad, color) {
    ad.color = color;
    ad.xEl.className = `xbtn c-${color}`;
  }

  // 1枚スポーンする。color は呼び出し側（同色制御ロジック）が決める。
  spawn({ color, songTime, fever }) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hud = CONFIG.hud;
    const B = CONFIG.banner;

    const imgInfo = this.byName.get(this.deck.draw()) || this.images[0];
    if (!imgInfo) return null;

    // サイズ：画面幅ベース + アスペクト比（極端な縦長はクランプ）
    const w = Math.min(
      Math.max(vw * (B.widthVwMin + this.rng() * (B.widthVwMax - B.widthVwMin)), B.minWidthPx),
      B.maxWidthPx
    );
    let ratio = imgInfo.h / imgInfo.w;
    ratio = Math.min(Math.max(ratio, 0.45), 1.35);
    const h = Math.min(w * ratio, vh * 0.4);
    const rot = (this.rng() * 2 - 1) * B.maxRotateDeg;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // ×印が画面内＆他の×と離れる配置を試行する
    const xMin = hud.sideSafePx;
    const xMax = vw - hud.sideSafePx;
    const yMin = hud.topSafePx;
    const yMax = vh - hud.bottomSafePx;
    const others = this.active.filter((a) => a.state === 'alive').map((a) => a.xPos);

    let best = null;
    let minSep = B.xSeparationPx;
    for (let attempt = 0; attempt < 18; attempt++) {
      if (attempt === 12) minSep = 42; // 混雑時は少し緩める
      const cx = xMin + this.rng() * (xMax - xMin);
      const cy = yMin + this.rng() * (yMax - yMin);
      const corner = X_CORNERS[Math.floor(this.rng() * X_CORNERS.length)];
      const inset = 18;
      let dx = 0, dy = 0;
      if (corner !== 'center') {
        dx = (corner === 'tl' || corner === 'bl' ? -1 : 1) * (w / 2 - inset);
        dy = (corner === 'tl' || corner === 'tr' ? -1 : 1) * (h / 2 - inset);
      }
      // バナーの回転に合わせて×印のオフセットも回す
      const xx = cx + dx * cos - dy * sin;
      const xy = cy + dx * sin + dy * cos;
      if (xx < xMin || xx > xMax || xy < yMin || xy > yMax) continue;
      const tooClose = others.some((p) => Math.hypot(p.x - xx, p.y - xy) < minSep);
      best = { cx, cy, xx, xy };
      if (!tooClose) break; // 離れていれば即採用。だめでも最後の候補は保持
      if (attempt < 17) best = null;
    }
    if (!best) return null;

    const ad = this._acquire();
    ad.state = 'alive';
    ad.xPos = { x: best.xx, y: best.xy };
    ad.dieAt = songTime + (fever ? CONFIG.banner.lifeSecFever : CONFIG.banner.lifeSec);
    this._applyColor(ad, color);

    ad.img.src = imgInfo.url;
    const st = ad.bannerEl.style;
    st.width = `${w}px`;
    st.height = `${h}px`;
    st.left = `${best.cx}px`;
    st.top = `${best.cy}px`;
    st.zIndex = String(this.zCounter++);
    st.setProperty('--rot', `${rot}deg`);
    ad.bannerEl.classList.add('pop-in');

    const xs = ad.xEl.style;
    xs.left = `${best.xx}px`;
    xs.top = `${best.xy}px`;

    this.bannerLayer.appendChild(ad.bannerEl);
    this.xLayer.appendChild(ad.xEl);
    if (!this.active.includes(ad)) this.active.push(ad);
    if (this.zCounter > 100000) this.zCounter = 10; // 念のためリセット
    return ad;
  }

  // タップで消す（演出クラスを付けてから解放）
  kill(ad, { fever }) {
    if (ad.state !== 'alive') return;
    ad.state = 'dying';
    ad.removeAt = -1; // アニメ後に update で回収
    ad.bannerEl.classList.add(fever ? 'kill-fever' : 'kill');
    ad.xEl.classList.add('x-hide');
    ad._dieClock = performance.now() + 320;
  }

  // 放置Miss → 「閉じ損ねた」ように一瞬震えてからノイズっぽく消える
  expire(ad) {
    if (ad.state !== 'alive') return;
    ad.state = 'dying';
    ad.bannerEl.classList.add('expire-miss');
    ad.xEl.classList.add('x-hide');
    ad._dieClock = performance.now() + 600;
  }

  // 毎フレーム：寿命切れ検出＆死亡済み要素の回収
  update(songTime) {
    const now = performance.now();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ad = this.active[i];
      if (ad.state === 'alive' && songTime >= ad.dieAt) {
        this.onMiss(ad);
        this.expire(ad);
      }
      if (ad.state === 'dying' && now >= ad._dieClock) {
        this.active.splice(i, 1);
        this._release(ad);
      }
    }
  }

  clearAll() {
    for (const ad of this.active) this._release(ad);
    this.active.length = 0;
  }
}
