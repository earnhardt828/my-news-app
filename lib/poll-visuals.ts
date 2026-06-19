import { cleanDisplayText } from "./display-text";
import type { PollWithResults } from "./polls";

export const POLL_VISUAL_CATEGORIES = [
  "Politics",
  "World",
  "Business",
  "Technology",
  "Sports",
  "Movies",
  "Local",
  "Entertainment",
] as const;

export type PollVisualCategory = (typeof POLL_VISUAL_CATEGORIES)[number];

type PollVisualSpec = {
  label: string;
  accent: string;
  secondary: string;
  icon: string;
};

const POLL_VISUAL_LIBRARY: Record<PollVisualCategory, PollVisualSpec[]> = {
  Politics: [
    { label: "Capitol", accent: "#23395B", secondary: "#6D8AC9", icon: "◎" },
    { label: "Debate", accent: "#40213D", secondary: "#D15F8D", icon: "◌" },
    { label: "Ballot", accent: "#1C4F63", secondary: "#71C0D4", icon: "✓" },
    { label: "Podium", accent: "#4B3325", secondary: "#C88658", icon: "▲" },
    { label: "City Hall", accent: "#324563", secondary: "#8BA8DA", icon: "▦" },
  ],
  World: [
    { label: "Globe", accent: "#183E63", secondary: "#66B8D9", icon: "◍" },
    { label: "Flags", accent: "#4B2846", secondary: "#E08BA8", icon: "⚑" },
    { label: "Skyline", accent: "#21364A", secondary: "#8FB5D6", icon: "▥" },
    { label: "Summit", accent: "#214C58", secondary: "#6ED0C0", icon: "◈" },
    { label: "Map", accent: "#3C4021", secondary: "#B8D964", icon: "⌘" },
  ],
  Business: [
    { label: "Market", accent: "#153E2F", secondary: "#5ABF93", icon: "↗" },
    { label: "Office", accent: "#2A2F4F", secondary: "#8698E4", icon: "▣" },
    { label: "Money", accent: "#4A3A1A", secondary: "#D4B25A", icon: "$" },
    { label: "Storefront", accent: "#4B2A26", secondary: "#E08A7B", icon: "▤" },
    { label: "Skyscraper", accent: "#1D3343", secondary: "#88B4D1", icon: "▨" },
  ],
  Technology: [
    { label: "Circuit", accent: "#1A294C", secondary: "#5FC3FF", icon: "⌁" },
    { label: "Phone", accent: "#35225A", secondary: "#B18BFF", icon: "◫" },
    { label: "AI", accent: "#103B45", secondary: "#66E0D5", icon: "✦" },
    { label: "Laptop", accent: "#26313F", secondary: "#8BB1CF", icon: "▭" },
    { label: "Data Center", accent: "#213F31", secondary: "#7BDBA5", icon: "▤" },
  ],
  Sports: [
    { label: "Stadium", accent: "#4B221F", secondary: "#F2866B", icon: "◯" },
    { label: "Court", accent: "#6A2C1A", secondary: "#F6A55A", icon: "⟐" },
    { label: "Field", accent: "#234A2E", secondary: "#74D889", icon: "◫" },
    { label: "Fans", accent: "#24334A", secondary: "#8AAEF0", icon: "✹" },
    { label: "Scoreboard", accent: "#36214B", secondary: "#B987E6", icon: "#" },
  ],
  Movies: [
    { label: "Theater", accent: "#46201D", secondary: "#E28B6B", icon: "◉" },
    { label: "Popcorn", accent: "#574319", secondary: "#F0C25B", icon: "◍" },
    { label: "Film Reel", accent: "#1D1F3F", secondary: "#7A84E0", icon: "◎" },
    { label: "Red Carpet", accent: "#5B1F2C", secondary: "#E57491", icon: "✶" },
    { label: "Cinema Seats", accent: "#3C263D", secondary: "#C68DE1", icon: "▥" },
  ],
  Local: [
    { label: "Skyline", accent: "#23354A", secondary: "#85B1DA", icon: "▦" },
    { label: "Street", accent: "#4A3523", secondary: "#D4A36D", icon: "⌑" },
    { label: "Neighborhood", accent: "#36503C", secondary: "#90D6A0", icon: "▣" },
    { label: "Transit", accent: "#213E57", secondary: "#68C7E8", icon: "⇄" },
    { label: "Town Hall", accent: "#4A2830", secondary: "#E38B9A", icon: "◬" },
  ],
  Entertainment: [
    { label: "Stage", accent: "#472029", secondary: "#EA7E9B", icon: "✦" },
    { label: "Microphone", accent: "#4A2C1C", secondary: "#E7A06B", icon: "◌" },
    { label: "Concert", accent: "#241C4A", secondary: "#A28BFF", icon: "✹" },
    { label: "TV Studio", accent: "#1E3A4E", secondary: "#70CDE6", icon: "▭" },
    { label: "Premiere", accent: "#44351C", secondary: "#E8C26A", icon: "✶" },
  ],
};

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeVisualCategory(value: string | null | undefined): PollVisualCategory {
  const cleaned = cleanDisplayText(value ?? "").trim().toLowerCase();
  const match = POLL_VISUAL_CATEGORIES.find(
    (category) => category.toLowerCase() === cleaned
  );
  return match ?? "Entertainment";
}

