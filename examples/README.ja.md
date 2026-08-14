# Examples

Cloudflare OS Homeを他の環境でも試しやすくする、公開用の再利用サンプルです。

各サンプルに、入力、期待する結果、実装箇所、現在の制限をまとめます。合成データまたはローカルデータだけを使い、認証情報、顧客データ、tailnet限定URL、公開履歴は入れません。

## 収録サンプル

### Gatekeeper：顧客間送信の書き込みブロック

場所：[gatekeeper-cross-customer-block](gatekeeper-cross-customer-block/)

顧客Aと顧客Bをまたぐ送信・共有操作を想定した自作MCPの `add_task` 書き込みを、Gatekeeperの実行前で止める、オプトインのローカル実験です。

- [English guide](gatekeeper-cross-customer-block/README.md)
- [日本語ガイド](gatekeeper-cross-customer-block/README.ja.md)
- [ブロックされる入力](gatekeeper-cross-customer-block/fixtures/blocked-add-task.json)
- [通過する入力](gatekeeper-cross-customer-block/fixtures/allowed-add-task.json)
- [Monitor期待値](gatekeeper-cross-customer-block/fixtures/expected-monitor-event.json)

状態：Cloudflare OS Homeの実験ブランチで実測済み。ただし、汎用ポリシーエンジンやCloudflareのマネージド機能ではありません。

### Agentic Gadgetスモークテスト

既存の[Agentスモークテスト](../qa/agentic-gadget-smoke.mjs)は、起動したワークスペースに最小Gadgetを作らせ、コードを実行し、結果を返させます。起動後の一通りの確認に使えます。

## サンプルを追加するとき

各サンプルは小さく、安全にコピーできる形にします。

1. シナリオと前提条件を書く。
2. 繰り返し使う入力は合成データのfixtureにする。
3. 実測結果と制限事項を分けて書く。
4. 実装箇所とローカル確認方法を示す。

秘密情報、実顧客データ、非公開エンドポイント、公開履歴の追跡情報は、このディレクトリに置きません。
