# AD BREAKER — 広告処理リズムゲーム

画面に次々ポップアップする広告バナーの「×印」を、BGM（156 BPM）に合わせてタップして消していくスマホ向けブラウザリズムゲームです。
Vanilla HTML/CSS/JavaScript のみで実装した静的サイトで、GitHub Pages で公開しています。

## 🎮 公開URL

**https://2727-art.github.io/anju-musicgame/**

スマホ縦画面推奨。TAP TO START でBGMが再生されます。

## 素材・広告表現について

- ゲーム内に登場する広告バナーは、**すべてゲーム演出用に作られた架空の広告**です。実在の企業・商品・サービスとは関係ありません（ゲーム内・[privacy.html](privacy.html) にも明記）
- BGM・背景・広告バナー画像は本プロジェクト用の素材です。再配布・転用はご遠慮ください
- プライバシーについて: [privacy.html](privacy.html)
- お問い合わせ・ランキングデータの削除依頼: [GitHub Issues](https://github.com/2727-art/anju-musicgame/issues)

## 起動方法

ES Modules を使っているため、**ローカルファイル直開き（file://）では動きません**。必ずローカルサーバーで起動してください。

```
cd H:\claude\リズムゲーム

# どちらか一方でOK
python -m http.server 8000
# または
npx serve .
```

ブラウザで http://localhost:8000 を開き、**TAP TO START** をタップするとBGMが再生されてゲーム開始です。
スマホ実機で試す場合は、PCと同じWi-Fiに繋いで `http://<PCのIPアドレス>:8000` を開いてください。

### 広告画像を追加・変更したとき

`広告バナー/` フォルダの中身を変えたら、マニフェストを再生成してください（png / jpg / jpeg / webp 対応）。

```
node tools/generateManifest.mjs
```

> ⚠️ 広告画像が1枚も読み込めない場合、ゲームは自動生成の仮バナー4種で動作します（コンソールに警告が出ます）。

## 遊び方

- 広告バナーの隅か中央にある **×印** をタップすると広告が消えてスコア獲得
- BGMの拍に近いタイミングほど高得点（PERFECT ±80ms / GREAT ±140ms / GOOD ±220ms / それ以外はOK）
- **同じ色の×印を連続で押す**とスコア倍率とFEVERゲージ上昇量がアップ（最大×1.7）
- コンボでも倍率アップ（1 + combo×0.01、最大×3.0）
- FEVERゲージが100%になると **FEVER TIME（10秒）**。×印がすべて金色になり、広告が絶え間なく湧く
- FEVER中のスコアは **FEVER BONUS** に蓄積され、終了時にまとめて加算（1消去 5000 + combo×100、PERFECTは×1.2）
- 広告を放置しすぎるとMiss扱いで自動消滅し、コンボがリセットされる

## Phase 4A で追加した機能（演出・脳トレ強化）

**今回はスコア計算式・ランク閾値・FEVERゲージ・同色倍率・ランキング仕様を一切変えていません。** `leaderboardId`（adbreaker_song001_v1）・`gameVersion`（3.0.0）・Firestore送信payload・Security Rules はPhase 3.6のままです。

- **色付き流れ星（TrailManager）**: 同色ストリーク中、前回同色タップ位置から今回位置へ×印と同色の流れ星が走る。ストリークが伸びるほど豪華に（2=短い尾 → 3-4=星粒 → 5-6=明確な流れ星 → 7+=光の軌道+リング）。1枚のCanvasレイヤー（バナーより上・×印より下）に上限付き粒子で描画
- **同色タップ音の音階上昇**: 同色2連続以降、タップ音がCメジャーペンタトニックで1段ずつ上昇（streak 1〜7）。8連続以上は上限音+装飾音。初回タップは従来の判定SE
- **FEVER中の金色流れ星**: タップごとに金色スパーク＋前回タップ位置からの金色流れ星。タップ数が増えるほど星屑が増え、**FEVER BONUSカウンターへ星屑が吸い込まれる**。FEVER終了時は画面上の残り星屑がカウンターへ収束。SEも金色専用の8段上昇ラン
- **TARGET COLOR CHALLENGE（脳トレ）**: 通常時のみ、16拍のあいだ「TARGET COLOR」が表示される。ターゲット色の×を押すと TARGET HIT!（Brain Chain加算・専用SE）、違う色を押すと BRAIN RESET（**Brain Chainのみリセット。通常コンボ・スコアは一切影響なし。広告も通常通り消える**）。FEVER中・INTRO/DROP/FINAL CHORUS/OUTROでは発生しない。ターゲット色の×印には控えめなパルスリング＋パネルには色名を文字でも表示（色覚差配慮）
- **Brain Trainingリザルト**: 曲終了時に TARGET HIT / MAX CHAIN / RESET をローカル表示。**ランキングスコア・ローカルベスト・Firestoreには影響も送信もしない**
- **設定追加**: 「流れ星エフェクト ON/OFF」「TARGET COLOR ON/OFF」（localStorage保存）
- **Miss微調整**: 放置Miss時に小さなノイズ粒子を追加（既存の震え→ノイズ消滅演出はそのまま）

### 星座コンプリート演出

×印をタップするたび、タップ位置が「星」になり輝くラインで順につながっていきます（**どの色でもOK**。広告を消したことの副産物で、スコアには一切関与しません）。星は自分の×の色を保ち、同色で作ると純色の星座、混色だと**セグメントごとにグラデーションする虹色の星座**になります。

**7個目の星で星座が完成**: 描いた軌跡の形をリサンプル＋正規化（重心・スケール・回転8方位・鏡像・描き順を吸収）して**最も形が近い12星座**を判定し、

1. プレイヤーの線が白熱フラッシュ →「♏ さそり座 COMPLETE!!」＋天球チャイム
2. マッチした星座の**「本来の形」が淡青白のゴーストで重なって浮かび上がる**（描いた位置・大きさ・向きに位置合わせ）
3. プレイヤーの線がゴーストへ「昇華」してフェード
4. ゴーストが縮みながら**画面左下のコレクションへ飛んでいき**、星座チップ（♈♉…）が点灯
5. 同時に**今日の運勢風コメント**（「今日のラッキーカラーは赤！」等・占い広告パロディ調）を表示。ラッキーカラーは実際に描いた星の最頻色と連動

Missしても星座は壊れません（消せなかった広告が星にならないだけ）。FEVER中は休止。リザルトに「星座コンプリート 3 ♈♋♏」のようにローカル表示（**ランキングには送信しません**）。閾値は `config.js` の `constellation.starsToComplete`、星座形状は `src/zodiacMatcher.js`、運勢テキストは `src/fortuneTeller.js` で調整できます。流れ星エフェクトOFFで星座も無効になります。

**永続コレクションと12星座コンプリート**: 集めた星座はlocalStorage（`adbreaker.zodiac.v1`）にプレイをまたいで保存され、次のプレイでは左下に薄点灯で表示されます（そのプレイで完成すると明るく点灯）。**12種類そろった瞬間に「✨ 12星座コンプリート!! ✨」の特別演出**（全画面スターバースト・金シャワー・特別ファンファーレ・チップ順次バウンス）が発動し、周回数がカウントされてコレクションは次の周へリセットされます。スコア・ランキングへの影響はありません。

**リザルトの「今日の運勢」カード**: 曲終了後のリザルトに占いカードを表示します。
- **本日の星回り** = そのプレイで最も多く完成した星座（未完成の日は、最もタップした色を四元素〔赤=火/青=水/緑=地/黄=風〕に対応させて日替わりで1座を導出 — 毎回必ず占えます）
- **総合運**（★3〜5）= 星座完成数・最大ストリーク・12星座達成から加点（辛口にしない）
- **星座別の占い文**（12種・`src/fortuneTeller.js`）＋ **ラッキーカラー**（実際に最もタップした色）＋ **ラッキーアイテム**（日付シードで決定論的な日替わり）
- 12星座コンプリート達成時・達成済み周回数もここに表示

### 演出強化チューニング（パチンコ的リーチ演出）

ハイパーユーロビートのBGMに合わせて演出を「過剰」側へ調整:

- タップスパーク粒子を増量・大型化。同色5連続で**二重流れ星＋同色ネオン縁フラッシュ**、7連続で**三連流れ星＋スターバースト＋リング**、以降5刻みで「n CHAIN!!」表示
- 音階上昇を**2オクターブ12段**に拡張。5連続で完全5度、7連続で低音支えの**和音化**、13連続以上は装飾グリス
- **REACH演出**: FEVERゲージ90%で「REACH!!」表示＋ゲージが虹色に脈動＋期待感ライザーSE（1チャージ1回）
- **FEVER中**: タップと無関係に金色流星群が画面を流れ続け、**156BPMの拍に同期して画面周辺が金色に脈動**。タップ音に低音キックの打撃感を追加
- REDUCED設定では流星群の頻度半減・脈動は静的表示になり、粒子上限も従来通り適用

パフォーマンス: 粒子上限は通常300 / FEVER600 / REDUCED250 / Trail OFFで0。低スペック端末では設定から「エフェクト量 REDUCED」または「流れ星エフェクト OFF」を推奨します。

> **今後Brain Challengeをスコア化する場合の注意**: スコア仕様が変わるため、`leaderboardId` を `adbreaker_song001_v2` に変更し、`gameVersion` と `firestore.rules` の許可値も同時に更新して、旧スコアと混ざらないようにすること。

## Phase 3 で追加した機能（Firebaseランキング）

- **AD BREAKER Global Ranking**: Firestoreに1ユーザー1件のベストスコアを保存し、TOP50を表示
- **匿名認証**（Firebase Anonymous Auth）: 送信・ランキング表示時に自動サインイン。メールアドレス等は不要・保存しない
- **スコア送信**: リザルト画面の「🏆 ランキングに送信」を押したときだけ送信（自動送信なし）。送信前にニックネーム入力＋保存内容の説明を表示
- **自己ベスト管理**: 既存ベスト未満のスコアは送信せず「自己ベスト未更新」と表示。Security Rules側でも低いスコアでの上書きを拒否
- **プレイヤーネーム**: localStorageに保存。1〜12文字、制御文字・不可視文字・`<>`を除去、簡易NGワード伏せ字。ランキング表示は `textContent` のみ（XSS対策）
- **Security Rules**: スキーマ・型・上限・世代（gameVersion/songId/bpm/leaderboardId）を検証。削除禁止。**エミュレータで16項目のテストを実施済み**（`tools/testRules.mjs`）
- **App Check導入準備**: `firebaseConfig.js` の `appCheckConfig` で reCAPTCHA Enterprise / v3 を設定可能。未設定でもゲーム・ランキングUIは壊れない
- **プライバシー説明ページ**: [privacy.html](privacy.html)（タイトル・送信モーダル・ランキングからリンク）
- **フェイルセーフ**: `firebaseConfig.js` が無い / SDK読み込み失敗 / 認証失敗 でもゲーム本体は完全に動作。ランキングUIには短い説明を表示

### ランキングの仕組み

- Firestoreパス: `leaderboards/{leaderboardId}/entries/{uid}`（uid = 匿名認証ID = ドキュメントID）
- `leaderboardId` は `src/config.js` の `leaderboard.id`（現在 `adbreaker_song001_v1`）
- **スコア仕様を変えたら leaderboardId を変えること**（古いスコアと混ざらないようにする世代管理）。あわせて `gameVersion` と `firestore.rules` 内の許可値も更新する
- 取得クエリ: `orderBy('score','desc') + orderBy('updatedAt','asc') + limit(50)`（同点は先着順。複合インデックスは `firestore.indexes.json`）
- クライアント側でも送信前に妥当性チェック（上限は `config.js` の `leaderboard.limits`。**`firestore.rules` の値と揃えること**）

### Firebase SDK

- **Modular SDK v10.12.2** を CDN ESM（`https://www.gstatic.com/firebasejs/10.12.2/…`）から動的importしています（compat形式・npmビルド不要）。バージョンを上げる場合は `src/firebaseApp.js` の `SDK_VERSION` を変更してください
- SDKはランキング機能を初めて使う時にだけ読み込まれます（ゲーム起動は重くならない）

## Firebaseセットアップ手順（ランキングを有効にする場合）

> **重要**: `firebaseConfig` は「秘密鍵」ではなく公開前提の識別子です。GitHub Pagesで公開すれば誰でも見られます。プロジェクトを守るのは **Security Rules** と **App Check** です。**テスト用の緩いルール（allow read, write: if true 等）を本番に残さないでください。**

### 1. Firebaseプロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) で「プロジェクトを追加」
2. プロジェクト設定 → 全般 → 「ウェブアプリを追加」→ 表示された `firebaseConfig` を控える

### 2. Anonymous Auth 有効化

1. Console → 構築 → Authentication → 「始める」
2. ログイン方法 → 「匿名」を有効化

### 3. Firestore 作成

1. Console → 構築 → Firestore Database → 「データベースを作成」
2. **本番モード**（ロックダウン）で開始（ルールは次項でdeployする）
3. ロケーションを選択（例: `asia-northeast1`）

### 4. firebaseConfig.js 作成

```
copy src\firebaseConfig.example.js src\firebaseConfig.js
```

を実行し、`src/firebaseConfig.js` の `firebaseConfig` をConsoleの値で書き換えます。`emulatorConfig.enabled` は本番では必ず `false` にしてください。

### 5. Security Rules / インデックスの deploy

```
npm install -g firebase-tools   # 初回のみ
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

（`firebase init` は不要です。このリポジトリの `firebase.json` / `firestore.rules` / `firestore.indexes.json` をそのまま使えます）

### 6. App Check 設定（本番公開前に必須）

> **現在の状態（Phase 3.6）**: reCAPTCHA Enterpriseサイトキー作成済み・Firebase App Checkへのアプリ登録済み・`appCheckConfig.enabled: true` でトークン発行を確認済み。**enforcement（適用）はまだOFF**です。Console → App Check のメトリクスで「検証済みリクエスト」の割合を数日確認し、問題なければ Firestore への enforcement をONにしてください。ONにした後はランキングの取得・送信を必ず再確認すること。

1. [reCAPTCHA Enterprise](https://cloud.google.com/recaptcha-enterprise)（または reCAPTCHA v3）でサイトキーを作成し、公開ドメイン（GitHub Pagesのドメイン）を登録
2. Console → 構築 → App Check → アプリを登録 → reCAPTCHA Enterprise プロバイダにサイトキーを設定
3. `src/firebaseConfig.js` の `appCheckConfig` を設定:
   `enabled: true, provider: "recaptcha-enterprise", siteKey: "...", debug: false`
4. 動作確認後、Console → App Check → Firestore の **enforcement（適用）を有効化**
5. ローカル開発では `debug: true` にするとdebugトークンが使えます（コンソールに表示されるトークンをApp Checkの「デバッグトークン」に登録）

Phase 3ではApp Check未設定でもランキングは動きますが、**本番公開時は必ず有効化してください**。未設定のままだと、ルールの範囲内での自動投稿（bot）を防げません。

### 7. GitHub Pages 公開時の注意

- `src/firebaseConfig.js` もリポジトリに含めて公開します（**公開される前提の値**であり秘密鍵ではありません。守るべきものは Security Rules と App Check です）
- 公開前チェックリスト:
  - [ ] `firestore.rules` をdeployした（テスト用ルールが残っていない）
  - [ ] `emulatorConfig.enabled: false` になっている
  - [ ] App Check を有効化した（enforcement はメトリクス確認後にON。下記参照）
  - [ ] `privacy.html` の削除依頼連絡先を**本番用に書き換えた**
  - [ ] Authentication → 設定 → 承認済みドメイン に GitHub Pages のドメイン（`username.github.io`）を追加した
- **App Check enforcementの前にメトリクス確認**: enforcementを即ONにせず、まずApp Checkを有効化した状態で数日運用し、Console → App Check のメトリクスで「検証済みリクエスト」の割合を確認してから適用してください。いきなりONにすると正規ユーザーのリクエストまで弾く事故が起きやすいです
- Firestoreのロケーションは **nam5 (北米マルチリージョン)** です。日本からのアクセスはやや遅延がありますが、ランキング用途では問題ありません（ロケーションは後から変更不可）

### 本番接続確認手順（Phase 3.5で実施済み）

1. `src/firebaseConfig.js` を本番値に切り替え（`emulatorConfig.enabled: false` を確認）
2. `firebase deploy --project anjumusicgme --only firestore:rules,firestore:indexes`
3. Console → Authentication → 「始める」→ ログイン方法 → **匿名を有効化**（Firestoreより先に必要）
4. ローカルサーバー（`python -m http.server 8000`）で1曲プレイ → リザルト → 「ランキングに送信」
5. **初回送信で `leaderboards/adbreaker_song001_v1/entries/{uid}` が自動作成される**（コレクションの手動作成は不要・禁止）
6. Console → Firestore Database でentryドキュメントの全21フィールドを確認
7. 低スコア再送信 → 「自己ベスト未更新」表示・Firestore未更新を確認
8. 高スコア再送信 → score/updatedAt更新・createdAt維持を確認

### Firebase Emulator でのローカル検証

```
npm install -g firebase-tools   # 初回のみ（Java 11+ も必要）
firebase emulators:start --only firestore,auth --project demo-adbreaker
```

別ターミナルでルールテストを実行:

```
node tools/testRules.mjs
```

テスト内容（16項目）: 未ログイン書き込み拒否 / 自分のuidで作成許可 / 他人のuid拒否 / score型不正拒否 / score上限超過拒否 / 低スコア上書き拒否 / 高スコア更新許可 / createdAt改ざん拒否 / delete拒否 / limit>100のlist拒否 / limitなしlist拒否 / limit50許可 / 旧gameVersion拒否 / スキーマ外フィールド拒否 / プレイ時間乖離拒否 / 許可外leaderboardId拒否

ゲーム本体からエミュレータに接続するには `src/firebaseConfig.js` で `emulatorConfig.enabled: true` にし、`projectId` を `demo-` 始まりにします。

### Firebase Hostingへ移行する場合（メモ）

`firebase init hosting` で public をリポジトリルートに設定し `firebase deploy --only hosting`。GitHub Pagesと違いヘッダー制御やプレビューチャンネルが使えます。Phase 3ではGitHub Pagesのままで問題ありません。

### 不正対策の限界（Phase 3）

クライアントサイドのみの構成のため、以下は**防げません**。

- ルールの範囲内に収まる偽スコアの送信（クライアント検証・Rules検証・App Checkをすべて通る値の捏造）
- 改造クライアントでのプレイ

Security Rules＋App Checkで「範囲外の値」「スキーマ違反」「他人のスコア改ざん」「削除」「bot大量投稿（App Check有効時）」は防げます。**Phase 4でCloud Functions / Cloud Runによるサーバー側検証（seedとプレイログからのスコア再計算・リプレイ検証）を追加予定**です。カジュアルなランキングとして割り切ってください。

## Phase 2 で追加した機能

- **効果音（Web Audio API合成）**: 外部音源なしで、判定別タップ音（PERFECT/GREAT/GOOD/OK）・コンボ節目・同色ストリーク・FEVER開始/中/終了・Miss の10種を `OscillatorNode`/`GainNode`/`BiquadFilterNode` で生成。AudioContextはSTARTタップ時に初期化（自動再生制限対策）。音が鳴らせない環境でもゲームは止まりません
- **判定別フィードバック**: タップ位置に PERFECT!!/GREAT!/GOOD/OK、FEVER中は GOLD!!/FEVER +xxxx を表示（DOMプールで再利用）
- **コンボ演出**: 10/25/50/100、以降50刻みで中央に大型表示＋画面縁のネオンフラッシュ＋専用SE＋振動
- **同色ストリーク演出**: 3連続で小通知、5連続で強調表示、7連続以上でタップ位置に同色リング。切れたときは静かに表示が戻るだけ（ペナルティ演出なし）
- **ハプティクス**: `navigator.vibrate` 対応環境で、通常8ms / PERFECT 12ms / 節目20ms / FEVER開始 [30,40,30] / FEVER中10ms / Miss 20ms。設定でOFF可
- **Miss演出**: 放置広告が「閉じ損ねた」ようにブルっと震え、ノイズっぽく消えて小さくMISS表示。スコアペナルティなし（コンボのみリセット）
- **詳細リザルト**: ランク（S/A/B/C/D）・判定内訳・Miss数・消去広告数・FEVER統計・最大同色ストリーク・ローカルベスト更新表示
- **ローカルハイスコア**: localStorageに保存（下記参照）。**Firebaseは未実装です**
- **プレイログ**: 曲終了時にPhase 3送信用のプレイ結果オブジェクトを生成し `console.log('[PlayResult]', …)` で出力（送信はしない）
- **疑似ランダムシード**: ゲーム開始ごとに `runSeed` を生成し、デッキシャッフル・バナー配置・×印の色決定を seed付き乱数（mulberry32）で駆動。seedはデバッグ表示とリザルトに表示
- **設定画面**: START画面とプレイ中HUDの⚙から開けます（プレイ中は自動ポーズ）
- **デバッグ表示強化**: 曲時間 / 拍番号(beat index) / セクション / 広告数 / プール数 / seed

### 設定画面

| 項目 | 内容 |
|---|---|
| BGM音量 | 0〜100%（`audio.volume`） |
| SE音量 | 0〜100%（Web Audioマスターゲイン。変更時に確認音が鳴る） |
| ハプティクス | ON/OFF |
| エフェクト量 | NORMAL / REDUCED（REDUCEDはパーティクル減・リング/縁フラッシュ省略で軽量化） |
| デバッグ表示 | ON/OFF |

設定は `localStorage`（`adbreaker.settings.v1`）に保存され、次回起動時も引き継がれます。

### Web Audio / ハプティクスの対応差

- **iOS Safari**: `navigator.vibrate` 非対応のため振動しません（エラーにはなりません）。また `audio.volume` によるBGM音量変更をOSが無視するため、BGM音量スライダーが効かない場合があります。サイレントスイッチON時はBGM・SEとも無音になります
- **Android Chrome**: 振動・音量とも動作します
- SE・振動が使えない環境でも、ゲーム進行・スコアには影響しません

### ローカルハイスコアの保存内容

`localStorage` キー `adbreaker.best.v1` に以下を保存します（データ破損時はベストなし扱いで続行）。

```json
{
  "bestScore": 0, "bestRank": "D", "bestMaxCombo": 0,
  "bestClearedAds": 0, "bestFeverBonus": 0,
  "updatedAt": "ISO8601", "gameVersion": "2.0.0"
}
```

### ランク閾値（仮・config.jsで調整可）

S: 1,500,000 / A: 1,000,000 / B: 700,000 / C: 400,000 / D: それ未満

## 実装内容（Phase 1）

- スマホ縦画面向けUI（PCのマウスクリックでも動作、`pointerdown` ベース）
- `背景.png` 全画面背景、`bgm.mp3` をSTARTタップで再生（自動再生制限対策）
- 91枚の広告画像をプリロード（進捗バー表示）し、**シャッフルデッキ**として重複使用（使い切ったら再シャッフル）
- BGMの `currentTime` を時間源に `requestAnimationFrame` で進行するリズムクロック
- 曲セクション（INTRO〜OUTRO）ごとに広告の最低/最大枚数・湧き間隔（拍ベース）が変化
- 広告が0枚になる瞬間を作らない補充ロジック（消した直後に即補充）
- ×印はバナーとは別レイヤーで常に最前面・48pxヒットエリア・×印同士の重なり回避
- スコア / コンボ / 同色ストリーク / FEVERゲージ / FEVER BONUS / 現在セクションのHUD
- FEVER TIME（金色×・高密度湧き・金色爆発エフェクト・終了時カウントアップ精算＋画面発光）
- 広告バナーDOMのオブジェクトプール再利用（FEVER中の大量湧きでもDOMを使い捨てない）
- 一時停止（タブ非表示時も自動ポーズ）、曲終了時のリザルト画面
- 画面左下にデバッグ表示（曲時間 / セクション / 表示中広告数 / プール数）

## ファイル構成

```
index.html            エントリHTML（各画面・レイヤー構造）
styles.css            ネオン系ビジュアル・アニメーション
index.html            エントリHTML（各画面・レイヤー構造）
privacy.html          プライバシー説明ページ（Phase 3）
firebase.json         Firebase CLI設定（rules/indexes/emulator）（Phase 3）
firestore.rules       Firestore Security Rules（Phase 3）
firestore.indexes.json Firestore複合インデックス（Phase 3）
src/
  main.js             エントリポイント・ゲームループ・入力・HUD
  config.js           BPM・セクション・スコア・FEVER・ランクなど全設定値
  assetManifest.js    広告画像一覧（自動生成。手で編集しない）
  deck.js             91枚シャッフルデッキ（seed乱数対応）
  rhythmClock.js      BGM currentTime ベースのクロック＆拍判定
  bannerManager.js    バナー生成・配置・寿命・オブジェクトプール
  scoreManager.js     スコア・コンボ・同色ストリーク・判定統計
  feverManager.js     FEVERゲージ・FEVER TIME・BONUS精算・FEVER統計
  audioManager.js     Web Audio合成SE（Phase 2）
  hapticsManager.js   振動（Phase 2）
  effectManager.js    ポップテキスト・パーティクル・リング等のプール管理（Phase 2）
  settingsManager.js  設定のlocalStorage保存（Phase 2）
  localRecordManager.js ローカルハイスコア（Phase 2）
  playResultBuilder.js  プレイ結果オブジェクト生成（Phase 2）
  random.js           seed付き疑似乱数 mulberry32（Phase 2）
  firebaseApp.js      Firebase SDK遅延初期化・App Check・Emulator接続（Phase 3）
  firebaseConfig.example.js  Firebase設定テンプレート（Phase 3）
  firebaseConfig.js   実際のFirebase設定（ユーザーが作成。無ければランキング無効）
  leaderboardManager.js  ランキング取得・送信・妥当性チェック（Phase 3）
  playerNameManager.js   プレイヤーネーム管理・サニタイズ（Phase 3）
tools/
  generateManifest.mjs  広告バナー/ をスキャンして assetManifest.js を生成
  testRules.mjs         Firestore Security Rulesのエミュレータテスト（Phase 3）
広告バナー/            広告画像素材（91枚）
bgm.mp3               BGM（4:22 / 156BPM）
背景.png              背景画像
```

## GitHub Pages 公開手順

1. このフォルダをGitHubリポジトリにpush（`広告バナー/`・`bgm.mp3`・`背景.png` も含める）
2. リポジトリの Settings → Pages → Branch を `main` / `(root)` に設定
3. 公開URLにアクセス（日本語ファイル名はコード側で `encodeURIComponent` 済み）

## 失敗リクエストについての補足

- **リロード/リトライ時の `bgm.mp3 → 206 (ERR_ABORTED)`**: ページ再読み込みで取得途中の音声range取得が中断されるブラウザの正常挙動です。プレイ中の失敗リクエストとは別扱いで、再生には影響しません
- **`src/firebaseConfig.js → 404`（Firebase未設定時のみ）**: ランキングを開いた時に設定ファイルの有無を確認するための探索アクセスです。未設定の場合に1回だけ発生し、ゲームには影響しません

## 既知の課題

- リズム判定は「最寄りの拍」基準の簡易版（譜面なし）。セクション頭の拍ズレは未補正（境界は `config.js` に集約済みで、デバッグ表示のbeat indexを見ながら調整可能）
- BGMタイムラインのセクション境界は秒単位の目安値
- iOS Safariではハプティクス非対応・BGM音量スライダーが効かない場合あり
- seedはデッキ・配置・色決定に使用しているが、プレイヤーのタップ速度で補充タイミングが変わるため完全なリプレイ再現ではない
- ランキングの不正対策はSecurity Rules＋App Checkの範囲まで（上記「不正対策の限界」参照）
- ニックネームのNGワードフィルタは簡易版

## 次のPhase（Phase 4 予定）

- **サーバー側スコア検証**: Cloud Functions / Cloud Run 経由の送信に切り替え、seed＋プレイログからのスコア再計算・整合性チェック（判定内訳×倍率とスコアの照合、タップ間隔の統計チェック等）
- リザルトのSNSシェア
- 譜面的なスポーン（キメ拍に合わせた湧き）・難易度調整
- チュートリアル
