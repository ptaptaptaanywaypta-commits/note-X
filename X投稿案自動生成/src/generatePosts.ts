import OpenAI from "openai";
import type { AppConfig, ExtractedArticle, GeneratedPosts } from "./types.js";

const postsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "singlePosts",
    "threads",
    "imagePosts",
    "clinicalPosts",
    "knowledgePosts",
    "sharpLines"
  ],
  properties: {
    singlePosts: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "textWithUrl", "suggestedUse"],
        properties: {
          text: { type: "string" },
          textWithUrl: { type: "string" },
          suggestedUse: { type: "string" }
        }
      }
    },
    threads: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "posts"],
        properties: {
          title: { type: "string" },
          posts: {
            type: "array",
            minItems: 4,
            maxItems: 6,
            items: { type: "string" }
          }
        }
      }
    },
    imagePosts: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "prompt16x9", "prompt4x3"],
        properties: {
          text: { type: "string" },
          prompt16x9: { type: "string" },
          prompt4x3: { type: "string" }
        }
      }
    },
    clinicalPosts: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } },
    knowledgePosts: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } },
    sharpLines: { type: "array", minItems: 10, maxItems: 10, items: { type: "string" } }
  }
} as const;

export function buildPrompt(article: ExtractedArticle): string {
  const trimmedBody = article.body.slice(0, 14000);

  return `あなたは、理学療法士が書いたnote記事を読み込み、X投稿案に編集する人です。

最重要方針:
- まず記事本文を理解してください。
- 記事に書かれていない一般論で水増ししないでください。
- 投稿を読んだ人が「この記事は何について書いてあるか」を端的に理解できるようにしてください。
- それぞれの投稿に、記事固有の主張・場面・キーワード・具体例を最低1つ入れてください。
- 似た投稿を量産せず、切り口を変えてください。

最初に頭の中で整理すること:
1. この記事の中心メッセージは何か
2. 読者に持ち帰ってほしい要点は何か
3. 記事内で印象的な具体例、言い回し、臨床場面は何か
4. 新人〜若手PTがつまずきやすい点は何か
5. noteを読む理由が自然に伝わる導線は何か

ただし、出力JSONにはこの分析メモを書かないでください。投稿案だけを出してください。

対象読者:
- 新人〜若手理学療法士
- 急性期リハ、バイタルサイン、離床判断、呼吸循環、がんリハ、地域包括ケアに関心がある

文体:
- 上から目線にしない
- 一緒に学ぶ感じ
- 医療的に断定しすぎない
- 不安を煽らない
- 患者・新人・他職種を下げない
- 短く、読みやすく、1文を長くしすぎない
- 絵文字は使わない
- 「です・ます」と「だと思います」を自然に混ぜる
- 押し売りではなく、「必要なら読んでみてください」くらいの温度感

禁止:
- 「絶対」「必ず」「これだけで判断できる」
- 「知らないと危険」「今すぐやめて」などの煽り
- 記事内容と関係の薄い一般論
- 同じ文型の繰り返し
- タイトルだけを言い換えた薄い投稿

出力要件:
- singlePosts: 10本
  - text: URLなし、140字以内
  - textWithUrl: 末尾に ${article.url} を入れる。全体で140字以内
  - 1本ごとに切り口を変える
  - 「この記事では〇〇を整理しました」のように内容が分かる文を優先する
- threads: 3セット
  - 各4〜6投稿
  - 1投稿目は問題提起
  - 2〜4投稿目で記事の要点を具体的に説明
  - 最後はnoteリンクへ自然につなげる
  - 各投稿280字以内
- imagePosts: 5本
  - 記事内容を図解にしやすい投稿文
  - prompt16x9とprompt4x3を作る
  - 画像プロンプトには、図に入れる見出しや構成も含める
- clinicalPosts: 5本
  - 新人PTや若手PTが「わかる」と思いやすい臨床場面
  - 患者・職場・他職種を下げない
- knowledgePosts: 5本
  - 教科書知識と臨床での見方をつなぐ
  - 専門用語を使う場合は短く補足する
- sharpLines: 10本
  - 静かに刺さる一文
  - noteへの誘導文として使える

記事情報:
タイトル: ${article.title}
URL: ${article.url}
推定テーマ: ${article.mainTheme}
見出し: ${article.headings.join(" / ") || "抽出なし"}
キーワード: ${article.keywords.join(" / ")}

本文:
${trimmedBody}`;
}

