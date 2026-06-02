import { isNativeCapacitorRuntime } from "./api-base";

type LinkActivationEvent = {
  preventDefault: () => void;
  stopPropagation?: () => void;
};

export type ArticleReaderLaunchPayload = {
  id?: number | null;
  url?: string | null;
  title: string;
  source?: string | null;
};

export async function openOriginalArticleUrl(url?: string | null) {
  const sourceUrl = url?.trim();

  if (!sourceUrl || typeof window === "undefined") {
    return false;
  }

  const capacitorBrowser = (
    window as Window & {
      Capacitor?: {
        Plugins?: {
          Browser?: {
            open?: (options: { url: string }) => Promise<void> | void;
          };
        };
      };
    }
  ).Capacitor?.Plugins?.Browser;

  if (isNativeCapacitorRuntime() && typeof capacitorBrowser?.open === "function") {
    try {
      await capacitorBrowser.open({ url: sourceUrl });
      return true;
    } catch (error) {
      console.error("CAPACITOR BROWSER OPEN FAILED", error);
    }
  }

  window.open(sourceUrl, "_blank", "noopener,noreferrer");
  return true;
}

export function openArticleInReflektReader(payload: ArticleReaderLaunchPayload) {
  if (typeof window === "undefined") {
    return false;
  }

  if (!payload.url?.trim()) {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent("reflekt:open-article-reader", {
      detail: payload,
    })
  );

  return true;
}

export async function handleArticleCardActivation(
  event: LinkActivationEvent,
  payload: ArticleReaderLaunchPayload,
  onBeforeOpen?: () => void
) {
  const sourceUrl = payload.url?.trim();

  if (!sourceUrl) {
    return false;
  }

  event.preventDefault();
  onBeforeOpen?.();
  return openArticleInReflektReader(payload);
}
