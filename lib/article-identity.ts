import { cleanDisplayText } from "./display-text";

type ArticleIdentityInput = {
  id?: number | null;
  title?: string | null;
  source?: string | null;
  url?: string | null;
  publishedAt?: string | null;
};

export function normalizeArticleUrl(url?: string | null) {
  if (!url?.trim()) {
    return "";
  }

  try {
    const parsed = new URL(url.trim());
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
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeIdentityText(value?: string | null) {
  return cleanDisplayText(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashValue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

export function buildStableArticleKey(article: ArticleIdentityInput) {
  const normalizedUrl = normalizeArticleUrl(article.url);

  if (normalizedUrl) {
    return `url:${normalizedUrl}`;
  }

  const normalizedTitle = normalizeIdentityText(article.title);
  const normalizedSource = normalizeIdentityText(article.source);
  const normalizedPublishedAt = article.publishedAt?.trim() ?? "";

  return `hash:${hashValue(
    [normalizedTitle, normalizedSource, normalizedPublishedAt].join("|")
  )}`;
}

export function isMissingCommentKeyColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_key/i.test(message);
}
