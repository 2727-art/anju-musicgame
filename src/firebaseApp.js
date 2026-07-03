// Firebase SDK（Modular / CDN ESM・バージョン固定）の遅延初期化。
// - firebaseConfig.js が無い / SDK読み込み失敗 でも例外を外に漏らさず null を返し、
//   ゲーム本体には影響を与えない。
// - SDKはランキング機能を初めて使うときに動的importする（起動を重くしない）。
const SDK_VERSION = '10.12.2'; // 変更したらREADMEも更新すること
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let initPromise = null;

async function init() {
  // 1) 設定ファイル（無ければランキング無効）
  let cfg;
  try {
    cfg = await import('./firebaseConfig.js');
  } catch (e) {
    console.info('firebaseConfig.js が無いためランキング機能は無効です。');
    return null;
  }
  if (!cfg.firebaseConfig || !cfg.firebaseConfig.projectId ||
      cfg.firebaseConfig.projectId === 'YOUR_PROJECT_ID') {
    console.info('firebaseConfig.js が未設定のためランキング機能は無効です。');
    return null;
  }

  // 2) SDK読み込み（失敗してもゲームは続行）
  let appMod, authMod, fsMod;
  try {
    [appMod, authMod, fsMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
  } catch (e) {
    console.warn('Firebase SDKの読み込みに失敗しました。ランキング機能は無効です。', e);
    return null;
  }

  const app = appMod.initializeApp(cfg.firebaseConfig);

  // 3) App Check（未設定・失敗でもランキングUIは落とさない）
  const ac = cfg.appCheckConfig;
  if (ac && ac.enabled) {
    try {
      if (ac.debug) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      const acMod = await import(`${CDN}/firebase-app-check.js`);
      const provider = ac.provider === 'recaptcha-v3'
        ? new acMod.ReCaptchaV3Provider(ac.siteKey)
        : new acMod.ReCaptchaEnterpriseProvider(ac.siteKey);
      acMod.initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
    } catch (e) {
      console.warn('App Checkの初期化に失敗しました（続行します）。', e);
    }
  }

  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);

  // 4) ローカルEmulator（firebaseConfig.jsで有効化した場合のみ）
  const em = cfg.emulatorConfig;
  if (em && em.enabled) {
    try {
      authMod.connectAuthEmulator(auth, em.authUrl, { disableWarnings: true });
      fsMod.connectFirestoreEmulator(db, em.firestoreHost, em.firestorePort);
      console.info('Firebase Emulatorに接続しました。');
    } catch (e) {
      console.warn('Emulator接続に失敗しました。', e);
    }
  }

  return { app, auth, db, authMod, fsMod };
}

// 成功/失敗（null）をキャッシュして返す。例外は投げない。
export function getFirebase() {
  if (!initPromise) {
    initPromise = init().catch((e) => {
      console.warn('Firebase初期化エラー。ランキング機能は無効です。', e);
      return null;
    });
  }
  return initPromise;
}
