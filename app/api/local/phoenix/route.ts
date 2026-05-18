import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const PHOENIX_QUERIES = [
  "Phoenix local news",
  "Phoenix breaking news",
  "Arizona Republic",
  "AZFamily Phoenix",
  "ABC15 Arizona",
  "FOX 10 Phoenix",
  "12News Phoenix",
  "KTAR News",
  "Phoenix New Times",
];

const PHOENIX_MATCH_TERMS = [
  "phoenix",
  "maricopa county",
  "arizona",
  " az ",
  "arizona republic",
  "azfamily",
  "abc15",
  "fox 10",
  "12news",
  "ktar",
  "phoenix new times",
];

const PHOENIX_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.azfamily.com/feeds/syndication/rss/news/local",
    source: "AZFamily Phoenix",
    category: "Local News",
  },
  {
    url: "https://www.abc15.com/news/region-phoenix-metro/rss.xml",
    source: "ABC15 Arizona",
    category: "Local News",
  },
  {
    url: "https://www.fox10phoenix.com/rss/category/news",
    source: "FOX 10 Phoenix",
    category: "Local News",
  },
  {
    url: "https://ktar.com/category/local-news/feed/",
    source: "KTAR News",
    category: "Local News",
  },
  {
    url: "https://www.phoenixnewtimes.com/rss.xml",
    source: "Phoenix New Times",
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
    console.log("PHOENIX ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: PHOENIX_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: PHOENIX_QUERIES,
            rssFeeds: [
              ...PHOENIX_RSS_FEEDS,
              ...PHOENIX_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("PHOENIX RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return PHOENIX_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("PHOENIX FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("PHOENIX DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
