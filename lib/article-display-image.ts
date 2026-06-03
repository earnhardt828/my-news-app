import {
  getBestArticleImage,
  isLikelyHighQualityArticleImage,
  type ArticleImageFields,
} from "./article-images";
import { getCategoryImageUrl } from "./categories";
import {
  getSourceBoxLogoUrl,
  getSourceRectangleLogoUrl,
} from "./source-logos";

type ArticleLike = ArticleImageFields & {
  id?: number | string | null;
  title?: string | null;
  description?: string | null;
  source?: string | null;
  category?: string | null;
  content?: string | null;
  url?: string | null;
};

export type ArticleDisplayImageKind =
  | "real";

export type ArticleDisplayImage = {
  src: string | null;
  kind: ArticleDisplayImageKind | null;
  isReal: boolean;
  failureKey: string | null;
};

type ArticleDisplayImageOptions = {
  largeCard?: boolean;
};

type TopicFallbackGroup = {
  keyword: string;
  pattern: RegExp;
  imageKey: string;
};

const TOPIC_IMAGE_FILENAMES = [
  "africa.png",
  "africas.png",
  "ai.png",
  "ai1.png",
  "air-travel.png",
  "baseball.png",
  "blue-jays.png",
  "brokerages.png",
  "chicago-weather.png",
  "dodgers.png",
  "eagles.png",
  "ebola.png",
  "economists.png",
  "economy.png",
  "economy1.png",
  "farmers.png",
  "fifa.png",
  "finance.png",
  "flash-flood.png",
  "flash-flooding.png",
  "flash-floods.png",
  "flooding.png",
  "floods.png",
  "hot-weather.png",
  "hurricane-ian.png",
  "hurricane.png",
  "hurricane1.png",
  "hurricane2.png",
  "ice-cream.png",
  "influencer.png",
  "influencers.png",
  "iran-war.png",
  "iran.png",
  "lightning.png",
  "meteor.png",
  "los-angeles-dodgers.png",
  "orioles.png",
  "philadelphia-eagles.png",
  "rocket.png",
  "rockies.png",
  "san-francisco-giants.png",
  "science.png",
  "scientist.png",
  "scientists.png",
  "sp500.png",
  "storms.png",
  "thunderstorm.png",
  "tornado-warning.png",
  "tornado.png",
  "tornado1.png",
  "tornado2.png",
  "travel-advisory.png",
  "trump.png",
  "trump1.png",
  "trump2.png",
  "trumps.png",
  "ukraine-war.png",
  "ukraine.png",
  "wall-st.png",
  "wall-street.png",
  "who.png",
  "winter-storm.png",
  "wnba.png",
  "world-cup.png",
  "yankees.png",
] as const;

const TOPIC_FALLBACK_IMAGE_GROUPS: TopicFallbackGroup[] = [
  {
    keyword: "trump",
    pattern: /\b(trump|donald trump|trump administration)\b/i,
    imageKey: "trump",
  },
  {
    keyword: "hurricane",
    pattern: /\b(hurricane|storm surge|tropical storm|cyclone)\b/i,
    imageKey: "hurricane",
  },
  {
    keyword: "floods",
    pattern: /\b(flood|flooding|flash flood)\b/i,
    imageKey: "floods",
  },
  {
    keyword: "tornado",
    pattern: /\b(tornado|twister)\b/i,
    imageKey: "tornado",
  },
  {
    keyword: "winter-storm",
    pattern: /\b(winter storm|blizzard|ice storm|snowstorm)\b/i,
    imageKey: "winter-storm",
  },
  {
    keyword: "hot-weather",
    pattern: /\b(heat wave|extreme heat|hot weather)\b/i,
    imageKey: "hot-weather",
  },
  {
    keyword: "ukraine",
    pattern: /\b(ukraine|ukraine war|russia-ukraine)\b/i,
    imageKey: "ukraine",
  },
  {
    keyword: "who",
    pattern: /\b(world health organization|who|ebola)\b/i,
    imageKey: "who",
  },
  {
    keyword: "economy",
    pattern: /\b(economy|inflation|interest rates|federal reserve|markets?)\b/i,
    imageKey: "economy",
  },
  {
    keyword: "farmers",
    pattern: /\b(farmers|farming|agriculture)\b/i,
    imageKey: "farmers",
  },
  {
    keyword: "world-cup",
    pattern: /\b(world cup)\b/i,
    imageKey: "world-cup",
  },
  {
    keyword: "dodgers",
    pattern: /\b(los angeles dodgers|dodgers)\b/i,
    imageKey: "dodgers",
  },
  {
    keyword: "eagles",
    pattern: /\b(philadelphia eagles|eagles)\b/i,
    imageKey: "eagles",
  },
];

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getTopicImagePool(imageKey: string) {
  const normalizedKey = imageKey.toLowerCase();

  return TOPIC_IMAGE_FILENAMES.filter((filename) => {
    const normalizedFilename = filename.toLowerCase().replace(/\.png$/i, "");

    if (normalizedFilename === normalizedKey) {
      return true;
    }

    if (new RegExp(`^${normalizedKey}\\d+$`, "i").test(normalizedFilename)) {
      return true;
    }

    if (normalizedKey === "tornado" && ["thunderstorm", "tornado-warning"].includes(normalizedFilename)) {
      return true;
    }

    if (
      normalizedKey === "floods" &&
      ["flooding", "flash-flooding", "flash-floods", "flash-flood"].includes(normalizedFilename)
    ) {
      return true;
    }

    if (normalizedKey === "ukraine" && normalizedFilename === "ukraine-war") {
      return true;
    }

    if (normalizedKey === "who" && normalizedFilename === "ebola") {
      return true;
    }

    if (
      normalizedKey === "economy" &&
      ["economists", "wall-street", "sp500", "wall-st", "finance", "brokerages"].includes(
        normalizedFilename
      )
    ) {
      return true;
    }

    if (normalizedKey === "dodgers" && normalizedFilename === "los-angeles-dodgers") {
      return true;
    }

    if (normalizedKey === "eagles" && normalizedFilename === "philadelphia-eagles") {
      return true;
    }

    return false;
  }).map((filename) => `/topic-images/${filename}`);
}

