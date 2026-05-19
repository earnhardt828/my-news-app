import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const DALLAS_QUERIES = [
  "Dallas local news",
  "Dallas breaking news",
  "Dallas Morning News",
  "WFAA Dallas",
  "NBC 5 Dallas-Fort Worth",
  "CBS News Texas",
  "FOX 4 Dallas",
  "KERA Dallas",
  "D Magazine Dallas",
];

const DALLAS_MATCH_TERMS = [
  "dallas",
  "dallas county",
  "fort worth",
  "dfw",
  "texas",
  " tx ",
  "dallas morning news",
  "wfaa",
  "nbc 5",
  "cbs news texas",
  "fox 4",
  "kera",
  "d magazine",
];

const DALLAS_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.wfaa.com/feeds/syndication/rss/news/local",
    source: "WFAA Dallas",
    category: "Local News",
  },
  {
    url: "https://www.nbcdfw.com/news/local/?rss=y",
    source: "NBC 5 Dallas-Fort Worth",
    category: "Local News",
  },
  {
    url: "https://www.cbsnews.com/texas/latest/rss/main",
    source: "CBS News Texas",
    category: "Local News",
  },
  {
    url: "https://www.fox4news.com/rss/category/news",
    source: "FOX 4 Dallas",
    category: "Local News",
  },
  {
    url: "https://www.keranews.org/rss.xml",
    source: "KERA Dallas",
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
    console.log("DALLAS ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: DALLAS_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: DALLAS_QUERIES,
            rssFeeds: [
              ...DALLAS_RSS_FEEDS,
              ...DALLAS_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("DALLAS RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return DALLAS_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("DALLAS FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("DALLAS DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
