// 星座完成時の「今日の運勢風コメント」（占いパロディ広告の世界観に合わせた演出専用テキスト）。
// スコア・ゲーム進行には一切影響しない。{color} は星座の最頻色（ラッキーカラー）に置換される。

const FORTUNES = [
  '今日のラッキーカラーは{color}！',
  '{color}を追うと運気上昇の予感…!?',
  '金運上昇の予感…!? ※個人差があります',
  '推しからの通知が届くかも♪',
  '無料鑑定より当たる…かもしれない',
  '広告を消すほど運気UP…!?',
  '今夜、いいことあるかも♡',
  '探し物は画面の右下にあります',
  'タップ運が絶好調です',
  'ラッキーアイテム: くまのぬいぐるみ',
  '深夜のタップは計画的に…',
  '相性チェックは今がチャンス!?',
  '星がめっちゃ応援してます',
  '※本占いはゲーム演出です',
];

const COLOR_JP = { red: '赤', blue: '青', yellow: '黄', green: '緑' };

// rng: seed付き乱数関数 / colors: 星座を構成した色の配列
export function tellFortune(rng, colors) {
  // 最頻色をラッキーカラーとする
  const counts = {};
  let lucky = 'red';
  for (const c of colors || []) {
    counts[c] = (counts[c] || 0) + 1;
    if (counts[c] > (counts[lucky] || 0)) lucky = c;
  }
  const text = FORTUNES[Math.floor(rng() * FORTUNES.length)];
  return { text: text.replace('{color}', COLOR_JP[lucky] || lucky), luckyColor: lucky };
}
