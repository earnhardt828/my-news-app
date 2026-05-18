import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
  type RssFeedConfig,
} from "../../../lib/direct-news-routes";

const WEATHER_QUERIES = [
  "severe weather",
  "hurricane news",
  "tornado news",
  "flooding news",
  "winter storm news",
  "wildfire weather news",
  "Fox Weather latest",
  "AccuWeather latest",
  "The Weather Channel latest",
  "NOAA weather alerts",
  "National Weather Service news",
];

const WEATHER_SIGNALS = [
  "weather",
  "severe weather",
  "hurricane",
  "tornado",
  "flooding",
  "winter storm",
  "wildfire",
  "fox weather",
  "accuweather",
  "the weather channel",
  "noaa",
  "national weather service",
  "ap news",
  "forecast",
  "storm",
  "alert",
];

const WEATHER_QUERY_SOURCE_TERMS = new Set(
  WEATHER_QUERIES.map((query) => normalize(query))
);

const PREFERRED_WEATHER_SOURCES = [
  "Fox Weather",
  "AccuWeather",
  "The Weather Channel",
  "NOAA",
  "National Weather Service",
  "AP News",
  "CNN Weather",
];

const WEATHER_SOURCE_URL_HINTS: Array<{ match: string; source: string }> = [
  { match: "foxweather.com", source: "Fox Weather" },
  { match: "accuweather.com", source: "AccuWeather" },
  { match: "weather.com", source: "The Weather Channel" },
  { match: "noaa.gov", source: "NOAA" },
  { match: "weather.gov", source: "National Weather Service" },
  { match: "cnn.com/weather", source: "CNN Weather" },
  { match: "cnn.com", source: "CNN Weather" },
  { match: "apnews.com", source: "AP News" },
  { match: "wsoctv.com", source: "WSOC" },
  { match: "wbtv.com", source: "WBTV" },
  { match: "wcnc.com", source: "WCNC" },
  { match: "nbcnewyork.com", source: "NBC New York" },
  { match: "abc7ny.com", source: "ABC7NY" },
  { match: "cbsnews.com/newyork", source: "CBS New York" },
  { match: "ktla.com", source: "KTLA" },
  { match: "abc7.com", source: "ABC7 Los Angeles" },
  { match: "nbclosangeles.com", source: "NBC Los Angeles" },
  { match: "cbsnews.com/losangeles", source: "CBS Los Angeles" },
  { match: "wgntv.com", source: "WGN" },
  { match: "nbcchicago.com", source: "NBC Chicago" },
  { match: "abc7chicago.com", source: "ABC7 Chicago" },
  { match: "cbsnews.com/chicago", source: "CBS Chicago" },
  { match: "khou.com", source: "KHOU" },
  { match: "abc13.com", source: "ABC13 Houston" },
  { match: "fox26houston.com", source: "FOX 26 Houston" },
  { match: "click2houston.com", source: "KPRC 2 Houston" },
];

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getUrlInferredWeatherSource(url: string | null | undefined, title: string | null | undefined) {
  const normalizedUrl = normalize(url);
  const normalizedTitle = normalize(title);

  if (normalizedUrl.includes("cnn.com") && normalizedTitle.includes("weather")) {
    return "CNN Weather";
  }

  const hintedSource = WEATHER_SOURCE_URL_HINTS.find(({ match }) => normalizedUrl.includes(match));
  return hintedSource?.source ?? null;
}

function getTitleInferredWeatherSource(title: string | null | undefined) {
  const rawTitle = String(title ?? "").trim();
  const normalizedTitle = normalize(rawTitle);
  const genericPrefixMatch = rawTitle.match(/^([^:–—-]{2,40})\s*[:–—-]\s+/);
  if (genericPrefixMatch) {
    const candidatePrefix = genericPrefixMatch[1]?.trim() ?? "";
    const normalizedPrefix = normalize(candidatePrefix);
    const preferredPrefixSource = PREFERRED_WEATHER_SOURCES.find(
      (candidate) => normalize(candidate) === normalizedPrefix
    );
    if (preferredPrefixSource) {
      return preferredPrefixSource;
    }
  }

  const titlePatterns: Array<{ pattern: RegExp; source: string }> = [
    { pattern: /^Fox Weather:\s*/i, source: "Fox Weather" },
    { pattern: /^AccuWeather:\s*/i, source: "AccuWeather" },
    { pattern: /^The Weather Channel\s*[-:]\s*/i, source: "The Weather Channel" },
    { pattern: /^NOAA\s+/i, source: "NOAA" },
    { pattern: /^National Weather Service\s+/i, source: "National Weather Service" },
    { pattern: /^CNN Weather:\s*/i, source: "CNN Weather" },
    { pattern: /^AP News:\s*/i, source: "AP News" },
    { pattern: /^WSOC:\s*/i, source: "WSOC" },
    { pattern: /^WBTV:\s*/i, source: "WBTV" },
    { pattern: /^WCNC:\s*/i, source: "WCNC" },
    { pattern: /^NBC New York:\s*/i, source: "NBC New York" },
    { pattern: /^ABC7NY:\s*/i, source: "ABC7NY" },
    { pattern: /^CBS New York:\s*/i, source: "CBS New York" },
    { pattern: /^KTLA:\s*/i, source: "KTLA" },
    { pattern: /^ABC7 Los Angeles:\s*/i, source: "ABC7 Los Angeles" },
    { pattern: /^NBC Los Angeles:\s*/i, source: "NBC Los Angeles" },
    { pattern: /^CBS Los Angeles:\s*/i, source: "CBS Los Angeles" },
    { pattern: /^WGN:\s*/i, source: "WGN" },
    { pattern: /^NBC Chicago:\s*/i, source: "NBC Chicago" },
    { pattern: /^ABC7 Chicago:\s*/i, source: "ABC7 Chicago" },
    { pattern: /^CBS Chicago:\s*/i, source: "CBS Chicago" },
    { pattern: /^KHOU:\s*/i, source: "KHOU" },
    { pattern: /^ABC13(?: Houston)?:\s*/i, source: "ABC13 Houston" },
    { pattern: /^FOX 26(?: Houston)?:\s*/i, source: "FOX 26 Houston" },
    { pattern: /^KPRC(?: 2 Houston)?:\s*/i, source: "KPRC 2 Houston" },
  ];

  const matchedPattern = titlePatterns.find(({ pattern }) => pattern.test(rawTitle));
  if (matchedPattern) {
    return matchedPattern.source;
  }

  const preferredSource = PREFERRED_WEATHER_SOURCES.find((candidate) =>
    normalizedTitle.includes(normalize(candidate))
  );

  return preferredSource ?? null;
}

