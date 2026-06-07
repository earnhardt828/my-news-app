import "server-only";

import { fetchArticles as fetchCurrentArticles } from "./providers/current";
import { fetchArticlesWithDebug as fetchGnewsArticlesWithDebug } from "./providers/gnews";
import { fetchArticles as fetchNytArticles } from "./providers/nyt";
import { dedupeArticles, hashArticleId, normalizeUrl, sortArticlesByRecent, stripHtml } from "./shared";
import type { GnewsProviderDebug, NewsArticle, ProviderDebugCounts } from "./types";

type InlineGnewsApiResponse = {
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    image?: string | null;
    publishedAt?: string | null;
    source?: { name?: string | null } | null;
  }>;
};

async function fetchGnewsArticlesInline(category: string): Promise<{
  articles: NewsArticle[];
  debug: GnewsProviderDebug;
}> {
  const gnewsKey = process.env.GNEWS_API_KEY ?? "";
  const keyPresent = Boolean(gnewsKey);
  const keyLength = gnewsKey.length;
  const requestUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${
    keyPresent ? "[REDACTED]" : "[MISSING]"
  }`;
  const debug: GnewsProviderDebug = {
    keyPresent,
    keyLength,
    requestUrl,
    status: null,
    bodyPreview: null,
    rawCount: 0,
    imageCount: 0,
    error: null,
  };

  console.log("GNEWS_PROVIDER_CALLED", "inline-aggregator");

  if (!keyPresent) {
    debug.error = "Missing GNEWS_API_KEY";
    console.log("GNEWS_PROVIDER_RETURN_COUNT", 0);
    return { articles: [], debug };
  }

  try {
    const liveUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${gnewsKey}`;
    const response = await fetch(liveUrl, {
      next: { revalidate: 0 },
    });

    debug.status = response.status;

    if (!response.ok) {
      debug.error = `GNews request failed with status ${response.status}`;
      console.log("GNEWS_PROVIDER_RETURN_COUNT", 0);
      return { articles: [], debug };
    }

    const data = (await response.json()) as InlineGnewsApiResponse;
    const rawArticles = data.articles ?? [];
    debug.rawCount = rawArticles.length;
    debug.imageCount = rawArticles.filter((article) => Boolean(article.image)).length;

    const normalizedCategory = category.trim() || "general";
    const articles = rawArticles.flatMap((article, index) => {
      const title = stripHtml(article.title);
      const url = normalizeUrl(article.url);
      const imageUrl = article.image?.trim() ?? "";

      if (!title || !url) {
        return [];
      }

      return [{
        id: hashArticleId(`gnews-inline-${index}:${url}`),
        title,
        description: stripHtml(article.description) || null,
        url,
        source: article.source?.name?.trim() || "GNews",
        publishedAt: article.publishedAt ?? null,
        imageUrl,
        category: normalizedCategory,
        provider: "gnews" as const,
      } satisfies NewsArticle];
    });

    console.log("GNEWS_PROVIDER_RETURN_COUNT", articles.length);
    return { articles, debug };
  } catch (error) {
    debug.error = error instanceof Error ? error.message : String(error);
    console.log("GNEWS_PROVIDER_RETURN_COUNT", 0);
    return { articles: [], debug };
  }
}

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
  const [currentArticles, providerGnewsResult, nytArticles] = await Promise.all([
    fetchCurrentArticles(category),
    fetchGnewsArticlesWithDebug(category),
    fetchNytArticles(category),
  ]);
  const gnewsResult =
    providerGnewsResult.debug.keyPresent || providerGnewsResult.articles.length > 0
      ? providerGnewsResult
      : await fetchGnewsArticlesInline(category);
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
