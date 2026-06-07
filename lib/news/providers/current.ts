import "server-only";

import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "@/lib/direct-news-routes";

import type { NewsArticle } from "../types";

const CURRENT_RSS_FEEDS: RssFeedConfig[] = [
  { url: "https://feeds.reuters.com/reuters/topNews", source: "Reuters", category: "Breaking News" },
  { url: "https://feeds.apnews.com/apnews/topnews", source: "AP News", category: "Breaking News" },
  { url: "https://rss.cnn.com/rss/cnn_topstories.rss", source: "CNN", category: "Breaking News" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC News", category: "World" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC News", category: "Business" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC News", category: "Technology" },
  { url: "https://feeds.npr.org/1001/rss.xml", source: "NPR", category: "Breaking News" },
  { url: "https://moxie.foxnews.com/google-publisher/latest.xml", source: "Fox News", category: "Breaking News" },
  { url: "https://feeds.nbcnews.com/nbcnews/public/news", source: "NBC News", category: "Breaking News" },
  { url: "https://www.cbsnews.com/latest/rss/main", source: "CBS News", category: "Breaking News" },
  { url: "https://abcnews.go.com/abcnews/topstories", source: "ABC News", category: "Breaking News" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", category: "Business" },
  { url: "https://www.theverge.com/rss/index.xml", source: "The Verge", category: "Technology" },
  { url: "https://techcrunch.com/feed/", source: "TechCrunch", category: "Technology" },
  { url: "https://www.wired.com/feed/rss", source: "Wired", category: "Technology" },
  { url: "https://www.politico.com/rss/politicopicks.xml", source: "Politico", category: "Politics" },
  { url: "https://thehill.com/feed/", source: "The Hill", category: "Politics" },
  { url: "https://www.theguardian.com/us-news/rss", source: "The Guardian", category: "World" },
  { url: "https://variety.com/feed/", source: "Variety", category: "Entertainment" },
  { url: "https://www.billboard.com/feed/", source: "Billboard", category: "Entertainment" },
  { url: "https://www.eater.com/rss/index.xml", source: "Eater", category: "Food" },
  { url: "https://www.travelandleisure.com/rss", source: "Travel + Leisure", category: "Travel" },
];

const DEFAULT_CURRENT_QUERIES = [
  "breaking news",
  "politics news",
  "world news",
  "business news",
  "technology news",
  "science news",
  "entertainment news",
  "food news",
  "travel news",
];

function getCurrentQueries(category: string) {
  const normalized = category.trim().toLowerCase();

  if (!normalized || normalized === "trending" || normalized === "latest" || normalized === "general") {
    return DEFAULT_CURRENT_QUERIES;
  }

  if (normalized === "tech") {
    return ["technology news", "tech news"];
  }

  return [`${normalized} news`];
}

function getCurrentFeeds(category: string) {
  const normalized = category.trim().toLowerCase();

  if (!normalized || normalized === "trending" || normalized === "latest" || normalized === "general") {
    return CURRENT_RSS_FEEDS;
  }

  const matchingFeeds = CURRENT_RSS_FEEDS.filter(
    (feed) => feed.category.trim().toLowerCase() === normalized
  );

  return matchingFeeds.length > 0 ? matchingFeeds : CURRENT_RSS_FEEDS;
}

function mapDirectArticleToCurrentArticle(article: DirectFeedArticle, index: number): NewsArticle | null {
  const title = article.title?.trim();
  const url = article.url?.trim();
  const imageUrl =
    article.imageUrl?.trim() ||
    article.urlToImage?.trim() ||
    article.image?.trim() ||
    article.ogImage?.trim() ||
    article.mediaContent?.trim() ||
    article.enclosureUrl?.trim() ||
    article.twitterImage?.trim() ||
    article.thumbnail?.trim() ||
    "";

  if (!title || !url || !imageUrl) {
    return null;
  }

  return {
    id: article.id || Math.abs(index + 1),
    title,
    description: article.description?.trim() || null,
    url,
    source: article.source?.trim() || "Current",
    publishedAt: article.publishedAt ?? null,
    imageUrl,
    category: article.category?.trim() || "News",
    provider: "current",
  };
}

function buildFallbackCurrentArticle(category: string): NewsArticle {
  return {
    id: 7000001,
    title: "Current provider fallback article",
    description: "Temporary CURRENT fallback so the aggregator can render a visible article while live provider fetch is being restored.",
    url: "https://www.reuters.com/world/us/",
    source: "Current Fallback",
    publishedAt: new Date().toISOString(),
    imageUrl:
      "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80",
    category: category.trim() || "general",
    provider: "current",
  };
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  const effectiveCategory = category.trim() || "general";
  console.log("CURRENT_PROVIDER_FETCH_STARTED", { category: effectiveCategory });

  try {
    const rawArticles = await fetchDirectArticlePool({
      queries: getCurrentQueries(effectiveCategory),
      rssFeeds: getCurrentFeeds(effectiveCategory),
      pageSize: 20,
    });

    console.log("CURRENT_PROVIDER_RAW_COUNT", rawArticles.length);

    const mappedArticles = rawArticles
      .map((article, index) => mapDirectArticleToCurrentArticle(article, index))
      .filter((article): article is NewsArticle => Boolean(article));

    console.log("CURRENT_PROVIDER_IMAGE_COUNT", mappedArticles.length);

    if (mappedArticles.length === 0) {
      console.error("CURRENT_PROVIDER_ERROR", {
        category: effectiveCategory,
        message: "Current provider returned zero articles; using fallback article",
      });
      return [buildFallbackCurrentArticle(effectiveCategory)];
    }

    return mappedArticles;
  } catch (error) {
    console.error("CURRENT_PROVIDER_ERROR", {
      category: effectiveCategory,
      error: error instanceof Error ? error.message : String(error),
    });
    return [buildFallbackCurrentArticle(effectiveCategory)];
  }
}
