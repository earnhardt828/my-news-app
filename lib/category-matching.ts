const TECH_STRONG_CONTEXT_PATTERN =
  /\b(tech|technology|ai|artificial intelligence|apple|google|microsoft|openai|nvidia|cybersecurity|software|startup|gadgets?|iphone|semiconductor|chip|robot|app|device|the verge|techcrunch|wired|cnet|engadget|ars technica|bloomberg technology|cnbc tech)\b/i;
const TECH_REJECTED_CONTEXT_PATTERN =
  /\b(sports?|nfl|nba|nhl|mlb|mls|celebrity|hollywood|recipe|travel|weather forecast|movie gossip|music video)\b/i;
const TECH_TAB_STRONG_CONTEXT_PATTERN =
  /\b(tech|technology|ai|artificial intelligence|apple|google|microsoft|openai|nvidia|cybersecurity|software|startup|gadgets?|iphone|semiconductor|chip|robot|app|device|the verge|techcrunch|wired|cnet|engadget|ars technica|bloomberg technology|cnbc tech)\b/i;
const TECH_TAB_TRUSTED_SOURCE_PATTERN =
  /\b(the verge|techcrunch|wired|cnet|engadget|ars technica|bloomberg technology|cnbc tech)\b/i;
const TECH_TAB_REJECTED_CONTEXT_PATTERN =
  /\b(espn|sports?|nba|nfl|mlb|nhl|mls|soccer|basketball|football|baseball)\b/i;
const TECH_TAB_POLITICS_CONTEXT_PATTERN =
  /\b(politics?|political|trump|biden|white house|congress|senate|supreme court|election|campaign|government|policy|president)\b/i;

const POLITICS_STRONG_CONTEXT_PATTERN =
  /\b(politics?|political|white house|trump|biden|congress|senate|house|supreme court|election|campaign|president|governor|mayor|policy|government|politico|pbs newshour|ap politics|associated press|reuters politics|reuters|cnn politics|cnn|fox news politics|fox news|nbc politics|nbc news|abc politics|abc news|cbs politics|cbs news|washington post politics|new york times politics|npr politics|the hill)\b/i;
const POLITICS_REJECTED_CONTEXT_PATTERN =
  /\b(sports?|nfl|nba|nhl|mlb|mls|celebrity|hollywood|food|recipe|travel|weather forecast|movie|music|gaming)\b/i;

const WORLD_STRONG_CONTEXT_PATTERN =
  /\b(world news|international|global|foreign affairs|europe|middle east|asia|africa|united nations|bbc|reuters|associated press|ap\b|al jazeera|dw news|france 24|sky news|cnn international|cnn world|reuters world|ap world|bbc world|npr world|new york times world|washington post world)\b/i;
const WORLD_REJECTED_CONTEXT_PATTERN =
  /\b(local sports|sportscenter|nfl|nba|nhl|mlb|mls|celebrity|hollywood|recipe|travel vlog|gaming|movie|music gossip|weather forecast)\b/i;

function hasStrictContext(
  values: Array<string | null | undefined>,
  strongPattern: RegExp,
  rejectedPattern: RegExp
) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  const hasStrongContext = strongPattern.test(haystack);
  const hasRejectedContext = rejectedPattern.test(haystack);

  if (!hasStrongContext) {
    return false;
  }

  if (hasRejectedContext && !hasStrongContext) {
    return false;
  }

  return true;
}

export function hasStrictTechnologyContext(values: Array<string | null | undefined>) {
  return hasStrictContext(values, TECH_STRONG_CONTEXT_PATTERN, TECH_REJECTED_CONTEXT_PATTERN);
}

export function hasTechnologyTabContext(values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  const hasStrongContext = TECH_TAB_STRONG_CONTEXT_PATTERN.test(haystack);
  const hasRejectedSportsContext = TECH_TAB_REJECTED_CONTEXT_PATTERN.test(haystack);
  const hasPoliticsContext = TECH_TAB_POLITICS_CONTEXT_PATTERN.test(haystack);

  if (hasRejectedSportsContext) {
    return false;
  }

  if (hasPoliticsContext && !hasStrongContext) {
    return false;
  }

  return hasStrongContext;
}

export function hasTechnologyTabTrustedSourceContext(values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();

  if (TECH_TAB_REJECTED_CONTEXT_PATTERN.test(haystack)) {
    return false;
  }

  return TECH_TAB_TRUSTED_SOURCE_PATTERN.test(haystack);
}

export function hasStrictPoliticsContext(values: Array<string | null | undefined>) {
  return hasStrictContext(values, POLITICS_STRONG_CONTEXT_PATTERN, POLITICS_REJECTED_CONTEXT_PATTERN);
}

export function hasStrictWorldContext(values: Array<string | null | undefined>) {
  return hasStrictContext(values, WORLD_STRONG_CONTEXT_PATTERN, WORLD_REJECTED_CONTEXT_PATTERN);
}
