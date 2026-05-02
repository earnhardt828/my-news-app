type RankableArticle = {
  id: number;
  source: string;
  category?: string;
  likes?: number;
  comments?: { length: number }[] | unknown[];
  publishedAt?: string | null;
};

type SourcePreferenceOptions = {
  preferredSources?: string[];
  showLessSources?: string[];
  likedSources?: string[];
  dislikedSources?: string[];
  mode: "trending" | "my-feed" | "latest";
};

const SOURCE_WEIGHT: Record<string, number> = {
  "associated press": 4,
  "ap news": 4,
  reuters: 4,
  "bbc news": 3.5,
  cnn: 3,
  bloomberg: 3,
  cnbc: 2.75,
  "the new york times": 2.75,
  "new york times": 2.75,
  "the washington post": 2.5,
  "washington post": 2.5,
  npr: 2.25,
  axios: 2,
};

function normalizeSource(source: string) {
  return source.trim().toLowerCase();
}

function normalizeCategory(category: string | undefined) {
  return (category ?? "").trim().toLowerCase();
}

function getSourceWeight(source: string) {
  return SOURCE_WEIGHT[normalizeSource(source)] ?? 0;
}

function getEngagementScore(article: RankableArticle) {
  const likes = typeof article.likes === "number" ? article.likes : 0;
  const comments = Array.isArray(article.comments) ? article.comments.length : 0;
  return likes + comments * 2.5;
}

function getRecencyScore(article: RankableArticle) {
  if (!article.publishedAt) {
    return 0;
  }

  const timestamp = new Date(article.publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function diversifyArticles<T extends RankableArticle>(articles: T[]) {
  const remaining = [...articles];
  const output: T[] = [];
  let lastSource = "";
  let lastCategory = "";

  while (remaining.length > 0) {
    let selectedIndex = remaining.findIndex((article) => {
      const sourceKey = normalizeSource(article.source);
      const categoryKey = normalizeCategory(article.category);
      return sourceKey !== lastSource && categoryKey !== lastCategory;
    });

    if (selectedIndex === -1) {
      selectedIndex = remaining.findIndex(
        (article) => normalizeSource(article.source) !== lastSource
      );
    }

    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    const [nextArticle] = remaining.splice(selectedIndex, 1);
    output.push(nextArticle);
    lastSource = normalizeSource(nextArticle.source);
    lastCategory = normalizeCategory(nextArticle.category);
  }

  return output;
}

export function rankArticlesWithSourcePreferences<T extends RankableArticle>(
  articles: T[],
  {
    preferredSources = [],
    showLessSources = [],
    likedSources = [],
    dislikedSources = [],
    mode,
  }: SourcePreferenceOptions
) {
  const preferred = new Set(preferredSources.map(normalizeSource));
  const showLess = new Set(showLessSources.map(normalizeSource));
  const liked = new Set(likedSources.map(normalizeSource));
  const disliked = new Set(dislikedSources.map(normalizeSource));

  if (mode === "latest") {
    return [...articles].sort((a, b) => {
      const recencyDifference = getRecencyScore(b) - getRecencyScore(a);

      if (recencyDifference !== 0) {
        return recencyDifference;
      }

      return b.id - a.id;
    });
  }

  const sorted = [...articles].sort((a, b) => {
    const sourceA = normalizeSource(a.source);
    const sourceB = normalizeSource(b.source);
    const preferenceBonusA =
      mode === "my-feed"
        ? (preferred.has(sourceA) ? 7 : 0) -
          (showLess.has(sourceA) ? 5.5 : 0) +
          (liked.has(sourceA) ? 5 : 0) -
          (disliked.has(sourceA) ? 6.5 : 0)
        : 0;
    const preferenceBonusB =
      mode === "my-feed"
        ? (preferred.has(sourceB) ? 7 : 0) -
          (showLess.has(sourceB) ? 5.5 : 0) +
          (liked.has(sourceB) ? 5 : 0) -
          (disliked.has(sourceB) ? 6.5 : 0)
        : 0;
    const sourceWeightA = mode === "trending" ? getSourceWeight(a.source) * 3 : 0;
    const sourceWeightB = mode === "trending" ? getSourceWeight(b.source) * 3 : 0;
    const recencyWeightA =
      mode === "trending"
        ? getRecencyScore(a) / 25_000_000_000
        : getRecencyScore(a) / 40_000_000_000;
    const recencyWeightB =
      mode === "trending"
        ? getRecencyScore(b) / 25_000_000_000
        : getRecencyScore(b) / 40_000_000_000;

    const scoreDifference =
      getEngagementScore(b) +
      preferenceBonusB +
      sourceWeightB +
      recencyWeightB -
      (getEngagementScore(a) + preferenceBonusA + sourceWeightA + recencyWeightA);

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

  return diversifyArticles(
    sorted
      .map((article) => {
        const sourceKey = normalizeSource(article.source);
        const repeats = sourceCounts.get(sourceKey) ?? 0;
        sourceCounts.set(sourceKey, repeats + 1);

        const sourcePenalty = repeats * 1.25;
        const sourceBonus =
          mode === "my-feed"
            ? (preferred.has(sourceKey) ? 3.5 : 0) -
              (showLess.has(sourceKey) ? 2.25 : 0) +
              (liked.has(sourceKey) ? 2.5 : 0) -
              (disliked.has(sourceKey) ? 3.25 : 0)
            : getSourceWeight(article.source) * 0.85;

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
      .map(({ article }) => article)
  );
}
