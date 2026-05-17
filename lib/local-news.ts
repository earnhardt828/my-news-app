export type LocalCityConfig = {
  cityKey: string;
  city: string;
  state: string;
  displayName: string;
  aliases: string[];
  sourceBoosts: string[];
  queries: string[];
  rssFeeds: string[];
};

export const LOCAL_CITY_CONFIGS: Record<string, LocalCityConfig> = {
  "Chicago, IL": {
    cityKey: "chicago-il",
    city: "Chicago",
    state: "IL",
    displayName: "Chicago, IL",
    aliases: ["chicago", "illinois", "cook county", "evanston", "oak park", "naperville"],
    sourceBoosts: [
      "chicago tribune",
      "wgn chicago",
      "wgn-tv",
      "abc7 chicago",
      "nbc chicago",
      "cbs chicago",
      "fox 32 chicago",
      "block club chicago",
      "wbez chicago",
    ],
    queries: [
      "Chicago Tribune",
      "WGN Chicago",
      "ABC7 Chicago",
      "NBC Chicago",
      "CBS Chicago",
      "Fox 32 Chicago",
      "Block Club Chicago",
      "WBEZ Chicago",
    ],
    rssFeeds: [
      "Chicago Tribune",
      "WGN Chicago",
      "ABC7 Chicago",
      "NBC Chicago",
      "CBS Chicago",
      "Fox 32 Chicago",
      "Block Club Chicago",
      "WBEZ Chicago",
    ],
  },
  "Los Angeles, CA": {
    cityKey: "los-angeles-ca",
    city: "Los Angeles",
    state: "CA",
    displayName: "Los Angeles, CA",
    aliases: [
      "los angeles",
      "la county",
      "hollywood",
      "pasadena",
      "santa monica",
      "burbank",
      "socal",
      "southern california",
    ],
    sourceBoosts: [
      "la times",
      "los angeles times",
      "ktla",
      "abc7 los angeles",
      "nbc los angeles",
      "cbs los angeles",
      "laist",
      "fox 11 los angeles",
      "spectrum news 1 socal",
    ],
    queries: [
      "LA Times",
      "KTLA",
      "ABC7 Los Angeles",
      "NBC Los Angeles",
      "CBS Los Angeles",
      "LAist",
      "FOX 11 Los Angeles",
      "Spectrum News 1 SoCal",
    ],
    rssFeeds: [
      "Los Angeles Times",
      "KTLA",
      "ABC7 Los Angeles",
      "NBC Los Angeles",
      "CBS Los Angeles",
      "LAist",
      "FOX 11 Los Angeles",
    ],
  },
  "New York, NY": {
    cityKey: "new-york-ny",
    city: "New York",
    state: "NY",
    displayName: "New York, NY",
    aliases: [
      "new york",
      "nyc",
      "manhattan",
      "brooklyn",
      "queens",
      "bronx",
      "staten island",
      "harlem",
      "long island city",
    ],
    sourceBoosts: [
      "ny1",
      "gothamist",
      "new york daily news",
      "nbc new york",
      "cbs new york",
      "abc7ny",
      "pix11",
      "the city nyc",
      "amny",
    ],
    queries: [
      "NY1",
      "Gothamist",
      "New York Daily News",
      "NBC New York",
      "CBS New York",
      "ABC7NY",
      "PIX11",
      "The City NYC",
      "AMNY",
    ],
    rssFeeds: [
      "Gothamist",
      "New York Daily News",
      "NBC New York",
      "CBS New York",
      "ABC7NY",
      "PIX11",
      "The City NYC",
      "AMNY",
    ],
  },
  "Atlanta, GA": {
    cityKey: "atlanta-ga",
    city: "Atlanta",
    state: "GA",
    displayName: "Atlanta, GA",
    aliases: ["atlanta", "georgia", "fulton county", "buckhead", "decatur"],
    sourceBoosts: [
      "atlanta journal-constitution",
      "ajc",
      "wsb-tv",
      "fox 5 atlanta",
      "11alive",
      "atlanta news first",
      "rough draft atlanta",
      "saportareport",
    ],
    queries: [
      "Atlanta Journal-Constitution",
      "AJC",
      "WSB-TV",
      "FOX 5 Atlanta",
      "11Alive",
      "Atlanta News First",
      "Rough Draft Atlanta",
      "SaportaReport",
    ],
    rssFeeds: ["Rough Draft Atlanta", "SaportaReport"],
  },
  "Houston, TX": {
    cityKey: "houston-tx",
    city: "Houston",
    state: "TX",
    displayName: "Houston, TX",
    aliases: ["houston", "texas", "harris county", "sugar land", "the heights", "katy"],
    sourceBoosts: [
      "houston chronicle",
      "khou",
      "abc13 houston",
      "fox 26 houston",
      "kprc",
      "kprc 2",
      "houston public media",
    ],
    queries: [
      "Houston Chronicle",
      "KHOU",
      "ABC13 Houston",
      "FOX 26 Houston",
      "KPRC 2",
      "Houston Public Media",
    ],
    rssFeeds: ["Houston Public Media"],
  },
  "Miami, FL": {
    cityKey: "miami-fl",
    city: "Miami",
    state: "FL",
    displayName: "Miami, FL",
    aliases: [
      "miami",
      "florida",
      "miami-dade",
      "south florida",
      "fort lauderdale",
      "wynwood",
      "brickell",
    ],
    sourceBoosts: [
      "miami herald",
      "wsvn",
      "wsvn miami",
      "nbc 6 south florida",
      "cbs miami",
      "local 10",
      "local 10 miami",
      "wlrn",
      "wlrn miami",
      "miami new times",
      "axios miami",
    ],
    queries: [
      "Miami Herald",
      "WSVN Miami",
      "NBC 6 South Florida",
      "CBS Miami",
      "Local 10 Miami",
      "WLRN Miami",
      "Miami New Times",
      "Axios Miami",
    ],
    rssFeeds: [
      "Miami Herald",
      "WSVN",
      "NBC 6 South Florida",
      "CBS Miami",
      "Local 10",
      "WLRN",
      "Miami New Times",
    ],
  },
  "Charlotte, NC": {
    cityKey: "charlotte-nc",
    city: "Charlotte",
    state: "NC",
    displayName: "Charlotte, NC",
    aliases: ["charlotte", "mecklenburg", "queen city", "gastonia", "rock hill", "fort mill"],
    sourceBoosts: [
      "charlotte observer",
      "wsoc-tv",
      "wsoc charlotte",
      "wbtv",
      "wcnc",
      "queen city news",
      "wfae",
      "axios charlotte",
      "wccb charlotte",
    ],
    queries: [
      "WSOC Charlotte",
      "WBTV Charlotte",
      "WCNC Charlotte",
      "Queen City News",
      "WFAE Charlotte",
      "Axios Charlotte",
      "Charlotte Observer",
      "WCCB Charlotte",
    ],
    rssFeeds: [
      "WSOC-TV",
      "WBTV",
      "WCNC",
      "Queen City News",
      "WFAE",
      "Axios Charlotte",
      "Charlotte Observer",
      "WCCB Charlotte",
    ],
  },
  "Cincinnati, OH": {
    cityKey: "cincinnati-oh",
    city: "Cincinnati",
    state: "OH",
    displayName: "Cincinnati, OH",
    aliases: ["cincinnati", "ohio", "hamilton county", "northern kentucky"],
    sourceBoosts: ["cincinnati enquirer", "wcpo", "wlwt", "fox19"],
    queries: ["Cincinnati Enquirer", "WCPO", "WLWT", "FOX19"],
    rssFeeds: [],
  },
  "Dallas, TX": {
    cityKey: "dallas-tx",
    city: "Dallas",
    state: "TX",
    displayName: "Dallas, TX",
    aliases: ["dallas", "fort worth", "dfw", "north texas", "plano", "arlington", "frisco"],
    sourceBoosts: [
      "dallas morning news",
      "wfaa",
      "nbc 5 dallas-fort worth",
      "cbs news texas",
      "fox 4 dallas",
    ],
    queries: [
      "Dallas Morning News",
      "WFAA",
      "NBC 5 Dallas-Fort Worth",
      "CBS News Texas",
      "FOX 4 Dallas",
    ],
    rssFeeds: [],
  },
  "Detroit, MI": {
    cityKey: "detroit-mi",
    city: "Detroit",
    state: "MI",
    displayName: "Detroit, MI",
    aliases: ["detroit", "michigan", "wayne county", "dearborn"],
    sourceBoosts: ["detroit free press", "detroit news", "wxyz", "clickondetroit", "fox 2 detroit"],
    queries: ["Detroit Free Press", "Detroit News", "WXYZ", "ClickOnDetroit", "FOX 2 Detroit"],
    rssFeeds: [],
  },
  "Minneapolis, MN": {
    cityKey: "minneapolis-mn",
    city: "Minneapolis",
    state: "MN",
    displayName: "Minneapolis, MN",
    aliases: ["minneapolis", "minnesota", "saint paul", "st paul", "twin cities"],
    sourceBoosts: ["star tribune", "kare 11", "wcco", "fox 9", "mpr news"],
    queries: ["Star Tribune", "KARE 11", "WCCO", "FOX 9", "MPR News"],
    rssFeeds: [],
  },
  "Phoenix, AZ": {
    cityKey: "phoenix-az",
    city: "Phoenix",
    state: "AZ",
    displayName: "Phoenix, AZ",
    aliases: ["phoenix", "arizona", "mesa", "tempe", "scottsdale"],
    sourceBoosts: ["arizona republic", "azfamily", "abc15 arizona", "fox 10 phoenix", "12news"],
    queries: ["Arizona Republic", "AZFamily", "ABC15 Arizona", "FOX 10 Phoenix", "12News"],
    rssFeeds: [],
  },
  "San Francisco, CA": {
    cityKey: "san-francisco-ca",
    city: "San Francisco",
    state: "CA",
    displayName: "San Francisco, CA",
    aliases: ["san francisco", "bay area", "oakland", "berkeley", "marin"],
    sourceBoosts: [
      "sf chronicle",
      "san francisco chronicle",
      "kqed",
      "abc7 bay area",
      "nbc bay area",
      "cbs news bay area",
      "kron4",
    ],
    queries: [
      "San Francisco Chronicle",
      "KQED",
      "ABC7 Bay Area",
      "NBC Bay Area",
      "CBS News Bay Area",
      "KRON4",
    ],
    rssFeeds: [],
  },
  "Philadelphia, PA": {
    cityKey: "philadelphia-pa",
    city: "Philadelphia",
    state: "PA",
    displayName: "Philadelphia, PA",
    aliases: ["philadelphia", "philly", "pennsylvania", "camden", "delco"],
    sourceBoosts: ["philadelphia inquirer", "6abc", "nbc10 philadelphia", "cbs philadelphia", "whyy"],
    queries: ["Philadelphia Inquirer", "6ABC", "NBC10 Philadelphia", "CBS Philadelphia", "WHYY"],
    rssFeeds: [],
  },
} as const;

