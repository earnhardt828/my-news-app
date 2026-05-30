export const VIDEO_RETURN_STATE_KEY = "graffiti-video-return-state";
export const VIDEO_RETURN_PENDING_KEY = "graffiti-video-return-pending";

export type SharedVideoTab =
  | "news"
  | "world"
  | "politics"
  | "sports"
  | "celebrity"
  | "technology";

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

export type VideoReturnState = {
  path: string;
  scrollY: number;
  sortMode?:
    | "trending"
    | "mynews"
    | "polls"
    | "latest"
    | "local"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business";
  selectedLocalCity?: string | null;
  localLocationLabel?: string | null;
  tab?: SharedVideoTab;
  originLabel?: string | null;
};

function saveState(key: string, state: VideoReturnState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error("VIDEO RETURN STATE SAVE FAILED", error);
  }
}

function readState(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as VideoReturnState) : null;
  } catch (error) {
    console.error("VIDEO RETURN STATE READ FAILED", error);
    return null;
  }
}

export function saveVideoReturnState(state: VideoReturnState) {
  saveState(VIDEO_RETURN_STATE_KEY, state);
}

export function readVideoReturnState() {
  return readState(VIDEO_RETURN_STATE_KEY);
}

export function savePendingVideoReturnState(state: VideoReturnState) {
  saveState(VIDEO_RETURN_PENDING_KEY, state);
}

export function consumePendingVideoReturnState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(VIDEO_RETURN_PENDING_KEY);

    if (!rawValue) {
      return null;
    }

    window.sessionStorage.removeItem(VIDEO_RETURN_PENDING_KEY);
    return JSON.parse(rawValue) as VideoReturnState;
  } catch (error) {
    console.error("VIDEO RETURN PENDING READ FAILED", error);
    return null;
  }
}