function stripWeatherSourcePrefix(title: string, source: string) {
  const titlePatterns: Record<string, RegExp> = {
    "Fox Weather": /^Fox Weather:\s*/i,
    AccuWeather: /^AccuWeather:\s*/i,
    "The Weather Channel": /^The Weather Channel\s*[-:]\s*/i,
    NOAA: /^NOAA\s+/i,
    "National Weather Service": /^National Weather Service\s+/i,
    "CNN Weather": /^CNN Weather:\s*/i,
    "AP News": /^AP News:\s*/i,
    WSOC: /^WSOC:\s*/i,
    WBTV: /^WBTV:\s*/i,
    WCNC: /^WCNC:\s*/i,
    "NBC New York": /^NBC New York:\s*/i,
    ABC7NY: /^ABC7NY:\s*/i,
    "CBS New York": /^CBS New York:\s*/i,
    KTLA: /^KTLA:\s*/i,
    "ABC7 Los Angeles": /^ABC7 Los Angeles:\s*/i,
    "NBC Los Angeles": /^NBC Los Angeles:\s*/i,
    "CBS Los Angeles": /^CBS Los Angeles:\s*/i,
    WGN: /^WGN:\s*/i,
    "NBC Chicago": /^NBC Chicago:\s*/i,
    "ABC7 Chicago": /^ABC7 Chicago:\s*/i,
    "CBS Chicago": /^CBS Chicago:\s*/i,
    KHOU: /^KHOU:\s*/i,
    "ABC13 Houston": /^ABC13(?: Houston)?:\s*/i,
    "FOX 26 Houston": /^FOX 26(?: Houston)?:\s*/i,
    "KPRC 2 Houston": /^KPRC(?: 2 Houston)?:\s*/i,
  };

  const sourcePattern = titlePatterns[source] ?? /^([^:–—-]{2,40})\s*[:–—-]\s+/i;
  const strippedTitle = title.replace(sourcePattern, "").trim();
  return strippedTitle || title;
}

function inferWeatherSource(article: DirectFeedArticle) {
  const source = article.sourceName || article.source;
  const normalizedSource = normalize(source);
  const preferredSource = PREFERRED_WEATHER_SOURCES.find(
    (candidate) => normalize(candidate) === normalizedSource
  );
  if (preferredSource) {
    return preferredSource;
  }

  const titleInferredSource = getTitleInferredWeatherSource(article.title);
  if (titleInferredSource) {
    return titleInferredSource;
  }

  const urlInferredSource = getUrlInferredWeatherSource(article.url, article.title);
  if (urlInferredSource) {
    return urlInferredSource;
  }

  if (!normalizedSource || WEATHER_QUERY_SOURCE_TERMS.has(normalizedSource)) {
    return "Weather News";
  }

  const fallbackSource = String(source ?? "Weather News").trim() || "Weather News";
  return fallbackSource;
}

function createGoogleNewsSearchFeed(query: string): RssFeedConfig {
  return {
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    source: query,
    category: "Weather",
  };
}

export async function GET() {
  try {
    console.log("WEATHER ROUTE HIT");

    const primaryArticles = await fetchDirectArticlePool({
      queries: WEATHER_QUERIES,
      pageSize: 12,
    });
    const rawArticles =
      primaryArticles.length > 0
        ? primaryArticles
        : await fetchDirectArticlePool({
            queries: WEATHER_QUERIES,
            rssFeeds: WEATHER_QUERIES.map((query) => createGoogleNewsSearchFeed(query)),
            pageSize: 20,
          });

    console.log("WEATHER RAW COUNT", rawArticles.length);

    const articles = rawArticles.filter((article) => {
      const source = normalize(article.source);
      const haystack = normalize(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.source} ${article.category}`
      );

      return WEATHER_SIGNALS.some((signal) => haystack.includes(signal) || source.includes(signal));
    }).map((article) => {
      const cleanedSource = inferWeatherSource(article);
      const cleanedTitle = stripWeatherSourcePrefix(article.title, cleanedSource);

      return {
        ...article,
        title: cleanedTitle,
        source: cleanedSource,
        sourceName: cleanedSource,
      };
    });

    console.log("WEATHER FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("WEATHER DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
