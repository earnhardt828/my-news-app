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

export function getBestArticleImage(article: ArticleImageFields) {
  const candidates: Array<[ArticleImageSource, string | null]> = [
    ["urlToImage", normalizeImageValue(article.urlToImage)],
    ["imageUrl", normalizeImageValue(article.imageUrl)],
    ["image", normalizeImageValue(article.image)],
    ["mediaContent", normalizeImageValue(article.mediaContent)],
    ["enclosureUrl", normalizeImageValue(article.enclosureUrl)],
    ["thumbnail", normalizeImageValue(article.thumbnail)],
  ];

  const selected = candidates.find(([, value]) => Boolean(value));

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
