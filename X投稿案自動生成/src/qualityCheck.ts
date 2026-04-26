import type { GeneratedPosts, ReviewIssue } from "./types.js";

const dangerousAssertions = ["絶対", "必ず", "これだけで判断", "問題ない", "安全です", "禁忌です"];
const anxietyWords = ["知らないと危険", "今すぐやめて", "最悪", "手遅れ", "怖すぎる"];
const loweringWords = ["使えない新人", "ダメな新人", "迷惑", "患者のせい", "看護師のせい", "医師のせい"];

export function qualityCheck(posts: GeneratedPosts, noteUrl: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const all = flattenPosts(posts);
  const seen = new Map<string, number>();

  for (const item of all) {
    const count = charCount(item.text);
    if (item.limit && count > item.limit) {
      issues.push({
        severity: "error",
        category: "文字数",
        message: `${item.category} が ${count}字で上限${item.limit}字を超えています。`,
        text: item.text
      });
    }

    for (const word of dangerousAssertions) {
      if (item.text.includes(word)) {
        issues.push({
          severity: "warning",
          category: "医療的断定",
          message: `断定的に見える表現「${word}」があります。`,
          text: item.text
        });
      }
    }

    for (const word of anxietyWords) {
      if (item.text.includes(word)) {
        issues.push({
          severity: "warning",
          category: "煽り表現",
          message: `不安を煽る可能性がある表現「${word}」があります。`,
          text: item.text
        });
      }
    }

    for (const word of loweringWords) {
      if (item.text.includes(word)) {
        issues.push({
          severity: "warning",
          category: "下げ表現",
          message: `患者・新人・他職種を下げる可能性がある表現「${word}」があります。`,
          text: item.text
        });
      }
    }

    const key = normalizeForDuplicate(item.text);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  for (const [key, count] of seen) {
    if (count >= 3 && key.length > 20) {
      issues.push({
        severity: "info",
        category: "重複",
        message: `似た内容が ${count} 件あります。`,
        text: key
      });
    }
  }

  for (const thread of posts.threads) {
    const last = thread.posts.at(-1) ?? "";
    if (!last.includes(noteUrl)) {
      issues.push({
        severity: "error",
        category: "noteリンク",
        message: `スレッド「${thread.title}」の最後にnoteリンクがありません。`,
        text: last
      });
    }
  }

  for (const post of posts.singlePosts) {
    if (!post.textWithUrl.includes(noteUrl)) {
      issues.push({
        severity: "error",
        category: "noteリンク",
        message: "URLあり単発投稿にnoteリンクがありません。",
        text: post.textWithUrl
      });
    }
  }

  return issues;
}

function flattenPosts(posts: GeneratedPosts): Array<{ category: string; text: string; limit?: number }> {
  return [
    ...posts.singlePosts.flatMap((post) => [
      { category: "単発投稿URLなし", text: post.text, limit: 140 },
      { category: "単発投稿URLあり", text: post.textWithUrl, limit: 140 }
    ]),
    ...posts.threads.flatMap((thread) =>
      thread.posts.map((text, index) => ({
        category: `スレッド:${thread.title}:${index + 1}`,
        text,
        limit: 280
      }))
    ),
    ...posts.imagePosts.map((post) => ({ category: "図解向き投稿", text: post.text, limit: 280 })),
    ...posts.clinicalPosts.map((text) => ({ category: "臨床あるある投稿", text, limit: 280 })),
    ...posts.knowledgePosts.map((text) => ({ category: "知識整理投稿", text, limit: 280 })),
    ...posts.sharpLines.map((text) => ({ category: "ちょっと刺さる一文", text, limit: 140 }))
  ];
}

function charCount(text: string): number {
  return [...text].length;
}

function normalizeForDuplicate(text: string): string {
  return text.replace(/\s+/g, "").replace(/https?:\/\/\S+/g, "").slice(0, 80);
}
