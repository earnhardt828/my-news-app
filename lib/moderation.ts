const BANNED_SUBSTRINGS = [
  "bitch",
  "cunt",
  "fag",
  "faggot",
  "fuck",
  "hoe",
  "kike",
  "nigger",
  "nigga",
  "porn",
  "pussy",
  "rape",
  "rapist",
  "retard",
  "slut",
  "spic",
  "suicide",
  "whore",
];

const NORMALIZE_LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
};

function normalizeForModeration(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[013457@$]/g, (character) => NORMALIZE_LEET_MAP[character] ?? character)
    .replace(/[^a-z\s]/g, "");
}

function hasBannedSubstring(value: string) {
  const normalized = normalizeForModeration(value).replace(/\s+/g, "");

  return BANNED_SUBSTRINGS.some((term) => normalized.includes(term));
}

export function isUsernameAllowed(username: string) {
  return !hasBannedSubstring(username);
}

export function isCommentAllowed(comment: string) {
  return !hasBannedSubstring(comment);
}
