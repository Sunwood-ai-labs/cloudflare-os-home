# Cloudflare OS 共同ホワイトボード実験

実験日: 2026-08-08（JST）
対象: `cloudflare-os-home` のローカル Cloudflare OS + プロジェクト内 LiteLLM
使用モデル: `LiteLLM · glm-5.2`
公開経路: Tailscale Serve（tailnet限定）

## 先に結論

「共同ホワイトボード」はCloudflare OSに最初から固定で入っているホワイトボード機能ではない。

Cloudflare OSのエージェントに「共同ホワイトボードを作って」と依頼すると、エージェントが新しいGadget（小さなアプリ）を生成する。そのGadgetのサーバー側にDurable Objectベースの共有状態とイベント配信を実装し、クライアント側に付箋・描画・presence・スモークテストのUIを組み立てる、という位置付けである。

今回の実験では、次の範囲を実画面で確認できた。

| 項目 | 結果 |
| --- | --- |
| Gadgetをゼロから生成 | ✅ 確認 |
| 付箋の追加・編集 | ✅ UIで確認 |
| 付箋・描画のCRUD | ✅ エージェントの22項目スモークテストで確認 |
| サーバー側の共有状態 | ✅ `notes` / `strokes` として確認 |
| リアルタイム同期 | ✅ 2タブでタブBの付箋がタブAへ反映 |
| presence | ✅ 2タブでユーザー数2を確認 |
| 再読み込み後の保持 | ✅ 付箋・描画・イベント数が復元 |
| 共有リンク | ✅ `Gadget only` のリンク作成・参加フローを確認 |
| 別アカウントでのリンク参加 | ✅ 別ユーザーを作成し、共有リンクから参加 |
| 別ユーザーからのリアルタイム変更 | ✅ Collaboratorの付箋がOwnerへ反映 |
| `Gadget only` の権限 | ✅ Gadget操作は可能、Workspace編集UIは非表示 |

つまり、単純な「AIがHTMLを返しただけ」ではなく、共有状態を持つアプリをエージェントが生成し、そのアプリ自身が複数クライアントに更新を配信するところまで動いた。

## 実験に使った依頼

```text
Act as a coding agent, not a chat-only assistant.
Create a new Gadget named '共同ホワイトボード検証' from scratch.
This is a sequel experiment for Cloudflare OS. Build a genuinely collaborative whiteboard, not a static mockup.
Acceptance criteria:
1. A large whiteboard canvas where users can create, move, edit, and delete colored sticky notes.
2. A simple freehand drawing mode or shape/marker mode.
3. Shared server-side state and real-time updates so two browser sessions can see the same changes.
4. A visible collaborator/presence area and a last-change or event counter so collaboration can be verified.
5. Data remains after reload within the Gadget.
6. Add a small collaboration smoke-test or status panel and run a test.
Use the Gadget's normal server/client API and implement the app with the built-in agent tools.
Do not merely explain the design: create the files, execute the app/tests, inspect the result, and fix errors.
Leave the completed changes pending for review.
```

## 生成されたGadgetの構成

### `server.js` 相当

- Durable ObjectとしてGadgetサーバーを作成。
- 共有状態を概念的に `{ notes, strokes }` で保持。
- 付箋の追加・更新・削除、描画ストロークの追加・削除、全消去をRPCとして公開。
- 状態、イベント連番、イベントログをストレージへ保存。
- `subscribe(callback, clientId)` でクライアントを購読させ、変更を各購読者へ通知。
- `heartbeat()` とpresence一覧で接続中の参加者を表示。
- `getStatus()` と `runSmokeTest()` を備え、UIからサーバーの状態とテスト結果を確認できる。

### `client.js` 相当

- Select / Draw / Erase の3モード。
- 色選択と線幅スライダー。
- 付箋の追加、移動、本文編集、削除。
- SVGベースのフリーハンド描画。
- 右側にConnected collaborators、Recent events、Smoke testを表示。
- ヘッダーに `events` / `notes` / `strokes` / `users` を表示。

この構成は、エージェントが会話の最後に説明した内容だけでなく、画面上のCodeタブで確認できた差分と、実際に表示されたGadget UIを根拠にしている。

## エージェント実行の経過

### 1. 依頼からGadget生成へ

