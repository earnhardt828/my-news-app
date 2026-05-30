export const VIDEO_RETURN_STATE_KEY = "graffiti-video-return-state";
export const VIDEO_RETURN_PENDING_KEY = "graffiti-video-return-pending";

import type { SharedVideoTab } from "./video-tabs";

export {
  AUTO_VIDEOS_DISABLED,
  CELEBRITY_VIDEOS_DISABLED,
  resolveVideoCategoryForMyNewsCategory,
  SHARED_VIDEO_CATEGORIES,
  TECH_VIDEOS_DISABLED,
  type SharedVideoTab,
} from "./video-tabs";

export type VideoReturnState = {
  path: string;
  scrollY: number;
  sortMode?:
    | "trending"
    | "mynews"
    | "polls"
    | "latest"
    | "local"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business";
  selectedLocalCity?: string | null;
  localLocationLabel?: string | null;
  tab?: SharedVideoTab;
  originLabel?: string | null;
};

function saveState(key: string, state: VideoReturnState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error("VIDEO RETURN STATE SAVE FAILED", error);
  }
}

function readState(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as VideoReturnState) : null;
  } catch (error) {
    console.error("VIDEO RETURN STATE READ FAILED", error);
    return null;
  }
}

export function saveVideoReturnState(state: VideoReturnState) {
  saveState(VIDEO_RETURN_STATE_KEY, state);
}

export function readVideoReturnState() {
  return readState(VIDEO_RETURN_STATE_KEY);
}

export function savePendingVideoReturnState(state: VideoReturnState) {
  saveState(VIDEO_RETURN_PENDING_KEY, state);
}

export function consumePendingVideoReturnState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(VIDEO_RETURN_PENDING_KEY);

    if (!rawValue) {
      return null;
    }

    window.sessionStorage.removeItem(VIDEO_RETURN_PENDING_KEY);
    return JSON.parse(rawValue) as VideoReturnState;
  } catch (error) {
    console.error("VIDEO RETURN PENDING READ FAILED", error);
    return null;
  }
}
