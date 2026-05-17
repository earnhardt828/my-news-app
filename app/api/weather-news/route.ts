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

  const titlePatterns: Array<{ pattern: RegExp; source: string }> = [
    { pattern: /^Fox Weather:\s*/i, source: "Fox Weather" },
    { pattern: /^AccuWeather:\s*/i, source: "AccuWeather" },
    { pattern: /^The Weather Channel\s*[-:]\s*/i, source: "The Weather Channel" },
    { pattern: /^NOAA\s+/i, source: "NOAA" },
    { pattern: /^National Weather Service\s+/i, source: "National Weather Service" },
    { pattern: /^CNN Weather:\s*/i, source: "CNN Weather" },
    { pattern: /^AP News:\s*/i, source: "AP News" },
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
  };

  const strippedTitle = title.replace(titlePatterns[source] ?? /^$/, "").trim();
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