export const DEFAULT_LOCAL_CITY = "New York, NY" as const;

export const SUPPORTED_LOCAL_CITIES = Object.values(LOCAL_CITY_CONFIGS);

export const SUPPORTED_LOCAL_CITY_NAMES = Object.keys(LOCAL_CITY_CONFIGS) as Array<
  keyof typeof LOCAL_CITY_CONFIGS
>;

function normalizeLocalText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function getLocalCityConfigByName(cityName: string | null | undefined) {
  if (!cityName) {
    return null;
  }

  const normalized = normalizeLocalText(cityName);
  return (
    Object.values(LOCAL_CITY_CONFIGS).find(
      (config) => normalizeLocalText(config.displayName) === normalized
    ) ?? null
  );
}

export function getLocalCityConfigByKey(cityKey: string | null | undefined) {
  const normalized = normalizeLocalText(cityKey);

  if (!normalized) {
    return null;
  }

  return (
    Object.values(LOCAL_CITY_CONFIGS).find(
      (config) => normalizeLocalText(config.cityKey) === normalized
    ) ?? null
  );
}

export function getLocalCityConfigByText(value: string | null | undefined) {
  const normalized = normalizeLocalText(value);

  if (!normalized) {
    return null;
  }

  return (
    Object.values(LOCAL_CITY_CONFIGS).find((config) => {
      const haystacks = [config.cityKey, config.displayName, config.city, config.state, ...config.aliases].map(
        normalizeLocalText
      );

      return haystacks.some((haystack) => normalized.includes(haystack) || haystack.includes(normalized));
    }) ?? null
  );
}

export function buildLocalNewsQueries(config: LocalCityConfig) {
  const baseQueries = [
    `${config.city} local news`,
    `${config.city} breaking news`,
    `${config.city} weather`,
    `${config.city} sports`,
  ];

  return [...baseQueries, ...config.queries];
}

export function buildLocalNewsQueryText(config: LocalCityConfig) {
  return buildLocalNewsQueries(config).join(" ");
}

export function splitLocalDisplayName(displayName: string) {
  const config = getLocalCityConfigByName(displayName);

  if (config) {
    return {
      city: config.city,
      state: config.state,
    };
  }

  const [city = "", state = ""] = displayName.split(",").map((value) => value.trim());
  return {
    city: city || null,
    state: state || null,
  };
}
