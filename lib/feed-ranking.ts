type RankableArticle = {
  id: number;
  source: string;
  likes?: number;
  comments?: { length: number }[] | unknown[];
  publishedAt?: string | null;
};

type SourcePreferenceOptions = {
  preferredSources?: string[];
  showLessSources?: string[];
  mode: "trending" | "my-feed" | "latest";
};

function normalizeSource(source: string) {
  return source.trim().toLowerCase();
}

function getEngagementScore(article: RankableArticle) {
  const likes = typeof article.likes === "number" ? article.likes : 0;
  const comments = Array.isArray(article.comments) ? article.comments.length : 0;
  return likes + comments;
}

function getRecencyScore(article: RankableArticle) {
  if (!article.publishedAt) {
    return 0;
  }

  const timestamp = new Date(article.publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function rankArticlesWithSourcePreferences<T extends RankableArticle>(
  articles: T[],
  { preferredSources = [], showLessSources = [], mode }: SourcePreferenceOptions
) {
  const preferred = new Set(preferredSources.map(normalizeSource));
  const showLess = new Set(showLessSources.map(normalizeSource));

  const sorted = [...articles].sort((a, b) => {
    const sourceA = normalizeSource(a.source);
    const sourceB = normalizeSource(b.source);
    const sourceBonusA =
      (preferred.has(sourceA) ? 4 : 0) - (showLess.has(sourceA) ? 3 : 0);
    const sourceBonusB =
      (preferred.has(sourceB) ? 4 : 0) - (showLess.has(sourceB) ? 3 : 0);

    if (mode === "latest") {
      const recencyDifference = getRecencyScore(b) - getRecencyScore(a);

      if (recencyDifference !== 0) {
        return recencyDifference;
      }
    }

    const scoreDifference =
      getEngagementScore(b) +
      sourceBonusB -
      (getEngagementScore(a) + sourceBonusA);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const recencyDifference = getRecencyScore(b) - getRecencyScore(a);

    if (recencyDifference !== 0) {
      return recencyDifference;
    }

    return b.id - a.id;
  });

  const sourceCounts = new Map<string, number>();

  return sorted
    .map((article) => {
      const sourceKey = normalizeSource(article.source);
      const repeats = sourceCounts.get(sourceKey) ?? 0;
      sourceCounts.set(sourceKey, repeats + 1);

      const sourcePenalty = repeats * 1.25;
      const sourceBonus =
        (preferred.has(sourceKey) ? 2.5 : 0) - (showLess.has(sourceKey) ? 1.75 : 0);

      return {
        article,
        rerankScore:
          getEngagementScore(article) +
          sourceBonus -
          sourcePenalty +
          getRecencyScore(article) / 10_000_000_000,
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .map(({ article }) => article);
}
