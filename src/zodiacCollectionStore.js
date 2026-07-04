// 星座コレクションの永続化（localStorage・演出専用）。
// プレイをまたいで集めた星座を保持し、12種類そろうと1周としてカウントする。
// ランキング・スコアには一切影響しない。
const KEY = 'adbreaker.zodiac.v1';

export function loadZodiacStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { collected: [], laps: 0 };
    const o = JSON.parse(raw);
    if (!Array.isArray(o.collected) || typeof o.laps !== 'number') return { collected: [], laps: 0 };
    return { collected: o.collected.filter((s) => typeof s === 'string').slice(0, 12), laps: o.laps };
  } catch (e) {
    return { collected: [], laps: 0 };
  }
}

export function saveZodiacStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (e) {
    // 保存失敗でも続行
  }
}
