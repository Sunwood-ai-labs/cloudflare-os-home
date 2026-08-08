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

## 共同ホワイトボード実験

「Make a collaborative whiteboard app.」を`LiteLLM · glm-5.2`で実行し、エージェント生成Gadgetの共同編集を確認しました。固定のホワイトボード機能ではなく、Durable Objectの共有状態、付箋、描画、presence、イベント配信を持つアプリが生成されます。さらに別アカウントが`Gadget only`共有リンクへ参加し、付箋をOwnerへ同期できることも確認しました。

| チェックポイント | スクリーンショット |
| --- | --- |
| 22項目の再テスト | [108-whiteboard-retest.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/108-whiteboard-retest.png) |
| UIスモークテスト | [109-whiteboard-smoke-test.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/109-whiteboard-smoke-test.png) |
| 2タブpresence | [114-whiteboard-two-tabs-presence.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/114-whiteboard-two-tabs-presence.png) |
| リアルタイム同期 | [115-whiteboard-realtime-tabB-to-tabA.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/115-whiteboard-realtime-tabB-to-tabA.png) |
| reload後の保持 | [116-whiteboard-reload-persistence.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/116-whiteboard-reload-persistence.png) |
| 別アカウント参加 | [119-multiuser-collaborator-joined.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/119-multiuser-collaborator-joined.png) |
| 別アカウントのリアルタイム同期 | [120-multiuser-collaborator-realtime-note.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/120-multiuser-collaborator-realtime-note.png) / [122-multiuser-owner-sync-final.png](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/122-multiuser-owner-sync-final.png) |

全スクショ、別アカウントの権限結果、後片付け時のエラー、未検証範囲は[共同ホワイトボード実験記録](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/WHITEBOARD-EXPERIMENT.md)にまとめています。

### HyperFramesでスクショの意味を読む

6枚の生スクショは、[38秒のHyperFrames説明動画](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/hyperframe-multiuser-explainer.mp4)にもまとめています。[構成ソース](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/hyperframes/multiuser-explainer/index.html)では、各シーンを共有・参加・入力・同期・後片付けの制限として表示しています。[124](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/124-hyperframe-multiuser-title.png)〜[129](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/129-hyperframe-cleanup-finding.png)の説明フレームは、元スクショを残したまま、横に操作と観測結果を追加したものです。

投稿用には、別途[6枚の3:2カルーセル](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/artifacts/screenshots/130-cloudflare-os-multiuser-slide-1-title.png)を用意しました。結果を先に出す表紙と、操作・結果を短くまとめたスライドです。[130〜135](https://github.com/Sunwood-ai-labs/cloudflare-os-home/tree/main/artifacts/screenshots)から全画像を確認できます。

この続編は4件のXスレッドとして公開しました。[メイン投稿](https://x.com/hAru_mAki_ch/status/2086048448328204347)、[前回投稿参照返信](https://x.com/hAru_mAki_ch/status/2086048845205798939)、[検証結果返信](https://x.com/hAru_mAki_ch/status/2086048941033009238)、[GitHub返信](https://x.com/hAru_mAki_ch/status/2086049016979374574)の順です。ペイロード、親投稿ID、公開前後の確認は[WHITEBOARD-EXPERIMENT.md](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/WHITEBOARD-EXPERIMENT.md)に記録しています。

## 重要な制約

最初の通常チャットではCloudflare OSについて誤った説明も返りました。これは有用な証拠として残しています。チャット文章だけでは、根拠のある製品知識やエージェント実行と同じではありません。
