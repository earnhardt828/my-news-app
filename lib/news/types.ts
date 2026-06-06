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
