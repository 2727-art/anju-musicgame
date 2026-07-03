// 91枚の広告素材デッキ。シャッフルして引き、使い切ったら再シャッフルして再利用する。
// rng には seed付き疑似乱数関数を渡せる（ランキング公平性のため）。
export class Deck {
  constructor(items, rng = Math.random) {
    this.items = items.slice();
    this.rng = rng;
    this.pile = [];
    this.lastDrawn = null;
    this._reshuffle();
  }

  // ゲーム開始時にseed付き乱数で引き直す
  reset(rng) {
    if (rng) this.rng = rng;
    this.lastDrawn = null;
    this._reshuffle();
  }

  _reshuffle() {
    this.pile = this.items.slice();
    // Fisher-Yates
    for (let i = this.pile.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
    }
    // 再シャッフル直後に直前と同じ札が続かないようにする
    if (this.pile.length > 1 && this.pile[this.pile.length - 1] === this.lastDrawn) {
      [this.pile[0], this.pile[this.pile.length - 1]] =
        [this.pile[this.pile.length - 1], this.pile[0]];
    }
  }

  draw() {
    if (this.pile.length === 0) this._reshuffle();
    this.lastDrawn = this.pile.pop();
    return this.lastDrawn;
  }
}
