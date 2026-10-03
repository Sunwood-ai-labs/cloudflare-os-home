<div align="center">
  <img src="docs/public/logo.svg" alt="Cloudflare OS Home ロゴ" width="96" />
  <h1>Cloudflare OS Home</h1>
  <p>Cloudflare OS + プロジェクト内LiteLLM + Docker Compose + Tailscaleのセルフホスト構成。</p>
  <p>
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/ci.yml"><img src="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/ci.yml/badge.svg" alt="Repository QA" /></a>
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/pages.yml"><img src="https://github.com/Sunwood-ai-labs/cloudflare-os-home/actions/workflows/pages.yml/badge.svg" alt="Docs deployment" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-E66A3C.svg" alt="Apache-2.0 license" /></a>
    <a href="https://docs.docker.com/compose/"><img src="https://img.shields.io/badge/Docker%20Compose-ready-2496ED.svg?logo=docker&logoColor=white" alt="Docker Compose" /></a>
  </p>
  <p>
    <a href="README.md">English</a>
    ·
    <a href="https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/">ドキュメント</a>
    ·
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab">検証Lab</a>
    ·
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/issues">Issues</a>
  </p>
</div>

## ✨ これは何か

Cloudflare OS Homeは、Cloudflare OSをエージェント中心のワークスペースとして試すための、再現可能なローカル実行環境です。上流ソース、プロジェクト内LiteLLM、Docker Composeネットワーク、Tailscale Serve手順、ブラウザーQAを一つの運用リポジトリにまとめています。

非公式のローカル統合であり、Cloudflareがホストする製品や公式ディストリビューションではありません。詳細な実験、スクショ、HyperFrames、機能の結論は分離した[Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)に保存しています。

## 🚀 含まれるもの

- 上流リビジョン`004ab773`（2026-09-26時点：`workerd 1.20260921.1`、Pi `0.87.1`、子エージェントとWorktree、Restrictedモードの全文手動承認、Gitベース保存）に固定したCloudflare OSソース
- `http://litellm:4000/v1`のOpenAI互換プロジェクト内LiteLLM
- Claude Code（GLM）、Codex、Antigravity、Hermes AgentをローカルのログインでLiteLLMモデル`claude-code-glm`・`codex`・`antigravity`・`hermes`として使う`agent-runner`
- `.env`から認証情報を読む32モデル構成テンプレート（`glm-4.7`、`glm-5.2`、`glm-5.3-flash`と任意のエージェント5経路を含む）
- `upstream/cloudflare-os/`を更新してローカルコンテナ用オーバーレイを再適用する同期スクリプト（`scripts/sync-upstream.ps1`）
- 外部のOpen WebUIネットワークに依存しないDocker Compose構成
- 任意のTailscale Serveによるtailnet限定HTTPS
- モデル登録、チャット永続化、レスポンシブ表示、Agentic Gadget作成のブラウザーQA
- 詳細な検証を別管理するLabリポジトリへの導線

## 🧭 目的別の入口

