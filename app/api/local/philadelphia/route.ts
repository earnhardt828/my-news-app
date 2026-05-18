import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const PHILADELPHIA_QUERIES = [
  "Philadelphia local news",
  "Philadelphia breaking news",
  "Philadelphia Inquirer",
  "6ABC Philadelphia",
  "NBC10 Philadelphia",
  "CBS Philadelphia",
  "FOX 29 Philadelphia",
  "WHYY Philadelphia",
  "Billy Penn",
  "Philadelphia Tribune",
];

const PHILADELPHIA_MATCH_TERMS = [
  "philadelphia",
  "philly",
  "pennsylvania",
  " pa ",
  "philadelphia inquirer",
  "6abc",
  "nbc10",
  "cbs philadelphia",
  "fox 29",
  "whyy",
  "billy penn",
  "philadelphia tribune",
];

const PHILADELPHIA_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://6abc.com/feed/",
    source: "6ABC Philadelphia",
    category: "Local News",
  },
  {
    url: "https://www.nbcphiladelphia.com/news/local/?rss=y",
    source: "NBC10 Philadelphia",
    category: "Local News",
  },
  {
    url: "https://www.cbsnews.com/philadelphia/latest/rss/main",
    source: "CBS Philadelphia",
    category: "Local News",
  },
  {
    url: "https://www.fox29.com/rss/category/news",
    source: "FOX 29 Philadelphia",
    category: "Local News",
  },
  {
    url: "https://whyy.org/feed/",
    source: "WHYY Philadelphia",
    category: "Local News",
  },
  {
    url: "https://billypenn.com/feed/",
    source: "Billy Penn",
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
    console.log("PHILADELPHIA ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: PHILADELPHIA_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: PHILADELPHIA_QUERIES,
            rssFeeds: [
              ...PHILADELPHIA_RSS_FEEDS,
              ...PHILADELPHIA_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("PHILADELPHIA RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return PHILADELPHIA_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("PHILADELPHIA FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("PHILADELPHIA DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
