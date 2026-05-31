export type ArticleImageFields = {
  cardImage?: string | null;
  urlToImage?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  media?: string | null;
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  thumbnail?: string | null;
};

export type ArticleImageSource =
  | "cardImage"
  | "urlToImage"
  | "imageUrl"
  | "image"
  | "media"
  | "mediaContent"
  | "enclosureUrl"
  | "ogImage"
  | "twitterImage"
  | "thumbnail"
  | null;

function normalizeImageValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function looksLikeLowQualityImageUrl(url: string) {
  const normalizedUrl = url.toLowerCase();

  if (
    /(^|[/?_.=-])(thumb|thumbnail|tiny|small)([/?_.=-]|$)/.test(normalizedUrl) ||
    /(80x80|120x|150x|300x)/.test(normalizedUrl)
  ) {
    return true;
  }

  if (
    /(^|https?:\/\/)(www\.)?google\.com\//.test(normalizedUrl) ||
    /encrypted-tbn\d*\.gstatic\.com/.test(normalizedUrl) ||
    /news\.google\.com\/.*(googlelogo|placeholder|gstatic|newsrs)/.test(normalizedUrl) ||
    /googleusercontent\.com\/.*(news|placeholder|thumbnail)/.test(normalizedUrl) ||
    /lh3\.googleusercontent\.com/.test(normalizedUrl) ||
    /gstatic\.com\/.*(news|placeholder|logo)/.test(normalizedUrl) ||
    /(^|[/?_.=-])(placeholder|default|fallback|blank|logo)([/?_.=-]|$)/.test(normalizedUrl)
  ) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const dimensionParams = [
      "w",
      "width",
      "h",
      "height",
      "mw",
      "mh",
      "maxwidth",
      "maxheight",
      "size",
      "sz",
    ];

    const tinyDimensionRequested = dimensionParams.some((key) => {
      const value = parsed.searchParams.get(key);

      if (!value) {
        return false;
      }

      const numericValue = Number(value);
      return Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 480;
    });

    if (tinyDimensionRequested) {
      return true;
    }

    if (
      parsed.hostname.includes("google.com") ||
      parsed.hostname.includes("news.google.com") ||
      parsed.hostname.includes("gstatic.com") ||
      parsed.hostname.includes("googleusercontent.com") ||
      parsed.hostname.includes("lh3.googleusercontent.com")
    ) {
      const path = `${parsed.pathname}${parsed.search}`.toLowerCase();

      if (
        /placeholder|default|blank|logo|newsrs|thumbnail|favicon/.test(path)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export function getBestArticleImage(article: ArticleImageFields) {
  const candidates: Array<[ArticleImageSource, string | null]> = [
    ["image", normalizeImageValue(article.image)],
    ["cardImage", normalizeImageValue(article.cardImage)],
    ["ogImage", normalizeImageValue(article.ogImage)],
    ["thumbnail", normalizeImageValue(article.thumbnail)],
    ["media", normalizeImageValue(article.media)],
    ["mediaContent", normalizeImageValue(article.mediaContent)],
    ["enclosureUrl", normalizeImageValue(article.enclosureUrl)],
    ["urlToImage", normalizeImageValue(article.urlToImage)],
    ["imageUrl", normalizeImageValue(article.imageUrl)],
    ["twitterImage", normalizeImageValue(article.twitterImage)],
  ];

  const usableCandidates = candidates.filter(([, value]) => Boolean(value)) as Array<
    [ArticleImageSource, string]
  >;
  const selected =
    usableCandidates.find(([, value]) => !looksLikeLowQualityImageUrl(value)) ??
    null;

  return {
    src: selected?.[1] ?? null,
    source: selected?.[0] ?? null,
  };
}

export function isLikelyHighQualityArticleImage(
  source: ArticleImageSource,
  url: string | null
) {
  if (!url) {
    return false;
  }

  if (looksLikeLowQualityImageUrl(url)) {
    return false;
  }

  return (
    source === "thumbnail" ||
    source === "cardImage" ||
    source === "media" ||
    source === "enclosureUrl" ||
    source === "urlToImage" ||
    source === "imageUrl" ||
    source === "image" ||
    source === "ogImage" ||
    source === "twitterImage" ||
    source === "mediaContent"
  );
}

export function shouldUseLargeArticleImage(width: number, height: number) {
  return width >= 600 && height >= 300;
}

export function shouldSuppressLowQualityArticleImage(
  source: ArticleImageSource,
  width: number,
  height: number
) {
  if (source !== "thumbnail") {
    return false;
  }

  return width < 640 || height < 360;
}
