export const ARTICLE_RETURN_STATE_KEY = "graffiti-article-return-state";
export const ARTICLE_RETURN_PENDING_KEY = "graffiti-article-return-pending";

export type ArticleReturnState = {
  path: string;
  scrollY: number;
  source?: "home" | "search";
  sortMode?: "trending" | "polls" | "latest" | "local";
  selectedLocalCity?: string | null;
  localLocationLabel?: string | null;
  searchQuery?: string;
};

export function saveArticleReturnState(state: ArticleReturnState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ARTICLE_RETURN_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("ARTICLE RETURN STATE SAVE FAILED", error);
  }
}

export function readArticleReturnState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(ARTICLE_RETURN_STATE_KEY);
    return rawValue ? (JSON.parse(rawValue) as ArticleReturnState) : null;
  } catch (error) {
    console.error("ARTICLE RETURN STATE READ FAILED", error);
    return null;
  }
}

export function savePendingArticleReturnState(state: ArticleReturnState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ARTICLE_RETURN_PENDING_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("ARTICLE RETURN PENDING SAVE FAILED", error);
  }
}

export function consumePendingArticleReturnState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(ARTICLE_RETURN_PENDING_KEY);

    if (!rawValue) {
      return null;
    }

    window.sessionStorage.removeItem(ARTICLE_RETURN_PENDING_KEY);
    return JSON.parse(rawValue) as ArticleReturnState;
  } catch (error) {
    console.error("ARTICLE RETURN PENDING READ FAILED", error);
    return null;
  }
}
