export type ArticleImageFields = {
  urlToImage?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  thumbnail?: string | null;
};

export type ArticleImageSource =
  | "urlToImage"
  | "imageUrl"
  | "image"
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
  } catch {
    return false;
  }

  return false;
}

export function getBestArticleImage(article: ArticleImageFields) {
  const candidates: Array<[ArticleImageSource, string | null]> = [
    ["urlToImage", normalizeImageValue(article.urlToImage)],
    ["imageUrl", normalizeImageValue(article.imageUrl)],
    ["image", normalizeImageValue(article.image)],
    ["ogImage", normalizeImageValue(article.ogImage)],
    ["twitterImage", normalizeImageValue(article.twitterImage)],
    ["mediaContent", normalizeImageValue(article.mediaContent)],
    ["enclosureUrl", normalizeImageValue(article.enclosureUrl)],
    ["thumbnail", normalizeImageValue(article.thumbnail)],
  ];

  const usableCandidates = candidates.filter(([, value]) => Boolean(value)) as Array<
    [ArticleImageSource, string]
  >;
  const selected = usableCandidates[0] ?? null;

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

  return source === "urlToImage" || source === "imageUrl" || source === "image";
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
