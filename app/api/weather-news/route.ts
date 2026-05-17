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

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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
    });

    console.log("WEATHER FINAL COUNT", articles.length);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("WEATHER DIRECT ROUTE ERROR", error);
    return NextResponse.json({ articles: [] satisfies DirectFeedArticle[] }, { status: 200 });
  }
}
