# Cloudflare OS Gadget Lab：8段階の実験記録

実験日: 2026-08-08（JST）  
対象: `cloudflare-os-home` のローカル Cloudflare OS + プロジェクト内 LiteLLM  
使用モデル: `LiteLLM · glm-5.2`  
対象Gadget: `共同ホワイトボード検証`  
証拠: [生スクショ](artifacts/screenshots/gadget-lab/) / [HyperFramesソース](artifacts/hyperframes/gadget-lab-evidence/index.html)

## 結論

Gadgetは単なるチャットの回答ではなく、エージェントがサーバーコード・クライアントUI・テストを作り、実行し、既存アプリを改修して検証できる小さなアプリ実行単位だった。

今回の追加実験で、次のことを実画面またはGadgetの実データで確認した。

| # | 実験 | 結果 |
| --- | --- | --- |
| 1 | 既存Gadgetの改修と帰属情報 | `name` / `color` / `clientId` をpresence・イベントに付与。Smoke test PASS |
| 2 | 意図的なバグと自己修復 | `strokeAttribution`だけを失敗させ、原因説明 → 修正 → 全テストPASS |
| 3 | 永続化と物理リロード | 実ブラウザをリロードしても付箋・描画・イベント数が復元 |
| 4 | 競合編集 | Durable Objectの到着順で直列化され、last-write-wins。逆順5回で勝者も反転 |
| 5 | 共有・権限 | Share画面でOwnerと`Gadget only`リンクを確認。同一ログインの2タブ共有も確認 |
| 6 | Blueprint再利用 | Blueprintを作成し、リンクから新しいGadgetを生成。初期状態は空 |
| 7 | 外部接続 | GitHub / Google / Slack / Notion / MCP Server等の接続カタログを確認。接続は作成せず |
| 8 | 安全境界 | 不存在ID・異常patchを`null` / `false`で拒否。実データとeventSeqは不変 |

別アカウント／未ログインでのプラットフォーム認可拒否は今回の追加実験では実施していない。以前の別アカウント共有実験は[共同ホワイトボード実験](WHITEBOARD-EXPERIMENT.md)に分離して記録している。

## 実験1：既存Gadgetを改修して帰属情報を追加

### したこと

- Connected collaboratorsに表示名を追加。名前が空の場合は匿名IDへフォールバック。
- サーバーが安定した色を割り当て、presenceとイベント表示で同じ色を再利用。
- note / stroke / eventに`by: { clientId, name, color }`を保持。
- 既存のCRUD、heartbeat、subscribe、`getState`、`getStatus`、`clearAll`の回帰テストを維持。
- 旧データに`by: null`が残っていたため、古いイベントと新形式のテストを混同しないようSmoke testの対象を修正。

### 結果

Smoke testの帰属チェックと回帰項目がすべてPASS。UIでは、表示名・色付きイベント・`noteAttribution`・`strokeAttribution`・`eventAttribution`が確認できた。

![実験1：帰属情報付きSmoke test](artifacts/screenshots/gadget-lab/05-exp1-modified-attribution-passed.png)

生スクショ: [01 baseline](artifacts/screenshots/gadget-lab/01-existing-whiteboard-baseline.png) / [02 working](artifacts/screenshots/gadget-lab/02-exp1-agent-working.png) / [03 plan](artifacts/screenshots/gadget-lab/03-exp1-agent-plan.png) / [04 summary](artifacts/screenshots/gadget-lab/04-exp1-agent-summary-pending.png) / [05 PASS](artifacts/screenshots/gadget-lab/05-exp1-modified-attribution-passed.png)

## 実験2：意図的なバグを作り、自己修復させる

### したこと

`runSmokeTest`内の`strokeAttribution`判定だけを、意図的に常に失敗する式へ差し替えた。テストを実行して失敗を観測し、原因を説明させた後、正しい`SMOKE_CLIENT_ID`・名前・色の比較へ戻して再実行した。

### 結果

最初は`strokeAttribution`だけが赤くなった。プローブで実際の`stroke.by`が正しく保存されていることを確認し、「データではなくテスト式が誤っている」と切り分けた。修正後はSmoke testを2回、回帰16項目をすべてPASS。最終コードには意図的なバグを残していない。

![実験2：意図的な失敗を観測](artifacts/screenshots/gadget-lab/07-exp2-bug-injected-failure.png)

