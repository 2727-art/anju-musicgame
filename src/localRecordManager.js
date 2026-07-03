// ローカルハイスコアの保存・読み込み（localStorageのみ。Firebaseは未実装）。
const KEY = 'adbreaker.best.v1';

export function loadBest() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o !== 'object' || o === null || typeof o.bestScore !== 'number') return null;
    return o;
  } catch (e) {
    // データ破損時はベストなし扱いで続行
    return null;
  }
}

// プレイ結果を渡し、ベスト更新なら保存する。{isNewBest, best} を返す。
export function saveIfBest(result) {
  const current = loadBest();
  if (current && result.score <= current.bestScore) {
    return { isNewBest: false, best: current };
  }
  const best = {
    bestScore: result.score,
    bestRank: result.rank,
    bestMaxCombo: result.maxCombo,
    bestClearedAds: result.clearedAds,
    bestFeverBonus: result.fever.totalBonus,
    updatedAt: new Date().toISOString(),
    gameVersion: result.gameVersion,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(best));
  } catch (e) {
    // 保存失敗でもゲームは続行
  }
  return { isNewBest: true, best };
}
