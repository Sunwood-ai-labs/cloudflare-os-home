# 証跡

このランタイムリポジトリには、ローカル環境を起動・運用するためのQAだけを残しています。詳細な機能実験、元スクショ、HyperFrames、X投稿記録、時系列の調査ログは、分離した[Cloudflare OS Home Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)で管理しています。

## ランタイム側の証跡

次の項目は、このリポジトリの`qa/`とCIで確認します。

- Compose設定とプロジェクト内LiteLLM経路
- ローカル認証、モデル登録、チャット永続化、レスポンシブ表示のブラウザーQA
- Gadgetを作成し、ファイルを書き、コードを実行し、Pending changesを残すAgentスモークテスト
- tailnet限定ホストを使うTailscale Serve設定

認証情報やプライベートなブラウザー状態は、このリポジトリに置かないでください。

## 検証Lab側の証拠

完全な証拠マップはLabリポジトリを参照してください。

- [実験記録インデックス](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab#-実験記録インデックス)
- [元スクショ](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/tree/main/artifacts/screenshots)
- [HyperFramesのソースと静止画](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/tree/main/artifacts/hyperframes)
- [調査ログ](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/RESEARCH-LOG.md)
- [QAチェック](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab/blob/main/QA.md)

この分離は意図的なものです。起動用リポジトリはcloneしやすく保ち、増え続ける検証記録はLab側へ集約します。
