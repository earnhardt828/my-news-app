"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import LoadingScreen from "../../components/loading-screen";
import ShareButton from "../../components/share-button";
import SourceHeaderMark from "../../components/source-header-mark";
import { apiFetch, isNativeCapacitorRuntime } from "../../../lib/api-base";
import {
  buildStableArticleKey,
  isMissingCommentKeyColumnError,
} from "../../../lib/article-identity";
import {
  getBestArticleImage,
  looksLikeLowQualityImageUrl,
} from "../../../lib/article-images";
import { listMutuallyHiddenUserIds } from "../../../lib/blocked-users";
import { cleanDisplayText } from "../../../lib/display-text";
import { ensureProfileRow } from "../../../lib/profile-store";
import { isCommentAllowed } from "../../../lib/moderation";
import { getSourceBoxLogoUrl, slugifySourceName } from "../../../lib/source-logos";
import { supabase } from "../../../lib/supabase";

type ArticleRecord = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  cardImage?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  urlToImage?: string | null;
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
};

type ArticleComment = {
  id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  avatar_url: string | null;
  likes: number;
  dislikes: number;
  currentUserReaction: "like" | "dislike" | null;
  replies: CommentReply[];
};

type CommentReply = {
  id: number;
  comment_id: number;
  article_id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  avatar_url: string | null;
};

type DbComment = {
  id: number;
  article_id: number | string | null;
  article_key?: string | null;
  article_title?: string | null;
  article_source?: string | null;
  article_image?: string | null;
  article_url?: string | null;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbLike = {
  id: number;
  article_id: number;
  user_id: string | null;
};

type DbSavedArticle = {
  article_id: number | string | null;
  title: string | null;
  source: string | null;
  image: string | null;
  url: string | null;
  category?: string | null;
  time?: string | null;
  published_at?: string | null;
};

type DbProfile = {
  id: string;
  avatar_url: string | null;
};

type DbBlockedUser = {
  blocked_id: string;
};

type DbCommentReaction = {
  id: number;
  comment_id: number;
  user_id: string;
  reaction_type: "like" | "dislike";
};

type DbCommentReply = {
  id: number;
  comment_id: number;
  article_id: number | string | null;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type SummaryParagraph = string;

type PaginatedNewsResponse = {
  articles: ArticleRecord[];
  nextPage?: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const actionIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const COMPARE_SOURCES_TUTORIAL_KEY = "reflekt-compare-sources-tutorial-seen";
const ARTICLE_METADATA_STORAGE_KEY = "graffiti-article-metadata-cache";
const ARTICLE_COMPARE_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "by",
  "at",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "into",
  "new",
  "says",
  "said",
  "after",
  "before",
  "news",
  "more",
  "will",
  "can",
]);

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) {
    return "Just now";
  }

  const createdAt = new Date(timestamp).getTime();

  if (Number.isNaN(createdAt)) {
    return "Just now";
  }

  const diffMs = Date.now() - createdAt;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes === 1) {
    return "1 minute ago";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours === 1) {
    return "1 hour ago";
  }

  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return "1 day ago";
  }

  return `${diffDays} days ago`;
}

function readStoredArticleMetadata(articleId: number) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawCache = window.localStorage.getItem(ARTICLE_METADATA_STORAGE_KEY);

    if (!rawCache) {
      return null;
    }

    const cache = JSON.parse(rawCache) as Record<string, Partial<ArticleRecord> & { id?: number }>;
    const cachedArticle = cache[String(articleId)];

    if (!cachedArticle?.id || cachedArticle.id !== articleId) {
      return null;
    }

    if (!cachedArticle.title || !cachedArticle.source) {
      return null;
    }

    return {
      id: articleId,
      title: cachedArticle.title,
      source: cachedArticle.source,
      category: cachedArticle.category ?? "News",
      time: cachedArticle.time ?? "Recent story",
      cardImage: (cachedArticle.cardImage as string | null | undefined) ?? null,
      image: cachedArticle.image ?? null,
      imageUrl: cachedArticle.imageUrl ?? null,
      urlToImage: cachedArticle.urlToImage ?? null,
      mediaContent: cachedArticle.mediaContent ?? null,
      enclosureUrl: cachedArticle.enclosureUrl ?? null,
      ogImage: (cachedArticle.ogImage as string | null | undefined) ?? null,
      twitterImage: (cachedArticle.twitterImage as string | null | undefined) ?? null,
      thumbnail: cachedArticle.thumbnail ?? null,
      description: cachedArticle.description ?? null,
      url: cachedArticle.url ?? null,
      publishedAt: cachedArticle.publishedAt ?? null,
      content: cachedArticle.content ?? null,
    } satisfies ArticleRecord;
  } catch (error) {
    console.error("ARTICLE METADATA CACHE READ FAILED", error);
    return null;
  }
}

