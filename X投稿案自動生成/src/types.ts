export type GenerationMode = "api" | "prompt";

export type AppConfig = {
  model: string;
  mode: GenerationMode;
};

export type RawArticle = {
  url: string;
  title: string;
  body: string;
  source: "note" | "fallback";
};

export type ExtractedArticle = {
  title: string;
  body: string;
  headings: string[];
  keywords: string[];
  url: string;
  mainTheme: string;
  targetReader: string;
};

export type SinglePost = {
  text: string;
  textWithUrl: string;
  suggestedUse: string;
};

export type ThreadSet = {
  title: string;
  posts: string[];
};

export type ImagePost = {
  text: string;
  prompt16x9: string;
  prompt4x3: string;
};

export type GeneratedPosts = {
  singlePosts: SinglePost[];
  threads: ThreadSet[];
  imagePosts: ImagePost[];
  clinicalPosts: string[];
  knowledgePosts: string[];
  sharpLines: string[];
};

export type ReviewIssue = {
  severity: "info" | "warning" | "error";
  category: string;
  message: string;
  text?: string;
};
