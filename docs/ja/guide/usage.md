# 使い方

Cloudflare OS Homeには、通常のモデルチャットとエージェント作業の2つの使い方があります。

## モデルを登録する

オンボーディングまたはProvider画面でOpenAI互換プロバイダーを選び、次を設定します。

- Model ID: LiteLLMが公開するID。例: glm-4.7
- API URL: Composeネットワーク内から見た`http://litellm:4000/v1`
- API token: プロジェクト内LiteLLMのLITELLM_MASTER_KEY

UIにモデル登録完了が表示されます。詳細なスクショと実験の解釈は[検証Lab](https://github.com/Sunwood-ai-labs/cloudflare-os-home-lab)で管理しています。

## 通常チャット

「Cloudflare OSとは？」のような質問は、モデルの文章回答だけで完了します。短い質問には便利ですが、ツールが呼び出された証拠にはなりません。モデルの知識が古い、または不足している場合もあります。

## エージェント作業

作業内容を具体化し、実行まで要求してください。例えば:

```text
Act as a coding agent, not a chat-only assistant.
Create a minimal Gadget named Agent Proof.
Write the files, execute a test, and report the result.
Do not only explain the steps.
```

成功すると、ファイル書き込み、コード実行、Gadget利用、Accept/Discard可能なPending Draftなどのツール活動が表示されます。

## Piと全エージェントでMCPを共有する

先に[エージェントの設定手順](https://github.com/Sunwood-ai-labs/cloudflare-os-home/blob/main/README.ja.md#-コーディングエージェントclaude-codecodexantigravityhermes)で任意のRunnerを有効にしてください。通常の環境ではネイティブエージェントの認証ファイルやマウントは不要です。

1. Cloudflare OSで「MCP Server」コネクターから接続先URLを登録し、対象チャットに利用を許可します。
2. 同じチャットで`claude-code-glm`、`codex`、`antigravity`、`hermes`、または`agent-team`を選びます。
3. 「接続済みMCPを調べ、読み取りツールで情報を取得して」と依頼します。Piのツール活動に`describeBinding`や`executeCode`が記録され、結果が外部エージェントへ返ります。

Runnerは、リクエストに含まれるPiツールを`cloudflare_os`というstdio MCPとして各エージェントへ自動設定します。呼び出しを通常のモデルツール応答としてPiへ返すので、LiteLLMのモデル登録やチャットの権限管理をそのまま使えます。OAuthのログインやMCPの書き込み承認はCloudflare OS側で行います。変更した接続・ツール定義は次のモデルリクエストから反映されます。

同期する範囲は、そのチャットに許可した接続です。外部エージェントのローカルファイルや会話履歴をPiと同期する機能ではありません。チーム各段階も同じPi接続を使い、ネイティブCLIのファイル・シェル権限は従来の設定に従います。

Codexへ渡す環境変数は明示した許可リストに限定し、Runnerの`.env`全体は継承しません。マウントしたChatGPTログインとCLIのプロキシ・CA設定は保持し、各プロバイダーのAPIキー、LiteLLMのマスターキー、Runnerのトークンは渡しません。リクエスト専用MCPトークンはブリッジ用プロキシへ転送しますが、CodexのツールシェルにはCLIのプロキシ設定とともに渡しません。Piブリッジがない場合も、シェルは実行環境用の別の許可リストから起動します。この環境変数の制限は、共有Runnerコンテナ内のファイルや他プロセスを隔離するものではありません。

保留セッションの保持時間は`AGENT_RUNNER_MCP_SESSION_TTL_SECONDS`（既定1800秒）、保持件数は`AGENT_RUNNER_MCP_MAX_SESSIONS`（既定16件）で調整できます。ネイティブ処理には別途`AGENT_RUNNER_TIMEOUT_SECONDS`（既定900秒）が適用されます。

コードを更新した後はRunnerを再ビルドします。

```powershell
docker compose -f docker-compose.yml -f docker-compose.agents.yml up --build -d agent-runner
docker compose -f docker-compose.yml -f docker-compose.agents.yml restart litellm
```

チャットを再実行する前にLiteLLMの`/health/liveliness`がHTTP 200になるのを待ちます。Runnerの再作成でアドレスが変わった場合も、LiteLLMの再起動で再接続できます。

認証情報や本番サービスを使わずに、MCPの通信とPiツール結果の往復を検証できます。

```powershell
node --test agent-runner/*.test.mjs
```

自動テストは使い捨てのCLI・MCP・モデル応答を使います。実モデルによる成功を確認するには、上記のチャット操作で外部エージェントの最終回答とPiのツール記録を確認してください。

ビルドしたコンテナの実Claude Code・Codex・Hermesでも、ネットワークを遮断した模擬モデルでMCP互換性を確認できます。

```powershell
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-mcp-smoke.mjs --agent claude
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-mcp-smoke.mjs --agent codex
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-mcp-smoke.mjs --agent hermes
docker run --rm --network none --entrypoint node cloudflare-os-local-agent-runner:latest /app/native-codex-mcp-smoke.mjs --check-environment
```

これは実CLIと模擬モデルの検証です。外部プロバイダーや実MCP接続先の動作を確認するテストではありません。
Codexの環境変数検証では、模擬秘密値と危険なシェル環境設定を用意し、実ツールシェルへ漏れないことと、その後の認証付きMCP往復を確認します。Repository QAでもコンテナと同じ固定版Codexで実行します。

稼働中のLiteLLMを通して実環境を検証するには、Git対象外のartifactsディレクトリへ固定版Piを導入し、公開ドキュメントMCPの検証を実行します。

```powershell
npm install --prefix artifacts/pi-runtime --no-audit --no-fund @earendil-works/pi-agent-core@0.87.1 @earendil-works/pi-ai@0.87.1
node qa/live-mcp-agent-probe.mjs --runtime-dir artifacts/pi-runtime --base-url http://127.0.0.1:4001/v1 --credential-env LITELLM_MASTER_KEY --models claude-code-glm,codex,antigravity,hermes,agent-team --output-dir artifacts/live-mcp-real
```

起動済みの環境と各ネイティブエージェントの実認証情報が必要です。`LITELLM_MASTER_KEY`は環境変数またはローカル`.env`から読み、表示しません。実モデル・プロバイダーへのリクエストは利用枠を消費し、[読み取り専用のOpenAI Docs MCP](https://developers.openai.com/learn/docs-mcp)へ接続します。モデルは順番に検証します。再実行時は新しい証拠ディレクトリを指定してください。

JSONには、ネイティブassistantのツール要求、実MCP応答とハッシュ、全assistant出力、MCP成功後に初めて生成する予測不能の検証tokenを保存します。チームはPlan・Implement・Review・Summaryの各段階でMCPを呼び、自分の応答tokenを出力する必要があります。修正・再レビューが発生した場合も全段階を確認し、Team logと記録した段階を照合します。最終まとめがtokenを省略しても、その段階自身の出力で確認できます。この独立したPiループはネイティブ連携を検証します。Workshopの接続権限やGadgetの動作は前述のチャット手順で別途確認します。`--api openai-responses`でPiのResponsesアダプターも検証できます。

## ブラウザーQA

すべてのブラウザースクリプトはCFOS_USERNAMEとCFOS_PASSWORDが必要です。エージェントスモークテストはBASE_URLも受け付けます。待機・証跡スクリプトには対象WorkspaceのWORKSPACE_URLを渡します。

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
$env:BASE_URL = 'http://localhost:8877'
node .\qa\agentic-gadget-smoke.mjs
```

## Tailscale

環境変数または.envにCFOS_PUBLIC_BASE_URLとCFOS_BACKEND_HOSTを設定してCloudflare OSサービスを再作成し、scripts/enable-tailscale-serve.ps1を実行します。ヘルパーがマシンのtailnet URLを取得するため、リポジトリに実URLを保存しません。

次: [アーキテクチャ](architecture) · [証跡](evidence) · [English](../../guide/usage)
