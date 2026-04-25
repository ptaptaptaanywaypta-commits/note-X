# Obsidianメモからnote Draftを生成する自動化

Obsidian Vaultに保存したMarkdownメモのうち、記事化してよいものだけを読み取り、OpenAI APIで以下を生成します。

- note記事案
- noteへコピペしやすい本文ファイル
- X投稿案
- 医療安全、個人情報、著作権、文体のチェックリスト
- 生成メタデータ

noteへの自動投稿、Xへの自動投稿は実装していません。生成物は必ず人間が確認、修正してから手動で投稿してください。

## 記事化対象にするメモ

Markdown本文に次のタグを付けると記事化対象になります。

```markdown
#note化候補
```

または、ファイル冒頭のfrontmatterで次のように指定します。

```yaml
---
publish_ok: true
type: article_seed
target: young_pt
theme: vital
---
```

## 除外されるメモ

次の条件に当てはまるMarkdownは処理されません。

- `#note化候補` がなく、`publish_ok: true` もない
- `#個人メモ`、`#保留`、`#要確認` のいずれかが付いている
- `.automation/processed.json` に処理済みとして記録されている
- `drafts`、`generated`、`archive`、`templates` フォルダ内にある
- 患者ID、カルテ番号、電話番号、メールアドレスなど、明らかな個人情報らしき内容が含まれる

`#note化候補` は基本的に消さなくて大丈夫です。二重生成は `.automation/processed.json` で防ぎます。

## GitHub Secrets

GitHubリポジトリの `Settings > Secrets and variables > Actions` で次を設定してください。

- `OPENAI_API_KEY`: OpenAI APIキー本体だけを入れる

`OPENAI_API_KEY=` は付けません。モデルを変えたい場合は、Actions variablesに `OPENAI_MODEL` を設定できます。未設定の場合は `gpt-4.1-mini` を使います。

## GitHub Actionsの実行

`.github/workflows/generate-note-drafts.yml` は週2回の定期実行と手動実行に対応しています。

手動実行する場合:

1. GitHubの `Actions` タブを開く
2. `Generate note draft articles` を選ぶ
3. `Run workflow` を押す

変更が生成された場合は、Pull Requestではなく `main` ブランチへ直接コミットされます。生成のたびに `automation/...` ブランチは増えません。

## 生成されるファイル

- `articles/drafts/YYYY-MM-DD_slug.md`: frontmatterと確認メモ付きの記事案
- `note_posts/drafts/YYYY-MM-DD_slug.md`: noteにコピペしやすい本文版
- `x_posts/drafts/YYYY-MM-DD_slug.md`: X投稿案3つ
- `checklists/drafts/YYYY-MM-DD_slug.md`: 医療安全、個人情報、著作権、文体チェック
- `metadata/drafts/YYYY-MM-DD_slug.yaml`: 生成メタデータ
- `.automation/processed.json`: 二重生成防止の記録

1回の実行で最大3件まで処理します。

## 注意点

医療情報は断定しすぎず、施設基準、医師、看護師、多職種連携を無視しない表現にしてください。生成物はあくまでDraftです。

個人情報については、患者が特定される年齢、疾患、経過、日付、病院名、地域、職業などが具体的すぎないか必ず確認してください。

著作権については、既存書籍、論文、Web記事の文章をそのまま使っていないか、既存キャラクターや漫画作品に依存した表現になっていないか確認してください。
