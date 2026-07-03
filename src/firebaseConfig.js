// 本番Firebase設定（プロジェクト: anjumusicgme）。
// このファイルはGitHub Pagesで公開される前提の値です（秘密鍵ではありません）。
// プロジェクトを守るのは Security Rules と App Check です（README参照）。

export const firebaseConfig = {
  apiKey: "AIzaSyB1pSp8DINw12TuJaI2TVLJzowOJVf4mWE",
  authDomain: "anjumusicgme.firebaseapp.com",
  projectId: "anjumusicgme",
  storageBucket: "anjumusicgme.firebasestorage.app",
  messagingSenderId: "971658327507",
  appId: "1:971658327507:web:8c512dba173781efc36b26"
};

// App Check（本番公開前に enabled: true にすること。README「App Check設定手順」参照）
export const appCheckConfig = {
  enabled: false,
  provider: "recaptcha-enterprise",
  siteKey: "YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY",
  debug: false
};

// Firebase Emulator（本番では必ず false）
export const emulatorConfig = {
  enabled: false,
  authUrl: "http://127.0.0.1:9099",
  firestoreHost: "127.0.0.1",
  firestorePort: 8080
};
