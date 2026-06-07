import { Capacitor } from "@capacitor/core";

const GRAFFITI_PRODUCTION_ORIGIN = "https://graffiti.news";
const NEWS_API_BASE_URL = (process.env.NEXT_PUBLIC_NEWS_API_BASE_URL ?? "").trim();

type ApiFetchErrorDetails = {
  url: string;
  name?: string;
  message?: string;
  stack?: string;
  status?: number;
  responseText?: string;
};

class ApiFetchError extends Error {
  url: string;
  status?: number;
  responseText?: string;

  constructor(details: ApiFetchErrorDetails) {
    super(details.message || "API request failed");
    this.name = details.name || "ApiFetchError";
    this.url = details.url;
    this.status = details.status;
    this.responseText = details.responseText;
    if (details.stack) {
      this.stack = details.stack;
    }
  }
}

export function isNativeCapacitorRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (typeof Capacitor.isNativePlatform === "function" && Capacitor.isNativePlatform()) {
      return true;
    }
  } catch {
    // fall through to window-based detection
  }

  const fallbackCapacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: (() => boolean) | boolean };
  }).Capacitor;

  try {
    if (typeof fallbackCapacitor?.isNativePlatform === "function") {
      return Boolean(fallbackCapacitor.isNativePlatform());
    }

    if (typeof fallbackCapacitor?.isNativePlatform === "boolean") {
      return fallbackCapacitor.isNativePlatform;
    }
  } catch {
    return false;
  }

  return false;
}

export function getApiBaseOrigin() {
  if (typeof window === "undefined") {
    return "";
  }

  return isNativeCapacitorRuntime() ? GRAFFITI_PRODUCTION_ORIGIN : "";
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath.startsWith("/api/aggregated-news")) {
    if (NEWS_API_BASE_URL) {
      return `${NEWS_API_BASE_URL.replace(/\/+$/, "")}${normalizedPath}`;
    }

    return normalizedPath;
  }

  return `${getApiBaseOrigin()}${normalizedPath}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const url = buildApiUrl(path);
  const isNative = getApiBaseOrigin() === GRAFFITI_PRODUCTION_ORIGIN;

  try {
    const response = await fetch(url, {
      ...init,
      cache: isNative ? "no-store" : init?.cache,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const error = new ApiFetchError({
        url,
        name: "ApiResponseError",
        message: `Request failed with status ${response.status}`,
        status: response.status,
        responseText,
      });

      console.error("API fetch failed", {
        url,
        name: error.name,
        message: error.message,
        stack: error.stack,
        status: response.status,
        responseText,
      });

      throw error;
    }

    return response;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));

    console.error("API fetch failed", {
      url,
      name: normalizedError.name,
      message: normalizedError.message,
      stack: normalizedError.stack,
      status:
        normalizedError instanceof ApiFetchError
          ? normalizedError.status
          : undefined,
      responseText:
        normalizedError instanceof ApiFetchError
          ? normalizedError.responseText
          : undefined,
    });

    throw normalizedError;
  }
}