- [98-whiteboard-home.png](artifacts/screenshots/98-whiteboard-home.png): 生成前のホーム。
- [99-whiteboard-prompt.png](artifacts/screenshots/99-whiteboard-prompt.png): 共同ホワイトボードの依頼。
- [100-whiteboard-agent-start.png](artifacts/screenshots/100-whiteboard-agent-start.png): ワークスペース生成直後。
- [101-whiteboard-agent-progress.png](artifacts/screenshots/101-whiteboard-agent-progress.png): `共同ホワイトボード検証` Draftと`server.js`の生成。
- [102-whiteboard-agent-working.png](artifacts/screenshots/102-whiteboard-agent-working.png): Codeタブでサーバーコードをレビュー中。
- [103-whiteboard-code-generated.png](artifacts/screenshots/103-whiteboard-code-generated.png): `server.js` 241行の追加を確認。

### 2. 生成途中の失敗と自己修正

最初のクライアント書き込みは、エージェントが `writeFile` に `filename` だけを渡したため失敗した。これはGadget実装のバグではなく、エージェントツール呼び出しの引数ミスである。

その後、エージェントは正しいパラメータで `client.js` を書き直した。さらに、サーバーのスモークテストで `ctx.storage.get([keys])` の戻り値を誤って配列のように扱っていた問題を発見した。実際のログは次の通り。

```text
TypeError: Cannot set properties of undefined (setting 'n_87hg9rtr')
```

エージェントはストレージの戻り値を調査し、複数キー読み出しを個別の `get()` に変更し、`_loadedPromise` のロードガードと個別 `put()` に修正した。

- [104-whiteboard-agent-next-step.png](artifacts/screenshots/104-whiteboard-agent-next-step.png): クライアント書き込みエラー。
- [105-whiteboard-error-recovery.png](artifacts/screenshots/105-whiteboard-error-recovery.png): エラー原因を読んで修正中。
- [106-whiteboard-test-run.png](artifacts/screenshots/106-whiteboard-test-run.png): サーバーのエラーを取得して再検証へ進む状態。
- [107-whiteboard-auto-repair.png](artifacts/screenshots/107-whiteboard-auto-repair.png): `server.js` のストレージ処理を修正。
- [108-whiteboard-retest.png](artifacts/screenshots/108-whiteboard-retest.png): 修正後に22項目が通過し、Gadget UIが表示された状態。

### 3. 22項目スモークテスト

エージェントの実行結果は次の通りだった。

- Notes: create / move / edit / delete
- Freehand strokes: create / delete / color / width
- Real-time broadcast: 2 subscribers
- Presenceとevent counter
- Persistence: reload後の `getState()`
- `passed=true`
- Multi-client broadcast

UI上でも [109-whiteboard-smoke-test.png](artifacts/screenshots/109-whiteboard-smoke-test.png) のとおり、Smoke testパネルに `PASSED` と各ステップが表示された。

## 実画面での追加検証

### UI操作

- [110-whiteboard-accepted.png](artifacts/screenshots/110-whiteboard-accepted.png): `Accept changes` 後の確定Gadget。
- [111-whiteboard-note-edit.png](artifacts/screenshots/111-whiteboard-note-edit.png): タブAから付箋を追加し、`共同編集テスト：タブA` と入力。
- [112-whiteboard-drawing.png](artifacts/screenshots/112-whiteboard-drawing.png): Drawモードでフリーハンド線を描画。
- [113-whiteboard-drawing-persisted.png](artifacts/screenshots/113-whiteboard-drawing-persisted.png): 描画がイベント `addStroke` として共有状態に反映された状態。

### 2タブのリアルタイム同期

同じGadgetを2つのブラウザタブで開いたところ、両方の画面にpresenceが表示され、ヘッダーは `users: 2` になった。

その後、タブBから付箋 `共同編集テスト：タブB` を追加・編集した。タブA側で同じ付箋が現れ、最終的に両タブの状態が次の値で一致した。

```text
events: 19
notes: 6
strokes: 3
users: 2
```

- [114-whiteboard-two-tabs-presence.png](artifacts/screenshots/114-whiteboard-two-tabs-presence.png): 2タブ接続、`users: 2`、同一の付箋・描画。
- [115-whiteboard-realtime-tabB-to-tabA.png](artifacts/screenshots/115-whiteboard-realtime-tabB-to-tabA.png): タブBの付箋がタブAへ反映され、イベント `#18` / `#19` が表示された状態。

