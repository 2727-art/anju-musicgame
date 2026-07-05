// アセットの永続キャッシュ（Cache Storage API）＋進捗付きダウンロード。
// 一度ダウンロードしたアセット（BGM・広告画像）は次回起動時にキャッシュから即読み込みされる。
// Cache APIが使えない環境（プライベートブラウズ等）でも通常のfetchにフォールバックして動く。
//
// 注意: bgm.mp3 を同名のまま差し替えた場合は CACHE_NAME のバージョンを上げること
// （広告画像はファイル名が変わるので自動的に新規取得される）。
const CACHE_NAME = 'adbreaker-assets-v1';

// 旧バージョンのキャッシュを掃除（初回呼び出し時に1度だけ）
let cleaned = false;
async function cleanOldCaches() {
  if (cleaned) return;
  cleaned = true;
  try {
    const keys = await caches.keys();
    for (const k of keys) {
      if (k.startsWith('adbreaker-assets-') && k !== CACHE_NAME) await caches.delete(k);
    }
  } catch (e) { /* 失敗しても続行 */ }
}

// URLを（キャッシュ優先で）取得してblob URLを返す。
// onProgress(0..1) はネットワーク取得時のみバイト進捗で呼ばれる（キャッシュヒット時は即1）。
export async function cachedBlobURL(url, onProgress) {
  let cache = null;
  let response = null;
  try {
    if ('caches' in window) {
      await cleanOldCaches();
      cache = await caches.open(CACHE_NAME);
      response = await cache.match(url);
    }
  } catch (e) {
    cache = null; // Cache API不可 → 毎回fetch
  }

  const fromCache = !!response;
  if (!response) {
    response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    if (cache) {
      try { await cache.put(url, response.clone()); } catch (e) { /* 容量超過等は無視 */ }
    }
  }

  const total = Number(response.headers.get('Content-Length')) || 0;
  // ネットワーク取得かつサイズ既知なら進捗付きで読む
  if (!fromCache && onProgress && total > 0 && response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(1, received / total));
    }
    const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || '' });
    return URL.createObjectURL(blob);
  }

  const blob = await response.blob();
  if (onProgress) onProgress(1);
  return URL.createObjectURL(blob);
}
