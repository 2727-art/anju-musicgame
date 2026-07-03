// Phase 3でFirebaseランキングへ送信するためのプレイ結果オブジェクトを組み立てる。
// Phase 2では送信せず、console.logで確認できるだけにする。
// 個人情報は含めない。JSON.stringify可能な純粋オブジェクトにする。
import { CONFIG, rankFor } from './config.js';

export function buildPlayResult({ scoreMgr, feverMgr, seed, startedAt, finishedAt, pausedMs = 0 }) {
  return {
    gameVersion: CONFIG.gameVersion,
    songId: CONFIG.song.id,
    songDuration: CONFIG.song.durationSec,
    bpm: CONFIG.bpm,
    score: scoreMgr.score,
    rank: rankFor(scoreMgr.score),
    maxCombo: scoreMgr.maxCombo,
    clearedAds: scoreMgr.clearedAds,
    missCount: scoreMgr.missCount,
    judgementCounts: {
      perfect: scoreMgr.judgementCounts.PERFECT,
      great: scoreMgr.judgementCounts.GREAT,
      good: scoreMgr.judgementCounts.GOOD,
      ok: scoreMgr.judgementCounts.OK,
    },
    fever: {
      count: feverMgr.feverCount,
      clearedAds: feverMgr.totalKills,
      totalBonus: feverMgr.totalBonus,
    },
    sameColor: {
      maxStreak: scoreMgr.maxStreak,
    },
    seed,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    // 実プレイ時間（ポーズ中を除く）。ランキングの妥当性チェックに使う
    playDurationMs: Math.max(0, finishedAt - startedAt - pausedMs),
  };
}
