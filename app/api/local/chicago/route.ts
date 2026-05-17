import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const CHICAGO_QUERIES = [
  "Chicago local news",
  "Chicago breaking news",
  "WGN Chicago",
  "ABC7 Chicago",
  "NBC Chicago",
  "CBS Chicago",
  "FOX 32 Chicago",
  "Block Club Chicago",
  "WBEZ Chicago",
  "Chicago Tribune",
  "Chicago Sun-Times",
];

const CHICAGO_MATCH_TERMS = [
  "chicago",
  "cook county",
  "illinois",
  " il ",
  "wgn",
  "abc7 chicago",
  "nbc chicago",
  "cbs chicago",
  "fox 32",
  "block club chicago",
  "wbez",
  "chicago tribune",
  "chicago sun-times",
];

const CHICAGO_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://wgntv.com/feed/",
    source: "WGN Chicago",
    category: "Local News",
  },
  {
    url: "https://abc7chicago.com/feed/",
    source: "ABC7 Chicago",
    category: "Local News",
  },
  {
    url: "https://www.nbcchicago.com/news/local/?rss=y",
    source: "NBC Chicago",
    category: "Local News",
  },
  {
    url: "https://www.cbsnews.com/chicago/latest/rss/main",
    source: "CBS Chicago",
    category: "Local News",
  },
  {
    url: "https://blockclubchicago.org/feed/",
    source: "Block Club Chicago",
    category: "Local News",
  },
  {
    url: "https://www.wbez.org/rss.xml",
    source: "WBEZ Chicago",
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
    console.log("CHICAGO ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: CHICAGO_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: CHICAGO_QUERIES,
            rssFeeds: [
              ...CHICAGO_RSS_FEEDS,
              ...CHICAGO_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("CHICAGO RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return CHICAGO_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("CHICAGO FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("CHICAGO DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
