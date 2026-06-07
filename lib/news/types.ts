import "server-only";

export type NewsArticle = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string | null;
  imageUrl: string;
  category: string;
  provider: "current" | "gnews" | "nyt";
};

export type ProviderDebugCounts = {
  current: number;
  gnews: number;
  nyt: number;
  totalAfterMerge: number;
};

export type GnewsProviderDebug = {
  keyPresent: boolean;
  keyLength: number;
  requestUrl: string;
  status: number | null;
  bodyPreview: string | null;
  rawCount: number;
  imageCount: number;
  error: string | null;
};
