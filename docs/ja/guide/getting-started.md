# はじめに

Windowsのクリーンなcloneから、ローカルワークスペースを起動する手順です。

## 前提

- Linux engineを有効にしたDocker Desktop
- PowerShell
- 上流JavaScriptワークスペースのインストールとDocker buildに必要なディスク容量
- 利用するモデル経路に必要なプロバイダー認証情報

## 1. Cloneと設定

```powershell
git clone https://github.com/Sunwood-ai-labs/cloudflare-os-home.git
Set-Location cloudflare-os-home
Copy-Item .env.example .env
notepad .env
```

最低限、LITELLM_MASTER_KEYを設定します。利用しない経路のプロバイダーキーは空欄で構いません。AWSプロファイルはGitの外で管理してください。

## 2. Composeを起動

```powershell
docker compose up --build -d
docker compose ps
```

初回buildでは上流のpnpmワークスペースをインストールするため、数分かかることがあります。Cloudflare OSは8877番ポート、プロジェクト内LiteLLMの診断用ポートはlocalhostの4001番です。

## 3. 初回UIを完了

`http://localhost:8877`を開き、ローカルアカウントを作成してOpenAI互換モデルを登録します。このプロジェクトのComposeネットワーク内エンドポイントは`http://litellm:4000/v1`です。

## 4. 検証

```powershell
docker compose config --quiet
.\scripts\verify-project-litellm.ps1
```

ブラウザーQAには認証情報を明示的に渡します。

```powershell
$env:CFOS_USERNAME = 'your-local-account'
$env:CFOS_PASSWORD = 'your-local-password'
$env:BASE_URL = 'http://localhost:8877'
```

## 5. 安全に停止

```powershell
docker compose down
```

名前付きWorker状態を削除したいときだけdocker compose down -vを使ってください。

次: [使い方](usage) · [アーキテクチャ](architecture) · [English](../../guide/getting-started)