### 再読み込みと共有設定

タブAを再読み込みしたあとも、タブBから作った付箋、描画、イベント数が復元された。

- [116-whiteboard-reload-persistence.png](artifacts/screenshots/116-whiteboard-reload-persistence.png): reload後も `共同編集テスト：タブB` と描画が残っている。
- [117-whiteboard-final.png](artifacts/screenshots/117-whiteboard-final.png): 実験終了時の最終状態。

共有設定では、WorkspaceのShare modalから`Gadget only`の共有リンクを作成できた。

### 別アカウントの共有リンク参加

今回は「同じアカウントの2タブ」から一段進め、別ユーザーを作成して実験した。

- Owner: 既存の`cloudflareos`アカウント。
- Collaborator: 実験用に作成した別アカウント（認証情報は記録・公開していない）。
- 共有方法: OwnerがShare modalで`Gadget only`のshare linkを発行し、Collaboratorがリンクから参加。
- セッション分離: 同一Chrome内でも認証状態が混ざらないよう、OwnerはTailscale HTTPSオリジン、Collaboratorは同じローカルサービスの別オリジンから接続した。バックエンドとGadgetは同一インスタンスである。
- 参加後のCollaborator画面は`by cloudflareos`とGadget UIだけが表示され、Owner側にあるWorkspaceのチャット・Code・Connections・Share操作は表示されなかった。
- Collaboratorが`別アカウントCollaborator：リアルタイム追加`という付箋を追加すると、約2.3秒後にOwner側でも同じ本文が表示された。
- 同期後の観測値は両画面で次のとおりだった。

```text
events: 21
notes: 7
strokes: 3
users: 3
```

`users: 3`には、今回のOwnerとCollaboratorに加え、前回の同一アカウント検証で残っていたpresenceがheartbeat期限まで含まれていた。別アカウント間の変更配信自体は、両画面の本文・イベント連番・presenceで確認できた。

- [118-multiuser-owner-share-modal.png](artifacts/screenshots/118-multiuser-owner-share-modal.png): Owner側の共有設定。`Gadget only`を確認。
- [119-multiuser-collaborator-joined.png](artifacts/screenshots/119-multiuser-collaborator-joined.png): 別アカウントが共有リンクで参加した直後。
- [120-multiuser-collaborator-realtime-note.png](artifacts/screenshots/120-multiuser-collaborator-realtime-note.png): Collaboratorが付箋を追加した状態。
- [121-multiuser-owner-realtime-note.png](artifacts/screenshots/121-multiuser-owner-realtime-note.png): Owner側の同期確認途中の画面。
- [122-multiuser-owner-sync-final.png](artifacts/screenshots/122-multiuser-owner-sync-final.png): Owner側にも同じ付箋とCollaborator presenceが表示された最終状態。
- [123-multiuser-revoke-error.png](artifacts/screenshots/123-multiuser-revoke-error.png): Collaborator削除後の共有設定。Revokeアイコンは残り、Recipient verificationのエラー表示も確認。

後片付けでは、OwnerのShare modalから実験用Collaboratorのアクセス削除は成功し、`Collaborator removed.`を確認した。一方、share linkのRevoke操作はUI上で`The execution context which hosts this callback is no longer running.`／`Failed to load sharing info`を表示し、一覧からリンクが消えない状態になった。これは今回の実験で見つかった共有管理UIの要確認事項である。リンクはtailnet限定環境のテスト用で、公開記事やリポジトリにはトークンを記録していない。

## HyperFrames説明動画：スクショで何をしたのか

生スクショを並べるだけでは、どのユーザーが何を操作し、どの値を見れば同期を確認できるのかが分かりにくかった。そのため、元画像を証拠カードとして配置し、左側に「操作・参加・入力・確認・要確認」の説明パネル、下部に「この画面の意味」、右上に操作結果の要約を追加したHyperFrames構成を作成した。

- ソース: [artifacts/hyperframes/multiuser-explainer/index.html](artifacts/hyperframes/multiuser-explainer/index.html)
- デザイン定義: [artifacts/hyperframes/multiuser-explainer/DESIGN.md](artifacts/hyperframes/multiuser-explainer/DESIGN.md)
- 完成動画: [artifacts/screenshots/hyperframe-multiuser-explainer.mp4](artifacts/screenshots/hyperframe-multiuser-explainer.mp4)
- Tailscale証跡ギャラリー: `https://<tailnet-host>:8890/`
- 出力: 1920×1080、30fps、38秒、音声なし

