import { mkdir, writeFile } from "node:fs/promises";
import type { ExtractedArticle, GeneratedPosts, ReviewIssue } from "./types.js";

export async function writeOutputs(params: {
  article: ExtractedArticle;
  posts: GeneratedPosts | null;
  prompt: string;
  issues: ReviewIssue[];
}): Promise<void> {
  const { article, posts, prompt, issues } = params;
  await mkdir("output", { recursive: true });

  await writeFile("output/prompt_for_chatgpt.md", prompt, "utf8");
  await writeFile("output/summary.json", JSON.stringify(buildSummary(article), null, 2), "utf8");
  await writeFile("output/review_report.md", renderReviewReport(issues), "utf8");

  if (!posts) {
    const message = "OpenAI API生成は未実行です。output/prompt_for_chatgpt.md をChatGPTに貼り付けてください。\n";
    await writeFile("output/まず見る_X投稿案.md", message, "utf8");
    await writeFile("output/x_posts.md", message, "utf8");
    await writeFile("output/x_posts.csv", csvHeader(), "utf8");
    await writeFile("output/スレッド投稿案.md", message, "utf8");
    await writeFile("output/thread_posts.md", message, "utf8");
    await writeFile("output/図解プロンプト.md", message, "utf8");
    await writeFile("output/image_prompts.md", message, "utf8");
    return;
  }

  const xPosts = renderXPosts(posts, article.url);
  const threads = renderThreads(posts);
  const imagePrompts = renderImagePrompts(posts);

  await writeFile("output/まず見る_X投稿案.md", xPosts, "utf8");
  await writeFile("output/x_posts.md", xPosts, "utf8");
  await writeFile("output/x_posts.csv", renderCsv(posts, article.url), "utf8");
  await writeFile("output/スレッド投稿案.md", threads, "utf8");
  await writeFile("output/thread_posts.md", threads, "utf8");
  await writeFile("output/図解プロンプト.md", imagePrompts, "utf8");
  await writeFile("output/image_prompts.md", imagePrompts, "utf8");
}

function buildSummary(article: ExtractedArticle) {
  return {
    article_title: article.title,
    note_url: article.url,
    main_theme: article.mainTheme,
    target_reader: article.targetReader,
    extracted_keywords: article.keywords,
    generated_at: new Date().toISOString()
  };
}

function renderXPosts(posts: GeneratedPosts, noteUrl: string): string {
  const lines = ["# まず見る_X投稿案", "", `note: ${noteUrl}`, ""];

  lines.push("## A. 単発投稿 10本", "");
  posts.singlePosts.forEach((post, index) => {
    lines.push(`### ${index + 1}`, "", "URLなし:", post.text, "", "URLあり:", post.textWithUrl, "");
  });

  lines.push("## D. 臨床あるある投稿 5本", "");
  posts.clinicalPosts.forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  lines.push("", "## E. 知識整理投稿 5本", "");
  posts.knowledgePosts.forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  lines.push("", "## F. ちょっと刺さる一文 10本", "");
  posts.sharpLines.forEach((text, index) => lines.push(`${index + 1}. ${text}`));

  return lines.join("\n");
}

function renderThreads(posts: GeneratedPosts): string {
  const lines = ["# スレッド投稿案", ""];
  posts.threads.forEach((thread, index) => {
    lines.push(`## セット${index + 1}: ${thread.title}`, "");
    thread.posts.forEach((text, postIndex) => lines.push(`### ${postIndex + 1}`, text, ""));
  });
  return lines.join("\n");
}

function renderImagePrompts(posts: GeneratedPosts): string {
  const lines = ["# 図解向き投稿と画像生成プロンプト", ""];
  posts.imagePosts.forEach((post, index) => {
    lines.push(`## ${index + 1}`, "", "投稿文:", post.text, "", "16:9:", post.prompt16x9, "", "4:3:", post.prompt4x3, "");
  });
  return lines.join("\n");
}

function renderReviewReport(issues: ReviewIssue[]): string {
  if (issues.length === 0) {
    return "# 品質チェック\n\n問題は見つかりませんでした。\n";
  }

  const lines = ["# 品質チェック", ""];
  issues.forEach((issue, index) => {
    lines.push(`## ${index + 1}. [${issue.severity}] ${issue.category}`, issue.message);
    if (issue.text) lines.push("", "```", issue.text, "```");
    lines.push("");
  });
  return lines.join("\n");
}

function renderCsv(posts: GeneratedPosts, noteUrl: string): string {
  const rows = [csvHeader().trimEnd()];

  for (const post of posts.singlePosts) {
    rows.push(csvRow(["single", post.text, "false", charCount(post.text), post.suggestedUse, noteUrl]));
    rows.push(csvRow(["single", post.textWithUrl, "true", charCount(post.textWithUrl), post.suggestedUse, noteUrl]));
  }
  for (const thread of posts.threads) {
    thread.posts.forEach((text, index) => {
      rows.push(csvRow(["thread", text, String(text.includes(noteUrl)), charCount(text), `${thread.title} ${index + 1}`, noteUrl]));
    });
  }
  for (const post of posts.imagePosts) {
    rows.push(csvRow(["image", post.text, "false", charCount(post.text), "図解用投稿", noteUrl]));
  }
  for (const text of posts.clinicalPosts) {
    rows.push(csvRow(["clinical", text, "false", charCount(text), "臨床あるある", noteUrl]));
  }
  for (const text of posts.knowledgePosts) {
    rows.push(csvRow(["knowledge", text, "false", charCount(text), "知識整理", noteUrl]));
  }
  for (const text of posts.sharpLines) {
    rows.push(csvRow(["sharp_line", text, "false", charCount(text), "note誘導の一文", noteUrl]));
  }

  return rows.join("\n") + "\n";
}

function csvHeader(): string {
  return "category,post_text,with_url,character_count,suggested_use,note_url\n";
}

function csvRow(values: Array<string | number>): string {
  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
}

function charCount(text: string): number {
  return [...text].length;
}
