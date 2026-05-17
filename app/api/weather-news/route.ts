import { NextResponse } from "next/server";
import {
  fetchDirectArticlePool,
  type DirectFeedArticle,
} from "../../../lib/direct-news-routes";

const WEATHER_QUERIES = [
  "weather news",
  "severe weather",
  "hurricane news",
  "tornado news",
  "flooding news",
  "winter storm news",
  "wildfire weather",
  "Fox Weather latest",
  "AccuWeather latest",
  "The Weather Channel latest",
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

export async function GET() {
  try {
    const rawArticles = await fetchDirectArticlePool({
      queries: WEATHER_QUERIES,
      pageSize: 8,
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