### シーン構成

1. **全体の流れ** — Owner → Gadget only → Collaborator → Realtime syncを先に提示。
2. **共有リンクを発行** — Ownerが`Share → Gadget only → Create link`を実行。[125説明フレーム](artifacts/screenshots/125-hyperframe-share-action.png)で説明。
3. **別アカウントが参加** — Collaboratorが同じGadgetへ入る。元証拠[119](artifacts/screenshots/119-multiuser-collaborator-joined.png)を[126説明フレーム](artifacts/screenshots/126-hyperframe-collaborator-join.png)で説明。
4. **Collaboratorが付箋を追加** — notesが6から7へ増えた操作。元証拠[120](artifacts/screenshots/120-multiuser-collaborator-realtime-note.png)を[127説明フレーム](artifacts/screenshots/127-hyperframe-collaborator-note.png)で説明。
5. **Ownerへリアルタイム同期** — `events: 21 / notes: 7 / strokes: 3 / users: 3`へ収束。元証拠[122](artifacts/screenshots/122-multiuser-owner-sync-final.png)を[128説明フレーム](artifacts/screenshots/128-hyperframe-owner-sync.png)で説明。
6. **後片付けで見つかった制限** — Collaborator削除は成功したが、Revoke UIはエラー表示とリンク残存があった。元証拠[123](artifacts/screenshots/123-multiuser-revoke-error.png)を[129説明フレーム](artifacts/screenshots/129-hyperframe-cleanup-finding.png)で説明。

### 生成・検査結果

`npx hyperframes check --json`でruntime/layoutのエラー0、コントラスト検査69件中69件合格を確認した。`npx hyperframes lint --json`もエラー・警告0で、標準品質のMP4レンダリング後に各シーンの静止画を目視確認した。これにより、単なるスクショ一覧ではなく、実験の操作順と観測結果を追える証拠動画になった。

## X投稿用カルーセルへの再構成

説明動画のフレームは証拠レビュー向けで、投稿画像としては情報が多くメモに見えた。そのため、別のHyperFrames構成で、元スクショを使った3:2の投稿用スライドへ再構成した。

- 構成ソース: [artifacts/hyperframes/multiuser-social-slides/index.html](artifacts/hyperframes/multiuser-social-slides/index.html)
- デザイン定義: [artifacts/hyperframes/multiuser-social-slides/DESIGN.md](artifacts/hyperframes/multiuser-social-slides/DESIGN.md)
- プレビュー動画: [cloudflare-os-multiuser-social-slides.mp4](artifacts/screenshots/cloudflare-os-multiuser-social-slides.mp4)
- 画像サイズ: 1920×1280、3:2、全6枚

### 投稿用6枚

1. [130](artifacts/screenshots/130-cloudflare-os-multiuser-slide-1-title.png) — 「別アカウントでも、共同編集できた。」という結果ファーストの表紙。
2. [131](artifacts/screenshots/131-cloudflare-os-multiuser-slide-2-share.png) — Ownerが`Gadget only`共有リンクを発行。
3. [132](artifacts/screenshots/132-cloudflare-os-multiuser-slide-3-join.png) — Collaboratorが別アカウントで参加。
4. [133](artifacts/screenshots/133-cloudflare-os-multiuser-slide-4-note.png) — Collaboratorが付箋を追加し、`notes 6 → 7`。
5. [134](artifacts/screenshots/134-cloudflare-os-multiuser-slide-5-sync.png) — Owner側で`events 21 / notes 7 / strokes 3 / users 3`を観測。
6. [135](artifacts/screenshots/135-cloudflare-os-multiuser-slide-6-verdict.png) — 共同編集は実証、Share linkのRevokeは追加検証。

タイトルスライドを単なる検証メモにせず、「何ができたのか」を最初の1枚で伝える構成に変更した。X添付用PNGはスクショ番号・操作・結果を残しつつ、説明パネルを短くしている。

## 何が「共同」なのか

今回確認した共同性は、次の3層に分けて理解すると分かりやすい。

