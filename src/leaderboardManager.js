// Firebaseランキング管理（Phase 3）。
// - Firebase未設定 / SDK読み込み失敗 / 認証失敗 でもゲーム本体を止めない
// - 送信はリザルト画面でユーザーが明示的に押したときだけ（自動送信しない）
// - 1ユーザー1件（uidをドキュメントIDにする）。ベスト未満なら更新しない
// - Firestoreの構造: leaderboards/{leaderboardId}/entries/{uid}
import { CONFIG } from './config.js';
import { getFirebase } from './firebaseApp.js';

let fb = null;              // {app, auth, db, authMod, fsMod} | null
let initTried = false;
let submitting = false;     // 二重送信ガード

export async function initLeaderboard() {
  if (initTried) return fb !== null;
  initTried = true;
  fb = await getFirebase();
  return fb !== null;
}

export function isLeaderboardAvailable() {
  return fb !== null;
}

// 匿名認証。失敗したら null（ゲームは続行）。
export async function ensureSignedIn() {
  if (!(await initLeaderboard())) return null;
  const { auth, authMod } = fb;
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await authMod.signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    console.warn('匿名認証に失敗しました。', e);
    return null;
  }
}

// クライアント側の妥当性チェック。{ok, reason} を返す。
export function canSubmit(pr) {
  const L = CONFIG.leaderboard.limits;
  const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
  if (!pr) return { ok: false, reason: 'プレイ結果がありません' };
  const j = pr.judgementCounts;
  const f = pr.fever;
  const checks = [
    [isNonNegInt(pr.score) && pr.score <= L.scoreMax, 'スコアが不正です'],
    [pr.bpm === CONFIG.bpm, 'BPMが不正です'],
    [pr.songId === CONFIG.song.id, '曲IDが不正です'],
    [pr.gameVersion === CONFIG.gameVersion, 'ゲームバージョンが古いです。リロードしてください'],
    [isNonNegInt(pr.playDurationMs) &&
      pr.playDurationMs >= L.playDurationMinMs && pr.playDurationMs <= L.playDurationMaxMs,
      'プレイ時間が曲の長さと一致しません'],
    [isNonNegInt(pr.maxCombo) && pr.maxCombo <= L.maxComboMax, 'コンボ数が不正です'],
    [isNonNegInt(pr.clearedAds) && pr.clearedAds <= L.clearedAdsMax, '消去数が不正です'],
    [isNonNegInt(pr.missCount) && pr.missCount <= L.missCountMax, 'Miss数が不正です'],
    [j && isNonNegInt(j.perfect) && isNonNegInt(j.great) && isNonNegInt(j.good) && isNonNegInt(j.ok) &&
      j.perfect <= L.judgementMax && j.great <= L.judgementMax && j.good <= L.judgementMax && j.ok <= L.judgementMax,
      '判定内訳が不正です'],
    [f && isNonNegInt(f.count) && f.count <= L.feverCountMax &&
      isNonNegInt(f.clearedAds) && f.clearedAds <= L.feverClearedAdsMax &&
      isNonNegInt(f.totalBonus) && f.totalBonus <= L.feverBonusMax,
      'FEVER統計が不正です'],
    [pr.sameColor && isNonNegInt(pr.sameColor.maxStreak) && pr.sameColor.maxStreak <= L.streakMax,
      'ストリーク統計が不正です'],
    [isNonNegInt(pr.seed), 'seedがありません'],
    [typeof pr.startedAt === 'string' && typeof pr.finishedAt === 'string', 'プレイ時刻がありません'],
  ];
  for (const [ok, reason] of checks) {
    if (!ok) return { ok: false, reason };
  }
  return { ok: true, reason: '' };
}

function entryDocRef() {
  const { db, fsMod } = fb;
  return fsMod.doc(db, 'leaderboards', CONFIG.leaderboard.id, 'entries', fb.auth.currentUser.uid);
}

// 自分のエントリを取得（無ければ null）
export async function getMyEntry() {
  if (!(await ensureSignedIn())) return null;
  const { fsMod } = fb;
  try {
    const snap = await fsMod.getDoc(entryDocRef());
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('自分のエントリ取得に失敗しました。', e);
    return null;
  }
}

// スコア送信。
// 戻り値: {status: 'ok'|'not-best'|'unavailable'|'invalid'|'error', message}
export async function submitScore(playResult, playerName) {
  if (submitting) return { status: 'error', message: '送信中です' };
  const valid = canSubmit(playResult);
  if (!valid.ok) return { status: 'invalid', message: valid.reason };

  submitting = true;
  try {
    const user = await ensureSignedIn();
    if (!user) {
      return { status: 'unavailable', message: 'ランキングに接続できませんでした（ローカルベストは保存されています）' };
    }
    const { fsMod } = fb;
    const ref = entryDocRef();

    // 既存ベスト確認（ルール側でも守られるが、UX用に先に見る）
    let existing = null;
    try {
      const snap = await fsMod.getDoc(ref);
      if (snap.exists()) existing = snap.data();
    } catch (e) { /* 取得失敗時は送信を試みる */ }
    if (existing && playResult.score <= existing.score) {
      return { status: 'not-best', message: `自己ベスト未更新（BEST: ${existing.score.toLocaleString()}）` };
    }

    const j = playResult.judgementCounts;
    const f = playResult.fever;
    const entry = {
      playerName,
      score: playResult.score,
      rank: playResult.rank,
      maxCombo: playResult.maxCombo,
      clearedAds: playResult.clearedAds,
      missCount: playResult.missCount,
      perfect: j.perfect,
      great: j.great,
      good: j.good,
      ok: j.ok,
      feverCount: f.count,
      feverClearedAds: f.clearedAds,
      feverTotalBonus: f.totalBonus,
      maxSameColorStreak: playResult.sameColor.maxStreak,
      seed: playResult.seed,
      gameVersion: playResult.gameVersion,
      songId: playResult.songId,
      bpm: playResult.bpm,
      playDurationMs: playResult.playDurationMs,
      // ルール側で「createdAtは作成時のみserverTimestamp・更新時は変更不可」を検証する
      createdAt: existing ? existing.createdAt : fsMod.serverTimestamp(),
      updatedAt: fsMod.serverTimestamp(),
    };
    await fsMod.setDoc(ref, entry);
    return { status: 'ok', message: 'ランキングに登録しました！' };
  } catch (e) {
    console.warn('スコア送信に失敗しました。', e);
    return { status: 'error', message: '送信に失敗しました。時間をおいて再度お試しください' };
  } finally {
    submitting = false;
  }
}

// TOP50取得。[{uid, data}] を返す。失敗時は null。
export async function getTopScores(limitN = CONFIG.leaderboard.fetchLimit) {
  if (!(await initLeaderboard())) return null;
  const { db, fsMod } = fb;
  try {
    const q = fsMod.query(
      fsMod.collection(db, 'leaderboards', CONFIG.leaderboard.id, 'entries'),
      fsMod.orderBy('score', 'desc'),
      fsMod.orderBy('updatedAt', 'asc'),
      fsMod.limit(Math.min(limitN, 100))
    );
    const snap = await fsMod.getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, data: d.data() }));
  } catch (e) {
    console.warn('ランキング取得に失敗しました。', e);
    return null;
  }
}

// 自分のuid（未認証ならnull）。ランキング内の自分の行ハイライト用
export function myUid() {
  return fb && fb.auth.currentUser ? fb.auth.currentUser.uid : null;
}
