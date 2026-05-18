export type LocalCityConfig = {
  cityKey: string;
  city: string;
  state: string;
  displayName: string;
  searchQueries: string[];
  allowedSources: string[];
  sourceAliases: string[];
  strictTerms: string[];
  rssFeeds: string[];
};

export const LOCAL_CITY_CONFIGS: Record<string, LocalCityConfig> = {
  "Chicago, IL": {
    cityKey: "chicago-il",
    city: "Chicago",
    state: "IL",
    displayName: "Chicago, IL",
    searchQueries: [
      "Chicago local news",
      "Chicago Tribune",
      "WGN Chicago",
      "ABC7 Chicago",
      "NBC Chicago",
      "CBS Chicago",
      "Fox 32 Chicago",
      "Block Club Chicago",
      "WBEZ Chicago",
    ],
    allowedSources: [
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
    sourceAliases: [
      "chicago tribune",
      "wgn",
      "abc7 chicago",
      "nbc chicago",
      "cbs chicago",
      "fox 32",
      "block club chicago",
      "wbez",
    ],
    strictTerms: ["chicago", "illinois", "il", "cook county", "evanston", "oak park", "naperville"],
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
    searchQueries: [
      "Los Angeles local news",
      "LA Times",
      "KTLA",
      "ABC7 Los Angeles",
      "NBC Los Angeles",
      "CBS Los Angeles",
      "LAist",
      "FOX 11 Los Angeles",
      "Spectrum News 1 SoCal",
    ],
    allowedSources: [
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
    sourceAliases: [
      "la times",
      "los angeles times",
      "ktla",
      "abc7 los angeles",
      "nbc los angeles",
      "cbs los angeles",
      "laist",
      "fox 11",
      "socal",
      "spectrum news 1",
    ],
    strictTerms: [
      "los angeles",
      "la county",
      "hollywood",
      "pasadena",
      "santa monica",
      "burbank",
      "socal",
      "southern california",
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
    searchQueries: [
      "New York local news",
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
    allowedSources: [
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
    sourceAliases: [
      "ny1",
      "gothamist",
      "daily news",
      "nbc new york",
      "cbs new york",
      "abc7ny",
      "pix11",
      "the city",
      "amny",
    ],
    strictTerms: [
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
    searchQueries: [
      "Atlanta local news",
      "Atlanta Journal-Constitution",
      "AJC",
      "WSB-TV",
      "FOX 5 Atlanta",
      "11Alive",
      "Atlanta News First",
      "Rough Draft Atlanta",
      "SaportaReport",
    ],
    allowedSources: [
      "atlanta journal-constitution",
      "ajc",
      "wsb-tv",
      "fox 5 atlanta",
      "11alive",
      "atlanta news first",
      "rough draft atlanta",
      "saportareport",
    ],
    sourceAliases: [
      "atlanta journal-constitution",
      "ajc",
      "wsb-tv",
      "fox 5 atlanta",
      "11alive",
      "atlanta news first",
      "rough draft atlanta",
      "saportareport",
    ],
    strictTerms: ["atlanta", "georgia", "ga", "fulton county", "buckhead", "decatur"],
    rssFeeds: ["Rough Draft Atlanta", "SaportaReport"],
  },
  "Houston, TX": {
    cityKey: "houston-tx",
    city: "Houston",
    state: "TX",
    displayName: "Houston, TX",
    searchQueries: [
      "Houston local news",
      "Houston breaking news",
      "Houston Chronicle",
      "KHOU Houston",
      "ABC13 Houston",
      "FOX 26 Houston",
      "KPRC 2 Houston",
      "Houston Public Media",
    ],
    allowedSources: [
      "houston chronicle",
      "khou",
      "abc13",
      "abc13 houston",
      "fox 26",
      "fox 26 houston",
      "kprc",
      "kprc 2",
      "houston public media",
    ],
    sourceAliases: [
      "houston chronicle",
      "khou",
      "abc13 houston",
      "fox 26 houston",
      "kprc",
      "houston public media",
    ],
    strictTerms: ["houston", "harris county", "texas", "tx"],
    rssFeeds: ["Houston Public Media"],
  },
  "Miami, FL": {
    cityKey: "miami-fl",
    city: "Miami",
    state: "FL",
    displayName: "Miami, FL",
    searchQueries: [
      "Miami local news",
      "Miami breaking news",
      "Miami Herald",
      "WSVN Miami",
      "NBC 6 South Florida",
      "CBS Miami",
      "Local 10 Miami",
      "WLRN Miami",
      "Miami New Times",
      "Axios Miami",
    ],
    allowedSources: [
      "miami herald",
      "wsvn",
      "wsvn miami",
      "axios miami",
      "nbc 6",
      "nbc 6 south florida",
      "cbs miami",
      "local 10",
      "local 10 miami",
      "wlrn",
      "wlrn miami",
      "miami new times",
    ],
    sourceAliases: [
      "miami herald",
      "wsvn",
      "axios miami",
      "nbc 6",
      "cbs miami",
      "local 10",
      "wlrn",
      "miami new times",
      "south florida",
    ],
    strictTerms: ["miami", "miami-dade", "south florida", "florida", "fl"],
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
    searchQueries: [
      "Charlotte local news",
      "WSOC Charlotte",
      "WBTV Charlotte",
      "WCNC Charlotte",
      "Queen City News",
      "WFAE Charlotte",
      "Axios Charlotte",
      "Charlotte Observer",
      "WCCB Charlotte",
    ],
    allowedSources: [
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
    sourceAliases: [
      "charlotte observer",
      "wsoc",
      "wbtv",
      "wcnc",
      "queen city news",
      "wfae",
      "axios charlotte",
      "wccb",
      "queen city",
    ],
    strictTerms: ["charlotte", "north carolina", "nc", "mecklenburg", "queen city", "gastonia", "rock hill", "fort mill"],
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
    searchQueries: [
      "Cincinnati local news",
      "Cincinnati Enquirer",
      "WCPO",
      "WLWT",
      "FOX19",
    ],
    allowedSources: ["cincinnati enquirer", "wcpo", "wlwt", "fox19"],
    sourceAliases: ["cincinnati enquirer", "wcpo", "wlwt", "fox19"],
    strictTerms: ["cincinnati", "ohio", "oh", "hamilton county", "northern kentucky"],
    rssFeeds: [],
  },
  "Dallas, TX": {
    cityKey: "dallas-tx",
    city: "Dallas",
    state: "TX",
    displayName: "Dallas, TX",
    searchQueries: [
      "Dallas local news",
      "Dallas Morning News",
      "WFAA",
      "NBC 5 Dallas-Fort Worth",
      "CBS News Texas",
      "FOX 4 Dallas",
    ],
    allowedSources: [
      "dallas morning news",
      "wfaa",
      "nbc 5 dallas-fort worth",
      "cbs news texas",
      "fox 4 dallas",
    ],
    sourceAliases: [
      "dallas morning news",
      "wfaa",
      "nbc 5 dallas-fort worth",
      "cbs news texas",
      "fox 4 dallas",
      "dfw",
      "north texas",
    ],
    strictTerms: ["dallas", "texas", "tx", "fort worth", "dfw", "north texas", "plano", "arlington", "frisco"],
    rssFeeds: [],
  },
  "Detroit, MI": {
    cityKey: "detroit-mi",
    city: "Detroit",
    state: "MI",
    displayName: "Detroit, MI",
    searchQueries: [
      "Detroit local news",
      "Detroit Free Press",
      "Detroit News",
      "WXYZ",
      "ClickOnDetroit",
      "FOX 2 Detroit",
    ],
    allowedSources: ["detroit free press", "detroit news", "wxyz", "clickondetroit", "fox 2 detroit"],
    sourceAliases: ["detroit free press", "detroit news", "wxyz", "clickondetroit", "fox 2 detroit"],
    strictTerms: ["detroit", "michigan", "mi", "wayne county", "dearborn"],
    rssFeeds: [],
  },
  "Minneapolis, MN": {
    cityKey: "minneapolis-mn",
    city: "Minneapolis",
    state: "MN",
    displayName: "Minneapolis, MN",
    searchQueries: [
      "Minneapolis local news",
      "Star Tribune",
      "KARE 11",
      "WCCO",
      "FOX 9",
      "MPR News",
    ],
    allowedSources: ["star tribune", "kare 11", "wcco", "fox 9", "mpr news"],
    sourceAliases: ["star tribune", "kare 11", "wcco", "fox 9", "mpr"],
    strictTerms: ["minneapolis", "minnesota", "mn", "saint paul", "st paul", "twin cities"],
    rssFeeds: [],
  },
  "Phoenix, AZ": {
    cityKey: "phoenix-az",
    city: "Phoenix",
    state: "AZ",
    displayName: "Phoenix, AZ",
    searchQueries: [
      "Phoenix local news",
      "Arizona Republic",
      "AZFamily",
      "ABC15 Arizona",
      "FOX 10 Phoenix",
      "12News",
    ],
    allowedSources: ["arizona republic", "azfamily", "abc15 arizona", "fox 10 phoenix", "12news"],
    sourceAliases: ["arizona republic", "azfamily", "abc15", "fox 10 phoenix", "12news"],
    strictTerms: ["phoenix", "arizona", "az", "mesa", "tempe", "scottsdale"],
    rssFeeds: [],
  },
  "San Francisco, CA": {
    cityKey: "san-francisco-ca",
    city: "San Francisco",
    state: "CA",
    displayName: "San Francisco, CA",
    searchQueries: [
      "San Francisco local news",
      "San Francisco Chronicle",
      "KQED",
      "ABC7 Bay Area",
      "NBC Bay Area",
      "CBS News Bay Area",
      "KRON4",
    ],
    allowedSources: [
      "sf chronicle",
      "san francisco chronicle",
      "kqed",
      "abc7 bay area",
      "nbc bay area",
      "cbs news bay area",
      "kron4",
    ],
    sourceAliases: [
      "sf chronicle",
      "san francisco chronicle",
      "kqed",
      "abc7 bay area",
      "nbc bay area",
      "cbs news bay area",
      "kron4",
      "bay area",
    ],
    strictTerms: ["san francisco", "california", "ca", "bay area", "oakland", "berkeley", "marin"],
    rssFeeds: [],
  },
  "Philadelphia, PA": {
    cityKey: "philadelphia-pa",
    city: "Philadelphia",
    state: "PA",
    displayName: "Philadelphia, PA",
    searchQueries: [
      "Philadelphia local news",
      "Philadelphia Inquirer",
      "6ABC",
      "NBC10 Philadelphia",
      "CBS Philadelphia",
      "WHYY",
    ],
    allowedSources: ["philadelphia inquirer", "6abc", "nbc10 philadelphia", "cbs philadelphia", "whyy"],
    sourceAliases: ["philadelphia inquirer", "6abc", "nbc10 philadelphia", "cbs philadelphia", "whyy", "philly"],
    strictTerms: ["philadelphia", "philly", "pennsylvania", "pa", "camden", "delco"],
    rssFeeds: [],
  },
} as const;

export const DEFAULT_LOCAL_CITY = "Charlotte, NC" as const;

const ACTIVE_LOCAL_CITY_DISPLAY_NAMES = [
  "Charlotte, NC",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Phoenix, AZ",
] as const;

export const SUPPORTED_LOCAL_CITIES = ACTIVE_LOCAL_CITY_DISPLAY_NAMES.map(
  (displayName) => LOCAL_CITY_CONFIGS[displayName]
);

export const SUPPORTED_LOCAL_CITY_NAMES = Array.from(ACTIVE_LOCAL_CITY_DISPLAY_NAMES) as Array<
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
    SUPPORTED_LOCAL_CITIES.find(
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
    SUPPORTED_LOCAL_CITIES.find(
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
    SUPPORTED_LOCAL_CITIES.find((config) => {
      const haystacks = [
        config.cityKey,
        config.displayName,
        config.city,
        config.state,
        ...config.strictTerms,
        ...config.sourceAliases,
      ].map(normalizeLocalText);

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

  return [...baseQueries, ...config.searchQueries];
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
