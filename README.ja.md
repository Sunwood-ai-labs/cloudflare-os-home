<div align="center">
  <img src="docs/public/logo.svg" alt="Cloudflare OS Home ロゴ" width="96" />
  <h1>Cloudflare OS Home</h1>
  <p>Cloudflare OSを中心にした、個人用・セルフホスト型のエージェントワークスペース。</p>
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
    <a href="https://github.com/Sunwood-ai-labs/cloudflare-os-home/issues">Issues</a>
  </p>
</div>

## ✨ これは何か

Cloudflare OS Homeは、Cloudflare OSをエージェント中心のワークスペースとして試すための、再現可能なローカルラボです。上流Cloudflare OS、プロジェクト内LiteLLM、Docker Composeネットワーク、Tailscale Serve手順、スクリーンショット付きの検証結果を一つにまとめています。

目的は実用的な検証です。エージェントにGadgetを作らせ、ファイルを書かせ、コードを実行し、レビュー可能なDraftとして残す流れを確認できます。Cloudflare公式製品や公式ディストリビューションではありません。

## 🚀 含まれるもの

- 既知の上流リビジョンに固定したCloudflare OSソース
- `http://litellm:4000/v1` のOpenAI互換エンドポイントを持つプロジェクト内LiteLLM
- プロバイダー認証情報を`.env`から読む26モデル構成テンプレート
- 外部のOpen WebUIネットワークに依存しないDocker Compose構成
- Tailscale Serveによるtailnet限定HTTPSアクセス（任意）
- モデル登録、チャット永続化、レスポンシブ表示、Gadget作成を確認するブラウザQA
- 実際に確認した内容を残す調査ログとスクリーンショット

## 🧭 目的別の入口

| 目的 | 入口 |
| --- | --- |
| ローカルワークスペースを起動する | [クイックスタート](#-クイックスタート) |
| コンテナ構成を理解する | [アーキテクチャ](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/architecture) |
| エージェント実験を再現する | [エージェントスモークテスト](#-エージェントスモークテスト) |
| 証跡を見る | [調査ログ](RESEARCH-LOG.md) |
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

- プロジェクト内LiteLLM API用の`LITELLM_MASTER_KEY`
- 必要に応じた`ZAI_API_KEY`、`NVIDIA_API_KEY`、`GEMINI_API_KEY`
- ローカル以外のブラウザー接続で使う`CFOS_PUBLIC_BASE_URL`と`CFOS_BACKEND_HOST`
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

Cloudflare OSはワークスペース、エージェントループ、Gadgetツール、レビュー可能な変更を担当します。LiteLLMはOpenAI互換のモデルルーティングを担当します。モデルは交換可能で、今回の証跡では`glm-4.7`を使いました。

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

成功すると、`Pending changes`、`Accept changes`、`Discard`を持つGadget Draftが作られます。チャット文章だけでなく、実際にツール・ファイル・コード実行が動いたことを示す、このリポジトリの主要な証跡です。

## 📸 検証スクショ

代表的な4つのチェックポイントを、まず見た目で確認できます。画像をクリックすると元のPNGを開けます。[QA inventory](QA.md)には17個すべてのチェックポイントを記録しています。

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/11-network-model-configured.png"><img src="artifacts/screenshots/11-network-model-configured.png" alt="LiteLLMモデルをCloudflare OSに登録" width="100%" /></a>
      <br /><sub><b>1. モデル接続</b> — プロジェクト内LiteLLMのモデルを登録。</sub>
    </td>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/12-tailscale-chat-response.png"><img src="artifacts/screenshots/12-tailscale-chat-response.png" alt="Tailscale経由のCloudflare OSチャット" width="100%" /></a>
      <br /><sub><b>2. Tailscale経路</b> — ワークスペース接続とモデル応答を確認（回答品質の制約は調査ログに記載）。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/15-agent-request-sent.png"><img src="artifacts/screenshots/15-agent-request-sent.png" alt="Gadget作成を依頼するエージェントプロンプト" width="100%" /></a>
      <br /><sub><b>3. エージェント依頼</b> — ファイル作成・実行・テストを明示的に要求。</sub>
    </td>
    <td width="50%" valign="top">
      <a href="artifacts/screenshots/17-agent-gadget-complete.png"><img src="artifacts/screenshots/17-agent-gadget-complete.png" alt="変更レビュー可能なGadget Draft" width="100%" /></a>
      <br /><sub><b>4. Gadget Draft完成</b> — ファイル作成、コード実行、変更レビューまで確認。</sub>
    </td>
  </tr>
</table>

画像の意味や制約は[証跡ガイド](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/evidence)と[調査ログ](RESEARCH-LOG.md)にまとめています。

## 🧪 検証

```powershell
docker compose config --quiet
.\scripts\verify-project-litellm.ps1
```

[QA inventory](QA.md)に機能確認とスクリーンショットのチェックポイントを記録しています。[調査ログ](RESEARCH-LOG.md)には、結論、制約、Open WebUIとの比較、エージェント実験の詳細があります。

## 📚 ドキュメント

ブラウザーで読めるドキュメントは [sunwood-ai-labs.github.io/cloudflare-os-home](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/) で公開します。

ローカルで起動:

```powershell
Set-Location docs
npm ci
npm run docs:dev
```

英語と日本語のナビゲーションを用意しています。まずは[はじめに](https://sunwood-ai-labs.github.io/cloudflare-os-home/ja/guide/getting-started)または[Getting started](https://sunwood-ai-labs.github.io/cloudflare-os-home/guide/getting-started)から始めてください。

## 🗂️ リポジトリ構成

```text
cloudflare-os-home/
├─ upstream/cloudflare-os/   # 固定した上流ソース
├─ litellm/                  # プロジェクト内ゲートウェイのイメージと設定
├─ qa/                       # Playwrightスモークテストと証跡スクリプト
├─ scripts/                  # PowerShellヘルパー
├─ artifacts/screenshots/    # 公開する検証スクショ
├─ docs/                     # 日英VitePressドキュメント
├─ docker-compose.yml
├─ RESEARCH-LOG.md
└─ SECURITY.md
```

## ⚠️ 範囲と制約

- 本リポジトリはローカル開発・調査用であり、本番向け`workerd`セルフホスト構成ではありません。
- Cloudflare OS Cloud版の機能、料金、提供状況は、このローカルソースとは異なる場合があります。
- エージェントの挙動は選択したモデルに依存し、実行ごとに変わる可能性があります。
- 外部接続や実世界の操作には、Gatekeeperと認証情報の慎重な設定が必要です。
- 上流ソースは独自のApache-2.0条件に従います。[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)を確認してください。

## 📜 ライセンス

リポジトリのラッパーと同梱された上流ソースはApache-2.0条件で配布します。[LICENSE](LICENSE)とupstream/cloudflare-os/LICENSEを参照してください。
