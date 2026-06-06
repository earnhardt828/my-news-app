import "server-only";

import { buildNewsArticle, dedupeArticles, getCategoryQuery, sortArticlesByRecent } from "../shared";
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
};

function getQueries(category: string) {
  const normalized = category.trim().toLowerCase();

  if (!normalized || normalized === "trending" || normalized === "latest") {
    return [
      "breaking news",
      "politics news",
      "world news",
      "crime news",
      "technology news",
      "entertainment news",
      "business news",
      "science news",
      "food news",
      "travel news",
      "art news",
      "general news",
    ];
  }

  return [getCategoryQuery(category)];
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  const key = process.env.GNEWS_API_KEY ?? "";
  if (!key) {
    return [];
  }

  const queries = getQueries(category);
  const responses = await Promise.allSettled(
    queries.map(async (query) => {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
        query
      )}&lang=en&country=us&max=10&page=1&expand=content&token=${key}`;
      const response = await fetch(url, {
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        throw new Error(`GNews request failed (${response.status})`);
      }

      const payload = (await response.json()) as GNewsApiResponse;
      return (payload.articles ?? [])
        .map((article, index) =>
          buildNewsArticle(
            {
              title: article.title,
              description: article.description,
              url: article.url,
              source: article.source?.name?.trim() || "GNews",
              publishedAt: article.publishedAt,
              imageUrl: article.image,
              category: category || "News",
            },
            {
              category: category || "News",
              provider: "gnews",
              uniqueSeed: `gnews-${query}-${index}`,
            }
          )
        )
        .filter((article): article is NewsArticle => Boolean(article));
    })
  );

  const articles = responses.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return sortArticlesByRecent(dedupeArticles(articles));
}
