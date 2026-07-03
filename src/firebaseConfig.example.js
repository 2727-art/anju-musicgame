// Firebase設定のテンプレート。
// このファイルを src/firebaseConfig.js にコピーし、Firebase Consoleの値で書き換えてください。
// firebaseConfig.js が存在しない場合、ランキング機能は自動的に無効化されます（ゲーム本体は動きます）。
//
// 注意: firebaseConfig は「秘密鍵」ではなく、公開される前提の識別子です。
// プロジェクトを守るのは Security Rules と App Check です（README参照）。

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// App Check（本番公開前に enabled: true にしてください）
export const appCheckConfig = {
  enabled: false,
  provider: "recaptcha-enterprise", // "recaptcha-enterprise" | "recaptcha-v3"
  siteKey: "YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY",
  // trueにするとApp Checkのdebugトークンを使う（ローカル開発用。本番ではfalse）
  debug: false
};

// Firebase Emulator を使うローカル検証用（本番では enabled: false のまま）
export const emulatorConfig = {
  enabled: false,
  authUrl: "http://127.0.0.1:9099",
  firestoreHost: "127.0.0.1",
  firestorePort: 8080
};
