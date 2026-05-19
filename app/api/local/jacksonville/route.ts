import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const JACKSONVILLE_QUERIES = [
  "Jacksonville local news",
  "Jacksonville breaking news",
  "News4JAX",
  "First Coast News Jacksonville",
  "Action News Jax",
  "Jacksonville Daily Record",
  "Jacksonville Today",
  "Florida Times-Union",
  "WJCT Jacksonville",
];

const JACKSONVILLE_MATCH_TERMS = [
  "jacksonville",
  "duval county",
  "first coast",
  "florida",
  " fl ",
  "news4jax",
  "first coast news",
  "action news jax",
  "jacksonville daily record",
  "jacksonville today",
  "florida times-union",
  "wjct",
];

const JACKSONVILLE_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.news4jax.com/arc/outboundfeeds/rss/category/news/local/",
    source: "News4JAX",
    category: "Local News",
  },
  {
    url: "https://www.firstcoastnews.com/feeds/syndication/rss/news/local",
    source: "First Coast News Jacksonville",
    category: "Local News",
  },
  {
    url: "https://www.actionnewsjax.com/rss/local-news",
    source: "Action News Jax",
    category: "Local News",
  },
  {
    url: "https://jaxtoday.org/feed/",
    source: "Jacksonville Today",
    category: "Local News",
  },
  {
    url: "https://news.wjct.org/rss.xml",
    source: "WJCT Jacksonville",
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
    console.log("JACKSONVILLE ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: JACKSONVILLE_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: JACKSONVILLE_QUERIES,
            rssFeeds: [
              ...JACKSONVILLE_RSS_FEEDS,
              ...JACKSONVILLE_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("JACKSONVILLE RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return JACKSONVILLE_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("JACKSONVILLE FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("JACKSONVILLE DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
