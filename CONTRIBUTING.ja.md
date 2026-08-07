# コントリビューション

このローカルラボを、再現しやすく安全なものに保つための協力を歓迎します。

## 変更前に確認すること

- [README.ja.md](README.ja.md)、[SECURITY.md](SECURITY.md)、[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)を読む。
- 認証情報、`.env`、AWSプロファイル、Workspace ID、プライベートなホスト名、個人用スクリーンショットをコミットしない。
- 上流ソースの変更と、ラッパー・Compose・LiteLLM・ドキュメントの変更を分けて説明する。
- `upstream/cloudflare-os/`を変更する場合は、上流のライセンスと帰属表示を維持する。

## ローカルQA

リポジトリのルートで実行します。

```powershell
docker compose config --quiet
node --check .\qa\agentic-gadget-smoke.mjs
Set-Location docs
npm ci
npm run docs:build
```

Docker DesktopのLinuxエンジンが利用できない場合は、その制約を報告し、コンテナを必要としないドキュメントと構文チェックを実行してください。

## Pull Request

利用者から見える結果、変更ファイル、実行したQAを説明してください。UIや見た目の変更を説明する場合だけ、個人情報を除いたスクリーンショットを添付します。
