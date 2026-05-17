import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const LOS_ANGELES_QUERIES = [
  "Los Angeles local news",
  "LA local news",
  "KTLA Los Angeles",
  "ABC7 Los Angeles",
  "NBC Los Angeles",
  "CBS Los Angeles",
  "FOX 11 Los Angeles",
  "LAist",
  "Los Angeles Times",
  "Spectrum News 1 SoCal",
];

const LOS_ANGELES_MATCH_TERMS = [
  "los angeles",
  " la ",
  " l.a. ",
  "southern california",
  "socal",
  "ktla",
  "abc7 los angeles",
  "nbc los angeles",
  "cbs los angeles",
  "fox 11",
  "laist",
  "los angeles times",
  "spectrum news 1",
];

const LOS_ANGELES_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://ktla.com/feed/",
    source: "KTLA",
    category: "Local News",
  },
  {
    url: "https://abc7.com/feed/",
    source: "ABC7 Los Angeles",
    category: "Local News",
  },
  {
    url: "https://www.nbclosangeles.com/news/?rss=y",
    source: "NBC Los Angeles",
    category: "Local News",
  },
  {
    url: "https://www.cbsnews.com/losangeles/latest/rss/main",
    source: "CBS Los Angeles",
    category: "Local News",
  },
  {
    url: "https://laist.com/feeds/news",
    source: "LAist",
    category: "Local News",
  },
  {
    url: "https://www.foxla.com/rss/category/news",
    source: "FOX 11 Los Angeles",
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
    console.log("LOS ANGELES ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: LOS_ANGELES_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: LOS_ANGELES_QUERIES,
            rssFeeds: [
              ...LOS_ANGELES_RSS_FEEDS,
              ...LOS_ANGELES_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("LOS ANGELES RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return LOS_ANGELES_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("LOS ANGELES FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("LOS ANGELES DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
