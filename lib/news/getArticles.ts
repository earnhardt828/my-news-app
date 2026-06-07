import "server-only";

import { fetchArticles as fetchCurrentArticles } from "./providers/current";
import { fetchArticlesWithDebug as fetchGnewsArticlesWithDebug } from "./providers/gnews";
import { fetchArticles as fetchNytArticles } from "./providers/nyt";
import { dedupeArticles, sortArticlesByRecent } from "./shared";
import type { GnewsProviderDebug, NewsArticle, ProviderDebugCounts } from "./types";

export async function getArticles(category: string): Promise<NewsArticle[]> {
  const result = await getArticlesWithDebug(category);
  return result.articles;
}

export async function getArticlesWithDebug(category: string): Promise<{
  articles: NewsArticle[];
  counts: ProviderDebugCounts;
  gnewsDebug: GnewsProviderDebug;
  gnewsDroppedReason: string | null;
}> {
  const [currentArticles, gnewsResult, nytArticles] = await Promise.all([
    fetchCurrentArticles(category),
    fetchGnewsArticlesWithDebug(category),
    fetchNytArticles(category),
  ]);
  const gnewsArticles = gnewsResult.articles;

  const mergedBase = dedupeArticles([...currentArticles, ...nytArticles]);
  const merged = sortArticlesByRecent([...mergedBase, ...gnewsArticles]);
  const mergedGnewsCount = merged.filter((article) => article.provider === "gnews").length;
  const gnewsDroppedReason =
    gnewsArticles.length > 0 && mergedGnewsCount === 0
      ? "Aggregator merge dropped all GNews articles"
      : gnewsArticles.length === 0
        ? gnewsResult.debug.error || "GNews provider returned zero articles"
        : null;

  const counts: ProviderDebugCounts = {
    current: currentArticles.length,
    gnews: gnewsArticles.length,
    nyt: nytArticles.length,
    totalAfterMerge: merged.length,
  };

  console.log("VISIBLE_PROVIDER_COUNTS", counts);
  console.log("CURRENT_COUNT", counts.current);
  console.log("GNEWS_COUNT", counts.gnews);
  console.log("NYT_COUNT", counts.nyt);
  console.log("TOTAL_AFTER_MERGE", counts.totalAfterMerge);
  console.log("GNEWS_DROPPED_REASON", gnewsDroppedReason);

  return {
    articles: merged,
    counts,
    gnewsDebug: gnewsResult.debug,
    gnewsDroppedReason,
  };
}
