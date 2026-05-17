import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const NEW_YORK_QUERIES = [
  "New York local news",
  "NYC local news",
  "NY1",
  "Gothamist",
  "NBC New York",
  "CBS New York",
  "ABC7NY",
  "PIX11",
  "The City NYC",
  "AMNY",
  "New York Daily News",
];

const NEW_YORK_MATCH_TERMS = [
  "new york",
  "nyc",
  "manhattan",
  "brooklyn",
  "queens",
  "bronx",
  "staten island",
  "ny1",
  "gothamist",
  "nbc new york",
  "cbs new york",
  "abc7ny",
  "pix11",
  "the city",
  "amny",
  "new york daily news",
];

const NEW_YORK_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://gothamist.com/feed",
    source: "Gothamist",
    category: "Local News",
  },
  {
    url: "https://www.nydailynews.com/arc/outboundfeeds/rss/",
    source: "New York Daily News",
    category: "Local News",
  },
  {
    url: "https://abc7ny.com/feed/",
    source: "ABC7NY",
    category: "Local News",
  },
  {
    url: "https://pix11.com/feed/",
    source: "PIX11",
    category: "Local News",
  },
  {
    url: "https://www.thecity.nyc/feed/",
    source: "The City NYC",
    category: "Local News",
  },
  {
    url: "https://www.amny.com/feed/",
    source: "AMNY",
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
    console.log("NEW YORK ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: NEW_YORK_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: NEW_YORK_QUERIES,
            rssFeeds: [
              ...NEW_YORK_RSS_FEEDS,
              ...NEW_YORK_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("NEW YORK RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return NEW_YORK_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("NEW YORK FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("NEW YORK DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
