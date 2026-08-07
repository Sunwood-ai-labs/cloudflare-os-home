# 証跡

本リポジトリの結論は、ソース証拠、UI証拠、実行証拠に分けて記録しています。

## ソース証拠

- 上流READMEにエージェント中心のWorkspaceとGadgetの説明があります。
- Backendのagent実装にエージェントループとツール定義があります。
- Frontendがツール呼び出しの要約とPending changesを表示します。

ソースパスと解釈は[調査ログ](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/RESEARCH-LOG.md)から確認できます。

## UI証拠

| チェックポイント | スクリーンショット |
| --- | --- |
| モデル登録 | [11-network-model-configured.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/11-network-model-configured.png) |
| Tailscaleチャット | [12-tailscale-chat-response.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/12-tailscale-chat-response.png) |
| エージェント依頼 | [15-agent-request-sent.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/15-agent-request-sent.png) |
| エージェント完了 | [17-agent-gadget-complete.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/17-agent-gadget-complete.png) |

## 実行証拠

エージェントスモークテストはAgent ProofというGadgetを作成し、server.jsとclient.jsを書き、コードを実行し、Gadgetへのアクセスを確認し、レビュー待ちの変更を残しました。モデルの説明だけでなく、アプリUIで結果を観測しています。

## 重要な制約

最初の通常チャットではCloudflare OSについて誤った説明も返りました。これは有用な証拠として残しています。チャット文章だけでは、根拠のある製品知識やエージェント実行と同じではありません。
