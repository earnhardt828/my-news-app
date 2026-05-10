export type ArticleImageFields = {
  urlToImage?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  thumbnail?: string | null;
};

export type ArticleImageSource =
  | "urlToImage"
  | "imageUrl"
  | "image"
  | "mediaContent"
  | "enclosureUrl"
  | "thumbnail"
  | null;

function normalizeImageValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function looksLikeLowQualityImageUrl(url: string) {
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
    ["mediaContent", normalizeImageValue(article.mediaContent)],
    ["enclosureUrl", normalizeImageValue(article.enclosureUrl)],
    ["thumbnail", normalizeImageValue(article.thumbnail)],
  ];

  const usableCandidates = candidates.filter(([, value]) => Boolean(value)) as Array<
    [ArticleImageSource, string]
  >;
  const selected =
    usableCandidates.find(
      ([source, value]) => source !== "thumbnail" && !looksLikeLowQualityImageUrl(value)
    ) ??
    usableCandidates.find(([, value]) => !looksLikeLowQualityImageUrl(value)) ??
    null;

  return {
    src: selected?.[1] ?? null,
    source: selected?.[0] ?? null,
  };
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
