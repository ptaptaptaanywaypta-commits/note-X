import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { RawArticle } from "./types.js";

const FALLBACK_PATH = "input/article.md";

export async function fetchNoteArticle(noteUrl: string): Promise<RawArticle> {
  try {
    const response = await fetch(noteUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) note-to-x-posts/0.1",
        accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new Error(`note returned ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseNoteHtml(html, noteUrl);

    if (parsed.body.length < 300) {
      throw new Error("article body was too short after parsing");
    }

    return parsed;
  } catch (error) {
    const fallback = await readFallbackArticle();
    return {
      url: noteUrl,
      title: fallback.title,
      body: fallback.body,
      source: "fallback"
    };
  }
}

function parseNoteHtml(html: string, url: string): RawArticle {
  const $ = cheerio.load(html);
  const title =
    cleanText($("meta[property='og:title']").attr("content") ?? "") ||
    cleanText($("title").first().text()) ||
    "無題の記事";

  $("script, style, noscript, iframe, svg, nav, footer, header").remove();

  const candidates = [
    $("article").text(),
    $("main").text(),
    $("[class*='note-common-styles']").text(),
    $("body").text()
  ]
    .map(cleanText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return {
    url,
    title,
    body: candidates[0] ?? "",
    source: "note"
  };
}

async function readFallbackArticle(): Promise<{ title: string; body: string }> {
  if (!existsSync(FALLBACK_PATH)) {
    throw new Error(
      `note本文を取得できず、fallback用の ${FALLBACK_PATH} も見つかりません。`
    );
  }

  const markdown = await readFile(FALLBACK_PATH, "utf8");
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return {
    title: titleMatch?.[1]?.trim() || "手動貼り付け記事",
    body: markdown.trim()
  };
}

function cleanText(value: string): string {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}
