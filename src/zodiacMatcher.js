// 12星座マッチャー（演出専用・スコアには影響しない）。
// プレイヤーがタップで描いた折れ線を正規化し、
// 12星座の簡略アステリズム形状と比較して最も近い星座を返す。
// 重心・スケール・回転(8方位)・鏡像・描き順の逆転を吸収した最小二乗距離で判定し、
// マッチした星座の「本来の形」をプレイヤーの描画位置に合わせた座標（ghost）も返す。

// 各星座の簡略形状（主要な星の並びを4〜7点の折れ線にしたもの・正規化前）
const ZODIAC_DEFS = [
  ['おひつじ座', '♈', [[-1, 0.2], [-0.1, -0.3], [0.7, -0.2], [1, 0.3], [0.8, 0.6]]],
  ['おうし座', '♉', [[-1, -0.8], [-0.4, 0], [0, 0.35], [0.4, 0], [1, -0.8]]],
  ['ふたご座', '♊', [[-0.7, -1], [-0.75, 0], [-0.6, 1], [0.6, 1], [0.75, 0], [0.7, -1]]],
  ['かに座', '♋', [[0, -1], [0, 0], [-0.8, 0.7], [0, 0], [0.8, 0.7]]],
  ['しし座', '♌', [[-1, 0.6], [-0.9, 0], [-0.5, -0.5], [0.1, -0.6], [0.5, -0.2], [1, 0.5], [0.3, 0.7]]],
  ['おとめ座', '♍', [[-1, -0.5], [-0.4, -0.2], [0, 0.3], [0.5, 0], [0.3, 0.7], [1, 0.8]]],
  ['てんびん座', '♎', [[-0.9, 0.6], [0, -0.8], [0.9, 0.6], [-0.9, 0.6]]],
  ['さそり座', '♏', [[-1, -0.7], [-0.5, -0.5], [-0.1, -0.1], [0.1, 0.4], [0.4, 0.8], [0.8, 0.7], [1, 0.3]]],
  ['いて座', '♐', [[-1, 0.3], [-0.5, -0.4], [0, 0.2], [0.3, -0.5], [0.8, -0.3], [1, 0.4]]],
  ['やぎ座', '♑', [[-1, -0.2], [-0.4, 0.55], [0.3, 0.65], [0.9, 0.15], [0.4, -0.6], [-1, -0.2]]],
  ['みずがめ座', '♒', [[-1, 0], [-0.5, -0.45], [0, 0.05], [0.5, -0.4], [1, 0.1]]],
  ['うお座', '♓', [[-1, 0.9], [-0.3, 0], [0.2, -0.7], [0.7, -0.9], [1, -0.5]]],
];

const K = 24; // 比較用のリサンプル点数

// 折れ線を弧長で等間隔にK点へリサンプル
function resample(pts, k = K) {
  if (pts.length === 1) return Array.from({ length: k }, () => [pts[0][0], pts[0][1]]);
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d);
    total += d;
  }
  if (total < 1e-6) return Array.from({ length: k }, () => [pts[0][0], pts[0][1]]);
  const out = [];
  const step = total / (k - 1);
  let target = 0, acc = 0, seg = 0;
  for (let i = 0; i < k; i++) {
    while (seg < segs.length - 1 && acc + segs[seg] < target - 1e-9) {
      acc += segs[seg];
      seg++;
    }
    const remain = target - acc;
    const t = segs[seg] > 1e-9 ? Math.min(1, remain / segs[seg]) : 0;
    out.push([
      pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t,
      pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t,
    ]);
    target += step;
  }
  return out;
}

// 重心とRMSスケールを求める
function normParams(pts) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let rms = 0;
  for (const [x, y] of pts) rms += (x - cx) ** 2 + (y - cy) ** 2;
  rms = Math.sqrt(rms / pts.length) || 1;
  return { cx, cy, s: rms };
}

function applyNorm(pts, { cx, cy, s }) {
  return pts.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
}

function meanSqDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i][0] - b[i][0]) ** 2 + (a[i][1] - b[i][1]) ** 2;
  return s / a.length;
}

// 星座テンプレートは起動時に前処理。
// norm: 比較用（リサンプル+正規化） / shape: ゴースト表示用（元の星点を同じ正規化で）
const ZODIACS = ZODIAC_DEFS.map(([name, symbol, pts]) => {
  const rs = resample(pts);
  const p = normParams(rs);
  return { name, symbol, norm: applyNorm(rs, p), shape: applyNorm(pts, p) };
});

// タップ座標列（{x,y}の配列）→ 最も形が近い星座と、
// プレイヤーの描画に位置合わせした「本来の形」(ghost: [[x,y],...]) を返す
export function matchZodiac(rawPts) {
  if (!rawPts || rawPts.length < 2) {
    const z = ZODIACS[0];
    return { name: z.name, symbol: z.symbol, ghost: [] };
  }
  const rs = resample(rawPts.map((p) => [p.x, p.y]));
  const P = normParams(rs);
  const base = applyNorm(rs, P);

  // 回転8方位 × 鏡像 × 描き順逆転 のバリアントで最小距離を探す
  let best = { z: ZODIACS[0], m: 1, a: 0, d: Infinity };
  for (const dir of [base, base.slice().reverse()]) {
    for (const m of [1, -1]) {
      for (let r = 0; r < 8; r++) {
        const a = (r * Math.PI) / 4;
        const cos = Math.cos(a), sin = Math.sin(a);
        const variant = dir.map(([x, y]) => {
          const xx = x * m;
          return [xx * cos - y * sin, xx * sin + y * cos];
        });
        for (const z of ZODIACS) {
          const d = meanSqDist(variant, z.norm);
          if (d < best.d) best = { z, m, a, d };
        }
      }
    }
  }

  // ゴースト座標: テンプレ形状に最良変換の逆（回転-a→鏡像→非正規化）を適用して
  // プレイヤーが描いた位置・大きさ・向きに重ねる
  const ca = Math.cos(-best.a), sa = Math.sin(-best.a);
  const ghost = best.z.shape.map(([x, y]) => {
    const rx = x * ca - y * sa;
    const ry = x * sa + y * ca;
    return [P.cx + P.s * (rx * best.m), P.cy + P.s * ry];
  });
  return { name: best.z.name, symbol: best.z.symbol, ghost };
}