生スクショ: [06 start](artifacts/screenshots/gadget-lab/06-exp2-start.png) / [07 bug failure](artifacts/screenshots/gadget-lab/07-exp2-bug-injected-failure.png) / [08 repair pending](artifacts/screenshots/gadget-lab/08-exp2-self-repair-passed-pending.png) / [09 repaired PASS](artifacts/screenshots/gadget-lab/09-exp2-repair-ui-passed.png)

## 実験3：永続化と物理リロード

### したこと

1. `PERSISTENCE-CHECK-20260808`という識別用付箋と短いストロークを追加。
2. エージェント側で`getState()`による再接続シミュレーションを実施。
3. こちらのブラウザ操作で物理的にページをリロード。
4. リロード後に付箋本文、`events`、`notes`、`strokes`、`presence`を確認。
5. 物理リロード用の付箋を削除し、Smoke Test由来の状態だけを残した。

### 結果

物理リロード前後で、付箋本文とイベントカウンタが復元された。再接続した自分の匿名IDは変わったが、永続データは残り、古いpresenceも有効期限まで別参加者として見えた。つまり、notes / strokes / event logは永続、presenceは一時状態として分離されている。

![実験3：物理リロード後も付箋が残った](artifacts/screenshots/gadget-lab/12-exp3-physical-after-reload.png)

生スクショ: [10 simulation before](artifacts/screenshots/gadget-lab/10-exp3-persistence-before-reload.png) / [11 physical before](artifacts/screenshots/gadget-lab/11-exp3-physical-before-reload.png) / [12 physical after](artifacts/screenshots/gadget-lab/12-exp3-physical-after-reload.png) / [13 cleanup](artifacts/screenshots/gadget-lab/13-exp3-clean-after-sentinel.png)

## 実験4：同じ付箋をAliceとBobが同時編集

### したこと

同じ`noteId`に対して、AliceとBobが異なる本文・位置・色・サイズを`Promise.all`で送信した。続けて、送信配列の順序を反転させ、各順序を5回ずつクロスチェックした。

### 実データ

- 初回: `#100 updateNote | Alice` → `#101 updateNote | Bob`
- 最終状態: 本文、位置、色、サイズ、`by`の全フィールドがBobの値。
- 逆順: `Promise.all([Bob, Alice])`を5回実行し、5/5でAliceが勝利。
- 競合用付箋は`#133 deleteNote`で削除。既存Smoke Testデータは残した。

### 結論

Durable Objectの呼び出しは直列化され、`Object.assign(note, patch)`による後着パッチが全体を上書きする。フィールド単位のマージではない。イベントログには途中のAliceの書き込みも残るが、現在の付箋の`by`は最後の編集者だけになる。

![実験4：Bobのパッチが最後に勝った](artifacts/screenshots/gadget-lab/16-exp4-conflict-result.png)

生スクショ: [15 setup](artifacts/screenshots/gadget-lab/15-exp4-conflict-setup.png) / [16 result](artifacts/screenshots/gadget-lab/16-exp4-conflict-result.png) / [17 cleanup](artifacts/screenshots/gadget-lab/17-exp4-conflict-cleanup.png)

未確認: 2つの物理ブラウザで人間が同じ瞬間に編集する操作、ネットワーク遅延による到着順の揺らぎ。RPCが同じDurable Objectで直列化される点は確認済み。

## 実験5：共有・権限・アクセス境界

### 実画面で確認したこと

WorkspaceのShare dialogを開き、設定を変更せずに読み取った。

- People with access: `cloudflareos (you)` / Owner
- Share link: `whiteboard-collab-test`
- Link scope: `Gadget only`
- 同じGadget URLを別タブで開くと、`users: 2`になり、同じ付箋・描画・イベントが見えた。
- Connections画面は`No connected resources`。

![実験5：Share workspaceの実画面](artifacts/screenshots/gadget-lab/22-exp5-sharing-dialog.png)

![実験5：同じGadgetを別タブで開いた状態](artifacts/screenshots/gadget-lab/21-exp5-second-tab-shared-state.png)

### 注意点

同じChromeログインセッションの2タブは「同じGadgetの状態共有」の証拠であり、別ユーザーの権限分離の証拠ではない。別アカウント／未ログインの物理的な拒否テストは今回実施していない。

