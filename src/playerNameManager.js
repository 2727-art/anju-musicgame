// プレイヤーネームの管理（localStorage保存＋サニタイズ）。
// 表示は必ず textContent で行うこと（innerHTMLに入れない）。
import { CONFIG } from './config.js';

const KEY = 'adbreaker.playerName.v1';

// 簡易NGワード（Phase 3では最小限。完全なフィルタではない）
const NG_WORDS = ['死ね', '殺す', 'fuck', 'shit', 'nazi'];

// 制御文字・改行・タブ・不可視文字を除去し、HTMLタグ記号を無効化して1〜12文字に整える
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return CONFIG.leaderboard.defaultName;
  let s = raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\uFEFF]/g, '')
    .replace(/[<>]/g, '') // タグとして解釈されうる記号は除去
    .trim();
  // NGワードは伏せ字に
  for (const w of NG_WORDS) {
    if (s.toLowerCase().includes(w.toLowerCase())) {
      s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '*'.repeat(w.length));
    }
  }
  // 絵文字を壊さないようコードポイント単位で最大文字数に切る
  s = [...s].slice(0, CONFIG.leaderboard.nameMaxLen).join('');
  if (s.trim().length === 0) return CONFIG.leaderboard.defaultName;
  return s;
}

export function loadPlayerName() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null; // 未登録（初回送信時にモーダルを出す判断に使う）
    return sanitizeName(raw);
  } catch (e) {
    return null;
  }
}

export function savePlayerName(name) {
  const s = sanitizeName(name);
  try {
    localStorage.setItem(KEY, s);
  } catch (e) {
    // 保存失敗でも続行
  }
  return s;
}