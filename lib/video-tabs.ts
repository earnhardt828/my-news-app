export type SharedVideoTab =
  | "news"
  | "sports"
  | "celebrity"
  | "technology"
  | "politics"
  | "world";

export const TECH_VIDEOS_DISABLED = true;
export const CELEBRITY_VIDEOS_DISABLED = true;
export const AUTO_VIDEOS_DISABLED = true;

export const SHARED_VIDEO_CATEGORIES: Array<{
  label: string;
  value: SharedVideoTab;
  apiTab: SharedVideoTab;
  keywords: string[];
}> = [
  {
    label: "News",
    value: "news",
    apiTab: "news",
    keywords: ["news", "breaking", "world", "politics", "business"],
  },
  {
    label: "Sports",
    value: "sports",
    apiTab: "sports",
    keywords: ["sports", "highlights", "game", "league", "score"],
  },
  {
    label: "Celebrity",
    value: "celebrity",
    apiTab: "celebrity",
    keywords: ["celebrity", "entertainment", "hollywood", "music", "movies"],
  },
  {
    label: "Technology",
    value: "technology",
    apiTab: "technology",
    keywords: [
      "tech",
      "technology",
      "AI",
      "Apple",
      "Google",
      "Microsoft",
      "OpenAI",
      "Nvidia",
    ],
  },
  {
    label: "Politics",
    value: "politics",
    apiTab: "politics",
    keywords: [
      "politics",
      "white house",
      "congress",
      "senate",
      "supreme court",
      "election",
      "policy",
      "government",
    ],
  },
  {
    label: "World",
    value: "world",
    apiTab: "world",
    keywords: [
      "world",
      "international",
      "global",
      "foreign affairs",
      "bbc",
      "reuters",
      "ap",
      "al jazeera",
    ],
  },
];

export function resolveVideoCategoryForMyNewsCategory(category: string): SharedVideoTab {
  const normalized = category.trim().toLowerCase();

  if (
    [
      "mlb",
      "baseball",
      "major league baseball",
      "nfl",
      "nhl",
      "mls",
      "nascar",
      "sports",
      "college football",
      "college basketball",
      "golf",
    ].includes(normalized)
  ) {
    return "sports";
  }

  if (["celebrity", "entertainment"].includes(normalized)) {
    return "celebrity";
  }

  if (normalized === "politics") {
    return "politics";
  }

  if (normalized === "world") {
    return "world";
  }

  if (["tech", "technology"].includes(normalized)) {
    return "technology";
  }

  return "news";
}