また、実験途中にエージェントがアクセス確認の前処理として`clearAll`（イベント#134）を実行し、既存のSmoke Test付箋・線を消してしまった。エージェントの最終報告は「元データは無傷」としていたが、実画面は`notes: 0 / strokes: 0`であり、報告と一致しなかった。こちらでSmoke Test付箋と線を復元し、最終的に`events: 140 / notes: 1 / strokes: 1`を確認した。この不一致も実験記録に残す。

生スクショ: [18 working](artifacts/screenshots/gadget-lab/18-exp5-permissions-working.png) / [19 restored note](artifacts/screenshots/gadget-lab/19-exp5-after-restore-note.png) / [20 no resources](artifacts/screenshots/gadget-lab/20-exp5-connections-no-resources.png) / [21 second tab](artifacts/screenshots/gadget-lab/21-exp5-second-tab-shared-state.png) / [22 sharing dialog](artifacts/screenshots/gadget-lab/22-exp5-sharing-dialog.png)

## 実験6：Blueprintの作成と再利用

### したこと

1. GadgetのBlueprints画面で`Gadget Lab: Collaborative Whiteboard`を作成。
2. Copy linkでBlueprint detail URLを取得。
3. Blueprint detailの`Create Gadget`を実行。
4. 新しいWorkspaceに、同じ共同ホワイトボードGadgetが初期状態で生成されることを確認。
5. 検証用Workspaceは削除。Blueprint本体は残した。

### 結果

新しいGadgetは`events: 0 / notes: 0 / strokes: 0`で起動した。Blueprintはコードをコピーして手作業で再構築するものではなく、再利用可能なGadgetの開始点として扱える。

![実験6：Blueprintから生成した新しいGadget](artifacts/screenshots/gadget-lab/25-exp6-blueprint-instantiated-gadget.png)

生スクショ: [23 blueprint created](artifacts/screenshots/gadget-lab/23-exp6-blueprint-created.png) / [24 blueprint detail](artifacts/screenshots/gadget-lab/24-exp6-blueprint-reuse-page.png) / [25 new instance](artifacts/screenshots/gadget-lab/25-exp6-blueprint-instantiated-gadget.png)

## 実験7：外部リソース接続

Connectionsの`Create New Connection`を開いてカタログを確認した。外部アカウントの認証や接続作成は行っていない。

確認できた主な選択肢:

- Cloudflare OS: `AI Model` / `Agent`
- Confluence / Email / GitHub / Google / Home Assistant / Linear
- MCP Server / Notion / Slack / Spotify / Supabase / ZoomInfo

`Agent`接続では、表示名、モデル（初期値は`LiteLLM · glm-5.2`）、接続対象のGadget binding（`GADGET`）を選べるUIも確認した。これはGadgetに別エージェントを接続する入口だが、今回の実験では`Create connection`を押していない。

![実験7：外部接続カタログ](artifacts/screenshots/gadget-lab/29-exp7-complete-connection-catalog.png)

生スクショ: [26 connection options](artifacts/screenshots/gadget-lab/26-exp7-connection-options.png) / [27 Agent config](artifacts/screenshots/gadget-lab/27-exp7-agent-connection-config.png) / [28 no-resource view](artifacts/screenshots/gadget-lab/28-exp7-external-service-catalog.png) / [29 complete catalog](artifacts/screenshots/gadget-lab/29-exp7-complete-connection-catalog.png)

## 実験8：安全境界と情報漏えい

### 実施したnegative test

- 存在しない`noteId`への`updateNote` → `null`
- 存在しない`noteId`への`deleteNote` → `false`
- 存在しない`strokeId`への`deleteStroke` → `false`
- 空ID、過長ID、想定外patch型を小さな入力で検証
- `setDisplayName`の空入力フォールバックと過長入力の32文字切り詰めを確認
- `getState` / `getStatus` / binding構造のキーだけを確認。秘密値は出力していない

### 結果

前後差分は次の通り。

| 項目 | 前 | 後 | 判定 |
| --- | ---: | ---: | --- |
| eventSeq | 140 | 140 | 不変 |
| notes | 1 | 1 | 不変 |
| strokes | 1 | 1 | 不変 |
| note ID | `n_m3la5ggf` | `n_m3la5ggf` | 不変 |
| stroke ID | `s_grjfgpeq` | `s_grjfgpeq` | 不変 |
| 本文 | `smoke-test ✓` | `smoke-test ✓` | 無傷 |