export async function generatePosts(
  article: ExtractedArticle,
  config: AppConfig
): Promise<GeneratedPosts | null> {
  if (config.mode === "prompt") return null;
  if (!process.env.OPENAI_API_KEY) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: config.model,
    input: [
      {
        role: "system",
        content:
          "あなたは医療職向けコンテンツの編集者です。記事本文を正確に読み、臨床的に誠実で、具体的な日本語のX投稿案を書きます。"
      },
      { role: "user", content: buildPrompt(article) }
    ],
    temperature: 0.45,
    text: {
      format: {
        type: "json_schema",
        name: "x_post_generation",
        strict: true,
        schema: postsSchema
      }
    }
  });

  const content = response.output_text;
  if (!content) throw new Error("OpenAI APIから空の応答が返りました。");

  return normalizeGeneratedPosts(parseJson(content), article.url);
}

export function createLocalDraft(article: ExtractedArticle): GeneratedPosts {
  const theme = article.mainTheme;
  const text = `${theme}について、記事本文をもとに整理しました。数値だけでなく、患者さんの反応や経過も合わせて見る視点を大切にしたいです。`;

  return {
    singlePosts: Array.from({ length: 10 }, (_, index) => ({
      text: trimTo(`${text} ${index + 1}`, 140),
      textWithUrl: appendUrlWithinLimit(`${text} ${index + 1}`, article.url, 140),
      suggestedUse: "記事紹介"
    })),
    threads: Array.from({ length: 3 }, (_, index) => ({
      title: `${theme}の整理 ${index + 1}`,
      posts: [
        `${theme}は、ひとつの情報だけで判断しにくい場面があります。`,
        "記事では、数値、症状、経過、患者さんの反応を合わせて見る視点を整理しています。",
        "新人〜若手PTが臨床で迷いやすいポイントを、少し立ち止まって考える内容です。",
        `必要なところだけでも読んでみてください。\n${article.url}`
      ]
    })),
    imagePosts: Array.from({ length: 5 }, (_, index) => ({
      text: `${theme}を図解するなら、数値・症状・経過・相談の4つに分けると整理しやすいです。`,
      prompt16x9: `16:9。${theme}を「数値・症状・経過・相談」の4象限で整理する図解。白背景、青緑、グレー、文字少なめ。案${index + 1}`,
      prompt4x3: `4:3。${theme}を「数値・症状・経過・相談」の4象限で整理する図解。白背景、青緑、グレー、文字少なめ。案${index + 1}`
    })),
    clinicalPosts: Array.from({ length: 5 }, () => `${theme}の場面で、数値は悪くないのに少し気になることがあります。その違和感を言葉にすることも大切だと思います。`),
    knowledgePosts: Array.from({ length: 5 }, () => `教科書の知識は、臨床で見る順番をつくる助けになります。${theme}では、その人のいつもとの違いも見たいです。`),
    sharpLines: [
      "数字だけでは、患者さんのしんどさを拾いきれないことがある。",
      "迷った判断ほど、見た情報を言葉にして共有したい。",
      "正常値に見えても、その人にとって普通とは限らない。",
      "臨床の違和感は、観察の入口かもしれない。",
      "バイタルは止めるためだけでなく、進め方を考えるためにも見る。",
      "患者さんの一言が、数値より先に変化を教えてくれることがある。",
      "急ぐより、根拠をそろえて進めるほうが助けになることもある。",
      "知識は判断を狭めるためでなく、相談しやすくするためにもある。",
      "迷った記録は、次の自分とチームを助ける。",
      "ひとつの数値ではなく、その人の変化を見る。"
    ]
  };
}

function normalizeGeneratedPosts(value: any, url: string): GeneratedPosts {
  return {
    singlePosts: ensureArray(value.singlePosts).slice(0, 10).map((post: any) => ({
      text: String(post.text ?? ""),
      textWithUrl: String(post.textWithUrl ?? appendUrlWithinLimit(String(post.text ?? ""), url, 140)),
      suggestedUse: String(post.suggestedUse ?? "記事紹介")
    })),
    threads: ensureArray(value.threads).slice(0, 3).map((thread: any) => ({
      title: String(thread.title ?? "スレッド案"),
      posts: ensureArray(thread.posts).slice(0, 6).map(String)
    })),
    imagePosts: ensureArray(value.imagePosts).slice(0, 5).map((post: any) => ({
      text: String(post.text ?? ""),
      prompt16x9: String(post.prompt16x9 ?? ""),
      prompt4x3: String(post.prompt4x3 ?? "")
    })),
    clinicalPosts: ensureArray(value.clinicalPosts).slice(0, 5).map(String),
    knowledgePosts: ensureArray(value.knowledgePosts).slice(0, 5).map(String),
    sharpLines: ensureArray(value.sharpLines).slice(0, 10).map(String)
  };
}

function parseJson(content: string): unknown {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function ensureArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function appendUrlWithinLimit(text: string, url: string, limit: number): string {
  const suffix = `\n${url}`;
  return `${trimTo(text, limit - suffix.length)}${suffix}`;
}

function trimTo(text: string, limit: number): string {
  return [...text].length <= limit ? text : [...text].slice(0, limit - 1).join("") + "…";
}