export function getTopicFallbackImage(article: Pick<ArticleLike, "title" | "description" | "source" | "category" | "content" | "url">) {
  const haystack = [
    article.title,
    article.description,
    article.content,
    article.source,
    article.category,
    article.url,
  ]
    .filter(Boolean)
    .join(" ");

  const matchingGroup = TOPIC_FALLBACK_IMAGE_GROUPS.find((group) => group.pattern.test(haystack));

  if (!matchingGroup) {
    return null;
  }

  const imagePool = getTopicImagePool(matchingGroup.imageKey);

  if (imagePool.length === 0) {
    return null;
  }

  const stableKey = (article.url ?? article.title ?? "").trim().toLowerCase();
  const rotationIndex = stableKey ? hashString(stableKey) % imagePool.length : 0;
  const selectedImage = imagePool[rotationIndex] ?? imagePool[0] ?? null;

  if (selectedImage) {
    console.log("TOPIC FALLBACK ROTATION_USED", {
      keyword: matchingGroup.keyword,
      index: rotationIndex,
      image: selectedImage,
      poolSize: imagePool.length,
      title: article.title ?? "",
    });
  }

  return selectedImage;
}

function getFailureKey(article: ArticleLike, src: string | null) {
  const stableId = article.id ?? article.url ?? article.title ?? "unknown";
  return src ? `${stableId}:${src}` : `${stableId}:none`;
}

export function getArticleDisplayImage(
  article: ArticleLike,
  options?: ArticleDisplayImageOptions
): ArticleDisplayImage {
  const selectedImage = getBestArticleImage(article);
  const imageSrc = selectedImage.src;

  if (
    imageSrc &&
    isLikelyHighQualityArticleImage(selectedImage.source, imageSrc)
  ) {
    console.log("ARTICLE REAL_IMAGE_USED", {
      title: article.title ?? "",
      source: article.source ?? "",
      imageSource: selectedImage.source,
    });
    return {
      src: imageSrc,
      kind: "real",
      isReal: true,
      failureKey: getFailureKey(article, imageSrc),
    };
  }

  const topicFallbackImage = getTopicFallbackImage(article);
  const sourceName = article.source?.trim() ?? "";
  const sourceLogo = sourceName ? getSourceBoxLogoUrl(sourceName) : null;
  const rectangleLogo = sourceName ? getSourceRectangleLogoUrl(sourceName) : null;
  const categoryFallback = article.category ? getCategoryImageUrl(article.category) : null;
  const rejectedFallbacks = [
    topicFallbackImage ? "topic-fallback" : null,
    sourceLogo ? "source-logo" : null,
    rectangleLogo ? "rectangle-logo" : null,
    categoryFallback ? "category-fallback" : null,
  ].filter(Boolean);

  if (rejectedFallbacks.length > 0) {
    console.log("ARTICLE FALLBACK_IMAGE_REJECTED", {
      title: article.title ?? "",
      source: sourceName,
      rejectedFallbacks,
      largeCard: Boolean(options?.largeCard),
    });
  }

  return {
    src: null,
    kind: null,
    isReal: false,
    failureKey: getFailureKey(article, null),
  };
}