function buildPollFallbackSvg(_category: PollVisualCategory, spec: PollVisualSpec) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${spec.accent}" />
          <stop offset="100%" stop-color="${spec.secondary}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="720" fill="url(#g)" />
      <circle cx="965" cy="155" r="140" fill="rgba(255,255,255,0.08)" />
      <circle cx="210" cy="520" r="190" fill="rgba(255,255,255,0.08)" />
      <circle cx="264" cy="236" r="116" fill="rgba(255,255,255,0.1)" />
      <circle cx="264" cy="236" r="78" fill="rgba(255,255,255,0.08)" />
      <path d="M210 236c28-52 82-84 138-84 30 0 58 8 82 22-22 58-76 100-140 100-28 0-54-8-80-22Z" fill="rgba(255,255,255,0.12)" />
      <rect x="110" y="114" width="300" height="220" rx="32" fill="rgba(255,255,255,0.06)" />
      <rect x="114" y="118" width="292" height="212" rx="28" fill="url(#g)" opacity="0.24" />
      <path d="M152 286c34-50 85-84 149-98 48-11 96-7 142 12" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="18" stroke-linecap="round"/>
      <path d="M160 212c42 28 88 44 136 48 58 5 112-8 162-38" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="14" stroke-linecap="round"/>
      <circle cx="228" cy="212" r="18" fill="rgba(255,255,255,0.16)" />
      <circle cx="332" cy="174" r="12" fill="rgba(255,255,255,0.12)" />
      <circle cx="386" cy="252" r="16" fill="rgba(255,255,255,0.14)" />
      <path d="M0 550 C210 470 360 620 560 555 S910 470 1200 610 L1200 720 L0 720 Z" fill="rgba(10,14,24,0.18)" />
      <path d="M0 600 C180 540 430 700 650 620 S1040 530 1200 650 L1200 720 L0 720 Z" fill="rgba(10,14,24,0.28)" />
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getPollFallbackImagePool(category: string | null | undefined) {
  const normalizedCategory = normalizeVisualCategory(category);
  return POLL_VISUAL_LIBRARY[normalizedCategory].map((spec) =>
    buildPollFallbackSvg(normalizedCategory, spec)
  );
}

export function getStablePollFallbackImage(input: {
  poll: Pick<PollWithResults, "id" | "question" | "category">;
  categoryOverride?: string | null;
  usedInRow?: Set<number>;
}) {
  const category = input.categoryOverride ?? input.poll.category;
  const pool = getPollFallbackImagePool(category);

  if (pool.length === 0) {
    return null;
  }

  const seed = `${input.poll.id}:${input.poll.question}:${category ?? ""}`;
  const preferredIndex = hashString(seed) % pool.length;
  let chosenIndex = preferredIndex;

  if (input.usedInRow?.has(chosenIndex) && input.usedInRow.size < pool.length) {
    for (let offset = 1; offset < pool.length; offset += 1) {
      const candidateIndex = (preferredIndex + offset) % pool.length;
      if (!input.usedInRow.has(candidateIndex)) {
        chosenIndex = candidateIndex;
        break;
      }
    }
  }

  input.usedInRow?.add(chosenIndex);
  return pool[chosenIndex] ?? null;
}
