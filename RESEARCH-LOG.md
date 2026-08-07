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

## 11. 全スクリーンショット一覧

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

## 12. 再現用ファイル

- [README.md](README.md): 起動方法、LiteLLM、Tailscale、費用と制約
- [QA.md](QA.md): 実行済み検証チェックリスト
- [docker-compose.yml](docker-compose.yml): Cloudflare OS + project-local LiteLLM
- [scripts/verify-project-litellm.ps1](scripts/verify-project-litellm.ps1): LiteLLM疎通確認
- [scripts/enable-tailscale-serve.ps1](scripts/enable-tailscale-serve.ps1): Tailscale Serve設定
- [qa/agentic-gadget-smoke.mjs](qa/agentic-gadget-smoke.mjs): エージェント実験の送信
- [qa/agentic-wait-and-evidence.mjs](qa/agentic-wait-and-evidence.mjs): 完了待ちと証跡取得
