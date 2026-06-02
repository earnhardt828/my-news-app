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
  description?: string | null;
  imageSrc?: string | null;
  publishedLabel?: string | null;
  category?: string | null;
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

export async function handleArticleCardActivation(
  _event: LinkActivationEvent,
  _payload: ArticleReaderLaunchPayload,
  onBeforeOpen?: () => void
) {
  onBeforeOpen?.();
  return false;
}
