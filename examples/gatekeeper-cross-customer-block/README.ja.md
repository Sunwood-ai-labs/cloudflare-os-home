# Gatekeeper：顧客間送信の書き込みブロック

合成データを使った顧客間送信リクエストを、Gatekeeperの実行前で止める、オプトインのローカル実験です。

対象は意図的に狭くしています。

- MCPサーバー：`task-manager-streamable-http`
- MCPツール：`add_task`
- 条件：引数の文字列に顧客A、顧客B、送信・共有系の語が同時に含まれる
- 結果：ActionStoreへ保留する前、MCPへ転送する前に拒否する

Cloudflare OS Homeのローカル実験であり、本番向けの認可ポリシー、汎用的な顧客境界エンジン、Cloudflare OSの公式機能ではありません。

## 前提

- Cloudflare OS Homeを起動できること
- `add_task`を公開するStreamable HTTP MCPサーバーがあること
- AdminのGatekeepers画面からMCPを接続していること
- 合成データだけを使うこと

元の実験で使った最小タスクMCPはLab側で管理しています。このサンプルは特定のローカルパスに依存せず、上記のサーバー名とツール名に対応するMCPを使えます。

## 実験を有効にする

リポジトリ直下の `.env` にオプトインフラグを設定します。

```dotenv
CFOS_EXPERIMENTAL_MCP_BLOCK_CROSS_CUSTOMER=true
```

その後、Cloudflare OSサービスを再ビルドします。

```powershell
docker compose up --build -d cloudflare-os
```

ComposeがこのフラグをCloudflare OSサービスへ渡します。既定値は無効です。

## ブロックされるケース

[fixtures/blocked-add-task.json](fixtures/blocked-add-task.json) の値で、接続済みMCPの `add_task` を実行します。通常の承認カードが作成される前に拒否されるはずです。

Admin → Monitorを開き、[fixtures/expected-monitor-event.json](fixtures/expected-monitor-event.json) と照合します。見る項目は次のとおりです。

- `action.blocked`
- outcome `rejected`
- policy code `cross-customer-destination`
- Gatekeeper、Actor、Operation、Resource、Actionの識別子
- タスクMCPのデータが変化していないこと

## 通過する比較ケース

[fixtures/allowed-add-task.json](fixtures/allowed-add-task.json) を使います。顧客間送信のパターンを含まないため、この実験ルールは通常のGatekeeper処理へ戻します。常時許可のリストを定義するfixtureではありません。

## 実装箇所

- [Gatekeeperルール](../../upstream/cloudflare-os/packages/gatekeeper-mcp/src/mcp.ts)
- [Composeフラグ](../../docker-compose.yml)
- [Monitor画面](../../upstream/cloudflare-os/packages/workshop-frontend/src/components/GatekeeperMonitorPanel.tsx)
- [実験記録](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)

## 制限事項

現在のルールは実験用の文字列判定です。対象は1つのMCPサーバーと1つのツールに限られ、構造化された顧客ID、送信先ID、Workspace ID、tenantの所有関係、allowlistは見ていません。実顧客データの制御を、このルールだけに任せないでください。

実運用へ近づける次の段階は、送信先と所有関係を構造化属性として判定へ渡し、allow、deny、audit、複数tenant境界を別々に検証することです。
