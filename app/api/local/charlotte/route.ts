import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const CHARLOTTE_QUERIES = [
  "Charlotte local news",
  "WSOC Charlotte",
  "WBTV Charlotte",
  "WCNC Charlotte",
  "Queen City News",
  "WFAE Charlotte",
  "Axios Charlotte",
  "Charlotte Observer",
  "WCCB Charlotte",
];

const CHARLOTTE_MATCH_TERMS = [
  "charlotte",
  "mecklenburg",
  "gaston",
  "north carolina",
  " nc ",
  "wsoc",
  "wbtv",
  "wcnc",
  "queen city news",
  "wfae",
  "axios charlotte",
  "charlotte observer",
  "wccb",
];

const CHARLOTTE_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.charlotteobserver.com/latest-news/?outputType=xml",
    source: "Charlotte Observer",
    category: "Local News",
  },
  {
    url: "https://www.wsoctv.com/arc/outboundfeeds/rss/",
    source: "WSOC-TV",
    category: "Local News",
  },
  {
    url: "https://www.wbtv.com/rss/",
    source: "WBTV",
    category: "Local News",
  },
  {
    url: "https://www.wcnc.com/feeds/syndication/rss/news/local",
    source: "WCNC",
    category: "Local News",
  },
  {
    url: "https://www.qcnews.com/feed/",
    source: "Queen City News",
    category: "Local News",
  },
  {
    url: "https://www.wfae.org/rss.xml",
    source: "WFAE",
    category: "Local News",
  },
  {
    url: "https://charlotte.axios.com/feed/",
    source: "Axios Charlotte",
    category: "Local News",
  },
  {
    url: "https://www.wccbcharlotte.com/feed/",
    source: "WCCB Charlotte",
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
    console.log("CHARLOTTE ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: CHARLOTTE_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: CHARLOTTE_QUERIES,
            rssFeeds: [
              ...CHARLOTTE_RSS_FEEDS,
              ...CHARLOTTE_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("CHARLOTTE RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return CHARLOTTE_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("CHARLOTTE FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("CHARLOTTE DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
