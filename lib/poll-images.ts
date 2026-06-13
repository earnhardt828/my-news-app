import type { PollRecord } from "./polls";

const POLL_ARTICLE_IMAGE_STORAGE_KEY = "graffiti-poll-article-images";

type PollArticleImageMap = Record<string, string>;

function normalizeImageValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeTitleKey(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function readPollArticleImageMap() {
  if (typeof window === "undefined") {
    return {} as PollArticleImageMap;
  }

  try {
    const raw = window.localStorage.getItem(POLL_ARTICLE_IMAGE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PollArticleImageMap) : {};
  } catch (error) {
    console.error("POLL ARTICLE IMAGE MAP READ FAILED", error);
    return {};
  }
}

export function savePollArticleImageReferences(input: {
  pollId?: string | null;
  relatedArticleId?: string | null;
  relatedArticleTitle?: string | null;
  imageUrl?: string | null;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const imageUrl = normalizeImageValue(input.imageUrl);

  if (!imageUrl) {
    return;
  }

  const nextMap = readPollArticleImageMap();

  if (input.pollId) {
    nextMap[`poll:${input.pollId}`] = imageUrl;
  }

  if (input.relatedArticleId) {
    nextMap[`article:${input.relatedArticleId}`] = imageUrl;
  }

  const normalizedTitle = normalizeTitleKey(input.relatedArticleTitle);
  if (normalizedTitle) {
    nextMap[`title:${normalizedTitle}`] = imageUrl;
  }

  try {
    window.localStorage.setItem(
      POLL_ARTICLE_IMAGE_STORAGE_KEY,
      JSON.stringify(nextMap)
    );
  } catch (error) {
    console.error("POLL ARTICLE IMAGE MAP SAVE FAILED", error);
  }
}

export function getStoredPollArticleImage(
  poll: Pick<PollRecord, "id" | "related_article_id" | "related_article_title">
) {
  const imageMap = readPollArticleImageMap();
  return (
    imageMap[`poll:${poll.id}`] ??
    (poll.related_article_id ? imageMap[`article:${poll.related_article_id}`] : null) ??
    imageMap[`title:${normalizeTitleKey(poll.related_article_title)}`] ??
    null
  );
}
