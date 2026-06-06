import "server-only";

import { fetchNytTopStories } from "@/lib/server/nytProvider";

import { dedupeArticles, sortArticlesByRecent } from "../shared";
import type { NewsArticle } from "../types";

function getSections(category: string) {
  const normalized = category.trim().toLowerCase();

  if (!normalized || normalized === "trending" || normalized === "latest") {
    return ["home", "world", "us", "politics", "business", "technology", "science", "arts", "movies", "travel", "food"];
  }

  if (normalized === "world") return ["world"];
  if (normalized === "politics") return ["politics", "us"];
  if (normalized === "business") return ["business"];
  if (normalized === "technology" || normalized === "tech") return ["technology"];
  if (normalized === "science") return ["science"];
  if (normalized === "food") return ["food"];
  if (normalized === "travel") return ["travel"];
  if (normalized === "art" || normalized === "arts" || normalized === "entertainment") {
    return ["arts", "movies"];
  }

  return ["home"];
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  const result = await fetchNytTopStories(getSections(category));
  if (!result.keyPresent) {
    return [];
  }

  const mappedArticles: NewsArticle[] = result.articles.flatMap((article) => {
      if (!article.title || !article.url || !article.imageUrl) {
        return [];
      }

      return [{
        id: Math.abs(
          Array.from(`${article.url}:${article.title}`).reduce(
            (hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0,
            0
          )
        ),
        title: article.title,
        description: article.description ?? null,
        url: article.url,
        source: article.source,
        publishedAt: article.publishedAt ?? null,
        imageUrl: article.imageUrl,
        category: article.category ?? category ?? "News",
        provider: "nyt" as const,
      } satisfies NewsArticle];
    });

  return sortArticlesByRecent(dedupeArticles(mappedArticles));
}
