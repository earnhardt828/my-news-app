import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const SAN_ANTONIO_QUERIES = [
  "San Antonio local news",
  "San Antonio breaking news",
  "KSAT San Antonio",
  "KENS5 San Antonio",
  "FOX San Antonio",
  "San Antonio Express-News",
  "Texas Public Radio San Antonio",
];

const SAN_ANTONIO_MATCH_TERMS = [
  "san antonio",
  "bexar county",
  "texas",
  " tx ",
  "ksat",
  "kens5",
  "fox san antonio",
  "express-news",
  "texas public radio",
];

const SAN_ANTONIO_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.ksat.com/arc/outboundfeeds/rss/category/news/local/",
    source: "KSAT San Antonio",
    category: "Local News",
  },
  {
    url: "https://www.kens5.com/feeds/syndication/rss/news/local",
    source: "KENS5 San Antonio",
    category: "Local News",
  },
  {
    url: "https://www.tpr.org/rss.xml",
    source: "Texas Public Radio San Antonio",
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
    console.log("SAN ANTONIO ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: SAN_ANTONIO_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: SAN_ANTONIO_QUERIES,
            rssFeeds: [
              ...SAN_ANTONIO_RSS_FEEDS,
              ...SAN_ANTONIO_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("SAN ANTONIO RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return SAN_ANTONIO_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("SAN ANTONIO FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("SAN ANTONIO DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
