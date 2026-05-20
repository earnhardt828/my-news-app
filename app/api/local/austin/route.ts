import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const AUSTIN_QUERIES = [
  "Austin local news",
  "Austin breaking news",
  "KXAN Austin",
  "KVUE Austin",
  "FOX 7 Austin",
  "Austin American-Statesman",
  "Austin Monitor",
  "Community Impact Austin",
  "Austin Chronicle",
  "KUT Austin",
];

const AUSTIN_MATCH_TERMS = [
  "austin",
  "travis county",
  "central texas",
  "texas",
  " tx ",
  "kxan",
  "kvue",
  "fox 7",
  "austin american-statesman",
  "austin monitor",
  "community impact",
  "austin chronicle",
  "kut",
];

const AUSTIN_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.kxan.com/feed/",
    source: "KXAN Austin",
    category: "Local News",
  },
  {
    url: "https://www.kvue.com/feeds/syndication/rss/news/local",
    source: "KVUE Austin",
    category: "Local News",
  },
  {
    url: "https://www.fox7austin.com/rss/category/news",
    source: "FOX 7 Austin",
    category: "Local News",
  },
  {
    url: "https://www.austinmonitor.com/feed/",
    source: "Austin Monitor",
    category: "Local News",
  },
  {
    url: "https://www.austinchronicle.com/gyrobase/RssAlt?section=news",
    source: "Austin Chronicle",
    category: "Local News",
  },
  {
    url: "https://www.kut.org/rss.xml",
    source: "KUT Austin",
    category: "Local News",
  },
];

function createGoogleNewsSearchFeed(query: string): RssFeedConfig {
  return {
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    source: query,
    category: "Local News",
  };
}

function normalize(value: string | null | undefined) {
  return ` ${String(value ?? "").trim().toLowerCase()} `;
}

export async function GET() {
  try {
    console.log("AUSTIN ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: AUSTIN_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: AUSTIN_QUERIES,
            rssFeeds: [
              ...AUSTIN_RSS_FEEDS,
              ...AUSTIN_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("AUSTIN RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return AUSTIN_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("AUSTIN FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("AUSTIN DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
