import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fetchNoteArticle } from "./fetchNoteArticle.js";
import { extractArticle } from "./extractArticle.js";
import { buildPrompt, generatePosts } from "./generatePosts.js";
import { qualityCheck } from "./qualityCheck.js";
import { writeOutputs } from "./writeOutputs.js";
import type { AppConfig, GenerationMode } from "./types.js";

const URL_INPUT_PATHS = [
  "input/ここにnote記事URLを貼る.txt",
  "input/note_url.txt"
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noteUrl = await resolveNoteUrl(args.find((arg) => !arg.startsWith("--")) ?? "");
  const modeArg = args.includes("--prompt-only") ? "prompt" : args.includes("--api") ? "api" : undefined;

  if (!noteUrl) {
    throw new Error(
      "note記事URLが見つかりません。\n" +
        "input/ここにnote記事URLを貼る.txt を開いて、1行目にnote記事URLを貼ってください。"
    );
  }

  const config: AppConfig = {
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    mode: resolveMode(modeArg)
  };

  console.log(`記事を取得しています: ${noteUrl}`);
  const raw = await fetchNoteArticle(noteUrl);
  console.log(`取得元: ${raw.source}`);

  const article = extractArticle(raw);
  const prompt = buildPrompt(article);

  if (config.mode === "api" && process.env.OPENAI_API_KEY) {
    console.log(`OpenAI APIで生成します: ${config.model}`);
  } else if (config.mode === "api") {
    console.log("OPENAI_API_KEY が未設定のため、プロンプトのみ生成します");
  } else {
    console.log("プロンプトのみ生成します");
  }
  const posts = await generatePosts(article, config);
  const issues = posts ? qualityCheck(posts, article.url) : [];

  await writeOutputs({ article, posts, prompt, issues });

  console.log("出力が完了しました: output/");
  if (!posts) {
    console.log("output/prompt_for_chatgpt.md をChatGPTに貼り付けて生成できます。");
  } else {
    console.log("まず見るファイル: output/まず見る_X投稿案.md");
  }
}

async function resolveNoteUrl(argUrl: string): Promise<string> {
  if (argUrl.trim()) return argUrl.trim();

  for (const path of URL_INPUT_PATHS) {
    if (!existsSync(path)) continue;
    const content = await readFile(path, "utf8");
    const match = content.match(/https?:\/\/\S+/);
    if (match) return match[0].trim();
  }

  return "";
}

function resolveMode(modeArg?: GenerationMode): GenerationMode {
  if (modeArg) return modeArg;
  const envMode = process.env.GENERATION_MODE;
  return envMode === "prompt" ? "prompt" : "api";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
