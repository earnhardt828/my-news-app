export const CATEGORY_OPTIONS = [
  "Politics",
  "World",
  "Business",
  "Auto",
  "Tech",
  "Sports",
  "MLB",
  "NFL",
  "NHL",
  "MLS",
  "College Football",
  "College Basketball",
  "Golf",
  "NASCAR",
  "Health",
  "Science",
  "Entertainment",
  "Celebrity",
  "Art",
  "Music",
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
  Politics: "Politics",
  World: "World",
  Business: "Business",
  Auto: "Auto",
  Tech: "Tech",
  Sports: "Sports",
  MLB: "MLB",
  NFL: "NFL",
  NHL: "NHL",
  MLS: "MLS",
  "College Football": "College Football",
  "College Basketball": "College Basketball",
  Golf: "Golf",
  NASCAR: "NASCAR",
  Health: "Health",
  Science: "Science",
  Entertainment: "Entertainment",
  Celebrity: "Celebrity",
  Art: "Art",
  Music: "Music",
  Finance: "Finance",
  Crime: "Crime",
  Weather: "Weather",
  Education: "Education",
  "Real Estate": "Real Estate",
  "Local News": "Local News",
  Culture: "Culture",
  Lifestyle: "Lifestyle",
  Travel: "Travel",
  Food: "Food",
  Opinion: "Opinion",
  "Breaking News": "Breaking News",
};

export const CATEGORY_IMAGE_MAP: Partial<Record<NewsCategory, string>> = {
  Politics: "/category-images/politics.png",
  World: "/category-images/world.png",
  Business: "/category-images/business.png",
  Auto: "/category-images/business.png",
  Tech: "/category-images/tech.png",
  Sports: "/category-images/sports.png",
  MLB: "/category-images/mlb.png",
  NFL: "/category-images/nfl.png",
  NHL: "/category-images/nhl.png",
  MLS: "/category-images/mls.png",
  "College Football": "/category-images/college-football.png",
  "College Basketball": "/category-images/college-basketball.png",
  Golf: "/category-images/golf.png",
  NASCAR: "/category-images/nascar.png",
};

export const VIDEO_CATEGORIES = ["Trending", ...CATEGORY_OPTIONS] as const;

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksUuidLike(value: string) {
  return UUID_LIKE_PATTERN.test(value.trim());
}

function inferCategoryFromContext(source?: string | null, title?: string | null) {
  const haystack = `${source ?? ""} ${title ?? ""}`.toLowerCase();

  if (/\b(nfl|nba|mlb|nhl|ncaa|espn|sport|playoff|match|game|tournament)\b/.test(haystack)) {
    return "Sports";
  }

  if (/\b(ai|artificial intelligence|tech|apple|google|microsoft|meta|tesla|startup|chip)\b/.test(haystack)) {
    return "Tech";
  }

  if (/\b(stock|market|economy|earnings|inflation|fed|finance|business|wall street|tariff)\b/.test(haystack)) {
    return "Business";
  }

  if (/\b(car|cars|auto|automotive|vehicle|ev|electric vehicle|tesla|ford|gm|toyota|honda|audi|bmw|mercedes)\b/.test(haystack)) {
    return "Auto";
  }

  if (/\b(election|congress|senate|white house|trump|biden|politic|government|supreme court)\b/.test(haystack)) {
    return "Politics";
  }

  if (/\b(health|medical|hospital|disease|vaccine|cdc|nih)\b/.test(haystack)) {
    return "Health";
  }

  if (/\b(celebrity|celeb|tmz|people magazine|people|hollywood reporter|e news|variety)\b/.test(haystack)) {
    return "Celebrity";
  }

  if (/\b(movie|music|tv|hollywood|entertainment|streaming)\b/.test(haystack)) {
    return "Entertainment";
  }

  if (/\b(world|international|war|europe|asia|china|russia|ukraine|israel|gaza)\b/.test(haystack)) {
    return "World";
  }

  return "News";
}

export function getDisplayCategory(
  category: string | null | undefined,
  context?: {
    source?: string | null;
    title?: string | null;
  }
) {
  const cleaned = category?.trim() ?? "";

  if (!cleaned || looksUuidLike(cleaned)) {
    return inferCategoryFromContext(context?.source, context?.title);
  }

  const matchingCategory = CATEGORY_OPTIONS.find(
    (option) => option.toLowerCase() === cleaned.toLowerCase()
  );

  if (matchingCategory) {
    return matchingCategory;
  }

  if (cleaned.length > 32 || /^[0-9-]+$/.test(cleaned)) {
    return inferCategoryFromContext(context?.source, context?.title);
  }

  return cleaned;
}

export function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category as NewsCategory] ?? category;
}

export function getCategoryImageUrl(category: string) {
  return CATEGORY_IMAGE_MAP[category as NewsCategory] ?? null;
}
