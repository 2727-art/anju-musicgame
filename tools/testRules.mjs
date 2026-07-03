// Firestore Security Rules のエミュレータ検証スクリプト（依存パッケージなし・REST直叩き）。
//
// 前提: Firestoreエミュレータが起動していること
//   firebase emulators:start --only firestore,auth --project demo-adbreaker
// 実行:
//   node tools/testRules.mjs
//
// エミュレータは Authorization ヘッダの未署名JWT(alg:none)を検証なしで受け付けるため、
// 任意のuidでの認証状態を再現できる（@firebase/rules-unit-testing と同じ仕組み）。
const PROJECT = 'demo-adbreaker';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const BOARD = 'adbreaker_song001_v1';

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

// 未署名JWT（エミュレータ専用。本番では通用しない）
function fakeToken(uid) {
  const header = { alg: 'none', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'anonymous', identities: {} },
  };
  return `${b64url(header)}.${b64url(payload)}.`;
}

const OWNER = 'owner'; // エミュレータの管理者バイパストークン

function docName(uid) {
  return `projects/${PROJECT}/databases/(default)/documents/leaderboards/${BOARD}/entries/${uid}`;
}

// 正しいエントリのフィールド（createdAt/updatedAtはtransformで付与）
function validFields(overrides = {}) {
  const iv = (n) => ({ integerValue: String(n) });
  const sv = (s) => ({ stringValue: s });
  const f = {
    playerName: sv('テスター'),
    score: iv(123456),
    rank: sv('C'),
    maxCombo: iv(100),
    clearedAds: iv(150),
    missCount: iv(10),
    perfect: iv(60),
    great: iv(50),
    good: iv(30),
    ok: iv(10),
    feverCount: iv(2),
    feverClearedAds: iv(40),
    feverTotalBonus: iv(400000),
    maxSameColorStreak: iv(7),
    seed: iv(4149272446),
    gameVersion: sv('3.0.0'),
    songId: sv('song001'),
    bpm: iv(156),
    playDurationMs: iv(262000),
  };
  return { ...f, ...overrides };
}

async function commit(writes, token) {
  const res = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ writes }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function createWrite(uid, fields, { exists = false, transforms = ['createdAt', 'updatedAt'] } = {}) {
  return {
    update: { name: docName(uid), fields },
    updateTransforms: transforms.map((fp) => ({ fieldPath: fp, setToServerValue: 'REQUEST_TIME' })),
    currentDocument: { exists },
  };
}

async function getDoc(uid, token) {
  const res = await fetch(`${BASE}/leaderboards/${BOARD}/entries/${uid}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function runQuery(limit, token) {
  const res = await fetch(`${BASE}/leaderboards/${BOARD}:runQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'entries' }],
        orderBy: [
          { field: { fieldPath: 'score' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' },
        ],
        ...(limit ? { limit } : {}),
      },
    }),
  });
  const body = await res.json().catch(() => []);
  // runQueryはストリーム配列。拒否時は要素にerrorが入るか、ステータスが4xxになる
  const denied = res.status >= 400 || (Array.isArray(body) && body.some((x) => x.error));
  return { status: res.status, denied, body };
}

// ---- テストランナー ----
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.error(`  FAIL  ${name} ${detail}`); }
}

const UID_A = 'user_aaa';
const UID_B = 'user_bbb';

