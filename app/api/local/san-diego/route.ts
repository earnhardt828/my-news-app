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

const SAN_DIEGO_QUERY_SOURCE_TERMS = new Set(
  SAN_DIEGO_QUERIES.map((query) => normalize(query))
);

const SAN_DIEGO_SOURCE_URL_HINTS: Array<{ match: string; source: string }> = [
  { match: "nbc7sandiego.com", source: "NBC 7 San Diego" },
  { match: "10news.com", source: "ABC 10News" },
  { match: "cbs8.com", source: "CBS 8" },
  { match: "fox5sandiego.com", source: "FOX 5 San Diego" },
  { match: "kpbs.org", source: "KPBS" },
  { match: "sandiegouniontribune.com", source: "San Diego Union-Tribune" },
  { match: "timesofsandiego.com", source: "Times of San Diego" },
];

const SAN_DIEGO_TITLE_SOURCE_PATTERNS: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /^NBC 7(?: San Diego)?\s*[:\u2013\u2014-]\s*/i, source: "NBC 7 San Diego" },
  { pattern: /^ABC 10News(?: San Diego)?\s*[:\u2013\u2014-]\s*/i, source: "ABC 10News" },
  { pattern: /^CBS 8(?: San Diego)?\s*[:\u2013\u2014-]\s*/i, source: "CBS 8" },
  { pattern: /^FOX 5(?: San Diego)?\s*[:\u2013\u2014-]\s*/i, source: "FOX 5 San Diego" },
  { pattern: /^KPBS\s*[:\u2013\u2014-]\s*/i, source: "KPBS" },
  { pattern: /^San Diego Union-Tribune\s*[:\u2013\u2014-]\s*/i, source: "San Diego Union-Tribune" },
  { pattern: /^Times of San Diego\s*[:\u2013\u2014-]\s*/i, source: "Times of San Diego" },
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

function normalizeCompact(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getUrlInferredSanDiegoSource(url: string | null | undefined) {
  const normalizedUrl = normalizeCompact(url);
  const hintedSource = SAN_DIEGO_SOURCE_URL_HINTS.find(({ match }) =>
    normalizedUrl.includes(match)
  );
  return hintedSource?.source ?? null;
}

function getTitleInferredSanDiegoSource(title: string | null | undefined) {
  const rawTitle = String(title ?? "").trim();
  const matchedPattern = SAN_DIEGO_TITLE_SOURCE_PATTERNS.find(({ pattern }) =>
    pattern.test(rawTitle)
  );

  if (matchedPattern) {
    return matchedPattern.source;
  }

  const normalizedTitle = normalizeCompact(rawTitle);
  if (normalizedTitle.includes("nbc 7")) return "NBC 7 San Diego";
  if (normalizedTitle.includes("abc 10news")) return "ABC 10News";
  if (normalizedTitle.includes("cbs 8")) return "CBS 8";
  if (normalizedTitle.includes("fox 5")) return "FOX 5 San Diego";
  if (normalizedTitle.includes("kpbs")) return "KPBS";
  if (normalizedTitle.includes("san diego union-tribune")) return "San Diego Union-Tribune";
  if (normalizedTitle.includes("times of san diego")) return "Times of San Diego";

  return null;
}

function inferSanDiegoSource(article: DirectFeedArticle) {
  const rawSource = article.sourceName || article.source;
  const normalizedSource = normalizeCompact(rawSource);

  if (normalizedSource && !SAN_DIEGO_QUERY_SOURCE_TERMS.has(normalizedSource)) {
    const titleInferredSource = getTitleInferredSanDiegoSource(article.title);
    const urlInferredSource = getUrlInferredSanDiegoSource(article.url);
    return titleInferredSource ?? urlInferredSource ?? String(rawSource).trim();
  }

  const titleInferredSource = getTitleInferredSanDiegoSource(article.title);
  if (titleInferredSource) {
    return titleInferredSource;
  }

  const urlInferredSource = getUrlInferredSanDiegoSource(article.url);
  if (urlInferredSource) {
    return urlInferredSource;
  }

  return "San Diego Local";
}

function stripSanDiegoSourcePrefix(title: string, source: string) {
  const matchedPattern = SAN_DIEGO_TITLE_SOURCE_PATTERNS.find(
    ({ source: candidateSource }) => candidateSource === source
  );
  const sourcePattern = matchedPattern?.pattern ?? /^([^:\u2013\u2014-]{2,40})\s*[:\u2013\u2014-]\s+/i;
  const strippedTitle = title.replace(sourcePattern, "").trim();
  return strippedTitle || title;
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

    const articles = rawArticles
      .filter((article) => {
        const source = normalize(article.source);
        const haystack = normalize(
          `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
        );

        return SAN_DIEGO_MATCH_TERMS.some(
          (signal) => haystack.includes(signal.toLowerCase()) || source.includes(signal.toLowerCase())
        );
      })
      .map((article) => {
        const cleanedSource = inferSanDiegoSource(article);
        const cleanedTitle = stripSanDiegoSourcePrefix(article.title, cleanedSource);

        return {
          ...article,
          title: cleanedTitle,
          source: cleanedSource,
          sourceName: cleanedSource,
        };
      });

    console.log("SAN DIEGO FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("SAN DIEGO DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
