import {
  hasStrictPoliticsContext,
  hasStrictTechnologyContext,
  hasTechnologyTabContext,
  hasTechnologyTabTierOneContext,
  hasTechnologyTabTierTwoContext,
  hasStrictWorldContext,
} from "./category-matching";

export type FilterableVideo = {
  title?: string | null;
  creator?: string | null;
  category?: string | null;
  watchUrl?: string | null;
  thumbnailUrl?: string | null;
  orientation?: "vertical" | "horizontal" | null;
};

function getVideoHaystack(video: FilterableVideo) {
  return [
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isStrictTechnologyVideo(video: FilterableVideo) {
  return hasStrictTechnologyContext([
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]);
}

export function isTechnologyTabVideo(video: FilterableVideo) {
  return hasTechnologyTabContext([
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]);
}

export function isTechnologyTierOneVideo(video: FilterableVideo) {
  return hasTechnologyTabTierOneContext([
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]);
}

export function isTechnologyTierTwoVideo(video: FilterableVideo) {
  return hasTechnologyTabTierTwoContext(video.title, [
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]);
}

export function isStrictPoliticsVideo(video: FilterableVideo) {
  return hasStrictPoliticsContext([
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]);
}

export function isStrictWorldVideo(video: FilterableVideo) {
  return hasStrictWorldContext([
    video.title,
    video.creator,
    video.category,
    video.watchUrl,
    video.thumbnailUrl,
  ]);
}

export function getTechnologyVideoScore(video: FilterableVideo) {
  const haystack = getVideoHaystack(video).toLowerCase();
  let score = 0;

  if (!isTechnologyTabVideo(video)) {
    return -1000;
  }

  if (isTechnologyTierOneVideo(video)) {
    score += 220;
  }

  if (isTechnologyTierTwoVideo(video)) {
    score += 120;
  }

  if (
    /(openai|nvidia|apple|google|microsoft|artificial intelligence|ai|cybersecurity|software|startup|semiconductor|iphone|gadgets?|cloud computing)/.test(
      haystack
    )
  ) {
    score += 165;
  }

  if (/(technology|tech|developer|device launch|chip|robot)/.test(haystack)) {
    score += 90;
  }

  if (
    /(the verge|techcrunch|wired|cnet|engadget|ars technica|bloomberg technology|cnbc tech|marques brownlee|mkbhd|linus tech tips|wsj tech)/.test(
      haystack
    )
  ) {
    score += 140;
  }

  if (video.category === "Tech") {
    score += 72;
  }

  if (video.orientation === "horizontal") {
    score += 50;
  }

  return score;
}

export function getPoliticsVideoScore(video: FilterableVideo) {
  const haystack = getVideoHaystack(video).toLowerCase();
  let score = 0;

  if (!isStrictPoliticsVideo(video)) {
    return -1000;
  }

  if (
    /(white house|congress|senate|supreme court|election|campaign|policy|government|president|politico|ap politics|reuters politics|cnn politics|fox news politics|nbc politics|abc politics|cbs politics)/.test(
      haystack
    )
  ) {
    score += 170;
  }

  if (/(politics|political|government|policy|campaign)/.test(haystack)) {
    score += 95;
  }

  if (video.category === "Politics") {
    score += 72;
  }

  if (video.orientation === "horizontal") {
    score += 40;
  }

  return score;
}

export function getWorldVideoScore(video: FilterableVideo) {
  const haystack = getVideoHaystack(video).toLowerCase();
  let score = 0;

  if (!isStrictWorldVideo(video)) {
    return -1000;
  }

  if (
    /(bbc|reuters|associated press|\bap\b|al jazeera|dw news|france 24|sky news|cnn international|united nations)/.test(
      haystack
    )
  ) {
    score += 165;
  }

  if (/(world news|international|global|foreign affairs|europe|middle east|asia|africa)/.test(haystack)) {
    score += 110;
  }

  if (video.category === "News") {
    score += 60;
  }

  if (video.orientation === "horizontal") {
    score += 40;
  }

  return score;
}
