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
