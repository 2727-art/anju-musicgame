// 視覚エフェクト管理。ポップテキスト・パーティクル・リングはプールして再利用し、
// FEVER中の連打でもDOMを使い捨てすぎないようにする。
// 設定 effects: 'REDUCED' のときはパーティクル数を減らし、リング・縁フラッシュを省略する。
export class EffectManager {
  constructor({ layer, milestoneEl, streakNoteEl, edgeFlashEl, settings }) {
    this.layer = layer;
    this.milestoneEl = milestoneEl;
    this.streakNoteEl = streakNoteEl;
    this.edgeFlashEl = edgeFlashEl;
    this.settings = settings;
    this.popPool = [];
    this.particlePool = [];
    this.ringPool = [];
  }

  get reduced() {
    return this.settings.get('effects') === 'REDUCED';
  }

  // 浮き上がって消えるテキスト
  pop(x, y, html, cls = '') {
    let el = this.popPool.pop();
    if (!el) {
      el = document.createElement('div');
      el.addEventListener('animationend', (e) => {
        if (e.target !== el) return; // 子要素のアニメ終了は無視
        el.remove();
        if (this.popPool.length < 24) this.popPool.push(el);
      });
    }
    el.className = `pop ${cls}`;
    el.innerHTML = html;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.layer.appendChild(el); // 再挿入でアニメーションが再スタートする
  }

  // 破裂パーティクル
  burst(x, y, color, big) {
    const n = this.reduced ? (big ? 4 : 3) : (big ? 10 : 6);
    for (let i = 0; i < n; i++) {
      let p = this.particlePool.pop();
      if (!p) {
        p = document.createElement('span');
        p.addEventListener('animationend', (e) => {
          if (e.target !== p) return;
          p.remove();
          if (this.particlePool.length < 80) this.particlePool.push(p);
        });
      }
      p.className = `particle p-${color}${big ? ' p-big' : ''}`;
      const ang = Math.random() * Math.PI * 2; // 演出用なのでseed乱数は不要
      const dist = (big ? 90 : 55) * (0.5 + Math.random());
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      this.layer.appendChild(p);
    }
  }

  // 同色ストリーク7以上のリング演出
  ring(x, y, color) {
    if (this.reduced) return;
    let el = this.ringPool.pop();
    if (!el) {
      el = document.createElement('div');
      el.addEventListener('animationend', (e) => {
        if (e.target !== el) return;
        el.remove();
        if (this.ringPool.length < 12) this.ringPool.push(el);
      });
    }
    el.className = `ring r-${color}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.layer.appendChild(el);
  }

  // 画面中央の大きな通知（コンボ節目・FEVER）
  milestone(text, cls = '') {
    const el = this.milestoneEl;
    el.classList.remove('show');
    void el.offsetWidth; // 再トリガ
    el.textContent = text;
    el.className = `milestone ${cls} show`;
  }

  // 上部の小さめ通知（同色ストリーク）
  streakNote(text, cls = '') {
    const el = this.streakNoteEl;
    el.classList.remove('show');
    void el.offsetWidth;
    el.textContent = text;
    el.className = `streak-note ${cls} show`;
  }

  // 画面周辺のネオンフラッシュ
  edgeFlash(cls = '') {
    if (this.reduced) return;
    const el = this.edgeFlashEl;
    el.classList.remove('show');
    void el.offsetWidth;
    el.className = `edge-flash ${cls} show`;
  }
}
