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

ラッパーはTHIRD-PARTY-NOTICES.mdに記録した上流リビジョンを固定しています。上流ライセンスはupstream/cloudflare-os/LICENSEに残しています。本リポジトリは非公式のローカル統合です。
