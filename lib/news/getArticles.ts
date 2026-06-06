import "server-only";

import { fetchArticles as fetchCurrentArticles } from "./providers/current";
import { fetchArticles as fetchGnewsArticles } from "./providers/gnews";
import { fetchArticles as fetchNytArticles } from "./providers/nyt";
import { dedupeArticles, sortArticlesByRecent } from "./shared";
import type { NewsArticle, ProviderDebugCounts } from "./types";

export async function getArticles(category: string): Promise<NewsArticle[]> {
  const result = await getArticlesWithDebug(category);
  return result.articles;
}

export async function getArticlesWithDebug(category: string): Promise<{
  articles: NewsArticle[];
  counts: ProviderDebugCounts;
}> {
  const [currentArticles, gnewsArticles, nytArticles] = await Promise.all([
    fetchCurrentArticles(category),
    fetchGnewsArticles(category),
    fetchNytArticles(category),
  ]);

  const merged = sortArticlesByRecent(
    dedupeArticles([...currentArticles, ...gnewsArticles, ...nytArticles])
  );

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

  return {
    articles: merged,
    counts,
  };
}
