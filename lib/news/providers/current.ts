import "server-only";

import {
  buildNewsArticle,
  dedupeArticles,
  extractImageFromDescription,
  extractXmlAttr,
  extractXmlTag,
  getCategoryQuery,
  sortArticlesByRecent,
  stripHtml,
} from "../shared";
import type { NewsArticle } from "../types";

type RssFeedConfig = {
  url: string;
  source: string;
  category: string;
  tags: string[];
};

const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss";
const FETCH_TIMEOUT_MS = 8000;

const RSS_FEEDS: RssFeedConfig[] = [
  { url: "https://feeds.reuters.com/reuters/topNews", source: "Reuters", category: "Breaking News", tags: ["trending", "breaking", "world", "politics"] },
  { url: "https://feeds.apnews.com/apnews/topnews", source: "AP News", category: "Breaking News", tags: ["trending", "breaking", "world", "politics"] },
  { url: "https://rss.cnn.com/rss/cnn_topstories.rss", source: "CNN", category: "Breaking News", tags: ["trending", "breaking", "world", "politics"] },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC News", category: "World", tags: ["world", "trending"] },
  { url: "https://feeds.npr.org/1001/rss.xml", source: "NPR", category: "Breaking News", tags: ["trending", "politics", "world"] },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", category: "Business", tags: ["business"] },
  { url: "https://www.theverge.com/rss/index.xml", source: "The Verge", category: "Technology", tags: ["technology", "tech"] },
  { url: "https://www.wired.com/feed/rss", source: "Wired", category: "Technology", tags: ["technology", "tech", "science"] },
  { url: "https://variety.com/feed/", source: "Variety", category: "Entertainment", tags: ["entertainment", "arts"] },
  { url: "https://www.billboard.com/feed/", source: "Billboard", category: "Entertainment", tags: ["entertainment", "arts"] },
  { url: "https://www.eater.com/rss/index.xml", source: "Eater", category: "Food", tags: ["food"] },
  { url: "https://www.travelandleisure.com/rss", source: "Travel + Leisure", category: "Travel", tags: ["travel"] },
];

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRssItems(xml: string, feed: RssFeedConfig) {
  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];

  return itemMatches
    .map((match, index) => {
      const block = match[0];
      const description = extractXmlTag(block, "description");
      const mediaContentUrl = extractXmlAttr(block, "media:content", "url");
      const enclosureUrl = extractXmlAttr(block, "enclosure", "url");
      const mediaThumbnailUrl = extractXmlAttr(block, "media:thumbnail", "url");
      const descriptionImageUrl = extractImageFromDescription(description) || null;
      const imageUrl =
        mediaContentUrl || enclosureUrl || mediaThumbnailUrl || descriptionImageUrl || null;

      return buildNewsArticle(
        {
          title: stripHtml(extractXmlTag(block, "title")),
          description: stripHtml(description),
          url: extractXmlTag(block, "link"),
          source: feed.source,
          publishedAt: extractXmlTag(block, "pubDate"),
          imageUrl,
          category: stripHtml(extractXmlTag(block, "category")) || feed.category,
        },
        {
          category: feed.category,
          provider: "current",
          uniqueSeed: `current-rss-${feed.source}-${index}`,
        }
      );
    })
    .filter((article): article is NewsArticle => Boolean(article));
}

async function fetchRssArticles(feeds: RssFeedConfig[]) {
  const responses = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetchWithTimeout(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "User-Agent": "GraffitiNews/1.0 (+https://graffiti.news)",
        },
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        throw new Error(`Current RSS request failed for ${feed.source} (${response.status})`);
      }

      return parseRssItems(await response.text(), feed);
    })
  );

  return responses.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function buildGoogleNewsSearchUrl(category: string) {
  const url = new URL(`${GOOGLE_NEWS_RSS_BASE}/search`);
  url.searchParams.set("q", getCategoryQuery(category));
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  return url.toString();
}

function selectFeedsForCategory(category: string) {
  const normalized = category.trim().toLowerCase();

  if (!normalized || normalized === "trending" || normalized === "latest") {
    return RSS_FEEDS.slice(0, 6);
  }

  return RSS_FEEDS.filter(
    (feed) =>
      feed.category.toLowerCase() === normalized ||
      feed.tags.some((tag) => tag.toLowerCase() === normalized)
  );
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  const feeds = selectFeedsForCategory(category);
  const googleFeed: RssFeedConfig = {
    url: buildGoogleNewsSearchUrl(category),
    source: "Google News RSS",
    category: category || "News",
    tags: [category || "news"],
  };

  const articles = await fetchRssArticles([...feeds, googleFeed]);
  return sortArticlesByRecent(dedupeArticles(articles));
}