1. **共有データ:** 付箋と描画をサーバー側のDurable Object状態として保持する。
2. **リアルタイム配信:** あるタブの操作をイベントとして他の購読クライアントへ送る。
3. **参加者表示:** heartbeatで接続中のユーザーをpresenceとして見せる。

したがって、Google JamboardやMiroのような完成済みSaaSを呼び出しているわけではない。Cloudflare OSのエージェントが、共同編集に必要なサーバーAPIとクライアントUIをGadgetとしてその場で作り、Cloudflare OSの共有基盤上で動かしている。

## 未確認・注意点

- 今回の別アカウント検証は`Gadget only`（use相当）で行った。Build権限や、CollaboratorがAgentにコード変更を依頼できるかまでは未確認。
- 再読み込み直後は、旧クライアントのpresenceがheartbeatの有効期限まで一時的に残る状態を観測した。presenceの完全な離脱反映を60秒待って確認する実験は未実施。
- 同じ付箋を2ユーザーが同時編集した場合の競合解決ルールは未確認。
- 本番規模の多数クライアント、負荷、ネットワーク切断からの復帰性能は未確認。
- Share modalのshare link Revoke操作は、今回のローカル環境でエラー表示が発生した。Collaborator削除は成功したが、リンク一覧からの消去は未確認。
- 生成されたGadgetのコードはCloudflare OS内のDraft/Workspaceに保存される。今回のリポジトリにGadgetソースを直接コピーしたわけではない。

## Tailscaleで見る

Cloudflare OS本体は既存のtailnet限定URLで配信している。実URLはリポジトリには固定保存せず、現在の検証環境では次のURLを使用した。

```text
Cloudflare OS: https://<tailnet-host>:8877/
証跡ギャラリー: https://<tailnet-host>:8890/
```

スクショギャラリーには、この実験の`98`〜`123`番を追加している。

## 次にやると面白い検証

共同ホワイトボードをさらに詰めるなら、次は次の順番がよい。

1. 2ユーザーが同じ付箋を同時に編集し、競合結果とイベント順を確認。
2. Share modalのRevokeエラーを再現し、リンク無効化後の再参加可否を確認。
3. 接続断・再接続時にイベントを取りこぼさないか確認。
4. Build権限で別ユーザーがコード・Agent操作までできるか確認する。
5. 生成したGadgetをBlueprint化し、別のユーザーが独立コピーを作れるか確認。

## X投稿シミュレーション：共同ホワイトボード続編（2026-08-08）