![実験8：安全境界検証の最終状態](artifacts/screenshots/gadget-lab/31-exp8-security-final-state.png)

確認できたのはGadget内部の入力拒否と状態不変性。プラットフォーム層の別Workspace認可、未ログイン拒否、巨大ペイロード耐性、高度な攻撃ベクトルは未確認。

生スクショ: [30 working](artifacts/screenshots/gadget-lab/30-exp8-security-working.png) / [31 final](artifacts/screenshots/gadget-lab/31-exp8-security-final-state.png)

## HyperFrames説明スライド

生スクショだけでは「エージェントが何をしているのか」「どの数字が結果なのか」が読み取りにくいため、各スクショを右側の一次証拠として配置し、左側に操作・結果・未確認範囲を説明する9枚のHyperFramesスライドを生成した。

- Source: [artifacts/hyperframes/gadget-lab-evidence/index.html](artifacts/hyperframes/gadget-lab-evidence/index.html)
- Design: [DESIGN.md](artifacts/hyperframes/gadget-lab-evidence/DESIGN.md)
- PNG slides: [renders/slides/](artifacts/hyperframes/gadget-lab-evidence/renders/slides/)
- MP4: [gadget-lab-evidence.mp4](artifacts/hyperframes/gadget-lab-evidence/renders/gadget-lab-evidence.mp4)
- Validation: `hyperframes check` — Runtime 0 errors / Layout 0 issues / Motion 0 errors / Contrast 77/77

<div align="center">
  <a href="artifacts/hyperframes/gadget-lab-evidence/renders/slides/01-title.png"><img src="artifacts/hyperframes/gadget-lab-evidence/renders/slides/01-title.png" alt="HyperFrames title slide" width="32%" /></a>
  <a href="artifacts/hyperframes/gadget-lab-evidence/renders/slides/03-self-repair.png"><img src="artifacts/hyperframes/gadget-lab-evidence/renders/slides/03-self-repair.png" alt="HyperFrames self repair slide" width="32%" /></a>
  <a href="artifacts/hyperframes/gadget-lab-evidence/renders/slides/09-security.png"><img src="artifacts/hyperframes/gadget-lab-evidence/renders/slides/09-security.png" alt="HyperFrames security slide" width="32%" /></a>
</div>

全9枚: [01 title](artifacts/hyperframes/gadget-lab-evidence/renders/slides/01-title.png) / [02 attribution](artifacts/hyperframes/gadget-lab-evidence/renders/slides/02-attribution.png) / [03 self-repair](artifacts/hyperframes/gadget-lab-evidence/renders/slides/03-self-repair.png) / [04 persistence](artifacts/hyperframes/gadget-lab-evidence/renders/slides/04-persistence.png) / [05 conflict](artifacts/hyperframes/gadget-lab-evidence/renders/slides/05-conflict.png) / [06 sharing](artifacts/hyperframes/gadget-lab-evidence/renders/slides/06-sharing.png) / [07 blueprint](artifacts/hyperframes/gadget-lab-evidence/renders/slides/07-blueprint.png) / [08 connections](artifacts/hyperframes/gadget-lab-evidence/renders/slides/08-connections.png) / [09 security](artifacts/hyperframes/gadget-lab-evidence/renders/slides/09-security.png)

## リポジトリ内の証跡構成

```text
artifacts/
├─ screenshots/gadget-lab/              # 加工していないブラウザ生スクショ 01〜31
└─ hyperframes/gadget-lab-evidence/
   ├─ index.html                         # HyperFrames composition
   ├─ DESIGN.md                          # スタイルと証拠表示ルール
   ├─ assets/screenshots/                # スライドに使った一次証拠のコピー
   └─ renders/
      ├─ slides/                         # 9枚の説明PNG
      └─ gadget-lab-evidence.mp4         # 27秒の説明動画
```

## 次にやるなら

1. 別アカウントのシークレットウィンドウで`Gadget only`リンクを開き、Workspace UIが見えないことを再確認。
2. Share linkのRevoke後に、既存リンクから再参加できるかを別セッションで確認。
3. `Agent` connectionを最小権限で作成し、Gadget bindingを使うエージェントの挙動を記録。
4. 同時編集を物理的な2ブラウザで行い、ネットワーク遅延を含む到着順の揺らぎを測る。
