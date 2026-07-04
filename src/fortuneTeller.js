// 運勢テキスト生成（占いパロディ広告の世界観に合わせた演出専用）。
// スコア・ゲーム進行には一切影響しない。
// - tellFortune: 星座完成時の一言コメント（プレイ中のポップ用）
// - tellDailyFortune: リザルトの「今日の運勢」カード用（日付シードで決定論的）
import { mulberry32 } from './random.js';

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

// 星座別の占い文（リザルトカード用・星座の性格に寄せた文面）
const ZODIAC_FORTUNES = {
  'おひつじ座': '思い立ったら即タップが吉。勢いが運を連れてくる日。',
  'おうし座': 'あせらずマイペースで大丈夫。じっくり狙えば大物が消せそう。',
  'ふたご座': '気になることが2つ来たら、両方選んで正解の日。',
  'かに座': '守りが固い日。大切なものはそっと胸にしまっておこう。',
  'しし座': '主役はあなた。堂々とど真ん中を狙うと運気アップ。',
  'おとめ座': '細部に幸運が宿る日。すみっこの×を見逃さないで。',
  'てんびん座': 'バランス感覚が冴える日。迷ったら真ん中をとって吉。',
  'さそり座': '直感が鋭く冴える日。最初に目が合った広告が当たり。',
  'いて座': '遠くの目標ほど燃える日。画面の端まで狙ってみて。',
  'やぎ座': 'コツコツが最強の日。小さな積み重ねが大きな星になる。',
  'みずがめ座': 'ひらめきの日。いつもと違う順番が幸運を呼ぶかも。',
  'うお座': 'ゆったり流れに乗って吉。無理せず心地よいテンポで。',
};

// 日替わりのラッキーアイテム（バナー広告の世界観に寄せる）
const LUCKY_ITEMS = [
  'くまのぬいぐるみ',
  '紫のリボン',
  '星のチャーム',
  'ホットミルク',
  'ゴシックレース',
  '推しのアクリルスタンド',
  'ふわふわの毛布',
  '夜食のプリン',
  'お気に入りのヘッドホン',
  'ラベンダーの香り',
];

// 文字列 → 32bitシード（日付キーの決定論化用）
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

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

// リザルトの「今日の運勢」。
// dateKey(YYYY-MM-DD)＋星座で決定論的（同じ日は同じラッキーアイテム）。
// 総合運の星はプレイ実績から加点（3〜5・辛くしない）。
export function tellDailyFortune({ dateKey, zodiacName, zodiacSymbol, luckyColor, stats = {} }) {
  const rng = mulberry32(hashStr(`${dateKey}:${zodiacName}`));
  let stars = 3;
  if ((stats.constellations || 0) >= 3) stars++;
  if ((stats.maxStreak || 0) >= 7 || stats.zodiacPerfect) stars++;
  stars = Math.min(5, stars);
  return {
    zodiacLine: `${zodiacSymbol} ${zodiacName}`,
    stars: '★'.repeat(stars) + '☆'.repeat(5 - stars),
    text: ZODIAC_FORTUNES[zodiacName] || '星がやさしく見守っています。',
    luckyColorJp: COLOR_JP[luckyColor] || '紫',
    luckyItem: LUCKY_ITEMS[Math.floor(rng() * LUCKY_ITEMS.length)],
  };
}
