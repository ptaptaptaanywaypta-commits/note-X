# note記事からX投稿案を作るCLI

公開済みnote記事のURLから、新人〜若手理学療法士向けのX投稿案を作るローカルツールです。

## 初回準備

```bash
npm install
```

PowerShellで `npm.ps1` が止まる場合は、次のように実行してください。

```bash
npm.cmd install
```

## OpenAI APIキーを設定

`.env.example` をコピーして `.env` を作り、APIキーを入れます。

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
GENERATION_MODE=api
```

`OPENAI_MODEL` はあとから変更できます。低コスト寄りにしたい場合は、利用できるモデル名に差し替えてください。

## 使い方

APIキーを設定済みなら、このコマンドだけで投稿案まで生成します。

```bash
npm run generate -- "https://note.com/enr296/n/n3d95708a388b?from=notice"
```

PowerShellで止まる場合:

```bash
npm.cmd run generate -- "https://note.com/enr296/n/n3d95708a388b?from=notice"
```

## ChatGPTに貼るプロンプトだけ作る

APIを使わず、プロンプトだけ保存したい場合:

```bash
npm run generate:prompt -- "https://note.com/enr296/n/n3d95708a388b?from=notice"
```

または:

```bash
npm run generate -- "https://note.com/enr296/n/n3d95708a388b?from=notice" --prompt-only
```

## note本文が取得できない場合

`input/article.md` に記事本文を貼り付けてから、同じコマンドを実行してください。

```markdown
# 記事タイトル

ここに本文を貼ります。
```

note側の表示形式やログイン状態によって本文取得が難しい場合があります。その場合でも `input/article.md` があれば処理は続きます。

## 出力ファイル

- `output/x_posts.md`
- `output/x_posts.csv`
- `output/thread_posts.md`
- `output/image_prompts.md`
- `output/review_report.md`
- `output/summary.json`
- `output/prompt_for_chatgpt.md`

CSV列:

- `category`
- `post_text`
- `with_url`
- `character_count`
- `suggested_use`
- `note_url`

## 品質チェック

生成後に以下を確認し、問題があれば `output/review_report.md` に出力します。

- 文字数オーバー
- 医療的に危ない断定
- 煽りすぎた表現
- 患者・新人・他職種を下げる表現
- 同じ内容の重複
- noteリンクの入れ忘れ

## 構成

- `src/fetchNoteArticle.ts`: note本文取得とfallback
- `src/extractArticle.ts`: タイトル・本文・見出し・キーワード抽出
- `src/generatePosts.ts`: OpenAI API生成とプロンプト作成
- `src/qualityCheck.ts`: 投稿品質チェック
- `src/writeOutputs.ts`: Markdown、CSV、JSON出力
- `src/index.ts`: CLI入口

将来的に、投稿済み管理、投稿予定日管理、Googleスプレッドシート連携、複数URL一括生成、X API連携を追加しやすいように、処理をファイルごとに分けています。