| 目的 | 入口 |
| --- | --- |
| ローカルワークスペースを起動する | [クイックスタート](#-クイックスタート) |
| 本家Cloudflare OSの最新コミットを取り込む | [上流の更新取り込み](#-上流cloudflare-osの更新取り込み) |
| コンテナ構成を理解する | [アーキテクチャ](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/architecture) |
| Agentの動作を再現する | [Agentスモークテスト](#-エージェントスモークテスト) |
| tailnet限定アクセスを設定する | [Tailscaleアクセス](#-tailscaleアクセス) |
| 実験結果とスクショを見る | [Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab) |
| 起動失敗を調べる | [トラブルシュート](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/troubleshooting) |

## ⚡ クイックスタート

前提: Linux engineを有効にしたDocker DesktopとPowerShell。

```powershell
git clone https://github.com/Sunwood-ai-labs/cloudflare-os-home.git
Set-Location cloudflare-os-home
Copy-Item .env.example .env
notepad .env
docker compose up --build -d
```

`http://localhost:8877`を開き、初回にローカルアカウントを作成してください。最低限、`.env`の`LITELLM_MASTER_KEY`を設定します。プロバイダーAPIキーは利用する経路だけに必要です。AWSプロファイルは任意で、コミット対象にはなりません。

停止:

```powershell
docker compose down
```

名前付きVolumeはローカルWorkerの状態を保持します。状態を意図的に削除するときだけ`docker compose down -v`を使ってください。

## 🔐 環境変数と秘密情報

`.env.example`はコピーできますが、意図的に未完成です。実値は`.env`に置きます。

- `LITELLM_MASTER_KEY` — プロジェクト内LiteLLM API用
- 必要に応じた`ZAI_API_KEY`、`NVIDIA_API_KEY`、`GEMINI_API_KEY`
- 外部ブラウザー接続で使う`CFOS_PUBLIC_BASE_URL`と`CFOS_BACKEND_HOST`
- 任意のBedrock Mantle経路で使うAWSプロファイル

`.env`、`secrets/`、AWSプロファイル、ブラウザー認証情報は絶対にコミットしないでください。[SECURITY.md](SECURITY.md)も確認してください。

## 🧩 アーキテクチャ

```text
ブラウザー
  │ http://localhost:8877 または tailnet限定Tailscale URL
  ▼
Cloudflare OSコンテナ
  │ http://litellm:4000/v1
  ▼
プロジェクト内LiteLLMコンテナ
  │
  ▼
設定済みモデルプロバイダー
```

Cloudflare OSはワークスペース、エージェントループ、Gadgetツール、レビュー可能な変更を担当します。LiteLLMはOpenAI互換のモデルルーティングを担当します。モデルは交換可能で、`glm-4.7`と`glm-5.2`で実行を確認しています。

### 構成図

編集可能なdraw.ioのソースは[`docs/cloudflare-os-architecture.drawio`](docs/cloudflare-os-architecture.drawio)です。リポジトリのREADMEから確認できるように、エクスポートしたSVGも掲載しています。

<p align="center">
  <img src="docs/cloudflare-os-architecture.drawio.svg" alt="Cloudflare OS Homeのシステム構成" width="100%" />
</p>

<p align="center"><em>実行アーキテクチャ：Docker Compose、Cloudflare OS、Gatekeeper、LiteLLM、外部プロバイダー。</em></p>

<p align="center">
  <img src="docs/cloudflare-os-repository-structure.drawio.svg" alt="Cloudflare OS Homeのリポジトリ構造" width="100%" />
</p>

<p align="center"><em>リポジトリ構造：ローカル統合ラッパーと固定した上流モノレポ。</em></p>

## 🧠 コーディングエージェント（Claude Code・Codex・Antigravity・Hermes）

Cloudflare OS本体のエージェントはPiです。`agent-runner`サービスは、外部のコーディングエージェント4種を選択可能なモデルとして追加します。OpenMausBotのPodman構成（エンジンはコンテナ内、ログインはローカルのものを使用）を参考にしています。

| LiteLLMモデル | エージェント | ログイン／モデル |
| --- | --- | --- |
| `claude-code-glm` | Claude Code | プロジェクト内LiteLLM経由のGLM（`glm-5.2`） |
| `codex` | Codex CLI | ホストの`~/.codex/auth.json`（`CODEX_AUTH_FILE`） |
| `antigravity` | Antigravity ACPサーバー | Podman machine内のOpenMausBotのLinuxランタイムとログイン済みプロファイル |
| `hermes` | Hermes Agent（`hermes acp`） | プロジェクト内LiteLLM経由のGLM（`glm-5.2`） |

`agent-runner`はComposeネットワーク内だけで待ち受けます。ツールを含まないリクエストは`/workspace/<agent>`、Piと連携するリクエストは専用のワークスペースで実行します。そこでのファイル編集は許可、シェルコマンドは自動承認しません。Piのツール結果を待つ間はエージェント処理を保持します。Cloudflare OSには他のLiteLLMモデルと同様に登録します（**Other OpenAI...**、API URL `http://litellm:4000/v1`）。

外部エージェントは任意機能です。通常の起動手順では、エージェントの認証ファイルやマウントは不要です。
4種すべてを有効にする場合は、`.env`へ強固な`AGENT_RUNNER_TOKEN`と`CODEX_AUTH_FILE`、
`ANTIGRAVITY_RUNTIME_DIR`、`ANTIGRAVITY_PROFILE_DIR`を設定してください。Antigravityのパスは、
コンテナエンジンのLinux環境にあるACPランタイムとログイン済みプロファイルのディレクトリを指定します。
Claude CodeとHermesには、LiteLLMの`glm-5.2`経路の設定も必要です。

```powershell
docker compose -f docker-compose.yml -f docker-compose.agents.yml up --build -d
```

任意エージェントの管理には両方のComposeファイルを指定します。5つのLiteLLM経路はRunner起動後に利用できます。
未設定のエージェントは利用できない理由を返します。

### 🔗 PiとMCPの自動共有

Piのチャットで接続・許可したMCPは、`claude-code-glm`・`codex`・`antigravity`・`hermes`・`agent-team`でも利用できます。各エージェントには、そのモデルリクエストのPiツールを公開する`cloudflare_os` MCPが自動設定されます。`describeBinding`で接続先を確認し、`executeCode`で同じMCPバインディングを呼び出します。エージェントごとのMCP設定ファイルを用意する必要はありません。

呼び出しはPiへ戻して実行するため、チャットに許可した接続範囲、観測ログ、書き込み承認が適用されます。接続先のOAuthトークンは外部エージェントへ渡しません。接続の追加・変更は、次のモデルリクエストから反映されます。

エージェントの処理はPiからツール結果が戻るまで保持します。保持期限やRunnerの再起動で処理が終了した場合は、記録済みのツール結果を含む履歴から再開します。詳しい手順は[使い方](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/usage#piと全エージェントでmcpを共有する)を参照してください。

### 🤝 エージェントチーム（`agent-team`）

5つ目のモデル`agent-team`は、4つのエージェントを共有ワークスペースで連携させます。Piのリクエストには専用のワークスペースを使い、Piツールを含まないリクエストでは`/workspace/agent-team`を使います。各段階の結果は終わった順にチャットへストリーミングされます。

1. 🧭 **計画**：Antigravityが実装計画を立てる（読み取り専用）
2. 🛠️ **実装**：Claude Code（GLM）がファイルを作成・編集する
3. 🔍 **レビュー**：Codexがファイルを読み、ネイティブの権限設定で許可された検証を行い、`VERDICT: APPROVE`か`CHANGES_REQUESTED`で判定する
4. 🩹 **修正**：`CHANGES_REQUESTED`ならClaude Codeが直してCodexが再レビュー（最大`TEAM_MAX_FIX_ROUNDS`回、既定2）
5. 📝 **まとめ**：Hermesがユーザー向けの最終回答を書く（読み取り専用）

役割は`TEAM_PLANNER`・`TEAM_IMPLEMENTER`・`TEAM_REVIEWER`・`TEAM_SUMMARIZER`で入れ替えられます。小さなタスクで2〜3分ほどです。段階アイコンはIconify CDN（`api.iconify.design`、ブラウザが取得）経由のFont Awesome 6 SVGで、`TEAM_ICONS=emoji`にすると絵文字に戻ります。`qa/agent-team-chat.mjs`でモデル登録からブラウザでの実行確認までできます。

## 🔄 上流Cloudflare OSの更新取り込み

`upstream/cloudflare-os/`は、コンテナ起動時に未検証の変更が混入しないよう特定コミット（2026-09-26時点の`004ab773fad6d4fb7fe67be920a3ef37e46dc58a`）に固定しています。本家`cloudflare/cloudflare-os`の最新`main`（または任意のコミット・ブランチ）を取り込み、ローカルコンテナ用オーバーレイを再適用するには次を実行します。

```powershell
.\scripts\sync-upstream.ps1
docker compose up --build -d
```

特定のリビジョンやブランチを指定する場合:

```powershell
.\scripts\sync-upstream.ps1 -Ref <commit-or-branch>
```

## 🌐 Tailscaleアクセス

Tailscale Serveを使うと、一般公開のFunnelを使わずtailnet限定HTTPSにできます。

```powershell
$env:CFOS_PUBLIC_BASE_URL = 'https://<your-tailnet-host>:8877'
$env:CFOS_BACKEND_HOST = '<your-tailnet-host>:8877'
docker compose up -d --force-recreate cloudflare-os
.\scripts\enable-tailscale-serve.ps1
```

ヘルパーが実際のtailnet URLを表示します。tailnet外へ共有する前に、公開範囲と認証方式を確認してください。

## 🤖 エージェントスモークテスト

同梱のスモークテストは、Cloudflare OSに最小Gadgetを作らせ、`server.js`と`client.js`を書かせ、コードを実行して結果を報告させます。認証情報は明示的に環境変数へ設定します。

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
$env:BASE_URL = 'http://localhost:8877'
node .\qa\agentic-gadget-smoke.mjs
```

成功すると、`Pending changes`、`Accept changes`、`Discard`を持つGadget Draftが作られます。詳細な解釈とスクショは[Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)に分離しています。

## 🧪 ランタイムQA

CIではComposeファイル、QAスクリプトの構文、公開payload除外、空白を確認し、同じワークフローでVitePressドキュメントもビルドします。実験機能の主張は[LabのQAチェック](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/QA.md)を参照してください。

## 📚 ドキュメント

- [はじめに](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/getting-started)
- [使い方](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/usage)
- [アーキテクチャ](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/architecture)
- [トラブルシュート](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/troubleshooting)
- [実験記録と証拠](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)

## 📜 ライセンス

本リポジトリはApache-2.0です。上流および第三者の注意事項は[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)を確認してください。
