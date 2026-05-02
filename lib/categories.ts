export const CATEGORY_OPTIONS = [
  "Politics",
  "World",
  "Business",
  "Tech",
  "Sports",
  "Health",
  "Science",
  "Entertainment",
  "Finance",
  "Crime",
  "Weather",
  "Education",
  "Real Estate",
  "Local News",
  "Culture",
  "Lifestyle",
  "Travel",
  "Food",
  "Opinion",
  "Breaking News",
] as const;

export type NewsCategory = (typeof CATEGORY_OPTIONS)[number];

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  Politics: "Politics 🏛️",
  World: "World 🌍",
  Business: "Business 💼",
  Tech: "Tech 💻",
  Sports: "Sports 🏈",
  Health: "Health 🏥",
  Science: "Science 🔬",
  Entertainment: "Entertainment 🎬",
  Finance: "Finance 💸",
  Crime: "Crime 🚨",
  Weather: "Weather ⛅",
  Education: "Education 🎓",
  "Real Estate": "Real Estate 🏠",
  "Local News": "Local News 🗺️",
  Culture: "Culture 🎭",
  Lifestyle: "Lifestyle ✨",
  Travel: "Travel ✈️",
  Food: "Food 🍽️",
  Opinion: "Opinion 💭",
  "Breaking News": "Breaking News ⚡",
};

export const VIDEO_CATEGORIES = ["Trending", ...CATEGORY_OPTIONS] as const;

export function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category as NewsCategory] ?? category;
}