前回のGLM 5.2 Slides投稿（[2086003612577300719](https://x.com/hAru_mAki_ch/status/2086003612577300719)）の続編として、別アカウント共有リンク実験を`Cloudflare OS × 共同ホワイトボード やってみた❸`にまとめた。Xの添付上限に合わせ、メイン4枚＋前回投稿参照の添付なし返信＋続編2枚＋GitHub別返信の直列構成にした。以下のペイロードは公開前シミュレーション時点の記録であり、承認後に同一内容で公開した。公開結果は「公開結果」節に追記している。

### 投稿ペイロード

メイン本文（URLなし・添付130〜133）:

```text
Cloudflare OS × 共同ホワイトボード やってみた❸

今度は、Gadget onlyの共有リンクを使って
別アカウントから共同編集できるか試してみたぞ！！！

✅ Ownerが共有リンクを発行
✅ Collaboratorが別アカウントで参加
✅ 付箋がOwner側へリアルタイム同期

共同編集はできた。
ただし、Share linkのRevokeはUIエラー、、、
```

1つ目の返信（前回投稿URLのみ・添付なし）:

```text
前回のGLM 5.2スライド生成の続編。

今回は、Cloudflare OSのエージェントに
共同ホワイトボードGadgetを作らせて、
Owner / Collaboratorの2アカウントで検証したぞ！！！

https://x.com/hAru_mAki_ch/status/2086003612577300719
```

2つ目の返信（URLなし・添付134〜135）:

```text
検証の流れを追加。
Ownerが共有 → Collaboratorが参加 →
付箋追加 → Owner側へリアルタイム同期。

観測値は events: 21 / notes: 7 / strokes: 3 / users: 3。
ただし、Revokeは Failed to load sharing info だった、、
```

3つ目の返信（GitHub URLを単独掲載）:

```text
共同ホワイトボードの詳細ログと
再現手順・未確認事項はこちら。

今回の新しい証拠画像は、公開前にリポジトリへ反映する。

https://github.com/Sunwood-ai-labs/cloudflare-os-home
```

### preflightとシミュレーター

- `scripts/preflight.ps1`: `ok: true`
- 本文長: 191文字
- 返信長: 161 / 161 / 115文字
- 添付: 130〜135の6枚、全て1920×1280・3:2
- URL: 前回投稿URLとGitHub URLを別返信に分離
- シミュレーター: `https://<tailnet-host>:8891/`（tailnet限定）
- シミュレーターソース: [artifacts/x-post-simulator/index.html](artifacts/x-post-simulator/index.html)

### シミュレーター証跡

- [136-x-post-simulator-multiuser-top.png](artifacts/screenshots/136-x-post-simulator-multiuser-top.png): メイン投稿、4枚添付、公開前チェック
- [137-x-post-simulator-multiuser-middle.png](artifacts/screenshots/137-x-post-simulator-multiuser-middle.png): 1〜4枚目と前回投稿URLを分離した返信
- [138-x-post-simulator-multiuser-bottom.png](artifacts/screenshots/138-x-post-simulator-multiuser-bottom.png): 5〜6枚目とGitHub別返信

投稿用画像130〜135は、実験スクショ118〜123を元にしたevidence-derived visualである。元の実スクショは加工せず、投稿用カルーセルとは別に保持している。シミュレーション時点ではGitHub返信を公開前提としていたが、実際には新しい検証記録と画像をコミット`462f079`へ反映した後、以下のスレッドとして公開した。

### 公開結果（2026-08-08）

`@hAru_mAki_ch`へ、メイン1件と自己返信3件を直列で公開した。各返信は直前の投稿を親にしており、Xの添付上限に合わせて、メインに4枚、2つ目の返信に2枚を添付した。投稿ID・本文・親子関係は、公開直後にX上とローカルのpost historyで確認した。

| 順序 | 役割 | 公開URL | 添付・リンク |
| --- | --- | --- | --- |
| 1 | メイン投稿 | [2086048448328204347](https://x.com/hAru_mAki_ch/status/2086048448328204347) | 130〜133を添付。URLなし。 |
| 2 | 前回投稿参照返信 | [2086048845205798939](https://x.com/hAru_mAki_ch/status/2086048845205798939) | 添付なし。前回の[GLM 5.2スライド投稿](https://x.com/hAru_mAki_ch/status/2086003612577300719)を掲載。親はメイン`2086048448328204347`。 |
| 3 | 検証結果返信 | [2086048941033009238](https://x.com/hAru_mAki_ch/status/2086048941033009238) | 134〜135を添付。親は返信1`2086048845205798939`。 |
| 4 | 詳細記録・GitHub返信 | [2086049016979374574](https://x.com/hAru_mAki_ch/status/2086049016979374574) | 添付なし。[cloudflare-os-home](https://github.com/Sunwood-ai-labs/cloudflare-os-home)を掲載。親は返信2`2086048941033009238`。 |

### 公開時の検証記録

- 対象アカウント: `@hAru_mAki_ch`
- 公開対象: メイン本文191文字、返信161 / 161 / 115文字。承認時の本文から変更なし。
- 添付: 130〜135の6枚。全て1920×1280、3:2。メイン4枚、検証結果返信2枚。
- 公開前検査: `preflight.ps1`で`ok: true`。本文・返信のURL分離、各投稿4枚以下、ローカル履歴重複なしを確認。
- リポジトリ: [462f079](https://github.com/Sunwood-ai-labs/cloudflare-os-home/commit/462f079c0bc659accb0cd00aae5ba58f715ec231)を`main`へpush済み。
- 証跡: 元スクショ118〜123、HyperFrames説明フレーム124〜129、X投稿用画像130〜135、シミュレーター証跡136〜138を対応付けて保存。
- 非公開情報: Collaboratorの認証情報、共有リンクのトークン、ローカルの認証情報は記録・公開していない。

Xの公開URLは、この実験の結論だけでなく、どの画像がどの操作・観測値に対応するかを追跡する入口として使える。再現手順、元スクショ、投稿用ビジュアルの違いは本ファイルの各節と[RESEARCH-LOG.md](RESEARCH-LOG.md)を参照する。
