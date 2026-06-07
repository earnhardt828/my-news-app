import "server-only";

import { buildNewsArticle, dedupeArticles, sortArticlesByRecent } from "../shared";
import type { NewsArticle } from "../types";

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

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  const key = process.env.GNEWS_API_KEY ?? "";
  console.log("GNEWS_KEY_PRESENT", Boolean(key));

  if (!key) {
    console.error("GNEWS_ERROR", "Missing GNEWS_API_KEY");
    return [];
  }

  const normalizedCategory = category.trim() || "general";
  const requestUrl = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${key}`;

  try {
    const response = await fetch(requestUrl, {
      next: { revalidate: 600 },
    });

    console.log("GNEWS_RESPONSE_STATUS", response.status);

    const payload = (await response.json()) as GNewsApiResponse;
    const rawArticles = payload.articles ?? [];
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

    console.log("GNEWS_IMAGE_COUNT", articles.length);

    if (!response.ok) {
      console.error(
        "GNEWS_ERROR",
        payload.errors?.join(", ") || `GNews request failed (${response.status})`
      );
      return [];
    }

    return sortArticlesByRecent(dedupeArticles(articles));
  } catch (error) {
    console.error("GNEWS_ERROR", error);
    return [];
  }
}
