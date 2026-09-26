# アーキテクチャ

## 実行フロー

```text
ブラウザー
  │ localhost:8877 またはtailnet限定Tailscale Serve
  ▼
Cloudflare OSコンテナ
  │ http://litellm:4000/v1
  ▼
プロジェクト内LiteLLM
  │
  ▼
モデルプロバイダー経路
```

## 責務

| コンポーネント | 責務 |
| --- | --- |
| Cloudflare OS | Workspace UI、履歴、エージェントループ、Gadgetツール、レビュー可能なDraft |
| LiteLLM | OpenAI互換ゲートウェイ、プロバイダールーティング、モデル別名、master-key認証 |
| Docker Compose | プライベートなサービスネットワークと再現可能な起動 |
| Tailscale Serve | ローカルポートへのtailnet限定HTTPSアクセス（任意） |
| QAスクリプト | 認証情報を保存しないブラウザーフローとスクショ取得 |

## 内部URLが重要な理由

Cloudflare OSコンテナからLiteLLMコンテナへlocalhostでは接続できません。Composeネットワークではサービス名`litellm`が解決されるため、内部URLは`http://litellm:4000/v1`です。

ホストの診断用ポートは別で、localhostにだけbindします。これによりモデルゲートウェイを公開ネットワーク経路から外せます。

## エージェントの境界

Cloudflare OSがエージェントループと、Gadget作成、ファイル書き込み・編集、コード実行などのツール定義を持ちます。LiteLLMはモデルアクセスを提供するだけで、通常のチャットをエージェントに変換するものではありません。

## ソースの境界

ラッパーは`THIRD-PARTY-NOTICES.md`に記録した上流リビジョン（2026-09-26時点の`004ab773fad6d4fb7fe67be920a3ef37e46dc58a`）を固定しています。上流ライセンスは`upstream/cloudflare-os/LICENSE`に残しています。本リポジトリは非公式のローカル統合です。

`upstream/cloudflare-os/`を本家の最新`main`（または特定コミット）へ更新し、コンテナ用オーバーレイ（`scripts/run-dev-server.ts`における`CFOS_DISABLE_DEV_WATCHERS`、`WRANGLER_DEV_IP`、`PUBLIC_BASE_URL`に基づくGatekeeper OAuth URL生成）を再適用するには次を実行します。

```powershell
.\scripts\sync-upstream.ps1
docker compose up --build -d
```
