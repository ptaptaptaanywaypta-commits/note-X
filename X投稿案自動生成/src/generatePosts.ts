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
    clinicalPosts: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string" }
    },
    knowledgePosts: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string" }
    },
    sharpLines: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: { type: "string" }
    }
  }
} as const;

export function buildPrompt(article: ExtractedArticle): string {
  const trimmedBody = article.body.slice(0, 12000);
  return `あなたは、理学療法士向けnote記事をX投稿に展開する編集者です。

対象読者:
- 新人〜若手理学療法士
- 急性期リハ、バイタルサイン、離床判断、呼吸循環、がんリハ、地域包括ケアに関心がある

文体ルール:
- 上から目線にしない
- 一緒に学ぶ感じ
- 医療的に断定しすぎない
- 「絶対」「必ず」「これだけで判断」などを避ける
- 不安を煽らない
- 患者・新人・他職種を下げない
- 1文を長くしすぎない
- 絵文字は原則使わない
- 「です・ます」と「だと思います」を自然に混ぜる
- noteリンク誘導は押し売り感を出さない

出力要件:
- singlePosts: 10本。textはURLなしで140字以内。textWithUrlは末尾に ${article.url} を入れ、全体で140字以内。
- threads: 3セット。各4〜6投稿。1投稿目は問題提起、途中で要点、最後はnoteリンクへ自然に導線。各投稿280字以内。
- imagePosts: 5本。画像生成AIで図解化しやすい投稿文と、16:9/4:3の画像生成プロンプト。
- clinicalPosts: 5本。新人PTや若手PTが「わかる」と思いやすいが、誰かを下げない。
- knowledgePosts: 5本。教科書知識と臨床での見方をつなぐ。専門用語は短く補足。
- sharpLines: 10本。断定・煽りではなく、静かに刺さる一文。note誘導にも使える。

記事情報:
タイトル: ${article.title}
URL: ${article.url}
主テーマ: ${article.mainTheme}
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

  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: config.model,
    input: [
      {
        role: "system",
        content:
          "あなたは医療職向けコンテンツの編集者です。臨床的に誠実で、断定しすぎない日本語を書きます。"
      },
      {
        role: "user",
        content: buildPrompt(article)
      }
    ],
    temperature: 0.7,
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
  const keywords = article.keywords.slice(0, 3).join("、") || "バイタルや臨床判断";
  const singles = [
    `${theme}は、ひとつの数値だけで決めきれない場面があります。${keywords}を手がかりに、患者さんの変化を一緒に見ていきたいです。`,
    `新人の頃ほど、${theme}で「この判断でよいのかな」と迷いやすいと思います。数値と様子を並べて見る練習が助けになります。`,
    `${theme}で大切なのは、正常値を覚えることだけではないと思います。その人のいつもと比べて、何が変わったかを見たいです。`,
    `バイタルを見るとき、数字が先に目に入ります。でも表情、会話、呼吸のしんどさも同じくらい大事な情報です。`,
    `${theme}で迷ったら、止めるか進めるかだけでなく「どう進めるか」も考えたいです。選択肢が少し増えます。`,
    `臨床では、教科書どおりに割り切れない場面があります。だからこそ${theme}は、数値と経過をチームで共有したいです。`,
    `「なんとなくしんどそう」は、記録しにくいけれど大切な観察です。${theme}では、その違和感を言葉にする練習も必要だと思います。`,
    `${theme}で不安になるのは、未熟だからだけではないと思います。確認する材料が多い場面ほど、迷いも自然に増えます。`,
    `数字が落ち着いていても、患者さんの反応がいつもと違うことがあります。${theme}では、その小さな差を大切にしたいです。`,
    `急性期のリハでは、進める勇気と止まる勇気の両方が必要です。${theme}を整理しておくと、相談もしやすくなります。`
  ];

  return {
    singlePosts: singles.map((text) => ({
      text: trimTo(text, 140),
      textWithUrl: appendUrlWithinLimit(text, article.url, 140),
      suggestedUse: "記事公開後の単発投稿"
    })),
    threads: [
      {
        title: `${theme}の見方`,
        posts: [
          `${theme}で迷うのは、知識が足りないからだけではないと思います。情報が多いからこそ、何を組み合わせて見るかが難しいです。`,
          `まず見たいのは、数値そのものと変化の方向です。SpO2、血圧、脈拍などは単独でなく、前後の流れで受け止めたいです。`,
          `次に、表情や会話、呼吸のしんどさ、疲労感も合わせます。記録に残りにくい違和感ほど、丁寧に言葉にしておきたいです。`,
          `記事では、${theme}を新人〜若手PT目線で整理しました。よければ臨床前の確認にどうぞ。\n${article.url}`
        ]
      },
      {
        title: "バイタルと反応",
        posts: [
          `バイタルサインを見るとき、つい数字だけで安心したくなることがあります。でも臨床では、数字の外側にも大事な情報があります。`,
          `たとえばSpO2が保たれていても、呼吸数が増えていたり、会話が短くなっていたりすることがあります。そこは見落としたくないところです。`,
          `血圧や脈拍も、今の値だけでなく前後の変化を見ます。活動でどう変わり、休むとどう戻るかは判断の手がかりになります。`,
          `このあたりをnoteで整理しました。新人〜若手PTの確認用に使えたらうれしいです。\n${article.url}`
        ]
      },
      {
        title: "離床前に立ち止まる視点",
        posts: [
          `離床前の確認は、「できる・できない」を決める作業だけではないと思います。どう進めると負担が少ないかを考える時間でもあります。`,
          `確認したいのは、疾患や禁忌、バイタル、症状、前回からの変化です。どれかひとつで決めきらず、組み合わせて見たいです。`,
          `患者さんの「今日は少ししんどい」も大切な情報です。主観的な訴えは、数値と同じテーブルに置いて考えたいです。`,
          `noteでは、そんな臨床の迷いを少し整理しています。必要なところだけ読んでもらえたらと思います。\n${article.url}`
        ]
      }
    ],
    imagePosts: Array.from({ length: 5 }, (_, index) => ({
      text: `${theme}を図にするなら、「数値」「症状」「経過」「相談」の4つに分けると整理しやすいです。`,
      prompt16x9: `16:9。新人理学療法士向け。${theme}を「数値・症状・経過・相談」の4象限で整理する図解。白背景、青緑とグレー、文字は少なめ。案${index + 1}`,
      prompt4x3: `4:3。新人理学療法士向け。${theme}を「数値・症状・経過・相談」の4象限で整理する図解。白背景、青緑とグレー、文字は少なめ。案${index + 1}`
    })),
    clinicalPosts: Array.from({ length: 5 }, () =>
      `${theme}の場面で、数値は悪くないのに「少ししんどそう」と感じることがあります。その違和感を共有できる形にするのも大事な臨床力だと思います。`
    ),
    knowledgePosts: Array.from({ length: 5 }, () =>
      `教科書の知識は、臨床で見る順番をつくる助けになります。${theme}では、正常値だけでなく、その人のいつもとの違いを見る視点も持ちたいです。`
    ),
    sharpLines: [
      "SpO2だけ見ていると、呼吸のしんどさを見落とすことがある。",
      "離床判断は、数字と表情のあいだにある迷いを扱う仕事でもある。",
      "正常値に見えても、その人にとって普通とは限らない。",
      "不安な判断ほど、一人で抱えず言葉にしたい。",
      "バイタルは止めるためだけでなく、進め方を考えるためにも見る。",
      "患者さんの一言が、数値より先に変化を教えてくれることがある。",
      "急ぐより、根拠をそろえて進めるほうが結果的に早いこともある。",
      "臨床の違和感は、未熟さではなく観察の入口かもしれない。",
      "知識は判断を狭めるためでなく、相談しやすくするためにもある。",
      "迷った記録は、次の自分とチームを助ける。"
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
