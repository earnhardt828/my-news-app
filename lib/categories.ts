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
  "Celebrity",
  "Weather",
  "Travel",
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
  Celebrity: "Celebrity",
  Weather: "Weather",
  Travel: "Travel",
};

export const CATEGORY_IMAGE_MAP: Partial<Record<NewsCategory, string>> = {
  Politics: "/categories/politics.png",
  World: "/categories/world-news.png",
  Business: "/categories/business.png",
  Auto: "/categories/auto.png",
  Tech: "/categories/tech.png",
  Sports: "/categories/sports.png",
  MLB: "/categories/mlb.png",
  NFL: "/categories/nfl.png",
  NHL: "/categories/nhl.png",
  MLS: "/categories/mls.png",
  "College Football": "/categories/college-football.png",
  "College Basketball": "/categories/college-basketball.png",
  Golf: "/categories/golf.png",
  NASCAR: "/categories/nascar.png",
  Celebrity: "/categories/celebrity.png",
  Travel: "/categories/travel.png",
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

  return "Trending";
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
