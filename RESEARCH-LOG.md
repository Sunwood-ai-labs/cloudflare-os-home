# Cloudflare OS 調査・実験ログ

調査日: 2026-08-07（JST）
対象: Cloudflare OS / Cloudflare OS local lab / project-local LiteLLM / Tailscale
目的: Cloudflare OSが何をできるのか、セルフホストできるのか、Open WebUIとの違い、エージェントとして動くのかを確認する。

## 1. 調査の出発点

ユーザー提供のX画像では、Cloudflare OSは次のように紹介されていた。

> Cloudflare OS は、オープンソースのプラットフォームで、会社内の誰もがアプリを構築し、業務を自動化し、内部システムに安全にアクセスできるようにする。

記事タイトルは `Cloudflare OS: an open platform for agents, apps, and work`。通常のOSではなく、エージェントがアプリや業務を扱うためのAIワークスペースという位置付けだった。

### 元画像

元のX画像は個人情報と第三者の投稿を含むため、`artifacts/source/` にローカル証跡として保持し、公開リポジトリには含めない。

参照元: [Cloudflare OS公式ブログ](https://blog.cloudflare.com/cloudflare-os/)

## 2. 最初の通常チャットで分かったこと

Cloudflare OS上で、project-local LiteLLM経由の `glm-4.7` に「Cloudflare OSとは？」と一文回答を求めた。

結果は、Cloudflare OSを「存在しない仮想的なOS」と誤認する回答だった。ページ自体は正常に動作していたため、これはアプリの故障ではなく、単純なチャットではモデルの知識不足・古い知識・検索なしによる誤回答が起きることを示す。

![初回ログイン画面](artifacts/screenshots/01-login.png)

![LiteLLM経由の単純チャット回答](artifacts/screenshots/07-chat-response-final.png)

![リロード後も会話が残ることを確認](artifacts/screenshots/08-reload.png)

### 結論

- 通常の質問は、ツールを使わずLLMの文章回答だけで終わる。
- チャット履歴とワークスペース状態はローカル環境に保持され、リロード後も確認できた。
- 最新の製品情報を回答させる用途では、Web検索・社内ナレッジ・資料添付などの追加コンテキストが必要。

## 3. Cloudflare OSで確認できた機能

上流ソースのREADMEと画面から、次の機能を確認した。

- ワークスペース単位のチャット
- AIモデルの追加・選択
- OpenAI互換APIを使ったカスタムモデル登録
- Gadgetという生成アプリの作成
- 生成アプリのコード表示・変更確認
- コード実行とテスト
- 外部サービス接続をGatekeeper/Connectionsで管理する設計
- Blueprint、Outputs、Exploreなどの作業単位・成果物管理
- エージェントが会社の知識、ツール、データを扱うための構成

画面上にも `Ask a question, create an output, or create an app that works with your tools and data.` とあり、チャット専用UIではなく、成果物とアプリ作成を中心にしたUIになっている。

![初期セットアップでモデルを選択](artifacts/screenshots/05-model-configured.png)

![Cloudflare OSのホーム画面](artifacts/screenshots/06-home.png)

![モバイル幅のホーム画面](artifacts/screenshots/14-tailscale-mobile-home.png)

参照ソース:

- [Cloudflare OS上流README](upstream/cloudflare-os/README.md)
- [Agent実装](upstream/cloudflare-os/packages/workshop-backend/src/agent.ts)
- [チャットUI実装](upstream/cloudflare-os/packages/workshop-frontend/src/ChatInterface.tsx)

## 4. ソースコードがあるか / セルフホストできるか

### 確認結果

- 上流ソースは `upstream/cloudflare-os` に存在する。
- ライセンスは上流リポジトリのApache-2.0を維持している。
- Docker ComposeでCloudflare OSとLiteLLMを同じプロジェクト内にまとめた。
- Cloudflare OSからLiteLLMへは `http://litellm:4000/v1` で接続する。
- 現在の構成はローカル開発・検証用であり、Cloudflareの本番workerdセルフホスト経路まで検証したものではない。

### 構成

```text
Browser
  │ localhost:8877 / Tailscale Serve
  ▼
Cloudflare OS container
  │ http://litellm:4000/v1
  ▼
project-local LiteLLM container
  │
  ▼
configured providers / models
```

## 5. LiteLLMを使えるか

Ollamaではなく、既存のLiteLLMコピーをプロジェクト内に置く構成を実装・検証した。

### 検証結果

- project-local LiteLLMの認証付き `/v1/models` が成功。
- 26個のモデルIDが返った。
- Cloudflare OSから `glm-4.7` をOpenAI互換モデルとして登録できた。
- `glm-4.7` へのチャット応答が成功した。
- 既存のOpen WebUI用LiteLLMネットワークには依存していない。

![LiteLLM接続先を入力](artifacts/screenshots/10-network-model-form.png)

![LiteLLMモデルの登録完了](artifacts/screenshots/11-network-model-configured.png)

![登録済みモデルで会話](artifacts/screenshots/12-tailscale-chat-response.png)

### 重要な整理

- Cloudflare OS: エージェントのUI、ワークスペース、Gadget、ツール実行を担当。
- LiteLLM: モデルへのOpenAI互換ルーティングを担当。
- `glm-4.7`: 今回の実験で実際に使ったモデル。
- エージェント性はLiteLLMではなく、Cloudflare OS側のagent loopとツール定義で実現している。

## 6. Tailscaleで公開できるか

Tailscale Serveを使い、Cloudflare OSをtailnet内限定のHTTPS URLで公開した。

```text
https://<your-tailnet-host>:8877/
```

### 検証結果

- Tailscale ServeのHTTPSレスポンスが200。
- Tailscale URLからログインできた。
- Tailscale URL経由でチャットが成功した。
- モバイル幅の画面も確認できた。
- Funnelではなくtailnet-onlyのServeであり、一般公開インターネットへの公開ではない。

![Tailscale経由のチャット](artifacts/screenshots/12-tailscale-chat-response.png)

![Tailscale経由のリロード](artifacts/screenshots/13-tailscale-reload.png)

![Tailscale経由のモバイル表示](artifacts/screenshots/14-tailscale-mobile-home.png)

## 7. 費用の整理

Cloudflare OSのローカルOSS部分そのものに、今回確認した固定の利用料はない。

| 構成要素 | 費用の考え方 |
|---|---|
| Cloudflare OSのソース | ローカル利用ではライセンス料なし。Apache-2.0の上流ソースを使用 |
| Docker / ローカル実行 | PCのCPU・メモリ・電気代 |
| LiteLLM | ソフトウェア自体はローカル実行可能 |
| モデルAPI | 接続先プロバイダの従量課金。ローカルモデルならプロバイダへのトークン課金なし |
| Tailscale | tailnetの契約・利用条件に依存。今回のServeはtailnet内限定 |
| Cloudflareのマネージドサービス | Workers、AI、ストレージ等を別途使う場合は各サービスの利用料 |

したがって、今回の構成での実費の中心は、LiteLLMが選んだモデルプロバイダのAPI料金。Cloudflare OSをローカルで動かすだけでCloudflare SaaS料金が自動発生する構成ではない。

### Cloud版とローカル版の区別

- 今回実際に動かしたのは、上流ソースをDocker Composeで起動したローカル版。
- Cloudflareが提供するマネージド版の料金、利用制限、チーム機能、正式なナレッジ機能の提供範囲は、このローカル実験だけでは確定できない。
- X投稿・ブログで示される会社知識、内部システム接続、Gatekeeperなどの体験と、ローカル版で有効になる機能は完全に同一とは限らない。
- 本ログでは「ソースに存在する機能」「画面で確認した機能」「実際に実行した機能」を分けて記録している。

## 8. Open WebUIとの比較

| 観点 | Cloudflare OS | Open WebUI |
|---|---|---|
| 主目的 | エージェント、アプリ、業務の実行環境 | LLMチャット・モデル利用の統合UI |
| 基本単位 | Workspace / Gadget / Output | Chat / Model / Knowledge |
| 通常チャット | 可能 | 得意 |
| コードを書いてアプリ化 | 中心機能。Gadgetを作る | 標準機能の中心ではない |
| コード実行 | AgentのCode Modeとして実行 | 構成・拡張機能による |
| エージェントループ | ソース上にagent loopとtool callあり | Tools / Functions / Pipelines等で構成 |
| ナレッジ/RAG | ツール・データ・会社知識の思想はあるが、今回のローカル検証でOpen WebUI同等のKnowledge画面は未確認 | Knowledge collections / RAGが明確 |
| カスタムモデル | OpenAI互換APIのモデル登録を画面で確認 | 可能。モデル設定・プリセットが豊富 |
| 外部接続 | Connections / Gatekeeperを中心に設計 | Tools、Functions、Pipelines、各種連携 |
| 人間の承認 | 生成アプリのPending changesでAccept/Discard | 操作・拡張機能ごとに異なる |
| 向いている用途 | 「作って、実行して、成果物を残す」仕事 | 「会話して、検索して、モデルを使う」仕事 |

### ナレッジとカスタムモデルについて

「Cloudflare OSにはナレッジもカスタムモデルもない」と断定するのは正確ではない。

- カスタムモデル: 今回、LiteLLMのOpenAI互換エンドポイントを画面から登録し、`glm-4.7`で動作確認済み。
- ナレッジ: 上流READMEには会社の知識を前提にしたエージェント体験が記載されている。ただし、今回のローカル版でOpen WebUIのKnowledge collectionと同じ形の登録・RAG検索画面は検証していない。
- Cloudflare OSの思想は、固定の文書コレクションをチャットに添付するだけでなく、接続、ツール、データ、生成アプリをエージェントから扱わせる方向。

## 9. Claude Code的なエージェント実験

### 実験指示

```text
Act as a coding agent, not a chat-only assistant.
Create a minimal Gadget named "Agent Proof" with a page that displays
"2 + 2 = 4". Use your available coding tools to create the files and execute
a test. Do not merely explain how; perform the tool work first, then summarize
the files and test result.
```

### 実際に確認できた処理

```text
Wrote 2 files, ran code
server.js
client.js

Used the gadget
Ran code

Gadget accessible: true
```

画面には生成された `server.js` / `client.js`、`env.AGENT_PROOF`、テスト結果、GadgetのDraft、そして `Pending changes` の `Accept changes` / `Discard` が表示された。

![エージェントへの依頼送信](artifacts/screenshots/15-agent-request-sent.png)

![エージェント処理中](artifacts/screenshots/16-agent-gadget-result.png)

![ファイル作成・コード実行・テスト完了](artifacts/screenshots/17-agent-gadget-complete.png)

### エージェント処理の実態

```text
ユーザーの文章
  ↓
会話履歴 + エージェント用システム指示 + 利用可能ツール
  ↓
LLMがツール呼び出しを選択
  ↓
createGadget
  ↓
writeFile / editFile
  ↓
executeCode
  ↓
結果をLLMへ返す
  ↓
最終回答とDraftを表示
```

これはClaude Codeと同じく、モデルの文章回答だけではなく、ツール呼び出し、ファイル変更、実行、結果確認を含むエージェントループである。ただし、Cloudflare OSではホストPCの任意のリポジトリを直接操作するのではなく、サンドボックス内のGadgetを中心に扱う。

### 現時点の制約

- 普通の質問では通常チャットとして返答することがある。
- 「説明せず実行して」「ファイルを作成してテストして」など、作業目的を明示したほうがツール呼び出しが起きやすい。
- 生成変更は今回の画面ではPending changesになり、Accept changesが必要だった。
- `glm-4.7`のようなモデルの知識やツール呼び出し品質に依存する。
- 今回は最小Gadgetの作成・実行・検証までであり、長時間の自律タスク、外部サービス接続、失敗後の自動修正を網羅的に確認したわけではない。

## 10. 最終判断

今回のローカル構成は、単純なOpen WebUI代替というより、次の用途に向いている。

```text
依頼を書く
  → エージェントがアプリ/コードを作る
  → サンドボックスで実行する
  → テスト結果を確認する
  → Draftをレビューして採用する
```

「単純なチャット」より「エージェント優先」で使うなら、依頼文に以下を含めるのが現実的。

```text
文章だけで説明せず、まず実行してください。
必要ならGadgetを作成し、ファイルを書き、コードを実行・テストしてください。
失敗したら修正して再実行し、最後に変更ファイル・実行結果・未完了点を報告してください。
```

## 11. Slides Blueprint実験（2026-08-08）

### 目的

上流READMEの「Make slides for my upcoming meeting with a customer.」という例を、プロジェクト内LiteLLM（`glm-4.7`）で実行し、Slides Blueprintがどこまで実用的に動くかを確認した。

### 実行内容

ホーム画面の「Build a team meeting deck」導線を確認したあと、次の依頼を送信した。

```text
Create a slide deck titled 「Cloudflare OSのローカル検証結果」 using the built-in Slides Blueprint.
Write the deck in Japanese. Include 6 slides: Cloudflare OSとは、ローカル構成、確認できた機能、
Gadgetエージェントの実行フロー、Open WebUIとの違い、制約と次の検証。
Build the deck, test that it works, and report the created files and test result.
```

### 観測できたこと

- Slides GadgetのDraftが作成され、プレビュー、`Slides`、`Code`、`Connections`、`Edit`、`Present`、`Export to PDF`の操作を確認できた。
- エージェントは`server.js`と`client.js`を読み、`executeCode`でSlides Gadgetを操作した。
- 変更を`Accept changes`で確定すると、Draft表示が通常のSlides Gadget表示に変わり、内容が保存された。
- 最終的には7枚のスライドが生成された。1枚目は表紙、2〜6枚目は日本語の内容スライドだった。
- 6枚目には「Open WebUIとの違い」と「制約と次の検証」が同居したため、依頼した6テーマとスライド枚数の対応は完全ではなかった。

### 制約・失敗

- 7枚目には`[TITLE]`と`[SUBTITLE]`が残り、テンプレート由来のプレースホルダーを自動除去できなかった。
- `executeCode`の結果取得に失敗し、エージェントが複数回リトライした。最終的には手動で停止して変更を確定した。
- `Export to PDF`ボタンは表示されたが、このブラウザー検証ではダウンロードイベントを確認できなかった。PDF出力は未確定とする。
- したがって、Slides Blueprintは「Gadgetを作って編集可能なスライドを生成する」ことまでは確認できたが、要求枚数・内容・完成判定まで安定して自律実行できるとはまだ言えない。

### スクリーンショット

- [20-slides-deck-title.png](artifacts/screenshots/20-slides-deck-title.png): 日本語タイトルと表紙
- [19-slides-deck-summary.png](artifacts/screenshots/19-slides-deck-summary.png): Open WebUI比較・制約スライド
- [18-slides-deck-placeholder.png](artifacts/screenshots/18-slides-deck-placeholder.png): 未置換プレースホルダーが残った7枚目

## 12. Tailscale経由のSlides検証（2026-08-08）

### 配信構成

- Cloudflare OS本体: `https://<tailnet-host>:8877/`（tailnet only）
- スクリーンショットギャラリー: `https://<tailnet-host>:8890/`（tailnet only）
- ギャラリーは`artifacts/screenshots`だけを`127.0.0.1:8890`で静的配信し、Tailscale Serveで8890番へ中継した。プロジェクト全体や`artifacts/source`は配信していない。

### 検証結果

- Tailscale URLへのログインはHTTP 200とCloudflare OSホーム表示まで確認できた。
- スライド依頼をTailscale URLから送信し、Slides Gadget Draftが作成された。
- 初期状態では4枚のテンプレートが表示された。その後、エージェントが既定スライドをクリアし、6枚を作成した。
- 生成されたスライドを次へ進めて、次の6タイトルを画面上で確認した。
  1. Cloudflare OSのローカル検証
  2. ローカル構成
  3. 確認できた機能
  4. Gadgetエージェントの実行フロー
  5. Open WebUIとの違い
  6. 制約と次の検証
- `Accept changes`後も1 / 6と6 / 6を表示でき、6枚の保存を確認した。

### Tailscale経路で発生した問題

- 初回の処理中にCloudflare OSコンテナの再起動とWebSocket再接続が発生した。
- エージェントの最終応答は途中停止したが、直後にDraftを開くと6枚のスライドが表示された。したがって、生成結果は画面で確認し、エージェントの完了メッセージだけには依存していない。
- この挙動は、モデル処理・Gadget更新・UI接続が別々に進むことを示している。今後は生成完了後に必ずスライド枚数とタイトルを画面で確認する。

### スクリーンショットギャラリー

- [index.html](artifacts/screenshots/index.html): Tailscale限定ギャラリー
- [21-tailscale-access.png](artifacts/screenshots/21-tailscale-access.png): Tailscale経由の初期アクセス
- [22-tailscale-home.png](artifacts/screenshots/22-tailscale-home.png): ログイン後のホーム
- [23-tailscale-slide-prompt.png](artifacts/screenshots/23-tailscale-slide-prompt.png): スライド依頼
- [24-tailscale-agent-start.png](artifacts/screenshots/24-tailscale-agent-start.png): エージェント開始
- [25-tailscale-agent-progress.png](artifacts/screenshots/25-tailscale-agent-progress.png): 再接続状態
- [26-tailscale-draft-output.png](artifacts/screenshots/26-tailscale-draft-output.png): Draft出力
- [27-tailscale-slide-progress.png](artifacts/screenshots/27-tailscale-slide-progress.png): 初期テンプレート
- [28-tailscale-slide-edit-state.png](artifacts/screenshots/28-tailscale-slide-edit-state.png): 編集状態
- [29-tailscale-slide-failed.png](artifacts/screenshots/29-tailscale-slide-failed.png): 停止後の証跡
- [30-tailscale-slide-1.png](artifacts/screenshots/30-tailscale-slide-1.png): 1 / 6
- [31-tailscale-slide-2.png](artifacts/screenshots/31-tailscale-slide-2.png): 2 / 6
- [32-tailscale-slide-3.png](artifacts/screenshots/32-tailscale-slide-3.png): 3 / 6
- [33-tailscale-slide-4.png](artifacts/screenshots/33-tailscale-slide-4.png): 4 / 6
- [34-tailscale-slide-5.png](artifacts/screenshots/34-tailscale-slide-5.png): 5 / 6
- [35-tailscale-slide-6.png](artifacts/screenshots/35-tailscale-slide-6.png): 6 / 6
- [36-tailscale-slide-accepted.png](artifacts/screenshots/36-tailscale-slide-accepted.png): Accept changes後の1 / 6
- [37-tailscale-slide-6-accepted.png](artifacts/screenshots/37-tailscale-slide-6-accepted.png): Accept changes後の再表示途中の5 / 6
- [38-tailscale-gallery.png](artifacts/screenshots/38-tailscale-gallery.png): ギャラリー自体をTailscale経由で表示
- [39-tailscale-slide-6-accepted.png](artifacts/screenshots/39-tailscale-slide-6-accepted.png): Accept changes後の6 / 6を再撮影
- [40-x-media-slide-1-3x2.png](artifacts/screenshots/40-x-media-slide-1-3x2.png): 初期のcrop案（ユーザー確認後は未採用）
- [41-x-media-slide-6-3x2.png](artifacts/screenshots/41-x-media-slide-6-3x2.png): 初期のcrop案（ユーザー確認後は未採用）
- [42-x-post-simulator.png](artifacts/screenshots/42-x-post-simulator.png): 初期の2画像同梱シミュレーター
- [43-x-media-slide-1-original-frame.png](artifacts/screenshots/43-x-media-slide-1-original-frame.png): 元の1920×911画面を無加工で3:2フレームに配置
- [44-x-media-slide-6-original-frame.png](artifacts/screenshots/44-x-media-slide-6-original-frame.png): 保存後6 / 6の元画面を無加工で3:2フレームに配置
- [45-x-post-simulator-split.png](artifacts/screenshots/45-x-post-simulator-split.png): 分割版シミュレーター上部
- [46-x-post-simulator-split-replies.png](artifacts/screenshots/46-x-post-simulator-split-replies.png): 表紙を返信に添付した状態
- [47-x-post-simulator-final-reply.png](artifacts/screenshots/47-x-post-simulator-final-reply.png): 最終スライドを返信に添付した状態
- [48-x-media-slide-1-original-frame.png](artifacts/screenshots/48-x-media-slide-1-original-frame.png): X添付用スライド1（元画面保持）
- [49-x-media-slide-2-original-frame.png](artifacts/screenshots/49-x-media-slide-2-original-frame.png): X添付用スライド2（元画面保持）
- [50-x-media-slide-3-original-frame.png](artifacts/screenshots/50-x-media-slide-3-original-frame.png): X添付用スライド3（元画面保持）
- [51-x-media-slide-4-original-frame.png](artifacts/screenshots/51-x-media-slide-4-original-frame.png): X添付用スライド4（元画面保持）
- [52-x-media-slide-5-original-frame.png](artifacts/screenshots/52-x-media-slide-5-original-frame.png): X添付用スライド5（元画面保持）
- [53-x-media-slide-6-original-frame.png](artifacts/screenshots/53-x-media-slide-6-original-frame.png): X添付用スライド6（元画面保持）
- [54-x-post-simulator-4plus2-top.png](artifacts/screenshots/54-x-post-simulator-4plus2-top.png): メイン投稿の4枚添付
- [55-x-post-simulator-4plus2-middle.png](artifacts/screenshots/55-x-post-simulator-4plus2-middle.png): 返信2枚とGitHubリンク
- [56-x-post-simulator-4plus2-middle2.png](artifacts/screenshots/56-x-post-simulator-4plus2-middle2.png): スライド3・4および返信5・6

## 13. 全スクリーンショット一覧

### 初期調査資料

- `artifacts/source/01-x-post.jpg`（ローカル証跡・公開対象外）
- `artifacts/source/02-x-post-detail.jpg`（ローカル証跡・公開対象外）

### セットアップ・モデル接続

- [01-login.png](artifacts/screenshots/01-login.png)
- [02-home.png](artifacts/screenshots/02-home.png)
- [03-model-modal.png](artifacts/screenshots/03-model-modal.png)
- [04-model-form.png](artifacts/screenshots/04-model-form.png)
- [05-model-configured.png](artifacts/screenshots/05-model-configured.png)
- [06-home.png](artifacts/screenshots/06-home.png)

### 通常チャット・永続化

- [07-chat-sent.png](artifacts/screenshots/07-chat-sent.png)
- [07-chat-response.png](artifacts/screenshots/07-chat-response.png)
- [07-chat-response-final.png](artifacts/screenshots/07-chat-response-final.png)
- [08-reload.png](artifacts/screenshots/08-reload.png)
- [09-mobile-home.png](artifacts/screenshots/09-mobile-home.png)

### LiteLLMネットワーク・Tailscale

- [10-network-model-form.png](artifacts/screenshots/10-network-model-form.png)
- [11-network-model-configured.png](artifacts/screenshots/11-network-model-configured.png)
- [12-tailscale-chat-response.png](artifacts/screenshots/12-tailscale-chat-response.png)
- [13-tailscale-reload.png](artifacts/screenshots/13-tailscale-reload.png)
- [14-tailscale-mobile-home.png](artifacts/screenshots/14-tailscale-mobile-home.png)

### エージェント実験

- [15-agent-request-sent.png](artifacts/screenshots/15-agent-request-sent.png)
- [16-agent-gadget-result.png](artifacts/screenshots/16-agent-gadget-result.png)
- [17-agent-gadget-complete.png](artifacts/screenshots/17-agent-gadget-complete.png)

## 14. 再現用ファイル

- [README.md](README.md): 起動方法、LiteLLM、Tailscale、費用と制約
- [QA.md](QA.md): 実行済み検証チェックリスト
- [docker-compose.yml](docker-compose.yml): Cloudflare OS + project-local LiteLLM
- [scripts/verify-project-litellm.ps1](scripts/verify-project-litellm.ps1): LiteLLM疎通確認
- [scripts/enable-tailscale-serve.ps1](scripts/enable-tailscale-serve.ps1): Tailscale Serve設定
- [qa/agentic-gadget-smoke.mjs](qa/agentic-gadget-smoke.mjs): エージェント実験の送信
- [qa/agentic-wait-and-evidence.mjs](qa/agentic-wait-and-evidence.mjs): 完了待ちと証跡取得

## 15. GLM 5.2 内容重視Slides再検証（2026-08-08）

### 目的と構成

前回のSlides実験は、スライド枚数とテンプレート由来の未置換文言に課題が残った。今回はCloudflare OSのモデル選択を`LiteLLM · glm-5.2`へ切り替え、プロジェクト内LiteLLM（Cloudflare OSからは`http://litellm:4000/v1`）を経由して、本文まで埋まった検証資料を作る条件にした。

内蔵のSlides Blueprintに、正確に8枚、各スライドにタイトル・リード文・3〜5個の具体的な本文、さらに構成図・実行フロー・比較表・検証カードを入れるよう依頼した。資料のテーマは、`cloudflare-os-home`の構成、Tailscale経路、LiteLLM、GLM 5.2、Open WebUI比較、今回確認できた範囲と未確認範囲である。

### 生成された8枚

1. `Cloudflare OS Home × GLM 5.2`（表紙）
2. `前回の課題を洗い出し、今回の合格条件を設定する`
3. `Browser/Tailscale → Cloudflare OS → LiteLLM → glm-5.2`
4. `依頼から Accept changes まで、各段階の成果物を明示する`
5. `編集可能な Gadget として保存され、複数ビューで扱える`
6. `断定できない項目は「今回未確認」と区別して比較する`
7. `8枚生成で確認する項目を検証カードに整理する`
8. `実運用に向く範囲を確定し、次の検証を示す`

構成図はBrowser→Tailscale→Cloudflare OS→LiteLLM→GLM 5.2、実行フローは依頼→Blueprint→Gadget作成→編集・コード実行→画面確認→Accept changesを表現した。比較表ではCloudflare OS HomeとOpen WebUIを、Knowledge/RAG・PDF・外部連携などの未確認項目を混同しないように分けた。

### 目視で見つけて修正した点

最初の8枚生成後に全スライドを画面で確認したところ、次の2点を修正した。

- 表紙の`GLM 5.2`だけがオレンジ強調になり、背景に埋もれていたため、タイトル全体を白に統一した。
- 2枚目と7枚目の検証説明に、`[TITLE]`、`[SUBTITLE]`、`Lorem ipsum`、`ここに入力`の文字列が「検出対象の例」として残っていたため、意味のある日本語へ置き換えた。最終本文ではプレースホルダー検索が0件になった。

修正後の再検査では、8枚維持（`1 / 8`〜`8 / 8`）、プレースホルダー4種の検索0件、全ブロックの幾何オーバーフロー0件、密度の高い2・5・8枚目の縦方向フィットを確認した。`Accept changes`実行後もDraft表示が消え、通常のSlides Gadgetとして1枚目から8枚目まで再表示できた。

### 確認できた範囲と残課題

今回の実験で、GLM 5.2を使ったチャットからSlides Gadgetを作成し、図表と本文を含む8枚の編集可能な資料へ統合し、保存確定する流れは確認できた。一方、以下は今回の画面実験では断定していない。

- `Export to PDF`の実ファイルダウンロードと、PDF各ページの描画検証
- Knowledge/RAG専用画面、コレクション、検索結果の完全な動作
- 外部サービス連携の完全動作
- 数十分以上のエージェント実行と、再接続時の完了文停止問題（V06）

### スクリーンショット

- [57-glm-5.2-model-form.png](artifacts/screenshots/57-glm-5.2-model-form.png): GLM 5.2登録フォーム
- [58-glm-5.2-model-configured.png](artifacts/screenshots/58-glm-5.2-model-configured.png): GLM 5.2登録後のAI Providers画面
- [59-glm5.2-slide-prompt.png](artifacts/screenshots/59-glm5.2-slide-prompt.png): 内容重視8枚を依頼したプロンプト
- [60-glm5.2-slide-1.png](artifacts/screenshots/60-glm5.2-slide-1.png)〜[67-glm5.2-slide-8.png](artifacts/screenshots/67-glm5.2-slide-8.png): 初回8枚の目視確認
- [68-glm5.2-slide-1-final.png](artifacts/screenshots/68-glm5.2-slide-1-final.png): コントラスト修正後の表紙
- [69-glm5.2-slide-2-final.png](artifacts/screenshots/69-glm5.2-slide-2-final.png): プレースホルダー修正後の合格条件
- [70-glm5.2-slide-7-final.png](artifacts/screenshots/70-glm5.2-slide-7-final.png): プレースホルダー0件の検証カード
- [71-glm5.2-slide-1-accepted.png](artifacts/screenshots/71-glm5.2-slide-1-accepted.png)〜[78-glm5.2-slide-8-accepted.png](artifacts/screenshots/78-glm5.2-slide-8-accepted.png): Accept changes後の確定版8枚

## 16. GLM 5.2続編X投稿シミュレーション（2026-08-08）

> この節のシミュレーションは公開前に作成したもの。その後、承認済みの同一ペイロードをXへ公開し、公開URLを末尾に追記した。

前回の`Cloudflare OS × Slides やってみた❶`（[2085986613587505630](https://x.com/hAru_mAki_ch/status/2085986613587505630)）の続編として、今回の8枚をXの添付上限に合わせて「メイン4枚＋前回投稿参照の添付なし返信＋続編4枚＋GitHub別返信」に分けた未投稿シミュレーションを作成した。初版では前回投稿URLと5〜8枚目を同じ返信に入れていたため、見やすさを優先して再配置した。

### シミュレーション構成

- メイン投稿: GLM 5.2への切替、8枚生成、図表・検証カード、プレースホルダー0件、Accept後の保存を説明。添付は1〜4枚目。
- 前回投稿参照返信: 前回投稿URLを1件だけ持つ添付なし返信。6枚の生成結果と、再接続時に画面のDraftを確認した経緯を説明。
- 続編メディア返信: URLなしで、本文・図表まで統合したことを説明。添付は5〜8枚目。
- 直列の最後の別返信: GitHubリポジトリURLを1件だけ記載。
- メイン本文はURLなし、各投稿の添付は4件以下、Xへの送信は実施済み。
- `preflight.ps1`は`ok: true`。メイン186文字、返信104/54/87文字、8画像すべて1920×1280（3:2）で確認した。

実スクショの元データは`71〜78`番として保持し、公開用添付ではtailnet URLとDocker内部URLが見える1・3枚目だけURLをマスクした。マスク版は証拠を改変して成功状態を作るものではなく、公開先へ非公開の接続先を出さないための安全コピーである。

### シミュレーター

- Tailscale限定URL: `https://<tailnet-host>:8891/`
- [94-x-post-simulator-glm5.2-separated-main.png](artifacts/screenshots/94-x-post-simulator-glm5.2-separated-main.png): メイン投稿と1〜4枚目
- [95-x-post-simulator-glm5.2-previous-post-reply.png](artifacts/screenshots/95-x-post-simulator-glm5.2-previous-post-reply.png): 前回投稿URLだけを分離した添付なし返信
- [96-x-post-simulator-glm5.2-continuation-media-reply.png](artifacts/screenshots/96-x-post-simulator-glm5.2-continuation-media-reply.png): 5〜8枚目を載せる続編返信
- [97-x-post-simulator-glm5.2-github-reply.png](artifacts/screenshots/97-x-post-simulator-glm5.2-github-reply.png): GitHub URLの最後の別返信
- [91-x-post-simulator-glm5.2-4plus4-top.png](artifacts/screenshots/91-x-post-simulator-glm5.2-4plus4-top.png)〜[93-x-post-simulator-glm5.2-github-reply.png](artifacts/screenshots/93-x-post-simulator-glm5.2-github-reply.png): 初版レイアウトの証跡（前回投稿参照と5〜8枚目を同じ返信に入れていたため、修正版では使用しない）。

### 公開後のURLと親子関係

- メイン投稿: [2086003612577300719](https://x.com/hAru_mAki_ch/status/2086003612577300719)
- 前回投稿参照返信: [2086004308009762957](https://x.com/hAru_mAki_ch/status/2086004308009762957)（親: メイン投稿）
- 5〜8枚目返信: [2086004335071355100](https://x.com/hAru_mAki_ch/status/2086004335071355100)（親: 前回投稿参照返信）
- GitHub返信: [2086004347108999519](https://x.com/hAru_mAki_ch/status/2086004347108999519)（親: 5〜8枚目返信）

Xへの送信後、ローカルのpost historyにも4件を保存し、本文長・添付数・親ポストIDを確認した。今後記事化する場合は、公開済みURLをこの節と[GLM5.2-SLIDES-EXPERIMENT.md](GLM5.2-SLIDES-EXPERIMENT.md)から再利用できる。

## 17. 共同ホワイトボードGadget実験（2026-08-08）

Cloudflare OSの上流READMEにある「Make a collaborative whiteboard app.」を、プロジェクト内LiteLLMの`glm-5.2`へ切り替えた環境で再現した。これは内蔵の固定Whiteboard機能を開く実験ではなく、エージェントに共同編集アプリを新規Gadgetとして生成させる実験である。

### 実行結果

- `共同ホワイトボード検証`というGadgetをゼロから作成。
- `server.js`相当のDurable Objectに`notes` / `strokes`共有状態、イベント連番、イベントログ、presence、購読通知、永続化を実装。
- `client.js`相当のUIにSelect / Draw / Erase、付箋、描画、Connected collaborators、Recent events、Smoke testを実装。
- 生成途中に`writeFile`引数エラーとCloudflare Durable Object Storage APIの複数キー読み出し誤認が発生したが、エージェントがログを読み、コードを修正して再実行。
- エージェント報告の22項目スモークテストが`passed=true`。UI上のSmoke testにも`PASSED`と各チェックが表示された。
- 2つのブラウザタブを同じGadgetへ接続し、`users: 2`、`events: 19`、`notes: 6`、`strokes: 3`を確認。
- タブBで追加した`共同編集テスト：タブB`がタブAへリアルタイム反映された。
- 再読み込み後も付箋、描画、イベント数が復元された。
- Share modalで`Gadget only`共有リンクを作成し、別アカウントの参加とGadget操作を確認した。Collaborator削除は成功したが、Revoke操作はUIエラーが出てリンク一覧から消えなかった（詳細は次節）。

### スクショ

- 生成前・依頼: [98](artifacts/screenshots/98-whiteboard-home.png), [99](artifacts/screenshots/99-whiteboard-prompt.png)
- エージェント進行: [100](artifacts/screenshots/100-whiteboard-agent-start.png)〜[103](artifacts/screenshots/103-whiteboard-code-generated.png)
- 失敗から修正: [104](artifacts/screenshots/104-whiteboard-agent-next-step.png)〜[108](artifacts/screenshots/108-whiteboard-retest.png)
- UIスモークテスト・確定: [109](artifacts/screenshots/109-whiteboard-smoke-test.png), [110](artifacts/screenshots/110-whiteboard-accepted.png)
- 付箋・描画: [111](artifacts/screenshots/111-whiteboard-note-edit.png)〜[113](artifacts/screenshots/113-whiteboard-drawing-persisted.png)
- 共同編集: [114](artifacts/screenshots/114-whiteboard-two-tabs-presence.png), [115](artifacts/screenshots/115-whiteboard-realtime-tabB-to-tabA.png)
- 永続性・最終状態: [116](artifacts/screenshots/116-whiteboard-reload-persistence.png), [117](artifacts/screenshots/117-whiteboard-final.png)

詳細な依頼文、実装の観測内容、検証値、未確認範囲は[WHITEBOARD-EXPERIMENT.md](WHITEBOARD-EXPERIMENT.md)にまとめた。元スクショは加工せず`artifacts/screenshots/`に保存し、証跡ギャラリーをtailnet限定8890番で配信している。

## 18. 別アカウント共有リンク実験（2026-08-08）

前節の2タブ検証が同一アカウントだったため、今回は認証状態が分離された別オリジンのブラウザーセッションで、実験用Collaboratorアカウントを作成した。OwnerのWorkspaceから`Gadget only`の共有リンクを発行し、Collaboratorがそのリンクで同じGadgetへ参加した。

### 観測結果

- Collaborator側はOwnerのWorkspaceに`by cloudflareos`として入り、GadgetのUIを利用できた。
- Collaborator側にはOwnerのチャット、Code、Connections、Share操作が表示されず、Gadget操作に限定された。
- Collaboratorから付箋`別アカウントCollaborator：リアルタイム追加`を追加した。
- 約2.3秒後、Owner側にも同じ付箋が現れ、両画面で`events: 21`、`notes: 7`、`strokes: 3`、`users: 3`を確認した。
- `users: 3`は、Owner・Collaboratorに加えて前回検証のpresenceがheartbeat期限まで残った値であり、presenceの離脱表示には遅延がある。

### 証跡スクショ

- 共有設定: [118](artifacts/screenshots/118-multiuser-owner-share-modal.png)
- Collaborator参加: [119](artifacts/screenshots/119-multiuser-collaborator-joined.png)
- Collaboratorの付箋追加: [120](artifacts/screenshots/120-multiuser-collaborator-realtime-note.png)
- Owner側の同期途中: [121](artifacts/screenshots/121-multiuser-owner-realtime-note.png)
- Owner側の最終同期: [122](artifacts/screenshots/122-multiuser-owner-sync-final.png)
- 共有管理エラー: [123](artifacts/screenshots/123-multiuser-revoke-error.png)

### 権限と後片付け

今回の`Gadget only`は「アプリを使う」権限として機能し、Gadget内の付箋追加は許可された。一方、Workspaceそのものを編集するUIはCollaborator側に表示されなかった。Ownerから実験用Collaboratorを削除すると`Collaborator removed.`が表示され、アクセス削除は成功した。

share linkのRevoke操作では`The execution context which hosts this callback is no longer running.`と`Failed to load sharing info`が表示され、リンクが一覧から消えない挙動を観測した。したがって、今回の記録では「リンクを無効化した」とは断定せず、共有管理UIの未解決事象として残す。テスト用リンクはtailnet限定環境で作成し、トークン自体はMarkdown・README・公開ペイロードへ記録していない。

詳細は[WHITEBOARD-EXPERIMENT.md](WHITEBOARD-EXPERIMENT.md)に統合した。

## 19. HyperFramesで共同編集スクショを説明化（2026-08-08）

別アカウント実験のスクショ118〜123は、UIの情報量が多く、画像単体では「誰が何をしたか」が読み取りにくかった。そこでHyperFramesで、元スクショを証拠カードとして残しつつ、操作・参加者・結果・確認ポイントを説明する38秒のwalkthroughを作成した。

### 画面で説明した内容

- 表紙: Owner → Gadget only → Collaborator → Realtime syncという実験の因果関係。
- 共有: Ownerが`Gadget only`のshare linkを発行した。
- 参加: 別アカウントがWorkspace編集権限ではなくGadget利用画面へ入った。
- 入力: Collaboratorが付箋を追加し、`notes: 6 → 7`になった。
- 確認: Owner側で同じ付箋、presence、Recent eventsが観測され、`events: 21 / notes: 7 / strokes: 3 / users: 3`に収束した。
- 制限: Collaborator削除は成功した一方、share linkのRevokeはUIエラーになり、リンク一覧から消えなかった。

### 成果物と検査

- 構成ソース: [artifacts/hyperframes/multiuser-explainer/index.html](artifacts/hyperframes/multiuser-explainer/index.html)
- デザイン定義: [artifacts/hyperframes/multiuser-explainer/DESIGN.md](artifacts/hyperframes/multiuser-explainer/DESIGN.md)
- 38秒動画: [artifacts/screenshots/hyperframe-multiuser-explainer.mp4](artifacts/screenshots/hyperframe-multiuser-explainer.mp4)
- 説明フレーム: [124](artifacts/screenshots/124-hyperframe-multiuser-title.png)〜[129](artifacts/screenshots/129-hyperframe-cleanup-finding.png)
- `hyperframes check --json`: runtime/layoutエラー0、コントラスト69/69合格。
- `hyperframes lint --json`: エラー0、警告0。

元スクショは加工せず、HyperFrames側の説明パネルと対応番号で意味を補った。動画は証拠そのものを置き換えるものではなく、スクショを読む順番と観測結果を明示する補助証拠として扱う。

## 20. 投稿用スライド画像へ再構成（2026-08-08）

前節の説明フレームは、スクショを読むための証拠動画としては有効だったが、そのままXへ投稿するとメモ・ダッシュボードに見える問題があった。そこで、説明動画とは別に、結果ファーストの3:2カルーセルを作成した。

- 表紙: 「別アカウントでも、共同編集できた。」
- 2枚目: `Gadget only`共有リンクの発行。
- 3枚目: Collaboratorの参加と権限範囲。
- 4枚目: 付箋追加と`notes 6 → 7`。
- 5枚目: Owner側へのリアルタイム同期と4つの観測値。
- 6枚目: 共同編集の実証と、Revokeの未解決事項。

成果物は[130](artifacts/screenshots/130-cloudflare-os-multiuser-slide-1-title.png)〜[135](artifacts/screenshots/135-cloudflare-os-multiuser-slide-6-verdict.png)。全画像1920×1280、3:2で、Xへ直接添付できる形式として保存した。プレビュー動画は[cloudflare-os-multiuser-social-slides.mp4](artifacts/screenshots/cloudflare-os-multiuser-social-slides.mp4)、構成ソースは[artifacts/hyperframes/multiuser-social-slides/index.html](artifacts/hyperframes/multiuser-social-slides/index.html)にある。

## 21. 共同ホワイトボード続編X投稿シミュレーション（2026-08-08）

前回のGLM 5.2 Slides投稿（[2086003612577300719](https://x.com/hAru_mAki_ch/status/2086003612577300719)）の続編として、別アカウント共有リンク実験を`Cloudflare OS × 共同ホワイトボード やってみた❸`にした。メイン投稿に添付4枚、前回投稿URLだけの添付なし返信、続編の添付2枚、GitHub URLの別返信に分離した。この節は公開前シミュレーション時点の記録であり、承認後の実際の公開結果は次節に追記した。

### 構成

- メイン: `Gadget only`共有、別アカウント参加、付箋のリアルタイム同期、RevokeのUIエラーを説明。添付は130〜133。
- 前回投稿参照返信: 前回のGLM 5.2スライド検証へのURLを1件だけ掲載。
- 続編メディア返信: Owner → Collaborator → 付箋追加 → Owner同期の流れと、events: 21 / notes: 7 / strokes: 3 / users: 3を説明。添付は134〜135。
- GitHub別返信: `cloudflare-os-home`のURLを1件だけ掲載。新しい検証記録の反映後に使用する想定。

### 検証結果

`C:\\Users\\makim\\.codex\\skills\\sunwood-build-in-public\\scripts\\preflight.ps1`に、実際の本文・返信文・添付6枚・TailscaleシミュレーターURLを渡し、`ok: true`を確認した。本文は191文字、返信は161 / 161 / 115文字、添付は全て1920×1280・3:2だった。メイン本文はURLなし、返信ごとのURLは1件以下、各投稿の添付は4件以下である。

### Tailscaleシミュレーター証跡

- シミュレーター: `https://<tailnet-host>:8891/`（tailnet限定）
- ソース: [artifacts/x-post-simulator/index.html](artifacts/x-post-simulator/index.html)
- [136-x-post-simulator-multiuser-top.png](artifacts/screenshots/136-x-post-simulator-multiuser-top.png): メイン4枚と公開前チェック
- [137-x-post-simulator-multiuser-middle.png](artifacts/screenshots/137-x-post-simulator-multiuser-middle.png): 前回投稿参照返信までの直列表示
- [138-x-post-simulator-multiuser-bottom.png](artifacts/screenshots/138-x-post-simulator-multiuser-bottom.png): 続編2枚とGitHub別返信

画像130〜135は、実スクショ118〜123を元にHyperFramesで再構成した投稿用ビジュアルであり、実験の元スクショそのものではない。元スクショは加工せず、証拠ギャラリー8890番に保持している。

## 22. 共同ホワイトボード続編Xスレッドの公開結果（2026-08-08）

公開前シミュレーターで確認したペイロードについて、ユーザー承認後に内容を変更せず、`@hAru_mAki_ch`へメイン1件＋自己返信3件の直列スレッドとして公開した。公開時の実験成果物は、コミット[462f079](https://github.com/Sunwood-ai-labs/cloudflare-os-home/commit/462f079c0bc659accb0cd00aae5ba58f715ec231)で`main`へ反映済みだった。

### 公開された投稿チェーン

| 順序 | 投稿 | 親投稿 | 添付・本文内リンク |
| --- | --- | --- | --- |
| 1 | [メイン: 2086048448328204347](https://x.com/hAru_mAki_ch/status/2086048448328204347) | なし | 画像130〜133、URLなし |
| 2 | [返信: 2086048845205798939](https://x.com/hAru_mAki_ch/status/2086048845205798939) | メイン`2086048448328204347` | 添付なし、前回投稿URL |
| 3 | [返信: 2086048941033009238](https://x.com/hAru_mAki_ch/status/2086048941033009238) | 返信1`2086048845205798939` | 画像134〜135、観測値とRevokeエラー |
| 4 | [返信: 2086049016979374574](https://x.com/hAru_mAki_ch/status/2086049016979374574) | 返信2`2086048941033009238` | 添付なし、GitHub URL |

### 公開後に確認したこと

- X上のrecent取得で4件すべての投稿ID、作成時刻、本文を確認した。
- メイン投稿の本文は191文字、返信は161 / 161 / 115文字で、承認済みペイロードと一致した。
- Xの添付数はメイン4枚、検証結果返信2枚で、各投稿の上限内だった。
- 前回投稿URLとGitHub URLは同じ返信へ混在させず、それぞれ別返信に分離した。
- ローカルpost historyへ4件を個別保存し、メイン・各返信の親投稿ID、添付ファイル、SHA-256、コミット、検証証拠を記録した。

この公開は、実験結果を「シミュレーター上の案」から「公開済みの再現可能な記録」へ移したものとして扱う。ただし、X投稿の反応数は機能の正しさを示す検証値ではなく、機能の判定根拠は元スクショ118〜123と[WHITEBOARD-EXPERIMENT.md](WHITEBOARD-EXPERIMENT.md)の実験ログである。