function normalizeSummaryText(value: string) {
  return value
    .replace(/link\([^)]*\)/gi, " ")
    .replace(/"url"\s*:\s*"[^"]*"/gi, " ")
    .replace(/"target"\s*:\s*"[^"]*"/gi, " ")
    .replace(/"attributes"\s*:\s*\[[^\]]*\]/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[<{][^>]*[>}]?/g, " ")
    .replace(/\[\+\d+\s+chars\]/gi, "")
    .replace(/(\.\.\.|…)+/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function protectSentenceAbbreviations(value: string) {
  return value
    .replace(/\bU\.S\./gi, (match) => match.replace(/\./g, "__DOT__"))
    .replace(/\bU\.K\./gi, (match) => match.replace(/\./g, "__DOT__"))
    .replace(/\bE\.U\./gi, (match) => match.replace(/\./g, "__DOT__"))
    .replace(/\bU\.N\./gi, (match) => match.replace(/\./g, "__DOT__"))
    .replace(/\bMr\./g, "Mr__DOT__")
    .replace(/\bMrs\./g, "Mrs__DOT__")
    .replace(/\bMs\./g, "Ms__DOT__")
    .replace(/\bDr\./g, "Dr__DOT__");
}

function restoreSentenceAbbreviations(value: string) {
  return value.replace(/__DOT__/g, ".");
}

function extractDateline(text: string) {
  const match = text.match(
    /^([A-Z][A-Z\s.'-]{2,40}(?:\s*\([A-Z]+\))?)\s+[—-]\s+/
  );

  if (!match) {
    return {
      dateline: null as string | null,
      remainder: text,
    };
  }

  return {
    dateline: match[1].trim(),
    remainder: text.slice(match[0].length).trim(),
  };
}

function cleanSummarySentence(sentence: string) {
  const cleaned = normalizeSummaryText(restoreSentenceAbbreviations(sentence))
    .replace(/^[A-Z][A-Z\s.'-]{2,40}(?:\s*\([A-Z]+\))?\s+[—-]\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const withoutTrailingPunctuation = cleaned.replace(/[;:,/-]+$/g, "").trim();
  const finalized = /[.!?]$/.test(withoutTrailingPunctuation)
    ? withoutTrailingPunctuation
    : `${withoutTrailingPunctuation}.`;

  return finalized.charAt(0).toUpperCase() + finalized.slice(1);
}

function trimToLastFullSentence(value: string) {
  const normalized = normalizeSummaryText(value);

  if (!normalized) {
    return "";
  }

  const protectedText = protectSentenceAbbreviations(normalized);
  const matches = protectedText.match(/[^.!?]+[.!?]/g);

  if (!matches || matches.length === 0) {
    return "";
  }

  return restoreSentenceAbbreviations(matches.join(" ").trim());
}

function getCompleteSentences(value: string) {
  const normalized = trimToLastFullSentence(value);

  if (!normalized) {
    return [];
  }

  return protectSentenceAbbreviations(normalized)
    .match(/[^.!?]+[.!?]/g)
    ?.map((sentence) => restoreSentenceAbbreviations(sentence))
    ?.map((sentence) => cleanSummarySentence(sentence))
    .filter((sentence) => {
      if (!sentence) {
        return false;
      }

      const terminalWord = sentence
        .replace(/[.!?]+$/, "")
        .trim()
        .split(/\s+/)
        .at(-1);

      return !(terminalWord && terminalWord.length === 1 && sentence.split(/\s+/).length >= 4);
    }) ?? [];
}

function normalizeArticleId(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function getStableArticleKey(article: Pick<ArticleRecord, "id" | "title" | "source" | "url" | "publishedAt">) {
  return buildStableArticleKey(article);
}

function normalizeNewsPayload(payload: ArticleRecord[] | PaginatedNewsResponse) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.articles ?? [];
}

function mergeArticleImageMetadata(
  primaryArticle: ArticleRecord | null,
  fallbackArticle: ArticleRecord | null
) {
  if (!primaryArticle) {
    return fallbackArticle;
  }

  if (!fallbackArticle) {
    return primaryArticle;
  }

  return {
    ...fallbackArticle,
    ...primaryArticle,
    cardImage: primaryArticle.cardImage ?? fallbackArticle.cardImage ?? null,
    image: primaryArticle.image ?? fallbackArticle.image ?? null,
    imageUrl: primaryArticle.imageUrl ?? fallbackArticle.imageUrl ?? null,
    urlToImage: primaryArticle.urlToImage ?? fallbackArticle.urlToImage ?? null,
    mediaContent: primaryArticle.mediaContent ?? fallbackArticle.mediaContent ?? null,
    enclosureUrl: primaryArticle.enclosureUrl ?? fallbackArticle.enclosureUrl ?? null,
    ogImage: primaryArticle.ogImage ?? fallbackArticle.ogImage ?? null,
    twitterImage: primaryArticle.twitterImage ?? fallbackArticle.twitterImage ?? null,
    thumbnail: primaryArticle.thumbnail ?? fallbackArticle.thumbnail ?? null,
    description: primaryArticle.description ?? fallbackArticle.description ?? null,
    content: primaryArticle.content ?? fallbackArticle.content ?? null,
    publishedAt: primaryArticle.publishedAt ?? fallbackArticle.publishedAt ?? null,
    url: primaryArticle.url ?? fallbackArticle.url ?? null,
  } satisfies ArticleRecord;
}

function normalizeCompareText(value: string | null | undefined) {
  return cleanDisplayText(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImportantKeywords(value: string | null | undefined) {
  const normalized = normalizeCompareText(value);

  if (!normalized) {
    return {
      keywords: new Set<string>(),
      phrases: new Set<string>(),
    };
  }

  const words = normalized
    .split(" ")
    .filter(
      (word) => word.length >= 3 && !ARTICLE_COMPARE_STOP_WORDS.has(word)
    );
  const keywords = new Set(words);
  const phraseCounts = new Map<string, number>();

  for (let start = 0; start < words.length; start += 1) {
    for (let size = 2; size <= 4; size += 1) {
      const phraseWords = words.slice(start, start + size);

      if (phraseWords.length !== size) {
        continue;
      }

      const phrase = phraseWords.join(" ");
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }

  const phrases = new Set<string>(
    [...phraseCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([phrase]) => phrase)
  );

  return {
    keywords,
    phrases,
  };
}

function getSharedKeywords(left: Set<string>, right: Set<string>) {
  return [...left].filter((token) => right.has(token));
}

function hasStrongPhraseMatch(left: Set<string>, right: Set<string>) {
  return [...left].some((phrase) => right.has(phrase));
}

function buildArticleCompareQueries(article: ArticleRecord) {
  const titleKeywords = [...extractImportantKeywords(article.title).keywords].slice(0, 6);
  const titlePhrases = [...extractImportantKeywords(article.title).phrases].slice(0, 2);
  const queries = [
    titleKeywords.slice(0, 5).join(" "),
    titlePhrases[0] ?? "",
    titleKeywords.slice(0, 3).join(" "),
    titleKeywords.slice(3, 6).join(" "),
  ]
    .map((query) => query.trim())
    .filter(Boolean);

  if (queries.length > 0) {
    return [...new Set(queries)].slice(0, 4);
  }

  return [cleanDisplayText(article.title).split(/\s+/).slice(0, 4).join(" ")];
}

function buildCompareArticles(baseArticle: ArticleRecord, allArticles: ArticleRecord[]) {
  const baseTitle = extractImportantKeywords(baseArticle.title);
  const baseDescription = extractImportantKeywords(baseArticle.description ?? "");
  const baseContent = extractImportantKeywords(baseArticle.content ?? "");
  const basePublishedAt = baseArticle.publishedAt
    ? new Date(baseArticle.publishedAt).getTime()
    : 0;
  const baseBodyKeywords = new Set([
    ...baseDescription.keywords,
    ...baseContent.keywords,
  ]);
  const baseBodyPhrases = new Set([
    ...baseDescription.phrases,
    ...baseContent.phrases,
  ]);

  const scoredCandidates = allArticles
    .filter((article) => article.id !== baseArticle.id)
    .map((article) => {
      const candidateTitle = extractImportantKeywords(article.title);
      const candidateDescription = extractImportantKeywords(article.description ?? "");
      const candidateContent = extractImportantKeywords(article.content ?? "");
      const candidateBodyKeywords = new Set([
        ...candidateDescription.keywords,
        ...candidateContent.keywords,
      ]);
      const candidateBodyPhrases = new Set([
        ...candidateDescription.phrases,
        ...candidateContent.phrases,
      ]);

      const titleShared = getSharedKeywords(baseTitle.keywords, candidateTitle.keywords);
      const descriptionShared = getSharedKeywords(baseBodyKeywords, candidateBodyKeywords);
      const titlePhraseMatch = hasStrongPhraseMatch(baseTitle.phrases, candidateTitle.phrases);
      const bodyPhraseMatch = hasStrongPhraseMatch(baseBodyPhrases, candidateBodyPhrases);
      const sharedKeywords = [...new Set([...titleShared, ...descriptionShared])];
      const candidatePublishedAt = article.publishedAt
        ? new Date(article.publishedAt).getTime()
        : 0;
      const publishedWithinSevenDays =
        Boolean(basePublishedAt && candidatePublishedAt) &&
        Math.abs(basePublishedAt - candidatePublishedAt) <= 7 * 24 * 60 * 60 * 1000;

      let score = 0;
      score += titlePhraseMatch ? 5 : 0;
      score += titleShared.length * 3;
      score += descriptionShared.length * 2;
      score += article.category === baseArticle.category ? 2 : 0;
      score += publishedWithinSevenDays ? 1 : 0;
      score += article.source !== baseArticle.source ? 2 : -10;
      if (sharedKeywords.length < 2 && !titlePhraseMatch && !bodyPhraseMatch) {
        score -= 10;
      }

      return {
        article,
        score,
        sharedKeywords,
        titleSharedCount: titleShared.length,
        descriptionSharedCount: descriptionShared.length,
        strongPhraseMatch: titlePhraseMatch || bodyPhraseMatch,
        sameSource: article.source === baseArticle.source,
      };
    })
    .filter(
      (candidate) =>
        candidate.titleSharedCount >= 2 || candidate.strongPhraseMatch
    )
    .sort((left, right) => right.score - left.score);

  const strictCandidates = scoredCandidates.filter(
    (candidate) => candidate.titleSharedCount >= 2 || candidate.strongPhraseMatch
  );
  const relaxedCandidates = scoredCandidates.filter(
    (candidate) =>
      candidate.titleSharedCount >= 1 ||
      candidate.descriptionSharedCount >= 2 ||
      candidate.strongPhraseMatch
  );
  const candidatePool =
    strictCandidates.filter((candidate) => !candidate.sameSource).length >= 2
      ? strictCandidates
      : relaxedCandidates;

  console.log("COMPARE KEYWORDS", {
    title: [...baseTitle.keywords],
    description: [...baseDescription.keywords],
    content: [...baseContent.keywords],
    phrases: [...new Set([...baseTitle.phrases, ...baseDescription.phrases, ...baseContent.phrases])],
  });
  console.log(
    "COMPARE SCORES",
    candidatePool.map((candidate) => ({
      title: candidate.article.title,
      source: candidate.article.source,
      score: candidate.score,
      shared: candidate.sharedKeywords,
    }))
  );
  console.log("COMPARE FILTERED COUNTS", {
    scored: scoredCandidates.length,
    strict: strictCandidates.length,
    relaxed: relaxedCandidates.length,
    using: candidatePool === strictCandidates ? "strict" : "relaxed",
  });

  const differentSourceCandidates = candidatePool.filter((candidate) => !candidate.sameSource);
  const sameSourceCandidates = candidatePool.filter((candidate) => candidate.sameSource);
  const selectedMatches: Array<{
    article: ArticleRecord;
    score: number;
    sharedKeywords: string[];
  }> = [];
  const usedSources = new Set<string>([baseArticle.source]);

  differentSourceCandidates.forEach((candidate) => {
    if (selectedMatches.length >= 5) {
      return;
    }

    if (usedSources.has(candidate.article.source)) {
      return;
    }

    selectedMatches.push({
      article: candidate.article,
      score: candidate.score,
      sharedKeywords: candidate.sharedKeywords,
    });
    usedSources.add(candidate.article.source);
  });

  if (selectedMatches.length >= 2) {
    sameSourceCandidates.forEach((candidate) => {
      if (selectedMatches.length >= 5) {
        return;
      }

      if (selectedMatches.some((match) => match.article.id === candidate.article.id)) {
        return;
      }

      selectedMatches.push({
        article: candidate.article,
        score: candidate.score,
        sharedKeywords: candidate.sharedKeywords,
      });
    });
  }

  const finalMatches = [baseArticle, ...selectedMatches.map((match) => match.article)].slice(0, 6);
  console.log(
    "COMPARE MATCHES",
    selectedMatches.map((match) => ({
      title: match.article.title,
      source: match.article.source,
      score: match.score,
      sharedKeywords: match.sharedKeywords,
    }))
  );
  console.log(
    "FINAL COMPARE MATCHES",
    finalMatches.map((match) => match.title)
  );

  return finalMatches;
}

function sortComments(
  comments: ArticleComment[],
  mode: "top" | "newest"
) {
  const copied = [...comments];

  if (mode === "newest") {
    return copied.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }

  return copied.sort((a, b) => {
    if (b.likes === a.likes) {
      return b.likes - a.likes;
    }

    return b.likes - a.likes;
  });
}

function buildSummaryParagraphs(
  title: string,
  source?: string | null,
  category?: string | null,
  description?: string | null,
  content?: string | null,
  publishedAt?: string | null
): SummaryParagraph[] {
  const normalizedTitle = cleanDisplayText(title);
  const normalizedDescription = trimToLastFullSentence(cleanDisplayText(description ?? ""));
  const normalizedContent = trimToLastFullSentence(cleanDisplayText(content ?? ""));
  const descriptionDateline = extractDateline(normalizedDescription);
  const contentDateline = extractDateline(normalizedContent);
  const dateline = descriptionDateline.dateline ?? contentDateline.dateline;
  const uniquePoints: string[] = [];

  const completeSentences = [
    ...getCompleteSentences(descriptionDateline.remainder),
    ...getCompleteSentences(contentDateline.remainder),
  ];

  completeSentences.forEach((cleanedSentence) => {
    if (!cleanedSentence) {
      return;
    }

    const alreadyIncluded = uniquePoints.some(
      (existing) => existing.toLowerCase() === cleanedSentence.toLowerCase()
    );

    if (
      !alreadyIncluded &&
      cleanedSentence.length >= 20 &&
      uniquePoints.length < 8
    ) {
      uniquePoints.push(cleanedSentence);
    }
  });

  const titleFallback =
    cleanSummarySentence(normalizedTitle) || `${normalizedTitle}.`;

  if (uniquePoints.length === 0) {
    uniquePoints.push(titleFallback);
  }

  const fallbackCandidates = [
    getCompleteSentences(normalizedDescription)[0] ?? "",
    getCompleteSentences(normalizedContent)[0] ?? "",
    titleFallback,
  ].filter(Boolean);

  fallbackCandidates.forEach((candidate) => {
    const alreadyIncluded = uniquePoints.some(
      (existing) => existing.toLowerCase() === candidate.toLowerCase()
    );

    if (!alreadyIncluded && uniquePoints.length < 8) {
      uniquePoints.push(candidate);
    }
  });

  if (dateline && uniquePoints.length > 0) {
    const firstPoint = uniquePoints[0].replace(/^[—-]\s*/, "");
    uniquePoints[0] = `${dateline} — ${firstPoint.charAt(0).toLowerCase()}${firstPoint.slice(1)}`;
    uniquePoints[0] =
      uniquePoints[0].charAt(0).toUpperCase() + uniquePoints[0].slice(1);
  }

  const normalizedSource = cleanDisplayText(source ?? "").trim();
  const normalizedCategory = cleanDisplayText(category ?? "").trim();
  const publishedLabel = publishedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(publishedAt))
    : "";
  const introSentence = cleanSummarySentence(
    [
      normalizedSource ? `${normalizedSource} reports` : "",
      normalizedCategory ? `this ${normalizedCategory.toLowerCase()} story` : "this story",
      publishedLabel ? `published ${publishedLabel}` : "",
      "focuses on",
      cleanSummarySentence(normalizedTitle)?.replace(/\.$/, "") ?? normalizedTitle,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const groupedPoints: string[] = [];

  if (introSentence) {
    groupedPoints.push(introSentence);
  }

  for (let index = 0; index < uniquePoints.length; index += 2) {
    const paragraph = uniquePoints.slice(index, index + 2).join(" ").trim();

    if (paragraph) {
      groupedPoints.push(paragraph);
    }
  }

  const contextualSentence = cleanSummarySentence(
    [
      normalizedSource ? `The available report comes from ${normalizedSource}` : "",
      normalizedCategory ? `and is categorized as ${normalizedCategory}` : "",
      !normalizedContent && normalizedDescription
        ? "The recap is based on the available article description and metadata."
        : !normalizedContent && !normalizedDescription
          ? "Only limited article metadata is available for this story."
          : "",
    ]
      .join(" ")
      .trim()
  );

  if (contextualSentence) {
    groupedPoints.push(contextualSentence);
  }

  return groupedPoints
    .slice(0, 5)
    .map((paragraph) => cleanSummarySentence(paragraph))
    .filter(Boolean);
}

export default function ArticleDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const articleId = Number(params.id);
  const commentsOnly = searchParams.get("comments") === "1";
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [likesCount, setLikesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [likedByCurrentUser, setLikedByCurrentUser] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [compareArticles, setCompareArticles] = useState<ArticleRecord[]>([]);
  const [activeCompareIndex, setActiveCompareIndex] = useState(0);
  const [showCompareTutorial, setShowCompareTutorial] = useState(false);
  const [failedArticleImages, setFailedArticleImages] = useState<Record<string, true>>({});
  const [failedArticleBoxImages, setFailedArticleBoxImages] = useState<Record<string, true>>({});
  const [commentSortMode, setCommentSortMode] = useState<"top" | "newest">("top");
  const [isCommentSortSheetOpen, setIsCommentSortSheetOpen] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [replyTarget, setReplyTarget] = useState<{
    commentId: number;
    username: string | null;
  } | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [commentActionTarget, setCommentActionTarget] = useState<ArticleComment | null>(null);
  const [compareStatusMessage, setCompareStatusMessage] = useState("");
  const shouldEnableCompareSources = false;
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const commentsSectionRef = useRef<HTMLElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const compareTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    async function loadArticle() {
      console.log("ARTICLE PAGE ROUTE ID", params.id);

      if (!articleId || Number.isNaN(articleId)) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id ?? null;
      setUserId(currentUserId);

      if (userData.user?.id) {
        const { data: profile, error: profileError } = await ensureProfileRow({
          id: userData.user.id,
          email: userData.user.email ?? null,
        });

        if (profileError) {
          console.error("Error loading article profile:", profileError);
        }

        setUsername(profile?.username ?? null);
      } else {
        setUsername(null);
      }

      const baseNewsRes = await apiFetch("/api/news?mode=trending&page=1&pageSize=75");
      const baseNewsData = normalizeNewsPayload(
        (await baseNewsRes.json()) as ArticleRecord[] | PaginatedNewsResponse
      );
      const contextualCandidates: ArticleRecord[] = [];
      let targetArticle = baseNewsData.find((item) => item.id === articleId) ?? null;

      if (targetArticle) {
        console.log("CURRENT ARTICLE FOR COMPARE", targetArticle);
        console.log("CURRENT SOURCE", targetArticle.source);
        const compareQueries = buildArticleCompareQueries(targetArticle);
        console.log("COMPARE QUERY", compareQueries);

        if (compareQueries.length > 0) {
          const contextualResults = await Promise.allSettled(
            compareQueries.map((compareQuery) =>
              apiFetch(
                `/api/news?mode=compare&query=${encodeURIComponent(
                  compareQuery
                )}&page=1&pageSize=100`
              ).then(async (response) =>
                normalizeNewsPayload(
                  (await response.json()) as ArticleRecord[] | PaginatedNewsResponse
                )
              )
            )
          );

          contextualResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
              contextualCandidates.push(...result.value);
              return;
            }

            console.error("[Article detail] Failed to fetch contextual compare candidates", {
              articleId,
              query: compareQueries[index],
              error: result.reason,
            });
          });
        }
      }

      const newsData = [...baseNewsData];
      console.log("COMPARE CANDIDATE COUNTS", {
        base: baseNewsData.length,
        contextual: contextualCandidates.length,
      });

      contextualCandidates.forEach((candidate) => {
        if (
          newsData.some(
            (existingArticle) =>
              existingArticle.id === candidate.id ||
              (existingArticle.url && candidate.url && existingArticle.url === candidate.url)
          )
        ) {
          return;
        }

        newsData.push(candidate);
      });

      targetArticle = targetArticle ?? newsData.find((item) => item.id === articleId) ?? null;
      const clientStoredArticle = readStoredArticleMetadata(articleId);
      targetArticle = mergeArticleImageMetadata(targetArticle, clientStoredArticle);
      const resolvedArticleKey =
        targetArticle || clientStoredArticle
          ? getStableArticleKey((targetArticle ?? clientStoredArticle) as ArticleRecord)
          : `id:${articleId}`;
      console.log("COMPARE TOTAL CANDIDATES", newsData.length);
      console.log("ARTICLE LIVE MATCH", targetArticle);
      console.log("ARTICLE CLIENT CACHE MATCH", clientStoredArticle);

      if (targetArticle) {
        console.log("CURRENT ARTICLE FOR COMPARE", targetArticle);
        const nextCompareArticles = buildCompareArticles(targetArticle, newsData);
        const compareCandidates = newsData.filter((item) => item.id !== targetArticle.id);
        console.log("COMPARE CANDIDATES COUNT", compareCandidates.length);
        setCompareArticles(nextCompareArticles);
        setActiveCompareIndex(0);
        console.log("COMPARE MATCH COUNT", Math.max(0, nextCompareArticles.length - 1));
        setCompareStatusMessage(
          nextCompareArticles.length > 2 ? "" : "No other sources found yet."
        );
        if (
          nextCompareArticles.length > 2 &&
          typeof window !== "undefined" &&
          window.localStorage.getItem(COMPARE_SOURCES_TUTORIAL_KEY) !== "true"
        ) {
          setShowCompareTutorial(true);
        } else {
          setShowCompareTutorial(false);
        }
      } else {
        setCompareArticles([]);
        setActiveCompareIndex(0);
        setShowCompareTutorial(false);
        setCompareStatusMessage("No other sources found yet.");
      }

      const legacyArticleId = targetArticle
        ? newsData.findIndex((item) => item.id === targetArticle.id) + 1
        : null;
      const articleIdCandidates = Array.from(
        new Set(
          [articleId, legacyArticleId]
            .map((value) => normalizeArticleId(value))
          .filter((value): value is number => value !== null)
        )
      );

      let commentsRes: {
        data: DbComment[] | null;
        error: { message?: string } | null;
      };

      const commentSelectFields =
        "id, article_id, article_key, article_title, article_source, article_image, article_url, user_id, username, text, created_at";

      let commentsUseArticleKeyOnly = true;
      commentsRes = await supabase
        .from("comments")
        .select(commentSelectFields)
        .eq("article_key", resolvedArticleKey);

      if (commentsRes.error && isMissingCommentKeyColumnError(commentsRes.error.message)) {
        commentsUseArticleKeyOnly = false;
        commentsRes = await supabase
          .from("comments")
          .select(
            "id, article_id, article_title, article_source, article_image, article_url, user_id, username, text, created_at"
          )
          .in("article_id", articleIdCandidates);
      }
      console.log("ARTICLE COMMENT KEY", resolvedArticleKey);

      if (
        commentsRes.error &&
        isMissingCommentMetadataColumnError(commentsRes.error.message)
      ) {
        commentsRes = await supabase
          .from("comments")
          .select("id, article_id, user_id, username, text, created_at")
          .in("article_id", articleIdCandidates);
      }

      const [likesRes, profilesRes, storedBookmarksRes] = await Promise.all([
        supabase
          .from("likes")
          .select("id, article_id, user_id")
          .eq("article_id", articleId),
        supabase.from("profiles").select("id, avatar_url"),
        supabase
          .from("saved_articles")
          .select("article_id, title, source, image, url, category, time, published_at")
          .in("article_id", articleIdCandidates)
          .limit(1),
      ]);

      if (likesRes.error) {
        console.error("[Article detail] Failed to fetch likes", {
          articleId,
          error: likesRes.error,
        });
      }

      if (commentsRes.error) {
        console.error("[Article detail] Failed to fetch comments", {
          articleId,
          articleIdType: typeof articleId,
          articleIdCandidates,
          error: commentsRes.error,
        });
      }

      if (profilesRes.error) {
        console.error("[Article detail] Failed to fetch profile avatars for comments", {
          articleId,
          error: profilesRes.error,
        });
      }

      if (storedBookmarksRes.error) {
        console.error("[Article detail] Failed to fetch saved article fallback metadata", {
          articleId,
          articleIdCandidates,
          error: storedBookmarksRes.error,
        });
      }

      const rawComments = (commentsRes.data ?? []) as DbComment[];
      console.log(
        "COMMENTS FETCHED FOR KEY",
        resolvedArticleKey,
        rawComments.filter((comment) =>
          commentsUseArticleKeyOnly
            ? comment.article_key === resolvedArticleKey
            : articleIdCandidates.includes(normalizeArticleId(comment.article_id) ?? Number.NaN)
        ).length
      );
      const storedBookmarkRows = (storedBookmarksRes.data ?? []) as DbSavedArticle[];
      const storedCommentMetadata =
        rawComments.find(
          (comment) =>
            Boolean(comment.article_title?.trim()) ||
            Boolean(comment.article_source?.trim()) ||
            Boolean(comment.article_image?.trim()) ||
            Boolean(comment.article_url?.trim())
        ) ?? null;
      const storedBookmarkMetadata = storedBookmarkRows[0] ?? null;
      const bookmarkFallbackArticle =
        storedCommentMetadata || storedBookmarkMetadata
          ? ({
              id: articleId,
              title:
                storedCommentMetadata?.article_title?.trim() ||
                storedBookmarkMetadata?.title?.trim() ||
                "Article",
              source:
                storedCommentMetadata?.article_source?.trim() ||
                storedBookmarkMetadata?.source?.trim() ||
                "Graffiti",
              category: storedBookmarkMetadata?.category?.trim() || "News",
              time:
                storedBookmarkMetadata?.time?.trim() ||
                (storedBookmarkMetadata?.published_at ? "Archived story" : "Stored story"),
              cardImage:
                storedCommentMetadata?.article_image?.trim() ||
                storedBookmarkMetadata?.image?.trim() ||
                null,
              image:
                storedCommentMetadata?.article_image?.trim() ||
                storedBookmarkMetadata?.image?.trim() ||
                null,
              imageUrl:
                storedCommentMetadata?.article_image?.trim() ||
                storedBookmarkMetadata?.image?.trim() ||
                null,
              urlToImage:
                storedCommentMetadata?.article_image?.trim() ||
                storedBookmarkMetadata?.image?.trim() ||
                null,
              url:
                storedCommentMetadata?.article_url?.trim() ||
                storedBookmarkMetadata?.url?.trim() ||
                null,
              publishedAt: storedBookmarkMetadata?.published_at?.trim() || null,
              description: null,
              content: null,
            } satisfies ArticleRecord)
          : null;
      const storedArticle =
        targetArticle ?? mergeArticleImageMetadata(bookmarkFallbackArticle, clientStoredArticle);
      console.log("ARTICLE STORED FALLBACK", storedArticle);
      const commentIds = rawComments.map((comment) => comment.id);
      const [reactionsRes, repliesRes] = commentIds.length
        ? await Promise.all([
            supabase
              .from("comment_reactions")
              .select("id, comment_id, user_id, reaction_type")
              .in("comment_id", commentIds),
            supabase
              .from("comment_replies")
              .select("id, comment_id, article_id, text, username, user_id, created_at")
              .in("comment_id", commentIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

      if (reactionsRes.error) {
        console.error("[Article detail] Failed to fetch comment reactions", {
          articleId,
          commentIds,
          error: reactionsRes.error,
        });
      }

      if (repliesRes.error) {
        console.error("[Article detail] Failed to fetch comment replies", {
          articleId,
          articleIdCandidates,
          commentIds,
          error: repliesRes.error,
        });
      }

      const { data: savedArticlesData } = currentUserId
        ? await supabase
            .from("saved_articles")
            .select("article_id")
            .eq("user_id", currentUserId)
            .eq("article_id", articleId)
            .maybeSingle()
        : { data: null as { article_id: number } | null };

      const { data: blockedUsersData, error: blockedUsersError } = currentUserId
        ? await listMutuallyHiddenUserIds(supabase, currentUserId)
        : { data: [] as DbBlockedUser[], error: null };
      if (blockedUsersError) {
        console.error("Error loading blocked users:", blockedUsersError);
      }
      const likes = (likesRes.data ?? []) as DbLike[];
      const commentReactions = (reactionsRes.data ?? []) as DbCommentReaction[];
      const commentReplies = (repliesRes.data ?? []) as DbCommentReply[];
      const profiles = (profilesRes.data ?? []) as DbProfile[];
      const blockedIds = new Set(
        (blockedUsersData ?? []) as string[]
      );
      const avatarLookup = new Map(
        profiles.map((profile) => [profile.id, profile.avatar_url])
      );
      setArticle(storedArticle);
      setLikesCount(likes.length);
      setLikedByCurrentUser(
        likes.some((like) => like.user_id && like.user_id === currentUserId)
      );
      setIsSaved(Boolean(savedArticlesData));
      setComments(
        rawComments
          .filter(
            (comment) => {
              const normalizedCommentArticleId = normalizeArticleId(comment.article_id);

              return (
                (commentsUseArticleKeyOnly
                  ? comment.article_key?.trim() === resolvedArticleKey
                  : normalizedCommentArticleId !== null &&
                    articleIdCandidates.includes(normalizedCommentArticleId)) &&
                (!comment.user_id || !blockedIds.has(comment.user_id))
              );
            }
          )
          .map((comment) => {
            const reactions = commentReactions.filter(
              (reaction) => reaction.comment_id === comment.id
            );
            const replies = commentReplies
              .filter(
                (reply) =>
                  reply.comment_id === comment.id &&
                  articleIdCandidates.includes(
                    normalizeArticleId(reply.article_id) ?? Number.NaN
                  ) &&
                  (!reply.user_id || !blockedIds.has(reply.user_id))
              )
              .map((reply) => ({
                id: reply.id,
                comment_id: reply.comment_id,
                article_id: normalizeArticleId(reply.article_id) ?? articleId,
                text: reply.text,
                username: reply.username,
                user_id: reply.user_id,
                created_at: reply.created_at,
                avatar_url: reply.user_id
                  ? avatarLookup.get(reply.user_id) ?? null
                  : null,
              }));

            return {
              id: comment.id,
              text: comment.text,
              username: comment.username,
              user_id: comment.user_id,
              created_at: comment.created_at,
              avatar_url: comment.user_id
                ? avatarLookup.get(comment.user_id) ?? null
                : null,
              likes: reactions.filter((reaction) => reaction.reaction_type === "like")
                .length,
              dislikes: reactions.filter((reaction) => reaction.reaction_type === "dislike")
                .length,
              currentUserReaction:
                reactions.find((reaction) => reaction.user_id === currentUserId)
                  ?.reaction_type ?? null,
              replies,
            };
          })
      );
      setIsLoading(false);
    }

    loadArticle();
  }, [articleId, params.id]);

  useEffect(() => {
    if (typeof window === "undefined" || comments.length === 0) {
      return;
    }

    const hash = window.location.hash;

    window.requestAnimationFrame(() => {
      if (hash === "#comments") {
        commentsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        window.setTimeout(() => {
          commentInputRef.current?.focus();
        }, 220);
        return;
      }

      if (!hash.startsWith("#comment-")) {
        return;
      }

      const target = document.querySelector(hash);

      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [comments]);

  useEffect(() => {
    if (replyTarget) {
      commentInputRef.current?.focus();
    }
  }, [replyTarget]);

  useEffect(() => {
    const handleArticleCommentSortToggle = () => {
      setIsCommentSortSheetOpen((current) => !current);
    };

    window.addEventListener(
      "reflekt:article-comment-sort-toggle",
      handleArticleCommentSortToggle
    );

    return () => {
      window.removeEventListener(
        "reflekt:article-comment-sort-toggle",
        handleArticleCommentSortToggle
      );
    };
  }, []);

  const activeCompareArticle = compareArticles[activeCompareIndex] ?? article;

  useEffect(() => {
    if (!activeCompareArticle?.source) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("reflekt:article-source", {
        detail: activeCompareArticle.source,
      })
    );
  }, [activeCompareArticle?.source]);

  useEffect(() => {
    if (!showCompareTutorial) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COMPARE_SOURCES_TUTORIAL_KEY, "true");
      }
      setShowCompareTutorial(false);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showCompareTutorial]);

  const displayedComments = useMemo(
    () => sortComments(comments, commentSortMode),
    [commentSortMode, comments]
  );

  const createNotification = async ({
    recipientUserId,
    type,
    commentId,
    replyId,
  }: {
    recipientUserId: string | null;
    type: "comment_like" | "comment_reply";
    commentId: number;
    replyId?: number | null;
  }) => {
    if (!userId || !recipientUserId || recipientUserId === userId) {
      return;
    }

    const { error } = await supabase.from("notifications").insert({
      recipient_user_id: recipientUserId,
      actor_user_id: userId,
      type,
      article_id: articleId,
      comment_id: commentId,
      reply_id: replyId ?? null,
    });

    if (error) {
      console.error("Error creating notification:", error);
    }
  };

  const handleToggleLike = async () => {
    if (!userId) {
      alert("Log in to like posts");
      return;
    }

    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Error removing like:", error);
        return;
      }

      setLikedByCurrentUser(false);
      setLikesCount((prev) => Math.max(0, prev - 1));
      return;
    }

    const { error } = await supabase.from("likes").insert({
      article_id: articleId,
      user_id: userId,
    });

    if (error) {
      console.error("Error saving like:", error);
      return;
    }

    setLikedByCurrentUser(true);
    setLikesCount((prev) => prev + 1);
  };

  const handleToggleSave = async () => {
    if (!userId || !article) {
      alert("Log in to save articles");
      return;
    }

    if (isSaved) {
      const { error } = await supabase
        .from("saved_articles")
        .delete()
        .eq("user_id", userId)
        .eq("article_id", article.id);

      if (error) {
        console.error("Error removing saved article:", error);
        alert(error.message ?? "Could not remove saved article");
        return;
      }

      setIsSaved(false);
      return;
    }

    const { error } = await supabase.from("saved_articles").upsert(
      {
        user_id: userId,
        article_id: article.id,
        title: cleanDisplayText(article.title),
        source: article.source,
        category: article.category,
        time: article.time,
        url: article.url ?? null,
        image: getBestArticleImage(article).src,
        published_at: article.publishedAt ?? null,
      },
      {
        onConflict: "user_id,article_id",
      }
    );

    if (error) {
      console.error("Error saving article:", error);
      alert(error.message ?? "Could not save article");
      return;
    }

    setIsSaved(true);
  };

  const formatPublishedTimestamp = (publishedAt?: string | null, fallback?: string) => {
    const date = publishedAt ? new Date(publishedAt) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return fallback ?? "Unknown";
    }

    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = `${date.getMinutes()}`.padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  const handleAddComment = async () => {
    const text = commentInput.trim();

    if (!text) {
      return;
    }

    if (!userId) {
      alert("Log in to comment");
      return;
    }

    if (!username) {
      alert("Set a username on your Profile page first");
      return;
    }

    if (!isCommentAllowed(text)) {
      alert("Please edit your comment before posting.");
      return;
    }

    if (replyTarget) {
      const parentComment = comments.find((comment) => comment.id === replyTarget.commentId);

      if (!parentComment) {
        setReplyTarget(null);
        return;
      }

      const { data, error } = await supabase
        .from("comment_replies")
        .insert({
          comment_id: replyTarget.commentId,
          article_id: articleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving reply:", error);
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === replyTarget.commentId
            ? {
                ...comment,
                replies: [
                  ...comment.replies,
                  {
                    id: data.id,
                    comment_id: data.comment_id,
                    article_id: data.article_id,
                    text: data.text,
                    username: data.username,
                    user_id: data.user_id,
                    created_at: data.created_at,
                    avatar_url: null,
                  },
                ],
              }
            : comment
        )
      );

      void createNotification({
        recipientUserId: parentComment.user_id,
        type: "comment_reply",
        commentId: replyTarget.commentId,
        replyId: data.id,
      });

      setCommentInput("");
      setReplyTarget(null);
      return;
    }

    const currentCommentArticle = compareArticle ?? article;
    const currentCommentArticleImage = currentCommentArticle
      ? getBestArticleImage(currentCommentArticle).src
      : null;
    const commentInsertPayload = {
      article_id: articleId,
      article_key: currentCommentArticle
        ? getStableArticleKey(currentCommentArticle)
        : `id:${articleId}`,
      article_title: cleanDisplayText(currentCommentArticle?.title ?? null) || null,
      article_source: currentCommentArticle?.source ?? null,
      article_image: currentCommentArticleImage,
      article_url: currentCommentArticle?.url ?? null,
      text,
      user_id: userId,
      username,
    };

    console.log("COMMENT INSERT PAYLOAD:", commentInsertPayload);

    let insertResponse = await supabase
      .from("comments")
      .insert(commentInsertPayload)
      .select()
      .single();

    if (
      insertResponse.error &&
      (isMissingCommentMetadataColumnError(insertResponse.error.message) ||
        isMissingCommentKeyColumnError(insertResponse.error.message))
    ) {
      console.error(
        "Article comment insert failed with article metadata payload, retrying without optional columns:",
        insertResponse.error
      );

      insertResponse = await supabase
        .from("comments")
        .insert({
          article_id: articleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();
    }

    const { data, error } = insertResponse;

    if (error) {
      console.error("Error saving comment:", error);
      return;
    }

    console.log("COMMENT INSERT RESULT:", data);

    if (!data.article_title) {
      console.warn(
        "Inserted comment row is missing article_title. This usually means the comments metadata columns have not been added in Supabase yet."
      );
    }

    setComments((prev) => [
      ...prev,
      {
        id: data.id,
        text: data.text,
        username: data.username,
        user_id: data.user_id,
        created_at: data.created_at,
        avatar_url: null,
        likes: 0,
        dislikes: 0,
        currentUserReaction: null,
        replies: [],
      },
    ]);
    setCommentInput("");
  };

  const handleCommentReaction = async (commentId: number) => {
    if (!userId) {
      alert("Log in to react to comments");
      return;
    }

    const targetComment = comments.find((comment) => comment.id === commentId);

    if (!targetComment) {
      return;
    }

    setActiveCommentAction(`reaction-${commentId}`);

    const { data: existingReaction } = await supabase
      .from("comment_reactions")
      .select("id, reaction_type")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingReaction?.reaction_type === "like") {
      const { error } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error removing comment reaction:", error);
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likes: Math.max(0, comment.likes - 1),
                currentUserReaction: null,
              }
            : comment
        )
      );
      return;
    }

    if (existingReaction) {
      const { error } = await supabase
        .from("comment_reactions")
        .update({ reaction_type: "like" })
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error updating comment reaction:", error);
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likes: comment.likes + (existingReaction.reaction_type === "like" ? 0 : 1),
                dislikes:
                  existingReaction.reaction_type === "dislike"
                    ? Math.max(0, comment.dislikes - 1)
                    : comment.dislikes,
                currentUserReaction: "like",
              }
            : comment
        )
      );

      if (existingReaction.reaction_type !== "like") {
        void createNotification({
          recipientUserId: targetComment.user_id,
          type: "comment_like",
          commentId,
        });
      }
      return;
    }

    const { error } = await supabase.from("comment_reactions").insert({
      comment_id: commentId,
      user_id: userId,
      reaction_type: "like",
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error creating comment reaction:", error);
      return;
    }

    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              likes: comment.likes + 1,
              currentUserReaction: "like",
            }
          : comment
      )
    );

    void createNotification({
      recipientUserId: targetComment.user_id,
      type: "comment_like",
      commentId,
    });
  };

  const handleSubmitReport = async () => {
    if (!userId || reportingCommentId === null) {
      alert("Log in to report comments");
      return;
    }

    const trimmedReason = reportReason.trim();

    if (!trimmedReason) {
      setReportStatus({
        type: "error",
        text: "Please enter a reason before submitting your report.",
      });
      return;
    }

    setActiveCommentAction(`report-${reportingCommentId}`);
    setReportStatus(null);

    const { error } = await supabase.from("reports").insert({
      comment_id: reportingCommentId,
      user_id: userId,
      reason: trimmedReason,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error reporting comment:", error);
      setReportStatus({
        type: "error",
        text: "Could not submit report. Please try again.",
      });
      return;
    }

    setReportStatus({
      type: "success",
      text: "Report submitted successfully.",
    });
    setReportReason("");
    window.setTimeout(() => {
      setReportingCommentId(null);
      setReportStatus(null);
    }, 1200);
  };

  const handleDeleteComment = async () => {
    if (!userId || deleteCommentId === null) {
      return;
    }

    setActiveCommentAction(`delete-${deleteCommentId}`);
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", deleteCommentId)
      .eq("user_id", userId);
    setActiveCommentAction(null);

    if (error) {
      console.error("Error deleting comment:", error);
      return;
    }

    setComments((prev) => prev.filter((comment) => comment.id !== deleteCommentId));
    setDeleteCommentId(null);
  };

  const openCommentActionSheet = (comment: ArticleComment) => {
    setCommentActionTarget(comment);
  };

  const startCommentLongPress = (comment: ArticleComment) => {
    window.clearTimeout(longPressTimerRef.current ?? undefined);
    longPressTimerRef.current = window.setTimeout(() => {
      openCommentActionSheet(comment);
    }, 420);
  };

  const clearCommentLongPress = () => {
    window.clearTimeout(longPressTimerRef.current ?? undefined);
  };

  const scrollToComments = () => {
    commentsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      commentInputRef.current?.focus();
    }, 220);
  };

  const handleCompareSwipe = (direction: "left" | "right") => {
    if (compareArticles.length <= 2) {
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPARE_SOURCES_TUTORIAL_KEY, "true");
    }
    setShowCompareTutorial(false);
    setActiveCompareIndex((current) => {
      if (direction === "left") {
        return Math.min(compareArticles.length - 1, current + 1);
      }

      return Math.max(0, current - 1);
    });
  };

  const handleCompareTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    compareTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleCompareTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = compareTouchStartRef.current;

    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    const diffX = touch.clientX - start.x;
    const diffY = touch.clientY - start.y;
    compareTouchStartRef.current = null;

    if (Math.abs(diffX) < 48 || Math.abs(diffX) <= Math.abs(diffY)) {
      return;
    }

    handleCompareSwipe(diffX < 0 ? "left" : "right");
  };

  const dismissCompareTutorial = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPARE_SOURCES_TUTORIAL_KEY, "true");
    }
    setShowCompareTutorial(false);
  };

  if (isLoading) {
    return (
      <section className="page-shell">
        <LoadingScreen label="Loading article" message="Fetching story details, likes, and comments." />
      </section>
    );
  }

  if (!article) {
    return (
      <section className="page-shell">
        <div className="empty-state">
          <strong>Article not found</strong>
          <span>This story is unavailable or could not be loaded.</span>
        </div>
      </section>
    );
  }

  const compareArticle = shouldEnableCompareSources
    ? activeCompareArticle ?? article
    : article;
  const selectedArticleImage = compareArticle ? getBestArticleImage(compareArticle) : null;
  const articleImageSrc = selectedArticleImage?.src ?? null;
  const articleBoxLogoSrc = getSourceBoxLogoUrl(compareArticle.source);
  console.log("IMAGE URL USED", articleImageSrc);
  const articleImageFailureKey = articleImageSrc
    ? `${compareArticle?.id ?? article.id}:${articleImageSrc}`
    : `${compareArticle?.id ?? article.id}:none`;
  const articleBoxLogoFailureKey = articleBoxLogoSrc
    ? `${compareArticle?.source}:${articleBoxLogoSrc}`
    : `${compareArticle?.source}:none`;
  const shouldShowArticleImage =
    Boolean(articleImageSrc) &&
    !failedArticleImages[articleImageFailureKey] &&
    !looksLikeLowQualityImageUrl(articleImageSrc as string) &&
    ["urlToImage", "imageUrl", "image", "cardImage", "mediaContent", "enclosureUrl", "ogImage", "twitterImage", "thumbnail"].includes(
      selectedArticleImage?.source ?? ""
    );
  const shouldShowSourceLogoFallback =
    Boolean(articleBoxLogoSrc) && !failedArticleBoxImages[articleBoxLogoFailureKey];
  const rawContent = compareArticle.content?.trim() ?? "";
  const rawDescription = compareArticle.description?.trim() ?? "";
  const cleanedContent = rawContent
    .replace(/\s*\[\+\d+\s+chars\]\s*$/i, "")
    .replace(/(\.\.\.|…)\s*$/g, "")
    .trim();
  const rawSnippet = cleanDisplayText(rawDescription || cleanedContent)
    .replace(/\s+/g, " ")
    .trim();
  const articleSnippet =
    rawSnippet.length > 360 ? `${rawSnippet.slice(0, 357).trimEnd()}...` : rawSnippet;
  const renderCommentsContent = () => (
    <>
      <div className="article-comments-thread article-comments-inline-thread">
        {displayedComments.length === 0 ? (
          <div className="empty-state">
            <strong>No comments yet</strong>
            <span>Start the conversation on this story.</span>
          </div>
        ) : (
          <div className="comment-list article-comment-list">
            {displayedComments.map((comment) => (
              <div
                key={comment.id}
                id={`comment-${comment.id}`}
                className="comment-thread-row"
                onContextMenu={(event) => {
                  event.preventDefault();
                  openCommentActionSheet(comment);
                }}
                onMouseDown={() => startCommentLongPress(comment)}
                onMouseUp={clearCommentLongPress}
                onMouseLeave={clearCommentLongPress}
                onTouchStart={() => startCommentLongPress(comment)}
                onTouchEnd={clearCommentLongPress}
              >
                <div className="comment-thread-main">
                  <div className="comment-thread-copy">
                    <div className="comment-header">
                      <div className="comment-user-heading">
                        {comment.user_id ? (
                          <Link href={`/user/${comment.user_id}`} className="comment-user-link">
                            <span className="comment-user-avatar">
                              {comment.avatar_url ? (
                                <Image
                                  src={comment.avatar_url}
                                  alt={comment.username ?? "User avatar"}
                                  width={34}
                                  height={34}
                                  unoptimized
                                />
                              ) : (
                                (comment.username ?? "U").charAt(0).toUpperCase()
                              )}
                            </span>
                            <span className="comment-username">{comment.username ?? "Unknown"}</span>
                          </Link>
                        ) : (
                          <strong className="comment-username">{comment.username ?? "Unknown"}</strong>
                        )}
                        <span className="comment-header-time">
                          · {formatRelativeTime(comment.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="comment-body">{comment.text}</div>
                    <button
                      className="comment-action article-comment-reply-action"
                      type="button"
                      onClick={() =>
                        setReplyTarget({
                          commentId: comment.id,
                          username: comment.username,
                        })
                      }
                    >
                      Reply
                    </button>
                    {comment.replies.length > 0 ? (
                      <div className="comment-replies">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="comment-reply-card">
                            <div className="comment-header">
                              <div className="comment-user-heading">
                                {reply.user_id ? (
                                  <Link href={`/user/${reply.user_id}`} className="comment-user-link">
                                    <span className="comment-user-avatar">
                                      {reply.avatar_url ? (
                                        <Image
                                          src={reply.avatar_url}
                                          alt={reply.username ?? "User avatar"}
                                          width={34}
                                          height={34}
                                          unoptimized
                                        />
                                      ) : (
                                        (reply.username ?? "U").charAt(0).toUpperCase()
                                      )}
                                    </span>
                                    <span className="comment-username">
                                      {reply.username ?? "Unknown"}
                                    </span>
                                  </Link>
                                ) : (
                                  <strong className="comment-username">{reply.username ?? "Unknown"}</strong>
                                )}
                                <span className="comment-header-time">
                                  · {formatRelativeTime(reply.created_at)}
                                </span>
                              </div>
                            </div>
                            <div className="comment-body">{reply.text}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="comment-thread-reactions">
                    <button
                      className={`comment-reaction-pill ${
                        comment.currentUserReaction === "like" ? "comment-reaction-pill-active" : ""
                      }`}
                      onClick={() => handleCommentReaction(comment.id)}
                      disabled={activeCommentAction === `reaction-${comment.id}`}
                      aria-label={comment.currentUserReaction === "like" ? "Remove heart" : "Heart comment"}
                    >
                      <span className="comment-reaction-glyph" aria-hidden="true">
                        <svg {...actionIconProps}>
                          <path
                            d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                            fill={comment.currentUserReaction === "like" ? "currentColor" : "none"}
                          />
                        </svg>
                      </span>
                      <span>{comment.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="comment-sheet-composer article-comments-inline-composer">
        {replyTarget ? (
          <div className="comment-reply-banner">
            <span>
              Replying to <strong>{replyTarget.username ?? "this comment"}</strong>
            </span>
            <button className="comment-action" onClick={() => setReplyTarget(null)} type="button">
              Cancel
            </button>
          </div>
        ) : null}

        <div className="input-row bottom-sheet-input-row">
          <input
            ref={commentInputRef}
            className="input"
            type="text"
            placeholder={replyTarget ? "Write a reply..." : "Write a comment..."}
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
          />
          <button
            className="button button-secondary article-comment-send-button"
            onClick={handleAddComment}
            aria-label={replyTarget ? "Send reply" : "Send comment"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </>
  );

  if (commentsOnly) {
    return (
      <section className="section-card article-comments-inline article-comments-inline-embedded" aria-label="Comments">
        <div className="article-comments-inline-header">
          <h3 className="article-comments-inline-title">Comments</h3>
        </div>
        {renderCommentsContent()}
      </section>
    );
  }

  const openOriginalSource = async (url?: string | null) => {
    const sourceUrl = url?.trim();

    if (!sourceUrl || typeof window === "undefined") {
      return;
    }

    const capacitorBrowser = (
      window as Window & {
        Capacitor?: {
          Plugins?: {
            Browser?: {
              open?: (options: { url: string }) => Promise<void> | void;
            };
          };
        };
      }
    ).Capacitor?.Plugins?.Browser;

    if (isNativeCapacitorRuntime() && typeof capacitorBrowser?.open === "function") {
      try {
        await capacitorBrowser.open({ url: sourceUrl });
        return;
      } catch (error) {
        console.error("CAPACITOR BROWSER OPEN FAILED", error);
      }
    }

    window.open(sourceUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="page-shell article-page-shell">
      {shouldEnableCompareSources && showCompareTutorial ? (
        <div
          className="compare-sources-tutorial-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Dismiss compare sources tutorial"
          onClick={dismissCompareTutorial}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dismissCompareTutorial();
            }
          }}
        >
          <div className="compare-sources-tutorial-card">
            <div className="compare-sources-tutorial-label">
              Swipe to compare sources
            </div>
            <div className="compare-sources-tutorial-motion" aria-hidden="true">
              <span className="compare-sources-tutorial-arrow">←</span>
              <span className="compare-sources-tutorial-hand">☞</span>
              <span className="compare-sources-tutorial-arrow">→</span>
            </div>
          </div>
        </div>
      ) : null}

      {shouldEnableCompareSources && compareArticles.length > 2 ? (
        <div className="compare-sources-top-row" aria-hidden="true">
          <div className="compare-sources-dots">
            {compareArticles.map((compareItem, index) => (
              <span
                key={compareItem.id}
                className={`compare-sources-dot ${
                  index === activeCompareIndex ? "compare-sources-dot-active" : ""
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
      {shouldEnableCompareSources && compareStatusMessage ? (
        <div className="article-compare-status" role="status" aria-live="polite">
          {compareStatusMessage}
        </div>
      ) : null}

      <section
        className={`section-card article-detail-hero ${
          shouldEnableCompareSources ? "compare-sources-shell" : ""
        }`}
        onTouchStart={shouldEnableCompareSources ? handleCompareTouchStart : undefined}
        onTouchEnd={shouldEnableCompareSources ? handleCompareTouchEnd : undefined}
      >
        <div className="article-detail-hero-layout">
          <div className="stack article-detail-hero-copy" style={{ gap: "10px" }}>
            <div className="article-detail-kicker-row">
              <Link
                href={`/source/${slugifySourceName(compareArticle.source)}`}
                className="source-trigger source-trigger-tight article-detail-source-wrap"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <SourceHeaderMark sourceName={compareArticle.source} fallbackMode="text" />
              </Link>
              <span className="chip chip-accent">{compareArticle.category}</span>
            </div>
            <h2 className="article-detail-title">
              {cleanDisplayText(compareArticle.title)}
            </h2>
            <p className="article-detail-byline">
              Published: {formatPublishedTimestamp(article.publishedAt, article.time)}
            </p>
            {shouldShowArticleImage ? (
              <div className="article-detail-inline-image-wrap">
                <img
                  src={articleImageSrc as string}
                  alt={cleanDisplayText(compareArticle.title)}
                  className="article-thumb-image article-detail-inline-image"
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setFailedArticleImages((prev) => {
                      if (prev[articleImageFailureKey]) {
                        return prev;
                      }

                      return {
                        ...prev,
                        [articleImageFailureKey]: true,
                      };
                    });
                  }}
                />
              </div>
            ) : shouldShowSourceLogoFallback && articleBoxLogoSrc ? (
              <div className="article-detail-inline-image-wrap article-detail-inline-image-wrap-fallback">
                <img
                  src={articleBoxLogoSrc}
                  alt={`${compareArticle.source} image`}
                  className="article-thumb-image article-detail-inline-image article-card-box-logo-image"
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setFailedArticleBoxImages((prev) => {
                      if (prev[articleBoxLogoFailureKey]) {
                        return prev;
                      }

                      return {
                        ...prev,
                        [articleBoxLogoFailureKey]: true,
                      };
                    });
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="engagement-row article-detail-actions trending-stats-row article-detail-stats-row">
          <button
            className={`icon-action-pill ${likedByCurrentUser ? "icon-action-pill-active" : ""}`}
            onClick={handleToggleLike}
            aria-label={likedByCurrentUser ? "Unlike article" : "Like article"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z"
                  fill={likedByCurrentUser ? "currentColor" : "none"}
                />
              </svg>
            </span>
            <span>{likesCount}</span>
          </button>
          <button
            className="icon-action-pill"
            aria-label="Comments"
            onClick={() => {
              scrollToComments();
              setIsCommentSortSheetOpen(false);
              setReplyTarget(null);
            }}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
              </svg>
            </span>
            <span>{comments.length}</span>
          </button>
          {compareArticle.url ? (
            <button
              className="icon-action-pill"
              onClick={() => {
                void openOriginalSource(compareArticle.url);
              }}
              aria-label="Read original article"
            >
              <span className="icon-action-glyph" aria-hidden="true">↗</span>
              <span>Read</span>
            </button>
          ) : null}
          <ShareButton
            path={`/article/${article.id}`}
            title={cleanDisplayText(article.title)}
            url={article.url}
            iconOnly
          />
          <button
            className={`bookmark-button ${isSaved ? "bookmark-button-active" : ""}`}
            onClick={handleToggleSave}
            aria-label={isSaved ? "Remove bookmark" : "Save article"}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg {...actionIconProps}>
                <path
                  d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                  fill={isSaved ? "currentColor" : "none"}
                />
              </svg>
            </span>
          </button>
        </div>

        <div className="article-detail-body">
          <div className="article-detail-section article-summary-section">
            <p className="article-detail-label">About this article</p>
            {articleSnippet ? (
              <div className="article-summary-paragraphs">
                <p className="article-summary-paragraph">{articleSnippet}</p>
              </div>
            ) : (
              <p className="article-summary-paragraph">
                Preview text is not available for this story.
              </p>
            )}
            {compareArticle.url ? (
              <button
                type="button"
                className="button button-secondary article-original-button"
                onClick={() => {
                  void openOriginalSource(compareArticle.url);
                }}
              >
                Read Original Article
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section
        ref={commentsSectionRef}
        id="comments"
        className="section-card article-comments-inline"
        aria-label="Comments"
      >
        <div className="article-comments-inline-header">
          <h3 className="article-comments-inline-title">Comments</h3>
        </div>
        {renderCommentsContent()}
      </section>

      {isCommentSortSheetOpen ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Choose comment sort"
          onClick={() => setIsCommentSortSheetOpen(false)}
        >
          <div
            className="bottom-sheet article-comment-sort-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="stack" style={{ gap: "6px" }}>
              <h3 className="modal-title">Sort comments</h3>
              <p className="muted bottom-sheet-title">
                Choose how comments should be ordered.
              </p>
            </div>
            <div className="source-sheet-actions">
              {[
                { value: "top" as const, label: "Top comments" },
                { value: "newest" as const, label: "Newest" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`button source-sheet-button article-comment-sort-option ${
                    commentSortMode === option.value
                      ? "article-comment-sort-option-active"
                      : "button-secondary"
                  }`}
                  onClick={() => {
                    setCommentSortMode(option.value);
                    setIsCommentSortSheetOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {commentSortMode === option.value ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
              <button
                className="button button-secondary source-sheet-close"
                onClick={() => setIsCommentSortSheetOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {commentActionTarget ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comment actions"
          onClick={() => setCommentActionTarget(null)}
        >
          <div className="bottom-sheet action-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="source-sheet-actions">
              <button
                className="button button-secondary source-sheet-button"
                onClick={() => {
                  setReportingCommentId(commentActionTarget.id);
                  setCommentActionTarget(null);
                }}
              >
                Report
              </button>
              {commentActionTarget.user_id === userId ? (
                <button
                  className="button comment-action-danger source-sheet-button"
                  onClick={() => {
                    setDeleteCommentId(commentActionTarget.id);
                    setCommentActionTarget(null);
                  }}
                >
                  Delete
                </button>
              ) : null}
              <button
                className="button button-secondary source-sheet-close"
                onClick={() => setCommentActionTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportingCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="article-report-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="article-report-title" className="modal-title">
                Report comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Tell us why this comment should be reviewed.
              </p>
            </div>

            <textarea
              className="textarea"
              placeholder="Add a reason for this report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              disabled={activeCommentAction === `report-${reportingCommentId}`}
            />

            {reportStatus ? (
              <div
                className={`status-message ${
                  reportStatus.type === "success" ? "status-success" : "status-error"
                }`}
              >
                {reportStatus.text}
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setReportingCommentId(null);
                  setReportStatus(null);
                  setReportReason("");
                }}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                Cancel
              </button>
              <button
                className="button button-accent"
                onClick={handleSubmitReport}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                {activeCommentAction === `report-${reportingCommentId}`
                  ? "Submitting..."
                  : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="article-delete-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="article-delete-title" className="modal-title">
                Delete comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Are you sure you want to delete this comment?
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => setDeleteCommentId(null)}
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger"
                onClick={handleDeleteComment}
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                {activeCommentAction === `delete-${deleteCommentId}` ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
