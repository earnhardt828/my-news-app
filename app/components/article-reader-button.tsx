"use client";

import { isNativeCapacitorRuntime } from "../../lib/api-base";

type ArticleReaderButtonProps = {
  title: string;
  url?: string | null;
};

export default function ArticleReaderButton({
  title,
  url,
}: ArticleReaderButtonProps) {
  const openReader = async () => {
    const sourceUrl = url?.trim();

    if (!sourceUrl || typeof window === "undefined") {
      return;
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
        return;
      } catch (error) {
        console.error("CAPACITOR BROWSER OPEN FAILED", error);
      }
    }

    window.open(sourceUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      className="button button-secondary"
      onClick={() => {
        void openReader();
      }}
      disabled={!url}
    >
      Read Full Article
    </button>
  );
}
