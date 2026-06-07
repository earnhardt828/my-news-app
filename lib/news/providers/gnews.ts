import "server-only";

import { buildNewsArticle, dedupeArticles, sortArticlesByRecent } from "../shared";
import type { GnewsProviderDebug, NewsArticle } from "../types";

type GNewsApiResponse = {
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    content?: string | null;
    url?: string | null;
    image?: string | null;
    publishedAt?: string | null;
    source?: { name?: string | null } | null;
  }>;
  errors?: string[] | null;
};

function createEmptyDebug(key: string, requestUrl: string): GnewsProviderDebug {
  return {
    keyPresent: Boolean(key),
    keyLength: key.length,
    requestUrl,
    status: null,
    bodyPreview: null,
    rawCount: 0,
    imageCount: 0,
    error: null,
  };
}

export async function fetchArticlesWithDebug(category: string): Promise<{
  articles: NewsArticle[];
  debug: GnewsProviderDebug;
}> {
  console.log("GNEWS ENV DEBUG", {
    apiKeyPresent: Boolean(process.env.GNEWS_API_KEY),
    apiKeyLength: process.env.GNEWS_API_KEY?.length || 0,
  });

  const key = process.env.GNEWS_API_KEY ?? "";
  const requestUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${key}`;
  const debug = createEmptyDebug(key, requestUrl);

  console.log("GNEWS_KEY_PRESENT", debug.keyPresent);
  console.log("GNEWS_KEY_LENGTH", debug.keyLength);

  if (!key) {
    debug.error = "Missing GNEWS_API_KEY";
    console.error("GNEWS_ERROR", debug.error);
    return { articles: [], debug };
  }

  const normalizedCategory = category.trim() || "general";
  console.log("GNEWS_REQUEST_URL", requestUrl);

  try {
    const response = await fetch(requestUrl, {
      next: { revalidate: 600 },
    });

    debug.status = response.status;
    console.log("GNEWS_RESPONSE_STATUS", response.status);

    const bodyText = await response.text();
    debug.bodyPreview = bodyText.slice(0, 500);
    console.log("GNEWS_BODY_PREVIEW", debug.bodyPreview);

    const payload = JSON.parse(bodyText) as GNewsApiResponse;
    const rawArticles = payload.articles ?? [];
    debug.rawCount = rawArticles.length;
    console.log("GNEWS_RAW_COUNT", rawArticles.length);

    const articles = rawArticles
      .filter((article) => Boolean(article.image))
      .map((article, index) =>
        buildNewsArticle(
          {
            title: article.title,
            description: article.description,
            url: article.url,
            source: article.source?.name?.trim() || "GNews",
            publishedAt: article.publishedAt,
            imageUrl: article.image,
            category: normalizedCategory,
          },
          {
            category: normalizedCategory,
            provider: "gnews",
            uniqueSeed: `gnews-general-${index}`,
          }
        )
      )
      .filter((article): article is NewsArticle => Boolean(article));

    debug.imageCount = articles.length;
    console.log("GNEWS_IMAGE_COUNT", articles.length);

    if (!response.ok) {
      debug.error = payload.errors?.join(", ") || `GNews request failed (${response.status})`;
      console.error("GNEWS_ERROR", debug.error);
      return { articles: [], debug };
    }

    return {
      articles: sortArticlesByRecent(dedupeArticles(articles)),
      debug,
    };
  } catch (error) {
    debug.error = error instanceof Error ? error.message : String(error);
    console.error("GNEWS_ERROR", debug.error);
    return { articles: [], debug };
  }
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  const result = await fetchArticlesWithDebug(category);
  return result.articles;
}
