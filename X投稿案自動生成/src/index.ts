import "dotenv/config";
import { fetchNoteArticle } from "./fetchNoteArticle.js";
import { extractArticle } from "./extractArticle.js";
import { buildPrompt, generatePosts } from "./generatePosts.js";
import { qualityCheck } from "./qualityCheck.js";
import { writeOutputs } from "./writeOutputs.js";
import type { AppConfig, GenerationMode } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noteUrl = args.find((arg) => !arg.startsWith("--")) ?? "";
  const modeArg = args.includes("--prompt-only") ? "prompt" : args.includes("--api") ? "api" : undefined;

  if (!noteUrl) {
    throw new Error('note記事URLを指定してください。例: npm run generate -- "https://note.com/xxxx/n/xxxx"');
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
  }
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
