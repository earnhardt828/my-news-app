import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../../lib/direct-news-routes";

const SAN_DIEGO_QUERIES = [
  "San Diego local news",
  "San Diego breaking news",
  "NBC 7 San Diego",
  "ABC 10News San Diego",
  "CBS 8 San Diego",
  "FOX 5 San Diego",
  "KPBS San Diego",
  "San Diego Union-Tribune",
  "Times of San Diego",
];

const SAN_DIEGO_MATCH_TERMS = [
  "san diego",
  "san diego county",
  "california",
  " ca ",
  "nbc 7",
  "abc 10news",
  "cbs 8",
  "fox 5 san diego",
  "kpbs",
  "san diego union-tribune",
  "times of san diego",
];

const SAN_DIEGO_RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://www.nbcsandiego.com/news/local/?rss=y",
    source: "NBC 7 San Diego",
    category: "Local News",
  },
  {
    url: "https://fox5sandiego.com/feed/",
    source: "FOX 5 San Diego",
    category: "Local News",
  },
  {
    url: "https://www.kpbs.org/feeds/rss/news",
    source: "KPBS San Diego",
    category: "Local News",
  },
  {
    url: "https://timesofsandiego.com/feed/",
    source: "Times of San Diego",
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
    console.log("SAN DIEGO ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: SAN_DIEGO_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: SAN_DIEGO_QUERIES,
            rssFeeds: [
              ...SAN_DIEGO_RSS_FEEDS,
              ...SAN_DIEGO_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            ],
            pageSize: 20,
          });

    console.log("SAN DIEGO RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return SAN_DIEGO_MATCH_TERMS.some(
        (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
      );
    });

    console.log("SAN DIEGO FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("SAN DIEGO DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
