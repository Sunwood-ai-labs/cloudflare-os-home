---
layout: home

hero:
  name: Cloudflare OS Home
  text: エージェント中心のローカルワークスペース
  tagline: Cloudflare OS + LiteLLM + Docker Compose + Tailscale
  image:
    src: /logo.svg
    alt: Cloudflare OS Home
  actions:
    - theme: brand
      text: はじめに
      link: /ja/guide/getting-started
    - theme: alt
      text: English
      link: /
    - theme: alt
      text: GitHubを見る
      link: https://github.com/Sunwood-ai-labs/cloudflare-os-home

features:
  - icon: 🧩
    title: エージェント中心
    details: Gadgetを作り、ファイルを書き、コードを実行して変更をレビューできます。
  - icon: 🔌
    title: モデルを持ち込める
    details: プロジェクト内LiteLLMを経由してOpenAI互換モデルを接続できます。
  - icon: 🛡️
    title: 最初からプライベート
    details: ローカル実行、またはTailscale Serveによるtailnet限定公開ができます。
  - icon: 📸
    title: 証跡付き
    details: 調査ログとスクリーンショットで、結論の根拠を確認できます。
---

# Cloudflare OS Home

Cloudflare OSを、エージェントが小さなアプリを作って実行できるワークスペースとして試すための、非公式・再現可能なローカルラボです。

上流ソース、Composeネットワーク内のLiteLLM、実際のGadgetスモークテストを一つにまとめています。

## 目的から始める

- [はじめに](guide/getting-started) — クリーンなcloneから起動する。
- [使い方](guide/usage) — モデル登録、チャット、エージェント依頼を試す。
- [アーキテクチャ](guide/architecture) — 各コンテナの責務を理解する。
- [証跡](guide/evidence) — スクリーンショットと確認済みの主張を見る。
- [トラブルシュート](guide/troubleshooting) — よくあるローカル障害から復旧する。

## 要約

```text
ブラウザー → Cloudflare OS → プロジェクト内LiteLLM → 設定済みモデルプロバイダー
```

Cloudflare OSはワークスペースとエージェントループを提供し、LiteLLMはモデルルーティングを提供します。公式Cloudflare Cloudサービスではなく、ローカル統合です。
