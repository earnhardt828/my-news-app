import "server-only";

import type { NewsArticle } from "./types";

type ProviderInput = {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  source?: string | null;
  publishedAt?: string | null;
  imageUrl?: string | null;
  category?: string | null;
};

export function hashArticleId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function stripHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function extractXmlTag(block: string, tagName: string) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return decodeHtml(block.match(regex)?.[1] ?? "");
}

export function extractXmlAttr(block: string, tagName: string, attrName: string) {
  const regex = new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*>`, "i");
  return decodeHtml(block.match(regex)?.[1] ?? "");
}

export function extractImageFromDescription(description: string) {
  const srcMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  return srcMatch?.[1] ?? "";
}

export function normalizeUrl(rawUrl: string | null | undefined) {
  if (!rawUrl?.trim()) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = "";
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function normalizeTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

export function isRealImageUrl(url: string | null | undefined) {
  const value = url?.trim() ?? "";
  if (!value) {
    return false;
  }

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  return !/(placeholder|default-image|avatar|logo|icon|blank)\b/i.test(value);
}

export function buildNewsArticle(
  input: ProviderInput,
  options: {
    category: string;
    provider: NewsArticle["provider"];
    uniqueSeed: string;
  }
): NewsArticle | null {
  const title = stripHtml(input.title);
  const url = normalizeUrl(input.url);
  const imageUrl = input.imageUrl?.trim() ?? "";

  if (!title || !url || !isRealImageUrl(imageUrl)) {
    return null;
  }

  return {
    id: hashArticleId(`${options.uniqueSeed}:${url}`),
    title,
    description: stripHtml(input.description) || null,
    url,
    source: input.source?.trim() || "Unknown Source",
    publishedAt: input.publishedAt ?? null,
    imageUrl,
    category: input.category?.trim() || options.category,
    provider: options.provider,
  };
}

export function dedupeArticles(articles: NewsArticle[]) {
  const result: NewsArticle[] = [];
  const indexByKey = new Map<string, number>();

  articles.forEach((article) => {
    const normalizedUrl = normalizeUrl(article.url);
    const normalizedTitle = normalizeTitle(article.title);
    const dedupeKey = normalizedUrl
      ? `url:${normalizedUrl.toLowerCase()}`
      : `title:${article.source.toLowerCase()}:${normalizedTitle}`;
    const existingIndex = indexByKey.get(dedupeKey);

    if (existingIndex === undefined) {
      indexByKey.set(dedupeKey, result.length);
      result.push(article);
      return;
    }

    const existing = result[existingIndex];
    const existingTime = existing.publishedAt ? new Date(existing.publishedAt).getTime() : 0;
    const nextTime = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;

    if (nextTime > existingTime) {
      result[existingIndex] = article;
    }
  });

  return result;
}

export function sortArticlesByRecent(articles: NewsArticle[]) {
  return [...articles].sort((left, right) => {
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function getCategoryQuery(category: string) {
  const normalized = category.trim().toLowerCase();

  if (!normalized || normalized === "trending" || normalized === "latest" || normalized === "news") {
    return "breaking news";
  }

  if (normalized === "business") return "business news";
  if (normalized === "technology" || normalized === "tech") return "technology news";
  if (normalized === "science") return "science news";
  if (normalized === "entertainment" || normalized === "celebrity") return "entertainment news";
  if (normalized === "food") return "food news";
  if (normalized === "travel") return "travel news";
  if (normalized === "politics") return "politics news";
  if (normalized === "world") return "world news";
  if (normalized === "crime") return "crime news";
  if (normalized === "art" || normalized === "arts") return "art news";
  if (normalized === "opinion") return "opinion news";

  return category.trim();
}
