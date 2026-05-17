import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const HOUSTON_QUERIES = [
  "Houston local news",
  "Houston breaking news",
  "Houston Chronicle",
  "KHOU Houston",
  "ABC13 Houston",
  "FOX 26 Houston",
  "KPRC 2 Houston",
  "Houston Public Media",
  "Click2Houston",
];

const HOUSTON_MATCH_TERMS = [
  "houston",
  "harris county",
  "texas",
  " tx ",
  "houston chronicle",
  "khou",
  "abc13",
  "fox 26",
  "kprc",
  "click2houston",
  "houston public media",
];

const HOUSTON_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.khou.com/feeds/syndication/rss/news/local",
    source: "KHOU",
    category: "Local News",
  },
  {
    url: "https://abc13.com/feed/",
    source: "ABC13 Houston",
    category: "Local News",
  },
  {
    url: "https://www.fox26houston.com/rss/category/news",
    source: "FOX 26 Houston",
    category: "Local News",
  },
  {
    url: "https://www.click2houston.com/arc/outboundfeeds/rss/category/news/local/",
    source: "KPRC 2 Houston",
    category: "Local News",
  },
  {
    url: "https://www.houstonpublicmedia.org/articles/news/feed/",
    source: "Houston Public Media",
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
    console.log("HOUSTON ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: HOUSTON_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: HOUSTON_QUERIES,
            rssFeeds: [
              ...HOUSTON_RSS_FEEDS,
              ...HOUSTON_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("HOUSTON RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return HOUSTON_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("HOUSTON FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("HOUSTON DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
