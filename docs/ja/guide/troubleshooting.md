# トラブルシュート

## DockerがLinux engineへ接続できない

Docker Desktopを起動し、Linux engineが準備できるまで待ってから実行します。

```powershell
docker version
docker compose up --build -d
```

Docker Desktopのプロセスは動いているのにengineへ接続できない場合は、アプリを再起動してからコンテナを調べます。

## 8877番ポートが使用中

ポートを使用しているプロセスを確認するか、docker-compose.ymlのホスト側マッピングを変更します。コンテナ側を8877のままにする場合は、ブラウザー側のbackend設定も合わせて更新します。

## Cloudflare OSからLiteLLMへ接続できない

Composeネットワーク内では`http://litellm:4000/v1`を使います。Cloudflare OSコンテナからlocalhostは使えません。LiteLLMのhealthcheckを確認します。

```powershell
docker compose ps
docker compose logs litellm
```

## モデル登録は成功するがチャットが失敗する

LiteLLMにモデルIDが存在するか、LITELLM_MASTER_KEYとUIに入力したAPI tokenが一致するか、選択したプロバイダーキーが.envにあるかを確認します。

## Tailscale URLが開かない

scripts/enable-tailscale-serve.ps1を実行し、tailscale serve statusを確認します。CFOS_PUBLIC_BASE_URL、CFOS_BACKEND_HOSTが使用中のURLとポートに一致していることを確認し、Cloudflare OSサービスを再作成します。

## エージェントがツールを使わず回答する

具体的な作業を依頼し、ファイル作成、コード実行、テストまで明示的に要求します。質問だけのプロンプトは通常チャットで完了します。選択したモデルがtool callを安定して扱えるかも確認してください。

## ローカル状態をリセットする

```powershell
docker compose down -v
docker compose up --build -d
```

名前付きWorker状態を削除します。ローカルラボを意図的に初期化するときだけ使ってください。

次: [はじめに](getting-started) · [証跡](evidence) · [English](../../guide/troubleshooting)
