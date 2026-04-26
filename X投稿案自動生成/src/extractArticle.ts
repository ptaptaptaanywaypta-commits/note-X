import type { ExtractedArticle, RawArticle } from "./types.js";

const STOP_WORDS = new Set([
  "こと",
  "よう",
  "ため",
  "これ",
  "それ",
  "ここ",
  "さん",
  "ます",
  "です",
  "する",
  "いる",
  "ある",
  "なる",
  "思い",
  "患者",
  "臨床"
]);

export function extractArticle(raw: RawArticle): ExtractedArticle {
  const headings = extractHeadings(raw.body);
  const keywords = extractKeywords(raw.body);

  return {
    title: raw.title,
    body: raw.body,
    headings,
    keywords,
    url: raw.url,
    mainTheme: inferMainTheme(raw.title, headings, keywords),
    targetReader: "新人〜若手理学療法士"
  };
}

function extractHeadings(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, ""))
    .slice(0, 12);
}

function extractKeywords(body: string): string[] {
  const normalized = body.replace(/[、。・（）()[\]「」『』]/g, " ");
  const words = normalized.match(/[A-Za-z0-9₂]+|[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]{2,}/gu) ?? [];
  const scored = new Map<string, number>();

  for (const word of words) {
    const clean = word.trim();
    if (clean.length < 2 || STOP_WORDS.has(clean)) continue;
    scored.set(clean, (scored.get(clean) ?? 0) + keywordBonus(clean));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([word]) => word);
}

function keywordBonus(word: string): number {
  const clinicalTerms = [
    "急性期",
    "リハ",
    "離床",
    "SpO2",
    "SpO₂",
    "血圧",
    "呼吸",
    "循環",
    "バイタル",
    "がん",
    "地域包括",
    "理学療法",
    "PT"
  ];
  return clinicalTerms.some((term) => word.includes(term)) ? 4 : 1;
}

function inferMainTheme(title: string, headings: string[], keywords: string[]): string {
  const text = [title, ...headings, ...keywords].join(" ");
  if (/離床/.test(text)) return "離床判断";
  if (/バイタル|SpO2|SpO₂|血圧|脈拍/.test(text)) return "バイタルサインの見方";
  if (/呼吸|循環/.test(text)) return "呼吸循環の臨床判断";
  if (/がん/.test(text)) return "がんリハ";
  if (/地域包括/.test(text)) return "地域包括ケア";
  if (/急性期/.test(text)) return "急性期リハ";
  return keywords[0] ?? "臨床リハビリテーション";
}