async function main() {
  console.log(`Firestore Rules テスト開始 (${HOST} / ${BOARD})\n`);

  // 0. 事前クリーンアップ（ownerはルールをバイパスする）
  await commit([{ delete: docName(UID_A) }], OWNER);
  await commit([{ delete: docName(UID_B) }], OWNER);

  // 1. 未ログインでの作成 → 拒否
  let r = await commit([createWrite(UID_A, validFields())], null);
  check('1. 未ログイン書き込みを拒否', r.status === 403, `status=${r.status}`);

  // 2. ログイン済み・自分のuid → 作成許可
  r = await commit([createWrite(UID_A, validFields())], fakeToken(UID_A));
  check('2. 自分のuidでの作成を許可', r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

  // 3. 他人のuidのドキュメントへの書き込み → 拒否
  r = await commit([createWrite(UID_B, validFields())], fakeToken(UID_A));
  check('3. 他人のuidへの書き込みを拒否', r.status === 403, `status=${r.status}`);

  // 4. scoreが文字列 → 拒否
  r = await commit(
    [createWrite(UID_B, validFields({ score: { stringValue: '99999' } }))],
    fakeToken(UID_B)
  );
  check('4. 不正なscore型(string)を拒否', r.status === 403, `status=${r.status}`);

  // 5. score上限(30,000,000)超過 → 拒否
  r = await commit(
    [createWrite(UID_B, validFields({ score: { integerValue: '30000001' } }))],
    fakeToken(UID_B)
  );
  check('5. score上限超過を拒否', r.status === 403, `status=${r.status}`);

  // 6. 既存(123456)より低いscoreでの更新 → 拒否
  //    updateではcreatedAtを既存値のまま送る必要がある（ルールで変更不可）
  const existing = await getDoc(UID_A, OWNER);
  const createdAt = existing.body.fields.createdAt; // {timestampValue: ...}
  r = await commit(
    [createWrite(UID_A, validFields({ score: { integerValue: '100' }, createdAt }),
      { exists: true, transforms: ['updatedAt'] })],
    fakeToken(UID_A)
  );
  check('6. 低いscoreでの上書きを拒否', r.status === 403, `status=${r.status}`);

  // 6b. 高いscoreでの更新 → 許可
  r = await commit(
    [createWrite(UID_A, validFields({ score: { integerValue: '999999' }, createdAt }),
      { exists: true, transforms: ['updatedAt'] })],
    fakeToken(UID_A)
  );
  check('6b. 高いscoreでの更新を許可', r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

  // 6c. createdAtの改ざん（transformで現在時刻に変更） → 拒否
  r = await commit(
    [createWrite(UID_A, validFields({ score: { integerValue: '1000000' } }),
      { exists: true, transforms: ['createdAt', 'updatedAt'] })],
    fakeToken(UID_A)
  );
  check('6c. update時のcreatedAt変更を拒否', r.status === 403, `status=${r.status}`);

  // 7. delete → 拒否（本人でも不可）
  r = await commit([{ delete: docName(UID_A) }], fakeToken(UID_A));
  check('7. deleteを拒否', r.status === 403, `status=${r.status}`);

  // 8. limitが大きすぎるlist(200) → 拒否 / limit 50 → 許可（未ログインでも読める）
  let q = await runQuery(200, null);
  check('8a. limit=200のlistを拒否', q.denied, `status=${q.status}`);
  q = await runQuery(50, null);
  check('8b. limit=50のlist(未ログイン)を許可', !q.denied, `status=${q.status} ${JSON.stringify(q.body).slice(0, 200)}`);
  q = await runQuery(null, null);
  check('8c. limitなしのlistを拒否', q.denied, `status=${q.status}`);

  // 9. gameVersion不一致 → 拒否（世代管理）
  r = await commit(
    [createWrite(UID_B, validFields({ gameVersion: { stringValue: '2.0.0' } }))],
    fakeToken(UID_B)
  );
  check('9. 古いgameVersionを拒否', r.status === 403, `status=${r.status}`);

  // 10. 余計なフィールド → 拒否
  r = await commit(
    [createWrite(UID_B, validFields({ email: { stringValue: 'a@example.com' } }))],
    fakeToken(UID_B)
  );
  check('10. スキーマ外フィールド(email)を拒否', r.status === 403, `status=${r.status}`);

  // 11. playDurationMs範囲外 → 拒否
  r = await commit(
    [createWrite(UID_B, validFields({ playDurationMs: { integerValue: '100000' } }))],
    fakeToken(UID_B)
  );
  check('11. 曲長と乖離したplayDurationMsを拒否', r.status === 403, `status=${r.status}`);

  // 12. 許可外のleaderboardIdへの読み書き → 拒否
  const otherDoc = docName(UID_A).replace(BOARD, 'other_board_v9');
  r = await commit([{
    update: { name: otherDoc, fields: validFields() },
    updateTransforms: [
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ],
    currentDocument: { exists: false },
  }], fakeToken(UID_A));
  check('12. 許可外leaderboardIdへの書き込みを拒否', r.status === 403, `status=${r.status}`);

  console.log(`\n結果: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('テスト実行エラー（エミュレータは起動していますか？）:', e.message);
  process.exit(1);
});
