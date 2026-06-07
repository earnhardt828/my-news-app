"use client";

import LoadingScreen from "./components/loading-screen";
import CategoryVideoRow from "./components/category-video-row";
import LargeImageArticleCard from "./components/large-image-article-card";
import PollCard from "./components/poll-card";
import SourceBadge from "./components/source-badge";
import SourceHeaderMark from "./components/source-header-mark";
import VideoFeedCard from "./components/video-feed-card";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createBlockedUser,
  listBlockedUsers,
  listMutuallyHiddenUserIds,
} from "../lib/blocked-users";
import { apiFetch, buildApiUrl } from "../lib/api-base";
import {
  buildStableArticleKey,
  isMissingCommentKeyColumnError,
} from "../lib/article-identity";
import {
  getBestArticleImage,
  isLikelyHighQualityArticleImage,
} from "../lib/article-images";
import { getArticleDisplayImage } from "../lib/article-display-image";
import { cleanDisplayText } from "../lib/display-text";
import {
  consumePendingArticleReturnState,
  saveArticleReturnState,
} from "../lib/article-navigation";
import {
  consumePendingVideoReturnState,
  saveVideoReturnState,
} from "../lib/video-navigation";
import {
  hasStrictBusinessContext,
  hasStrictPoliticsContext,
  hasStrictTechnologyContext,
  hasStrictWorldContext,
} from "../lib/category-matching";
import {
  FAVORITE_TEAMS_BY_LEAGUE,
  TEAM_PICKER_LEAGUES,
  type FavoriteLeagueKey,
  type FavoriteTeamOption,
} from "../lib/favorite-teams";
import { PODCAST_FEEDS, type PodcastFeedCategory } from "../lib/podcast-feeds";
import {
  applyPollVoteUpdate,
  getPollFeedScore,
  hydratePolls,
  type PollRecord,
  type PollWithResults,
} from "../lib/polls";
import { ensureProfileRow, saveProfilePatch } from "../lib/profile-store";
import { formatRelativeTimestamp } from "../lib/relative-time";
import {
  buildLocalNewsQueryText,
  DEFAULT_LOCAL_CITY,
  getLocalCityConfigByKey,
  getLocalCityConfigByName,
  getLocalCityConfigByText,
  LOCAL_CITY_CONFIGS,
  SUPPORTED_LOCAL_CITIES,
} from "../lib/local-news";
import { isCommentAllowed } from "../lib/moderation";
import { handleArticleCardActivation } from "../lib/open-article";
import {
  getSourceBoxLogoUrl,
  getSourceRectangleLogoUrl,
  hasMappedSourceLogo,
  slugifySourceName,
} from "../lib/source-logos";
import { supabase } from "../lib/supabase";
import { rankArticlesWithSourcePreferences } from "../lib/feed-ranking";
import {
  CATEGORY_OPTIONS,
  getCategoryImageUrl,
  getCategoryLabel,
  getDisplayCategory,
} from "../lib/categories";
import {
  AUTO_VIDEOS_DISABLED,
  CELEBRITY_VIDEOS_DISABLED,
  resolveVideoCategoryForMyNewsCategory,
  TECH_VIDEOS_DISABLED,
  type SharedVideoTab,
} from "../lib/video-navigation";
import { normalizeVideoFeedItems, type VideoApiItem, type VideoItem } from "../lib/video-feed";
import {
  isStrictPoliticsVideo,
  isStrictTechnologyVideo,
  isStrictWorldVideo,
} from "../lib/video-filters";
import { MY_NEWS_DISABLED, POLLS_DISABLED } from "../lib/feature-flags";

const FEED_PAGE_SIZE = 25;
const INITIAL_FEED_WARNING_MS = 4200;
const INITIAL_FEED_TIMEOUT_MS = 5000;
const DIRECT_ROUTE_TIMEOUT_MS = 10000;
const ARTICLE_METADATA_STORAGE_KEY = "graffiti-article-metadata-cache";
const SPORTS_UNIFIED_QUERY =
  "sports news | ESPN top headlines | NFL NBA MLB NHL MLS MMA sports news | NBA latest | ESPN NBA | NBA.com | Bleacher Report NBA | Yahoo Sports NBA | CBS Sports NBA | NBC Sports NBA | MLS news | Major League Soccer news | MLSsoccer.com | FC Cincinnati | ESPN MLS | The Athletic soccer | CBS Sports soccer | NBC Sports soccer | Yahoo Sports soccer | local MLS team news | ESPN | Bleacher Report | AP News Sports | AP Sports | Reuters Sports | BBC Sport | Motorsport.com | NASCAR.com | Big 12 Conference | HERO Sports | Dallas Cowboys official site | NHL.com | MLB.com | NFL.com | NBA.com | MLSsoccer.com | Yahoo Sports | NBC Sports | Fox Sports | CBS Sports latest | team official sports site | conference sports news";
const MLB_SECTION_ARTICLE_QUERIES = [
  "MLB news",
  "baseball news",
  "MLB.com latest",
  "ESPN MLB",
  "AP MLB",
  "Reuters MLB",
  "CBS Sports MLB",
  "NBC Sports MLB",
  "Fox Sports MLB",
  "Yahoo Sports MLB",
  "Bleacher Report MLB",
  "The Athletic MLB",
] as const;
const MLB_SECTION_VIDEO_QUERIES = [
  "MLB highlights",
  "baseball highlights",
  "MLB.com highlights",
  "ESPN MLB highlights",
  "MLB Network highlights",
  "Yankees highlights",
  "Dodgers highlights",
  "Braves highlights",
  "Astros highlights",
  "Rangers highlights",
  "home run highlights",
] as const;
const MY_NEWS_POLITICS_ARTICLE_QUERIES = [
  "politics",
  "AP Politics",
  "Reuters Politics",
  "Politico",
  "CNN Politics",
  "Fox News Politics",
  "White House",
  "Congress",
] as const;
const MY_NEWS_AUTO_ARTICLE_QUERIES = [
  "Automotive News",
  "Car and Driver",
  "MotorTrend",
  "Edmunds",
  "Autoblog",
  "The Drive",
  "InsideEVs",
  "Electrek",
  "Green Car Reports",
  "Reuters auto industry",
  "AP auto industry",
  "Tesla news",
  "EV news",
  "new car releases",
  "automotive technology",
  "auto industry news",
] as const;
const MY_NEWS_SPORTS_ARTICLE_QUERIES = [
  "sports",
  "AP Sports",
  "Reuters Sports",
  "ESPN",
  "CBS Sports",
  "NBC Sports",
  "Fox Sports",
  "Yahoo Sports",
  "Bleacher Report",
] as const;
const MY_NEWS_BUSINESS_ARTICLE_QUERIES = [
  "business",
  "AP Business",
  "Reuters Business",
  "Bloomberg",
  "CNBC",
  "Wall Street Journal",
  "Yahoo Finance",
  "stock market news",
] as const;
const MY_NEWS_WEATHER_ARTICLE_QUERIES = [
  "Weather Channel",
  "Fox Weather",
  "NOAA",
  "AccuWeather",
  "severe weather",
  "hurricane news",
  "tornado news",
  "winter storm news",
  "flood news",
  "Reuters weather",
  "AP weather",
] as const;
const MY_NEWS_TRAVEL_ARTICLE_QUERIES = [
  "travel news",
  "Travel + Leisure",
  "Conde Nast Traveler",
  "Lonely Planet",
  "tourism news",
  "airline news",
  "hotel news",
  "destination travel",
  "Reuters travel",
  "AP travel",
] as const;
const MY_NEWS_GOLF_ARTICLE_QUERIES = [
  "PGA Tour",
  "LPGA news",
  "Golf Channel",
  "ESPN Golf",
  "CBS Sports Golf",
  "NBC Sports Golf",
  "AP Golf",
  "Reuters Golf",
] as const;
const MY_NEWS_SCIENCE_ARTICLE_QUERIES = [
  "NASA",
  "Science Magazine",
  "Nature",
  "Scientific American",
  "Live Science",
  "Space.com",
  "Reuters Science",
  "AP Science",
] as const;
const COLLEGE_BASKETBALL_ARTICLE_QUERIES = [
  "college basketball news",
  "NCAA basketball news",
  "ESPN college basketball",
  "CBS Sports college basketball",
  "Fox Sports college basketball",
  "The Athletic college basketball",
  "Yahoo Sports college basketball",
  "AP college basketball",
  "Reuters college basketball",
  "March Madness",
  "Final Four",
  "NCAA tournament",
  "ACC basketball",
  "SEC basketball",
  "Big Ten basketball",
  "Big 12 basketball",
] as const;
const MY_NEWS_WORLD_ARTICLE_QUERIES = [
  "world news",
  "international news",
  "Reuters World",
  "AP World",
  "BBC World",
  "CNN World",
  "Al Jazeera",
  "DW News",
  "France 24",
  "NPR World",
  "New York Times World",
  "Washington Post World",
] as const;
const POLITICS_LARGE_CARD_FALLBACK_IMAGE = "/category-images/politics.png";
const NHL_SECTION_ARTICLE_QUERIES = [
  "NHL news",
  "hockey news",
  "NHL.com latest",
  "ESPN NHL",
  "Sportsnet NHL",
  "The Hockey News",
  "TSN Hockey",
  "AP NHL",
  "Reuters NHL",
  "CBS Sports NHL",
  "NBC Sports NHL",
  "Yahoo Sports NHL",
  "Bleacher Report NHL",
] as const;
const NHL_SECTION_VIDEO_QUERIES = [
  "NHL highlights today",
  "NHL playoff highlights",
  "NHL.com highlights",
  "ESPN NHL highlights",
  "hockey highlights",
  "Stanley Cup highlights",
  "NHL Network highlights",
] as const;
const MLS_SECTION_ARTICLE_QUERIES = [
  "MLS news",
  "Major League Soccer news",
  "MLSsoccer.com latest",
  "ESPN Soccer",
  "ESPN MLS",
  "CBS Sports Golazo",
  "NBC Sports Soccer",
  "Fox Sports Soccer",
  "Yahoo Sports Soccer",
  "The Athletic Soccer",
  "FC Cincinnati",
  "Charlotte FC",
  "Inter Miami",
  "LAFC",
  "Atlanta United",
  "Seattle Sounders",
  "MLS standings",
  "MLS transfer news",
] as const;
const NBA_SECTION_ARTICLE_QUERIES = [
  "NBA news",
  "NBA playoffs",
  "NBA Finals",
  "ESPN NBA",
  "NBA.com",
  "AP NBA",
  "Reuters NBA",
  "CBS Sports NBA",
  "NBC Sports NBA",
  "Fox Sports NBA",
  "Yahoo Sports NBA",
  "Bleacher Report NBA",
  "The Athletic NBA",
] as const;
const NBA_SECTION_VIDEO_QUERIES = [
  "NBA highlights today",
  "NBA.com highlights",
  "ESPN NBA highlights",
  "TNT NBA highlights",
  "NBA on ESPN",
  "basketball highlights",
  "dunk highlights",
  "buzzer beater",
  "NBA playoff highlights",
  "NBA Finals highlights",
] as const;
const NFL_SECTION_ARTICLE_QUERIES = [
  "NFL.com",
  "ESPN NFL",
  "AP NFL",
  "Reuters NFL",
  "CBS Sports NFL",
  "NBC Sports NFL",
  "Fox Sports NFL",
  "Yahoo Sports NFL",
  "Bleacher Report NFL",
  "Sports Illustrated NFL",
  "The Athletic NFL",
  "NFL draft",
  "NFL injuries",
  "NFL offseason",
  "NFL training camp",
  "NFL teams",
] as const;
const NFL_SECTION_VIDEO_QUERIES = [
  "NFL highlights",
  "NFL Network highlights",
  "ESPN NFL highlights",
  "football highlights",
  "touchdown highlights",
  "Cowboys highlights",
  "Panthers highlights",
  "Chiefs highlights",
  "Eagles highlights",
  "NFL.com videos",
] as const;
const FIGHTING_SECTION_ARTICLE_QUERIES = [
  "UFC news",
  "MMA news",
  "WWE news",
  "boxing news",
  "combat sports news",
  "ESPN MMA",
  "ESPN Boxing",
  "UFC.com",
  "MMA Fighting",
  "Bloody Elbow",
  "BoxingScene",
  "DAZN Boxing",
  "WWE.com",
  "WrestleZone",
] as const;
const ENTERTAINMENT_SECTION_ARTICLE_QUERIES = [
  "Entertainment Weekly",
  "People entertainment",
  "E! News entertainment",
  "Entertainment Tonight",
  "The Hollywood Reporter",
  "Deadline entertainment",
  "Page Six celebrity",
  "Us Weekly celebrity",
  "Rolling Stone music",
  "Vulture tv",
  "IndieWire movies",
  "Screen Rant movies",
  "Collider movies",
  "TheWrap entertainment",
  "Hollywood Life celebrity",
  "Access Hollywood",
  "Extra entertainment",
  "Just Jared celebrity",
  "Pitchfork music",
  "Complex music",
  "NME music",
  "TVLine tv",
  "Deadline TV",
  "Variety TV",
  "Billboard Music",
  "Rolling Stone Music",
] as const;
const ENTERTAINMENT_MUSIC_QUERIES = [
  "Billboard Music",
  "Rolling Stone Music",
  "Pitchfork",
  "NME",
  "Consequence",
  "Stereogum",
  "Complex Music",
  "Variety Music",
  "Grammy news",
  "album release news",
  "concert tour news",
  "music industry news",
] as const;
const ENTERTAINMENT_TV_QUERIES = [
  "TVLine",
  "Deadline TV",
  "Variety TV",
  "Hollywood Reporter TV",
  "Netflix news",
  "HBO news",
  "Max news",
  "Hulu news",
  "Disney+ news",
  "Prime Video news",
  "television news",
] as const;
const ENTERTAINMENT_CELEBRITY_QUERIES = [
  "People celebrity",
  "Entertainment Tonight celebrity",
  "E! News celebrity",
  "Access Hollywood celebrity",
  "Extra celebrity",
  "Us Weekly celebrity",
  "People",
  "Entertainment Tonight",
  "E! News",
  "Access Hollywood",
  "Extra",
  "Hollywood Life",
  "Just Jared",
  "TMZ",
  "Page Six",
  "Us Weekly",
] as const;
const ENTERTAINMENT_GOSSIP_QUERIES = [
  "Page Six celebrity",
  "TMZ celebrity",
  "Us Weekly celebrity",
  "People celebrity",
  "E! News celebrity",
  "dating rumor celebrity",
  "red carpet celebrity",
  "Hollywood breakup news",
  "Just Jared celebrity",
] as const;
const ENTERTAINMENT_MOVIES_QUERIES = [
  "Variety Movies",
  "Deadline Movies",
  "IndieWire",
  "Collider",
  "Screen Rant",
  "Hollywood Reporter Movies",
  "box office news",
  "movie trailer news",
  "film industry news",
] as const;
const ENTERTAINMENT_SECTION_VIDEO_QUERIES = {
  gossip: ["TMZ celebrity", "Page Six celebrity", "Us Weekly celebrity", "E! News celebrity"],
  music: ["Billboard Music", "Rolling Stone Music", "Pitchfork", "NME", "concert tour news"],
  tv: ["TVLine", "Deadline TV", "Variety TV", "Netflix series", "HBO series"],
  celebrity: ["People celebrity", "Entertainment Tonight", "Access Hollywood", "Extra celebrity"],
  movies: ["Variety Movies", "Deadline Movies", "IndieWire", "Collider", "movie trailer news"],
} as const;
const MY_NEWS_NASCAR_ARTICLE_QUERIES = [
  "NASCAR news",
  "NASCAR Cup Series news",
  "NASCAR race recap",
  "NASCAR.com",
  "Motorsport.com NASCAR",
  "Jayski NASCAR",
  "NBC Sports NASCAR",
  "Fox Sports NASCAR",
  "ESPN NASCAR",
  "AP NASCAR",
  "Charlotte Motor Speedway NASCAR",
] as const;
const MY_NEWS_MLB_ARTICLE_QUERIES = [
  "MLB.com",
  "ESPN MLB",
  "CBS Sports MLB",
  "NBC Sports MLB",
  "Fox Sports MLB",
  "Yahoo Sports MLB",
  "AP MLB",
  "Reuters MLB",
  "Bleacher Report MLB",
  "The Athletic MLB",
  "Baseball America",
  "MLB latest news",
  "baseball news",
  "MLB trade rumors",
  "MLB injury news",
] as const;
const MY_NEWS_NASCAR_VIDEO_QUERIES = [
  "NASCAR highlights this week",
  "NASCAR Cup Series highlights",
  "NASCAR race recap",
  "NASCAR on FOX highlights",
  "NBC Sports NASCAR highlights",
  "NASCAR crash highlights",
  "Daytona highlights",
  "Talladega highlights",
] as const;
const MY_NEWS_MLB_VIDEO_QUERIES = [
  "MLB highlights today",
  "MLB highlights this week",
  "MLB Network",
  "MLB Network highlights",
  "MLB.com highlights",
  "ESPN MLB highlights",
  "baseball highlights today",
  "home run highlights",
  "Yankees highlights",
  "Dodgers highlights",
  "Braves highlights",
  "Astros highlights",
  "Rangers highlights",
] as const;
const MLB_VIDEOS_DISABLED = true;
const NFL_VIDEOS_DISABLED = true;
const NHL_VIDEOS_DISABLED = true;
const MLS_VIDEOS_DISABLED = true;
const COLLEGE_BASKETBALL_VIDEOS_DISABLED = true;
const NASCAR_VIDEOS_DISABLED = true;
const SPORTS_SCORE_CARDS_DISABLED = true;
const TRENDING_SCORE_CARDS_DISABLED = true;
const TRENDING_AUTO_DISABLED = true;
const TRENDING_SPORTS_DISABLED = true;
const FEATURED_SPORTS_DISABLED = true;
const BUSINESS_STOCK_TICKER_DISABLED = false;
const MY_NEWS_CATEGORY_CACHE_VERSION = "mlb-dedicated-v3";

function buildNhlFallbackVideos(): VideoItem[] {
  return [
    {
      id: "nhl-fallback-1",
      youtubeId: "nhl-fallback-1",
      title: "NHL highlights and top goals",
      creator: "NHL.com",
      category: "Sports",
      orientation: "vertical",
      views: 0,
      likes: 0,
      comments: 0,
      thumbnailUrl: null,
      publishedAt: null,
      watchUrl: "https://www.nhl.com/video/",
      embedUrl: "",
      fallback: true,
      saved: false,
      liked: false,
      theme: "video-card-theme-rose",
    },
    {
      id: "nhl-fallback-2",
      youtubeId: "nhl-fallback-2",
      title: "Stanley Cup playoff highlights",
      creator: "ESPN NHL",
      category: "Sports",
      orientation: "vertical",
      views: 0,
      likes: 0,
      comments: 0,
      thumbnailUrl: null,
      publishedAt: null,
      watchUrl: "https://www.espn.com/nhl/",
      embedUrl: "",
      fallback: true,
      saved: false,
      liked: false,
      theme: "video-card-theme-ink",
    },
  ];
}

function buildNflFallbackVideos(): VideoItem[] {
  return [
    {
      id: "nfl-fallback-1",
      youtubeId: "nfl-fallback-1",
      title: "NFL highlights and top touchdowns",
      creator: "NFL.com",
      category: "Sports",
      orientation: "vertical",
      views: 0,
      likes: 0,
      comments: 0,
      thumbnailUrl: null,
      publishedAt: null,
      watchUrl: "https://www.nfl.com/videos/",
      embedUrl: "",
      fallback: true,
      saved: false,
      liked: false,
      theme: "video-card-theme-rose",
    },
    {
      id: "nfl-fallback-2",
      youtubeId: "nfl-fallback-2",
      title: "Football highlights from around the league",
      creator: "ESPN NFL",
      category: "Sports",
      orientation: "vertical",
      views: 0,
      likes: 0,
      comments: 0,
      thumbnailUrl: null,
      publishedAt: null,
      watchUrl: "https://www.espn.com/nfl/",
      embedUrl: "",
      fallback: true,
      saved: false,
      liked: false,
      theme: "video-card-theme-ink",
    },
  ];
}

function normalizeSelectedCategoryName(category: string) {
  const cleaned = cleanDisplayText(category).trim();
  const normalizedLower = cleaned.toLowerCase();

  if (!cleaned) {
    return "";
  }

  if (normalizedLower === "technology") {
    return "Tech";
  }

  if (normalizedLower === "cars") {
    return "Auto";
  }

  if (
    normalizedLower === "baseball" ||
    normalizedLower === "major league baseball"
  ) {
    return "MLB";
  }

  if (normalizedLower === "soccer") {
    return "MLS";
  }

  if (normalizedLower === "college basketball") {
    return "College Basketball";
  }

  if (normalizedLower === "college football") {
    return "College Football";
  }

  const directMatch = CATEGORY_OPTIONS.find(
    (option) => option.toLowerCase() === cleaned.toLowerCase()
  );

  if (directMatch) {
    return directMatch;
  }

  const labelMatch = CATEGORY_OPTIONS.find(
    (option) => getCategoryLabel(option).toLowerCase() === cleaned.toLowerCase()
  );

  if (labelMatch) {
    return labelMatch;
  }

  return cleaned;
}

function normalizeSelectableCategories(nextCategories: string[]) {
  return Array.from(
    new Set(
      nextCategories
        .map((category) => normalizeSelectedCategoryName(category))
        .filter((category): category is string => CATEGORY_OPTIONS.includes(category as (typeof CATEGORY_OPTIONS)[number]))
    )
  );
}

function isDedicatedMlbCategory(category: string) {
  const normalized = normalizeSelectedCategoryName(category);
  const slug = normalized.toLowerCase().replace(/\s+/g, "-");
  return normalized === "MLB" || slug === "baseball" || slug === "major-league-baseball";
}

function getArticleProviderLabel(provider: string | null | undefined) {
  const normalizedProvider = cleanDisplayText(provider ?? "").trim().toLowerCase();

  if (normalizedProvider === "gnews") {
    return "GNEWS";
  }

  if (normalizedProvider === "guardian") {
    return "GUARDIAN";
  }

  if (normalizedProvider === "nyt") {
    return "NYT";
  }

  if (normalizedProvider === "currents") {
    return "CURRENTS";
  }

  return "CURRENT";
}
const CELEBRITY_FEED_QUERY =
  "entertainment news | celebrity news | celebrity gossip | Hollywood news | music celebrity news | TMZ | People | Entertainment Tonight | Access Hollywood | Extra | Deadline | Entertainment Weekly | E! News | Variety | The Hollywood Reporter | Page Six | Us Weekly | Billboard | Rolling Stone | Vulture | IndieWire | Screen Rant | Collider | TheWrap | Hollywood Life | Pitchfork | Complex | NME | TVLine | Deadline TV | Variety TV | Billboard Music | Rolling Stone Music";
const TECHNOLOGY_FEED_QUERY =
  "technology news | AI news | tech startups | Apple news | Google news | Microsoft news | cybersecurity news | social media news | The Verge | TechCrunch | Wired | Ars Technica | Engadget | CNET | CNBC Tech | Bloomberg Technology";
const TRAVEL_FEED_QUERY =
  "travel news | airline news | airport news | cruise news | tourism news | travel warning | travel advisory | hotel news | vacation travel news | Travel + Leisure | Condé Nast Traveler | AFAR | Skift | The Points Guy | CNN Travel | National Geographic Travel | Lonely Planet | USA Today Travel";
const FOOD_FEED_QUERY =
  "food news | restaurant news | fast food news | food safety | grocery news | recipes news | dining news | Eater | Food & Wine | Bon Appétit | Serious Eats | Restaurant Business | Food Network | CNN Food | USA Today Food";
const SCIENCE_FEED_QUERY =
  "science news | NASA news | space news | astronomy news | climate science | physics news | biology research | medical research | Scientific American | Nature | Science Magazine | Live Science | Space.com | National Geographic science | AP Science | Reuters Science";
const OPINION_FEED_QUERY =
  "Wall Street Journal Opinion | New York Times Opinion | Washington Post Opinions | Bloomberg Opinion | The Atlantic | National Review | The Hill Opinion | USA Today Opinion | Reuters Analysis | AP Analysis | Financial Times Opinion";
const CRIME_FEED_QUERY =
  "crime news | breaking crime news | public safety news | court case news | police investigation news | AP crime | Reuters crime | CNN crime | NBC News crime | ABC News crime | CBS News crime | USA Today crime | local crime";
const ART_FEED_QUERY =
  "art news | museum news | gallery news | public art | art exhibition | contemporary art | arts culture | ArtNews | Hyperallergic | The Art Newspaper | Smithsonian arts | Guardian art | NYT arts";
const TOPIC_IMAGE_FILENAMES = [
  "africa.png",
  "africas.png",
  "ai.png",
  "ai1.png",
  "air-travel.png",
  "baseball.png",
  "blue-jays.png",
  "brokerages.png",
  "chicago-weather.png",
  "dodgers.png",
  "eagles.png",
  "ebola.png",
  "economists.png",
  "economy.png",
  "economy1.png",
  "farmers.png",
  "fifa.png",
  "finance.png",
  "flash-flood.png",
  "flash-flooding.png",
  "flash-floods.png",
  "flooding.png",
  "floods.png",
  "hot-weather.png",
  "hurricane-ian.png",
  "hurricane.png",
  "hurricane1.png",
  "hurricane2.png",
  "ice-cream.png",
  "influencer.png",
  "influencers.png",
  "iran-war.png",
  "iran.png",
  "lightning.png",
  "meteor.png",
  "los-angeles-dodgers.png",
  "orioles.png",
  "philadelphia-eagles.png",
  "rocket.png",
  "rockies.png",
  "san-francisco-giants.png",
  "science.png",
  "scientist.png",
  "scientists.png",
  "sp500.png",
  "storms.png",
  "thunderstorm.png",
  "tornado-warning.png",
  "tornado.png",
  "tornado1.png",
  "tornado2.png",
  "travel-advisory.png",
  "trump.png",
  "trump1.png",
  "trumps.png",
  "ukraine-war.png",
  "ukraine.png",
  "wall-st.png",
  "wall-street.png",
  "who.png",
  "winter-storm.png",
  "wnba.png",
  "world-cup.png",
  "yankees.png",
] as const;

const TOPIC_FALLBACK_IMAGE_GROUPS: TopicFallbackGroup[] = [
  {
    keyword: "trump",
    pattern: /\b(trump|donald trump|trump administration)\b/i,
    imageKey: "trump",
  },
  {
    keyword: "hurricane",
    pattern: /\b(hurricane|storm surge|tropical storm|cyclone)\b/i,
    imageKey: "hurricane",
  },
  {
    keyword: "floods",
    pattern: /\b(flood|flooding|flash flood)\b/i,
    imageKey: "floods",
  },
  {
    keyword: "tornado",
    pattern: /\b(tornado|twister)\b/i,
    imageKey: "tornado",
  },
  {
    keyword: "winter-storm",
    pattern: /\b(winter storm|blizzard|ice storm|snowstorm)\b/i,
    imageKey: "winter-storm",
  },
  {
    keyword: "hot-weather",
    pattern: /\b(heat wave|extreme heat|hot weather)\b/i,
    imageKey: "hot-weather",
  },
  {
    keyword: "ukraine",
    pattern: /\b(ukraine|ukraine war|russia-ukraine)\b/i,
    imageKey: "ukraine",
  },
  {
    keyword: "who",
    pattern: /\b(world health organization|who|ebola)\b/i,
    imageKey: "who",
  },
  {
    keyword: "economy",
    pattern: /\b(economy|inflation|interest rates|federal reserve|markets?)\b/i,
    imageKey: "economy",
  },
  {
    keyword: "farmers",
    pattern: /\b(farmers|farming|agriculture)\b/i,
    imageKey: "farmers",
  },
  {
    keyword: "world-cup",
    pattern: /\b(world cup)\b/i,
    imageKey: "world-cup",
  },
  {
    keyword: "dodgers",
    pattern: /\b(los angeles dodgers|dodgers)\b/i,
    imageKey: "dodgers",
  },
  {
    keyword: "eagles",
    pattern: /\b(philadelphia eagles|eagles)\b/i,
    imageKey: "eagles",
  },
] as const;
const AUTO_FEED_QUERY =
  "car industry news | EV news | auto reviews | car technology | autonomous driving | new vehicle launches | Tesla news | Ford news | GM news | Toyota news | Honda news | BMW news | Mercedes news | Rivian news | Lucid news | Hyundai news | Kia news | Volkswagen news | auto safety | electric vehicle news";
const BUSINESS_FEED_QUERY =
  "business news | finance news | stock market news | economy news | Wall Street news | CNBC | Bloomberg | Reuters Business | MarketWatch | Yahoo Finance";
const MY_NEWS_CATEGORY_VIDEO_QUERIES: Partial<Record<string, string[]>> = {
  NASCAR: [
    "NASCAR highlights",
    "NASCAR Cup Series highlights",
    "NASCAR crash highlights",
    "NASCAR race recap",
    "NASCAR playoff highlights",
    "Daytona highlights",
    "Talladega highlights",
  ],
  MLB: [
    "MLB highlights",
    "baseball highlights",
    "MLB Network highlights",
    "MLB.com highlights",
    "Yankees Dodgers Braves Astros Rangers highlights",
  ],
  NFL: [
    "NFL highlights",
    "NFL Network highlights",
    "ESPN NFL highlights",
    "touchdown highlights",
    "Cowboys Panthers Chiefs Eagles highlights",
  ],
  MLS: [
    "MLS highlights",
    "MLSsoccer highlights",
    "soccer highlights",
    "Charlotte FC highlights",
    "FC Cincinnati highlights",
    "Inter Miami highlights",
  ],
  "College Basketball": [
    "college basketball highlights",
    "NCAA basketball highlights",
    "March Madness highlights",
  ],
  NHL: [
    "NHL highlights",
    "hockey highlights",
    "Stanley Cup highlights",
    "NHL Network highlights",
    "NHL.com highlights",
  ],
  Technology: [
    "technology news",
    "AI news",
    "Apple tech news",
    "Google AI news",
    "cybersecurity news",
    "gadgets review",
  ],
  Tech: [
    "technology news",
    "AI news",
    "Apple tech news",
    "Google AI news",
    "cybersecurity news",
    "gadgets review",
  ],
  Celebrity: [
    "E News celebrity",
    "Entertainment Tonight celebrity",
    "People celebrity",
    "TMZ celebrity",
    "Hollywood Reporter celebrity",
    "red carpet interviews",
  ],
  Food: [
    "recipe video",
    "cooking video",
    "Food Network recipe",
    "Bon Appetit cooking",
    "restaurant review",
  ],
  Auto: [
    "Automotive News",
    "Car and Driver",
    "MotorTrend",
    "Edmunds",
    "Autoblog",
    "The Drive",
    "InsideEVs",
    "Electrek",
    "Green Car Reports",
    "Reuters auto industry",
    "AP auto industry",
    "Tesla news",
    "EV news",
    "new car releases",
    "automotive technology",
  ],
};
const MAJOR_WEATHER_CITY_SUGGESTIONS = [
  "Charlotte, NC",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Miami, FL",
  "Atlanta, GA",
  "Dallas, TX",
  "Phoenix, AZ",
  "San Diego, CA",
  "Philadelphia, PA",
  "Austin, TX",
] as const;
const BREAKING_NEWS_FEED_QUERY =
  "breaking news | live updates | developing story | latest news | AP breaking news | Reuters breaking news | CNN breaking news | NBC News breaking | ABC News breaking | CBS News breaking | BBC breaking news";
const BREAKING_NEWS_TRUSTED_SOURCES = [
  "AP News",
  "Reuters",
  "CNN",
  "Fox News",
  "BBC News",
  "NBC News",
  "CBS News",
  "ABC News",
  "The New York Times",
  "The Washington Post",
  "The Guardian",
  "PBS",
  "PBS NewsHour",
  "Politico",
  "Bloomberg",
  "NPR",
  "USA Today",
  "Al Jazeera",
] as const;
const BREAKING_NEWS_REQUIRED_PATTERN =
  /\b(breaking|live updates?|developing|urgent|major|confirmed|emergency|shooting|killed|dead|attack|court ruling|government|election|war|disaster|emergency|severe weather|economy)\b/i;
const BREAKING_NEWS_URGENCY_PATTERN =
  /\b(breaking|live updates?|developing|urgent|just in|alert|confirmed|ongoing|minutes ago|today|latest)\b/i;
const BREAKING_NEWS_ANALYSIS_PATTERN =
  /\b(opinion|analysis|explainer|what to know|how to watch|preview|editorial)\b/i;
const LOW_INFORMATION_LIVE_STREAM_PATTERN =
  /\b(eyewitness news|live streaming video|watch live|live news stream|news live|streaming video|live stream)\b/i;
const LOW_INFORMATION_STATION_BRANDING_PATTERN =
  /\b(wabc-tv|ktrk|abc ?7|abc ?13|eyewitness news|action news|local station|live desk)\b/i;
const BREAKING_NEWS_SOFT_STORY_PATTERN =
  /\b(ice cream|food|recipe|restaurant|travel|vacation|celebrity|hollywood|fashion|music awards|movie premiere|gossip|lifestyle|wellness|shopping|matchup|preview|recap|rankings|odds|sports betting|betting line|parlay|spread pick|over\/under|entertainment)\b/i;
const BREAKING_NEWS_SPORTS_PATTERN =
  /\b(sports?|nfl|nba|mlb|nhl|mls|espn|cbs sports|sports illustrated|bleacher report|football|basketball|baseball|hockey|soccer)\b/i;
const FEATURED_SOURCE_NAMES = [
  "CNN",
  "Reuters",
  "BBC News",
  "NBC News",
  "CBS News",
  "ABC News",
  "NPR",
  "CNBC",
  "Bloomberg",
  "ESPN",
  "AP News",
  "Fox News",
] as const;
const SELECTED_CATEGORY_MATCHERS: Record<string, RegExp> = {
  Politics: /\b(politics?|election|campaign|congress|senate|white house|government|supreme court)\b/i,
  World: /\b(world|international|global|war|ukraine|russia|china|gaza|israel|europe|asia|middle east)\b/i,
  Business: /\b(business|earnings|company|companies|ceo|trade|commerce)\b/i,
  Tech: /\b(tech|technology|ai|artificial intelligence|apple|google|microsoft|meta|startup|cybersecurity|software)\b/i,
  Sports: /\b(sports?|espn|sportscenter|game|match|tournament|playoff|athlete|coach|league)\b/i,
  MLB: /\b(mlb|major league baseball|baseball)\b/i,
  NFL: /\b(nfl|national football league|football|touchdown|quarterback|super bowl)\b/i,
  NHL: /\b(nhl|national hockey league|hockey|stanley cup)\b/i,
  MLS: /\b(mls|major league soccer|soccer|fc\b|united\b)\b/i,
  "College Football": /\b(college football|ncaa football|sec football|big ten football|acc football)\b/i,
  "College Basketball": /\b(college basketball|ncaa basketball|march madness|final four)\b/i,
  Golf: /\b(golf|pga|masters|open championship|ryder cup)\b/i,
  NASCAR: /\b(nascar|cup series|xfinity series|truck series|daytona|talladega|charlotte motor speedway|martinsville|bristol|darlington|pocono)\b/i,
  Health: /\b(health|medical|hospital|disease|wellness|vaccine|cdc|nih)\b/i,
  Science: /\b(science|research|space|nasa|study|physics|biology|astronomy)\b/i,
  Entertainment: /\b(entertainment|movie|movies|tv|television|streaming|hollywood|showbiz)\b/i,
  Celebrity: /\b(celebrity|celebrities|hollywood|tmz|people magazine|red carpet|actor|actress|singer)\b/i,
  Art: /\b(art|artist|museum|gallery|exhibit|painting|sculpture)\b/i,
  Music: /\b(music|album|song|concert|tour|billboard|recording)\b/i,
  Finance: /\b(finance|stock market|wall street|investing|fed|inflation|interest rate|banking)\b/i,
  Crime: /\b(crime|police|arrest|court|trial|murder|shooting|investigation)\b/i,
  Weather: /\b(weather|storm|forecast|tornado|hurricane|rain|snow|climate|radar)\b/i,
  Education: /\b(education|school|student|teacher|college|university|campus)\b/i,
  "Real Estate": /\b(real estate|housing|mortgage|home sales|property|rent)\b/i,
  "Local News": /\b(local news|community|county|city hall|neighborhood|regional)\b/i,
  Culture: /\b(culture|festival|heritage|museum|books|literature|theater)\b/i,
  Lifestyle: /\b(lifestyle|fashion|style|beauty|wellness|relationships|home)\b/i,
  Travel: /\b(travel|airline|airport|hotel|vacation|tourism|destination|cruise)\b/i,
  Food: /\b(food|restaurant|recipe|dining|chef|cooking|kitchen|grocery|menu)\b/i,
  Opinion: /\b(opinion|editorial|column|analysis|commentary)\b/i,
  "Breaking News": /\b(breaking|live updates|developing|urgent|just in|alert)\b/i,
};

type CategoryTaxonomyRule = {
  coreTerms: string[];
  contextTerms?: string[];
  relatedTerms?: string[];
  sourceTerms?: string[];
  domainTerms?: string[];
  negativeTerms?: string[];
  suggestedSources?: string[];
};

const CATEGORY_TAXONOMY: Record<string, CategoryTaxonomyRule> = {
  MLB: {
    coreTerms: ["mlb", "major league baseball", "baseball"],
    contextTerms: ["mlb", "baseball", "home run", "highlights", "innings"],
    relatedTerms: [
      "yankees",
      "dodgers",
      "braves",
      "astros",
      "rangers",
      "mets",
      "red sox",
      "cubs",
      "phillies",
      "padres",
      "orioles",
      "tigers",
      "guardians",
      "mariners",
      "giants",
      "cardinals",
      "brewers",
      "diamondbacks",
      "blue jays",
      "royals",
      "twins",
      "reds",
      "pirates",
      "rays",
      "marlins",
      "rockies",
      "athletics",
      "angels",
      "nationals",
      "white sox",
      "home run",
    ],
    sourceTerms: ["mlb.com", "espn mlb", "mlb network", "baseball america", "the athletic mlb"],
    domainTerms: ["mlb.com", "espn.com", "theathletic.com"],
    negativeTerms: ["odds", "betting", "sportsbook", "parlay", "spread pick", "over/under"],
    suggestedSources: ["MLB.com", "ESPN MLB", "Baseball America", "The Athletic MLB", "AP MLB"],
  },
  NFL: {
    coreTerms: ["nfl", "football", "touchdown", "quarterback", "draft", "training camp"],
    contextTerms: ["nfl", "football", "touchdown", "quarterback", "draft", "training camp", "highlights"],
    relatedTerms: ["cowboys", "panthers", "chiefs", "eagles", "packers", "bears", "draft", "training camp"],
    sourceTerms: ["nfl.com", "espn nfl", "nfl network", "fox sports nfl", "ap nfl"],
    domainTerms: ["nfl.com", "espn.com"],
    negativeTerms: ["odds", "betting", "sportsbook", "parlay", "spread pick", "over/under", "supergirl", "movie", "tv series", "trailer"],
    suggestedSources: ["NFL.com", "ESPN NFL", "AP NFL", "The Athletic NFL", "Fox Sports NFL"],
  },
  NHL: {
    coreTerms: ["nhl", "hockey", "stanley cup"],
    contextTerms: ["nhl", "hockey", "stanley cup", "goal", "save", "overtime", "playoff", "highlights", "rink", "puck"],
    relatedTerms: [
      "goal",
      "save",
      "overtime",
      "playoff",
      "rangers",
      "bruins",
      "oilers",
      "panthers",
      "hurricanes",
      "stars",
      "avalanche",
      "golden knights",
      "maple leafs",
      "devils",
      "islanders",
      "flyers",
      "penguins",
      "red wings",
      "blackhawks",
      "kraken",
      "kings",
      "ducks",
      "sharks",
      "canucks",
      "flames",
      "senators",
      "canadiens",
      "jets",
      "wild",
      "predators",
      "blues",
      "blue jackets",
      "sabres",
      "utah hockey club",
    ],
    sourceTerms: ["nhl.com", "nhl network", "espn nhl", "sportsnet nhl", "tsn hockey"],
    domainTerms: ["nhl.com", "espn.com"],
    negativeTerms: [
      "odds",
      "betting",
      "sportsbook",
      "parlay",
      "spread pick",
      "over/under",
      "nfl",
      "nba",
      "mlb",
      "soccer",
      "golf",
      "formula 1",
      "nascar",
    ],
    suggestedSources: ["NHL.com", "ESPN NHL", "Sportsnet NHL", "The Hockey News", "TSN Hockey"],
  },
  MLS: {
    coreTerms: ["mls", "major league soccer", "soccer"],
    contextTerms: ["mls", "major league soccer", "soccer", "football club", "highlights"],
    relatedTerms: [
      "football club",
      "fc cincinnati",
      "charlotte fc",
      "inter miami",
      "lafc",
      "atlanta united",
      "seattle sounders",
      "lionel messi",
      "usmnt",
      "uswnt",
    ],
    sourceTerms: ["mlssoccer.com", "espn soccer", "espn mls", "cbs sports golazo", "fox sports soccer"],
    domainTerms: ["mlssoccer.com", "espn.com"],
    negativeTerms: ["odds", "betting", "sportsbook", "parlay", "spread pick", "over/under"],
    suggestedSources: ["MLSsoccer.com", "ESPN Soccer", "CBS Sports Golazo", "The Athletic Soccer", "FC Cincinnati"],
  },
  NASCAR: {
    coreTerms: [
      "nascar",
      "cup series",
      "xfinity series",
      "truck series",
      "daytona",
      "talladega",
      "charlotte motor speedway",
      "martinsville",
      "bristol",
      "darlington",
      "pocono",
    ],
    contextTerms: [
      "nascar",
      "cup series",
      "xfinity series",
      "truck series",
      "race recap",
      "qualifying",
      "playoff race",
      "highlights",
      "stock car",
    ],
    relatedTerms: [
      "hendrick motorsports",
      "joe gibbs racing",
      "team penske",
      "trackhouse racing",
      "stewart-haas",
      "checkered flag",
      "pit road",
      "william byron",
      "kyle larson",
      "denny hamlin",
      "ryan blaney",
      "chase elliott",
      "joey logano",
      "christopher bell",
      "ross chastain",
      "tyler reddick",
    ],
    sourceTerms: ["nascar.com", "nascar on fox", "fox sports nascar", "nbc sports nascar"],
    domainTerms: ["nascar.com", "motorsport.com"],
    negativeTerms: [
      "odds",
      "betting",
      "sportsbook",
      "parlay",
      "spread pick",
      "over/under",
      "audi",
      "bmw",
      "mercedes",
      "tesla",
      "ev",
      "electric vehicle",
      "road test",
      "car review",
      "first drive",
      "suv",
      "sedan",
      "pickup truck",
      "formula 1",
      "f1",
      "indycar",
      "motogp",
      "celebrity",
      "politics",
      "world news",
    ],
    suggestedSources: ["NASCAR.com", "Motorsport.com", "Fox Sports NASCAR", "NBC Sports NASCAR", "RACER"],
  },
  Technology: {
    coreTerms: ["technology", "tech", "ai", "artificial intelligence", "software", "cybersecurity"],
    contextTerms: ["technology", "tech", "ai", "artificial intelligence", "software", "cybersecurity", "gadget", "smartphone", "chip", "semiconductor", "robot", "startup"],
    relatedTerms: ["gadgets", "apple", "google", "microsoft", "openai", "nvidia", "chip", "startup", "developer", "smartphone", "semiconductor", "robot"],
    sourceTerms: ["techcrunch", "the verge", "wired", "ars technica", "engadget", "cnet", "bloomberg technology"],
    domainTerms: ["techcrunch.com", "theverge.com", "wired.com", "arstechnica.com", "engadget.com", "cnet.com"],
    negativeTerms: ["world cup", "war update", "weather alert", "celebrity", "recipe", "election", "government", "ceasefire", "summit"],
    suggestedSources: ["TechCrunch", "The Verge", "Wired", "Ars Technica", "Bloomberg Technology"],
  },
  Tech: {
    coreTerms: ["technology", "tech", "ai", "artificial intelligence", "software", "cybersecurity"],
    contextTerms: ["technology", "tech", "ai", "artificial intelligence", "software", "cybersecurity", "gadget", "smartphone", "chip", "semiconductor", "robot", "startup"],
    relatedTerms: ["gadgets", "apple", "google", "microsoft", "openai", "nvidia", "chip", "startup", "developer", "smartphone", "semiconductor", "robot"],
    sourceTerms: ["techcrunch", "the verge", "wired", "ars technica", "engadget", "cnet", "bloomberg technology"],
    domainTerms: ["techcrunch.com", "theverge.com", "wired.com", "arstechnica.com", "engadget.com", "cnet.com"],
    negativeTerms: ["world cup", "war update", "weather alert", "celebrity", "recipe", "election", "government", "ceasefire", "summit"],
    suggestedSources: ["TechCrunch", "The Verge", "Wired", "Ars Technica", "Bloomberg Technology"],
  },
  Auto: {
    coreTerms: ["auto", "automotive", "vehicle", "vehicles", "ev", "electric vehicle", "hybrid", "auto industry"],
    contextTerms: [
      "auto",
      "automotive",
      "vehicle",
      "vehicles",
      "ev",
      "electric vehicle",
      "hybrid",
      "autonomous driving",
      "self-driving",
      "vehicle safety",
      "new model",
      "new car",
      "auto industry",
    ],
    relatedTerms: [
      "tesla",
      "ford",
      "gm",
      "chevrolet",
      "toyota",
      "honda",
      "audi",
      "bmw",
      "mercedes",
      "hybrid",
      "rivian",
      "lucid",
      "hyundai",
      "kia",
      "volkswagen",
      "autonomous driving",
      "vehicle launch",
    ],
    sourceTerms: [
      "automotive news",
      "car and driver",
      "motortrend",
      "edmunds",
      "autoblog",
      "the drive",
      "insideevs",
      "electrek",
      "green car reports",
      "reuters auto industry",
      "ap auto industry",
    ],
    domainTerms: [
      "autonews.com",
      "caranddriver.com",
      "motortrend.com",
      "edmunds.com",
      "autoblog.com",
      "thedrive.com",
      "insideevs.com",
      "electrek.co",
      "greencarreports.com",
      "reuters.com",
      "apnews.com",
    ],
    negativeTerms: [
      "nascar",
      "cup series",
      "xfinity series",
      "truck series",
      "daytona",
      "talladega",
      "charlotte motor speedway",
      "celebrity",
      "movie",
      "election",
      "campaign",
      "touchdown",
      "stanley cup",
      "stock market",
      "earnings call",
    ],
    suggestedSources: ["Automotive News", "Car and Driver", "MotorTrend", "InsideEVs", "Electrek"],
  },
  Celebrity: {
    coreTerms: ["celebrity", "entertainment", "hollywood", "movie", "tv", "music"],
    contextTerms: ["celebrity", "entertainment", "hollywood", "movie", "tv", "music", "red carpet"],
    relatedTerms: ["red carpet", "actor", "actress", "singer", "interview", "award show", "gossip"],
    sourceTerms: ["e! news", "entertainment tonight", "people", "tmz", "page six", "billboard", "variety", "hollywood reporter", "deadline"],
    domainTerms: ["eonline.com", "people.com", "tmz.com", "pagesix.com", "billboard.com", "variety.com", "hollywoodreporter.com", "deadline.com"],
    negativeTerms: ["election", "war", "hurricane", "recipe", "stock market"],
    suggestedSources: ["People", "E! News", "Entertainment Tonight", "TMZ", "The Hollywood Reporter"],
  },
  Food: {
    coreTerms: ["food", "recipe", "cooking", "restaurant", "dining"],
    contextTerms: ["food", "recipe", "cooking", "restaurant", "dining", "chef"],
    relatedTerms: ["chef", "kitchen", "meal", "dessert", "restaurant review", "food scene"],
    sourceTerms: ["food network", "bon appétit", "bon appetit", "serious eats", "eater", "allrecipes", "food & wine", "delish"],
    domainTerms: ["foodnetwork.com", "bonappetit.com", "seriouseats.com", "eater.com", "allrecipes.com", "foodandwine.com"],
    negativeTerms: ["election", "war", "hurricane", "touchdown", "stock market"],
    suggestedSources: ["Food Network", "Bon Appétit", "Serious Eats", "Eater", "Allrecipes"],
  },
  "College Basketball": {
    coreTerms: ["college basketball", "ncaa basketball", "march madness", "final four"],
    contextTerms: ["college basketball", "ncaa basketball", "march madness", "final four", "basketball", "highlights"],
    relatedTerms: ["hoops", "bracket", "ncaa tournament"],
    sourceTerms: ["espn college basketball", "cbs sports college basketball", "ncaa"],
    domainTerms: ["espn.com", "ncaa.com"],
    negativeTerms: ["odds", "betting", "sportsbook", "parlay", "spread pick", "over/under"],
    suggestedSources: ["ESPN College Basketball", "CBS Sports College Basketball", "NCAA", "The Athletic CBB"],
  },
};

function normalizeCategoryTaxonomyValue(value: string | null | undefined) {
  return cleanDisplayText(value ?? "")
    .toLowerCase()
    .replace(/\.com\b/g, "")
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCategoryTaxonomyHaystack(parts: Array<string | null | undefined>) {
  return normalizeCategoryTaxonomyValue(parts.filter(Boolean).join(" "));
}

function matchesCategoryTaxonomy(
  category: string,
  parts: Array<string | null | undefined>,
  options?: { fallbackToRegex?: boolean }
) {
  return getCategoryMatchScore(category, parts, options) > 0;
}

function getCategoryMatchScore(
  category: string,
  parts: Array<string | null | undefined>,
  options?: { fallbackToRegex?: boolean }
) {
  const normalizedCategory = normalizeSelectedCategoryName(category);
  const taxonomy = CATEGORY_TAXONOMY[normalizedCategory];
  const haystack = buildCategoryTaxonomyHaystack(parts);

  if (!haystack) {
    return 0;
  }

  if (!taxonomy) {
    return options?.fallbackToRegex !== false &&
      (SELECTED_CATEGORY_MATCHERS[normalizedCategory]?.test(haystack) ?? false)
      ? 1
      : 0;
  }

  if (taxonomy.negativeTerms?.some((term) => haystack.includes(normalizeCategoryTaxonomyValue(term)))) {
    return 0;
  }

  const coreMatches = taxonomy.coreTerms.filter((term) =>
    haystack.includes(normalizeCategoryTaxonomyValue(term))
  );
  const sourceMatches = (taxonomy.sourceTerms ?? []).filter((term) =>
    haystack.includes(normalizeCategoryTaxonomyValue(term))
  );
  const domainMatches = (taxonomy.domainTerms ?? []).filter((term) =>
    haystack.includes(normalizeCategoryTaxonomyValue(term))
  );
  const relatedMatches = (taxonomy.relatedTerms ?? []).filter((term) =>
    haystack.includes(normalizeCategoryTaxonomyValue(term))
  );
  const contextMatches = (taxonomy.contextTerms ?? taxonomy.coreTerms).filter((term) =>
    haystack.includes(normalizeCategoryTaxonomyValue(term))
  );

  if (
    coreMatches.length === 0 &&
    sourceMatches.length === 0 &&
    domainMatches.length === 0 &&
    !(relatedMatches.length > 0 && contextMatches.length > 0)
  ) {
    return 0;
  }

  return (
    coreMatches.length * 5 +
    sourceMatches.length * 4 +
    domainMatches.length * 4 +
    contextMatches.length * 2 +
    relatedMatches.length
  );
}

function getStrictCategoryValidationThreshold(
  category: string,
  kind: "article" | "lead" | "video"
) {
  const normalizedCategory = normalizeSelectedCategoryName(category);

  const thresholds: Record<string, { article: number; lead: number; video: number }> = {
    NASCAR: { article: 7, lead: 10, video: 10 },
    NFL: { article: 5, lead: 8, video: 8 },
    MLB: { article: 5, lead: 7, video: 7 },
    MLS: { article: 5, lead: 7, video: 7 },
    "College Basketball": { article: 5, lead: 7, video: 7 },
    Technology: { article: 5, lead: 7, video: 7 },
    Tech: { article: 5, lead: 7, video: 7 },
    Auto: { article: 5, lead: 7, video: 7 },
  };

  return thresholds[normalizedCategory]?.[kind] ?? (kind === "article" ? 1 : 6);
}

function isStrictCategoryMatch(
  category: string,
  parts: Array<string | null | undefined>,
  kind: "article" | "lead" | "video"
) {
  return getCategoryMatchScore(category, parts, { fallbackToRegex: false }) >=
    getStrictCategoryValidationThreshold(category, kind);
}

function sourceMatchesSelectedCategory(sourceName: string, category: string) {
  return matchesCategoryTaxonomy(category, [sourceName], { fallbackToRegex: true });
}

function selectRecentCategoryVideos(videos: VideoItem[], minimumCount = 4) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const thresholds = [7, 14, 30];

  for (const thresholdDays of thresholds) {
    const filtered = videos.filter((video) => {
      if (!video.publishedAt) {
        return false;
      }

      const timestamp = getPublishedAtTimestamp(video.publishedAt);
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return false;
      }

      return now - timestamp <= thresholdDays * dayMs;
    });

    if (filtered.length >= minimumCount) {
      return filtered;
    }
  }

  const withinThirtyDays = videos.filter((video) => {
    if (!video.publishedAt) {
      return false;
    }

    const timestamp = getPublishedAtTimestamp(video.publishedAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return false;
    }

    return now - timestamp <= 30 * dayMs;
  });

  return withinThirtyDays.length > 0 ? withinThirtyDays : videos;
}

async function getNascarArticles() {
  const payloads = await Promise.all(
    MY_NEWS_NASCAR_ARTICLE_QUERIES.map(async (query) => {
      const response = await fetch(
        `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      if (!response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const mergedNascarArticles = dedupeArticlesByContent(payloads.flat());
  const validNascarArticles = mergedNascarArticles.filter((article) =>
    articleMatchesSelectedCategory(article, "NASCAR")
  );

  console.log("NASCAR DEDICATED ARTICLES RAW", mergedNascarArticles.length);
  console.log("NASCAR DEDICATED ARTICLES VALID", validNascarArticles.length);

  return validNascarArticles;
}

async function getNascarVideos() {
  const payloads = await Promise.all(
    MY_NEWS_NASCAR_VIDEO_QUERIES.map(async (query) => {
      const response = await fetch(
        `/api/videos?tab=sports&q=${encodeURIComponent(query)}&category=${encodeURIComponent("NASCAR")}`
      );

      if (!response.ok) {
        return [] as VideoItem[];
      }

      const data = (await response.json()) as { videos?: VideoItem[] };
      return Array.isArray(data.videos) ? data.videos : [];
    })
  );

  const mergedVideos = dedupeVideosBySourceTitleAndUrl(payloads.flat());
  const validVideos = selectRecentCategoryVideos(
    mergedVideos.filter((video) => videoMatchesSelectedCategory(video, "NASCAR")),
    4
  ).sort((left, right) => getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt));
  const rejectedVideos = mergedVideos.filter((video) => !videoMatchesSelectedCategory(video, "NASCAR"));

  console.log("NASCAR DEDICATED VIDEOS RAW", mergedVideos.length);
  console.log("NASCAR DEDICATED VIDEOS VALID", validVideos.length);
  console.log(
    "NASCAR DEDICATED VIDEOS REJECTED SAMPLE",
    rejectedVideos.slice(0, 6).map((video) => video.title)
  );

  return validVideos;
}

async function getMlbArticles() {
  const payloads = await Promise.all(
    MY_NEWS_MLB_ARTICLE_QUERIES.map(async (query) => {
      const response = await fetch(
        `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      if (!response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const mergedMlbArticles = dedupeArticlesByContent(payloads.flat());
  const validMlbArticles = mergedMlbArticles.filter((article) =>
    isDedicatedMlbArticle(article, "article")
  );

  console.log("MLB DEDICATED ARTICLES RAW", mergedMlbArticles.length);
  console.log("MLB DEDICATED ARTICLES VALID", validMlbArticles.length);
  console.log("MLB ARTICLE FINAL COUNT", validMlbArticles.length);

  return validMlbArticles;
}

async function getNflArticles() {
  const payloads = await Promise.allSettled(
    NFL_SECTION_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validNflArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictNflArticle(article));

  console.log("NFL ARTICLE FINAL COUNT", validNflArticles.length);
  return validNflArticles;
}

async function getNhlArticles() {
  const payloads = await Promise.allSettled(
    NHL_SECTION_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validNhlArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictNhlArticle(article));

  return validNhlArticles;
}

async function getMlsArticles() {
  const payloads = await Promise.allSettled(
    MLS_SECTION_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validMlsArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictMlsArticle(article));

  console.log("MLS ARTICLE FINAL COUNT", validMlsArticles.length);
  return validMlsArticles;
}

async function getCollegeFootballArticles() {
  const queries = [
    "college football news",
    "NCAA football news",
    "ESPN college football",
    "CBS Sports college football",
    "Fox Sports college football",
    "The Athletic college football",
    "Yahoo Sports college football",
    "AP college football",
    "Reuters college football",
    "ACC football",
    "SEC football",
    "Big Ten football",
    "Big 12 football",
    "CFP news",
    "college football playoff",
    "transfer portal football",
    "recruiting football",
  ] as const;

  const payloads = await Promise.allSettled(
    queries.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validCollegeFootballArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictCollegeFootballArticle(article));

  console.log("COLLEGE FOOTBALL ARTICLE FINAL COUNT", validCollegeFootballArticles.length);
  return validCollegeFootballArticles;
}

async function getCollegeBasketballArticles() {
  const payloads = await Promise.allSettled(
    COLLEGE_BASKETBALL_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validCollegeBasketballArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictCollegeBasketballArticle(article));

  console.log("COLLEGE BASKETBALL ARTICLE FINAL COUNT", validCollegeBasketballArticles.length);
  return validCollegeBasketballArticles;
}

async function getGolfArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_GOLF_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validGolfArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictGolfArticle(article));

  console.log("GOLF ARTICLE FINAL COUNT", validGolfArticles.length);
  return validGolfArticles;
}

async function getScienceArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_SCIENCE_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validScienceArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictScienceArticle(article));

  console.log("SCIENCE ARTICLE FINAL COUNT", validScienceArticles.length);
  return validScienceArticles;
}

async function getPoliticsArticles() {
  const startedAt = Date.now();
  console.log("POLITICS MY NEWS LOAD START");
  const fetchPoliticsQuery = async (query: string) => {
    const timeoutMs = 3000;

    return await Promise.race([
      fetch(
        `/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      ).then(async (response) => {
        if (!response.ok) {
          return [] as Article[];
        }

        const payload = normalizeNewsPayload(
          (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
        );

        return hydrateFeedArticles(payload.articles);
      }),
      new Promise<Article[]>((resolve) => {
        window.setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
  };

  const payloads = await Promise.allSettled(
    MY_NEWS_POLITICS_ARTICLE_QUERIES.map((query) => fetchPoliticsQuery(query))
  );

  const mergedPoliticsArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  );
  const validPoliticsArticles = mergedPoliticsArticles.filter((article) =>
    isStrictPoliticsArticle(article)
  );

  console.log("POLITICS ARTICLES RAW COUNT", mergedPoliticsArticles.length);
  console.log("POLITICS ARTICLE COUNT", validPoliticsArticles.length);
  console.log("POLITICS ARTICLES FINAL COUNT", validPoliticsArticles.length);
  console.log("POLITICS ARTICLE FINAL COUNT", validPoliticsArticles.length);
  console.log("MY NEWS POLITICS ARTICLE COUNT", validPoliticsArticles.length);
  console.log("POLITICS ARTICLES READY MS", Date.now() - startedAt);
  console.log("POLITICS FETCH TIME MS", Date.now() - startedAt);
  console.log("POLITICS TOTAL BLOCKING TIME", Date.now() - startedAt);

  return validPoliticsArticles;
}

async function getBusinessArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_BUSINESS_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  return dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictBusinessArticle(article));
}

async function getWeatherArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_WEATHER_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validWeatherArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictWeatherArticle(article));

  console.log("WEATHER ARTICLE FINAL COUNT", validWeatherArticles.length);
  return validWeatherArticles;
}

async function getTravelArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_TRAVEL_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validTravelArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictTravelArticle(article));

  console.log("TRAVEL ARTICLE FINAL COUNT", validTravelArticles.length);
  return validTravelArticles;
}

async function getAutoArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_AUTO_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validAutoArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isStrictAutoArticle(article));

  console.log("AUTO ARTICLE FINAL COUNT", validAutoArticles.length);
  return validAutoArticles;
}

async function getSportsMyNewsArticles() {
  const payloads = await Promise.allSettled(
    MY_NEWS_SPORTS_ARTICLE_QUERIES.map(async (query) => {
      const response = await Promise.race([
        fetch(`/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=8`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<Response | null>((resolve) => {
          window.setTimeout(() => resolve(null), 3000);
        }),
      ]);

      if (!response || !response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  const validSportsArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  ).filter((article) => isBroadSportsArticle(article) && !isSportsBettingAd(article));

  console.log("SPORTS MY NEWS ARTICLE COUNT", validSportsArticles.length);
  return validSportsArticles;
}

async function getWorldArticles() {
  const startedAt = Date.now();
  const fetchWorldQuery = async (query: string) => {
    const timeoutMs = 3000;

    return await Promise.race([
      fetch(
        `/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=8`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      ).then(async (response) => {
        if (!response.ok) {
          return [] as Article[];
        }

        const payload = normalizeNewsPayload(
          (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
        );

        return hydrateFeedArticles(payload.articles);
      }),
      new Promise<Article[]>((resolve) => {
        window.setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
  };

  const payloads = await Promise.allSettled(
    MY_NEWS_WORLD_ARTICLE_QUERIES.map((query) => fetchWorldQuery(query))
  );

  const mergedWorldArticles = dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  );
  const validWorldArticles = mergedWorldArticles.filter((article) => isStrictWorldArticle(article));

  console.log("MY NEWS WORLD ARTICLE COUNT", validWorldArticles.length);
  console.log("WORLD FETCH TIME MS", Date.now() - startedAt);

  return validWorldArticles;
}

async function getMlbVideos() {
  console.log("MLB DEDICATED VIDEOS CALLED");

  const payloads = await Promise.all(
    MY_NEWS_MLB_VIDEO_QUERIES.map(async (query) => {
      const response = await fetch(
        `/api/videos?tab=sports&q=${encodeURIComponent(query)}&category=${encodeURIComponent("MLB")}`
      );

      if (!response.ok) {
        return [] as VideoItem[];
      }

      const data = (await response.json()) as { videos?: VideoItem[] };
      return Array.isArray(data.videos) ? data.videos : [];
    })
  );

  const mergedVideos = dedupeVideosBySourceTitleAndUrl(payloads.flat());
  const validVideos = selectRecentCategoryVideos(
    mergedVideos.filter((video) => isStrictMlbVideo(video)),
    4
  ).sort((left, right) => getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt));
  const rejectedVideos = mergedVideos.filter((video) => !isStrictMlbVideo(video));

  console.log("MLB DEDICATED VIDEOS RAW COUNT", mergedVideos.length);
  console.log("MLB DEDICATED VIDEOS VALID COUNT", validVideos.length);
  console.log("MLB DEDICATED VIDEOS TITLES", validVideos.map((video) => video.title));
  rejectedVideos.forEach((video) => {
    const reason = getStrictMlbVideoRejectionReason(video);
    console.log("MLB VIDEO REJECTED", {
      title: video.title,
      creator: video.creator,
      reason,
    });
  });

  return validVideos;
}

function hasRealLargeImageCandidate(
  article: Pick<
    Article,
    | "title"
    | "description"
    | "source"
    | "category"
    | "image"
    | "imageUrl"
    | "urlToImage"
    | "mediaContent"
    | "enclosureUrl"
    | "ogImage"
    | "twitterImage"
    | "thumbnail"
  >
) {
  const selectedImage = getBestArticleImage(article);
  return Boolean(selectedImage.src) && isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src);
}

function dedupeArticlesByContent(articles: Article[]) {
  const seen = new Set<string>();

  return articles.filter((article) => {
    const key = getArticleDeduplicationKey(article);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

const NASCAR_LARGE_CARD_FALLBACK_IMAGE = "/category-images/nascar.png";
function getCategoryLeadArticle(articles: Article[], category: string) {
  return (
    [...articles]
      .filter((article) => hasRealLargeImageCandidate(article))
      .filter((article) =>
        isStrictCategoryMatch(
          category,
          [
            article.title,
            article.description,
            article.source,
            article.category,
            article.url,
            article.content,
          ],
          "lead"
        )
      )
      .sort((leftArticle, rightArticle) => {
        const rightScore = getCategoryMatchScore(category, [
          rightArticle.title,
          rightArticle.description,
          rightArticle.source,
          rightArticle.category,
          rightArticle.url,
          rightArticle.content,
        ]);
        const leftScore = getCategoryMatchScore(category, [
          leftArticle.title,
          leftArticle.description,
          leftArticle.source,
          leftArticle.category,
          leftArticle.url,
          leftArticle.content,
        ]);

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        return getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle);
      })
      .find((article) => hasRealLargeImageCandidate(article)) ?? null
  );
}

function getMyNewsCategoryLeadArticle(category: string, categoryPool: Article[], visibleSectionArticles: Article[]) {
  const broaderLead = getCategoryLeadArticle(categoryPool, category);

  if (broaderLead) {
    return broaderLead;
  }

  return getCategoryLeadArticle(visibleSectionArticles, category);
}

function getLargeImageCardImageCandidate(article: Article) {
  const selectedImage = getBestArticleImage(article);

  if (!selectedImage.src) {
    return null;
  }

  if (!isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src)) {
    return null;
  }

  return selectedImage;
}

function getNascarLargeCardSelection(articles: Article[]) {
  console.log(
    "NASCAR LARGE CARD RAW ARTICLES",
    articles.map((article) => ({
      title: article.title,
      source: article.source,
      imageUrl: getBestArticleImage(article).src,
    }))
  );

  const nascarValidatedArticles = articles.filter((article) =>
    isStrictCategoryMatch(
      "NASCAR",
      [
        article.title,
        article.description,
        article.source,
        article.category,
        article.url,
        article.content,
      ],
      "lead"
    )
  );

  const rejectedNotNascar = articles
    .filter((article) => !nascarValidatedArticles.includes(article))
    .map((article) => ({
      title: article.title,
      source: article.source,
      imageUrl: getBestArticleImage(article).src,
      reason: "not_nascar",
    }));

  const realImageCandidates = nascarValidatedArticles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      score: getCategoryMatchScore("NASCAR", [
        article.title,
        article.description,
        article.source,
        article.category,
        article.url,
        article.content,
      ]),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return getArticlePriorityScore(right.article) - getArticlePriorityScore(left.article);
    });

  const validRealImageCandidates = realImageCandidates.filter((candidate) => Boolean(candidate.image));
  const rejectedNoImage = realImageCandidates
    .filter((candidate) => !candidate.image)
    .map((candidate) => ({
      title: candidate.article.title,
      source: candidate.article.source,
      imageUrl: getBestArticleImage(candidate.article).src,
      reason: "no_real_image",
    }));

  console.log(
    "NASCAR LARGE CARD REAL IMAGE CANDIDATES",
    validRealImageCandidates.map((candidate) => ({
      title: candidate.article.title,
      source: candidate.article.source,
      imageUrl: candidate.image?.src ?? null,
    }))
  );
  console.log("NASCAR LARGE CARD REJECTED NO IMAGE", rejectedNoImage);
  console.log("NASCAR LARGE CARD REJECTED NOT NASCAR", rejectedNotNascar);

  const selectedRealImageCandidate = validRealImageCandidates[0];

  if (selectedRealImageCandidate?.image) {
    console.log("NASCAR LARGE CARD SELECTED", {
      title: selectedRealImageCandidate.article.title,
      source: selectedRealImageCandidate.article.source,
      imageUrl: selectedRealImageCandidate.image.src,
      reason: "real_image",
    });

    return {
      article: selectedRealImageCandidate.article,
      imageSrc: selectedRealImageCandidate.image.src,
    };
  }

  const fallbackArticle = realImageCandidates[0]?.article ?? null;

  if (fallbackArticle) {
    console.log("NASCAR LARGE CARD SELECTED", {
      title: fallbackArticle.title,
      source: fallbackArticle.source,
      imageUrl: NASCAR_LARGE_CARD_FALLBACK_IMAGE,
      reason: "nascar_fallback_image",
    });

    return {
      article: fallbackArticle,
      imageSrc: NASCAR_LARGE_CARD_FALLBACK_IMAGE,
    };
  }

  console.log("NASCAR LARGE CARD SELECTED", null);
  return null;
}

function isDedicatedMlbArticle(
  article: Pick<Article, "title" | "description" | "source" | "category" | "url" | "content">,
  kind: "article" | "lead" = "article"
) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${
    article.category ?? ""
  } ${article.url} ${article.content ?? ""}`.toLowerCase();

  const hasMlbCoreTerms =
    /\b(mlb|major league baseball|baseball|mlb\.com|home run|pitcher|inning|bullpen|manager|trade deadline|roster|injured list|prospect|minor league|dugout|postseason|world series)\b/.test(
      haystack
    );
  const hasMlbTeamTerms =
    /\b(yankees|dodgers|braves|mets|red sox|cubs|phillies|astros|rangers|padres|orioles|tigers|guardians|mariners|giants|cardinals|brewers|diamondbacks|blue jays|royals|twins|reds|pirates|rays|marlins|rockies|athletics|angels|nationals|white sox)\b/.test(
      haystack
    );
  const hasMlbSourceTerms =
    /\b(mlb\.com|mlb network|espn mlb|cbs sports mlb|nbc sports mlb|fox sports mlb|yahoo sports mlb|ap mlb|reuters mlb|bleacher report mlb|the athletic mlb|baseball america)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(nfl|nba|nhl|mls|soccer|football|basketball|hockey|odds|betting|sportsbook|parlay|spread pick|over\/under|politics?|election|world news|celebrity|hollywood|audi|tesla|ev|electric vehicle|auto review|formula 1|formula1|indycar|motogp)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  const strictScore =
    (hasMlbCoreTerms ? 1 : 0) + (hasMlbTeamTerms ? 1 : 0) + (hasMlbSourceTerms ? 1 : 0);

  if (kind === "lead") {
    return strictScore >= 1 && isStrictCategoryMatch("MLB", [haystack], "lead");
  }

  return strictScore >= 1 && isStrictCategoryMatch("MLB", [haystack], "article");
}

function getMlbVideoValidationState(
  video: Pick<VideoItem, "title" | "creator" | "category" | "watchUrl" | "thumbnailUrl">
) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl} ${
    video.thumbnailUrl ?? ""
  }`.toLowerCase();

  const hasMlbLeagueTerms = /\b(mlb|major league baseball|mlb network|mlb\.com)\b/.test(
    haystack
  );
  const hasMlbTeamTerms =
    /\b(yankees|dodgers|braves|mets|red sox|cubs|phillies|astros|rangers|padres|orioles|tigers|guardians|mariners|giants|cardinals|brewers|diamondbacks|blue jays|royals|twins|reds|pirates|rays|marlins|rockies|athletics|angels|nationals|white sox)\b/.test(
      haystack
    );
  const hasBaseballTerms =
    /\b(baseball|home run|pitcher|inning|bullpen|batting|dugout|world series|mlb|major league baseball)\b/.test(
      haystack
    );
  const hasRejectedCollegeTerms =
    /\b(college baseball|ncaa|college|alabama|softball|college softball|high school|little league)\b/.test(
      haystack
    );
  const hasRejectedBasketballTerms =
    /\b(basketball|nba|wnba|san antonio spurs|spurs|nuns)\b/.test(haystack);
  const hasRejectedUnrelatedTerms =
    /\b(wcnc|nfl|nhl|mls|soccer|football|hockey|politics?|election|world news|celebrity|hollywood|entertainment|betting|odds|parlay|spread pick|over\/under)\b/.test(
      haystack
    );

  const hasMlbOrProContext = hasMlbLeagueTerms || hasMlbTeamTerms;

  if (hasRejectedCollegeTerms) {
    return { valid: false, reason: "college baseball" };
  }

  if (hasRejectedBasketballTerms) {
    return { valid: false, reason: "basketball" };
  }

  if (hasRejectedUnrelatedTerms) {
    return { valid: false, reason: "unrelated source" };
  }

  if (!hasMlbOrProContext || !hasBaseballTerms) {
    return { valid: false, reason: "no MLB/pro context" };
  }

  return { valid: true, reason: null as string | null };
}

function isDedicatedMlbVideo(video: Pick<VideoItem, "title" | "creator" | "category" | "watchUrl" | "thumbnailUrl">) {
  return getMlbVideoValidationState(video).valid;
}

function getMlbLargeCardSelection(articles: Article[]) {
  console.log(
    "MLB LARGE IMAGE CANDIDATES",
    articles.map((article) => ({
      title: article.title,
      source: article.source,
      imageUrl: getBestArticleImage(article).src,
    }))
  );

  const mlbValidatedArticles = articles.filter((article) => isDedicatedMlbArticle(article, "lead"));

  const rankedMlbCandidates = mlbValidatedArticles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      score: getCategoryMatchScore("MLB", [
        article.title,
        article.description,
        article.source,
        article.category,
        article.url,
        article.content,
      ]),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return getArticlePriorityScore(right.article) - getArticlePriorityScore(left.article);
    });

  const selectedRealImageCandidate = rankedMlbCandidates.find((candidate) => Boolean(candidate.image));

  if (selectedRealImageCandidate?.image) {
    console.log("MLB LARGE IMAGE SELECTED", {
      title: selectedRealImageCandidate.article.title,
      source: selectedRealImageCandidate.article.source,
      imageUrl: selectedRealImageCandidate.image.src,
      reason: "real_image",
    });

    return {
      article: selectedRealImageCandidate.article,
      imageSrc: selectedRealImageCandidate.image.src,
    };
  }

  const fallbackArticle = rankedMlbCandidates[0]?.article ?? null;

  if (fallbackArticle) {
    console.log("MLB LARGE IMAGE SELECTED", {
      title: fallbackArticle.title,
      source: fallbackArticle.source,
      imageUrl: "/category-images/mlb.png",
      reason: "mlb_fallback_image",
    });

    return {
      article: fallbackArticle,
      imageSrc: "/category-images/mlb.png",
    };
  }

  console.log("MLB LARGE IMAGE SELECTED", null);
  return null;
}
const BROAD_SPORTS_SOURCE_PATTERN =
  /\b(motorsport\.com|motorsport|nascar\.com|nascar|bleacher report|mlb\.com|nhl\.com|nba\.com|nfl\.com|mlssoccer\.com|espn|yahoo sports|fox sports|nbc sports|cbs sports|sports illustrated|ap sports|ap news sports|reuters sports|fc cincinnati|hero sports|big 12|big 12 conference|dallas cowboys|official site|team site|conference site|sports|athletics|sporting)\b/i;
const MY_NEWS_FEATURED_SPORTS_PATTERN =
  /\b(sports?|espn|cbs sports|sports illustrated|bleacher report|mlb|nba|nfl|nhl|mls|soccer|football|basketball|baseball|hockey)\b/i;
const TOP_QUICK_WATCH_PREFERRED_SOURCE_PATTERN =
  /\b(cnn|the new york times|new york times|nbc news|cbs news|abc news|reuters|associated press|ap news|bbc news|pbs newshour|cnbc|bloomberg|usa today|the guardian|guardian)\b/i;
const TOP_QUICK_WATCH_DEPRIORITIZED_SOURCE_PATTERN =
  /\b(al jazeera|al jazeera english|fox news)\b/i;
const QUICK_WATCH_COMBINED_LIMITED_SOURCES = new Set(["al jazeera", "al jazeera english", "fox news"]);
const RECIPE_PREFERRED_SOURCE_PATTERN =
  /\b(nyt cooking|allrecipes|food network|delish|bon appétit|bon appetit|serious eats|epicurious|taste of home|food & wine|food and wine|eater)\b/i;
const WEATHER_SOURCE_RENAME_PATTERN = /\bweather news\b/i;
const WEATHER_LIKE_ARTICLE_PATTERN =
  /\b(weather|storm|tornado|hurricane|rain|snow|forecast|radar|climate|flood|wildfire|local weather|severe weather)\b/i;
const WEATHER_SOURCE_INFERENCE_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bthe weather channel\b/i, label: "The Weather Channel" },
  { pattern: /\bfox weather\b/i, label: "Fox Weather" },
  { pattern: /\baccuweather\b/i, label: "AccuWeather" },
  { pattern: /\bweathernation\b/i, label: "WeatherNation" },
  { pattern: /\bnational weather service\b/i, label: "National Weather Service" },
  { pattern: /\bnoaa\b/i, label: "NOAA" },
  { pattern: /\bcnn weather\b/i, label: "CNN Weather" },
  { pattern: /\bnbc weather\b/i, label: "NBC Weather" },
  { pattern: /\bwbtv weather\b/i, label: "WBTV Weather" },
  { pattern: /\bwcnc weather\b/i, label: "WCNC Weather" },
  { pattern: /\bwsb-tv weather\b/i, label: "WSB-TV Weather" },
];
const LOCAL_VIDEO_SOURCE_HINTS: Record<string, RegExp> = {
  charlotte:
    /\b(wcnc|wcnc charlotte|wbtv|wbtv charlotte|wsoc|wsoc charlotte|queen city news|spectrum news charlotte)\b/i,
};
const LOCAL_VIDEO_QUERY_HINTS: Record<string, string[]> = {
  charlotte: [
    "WCNC Charlotte latest video",
    "WBTV Charlotte latest video",
    "WSOC Charlotte latest video",
    "Queen City News latest video",
    "Spectrum News Charlotte latest video",
    "WFAE Charlotte video",
    "Charlotte NC news video",
    "Charlotte breaking news video",
    "Charlotte weather video",
    "Charlotte sports video",
  ],
};
const LOCAL_VIDEO_BROAD_FALLBACK_QUERY_HINTS: Record<string, string[]> = {
  charlotte: [
    "Charlotte news YouTube",
    "Charlotte local video",
    "Charlotte NC news",
  ],
};

function buildSelectedCityVideoMatcher(cityLabel: string) {
  const cityName = cityLabel.split(",")[0]?.trim().toLowerCase() ?? "";
  const escapedCity = cityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cityPattern = cityName ? new RegExp(`\\b${escapedCity}\\b`, "i") : null;
  const citySourcePattern = cityName ? LOCAL_VIDEO_SOURCE_HINTS[cityName] ?? null : null;
  const localStationPattern =
    cityName === "charlotte"
      ? /\b(charlotte|mecklenburg|queen city|wcnc|wbtv|wsoc|queen city news|spectrum news|wfae)\b/i
      : cityPattern;

  return (video: VideoItem) => {
    const haystack =
      `${video.title} ${video.creator} ${video.category} ${video.watchUrl} ${video.thumbnailUrl ?? ""}`.toLowerCase();

    if (citySourcePattern?.test(haystack)) {
      return true;
    }

    if (localStationPattern?.test(haystack)) {
      return true;
    }

    if (!cityPattern?.test(haystack)) {
      return false;
    }

    return /\b(news|weather|storm|forecast|sports|traffic|community|breaking|local|latest|update)\b/i.test(
      haystack
    );
  };
}
const FEED_META_ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 14,
  height: 14,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  focusable: false,
  "aria-hidden": true,
};

type SportsSectionKey =
  | FavoriteLeagueKey
  | "NFL"
  | "COLLEGE_FOOTBALL"
  | "COLLEGE_BASKETBALL"
  | "MOTORSPORTS"
  | "MMA"
  | "MORE";

type SportsSectionConfig = {
  key: SportsSectionKey;
  label: string;
  scoreLeague?: SportsScoreLeague;
  articlePattern: RegExp;
  videoPattern: RegExp;
};

function isFavoriteLeagueSectionKey(key: SportsSectionKey): key is FavoriteLeagueKey {
  return key === "MLB" || key === "NFL" || key === "NBA" || key === "MLS" || key === "NHL";
}

const SWIPEABLE_SORT_MODES = [
  "trending",
  "mynews",
  "local",
  "weather",
] as const;

type SwipeableSortMode = (typeof SWIPEABLE_SORT_MODES)[number];

type Comment = {
  id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  likes: number;
  dislikes: number;
  currentUserReaction: "like" | "dislike" | null;
  replies: Reply[];
};

type Reply = {
  id: number;
  comment_id: number;
  article_id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

type Article = {
  id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  image?: string | null;
  imageUrl?: string | null;
  urlToImage?: string | null;
  mediaContent?: string | null;
  enclosureUrl?: string | null;
  ogImage?: string | null;
  twitterImage?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  likes: number;
  likeUsers: LikeUser[];
  likedByCurrentUser: boolean;
  comments: Comment[];
  saved: boolean;
  provider?: string | null;
};

type LikeUser = {
  user_id: string | null;
  username: string | null;
};

type EntertainmentSectionKey = "gossip" | "music" | "tv" | "celebrity" | "movies";
type TrendingPodcastCard = {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  category: PodcastFeedCategory;
  image?: string | null;
  artworkUrl600?: string | null;
  artworkUrl100?: string | null;
  artwork?: string | null;
  podcastImage?: string | null;
  feedImage?: string | null;
  itunesImage?: string | null;
};

type PopularMusicAlbum = {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  sourceLabel: string;
  rank: number;
  url: string | null;
};

type TheaterMovieItem = {
  id: string;
  title: string;
  imageUrl: string;
  rank: number;
  releaseDate: string | null;
  tmdbScore: number | null;
  rottenTomatoesScore: string | null;
  imdbRating: string | null;
  sourceLabel: string;
};

type StockTickerItem = {
  symbol: string;
  label: string;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  source: string;
};

const BUSINESS_STOCK_TICKER_ORDER = [
  "AAPL",
  "MSFT",
  "NVDA",
  "SPY",
  "QQQ",
  "DIA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AMD",
  "NFLX",
  "JPM",
  "BAC",
  "XOM",
  "DIS",
  "IWM",
] as const;

type TopicFallbackGroup = {
  keyword: string;
  pattern: RegExp;
  imageKey: string;
};

type DbComment = {
  id: number;
  article_id: number;
  article_key?: string | null;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type DbLike = {
  id: number;
  article_id: number;
  user_id: string | null;
};

type DbProfile = {
  id: string;
  avatar_url: string | null;
  username: string | null;
  preferred_sources?: string[] | null;
  show_less_sources?: string[] | null;
};

type DbSavedArticle = {
  article_id: number;
};

type DbBlockedUser = {
  blocked_id: string;
};

type DbCommentReaction = {
  id: number;
  comment_id: number;
  user_id: string;
  reaction_type: "like" | "dislike";
};

type DbCommentReply = {
  id: number;
  comment_id: number;
  article_id: number;
  text: string;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
};

type RainViewerWeatherMapsResponse = {
  host?: string | null;
  radar?: {
    past?: Array<{
      time?: number | null;
      path?: string | null;
    }>;
    nowcast?: Array<{
      time?: number | null;
      path?: string | null;
    }>;
  } | null;
};

type RadarFramePoint = {
  tileUrl: string;
  timestamp: number;
  label: string;
  isFuture: boolean;
};

type NationalWeatherMapEmbedOptions = {
  showSelectedTimeLabel?: boolean;
  interactive?: boolean;
};

type FeedArticlePayload = Omit<
  Article,
  "likes" | "likeUsers" | "likedByCurrentUser" | "comments" | "saved"
>;

type PaginatedNewsResponse = {
  articles: FeedArticlePayload[];
  nextPage?: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  debug?: {
    currentCount?: number;
  };
  nytKeyPresentFromNewsRoute?: boolean;
  nytKeyLengthFromNewsRoute?: number;
  providerDebug?: {
    gnews: { keyPresent?: boolean; fetchStarted?: boolean; skippedReason?: string | null; requestUrl?: string | null; status?: number | null; bodyPreview?: unknown; rawCount: number; imageCount: number; rejectedCount: number };
    guardian: { keyPresent?: boolean; fetchStarted?: boolean; skippedReason?: string | null; requestUrl?: string | null; status?: number | null; bodyPreview?: unknown; rawCount: number; imageCount: number; rejectedCount: number };
    nyt: { keyPresent?: boolean; fetchStarted?: boolean; skippedReason?: string | null; requestUrl?: string | null; status?: number | null; bodyPreview?: unknown; rawCount: number; imageCount: number; rejectedCount: number };
    currents: { keyPresent?: boolean; fetchStarted?: boolean; skippedReason?: string | null; requestUrl?: string | null; status?: number | null; bodyPreview?: unknown; rawCount: number; imageCount: number; rejectedCount: number };
  };
  visiblePipelineDebug?: {
    currentSourceFile: string;
    currentCountBeforeMerge: number;
    gnewsCountBeforeMerge: number;
    nytCountBeforeMerge: number;
    totalAfterMerge: number;
    gnewsDroppedReason: string | null;
    gnewsKeyPresent: boolean;
    gnewsKeyLength: number;
    gnewsRequestUrl: string;
    gnewsStatus: number | null;
    gnewsBodyPreview: unknown;
    gnewsRawCount: number;
    gnewsImageCount: number;
    gnewsError: string | null;
  };
};

type TrendingFeedItem =
  | { type: "article"; key: string; article: Article }
  | { type: "video"; key: string; video: VideoItem }
  | {
      type: "module";
      key: string;
      module:
        | { kind: "top-polls"; polls: PollWithResults[] }
        | { kind: "quick-watch"; video: VideoItem }
        | { kind: "celebrity-buzz"; article: Article };
    };

type RankedSourceSummary = {
  sourceName: string;
  likes: number;
  heartedByCurrentUser: boolean;
};

type WeatherCardData = {
  temperature: number;
  weatherLabel: string;
  windMph: number | null;
  cityLabel: string;
  highTemp?: number | null;
  lowTemp?: number | null;
  humidity?: number | null;
};

type WeatherForecastDay = {
  label: string;
  dateLabel: string;
  weatherLabel: string;
  highTemp: number | null;
  lowTemp: number | null;
};

type FavoriteTeamUpdate = {
  team: FavoriteTeamOption;
  article: Article | null;
  game: SportsScoreGame | null;
};

type SportsScoreLeague = "NFL" | "NBA" | "MLB" | "NHL" | "MLS";

type SportsScoreGame = {
  id: string;
  league: SportsScoreLeague;
  status: "Live" | "Final" | "Today" | "Upcoming";
  homeTeam: {
    name: string;
    logoUrl: string | null;
    score: string | null;
  };
  awayTeam: {
    name: string;
    logoUrl: string | null;
    score: string | null;
  };
  shortDetail: string | null;
  scheduledAt: string | null;
  statusDetail?: string | null;
  venue?: string | null;
  boxScoreAvailable?: boolean;
  playByPlayAvailable?: boolean;
};

const APP_TIME_ZONE = "America/New_York";

function formatTopRankLabel(rank: number) {
  if (rank === 1) return "Top 1 🥇";
  if (rank === 2) return "Top 2 🥈";
  if (rank === 3) return "Top 3 🥉";
  return `Top ${rank}`;
}

function getArticleRouteId(article: { id?: number | null }) {
  return typeof article.id === "number" && Number.isFinite(article.id) && article.id > 0
    ? article.id
    : null;
}

function hasResolvableArticleUrl(article: { url?: string | null }) {
  if (!article.url?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(article.url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isRenderableArticleRecord(
  article: Pick<Article, "id" | "title" | "url" | "source">
) {
  const routeId = getArticleRouteId(article);
  const title = cleanDisplayText(article.title ?? "");
  const source = cleanDisplayText(article.source ?? "").toLowerCase();

  if (!routeId || !title || !hasResolvableArticleUrl(article)) {
    return false;
  }

  if (source === "source unavailable" || source === "unavailable" || source === "unknown source") {
    return false;
  }

  return true;
}

function persistArticleMetadata(article: Article) {
  if (typeof window === "undefined") {
    return;
  }

  const articleRouteId = getArticleRouteId(article);

  if (!articleRouteId) {
    return;
  }

  try {
    const cardImage = getArticleDisplayImage(article).src;
    const existingRaw = window.localStorage.getItem(ARTICLE_METADATA_STORAGE_KEY);
    const existingCache = existingRaw
      ? (JSON.parse(existingRaw) as Record<string, Record<string, unknown>>)
      : {};

    existingCache[String(articleRouteId)] = {
      id: articleRouteId,
      title: article.title,
      source: article.source,
      category: article.category,
      time: article.time,
      cardImage: cardImage ?? null,
      image: article.image ?? null,
      imageUrl: article.imageUrl ?? null,
      urlToImage: article.urlToImage ?? null,
      mediaContent: article.mediaContent ?? null,
      enclosureUrl: article.enclosureUrl ?? null,
      thumbnail: article.thumbnail ?? null,
      description: article.description ?? null,
      url: article.url ?? null,
      publishedAt: article.publishedAt ?? null,
      content: article.content ?? null,
      storedAt: Date.now(),
    };

    window.localStorage.setItem(ARTICLE_METADATA_STORAGE_KEY, JSON.stringify(existingCache));
  } catch (error) {
    console.error("ARTICLE METADATA CACHE WRITE FAILED", error);
  }
}

function getStableArticleKey(article: Pick<Article, "id" | "title" | "source" | "url" | "publishedAt">) {
  return buildStableArticleKey(article);
}

function isSportsFeaturedCandidate(article: Pick<Article, "title" | "source" | "category">) {
  const categoryLabel = getDisplayCategory(article.category, {
    source: article.source,
    title: article.title,
  });
  const haystack = `${article.title} ${article.source} ${categoryLabel}`.toLowerCase();
  return MY_NEWS_FEATURED_SPORTS_PATTERN.test(haystack);
}

function articleMatchesSelectedCategory(article: Article, selectedCategory: string) {
  const normalizedCategory = normalizeSelectedCategoryName(selectedCategory);
  const displayCategory = getDisplayCategory(article.category, {
    source: article.source,
    title: article.title,
  });

  if (displayCategory.toLowerCase() === normalizedCategory.toLowerCase()) {
    return true;
  }

  return isStrictCategoryMatch(
    normalizedCategory,
    [
      article.title,
      article.description,
      article.source,
      displayCategory,
      article.url,
      article.content,
      article.image,
    ],
    "article"
  );
}

function videoMatchesSelectedCategory(video: VideoItem, selectedCategory: string) {
  const normalizedCategory = normalizeSelectedCategoryName(selectedCategory);
  return isStrictCategoryMatch(
    normalizedCategory,
    [video.title, video.creator, video.category, video.watchUrl, video.thumbnailUrl],
    "video"
  );
}

function resolveMyNewsCategoryVideoTab(category: string): SharedVideoTab {
  return resolveVideoCategoryForMyNewsCategory(normalizeSelectedCategoryName(category));
}

function getMyNewsCategoryVideoQueries(category: string) {
  return (
    MY_NEWS_CATEGORY_VIDEO_QUERIES[category] ?? [
      `${getCategoryLabel(category)} news video`,
      `${getCategoryLabel(category)} highlights`,
    ]
  );
}

function isRecipeArticle(article: Pick<Article, "title" | "description" | "source" | "category">) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
  return /(recipe|recipes|how to make|chef|cook|cooking|bake|baking|dinner|dessert|meal prep|nyt cooking|allrecipes|food network|delish|bon appétit|serious eats|epicurious|taste of home|food & wine|eater)/.test(
    haystack
  );
}

function isRecipeVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  return /(recipe|recipes|how to make|chef|cook|cooking|bake|baking|dinner|dessert|meal prep|nyt cooking|allrecipes|food network|delish|bon appétit|serious eats|epicurious|taste of home|food & wine|eater)/.test(
    haystack
  );
}

function getRecipeSourcePriority(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return RECIPE_PREFERRED_SOURCE_PATTERN.test(value) ? 2 : 0;
}

function isBroadSportsArticle(article: Pick<Article, "title" | "description" | "source" | "category">) {
  const displayCategory = getDisplayCategory(article.category, {
    source: article.source,
    title: article.title,
  });
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${displayCategory}`;
  return (
    SELECTED_CATEGORY_MATCHERS.Sports.test(haystack) || BROAD_SPORTS_SOURCE_PATTERN.test(haystack)
  );
}

function getSportsLeagueOrTeamFallbackImageUrl(article: Pick<Article, "title" | "description" | "source" | "category">) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();

  const mlbTeamMap: Array<[RegExp, string]> = [
    [/\byankees\b/, "/team-logos/mlb-yankees.png"],
    [/\bdodgers\b/, "/team-logos/mlb-dodgers.png"],
    [/\bbraves\b/, "/team-logos/mlb-braves.png"],
    [/\bastros\b/, "/team-logos/mlb-astros.png"],
    [/\brangers\b/, "/team-logos/mlb-rangers.png"],
    [/\bcubs\b/, "/team-logos/mlb-cubs.png"],
    [/\bmets\b/, "/team-logos/mlb-mets.png"],
    [/\bphillies\b/, "/team-logos/mlb-phillies.png"],
    [/\bred sox\b/, "/team-logos/mlb-red-sox.png"],
    [/\bpadres\b/, "/team-logos/mlb-padres.png"],
  ];

  for (const [pattern, url] of mlbTeamMap) {
    if (pattern.test(haystack)) {
      return url;
    }
  }

  if (/\bmlb|baseball\b/.test(haystack)) {
    return "/category-images/mlb.png";
  }

  if (/\bnfl|super bowl|afc|nfc|football\b/.test(haystack)) {
    return "/category-images/nfl.png";
  }

  if (/\bnba|basketball\b/.test(haystack)) {
    return "/category-images/sports.png";
  }

  if (/\bnhl|hockey|stanley cup\b/.test(haystack)) {
    return "/category-images/nhl.png";
  }

  if (/\bmls|major league soccer|soccer|inter miami|charlotte fc|lafc|atlanta united|fc cincinnati|seattle sounders\b/.test(haystack)) {
    return "/category-images/mls.png";
  }

  return getCategoryImageUrl("Sports");
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getTopicImagePool(imageKey: string) {
  const normalizedKey = imageKey.toLowerCase();
  const imagePool = TOPIC_IMAGE_FILENAMES.filter((filename) => {
    const normalizedFilename = filename.toLowerCase().replace(/\.png$/i, "");

    if (normalizedFilename === normalizedKey) {
      return true;
    }

    if (new RegExp(`^${normalizedKey}\\d+$`, "i").test(normalizedFilename)) {
      return true;
    }

    if (normalizedKey === "tornado" && normalizedFilename === "thunderstorm") {
      return true;
    }

    if (normalizedKey === "tornado" && normalizedFilename === "tornado-warning") {
      return true;
    }

    if (normalizedKey === "floods" && ["flooding", "flash-flooding", "flash-floods"].includes(normalizedFilename)) {
      return true;
    }

    if (normalizedKey === "floods" && normalizedFilename === "flash-flood") {
      return true;
    }

    if (normalizedKey === "ukraine" && normalizedFilename === "ukraine-war") {
      return true;
    }

    if (normalizedKey === "who" && normalizedFilename === "ebola") {
      return true;
    }

    if (normalizedKey === "economy" && ["economists", "wall-street", "sp500"].includes(normalizedFilename)) {
      return true;
    }

    if (normalizedKey === "economy" && ["wall-st", "finance", "brokerages"].includes(normalizedFilename)) {
      return true;
    }

    if (normalizedKey === "dodgers" && normalizedFilename === "los-angeles-dodgers") {
      return true;
    }

    if (normalizedKey === "eagles" && normalizedFilename === "philadelphia-eagles") {
      return true;
    }

    return false;
  }).map((filename) => `/topic-images/${filename}`);

  return imagePool;
}

function getTopicFallbackImage(article: Pick<Article, "title" | "description" | "source" | "category" | "content" | "url">) {
  const haystack = [
    article.title,
    article.description,
    article.content,
    article.source,
    article.category,
    article.url,
  ]
    .filter(Boolean)
    .join(" ");

  const matchingGroup = TOPIC_FALLBACK_IMAGE_GROUPS.find((group) => group.pattern.test(haystack));

  if (!matchingGroup) {
    return null;
  }

  const imagePool = getTopicImagePool(matchingGroup.imageKey);

  if (imagePool.length === 0) {
    return null;
  }

  const stableKey = cleanDisplayText(article.url ?? article.title ?? "").trim().toLowerCase();
  const rotationIndex = stableKey ? hashString(stableKey) % imagePool.length : 0;
  const selectedImage = imagePool[rotationIndex] ?? imagePool[0] ?? null;

  if (selectedImage) {
    console.log("TOPIC FALLBACK ROTATION_USED", {
      keyword: matchingGroup.keyword,
      index: rotationIndex,
      image: selectedImage,
      poolSize: imagePool.length,
      title: cleanDisplayText(article.title),
    });
  }

  return selectedImage;
}

function filterArticlesBySelectedCategories(articles: Article[], selectedCategories: string[]) {
  if (selectedCategories.length === 0) {
    return {
      filteredArticles: articles,
      removedCount: 0,
    };
  }

  const normalizedSelectedCategories = Array.from(
    new Set(selectedCategories.map((category) => cleanDisplayText(category).trim()).filter(Boolean))
  );
  const filteredArticles = articles.filter((article) =>
    normalizedSelectedCategories.some((category) => articleMatchesSelectedCategory(article, category))
  );

  return {
    filteredArticles,
    removedCount: Math.max(0, articles.length - filteredArticles.length),
  };
}

const LOCAL_CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "Chicago, IL": { latitude: 41.8781, longitude: -87.6298 },
  "Los Angeles, CA": { latitude: 34.0522, longitude: -118.2437 },
  "New York, NY": { latitude: 40.7128, longitude: -74.006 },
  "Atlanta, GA": { latitude: 33.749, longitude: -84.388 },
  "Charlotte, NC": { latitude: 35.2271, longitude: -80.8431 },
  "Austin, TX": { latitude: 30.2672, longitude: -97.7431 },
  "Houston, TX": { latitude: 29.7604, longitude: -95.3698 },
  "Jacksonville, FL": { latitude: 30.3322, longitude: -81.6557 },
  "San Diego, CA": { latitude: 32.7157, longitude: -117.1611 },
  "Dallas, TX": { latitude: 32.7767, longitude: -96.797 },
  "Phoenix, AZ": { latitude: 33.4484, longitude: -112.074 },
  "Philadelphia, PA": { latitude: 39.9526, longitude: -75.1652 },
};

type SupportedLocalCity = keyof typeof LOCAL_CITY_CONFIGS;

type CachedFeedPayload = {
  articles: Article[];
  page: number;
  hasMore: boolean;
  savedAt: string;
};

const LOCAL_METRO_STATE_FALLBACKS: Array<{
  city: SupportedLocalCity;
  states: string[];
  tokens?: string[];
}> = [
  { city: "Charlotte, NC", states: ["north carolina", "south carolina"], tokens: ["charlotte", "mecklenburg", "queen city", "gastonia", "concord", "rock hill"] },
  { city: "Chicago, IL", states: ["illinois"], tokens: ["chicago", "cook county", "evanston", "oak park", "naperville"] },
  { city: "Los Angeles, CA", states: ["california"], tokens: ["los angeles", "hollywood", "pasadena", "santa monica", "burbank", "long beach"] },
  { city: "New York, NY", states: ["new york", "new jersey", "connecticut"], tokens: ["new york", "nyc", "brooklyn", "queens", "bronx", "manhattan", "jersey city"] },
  { city: "Atlanta, GA", states: ["georgia"], tokens: ["atlanta", "fulton county", "buckhead", "decatur"] },
];

function getFeedCacheKey(
  mode:
    | "trending"
    | "latest"
    | "polls"
    | "local"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business"
) {
  return mode === "local"
    ? `graffiti:last-feed:${mode}:charlotte-nc`
    : mode === "sports"
      ? `graffiti:last-feed:${mode}`
      : mode === "celebrity" || mode === "weather"
        ? `graffiti:last-feed:${mode}`
      : `graffiti:last-feed:${mode}`;
}

function readCachedFeedPayload(cacheKey: string): CachedFeedPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(cacheKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as CachedFeedPayload | null;

    if (
      !parsed ||
      !Array.isArray(parsed.articles) ||
      typeof parsed.page !== "number" ||
      typeof parsed.hasMore !== "boolean"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Error reading cached feed payload:", error);
    return null;
  }
}

function writeCachedFeedPayload(cacheKey: string, payload: CachedFeedPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.error("Error writing cached feed payload:", error);
  }
}

const NATIONAL_SOURCE_KEYWORDS = [
  "fox news",
  "cnn",
  "msnbc",
  "reuters",
  "associated press",
  "ap news",
  "nbc news",
  "cbs news",
  "abc news",
  "newsmax",
];

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function normalizeLookupValue(value: string | null | undefined) {
  return cleanDisplayText(value ?? "")
    .trim()
    .toLowerCase();
}

function matchesLookupSignal(text: string, signal: string) {
  const normalizedSignal = normalizeLookupValue(signal);

  if (!normalizedSignal) {
    return false;
  }

  if (normalizedSignal.length <= 3) {
    const escaped = normalizedSignal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }

  return text.includes(normalizedSignal);
}

function getSupportedLocalCityConfig(
  city?: string | null,
  state?: string | null,
  label?: string | null
) {
  const combined = [city, state, label].filter(Boolean).join(" ");
  const config = getLocalCityConfigByText(combined);

  if (!config) {
    return null;
  }

  return [config.displayName, config] as const;
}

function buildLocalNewsQuery(options?: {
  city?: string | null;
  state?: string | null;
  label?: string | null;
}) {
  const label = cleanDisplayText(options?.label ?? "").trim();
  const city = cleanDisplayText(options?.city ?? "").trim();
  const state = cleanDisplayText(options?.state ?? "").trim();

  const localCityMatch = getSupportedLocalCityConfig(city, state, label);

  if (localCityMatch) {
    return buildLocalNewsQueryText(localCityMatch[1]);
  }

  const fallbackLabel = label || [city, state].filter(Boolean).join(", ");
  return fallbackLabel ? `${fallbackLabel} local news` : "United States local news";
}

function resolveSupportedMetroCity(options?: {
  city?: string | null;
  state?: string | null;
  label?: string | null;
}): SupportedLocalCity | null {
  const label = cleanDisplayText(options?.label ?? "").trim();
  const city = cleanDisplayText(options?.city ?? "").trim();
  const state = cleanDisplayText(options?.state ?? "").trim();

  const directMatch = getSupportedLocalCityConfig(city, state, label);

  if (directMatch) {
    return directMatch[0] as SupportedLocalCity;
  }

  const haystack = normalizeLookupValue(`${city} ${state} ${label}`);

  for (const fallback of LOCAL_METRO_STATE_FALLBACKS) {
    const stateMatched = fallback.states.some((candidateState) =>
      normalizeLookupValue(`${state} ${label}`).includes(candidateState)
    );
    const tokenMatched = fallback.tokens?.some((token) => haystack.includes(token)) ?? false;

    if (tokenMatched || stateMatched) {
      return fallback.city;
    }
  }

  return null;
}

function getWeatherLabel(weatherCode: number | null | undefined) {
  if (weatherCode === null || weatherCode === undefined) {
    return "Local forecast";
  }

  if (weatherCode === 0) return "Clear";
  if ([1, 2].includes(weatherCode)) return "Partly cloudy";
  if (weatherCode === 3) return "Cloudy";
  if ([45, 48].includes(weatherCode)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "Snow";
  if ([95, 96, 99].includes(weatherCode)) return "Thunderstorms";
  return "Forecast";
}

function parseForecastCalendarDate(dateString: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return new Date(`${dateString}T12:00:00`);
  }

  return new Date(dateString);
}

function formatForecastDayLabel(dateString: string, index: number) {
  const date = parseForecastCalendarDate(dateString);

  if (Number.isNaN(date.getTime())) {
    return index === 0 ? "Today" : `Day ${index + 1}`;
  }

  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";

  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function formatForecastDateLabel(dateString: string) {
  const date = parseForecastCalendarDate(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRadarTimeLabel(timestampSeconds: number) {
  const date = new Date(timestampSeconds * 1000);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getLocalSearchTerms(localQuery: string, localLocationLabel: string) {
  const combined = normalizeLookupValue(`${localLocationLabel} ${localQuery}`);
  const terms = combined
    .split(/[^a-z0-9]+/i)
    .filter(
      (term) =>
        term.length >= 3 &&
        !["local", "news", "north", "south", "carolina", "united", "states", "regional"].includes(
          term
        )
    );

  return Array.from(new Set(terms));
}

function scoreLocalArticle(article: Article, localQuery: string, localLocationLabel: string) {
  const sourceName = normalizeLookupValue(article.source);
  const title = normalizeLookupValue(article.title);
  const description = normalizeLookupValue(article.description);
  const articleText = `${title} ${description} ${normalizeLookupValue(article.url)}`;
  const localTerms = getLocalSearchTerms(localQuery, localLocationLabel);
  const matchedLocalCity = getSupportedLocalCityConfig(undefined, undefined, `${localLocationLabel} ${localQuery}`);
  const articleAgeHours = article.publishedAt
    ? Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60))
    : 48;
  let score = Math.max(0, 120 - articleAgeHours);

  const localTermMatches = localTerms.filter((term) => articleText.includes(term)).length;
  score += localTermMatches * 18;

  if (matchedLocalCity) {
    const localConfig = matchedLocalCity[1];
    const hasLocalSource = localConfig.allowedSources.some((source) =>
      sourceName.includes(normalizeLookupValue(source))
    );
    const hasLocalStorySignal = [
      ...localConfig.strictTerms,
      ...localConfig.sourceAliases,
      localConfig.city,
      localConfig.state,
    ].some((signal) => matchesLookupSignal(articleText, signal));

    if (hasLocalSource) {
      score += 220;
    }

    if (hasLocalStorySignal) {
      score += 95;
    }

    if (
      !hasLocalSource &&
      !hasLocalStorySignal &&
      NATIONAL_SOURCE_KEYWORDS.some((keyword) => sourceName.includes(keyword))
    ) {
      score -= 95;
    }
  } else {
    const hasLocationInSource = localTerms.some((term) => sourceName.includes(term));
    if (hasLocationInSource) {
      score += 48;
    }
  }

  if (
    !localTermMatches &&
    NATIONAL_SOURCE_KEYWORDS.some((keyword) => sourceName.includes(keyword))
  ) {
    score -= 30;
  }

  return score;
}

const actionIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function formatPublishedDate(publishedAt?: string | null, fallback?: string) {
  return formatRelativeTimestamp(publishedAt, fallback);
}

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) {
    return "Just now";
  }

  const createdAt = new Date(timestamp).getTime();

  if (Number.isNaN(createdAt)) {
    return "Just now";
  }

  const diffMs = Date.now() - createdAt;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes === 1) {
    return "1 minute ago";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours === 1) {
    return "1 hour ago";
  }

  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return "1 day ago";
  }

  return `${diffDays} days ago`;
}

function formatFreshnessTime(
  timestamp: string | null | undefined,
  fallback?: string | null
) {
  return formatRelativeTimestamp(timestamp, fallback);
}

function normalizePodcastArtworkUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }

  return trimmed;
}

function buildLocalPodcastCoverCandidates(slug: string) {
  return [
    `/podcast-covers/${slug}.png`,
    `/podcast-covers/${slug}.jpg`,
    `/podcast-covers/${slug}.webp`,
  ];
}

function getTrendingPodcastImageCandidates(show: TrendingPodcastCard) {
  const unique = new Set<string>();
  return [
    ...buildLocalPodcastCoverCandidates(show.slug),
    show.image,
    show.artworkUrl600,
    show.artworkUrl100,
    show.artwork,
    show.podcastImage,
    show.feedImage,
    show.itunesImage,
  ]
    .map((value) => normalizePodcastArtworkUrl(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (unique.has(value)) {
        return false;
      }
      unique.add(value);
      return true;
    });
}

function getArticleDeduplicationKey(article: Pick<Article, "id" | "url" | "title" | "source">) {
  const normalizedUrl = (() => {
    try {
      if (!article.url?.trim()) {
        return "";
      }
      const parsed = new URL(article.url.trim());
      parsed.hash = "";
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
      ].forEach((key) => parsed.searchParams.delete(key));
      return parsed.toString().toLowerCase();
    } catch {
      return article.url?.trim().toLowerCase() ?? "";
    }
  })();

  if (normalizedUrl) {
    return `url:${normalizedUrl}`;
  }

  const normalizedTitle = article.title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");

  return `title:${article.source.trim().toLowerCase()}:${normalizedTitle}`;
}

function getSportsArticleDuplicateKeys(article: Pick<Article, "url" | "title" | "source">) {
  const normalizedUrl = (() => {
    try {
      if (!article.url?.trim()) {
        return "";
      }
      const parsed = new URL(article.url.trim());
      parsed.hash = "";
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
      ].forEach((key) => parsed.searchParams.delete(key));
      return parsed.toString().toLowerCase();
    } catch {
      return article.url?.trim().toLowerCase() ?? "";
    }
  })();

  const normalizedTitle = cleanDisplayText(article.title ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedSource = cleanDisplayText(article.source ?? "").toLowerCase().trim();

  return [
    normalizedUrl ? `url:${normalizedUrl}` : null,
    normalizedTitle ? `title:${normalizedTitle}` : null,
    normalizedTitle && normalizedSource ? `source-title:${normalizedSource}:${normalizedTitle}` : null,
    normalizedTitle ? `normalized-title:${normalizedTitle}` : null,
  ].filter((value): value is string => Boolean(value));
}

function mergeArticlesByIdentity(existing: Article[], incoming: Article[]) {
  const merged = [...existing];
  const existingIndexByKey = new Map(
    existing.map((article, index) => [getArticleDeduplicationKey(article), index])
  );

  const getImageScore = (article: Article) =>
    Number(
      Boolean(
        article.urlToImage ||
          article.imageUrl ||
          article.image ||
          article.ogImage ||
          article.mediaContent ||
          article.enclosureUrl
      )
    );

  incoming.forEach((article) => {
    const dedupeKey = getArticleDeduplicationKey(article);
    const existingIndex = existingIndexByKey.get(dedupeKey);

    if (existingIndex !== undefined) {
      const current = merged[existingIndex];
      const currentTime = current.publishedAt ? new Date(current.publishedAt).getTime() : 0;
      const nextTime = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
      const shouldReplace =
        nextTime > currentTime ||
        (nextTime === currentTime && getImageScore(article) > getImageScore(current));

      if (shouldReplace) {
        merged[existingIndex] = {
          ...current,
          ...article,
        };
      }
      return;
    }

    existingIndexByKey.set(dedupeKey, merged.length);
    merged.push(article);
  });

  return merged;
}

function selectSourceBalancedVideos(
  videos: VideoItem[],
  limit: number,
  maxPerSourceOverride?: number
) {
  if (videos.length <= limit) {
    return videos;
  }

  const normalizedSourceCounts = new Map<string, number>();
  const normalizedSources = new Set(
    videos.map((video) => cleanDisplayText(video.creator).trim().toLowerCase()).filter(Boolean)
  );
  const maxPerSource =
    maxPerSourceOverride ?? (normalizedSources.size > 1 ? 2 : limit);
  const selected: VideoItem[] = [];
  const deferred: VideoItem[] = [];

  videos.forEach((video) => {
    const normalizedSource = cleanDisplayText(video.creator).trim().toLowerCase() || "unknown";
    const nextCount = (normalizedSourceCounts.get(normalizedSource) ?? 0) + 1;

    if (nextCount <= maxPerSource) {
      normalizedSourceCounts.set(normalizedSource, nextCount);
      selected.push(video);
      return;
    }

    deferred.push(video);
  });

  const remainingSlots = Math.max(0, limit - selected.length);
  return [...selected, ...deferred.slice(0, remainingSlots)].slice(0, limit);
}

function ensureMinimumVideoCount(
  primaryVideos: VideoItem[],
  fallbackVideos: VideoItem[],
  minimumCount: number
) {
  if (primaryVideos.length >= minimumCount) {
    return primaryVideos;
  }

  const merged = dedupeVideosBySourceTitleAndUrl([...primaryVideos, ...fallbackVideos]);
  return merged.slice(0, Math.max(minimumCount, merged.length));
}

function prioritizeTopQuickWatchVideos(videos: VideoItem[]) {
  return [...videos].sort((leftVideo, rightVideo) => {
    const scoreVideo = (video: VideoItem) => {
      const source = cleanDisplayText(video.creator).trim().toLowerCase();
      const title = cleanDisplayText(video.title).trim().toLowerCase();
      let score = 0;

      if (TOP_QUICK_WATCH_PREFERRED_SOURCE_PATTERN.test(source)) {
        score += 120;
      }

      if (TOP_QUICK_WATCH_DEPRIORITIZED_SOURCE_PATTERN.test(source)) {
        score -= 48;
      }

      if (/(overlay|info card|end screen|subscribe)/i.test(title)) {
        score -= 40;
      }

      if (video.orientation === "vertical") {
        score += 28;
      }

      const publishedAt = video.publishedAt ? new Date(video.publishedAt).getTime() : 0;
      return score * 1_000_000 + publishedAt;
    };

    return scoreVideo(rightVideo) - scoreVideo(leftVideo);
  });
}

function buildTopQuickWatchRow(videos: VideoItem[], limit: number) {
  const selected: VideoItem[] = [];
  const sourceCounts = new Map<string, number>();
  let combinedLimitedCount = 0;
  const prioritizedVideos = prioritizeTopQuickWatchVideos(videos);

  for (const video of prioritizedVideos) {
    const normalizedSource = cleanDisplayText(video.creator).trim().toLowerCase() || "unknown";
    const sourceCount = sourceCounts.get(normalizedSource) ?? 0;
    const isCombinedLimitedSource = QUICK_WATCH_COMBINED_LIMITED_SOURCES.has(normalizedSource);

    if (sourceCount >= 1) {
      continue;
    }

    if (isCombinedLimitedSource && combinedLimitedCount >= 2) {
      continue;
    }

    selected.push(video);
    sourceCounts.set(normalizedSource, sourceCount + 1);

    if (isCombinedLimitedSource) {
      combinedLimitedCount += 1;
    }

    if (selected.length >= limit) {
      break;
    }
  }

  if (selected.length < limit) {
    for (const video of prioritizedVideos) {
      const normalizedSource = cleanDisplayText(video.creator).trim().toLowerCase() || "unknown";
      const sourceCount = sourceCounts.get(normalizedSource) ?? 0;
      const isCombinedLimitedSource = QUICK_WATCH_COMBINED_LIMITED_SOURCES.has(normalizedSource);

      if (selected.some((selectedVideo) => selectedVideo.id === video.id)) {
        continue;
      }

      if (sourceCount >= 2) {
        continue;
      }

      if (isCombinedLimitedSource && combinedLimitedCount >= 2) {
        continue;
      }

      selected.push(video);
      sourceCounts.set(normalizedSource, sourceCount + 1);

      if (isCombinedLimitedSource) {
        combinedLimitedCount += 1;
      }

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

function dedupeVideosBySourceTitleAndUrl(videos: VideoItem[]) {
  return Array.from(
    new Map(
      videos.map((video) => [
        [
          cleanDisplayText(video.watchUrl).trim().toLowerCase(),
          cleanDisplayText(video.title).trim().toLowerCase(),
          cleanDisplayText(video.creator).trim().toLowerCase(),
        ].join("::"),
        video,
      ])
    ).values()
  );
}

function getBreakingNewsSourcePriority(article: Article) {
  const normalizedSource = getSafeSourceLabel(article.source).trim().toLowerCase();
  const trustedIndex = BREAKING_NEWS_TRUSTED_SOURCES.findIndex((source) =>
    normalizedSource.includes(source.toLowerCase())
  );

  if (trustedIndex >= 0) {
    return BREAKING_NEWS_TRUSTED_SOURCES.length - trustedIndex;
  }

  return 0;
}

function isPublishedTodayInNewYork(publishedAt?: string | null) {
  const timestamp = getPublishedAtTimestamp(publishedAt);

  if (!timestamp) {
    return false;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(timestamp) === formatter.format(Date.now());
}

function isPublishedWithinHours(publishedAt: string | null | undefined, hours: number) {
  const timestamp = getPublishedAtTimestamp(publishedAt);

  if (!timestamp) {
    return false;
  }

  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function isLowInformationLiveStreamArticle(article: Pick<Article, "title" | "description" | "source" | "category">) {
  const title = cleanDisplayText(article.title);
  const description = cleanDisplayText(article.description ?? "");
  const source = cleanDisplayText(article.source);
  const category = cleanDisplayText(article.category ?? "");
  const haystack = `${title} ${description} ${source} ${category}`;

  if (!LOW_INFORMATION_LIVE_STREAM_PATTERN.test(haystack) && !LOW_INFORMATION_STATION_BRANDING_PATTERN.test(haystack)) {
    return false;
  }

  const descriptiveNewsContext =
    /\b(shooting|storm|hurricane|tornado|flood|fire|election|court|ruling|policy|war|attack|earthquake|wildfire|economy|inflation|strike|protest|nasa|science|research|album|concert|season|series|box office|movie|trailer|trade|injury|playoffs|finals|championship|highlights)\b/i.test(
      haystack
    );

  const repeatedBranding =
    /\s-\s/.test(title) &&
    /(eyewitness news|live streaming video|watch live|news live|streaming video)/i.test(title);

  return !descriptiveNewsContext || repeatedBranding;
}

function isHighQualityBreakingRecentArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.category ?? ""} ${article.source}`;

  if (
    BREAKING_NEWS_SPORTS_PATTERN.test(haystack) ||
    BREAKING_NEWS_SOFT_STORY_PATTERN.test(haystack) ||
    BREAKING_NEWS_ANALYSIS_PATTERN.test(haystack) ||
    isLowInformationLiveStreamArticle(article)
  ) {
    return false;
  }

  if (getBreakingNewsSourcePriority(article) <= 0) {
    return false;
  }

  if (!isPublishedTodayInNewYork(article.publishedAt) && !isPublishedWithinHours(article.publishedAt, 24)) {
    return false;
  }

  return /\b(lat(est)?|today|overnight|confirmed|government|election|war|attack|storm|hurricane|flood|earthquake|wildfire|court|ruling|economy|inflation|policy|protest|dead|killed|injured|crash|fire|evacuation)\b/i.test(
    haystack
  );
}

function isBreakingNewsEligible(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${
    article.category ?? ""
  } ${article.source}`;

  if (BREAKING_NEWS_SPORTS_PATTERN.test(haystack)) {
    return false;
  }

  if (BREAKING_NEWS_SOFT_STORY_PATTERN.test(haystack)) {
    return false;
  }

  if (BREAKING_NEWS_ANALYSIS_PATTERN.test(haystack)) {
    return false;
  }

  if (cleanDisplayText(article.category).trim().toLowerCase() === "search") {
    return false;
  }

  if (isLowInformationLiveStreamArticle(article)) {
    return false;
  }

  return (
    BREAKING_NEWS_REQUIRED_PATTERN.test(haystack) ||
    isHighQualityBreakingRecentArticle(article) ||
    BREAKING_NEWS_URGENCY_PATTERN.test(haystack) ||
    /\b(breaking news|live blog|live updates|developing story|just in)\b/i.test(haystack)
  );
}

function getBreakingNewsRelevanceScore(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.category} ${article.source}`;

  if (BREAKING_NEWS_SPORTS_PATTERN.test(haystack)) {
    return -5000;
  }

  let score = getBreakingNewsSourcePriority(article) * 100;

  if (BREAKING_NEWS_REQUIRED_PATTERN.test(haystack)) {
    score += 180;
  }

  if (BREAKING_NEWS_URGENCY_PATTERN.test(haystack)) {
    score += 150;
  }

  if (/\b(breaking news|live blog|live updates|developing story|just in)\b/i.test(haystack)) {
    score += 120;
  }

  if (BREAKING_NEWS_SOFT_STORY_PATTERN.test(haystack)) {
    return -2500;
  }

  if (BREAKING_NEWS_ANALYSIS_PATTERN.test(haystack)) {
    return -1800;
  }

  if (cleanDisplayText(article.category).trim().toLowerCase() === "search") {
    return -1200;
  }

  if (isPublishedTodayInNewYork(article.publishedAt)) {
    score += 90;
  }

  score += Math.max(
    0,
    72 - Math.floor((Date.now() - getPublishedAtTimestamp(article.publishedAt)) / (1000 * 60 * 60))
  );

  return score;
}

function buildNationalWeatherMapEmbedHtml(
  framePoints: RadarFramePoint[],
  pastFrameCount: number,
  options?: NationalWeatherMapEmbedOptions
) {
  const showSelectedTimeLabel = options?.showSelectedTimeLabel ?? false;
  const interactive = options?.interactive ?? false;
  const serializedFrames = JSON.stringify(framePoints);
  const currentFrameIndex = Math.max(0, pastFrameCount - 1);
  const leftBoundaryLabel = framePoints[0]?.label ?? "";
  const rightBoundaryLabel = framePoints[framePoints.length - 1]?.label ?? "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      crossorigin=""
    />
    <style>
      html, body, #map { margin: 0; height: 100%; width: 100%; background: #07111f; }
      body { overflow: hidden; }
      .leaflet-control-attribution { display: none; }
      .leaflet-container {
        background:
          radial-gradient(circle at top, rgba(56, 189, 248, 0.10), transparent 40%),
          linear-gradient(180deg, #08111f, #0b1728);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .map-shell {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
        height: 100%;
        width: 100%;
      }
      .map-badge {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 999;
        padding: 8px 10px;
        border-radius: 999px;
        color: rgba(226, 232, 240, 0.95);
        background: rgba(7, 17, 31, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.18);
        backdrop-filter: blur(12px);
        font-size: 12px;
        letter-spacing: 0.01em;
      }
      .timeline-shell {
        display: grid;
        gap: 8px;
        padding: 12px 14px 14px;
        background: rgba(7, 17, 31, 0.82);
        border-top: 1px solid rgba(148, 163, 184, 0.14);
      }
      .timeline-label-row, .timeline-meta-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: rgba(226, 232, 240, 0.92);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .timeline-label-row {
        font-size: 12px;
        letter-spacing: 0.02em;
      }
      .timeline-meta-row {
        font-size: 12px;
      }
      .timeline-meta-row[hidden] {
        display: none;
      }
      .timeline-slider {
        width: 100%;
        accent-color: #38bdf8;
      }
    </style>
  </head>
  <body>
    <div class="map-shell">
      <div style="position: relative; min-height: 0;">
        <div id="map"></div>
        <div class="map-badge">National radar</div>
      </div>
      <div class="timeline-shell">
        <div class="timeline-label-row">
          <span>${leftBoundaryLabel}</span>
          <span>Now</span>
          <span>${rightBoundaryLabel}</span>
        </div>
        <input id="timeline" class="timeline-slider" type="range" min="0" max="${Math.max(
          0,
          framePoints.length - 1
        )}" step="1" value="${currentFrameIndex}" />
        <div class="timeline-meta-row" ${showSelectedTimeLabel ? "" : "hidden"}>
          <span id="timelinePosition">Current</span>
        </div>
      </div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      const frames = ${serializedFrames};
      const map = L.map("map", {
        zoomControl: false,
        attributionControl: false,
        dragging: ${interactive ? "true" : "false"},
        scrollWheelZoom: ${interactive ? "true" : "false"},
        doubleClickZoom: ${interactive ? "true" : "false"},
        boxZoom: ${interactive ? "true" : "false"},
        keyboard: false,
        tap: false
      }).setView([39.8283, -98.5795], 4);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 6
      }).addTo(map);

      const bounds = L.latLngBounds(
        L.latLng(24.396308, -125.0),
        L.latLng(49.384358, -66.93457)
      );
      map.fitBounds(bounds, { padding: [0, 0] });

      const timeline = document.getElementById("timeline");
      const timelinePosition = document.getElementById("timelinePosition");

      if (frames.length > 0) {
        const overlays = frames.map((frame) => {
          const overlay = L.tileLayer(frame.tileUrl, {
            tileSize: 256,
            opacity: 0,
            updateWhenIdle: true,
            crossOrigin: true
          });
          overlay.addTo(map);
          return overlay;
        });

        let activeIndex = ${currentFrameIndex};

        const setActiveFrame = (nextIndex) => {
          activeIndex = Math.max(0, Math.min(overlays.length - 1, Number(nextIndex) || 0));

          overlays.forEach((overlay, index) => {
            overlay.setOpacity(index === activeIndex ? 0.6 : 0);
          });

          if (timeline) {
            timeline.value = String(activeIndex);
          }

          if (timelinePosition) {
            const frame = frames[activeIndex];
            if (activeIndex === ${Math.max(0, pastFrameCount - 1)}) {
              timelinePosition.textContent = "Current";
            } else if (frame && frame.isFuture) {
              timelinePosition.textContent = frame.label;
            } else {
              timelinePosition.textContent = frame ? frame.label : "";
            }
          }
        };

        overlays.forEach((overlay) => {
          try {
            overlay.once("load", () => {});
          } catch (error) {}
        });

        setActiveFrame(activeIndex);

        if (timeline) {
          timeline.addEventListener("input", (event) => {
            setActiveFrame(event.target.value);
          });
        }
      }
    </script>
  </body>
</html>`;
}

function selectSourceBalancedArticles<T extends { source: string }>(articles: T[], limit: number) {
  const prioritizedArticles = [...articles].sort((leftArticle, rightArticle) => {
    const rightScore = getArticlePriorityScore(rightArticle as unknown as Article);
    const leftScore = getArticlePriorityScore(leftArticle as unknown as Article);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return (
      getPublishedAtTimestamp((rightArticle as unknown as Article).publishedAt) -
      getPublishedAtTimestamp((leftArticle as unknown as Article).publishedAt)
    );
  });

  if (prioritizedArticles.length <= limit) {
    return prioritizedArticles;
  }

  const normalizedSourceCounts = new Map<string, number>();
  const normalizedSources = new Set(
    prioritizedArticles
      .map((article) => cleanDisplayText(article.source).trim().toLowerCase())
      .filter(Boolean)
  );
  const maxPerSource = normalizedSources.size > 1 ? 2 : limit;
  const selected: T[] = [];
  const deferred: T[] = [];

  prioritizedArticles.forEach((article) => {
    const normalizedSource = cleanDisplayText(article.source).trim().toLowerCase() || "unknown";
    const nextCount = (normalizedSourceCounts.get(normalizedSource) ?? 0) + 1;

    if (nextCount <= maxPerSource) {
      normalizedSourceCounts.set(normalizedSource, nextCount);
      selected.push(article);
      return;
    }

    deferred.push(article);
  });

  const remainingSlots = Math.max(0, limit - selected.length);
  return [...selected, ...deferred.slice(0, remainingSlots)].slice(0, limit);
}

function selectArticlesWithPreferredSourceCap<T extends { source: string }>(
  articles: T[],
  limit: number,
  preferredMaxPerSource = 1
) {
  if (articles.length <= limit) {
    return articles.slice(0, limit);
  }

  const sourceCounts = new Map<string, number>();
  const firstPass: T[] = [];
  const deferred: T[] = [];

  articles.forEach((article) => {
    const normalizedSource = cleanDisplayText(article.source).trim().toLowerCase() || "unknown";
    const currentCount = sourceCounts.get(normalizedSource) ?? 0;

    if (currentCount < preferredMaxPerSource) {
      sourceCounts.set(normalizedSource, currentCount + 1);
      firstPass.push(article);
      return;
    }

    deferred.push(article);
  });

  return [...firstPass, ...deferred].slice(0, limit);
}

function normalizeNewsPayload(payload: FeedArticlePayload[] | PaginatedNewsResponse) {
  if (Array.isArray(payload)) {
    const renderableArticles = payload.filter((article) => isRenderableArticleRecord(article));
    return {
      articles: renderableArticles,
      hasMore: false,
      page: 1,
      pageSize: renderableArticles.length,
      nytKeyPresentFromNewsRoute: false,
      nytKeyLengthFromNewsRoute: 0,
      visiblePipelineDebug: undefined,
    };
  }

  const renderableArticles = (payload.articles ?? []).filter((article) =>
    isRenderableArticleRecord(article)
  );

  return {
    articles: renderableArticles,
    hasMore: payload.hasMore ?? false,
    page: payload.page ?? 1,
    pageSize: payload.pageSize ?? renderableArticles.length,
    nextPage: payload.nextPage ?? null,
    nytKeyPresentFromNewsRoute: payload.nytKeyPresentFromNewsRoute ?? false,
    nytKeyLengthFromNewsRoute: payload.nytKeyLengthFromNewsRoute ?? 0,
    visiblePipelineDebug: payload.visiblePipelineDebug,
  };
}

function hydrateFeedArticles(feedArticles: FeedArticlePayload[]) {
  return feedArticles.map((article) => ({
    ...article,
    likes: 0,
    likeUsers: [],
    likedByCurrentUser: false,
    comments: [],
    saved: false,
  })) as Article[];
}

function isFallbackFeedArticle(article: FeedArticlePayload) {
  return article.url?.includes("graffiti.app/fallback") ?? false;
}

function arraysShallowEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLeagueTeamRegex(league: FavoriteLeagueKey) {
  const pattern = FAVORITE_TEAMS_BY_LEAGUE[league]
    .map((team) => escapeRegExp(team.team_name))
    .join("|");

  return new RegExp(pattern, "i");
}

const MLB_TEAM_REGEX = buildLeagueTeamRegex("MLB");
const NFL_TEAM_REGEX = buildLeagueTeamRegex("NFL");
const NBA_TEAM_REGEX = buildLeagueTeamRegex("NBA");
const MLS_TEAM_REGEX = buildLeagueTeamRegex("MLS");
const NHL_TEAM_REGEX = buildLeagueTeamRegex("NHL");

function buildFavoriteTeamNewsQueries(team: FavoriteTeamOption) {
  const teamName = team.team_name.trim();
  const tokens = teamName.split(/\s+/);
  const shortName = tokens[tokens.length - 1] ?? teamName;
  const marketName = tokens.slice(0, -1).join(" ").trim();

  const queries = [
    `${teamName} news`,
    `${shortName} latest`,
    `ESPN ${teamName}`,
    `AP ${teamName}`,
  ];

  if (team.league === "MLB") {
    queries.push(`MLB.com ${teamName}`);
    if (/atlanta braves/i.test(teamName)) {
      queries.push("Battery Power Braves");
      queries.push("local Atlanta sports Braves");
    }
  }

  if (team.league === "MLS") {
    queries.push(`MLS ${teamName}`);
    if (/charlotte fc/i.test(teamName)) {
      queries.push("Queen City News Charlotte FC");
      queries.push("local Charlotte sports Charlotte FC");
    }
  }

  if (marketName) {
    queries.push(`${marketName} sports ${teamName}`);
    queries.push(`${marketName} local sports ${shortName}`);
  }

  return Array.from(new Set(queries));
}

const SPORTS_SECTION_CONFIGS: SportsSectionConfig[] = [
  {
    key: "MLB",
    label: "MLB",
    scoreLeague: "MLB",
    articlePattern:
      /(mlb|baseball|world series|home run|pitcher|bullpen|diamondbacks|braves|orioles|red sox|cubs|white sox|reds|guardians|rockies|tigers|astros|royals|angels|dodgers|marlins|brewers|twins|mets|yankees|athletics|phillies|pirates|padres|giants|mariners|cardinals|rays|rangers|blue jays|nationals)/i,
    videoPattern:
      /(mlb|baseball|world series|home run|walk off|pitcher|bullpen|sportscenter top plays|espn highlights|mlb highlights|baseball highlights)/i,
  },
  {
    key: "NHL",
    label: "NHL",
    scoreLeague: "NHL",
    articlePattern:
      /(nhl|hockey|stanley cup|goalie|power play|hat trick|puck|bruins|sabres|flames|hurricanes|blackhawks|avalanche|blue jackets|stars|red wings|oilers|panthers|kings|minnesota wild|canadiens|predators|devils|islanders|rangers|senators|flyers|penguins|sharks|kraken|blues|lightning|maple leafs|utah mammoth|canucks|golden knights|capitals|jets)/i,
    videoPattern:
      /(nhl|hockey|stanley cup|goalie|hat trick|save|replay|top plays|nhl highlights|hockey highlights)/i,
  },
  {
    key: "NBA",
    label: "NBA",
    scoreLeague: "NBA",
    articlePattern:
      /(nba|basketball|playoffs|finals|dunk|buzzer beater|hawks|celtics|nets|hornets|bulls|cavaliers|mavericks|nuggets|pistons|warriors|rockets|pacers|clippers|lakers|grizzlies|heat|bucks|timberwolves|pelicans|knicks|thunder|magic|76ers|suns|trail blazers|kings|spurs|raptors|jazz|wizards)/i,
    videoPattern:
      /(nba|basketball|dunk|buzzer beater|replay|top plays|nba highlights|basketball highlights)/i,
  },
  {
    key: "NFL",
    label: "NFL",
    scoreLeague: "NFL",
    articlePattern:
      /(nfl|football|super bowl|touchdown|quarterback|draft|cardinals|falcons|ravens|bills|panthers|bears|bengals|browns|cowboys|broncos|lions|packers|texans|colts|jaguars|chiefs|raiders|chargers|rams|dolphins|vikings|patriots|saints|giants|jets|eagles|steelers|49ers|seahawks|buccaneers|titans|commanders)/i,
    videoPattern:
      /(nfl|football|touchdown|quarterback|top plays|replay|nfl highlights|football highlights)/i,
  },
  {
    key: "MLS",
    label: "Soccer / MLS",
    scoreLeague: "MLS",
    articlePattern:
      /(mls|soccer|football club|fc|goal|premier league|champions league|atlanta united|austin fc|charlotte fc|chicago fire|fc cincinnati|colorado rapids|columbus crew|d\.c\. united|fc dallas|houston dynamo|inter miami|la galaxy|los angeles fc|minnesota united|cf montreal|nashville sc|new england revolution|new york city fc|new york red bulls|orlando city|philadelphia union|portland timbers|real salt lake|san diego fc|san jose earthquakes|seattle sounders|sporting kansas city|st\. louis city|toronto fc|vancouver whitecaps|bbc sport)/i,
    videoPattern:
      /(mls|soccer|goal|assist|save|replay|soccer highlights|mls highlights|football highlights)/i,
  },
  {
    key: "COLLEGE_FOOTBALL",
    label: "College Football",
    articlePattern:
      /(college football|ncaa football|cfb|big 12|big ten|sec|acc|pac-12|american athletic|sun belt|mountain west|hero sports|bowl game|playoff rankings|heisman|spring game|transfer portal football)/i,
    videoPattern:
      /(college football|ncaa football|cfb|big 12|big ten|sec|acc|touchdown|football highlights|spring game|heisman|college gameday)/i,
  },
  {
    key: "COLLEGE_BASKETBALL",
    label: "College Basketball",
    articlePattern:
      /(college basketball|ncaa basketball|march madness|final four|sweet 16|elite eight|big east|big 12 basketball|sec basketball|acc basketball|big ten basketball|hero sports|transfer portal basketball)/i,
    videoPattern:
      /(college basketball|ncaa basketball|march madness|final four|dunk|buzzer beater|basketball highlights|one shining moment)/i,
  },
  {
    key: "MOTORSPORTS",
    label: "Motorsports",
    articlePattern:
      /(motorsport|motorsport\.com|nascar|nascar\.com|formula 1|formula1|f1|indycar|stock car|daytona|cup series|grand prix|pole position|pit stop|race winner)/i,
    videoPattern:
      /(motorsport|nascar|formula 1|formula1|f1|indycar|race highlights|grand prix|pit stop|top finish|onboard)/i,
  },
  {
    key: "MMA",
    label: "Fighting",
    articlePattern:
      /(mma|ufc|bellator|pfl|boxing|knockout|submission|weigh in|octagon|fight card|combat sports|mma fighting)/i,
    videoPattern:
      /(mma|ufc|bellator|boxing|knockout|submission|fight highlights|mma highlights|ufc highlights)/i,
  },
  {
    key: "MORE",
    label: "More Sports",
    articlePattern: /(sports|athlete|coach|league|tournament|golf|tennis|nascar|formula 1|formula1|f1|olympics|ncaa)/i,
    videoPattern: /(sports|golf|tennis|nascar|formula 1|formula1|f1|olympics|top plays|highlights)/i,
  },
];

function getPublishedAtTimestamp(publishedAt: string | null | undefined) {
  if (!publishedAt) {
    return 0;
  }

  const timestamp = new Date(publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatSportsGameTimeLabel(scheduledAt: string | null | undefined) {
  if (!scheduledAt) {
    return "Upcoming game";
  }

  const scheduledDate = new Date(scheduledAt);

  if (Number.isNaN(scheduledDate.getTime())) {
    return "Upcoming game";
  }

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledDate);

  const scheduledDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(scheduledDate);
  const now = new Date();
  const todayDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const tomorrowDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  if (scheduledDay === todayDay) {
    return `Today ${timeLabel} ET`;
  }

  if (scheduledDay === tomorrowDay) {
    return `Tomorrow ${timeLabel} ET`;
  }

  const weekdayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(scheduledDate);

  return `${weekdayLabel} ${timeLabel} ET`;
}

function getSportsGameDayKey(scheduledAt: string | null | undefined) {
  if (!scheduledAt) {
    return null;
  }

  const scheduledDate = new Date(scheduledAt);

  if (Number.isNaN(scheduledDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(scheduledDate);
}

function getTodayDayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isSportsGameScheduledForToday(game: SportsScoreGame) {
  const gameDayKey = getSportsGameDayKey(game.scheduledAt);
  if (!gameDayKey) {
    return false;
  }

  return gameDayKey === getTodayDayKey();
}

function getSportsScheduledStartBadgeLabel(scheduledAt: string | null | undefined) {
  if (!scheduledAt) {
    return "Scheduled";
  }

  const scheduledDate = new Date(scheduledAt);

  if (Number.isNaN(scheduledDate.getTime())) {
    return "Scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledDate);
}

function getSportsScoreStatusLabel(game: SportsScoreGame) {
  if (game.status === "Live") {
    return "Live";
  }

  if (game.status === "Final") {
    return "Final";
  }

  return getSportsScheduledStartBadgeLabel(game.scheduledAt);
}

function getSportsScoreMetaLabel(game: SportsScoreGame) {
  if (game.status === "Live") {
    return game.shortDetail ?? game.statusDetail ?? "Live";
  }

  if (game.status === "Final") {
    return "Final";
  }

  return formatSportsGameTimeLabel(game.scheduledAt);
}

function isSportsBettingAd(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
  const hasLegitimateReportingContext =
    /(sports betting legislation|gambling investigation|betting scandal|sportsbook revenue|state betting law|betting law|sportsbook business news|gambling probe|betting investigation)/i.test(
      haystack
    );

  if (hasLegitimateReportingContext) {
    return false;
  }

  return /(sports betting line|betting line|odds tracker|sportsbook promo|sign up bonus|get \$1,500|betmgm|draftkings|fanduel|caesars|bet365|parlay|spread pick|over\/under|bonus code|promo code|odds boost|\bodds\b)/i.test(
    haystack
  );
}

function isSportsVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasSportsTerms =
    /(sports|espn|sportscenter|nfl|nba|mlb|nhl|mls|soccer|football|basketball|baseball|hockey|golf|tennis|nascar|formula 1|formula1|f1|ufc|mma|highlights?|touchdown|dunk|home run|goals?|save|replay|top plays|bleacher report|fox sports|cbs sports|nbc sports|sports illustrated|pga|masters|grand prix|race winner)/.test(
      haystack
    ) || video.category === "Sports";
  const hasRejectedTerms =
    /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress)/.test(
      haystack
    );

  return hasSportsTerms && !hasRejectedTerms;
}

function isStrictNflVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasNflTerms =
    /(nfl|national football league|nfl network|espn nfl|monday night football|sunday night football|football highlights|touchdown|quarterback|super bowl|nfl films)/.test(
      haystack
    );
  const hasPreferredSource =
    /(nfl network|nfl\.com|espn|cbs sports nfl|nbc sports nfl|fox sports nfl|bleacher report nfl)/.test(
      haystack
    );
  const hasRejectedTerms =
    /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress)/.test(
      haystack
    );

  return !hasRejectedTerms && (hasNflTerms || hasPreferredSource);
}

function getStrictMlbVideoRejectionReason(video: VideoItem) {
  return getMlbVideoValidationState(video).reason;
}

function isStrictMlbVideo(video: VideoItem) {
  return getStrictMlbVideoRejectionReason(video) === null;
}

function isStrictTechnologyArticle(article: Article) {
  return hasStrictTechnologyContext([
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]);
}

function isStrictPoliticsArticle(article: Article) {
  return hasStrictPoliticsContext([
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]);
}

function isStrictBusinessArticle(article: Article) {
  return hasStrictBusinessContext([
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]);
}

function isStrictAutoArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasAutoCoreTerms =
    /\b(auto|automotive|vehicle|vehicles|ev|electric vehicle|hybrid|autonomous driving|self-driving|vehicle safety|new model|new car|auto industry|automotive technology)\b/.test(
      haystack
    );
  const hasGenericCarTerms = /\b(car|cars)\b/.test(haystack);
  const hasAutoCompanyTerms =
    /\b(tesla|ford|gm|chevrolet|toyota|honda|hyundai|kia|bmw|mercedes|volkswagen|audi|rivian|lucid)\b/.test(
      haystack
    );
  const hasAutoSourceTerms =
    /\b(automotive news|car and driver|motortrend|edmunds|autoblog|the drive|insideevs|electrek|green car reports|reuters auto industry|ap auto industry|tesla news|ev news|new car releases|automotive technology)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(nascar|cup series|xfinity series|truck series|daytona|talladega|charlotte motor speedway|martinsville|bristol|darlington|racing|motorsports|formula 1|formula1|indycar|motogp|celebrity|hollywood|travel|crime|weather|stock market|earnings call)\b/.test(
      haystack
    );
  const hasConditionalRejectedTerms =
    /\b(politics?|election|campaign|government|policy|business|economy|finance|technology|tech)\b/.test(
      haystack
    );
  const hasAutoOverride =
    /\b(ev|electric vehicle|tesla|ford|gm|chevrolet|toyota|honda|hyundai|kia|bmw|mercedes|volkswagen|audi|rivian|lucid|auto industry|automotive technology|autonomous driving|self-driving|vehicle safety|new model|new car)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  if (hasConditionalRejectedTerms && !hasAutoOverride) {
    return false;
  }

  if (hasAutoCoreTerms || hasAutoCompanyTerms || hasAutoSourceTerms) {
    return true;
  }

  return hasGenericCarTerms && /\b(new|model|launch|release|review|industry|automotive|vehicle|ev|electric|hybrid|safety|autonomous|self-driving)\b/.test(haystack);
}

function isStrictWorldArticle(article: Article) {
  return hasStrictWorldContext([
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]);
}

function isStrictWeatherArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasWeatherTerms =
    /\b(weather|storm|hurricane|tornado|forecast|flood|heat wave|cold front|noaa|severe weather|winter storm)\b/.test(
      haystack
    );
  const hasWeatherSourceTerms =
    /\b(weather channel|fox weather|noaa weather|accuweather|reuters weather|ap weather)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(local politics|celebrity|hollywood|sports|movie|music)\b/.test(haystack);
  const hasConditionalRejectedTerms = /\b(politics|election|campaign|government|science)\b/.test(haystack);
  const hasWeatherOverride =
    /\b(weather|storm|hurricane|tornado|forecast|flood|heat wave|cold front|noaa|severe weather|winter storm)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  if (hasConditionalRejectedTerms && !hasWeatherOverride) {
    return false;
  }

  return hasWeatherTerms || hasWeatherSourceTerms;
}

function isStrictTravelArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasTravelTerms =
    /\b(travel|tourism|airline|destination|vacation|hotel|cruise|airport|tourism industry)\b/.test(
      haystack
    );
  const hasTravelSourceTerms =
    /\b(travel \+ leisure|conde nast traveler|lonely planet|reuters travel|ap travel)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(celebrity|gossip|food|recipe|politics|election|campaign)\b/.test(haystack);
  const hasConditionalRejectedTerms = /\b(business|economy|finance)\b/.test(haystack);
  const hasTravelOverride =
    /\b(travel|tourism|airline|destination|vacation|hotel|cruise|airport|tourism industry)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  if (hasConditionalRejectedTerms && !hasTravelOverride) {
    return false;
  }

  return hasTravelTerms || hasTravelSourceTerms;
}

function isStrictNflArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasNflTerms =
    /\b(nfl|national football league|nfl\.com|nfl draft|nfl playoffs|super bowl|afc|nfc|training camp|injuries|offseason)\b/.test(
      haystack
    );
  const hasNflTeamTerms = NFL_TEAM_REGEX.test(haystack);
  const hasNflSourceTerms =
    /\b(nfl\.com|espn nfl|ap nfl|reuters nfl|cbs sports nfl|nbc sports nfl|fox sports nfl|yahoo sports nfl|bleacher report nfl|sports illustrated nfl|the athletic nfl)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(cubs|mlb|baseball|college football|ncaa|high school football|premier league|champions league|mls|soccer|world cup|basketball|nba|nhl|golf|odds|betting|sportsbook|parlay|spread pick|over\/under|bonus code|promo code|celebrity|hollywood|movie|music|tv show|supergirl|wwe)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    console.log("NFL ARTICLE REJECTED NON_NFL", article.title);
    return false;
  }

  return hasNflTerms || hasNflSourceTerms || hasNflTeamTerms;
}

function isStrictNhlArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasNhlTerms =
    /\b(nhl|national hockey league|nhl\.com|hockey|stanley cup|goalie|goal|puck|overtime|playoff)\b/.test(
      haystack
    );
  const hasNhlTeamTerms =
    /\b(rangers|bruins|maple leafs|oilers|panthers|hurricanes|stars|avalanche|golden knights|devils|islanders|flyers|penguins|red wings|blackhawks|kraken|kings|ducks|sharks|canucks|flames|senators|canadiens|jets|wild|predators|blues|blue jackets|sabres|utah hockey club)\b/.test(
      haystack
    );
  const hasNhlSourceTerms =
    /\b(nhl\.com|espn nhl|sportsnet nhl|the hockey news|tsn hockey|ap nhl|reuters nhl|cbs sports nhl|nbc sports nhl|yahoo sports nhl|bleacher report nhl)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(mlb|baseball|nfl|football|nba|basketball|mls|soccer|odds|betting|sportsbook|parlay|celebrity|hollywood|movie|music)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    return false;
  }

  return hasNhlTerms || hasNhlTeamTerms || hasNhlSourceTerms;
}

function isStrictMlsArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasMlsTerms =
    /\b(mls|major league soccer|mlssoccer|mlssoccer\.com|soccer|mls standings|mls transfer)\b/.test(
      haystack
    );
  const hasMlsTeamTerms =
    /\b(charlotte fc|inter miami|fc cincinnati|lafc|atlanta united|seattle sounders)\b/.test(
      haystack
    );
  const hasMlsSourceTerms =
    /\b(mlssoccer\.com|espn mls|the athletic soccer|cbs sports golazo|nbc sports soccer|fox sports soccer|yahoo sports soccer)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(premier league|champions league|la liga|bundesliga|serie a|ligue 1|world cup|euros|copa america|betting|odds|sportsbook|parlay|celebrity|travel|weather|crime)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    return false;
  }

  return hasMlsTeamTerms || hasMlsSourceTerms || (hasMlsTerms && (hasMlsTeamTerms || /mls|major league soccer|mlssoccer/.test(haystack)));
}

function isStrictCollegeFootballArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasCollegeFootballTerms =
    /\b(college football|ncaa football|cfp|college football playoff|acc football|sec football|big ten football|big 12 football|transfer portal|recruiting)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(nfl\b|national football league|college basketball|high school football|odds|betting|sportsbook|parlay|spread pick|over\/under|promo code|bonus code)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    return false;
  }

  return hasCollegeFootballTerms;
}

function isStrictCollegeBasketballArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasCollegeBasketballTerms =
    /\b(college basketball|ncaa basketball|men['’]s basketball|women['’]s basketball|march madness|final four|ncaa tournament|hoops|college hoops|acc basketball|sec basketball|big ten basketball|big 12 basketball|espn college basketball|cbs sports college basketball)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(college football|college golf|golf|football|nfl|pga|liv|high school basketball|odds|betting|sportsbook|parlay|spread pick|over\/under|promo code|bonus code)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    return false;
  }

  return hasCollegeBasketballTerms;
}

function isStrictGolfArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasGolfTerms =
    /\b(golf|pga|lpga|masters|u\.s\. open|us open|the open|open championship|british open|ryder cup|tournament|golfer|tee time)\b/.test(
      haystack
    );
  const hasGolfSourceTerms =
    /\b(golf channel|espn golf|cbs sports golf|nbc sports golf|yahoo sports golf|ap golf|reuters golf)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(college basketball|college football|nfl|nba|mlb|nhl|mls|odds|betting|sportsbook|parlay|spread pick|over\/under|promo code|bonus code)\b/.test(
      haystack
    );
  const hasCountryClubOnly = /\b(country club)\b/.test(haystack) && !/\b(golf|pga|lpga|masters|open|ryder cup|tee time|golfer)\b/.test(haystack);

  if (hasRejectedTerms || hasCountryClubOnly || isSportsBettingAd(article)) {
    return false;
  }

  return hasGolfTerms || hasGolfSourceTerms;
}

function isStrictScienceArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasScienceTerms =
    /\b(science|nasa|space|astronomy|climate science|research|study|biology|physics|chemistry|medicine|medical research|discovery|scientists|telescope|planet|galaxy|asteroid)\b/.test(
      haystack
    );
  const hasScienceSourceTerms =
    /\b(scientific american|nature|science magazine|live science|space\.com|national geographic science|ap science|reuters science)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(celebrity|sports|astrology|movie|music|hollywood)\b/.test(haystack);
  const hasConditionalRejectedTerms =
    /\b(politics|election|campaign|government|weather forecast|forecast|tech product|iphone|android|laptop|smartphone)\b/.test(
      haystack
    );
  const hasScienceOverride =
    /\b(science|nasa|space|astronomy|research|study|biology|physics|chemistry|medicine|medical research|discovery|scientists|telescope|planet|galaxy|asteroid|climate science)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  if (hasConditionalRejectedTerms && !hasScienceOverride) {
    return false;
  }

  return hasScienceTerms || hasScienceSourceTerms;
}

function isStrictOpinionArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasOpinionTerms =
    /\b(opinion|analysis|commentary|editorial|viewpoint|column|perspective)\b/.test(haystack);
  const hasOpinionSourceTerms =
    /\b(wall street journal opinion|new york times opinion|washington post opinions?|bloomberg opinion|the atlantic|national review|the hill opinion|usa today opinion|reuters analysis|ap analysis|financial times opinion)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(weather|sports|celebrity|entertainment gossip)\b/.test(haystack);
  const hasBreakingOnlyTerms =
    /\b(breaking news|just in|live updates|developing story)\b/.test(haystack);

  if (hasRejectedTerms) {
    return false;
  }

  if (hasBreakingOnlyTerms && !hasOpinionTerms && !hasOpinionSourceTerms) {
    return false;
  }

  return hasOpinionTerms || hasOpinionSourceTerms;
}

function getOpinionLargeCardSelection(articles: Article[]) {
  return articles
    .map((article) => ({
      article,
      isStrictOpinion: isStrictOpinionArticle(article),
      image: getLargeImageCardImageCandidate(article),
    }))
    .find((candidate) => candidate.isStrictOpinion && candidate.image);
}

function isStrictCrimeArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasCrimeTerms =
    /\b(crime|police|investigation|arrest|court|trial|charges|public safety|shooting|suspect|homicide|fraud|theft|lawsuit|federal prosecutors?)\b/.test(
      haystack
    );
  const hasCrimeSourceTerms =
    /\b(ap crime|reuters crime|cnn crime|nbc news crime|abc news crime|cbs news crime|usa today crime)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(sports discipline|suspended for|celebrity gossip|opinion|editorial|commentary|column)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  return hasCrimeTerms || hasCrimeSourceTerms;
}

function getCrimeLargeCardSelection(articles: Article[]) {
  return articles
    .map((article) => ({
      article,
      isStrictCrime: isStrictCrimeArticle(article),
      image: getLargeImageCardImageCandidate(article),
    }))
    .find((candidate) => candidate.isStrictCrime && candidate.image);
}

function isStrictArtArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasArtTerms =
    /\b(art|museum|gallery|public art|art exhibition|contemporary art|arts culture|artist|artists|painting|sculpture|curator|retrospective)\b/.test(
      haystack
    );
  const hasArtSourceTerms =
    /\b(artnews|hyperallergic|the art newspaper|smithsonian arts|guardian art|nyt arts|new york times arts)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(crime|police|sports|weather|business|earnings|stock market|opinion|editorial|commentary)\b/.test(
      haystack
    );

  if (hasRejectedTerms) {
    return false;
  }

  return hasArtTerms || hasArtSourceTerms;
}

function getArtLargeCardSelection(articles: Article[]) {
  return articles
    .map((article) => ({
      article,
      isStrictArt: isStrictArtArticle(article),
      image: getLargeImageCardImageCandidate(article),
    }))
    .find((candidate) => candidate.isStrictArt && candidate.image);
}

function getTechLargeCardSelection(articles: Article[]) {
  const candidates = articles.map((article) => ({
    article,
    imageUrl: getBestArticleImage(article).src,
    hasImage: hasRealLargeImageCandidate(article),
    isStrictTech: isStrictTechnologyArticle(article),
  }));

  candidates.forEach((candidate) => {
    console.log("TECH LARGE CARD CANDIDATE", {
      title: candidate.article.title,
      source: candidate.article.source,
      imageUrl: candidate.imageUrl,
      hasImage: candidate.hasImage,
      isStrictTech: candidate.isStrictTech,
    });
  });

  const selectedCandidate = candidates.find((candidate) => {
    if (!candidate.isStrictTech) {
      console.log("TECH LARGE CARD REJECTED", {
        title: candidate.article.title,
        source: candidate.article.source,
        imageUrl: candidate.imageUrl,
        reason: "not-tech",
      });
      return false;
    }

    if (!candidate.hasImage) {
      console.log("TECH LARGE CARD REJECTED", {
        title: candidate.article.title,
        source: candidate.article.source,
        imageUrl: candidate.imageUrl,
        reason: "no-real-image",
      });
      return false;
    }

    console.log("TECH LARGE CARD ACCEPTED", {
      title: candidate.article.title,
      source: candidate.article.source,
      imageUrl: candidate.imageUrl,
    });
    return true;
  });

  console.log("TECH LARGE CARD FINAL", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.imageUrl ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getPoliticsLargeCardSelection(articles: Article[]) {
  const candidates = articles.map((article) => ({
    article,
    imageUrl: getBestArticleImage(article).src,
    hasImage: hasRealLargeImageCandidate(article),
    isStrictPolitics: isStrictPoliticsArticle(article),
  }));

  const selectedCandidate = candidates.find((candidate) => candidate.isStrictPolitics && candidate.hasImage);
  const fallbackCandidate = selectedCandidate
    ? null
    : candidates.find((candidate) => candidate.isStrictPolitics);

  console.log("POLITICS LARGE CARD SELECTED", {
    title: (selectedCandidate ?? fallbackCandidate)?.article.title ?? null,
    source: (selectedCandidate ?? fallbackCandidate)?.article.source ?? null,
    imageUrl: selectedCandidate?.imageUrl ?? POLITICS_LARGE_CARD_FALLBACK_IMAGE,
  });
  console.log("MY NEWS POLITICS LARGE CARD SELECTED", {
    title: (selectedCandidate ?? fallbackCandidate)?.article.title ?? null,
    source: (selectedCandidate ?? fallbackCandidate)?.article.source ?? null,
    imageUrl: selectedCandidate?.imageUrl ?? (fallbackCandidate ? POLITICS_LARGE_CARD_FALLBACK_IMAGE : null),
  });

  return fallbackCandidate || selectedCandidate
    ? {
        article: (selectedCandidate ?? fallbackCandidate)?.article ?? null,
        imageSrc: selectedCandidate?.imageUrl ?? POLITICS_LARGE_CARD_FALLBACK_IMAGE,
      }
    : null;
}

function getBusinessLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictBusiness: isStrictBusinessArticle(article),
    }))
    .find((candidate) => candidate.isStrictBusiness && candidate.image);

  console.log("BUSINESS LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getAutoLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictAuto: isStrictAutoArticle(article),
    }))
    .find((candidate) => candidate.isStrictAuto && candidate.image);

  console.log("AUTO LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getNflLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictNfl: isStrictNflArticle(article),
    }))
    .find((candidate) => candidate.isStrictNfl && candidate.image);

  console.log("NFL LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getNhlLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictNhl: isStrictNhlArticle(article),
    }))
    .find((candidate) => candidate.isStrictNhl && candidate.image);

  console.log("NHL LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getMlsLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictMls: isStrictMlsArticle(article),
    }))
    .find((candidate) => candidate.isStrictMls && candidate.image);

  console.log("MLS LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getCollegeFootballLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictCollegeFootball: isStrictCollegeFootballArticle(article),
    }))
    .find((candidate) => candidate.isStrictCollegeFootball && candidate.image);

  console.log("COLLEGE FOOTBALL LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getCollegeBasketballLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictCollegeBasketball: isStrictCollegeBasketballArticle(article),
    }))
    .find((candidate) => candidate.isStrictCollegeBasketball && candidate.image);

  console.log("COLLEGE BASKETBALL LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getGolfLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictGolf: isStrictGolfArticle(article),
    }))
    .find((candidate) => candidate.isStrictGolf && candidate.image);

  console.log("GOLF LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getScienceLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictScience: isStrictScienceArticle(article),
    }))
    .find((candidate) => candidate.isStrictScience && candidate.image);

  console.log("SCIENCE LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getSportsLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isSports: isBroadSportsArticle(article) && !isSportsBettingAd(article),
    }))
    .find((candidate) => candidate.isSports && candidate.image);

  console.log("SPORTS MY NEWS LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getBreakingLeadCardImageOverride(article: Article) {
  const realImage = getLargeImageCardImageCandidate(article)?.src ?? null;

  if (realImage) {
    return realImage;
  }
  return null;
}

function getBusinessTickerLogoUrl(symbol: string) {
  const normalizedSymbol = symbol.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedSymbol ? `/stock-logos/${normalizedSymbol}.png` : null;
}

function getBusinessTickerInitials(symbol: string) {
  const trimmedSymbol = cleanDisplayText(symbol).trim().toUpperCase();
  return trimmedSymbol.slice(0, 4) || "STK";
}

function getWorldLargeCardSelection(articles: Article[]) {
  const candidates = articles.map((article) => ({
    article,
    imageUrl: getBestArticleImage(article).src,
    hasImage: hasRealLargeImageCandidate(article),
    isStrictWorld: isStrictWorldArticle(article),
  }));

  const selectedCandidate = candidates.find((candidate) => candidate.isStrictWorld && candidate.hasImage);

  console.log("MY NEWS WORLD LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.imageUrl ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getWeatherLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictWeather: isStrictWeatherArticle(article),
    }))
    .find((candidate) => candidate.isStrictWeather && candidate.image);

  console.log("WEATHER LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function getTravelLargeCardSelection(articles: Article[]) {
  const selectedCandidate = articles
    .map((article) => ({
      article,
      image: getLargeImageCardImageCandidate(article),
      isStrictTravel: isStrictTravelArticle(article),
    }))
    .find((candidate) => candidate.isStrictTravel && candidate.image);

  console.log("TRAVEL LARGE CARD SELECTED", {
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });

  return selectedCandidate?.article ?? null;
}

function isStrictNhlVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasCoreNhlTerms =
    /(nhl|hockey|stanley cup|goal|save|overtime|playoff|nhl network|nhl\.com|espn nhl)/.test(
      haystack
    );
  const hasNhlTeamTerms =
    /\b(rangers|bruins|maple leafs|oilers|panthers|hurricanes|stars|avalanche|golden knights|devils|islanders|flyers|penguins|red wings|blackhawks|kraken|kings|ducks|sharks|canucks|flames|senators|canadiens|jets|wild|predators|blues|blue jackets|sabres|utah hockey club)\b/.test(
      haystack
    );
  const hasPreferredSource =
    /(nhl\.com|nhl network|espn nhl|sportsnet nhl|the hockey news|tsn hockey|ap nhl|reuters nhl|cbs sports nhl|nbc sports nhl|yahoo sports nhl|bleacher report nhl)/.test(
      haystack
    );
  const hasRejectedTerms =
    /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress|mlb|baseball|nfl|nba|mls)/.test(
      haystack
    );

  return !hasRejectedTerms && (hasPreferredSource || hasCoreNhlTerms || (hasNhlTeamTerms && /\b(hockey|nhl|stanley cup|goal|save|overtime|playoff)\b/.test(haystack)));
}

function isStrictNbaVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasRejectedBasketballTerms =
    /\b(wnba|women'?s basketball|college basketball|ncaa|high school basketball)\b/.test(haystack);
  const hasCoreNbaTerms =
    /(nba|national basketball association|basketball|nba\.com|espn nba|tnt nba|nba on espn|dunk|buzzer beater|playoff|playoffs|finals|nba finals)/.test(
      haystack
    );
  const hasNbaTeamTerms =
    /\b(lakers|celtics|knicks|warriors|nuggets|timberwolves|mavericks|thunder|bucks|heat|suns|clippers|rockets|spurs|grizzlies|pacers|cavaliers|hawks|nets|bulls|pistons|raptors|76ers|sixers|pelicans|magic|hornets|kings|trail blazers|blazers|jazz|wizards)\b/.test(
      haystack
    );
  const hasPreferredSource =
    /(nba\.com|espn nba|nba on espn|tnt nba|bleacher report nba|yahoo sports nba|cbs sports nba|nbc sports nba)/.test(
      haystack
    );
  const hasRejectedTerms =
    /(epa|fed chair|federal reserve|politics|election|economy|tariff|war|crime|weather|climate|white house|congress|nhl|hockey|mlb|baseball|nfl|football|mls|soccer)/.test(
      haystack
    );

  return (
    !hasRejectedBasketballTerms &&
    !hasRejectedTerms &&
    (hasPreferredSource ||
      hasCoreNbaTerms ||
      (hasNbaTeamTerms && /\b(basketball|nba|dunk|buzzer beater|finals|playoff|playoffs)\b/.test(haystack)))
  );
}

function isStrictNbaArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasNbaTerms =
    /\b(nba|national basketball association|nba\.com|nba playoffs|nba finals|knicks|cavaliers|thunder|spurs|lakers|celtics|warriors|nuggets|mavericks|suns|bucks|76ers|sixers|heat|bulls|clippers|grizzlies|hawks|hornets|jazz|kings|magic|nets|pacers|pelicans|pistons|raptors|rockets|trail blazers|wizards)\b/.test(
      haystack
    );
  const hasSourceTerms =
    /\b(espn nba|nba\.com|ap nba|reuters nba|cbs sports nba|nbc sports nba|fox sports nba|yahoo sports nba|bleacher report nba|the athletic nba)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(wnba|women'?s basketball|college basketball|ncaa basketball|high school basketball|odds|betting|sportsbook|parlay|spread pick|over\/under|promo code|bonus code)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    return false;
  }

  return hasNbaTerms || hasSourceTerms;
}

function isStrictFightingArticle(article: Article) {
  const haystack = [
    article.title,
    article.description,
    article.source,
    article.category,
    article.url,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasFightingTerms =
    /\b(ufc|mma|boxing|boxer|combat sports|fight|fighter|wwe|wrestling|title fight|knockout|bout|wrestlemania)\b/.test(haystack);
  const hasSourceTerms =
    /\b(espn mma|espn boxing|ufc\.com|mma fighting|bloody elbow|boxingscene|dazn boxing|ap boxing|reuters boxing|wwe\.com|wrestlezone)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(sports betting|odds|betting|sportsbook|parlay|spread pick|over\/under|celebrity fight)\b/.test(
      haystack
    );

  if (hasRejectedTerms || isSportsBettingAd(article)) {
    return false;
  }

  return hasFightingTerms || hasSourceTerms;
}

function getEntertainmentSectionLeadArticle(
  section: "music" | "tv" | "movies" | "gossip" | "celebrity",
  articles: Article[],
  sourceTerms: readonly string[],
  kind: "music" | "tv" | "movies" | "gossip" | "celebrity"
) {
  const candidates = articles.map((article) => ({
    article,
    image: getLargeImageCardImageCandidate(article),
    score: scoreEntertainmentArticleBySources(article, sourceTerms, kind),
  }));

  console.log("ENTERTAINMENT LARGE CARD PRIORITY ACTIVE", section);
  console.log(
    "ENTERTAINMENT LARGE CARD CANDIDATES",
    candidates.slice(0, 10).map((candidate) => ({
      section,
      title: candidate.article.title,
      source: candidate.article.source,
      imageUrl: candidate.image?.src ?? null,
      score: candidate.score,
    }))
  );

  const selectedCandidate = [...candidates]
    .filter((candidate) => candidate.image)
    .sort((leftCandidate, rightCandidate) => rightCandidate.score - leftCandidate.score)[0];

  console.log("ENTERTAINMENT LARGE CARD SELECTED", {
    section,
    title: selectedCandidate?.article.title ?? null,
    source: selectedCandidate?.article.source ?? null,
    imageUrl: selectedCandidate?.image?.src ?? null,
  });
  if (section === "movies") {
    console.log("ENTERTAINMENT MOVIES LARGE CARD SELECTED", {
      title: selectedCandidate?.article.title ?? null,
      source: selectedCandidate?.article.source ?? null,
      imageUrl: selectedCandidate?.image?.src ?? null,
    });
  }

  return selectedCandidate?.article ?? null;
}

function isEntertainmentMusicArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""}`.toLowerCase();
  const hasMusicTerms =
    /\b(music|album|single|song|artist|singer|rapper|band|concert|tour|billboard|grammy|pitchfork|rolling stone music|nme|consequence|stereogum|complex music|variety music|release)\b/.test(
      haystack
    );
  const hasMusicSources =
    /\b(billboard music|rolling stone music|pitchfork|nme|consequence|stereogum|complex music|variety music)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(celebrity gossip|gossip|dating|breakup|paparazzi|reality tv|movie|film|tv|television|series|episode|streaming|sports|politics|weather|crime)\b/.test(
      haystack
    );
  const tmzWithoutMusicContext =
    /\btmz\b/.test(haystack) &&
    !/\b(music|album|single|song|artist|singer|rapper|band|concert|tour|grammy)\b/.test(haystack);

  return (hasMusicTerms || hasMusicSources) && !hasRejectedTerms && !tmzWithoutMusicContext;
}

function isEntertainmentTvArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""}`.toLowerCase();
  const hasTvTerms =
    /\b(tv|television|streaming|netflix|hulu|hbo|max|disney\+|prime video|series|episode|season|tvline|deadline tv|variety tv|hollywood reporter tv|showrunner)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(music|album|concert|gossip|dating|breakup|sports|politics|weather|crime)\b/.test(haystack);

  return hasTvTerms && !hasRejectedTerms;
}

function isEntertainmentMoviesArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""}`.toLowerCase();
  const hasMovieTerms =
    /\b(movie|movies|film|cinema|box office|trailer|director|actor|actress|marvel|dc|pixar|oscars|indiewire|collider|screen rant|thewrap|deadline movies|variety movies|hollywood reporter movies)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(music|album|concert|tvline|episode|season|gossip|dating|breakup|sports|politics|weather|crime)\b/.test(haystack);

  return hasMovieTerms && !hasRejectedTerms;
}

function isEntertainmentGossipArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""}`.toLowerCase();
  const hasGossipTerms =
    /\b(gossip|celebrity|rumor|dating|breakup|red carpet|page six|tmz|us weekly|e! news|e news|paparazzi|people|just jared)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(sports|politics|weather|crime|business)\b/.test(haystack) &&
    !/\b(celebrity|gossip|hollywood)\b/.test(haystack);

  return hasGossipTerms && !hasRejectedTerms;
}

function isEntertainmentCelebrityArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""}`.toLowerCase();
  const hasCelebrityTerms =
    /\b(celebrity|actor|actress|star|hollywood|red carpet|interview|people|entertainment tonight|access hollywood|extra|hollywood life|us weekly|just jared|e! news|e news)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(sports|politics|weather|crime|business)\b/.test(haystack) &&
    !/\b(celebrity|actor|actress|hollywood|entertainment)\b/.test(haystack);

  return hasCelebrityTerms && !hasRejectedTerms;
}

function isEntertainmentRelevantArticle(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""} ${article.url}`.toLowerCase();
  const hasEntertainmentTerms =
    /\b(entertainment|celebrity|hollywood|movie|film|tv|television|music|album|singer|actor|actress|streaming|netflix|hbo|max|disney\+|box office|red carpet|variety|deadline|hollywood reporter|people|e! news|e news|entertainment tonight|billboard|rolling stone|tmz|page six)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(world news|politics|sports|weather|crime|business|tech)\b/.test(haystack) &&
    !/\b(entertainment|celebrity|hollywood|movie|film|tv|television|music|album|singer|actor|actress|streaming|netflix|hbo|max|disney\+|box office|red carpet)\b/.test(
      haystack
    );

  return hasEntertainmentTerms && !hasRejectedTerms;
}

function isEntertainmentMusicVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasMusicTerms =
    /\b(music|billboard|rolling stone|pitchfork|nme|album|song|singer|rapper|band|concert|tour|grammy|music video)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(politics?|sports|weather|tech|business|world news)\b/.test(haystack);
  const gossipOnly =
    /\b(tmz|page six|us weekly|e! news|e news|people)\b/.test(haystack) &&
    !/\b(music|album|song|singer|rapper|band|concert|tour|grammy|billboard|rolling stone|pitchfork|nme)\b/.test(
      haystack
    );

  return hasMusicTerms && !hasRejectedTerms && !gossipOnly;
}

function isEntertainmentTvVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasTerms =
    /\b(tv|television|series|episode|season|streaming|netflix|hbo|max|hulu|disney\+|prime video|tvline)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(politics?|sports|weather|tech|business|world news)\b/.test(haystack);
  return hasTerms && !hasRejectedTerms;
}

function isEntertainmentMoviesVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasTerms =
    /\b(movie|film|trailer|box office|cinema|director|marvel|dc|pixar|oscars|indiewire|collider|screen rant)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(tvline|episode|season|politics?|sports|weather|tech|business|world news)\b/.test(haystack);
  return hasTerms && !hasRejectedTerms;
}

function isEntertainmentGossipVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasTerms =
    /\b(gossip|celebrity|dating|breakup|rumor|red carpet|tmz|page six|us weekly|e! news|e news)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(politics?|sports|weather|tech|business|world news)\b/.test(haystack);
  return hasTerms && !hasRejectedTerms;
}

function isEntertainmentCelebrityVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasTerms =
    /\b(celebrity|actor|actress|hollywood|star|interview|red carpet|people|entertainment tonight|access hollywood|extra)\b/.test(
      haystack
    );
  const hasRejectedTerms =
    /\b(politics?|sports|weather|tech|business|world news)\b/.test(haystack);
  return hasTerms && !hasRejectedTerms;
}

function scoreEntertainmentArticleBySources(
  article: Article,
  sourceTerms: readonly string[],
  kind: "music" | "tv" | "movies" | "gossip" | "celebrity"
) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category ?? ""}`.toLowerCase();
  const sourceHits = sourceTerms.reduce(
    (count, sourceTerm) => count + (haystack.includes(sourceTerm.toLowerCase()) ? 1 : 0),
    0
  );
  const imageBoost = getLargeImageCardImageCandidate(article) ? 20 : 0;
  const recencyBoost = Math.floor(getPublishedAtTimestamp(article.publishedAt) / 3_600_000);
  const relevanceBoost =
    kind === "music"
      ? Number(isEntertainmentMusicArticle(article)) * 40
      : kind === "tv"
        ? Number(isEntertainmentTvArticle(article)) * 40
        : kind === "movies"
          ? Number(isEntertainmentMoviesArticle(article)) * 40
          : kind === "gossip"
            ? Number(isEntertainmentGossipArticle(article)) * 40
            : Number(isEntertainmentCelebrityArticle(article)) * 40;

  return sourceHits * 80 + imageBoost + relevanceBoost + recencyBoost;
}

function getEntertainmentPopularMusicCardMeta(article: Article) {
  const title = cleanDisplayText(article.title);
  const safeSource = getSafeSourceLabel(article.source);
  const quotedMatch = title.match(/[“"']([^"”']{3,80})[”"']/);
  const byMatch = title.match(/\bby ([A-Z0-9][^,|:;-]{2,48})/i);

  return {
    title: quotedMatch?.[1]?.trim() || title,
    artist: byMatch?.[1]?.trim() || safeSource,
    source: safeSource,
  };
}

async function fetchEntertainmentArticlesForQueries(queries: readonly string[]) {
  const payloads = await Promise.allSettled(
    queries.map(async (query) => {
      const response = await fetch(
        `/api/news?mode=search&query=${encodeURIComponent(query)}&page=1&pageSize=10`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      if (!response.ok) {
        return [] as Article[];
      }

      const payload = normalizeNewsPayload(
        (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
      );

      return hydrateFeedArticles(payload.articles);
    })
  );

  return dedupeArticlesByContent(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  );
}

async function fetchEntertainmentVideosForQueries(queries: readonly string[]) {
  const payloads = await Promise.allSettled(
    queries.map(async (query) => {
      console.log("ENTERTAINMENT SECTION VIDEO QUERY", query);
      const response = await apiFetch(`/api/videos?tab=celebrity&q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        return [] as VideoItem[];
      }

      const payload = (await response.json()) as { videos?: VideoApiItem[] };
      return normalizeVideoFeedItems(payload.videos ?? []);
    })
  );

  return dedupeVideosBySourceTitleAndUrl(
    payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  );
}

function getEntertainmentMovieScore(article: Article) {
  const movieMeta = article as Article & {
    rottenTomatoesScore?: number | string | null;
    criticsScore?: number | string | null;
    audienceScore?: number | string | null;
  };

  if (movieMeta.rottenTomatoesScore !== undefined && movieMeta.rottenTomatoesScore !== null) {
    return {
      label: "Rotten Tomatoes",
      value: String(movieMeta.rottenTomatoesScore),
    };
  }

  if (movieMeta.criticsScore !== undefined && movieMeta.criticsScore !== null) {
    return {
      label: "Critics",
      value: String(movieMeta.criticsScore),
    };
  }

  if (movieMeta.audienceScore !== undefined && movieMeta.audienceScore !== null) {
    return {
      label: "Audience",
      value: String(movieMeta.audienceScore),
    };
  }

  return null;
}

function getTheaterMovieScore(movie: TheaterMovieItem) {
  if (movie.rottenTomatoesScore) {
    return {
      label: "Rotten Tomatoes",
      value: movie.rottenTomatoesScore,
    };
  }

  if (movie.imdbRating) {
    return {
      label: "IMDb",
      value: movie.imdbRating,
    };
  }

  if (movie.tmdbScore !== null && movie.tmdbScore !== undefined) {
    return {
      label: "TMDb",
      value: String(movie.tmdbScore),
    };
  }

  return null;
}

function isStrictMlsVideo(video: VideoItem) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
  const hasMlsTerms =
    /\b(mls|major league soccer|mlssoccer|inter miami|charlotte fc|lafc|atlanta united|fc cincinnati|seattle sounders|la galaxy|new york red bulls|new york city fc)\b/.test(
      haystack
    );
  const hasRejectedSoccerTerms =
    /\b(premier league|champions league|la liga|bundesliga|serie a|ligue 1|world cup|euros|copa america|uefa|fifa|arsenal|chelsea|liverpool|manchester united|manchester city|real madrid|barcelona|bayern)\b/.test(
      haystack
    );

  return hasMlsTerms && !hasRejectedSoccerTerms;
}

function matchesFavoriteLeagueTeamName(text: string, league: FavoriteLeagueKey) {
  const regexByLeague = {
    MLB: MLB_TEAM_REGEX,
    NFL: NFL_TEAM_REGEX,
    NBA: NBA_TEAM_REGEX,
    MLS: MLS_TEAM_REGEX,
    NHL: NHL_TEAM_REGEX,
  } satisfies Record<FavoriteLeagueKey, RegExp>;

  return regexByLeague[league].test(text);
}

function matchesSportsSectionArticle(article: Article, section: SportsSectionConfig) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${
    article.category ?? ""
  }`.toLowerCase();

  if (section.key === "MLB" && matchesFavoriteLeagueTeamName(haystack, "MLB")) {
    return true;
  }
  if (section.key === "NBA" && matchesFavoriteLeagueTeamName(haystack, "NBA") && isStrictNbaArticle(article)) {
    return true;
  }
  if (section.key === "MLS" && matchesFavoriteLeagueTeamName(haystack, "MLS")) {
    return true;
  }
  if (section.key === "NHL" && matchesFavoriteLeagueTeamName(haystack, "NHL")) {
    return true;
  }
  if (section.key === "COLLEGE_FOOTBALL" && articleMatchesSelectedCategory(article, "College Football")) {
    return true;
  }
  if (
    section.key === "COLLEGE_BASKETBALL" &&
    articleMatchesSelectedCategory(article, "College Basketball")
  ) {
    return true;
  }
  if (section.key === "MOTORSPORTS" && articleMatchesSelectedCategory(article, "NASCAR")) {
    return true;
  }
  if (section.key === "MMA" && isStrictFightingArticle(article)) {
    return true;
  }

  const sourceMatchedBySection =
    section.key === "MLB"
      ? /\b(mlb\.com|major league baseball|baseball america|athletic mlb|the athletic mlb|mlb news|baseball|espn mlb|ap mlb|reuters mlb|cbs sports mlb|nbc sports mlb|fox sports mlb|yahoo sports mlb|bleacher report mlb)\b/i.test(
          haystack
        )
      : section.key === "NBA"
        ? /\b(nba\.com|basketball|espn nba|bleacher report nba|yahoo sports nba|cbs sports nba|nbc sports nba|fox sports nba|ap nba|reuters nba)\b/i.test(
            haystack
          )
        : section.key === "NFL"
          ? /\b(nfl\.com|football|nfl network|espn nfl|yahoo sports nfl|cbs sports nfl|nbc sports nfl|fox sports nfl)\b/i.test(
              haystack
            )
          : section.key === "NHL"
            ? /\b(nhl\.com|hockey|nhl news|bleacher report nhl|espn nhl|yahoo sports nhl|sportsnet nhl|the hockey news|tsn hockey|ap nhl|reuters nhl|cbs sports nhl|nbc sports nhl)\b/i.test(
                haystack
              )
            : section.key === "MLS"
              ? /\b(mlssoccer\.com|major league soccer|soccer|football club|espn soccer|espn mls|cbs sports golazo|nbc sports soccer|fox sports soccer|yahoo sports soccer|ap soccer|reuters soccer|the athletic soccer|fc cincinnati|charlotte fc|inter miami|lafc|atlanta united|seattle sounders|lionel messi|usmnt|uswnt|local mls|team official site)\b/i.test(
                  haystack
                )
              : section.key === "COLLEGE_FOOTBALL"
                ? /\b(college football|ncaa football|cfb|hero sports|big 12|big ten|sec|acc|conference usa|american athletic|sun belt|mountain west|bowl season|college gameday)\b/i.test(
                    haystack
                  )
                : section.key === "COLLEGE_BASKETBALL"
                  ? /\b(college basketball|ncaa basketball|march madness|final four|sweet 16|elite eight|big east|big 12 basketball|sec basketball|acc basketball|big ten basketball|bracketology)\b/i.test(
                      haystack
                    )
                  : section.key === "MOTORSPORTS"
                    ? /\b(motorsport\.com|motorsport|nascar\.com|nascar|formula 1|formula1|f1|indycar|grand prix|cup series|race day)\b/i.test(
                        haystack
                      )
                : section.key === "MMA"
                  ? /\b(ufc|mma|boxing|combat sports|espn mma|espn boxing|ufc\.com|mma fighting|bloody elbow|boxingscene|dazn boxing|ap boxing|reuters boxing|fight|fighter|title fight|knockout|bout)\b/i.test(
                      haystack
                    )
                : /\b(motorsport\.com|motorsport|nascar|formula 1|formula1|f1|indycar|golf|tennis|olympics|sports car|grand prix|race)\b/i.test(
                    haystack
                  );

  if (section.key === "NBA") {
    return isStrictNbaArticle(article);
  }

  if (section.key === "MMA") {
    return isStrictFightingArticle(article);
  }

  return section.articlePattern.test(haystack) || sourceMatchedBySection;
}

function matchesSportsSectionVideo(video: VideoItem, section: SportsSectionConfig) {
  const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();

  if (section.key === "NFL") {
    return isStrictNflVideo(video);
  }
  if (section.key === "NBA") {
    return isStrictNbaVideo(video);
  }
  if (section.key === "NHL") {
    return isStrictNhlVideo(video);
  }
  if (section.key === "MLS") {
    return isStrictMlsVideo(video);
  }

  if (section.key === "MLB" && matchesFavoriteLeagueTeamName(haystack, "MLB")) {
    return true;
  }
  return section.videoPattern.test(haystack);
}

function getArticlePriorityScore(article: Article) {
  const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${
    article.category ?? ""
  }`.toLowerCase();
  let score = 0;

  const source = getSafeSourceLabel(article.source).toLowerCase();

  if (
    /(ap news|ap sports|associated press|reuters|reuters sports|bbc news|bbc sport|cnn|new york times|washington post|politico|npr|espn|cbs sports|nbc sports|fox sports|yahoo sports|sports illustrated|bleacher report|bloomberg|wall street journal|the weather channel|mma fighting|mlb\.com|nba\.com|nfl\.com|nhl\.com|mlssoccer\.com|motorsport\.com|nascar\.com|hero sports|big 12|big 12 conference|fc cincinnati|dallas cowboys)/.test(
      source
    )
  ) {
    score += 120;
  }

  if (
    /(motorsport\.com|nascar\.com|hero sports|big 12|big 12 conference|mlb\.com|nba\.com|nfl\.com|nhl\.com|mlssoccer\.com|fc cincinnati|dallas cowboys|official site|team site|conference site)/.test(
      source
    )
  ) {
    score += 50;
  }

  if (/(yahoo sports|nbc sports)/.test(source)) {
    score -= 18;
  }

  if (/(breaking|urgent|developing|just in|live updates?|exclusive|major|top story|alert)/.test(haystack)) {
    score += 90;
  }

  if (/(analysis|opinion|newsletter|sponsored|advertiser|promo|bonus code)/.test(haystack)) {
    score -= 70;
  }

  score += Math.min(120, article.likes * 3);
  score += Math.min(80, (article.comments?.length ?? 0) * 6);

  const ageHours = article.publishedAt
    ? Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60))
    : 72;
  score += Math.max(0, 72 - ageHours * 3);

  return score;
}

function getWeatherConditionIconLabel(condition: string | null | undefined) {
  const value = `${condition ?? ""}`.toLowerCase();

  if (/(thunder|storm)/.test(value)) {
    return "storm";
  }

  if (/(snow|sleet|blizzard|ice)/.test(value)) {
    return "snow";
  }

  if (/(rain|showers?|drizzle)/.test(value)) {
    return "rain";
  }

  if (/(wind|breezy|gust)/.test(value)) {
    return "wind";
  }

  if (/(cloud|overcast|fog|mist)/.test(value)) {
    return "cloud";
  }

  if (/(sun|clear|fair)/.test(value)) {
    return "sun";
  }

  return "cloud";
}

function getSafeSourceLabel(value: unknown) {
  if (typeof value !== "string") {
    return "Unknown source";
  }

  const cleaned = cleanDisplayText(value).replace(/\s+\d+(?:\.\d+)?$/, "").trim();

  if (
    !cleaned ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
  ) {
    return "News source";
  }

  return cleaned;
}

function getDisplaySourceLabel(
  article: Pick<Article, "source" | "title" | "category" | "description" | "url">
) {
  const safeSource = getSafeSourceLabel(article.source);
  const haystack = `${safeSource} ${article.title ?? ""} ${article.category ?? ""} ${
    article.description ?? ""
  } ${article.url ?? ""}`;

  const inferredWeatherSource = WEATHER_SOURCE_INFERENCE_RULES.find((rule) =>
    rule.pattern.test(haystack)
  );

  if (inferredWeatherSource) {
    return inferredWeatherSource.label;
  }

  if (WEATHER_SOURCE_RENAME_PATTERN.test(safeSource) && WEATHER_LIKE_ARTICLE_PATTERN.test(haystack)) {
    return "Local Weather";
  }

  return safeSource;
}

function getSafeCategoryLabel(value: unknown, article?: Pick<Article, "source" | "title">) {
  return getDisplayCategory(typeof value === "string" ? value : null, {
    source: article?.source ?? null,
    title: article?.title ?? null,
  });
}

export default function Home() {
  const router = useRouter();
  const topTabsRef = useRef<HTMLDivElement | null>(null);
  const cityOptions = SUPPORTED_LOCAL_CITIES;
  const [articles, setArticles] = useState<Article[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<
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
    | "business"
  >(
    "trending"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [savedLocalCity, setSavedLocalCity] = useState<string | null>(null);
  const [savedLocalState, setSavedLocalState] = useState<string | null>(null);
  const [selectedLocalCityKey, setSelectedLocalCityKey] = useState<string | null>(null);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialFeedLoading, setIsInitialFeedLoading] = useState(true);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    articleId: number;
    commentId: number;
  } | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [activeCommentsArticleId, setActiveCommentsArticleId] = useState<number | null>(
    null
  );
  const [commentComposerStatus, setCommentComposerStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [longPressMenuArticle, setLongPressMenuArticle] = useState<Article | null>(null);
  const [commentSortMode, setCommentSortMode] = useState<
    "top" | "controversial" | "newest"
  >("top");
  const [isCommentSortMenuOpen, setIsCommentSortMenuOpen] = useState(false);
  const [myFeedPolls, setMyFeedPolls] = useState<PollWithResults[]>([]);
  const [pollFilter, setPollFilter] = useState<"top" | "following" | "trending">("top");
  const [pollFollowingIds, setPollFollowingIds] = useState<string[]>([]);
  const [activePollVoteId, setActivePollVoteId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [sportsVideos, setSportsVideos] = useState<VideoItem[]>([]);
  const [celebrityVideos, setCelebrityVideos] = useState<VideoItem[]>([]);
  const [weatherVideos, setWeatherVideos] = useState<VideoItem[]>([]);
  const [localVideos, setLocalVideos] = useState<VideoItem[]>([]);
  const [mlbSectionArticles, setMlbSectionArticles] = useState<Article[]>([]);
  const [mlbSectionVideos, setMlbSectionVideos] = useState<VideoItem[]>([]);
  const [nhlSectionArticles, setNhlSectionArticles] = useState<Article[]>([]);
  const [nhlSectionVideos, setNhlSectionVideos] = useState<VideoItem[]>([]);
  const [mlsSectionArticles, setMlsSectionArticles] = useState<Article[]>([]);
  const [nbaSectionArticles, setNbaSectionArticles] = useState<Article[]>([]);
  const [nbaSectionVideos, setNbaSectionVideos] = useState<VideoItem[]>([]);
  const [nflSectionArticles, setNflSectionArticles] = useState<Article[]>([]);
  const [nflSectionVideos, setNflSectionVideos] = useState<VideoItem[]>([]);
  const [fightingSectionArticles, setFightingSectionArticles] = useState<Article[]>([]);
  const [favoriteTeams, setFavoriteTeams] = useState<FavoriteTeamOption[]>([]);
  const [hasLoadedFavoriteTeams, setHasLoadedFavoriteTeams] = useState(false);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [activeTeamLeague, setActiveTeamLeague] = useState<FavoriteLeagueKey>("NFL");
  const [sportsScoresByLeague, setSportsScoresByLeague] = useState<
    Record<SportsScoreLeague, SportsScoreGame[]>
  >({
    NFL: [],
    NBA: [],
    MLB: [],
    NHL: [],
    MLS: [],
  });
  const [isSportsScoresLoading, setIsSportsScoresLoading] = useState(false);
  const [areSportsScoresAvailable, setAreSportsScoresAvailable] = useState(true);
  const [selectedSportsGame, setSelectedSportsGame] = useState<SportsScoreGame | null>(null);
  const [expandedScoresLeague, setExpandedScoresLeague] = useState<SportsScoreLeague | null>(null);
  const [autoplayTrendingVideoKeys, setAutoplayTrendingVideoKeys] = useState<string[]>([]);
  const [activeMyNewsTechVideoKey, setActiveMyNewsTechVideoKey] = useState<string | null>(null);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [categorySheetStatus, setCategorySheetStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [failedArticleImages, setFailedArticleImages] = useState<Record<string, true>>({});
  const [failedArticleBoxImages, setFailedArticleBoxImages] = useState<Record<string, true>>({});
  const [sportsArtworkCache, setSportsArtworkCache] = useState<Record<string, string | null>>({});
  const [feedPage, setFeedPage] = useState(1);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [isLoadingMoreArticles, setIsLoadingMoreArticles] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [localQueryDraft, setLocalQueryDraft] = useState("");
  const [localLocationLabel, setLocalLocationLabel] = useState("");
  const [isLocalAutocompleteOpen, setIsLocalAutocompleteOpen] = useState(false);
  const [, setLocalSearchStatus] = useState<string | null>(null);
  const [isLocalAreaLoading, setIsLocalAreaLoading] = useState(false);
  const [categorySectionArticles, setCategorySectionArticles] = useState<Article[]>([]);
  const [isCategorySectionLoading, setIsCategorySectionLoading] = useState(false);
  const [homeSourceRankings, setHomeSourceRankings] = useState<RankedSourceSummary[]>([]);
  const [isHomeSourceRankingsLoading, setIsHomeSourceRankingsLoading] = useState(false);
  const [weatherCard, setWeatherCard] = useState<WeatherCardData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherNewsArticles, setWeatherNewsArticles] = useState<Article[]>([]);
  const [isWeatherNewsLoading, setIsWeatherNewsLoading] = useState(false);
  const [weatherSearchDraft, setWeatherSearchDraft] = useState("");
  const [selectedWeatherLocation, setSelectedWeatherLocation] = useState("");
  const [weatherPageCard, setWeatherPageCard] = useState<WeatherCardData | null>(null);
  const [weatherForecastDays, setWeatherForecastDays] = useState<WeatherForecastDay[]>([]);
  const [weatherForecastError, setWeatherForecastError] = useState<string | null>(null);
  const [isWeatherPageLoading, setIsWeatherPageLoading] = useState(false);
  const [teamSpecificNewsArticles, setTeamSpecificNewsArticles] = useState<Article[]>([]);
  const [nationalWeatherMapEmbedHtml, setNationalWeatherMapEmbedHtml] = useState<string | null>(null);
  const [nationalWeatherMapFullscreenHtml, setNationalWeatherMapFullscreenHtml] = useState<string | null>(
    null
  );
  const [isNationalWeatherMapLoading, setIsNationalWeatherMapLoading] = useState(false);

  useEffect(() => {
    console.log(
      "FALLBACK IMAGES SYNCED",
      TOPIC_IMAGE_FILENAMES.length
    );
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadTheaterMovies() {
      if (sortMode !== "celebrity") {
        setTheaterMovies([]);
        return;
      }

      try {
        const response = await apiFetch("/api/movies", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Movies request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          movies?: TheaterMovieItem[];
        };

        if (!isCancelled) {
          setTheaterMovies(Array.isArray(payload.movies) ? payload.movies : []);
        }
      } catch (error) {
        console.error("THEATER MOVIES LOAD FAILED", error);
        if (!isCancelled) {
          setTheaterMovies([]);
        }
      }
    }

    void loadTheaterMovies();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  useEffect(() => {
    let isCancelled = false;

    async function loadBusinessTicker() {
      if (sortMode !== "business" && sortMode !== "trending") {
        setBusinessTickerItems([]);
        setBusinessTickerSource("idle");
        return;
      }

      try {
        const response = await apiFetch("/api/stocks", {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => ({ items: [] }))) as {
          items?: StockTickerItem[];
          debugFallback?: boolean;
        };

        console.log("BUSINESS STOCK JSON RECEIVED", payload);
        console.log("BUSINESS STOCK FETCH RESPONSE", {
          ok: response.ok,
          status: response.status,
          count: Array.isArray(payload.items) ? payload.items.length : 0,
        });

        const apiItems = Array.isArray(payload.items)
          ? payload.items.filter(
              (item) =>
                Boolean(item?.symbol) &&
                item.price !== null &&
                Number.isFinite(item.price)
            )
          : [];

        console.log("STOCK TICKER API ITEMS RECEIVED", apiItems);
        console.log("BUSINESS STOCK DATA ITEMS", apiItems);
        console.log("BUSINESS STOCK ITEMS RECEIVED", apiItems);
        console.log("BUSINESS STOCK ITEMS LENGTH", apiItems.length);
        console.log("BUSINESS STOCK USING_API_ITEMS", apiItems.length > 0);
        console.log("BUSINESS STOCK USING_FALLBACK_ITEMS", false);

        const itemBySymbol = new Map<string, StockTickerItem>();
        apiItems.forEach((item) => {
          itemBySymbol.set(item.symbol, {
            ...item,
            source: item.source ?? "Stock API",
          });
        });

        const orderedItems = BUSINESS_STOCK_TICKER_ORDER.map((symbol) => itemBySymbol.get(symbol))
          .filter((item): item is StockTickerItem => Boolean(item))
          .filter((item) => item.price !== null && Number.isFinite(item.price));

        if (!isCancelled) {
          setBusinessTickerItems(orderedItems);
          setBusinessTickerSource(apiItems.length > 0 ? "api" : "empty");
        }
      } catch (error) {
        console.error("BUSINESS STOCK FETCH FAILED", error);
        console.log("BUSINESS STOCK JSON RECEIVED", { items: [] });
        console.log("BUSINESS STOCK FETCH RESPONSE", {
          ok: false,
          status: "fetch-error",
          count: 0,
        });
        console.log("BUSINESS STOCK USING_API_ITEMS", false);
        console.log("BUSINESS STOCK USING_FALLBACK_ITEMS", false);
        console.log("STOCK TICKER API ITEMS RECEIVED", []);
        console.log("BUSINESS STOCK DATA ITEMS", []);
        console.log("BUSINESS STOCK ITEMS RECEIVED", []);
        console.log("BUSINESS STOCK ITEMS LENGTH", 0);

        if (!isCancelled) {
          setBusinessTickerItems([]);
          setBusinessTickerSource("error");
        }
      }
    }

    void loadBusinessTicker();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  useEffect(() => {
    console.log("STOCK TICKER COMPONENT MOUNTED", true);
    console.log("STOCK LOGOS SYNCED", true);
  }, []);
  const [isWeatherRadarOpen, setIsWeatherRadarOpen] = useState(false);
  const [breakingPreviewArticles, setBreakingPreviewArticles] = useState<Article[]>([]);
  const [isBreakingPreviewLoading, setIsBreakingPreviewLoading] = useState(false);
  const [sportsPreviewArticles, setSportsPreviewArticles] = useState<Article[]>([]);
  const [isSportsPreviewLoading, setIsSportsPreviewLoading] = useState(false);
  const [celebrityPreviewArticles, setCelebrityPreviewArticles] = useState<Article[]>([]);
  const [isCelebrityPreviewLoading, setIsCelebrityPreviewLoading] = useState(false);
  const [entertainmentSectionArticles, setEntertainmentSectionArticles] = useState<Article[]>([]);
  const [entertainmentSectionFeeds, setEntertainmentSectionFeeds] = useState<{
    music: Article[];
    tvShows: Article[];
    gossip: Article[];
    celebrity: Article[];
    movies: Article[];
  }>({
    music: [],
    tvShows: [],
    gossip: [],
    celebrity: [],
    movies: [],
  });
  const [entertainmentSectionVideos, setEntertainmentSectionVideos] = useState<{
    gossip: VideoItem[];
    music: VideoItem[];
    tv: VideoItem[];
    celebrity: VideoItem[];
    movies: VideoItem[];
  }>({
    gossip: [],
    music: [],
    tv: [],
    celebrity: [],
    movies: [],
  });
  const [entertainmentLeadCards, setEntertainmentLeadCards] = useState<
    Record<EntertainmentSectionKey, Article | null>
  >({
    gossip: null,
    music: null,
    tv: null,
    celebrity: null,
    movies: null,
  });
  const [breakingLeadCard, setBreakingLeadCard] = useState<{
    article: Article;
    imageSrcOverride: string | null;
  } | null>(null);
  const [popularMusicAlbums, setPopularMusicAlbums] = useState<PopularMusicAlbum[]>([]);
  const [theaterMovies, setTheaterMovies] = useState<TheaterMovieItem[]>([]);
  const [businessTickerItems, setBusinessTickerItems] = useState<StockTickerItem[]>([]);
  const [businessTickerSource, setBusinessTickerSource] = useState<string>("loading");
  const [featuredTrendingPodcasts, setFeaturedTrendingPodcasts] = useState<TrendingPodcastCard[]>(
    PODCAST_FEEDS.filter((show) => show.featured)
      .slice(0, 10)
      .map((show) => ({
        id: show.slug,
        slug: show.slug,
        title: show.title,
        publisher: show.publisher,
        category: show.category,
        image: null,
      }))
  );
  const [failedTrendingPodcastImages, setFailedTrendingPodcastImages] = useState<Record<string, boolean>>({});
  const [isEntertainmentSectionLoading, setIsEntertainmentSectionLoading] = useState(false);
  const [technologyPreviewArticles, setTechnologyPreviewArticles] = useState<Article[]>([]);
  const [isTechnologyPreviewLoading, setIsTechnologyPreviewLoading] = useState(false);
  const [businessPreviewArticles, setBusinessPreviewArticles] = useState<Article[]>([]);
  const [isBusinessPreviewLoading, setIsBusinessPreviewLoading] = useState(false);
  const [carsPreviewArticles, setCarsPreviewArticles] = useState<Article[]>([]);
  const [isCarsPreviewLoading, setIsCarsPreviewLoading] = useState(false);
  const [opinionPreviewArticles, setOpinionPreviewArticles] = useState<Article[]>([]);
  const [isOpinionPreviewLoading, setIsOpinionPreviewLoading] = useState(false);
  const [crimePreviewArticles, setCrimePreviewArticles] = useState<Article[]>([]);
  const [isCrimePreviewLoading, setIsCrimePreviewLoading] = useState(false);
  const [artPreviewArticles, setArtPreviewArticles] = useState<Article[]>([]);
  const [isArtPreviewLoading, setIsArtPreviewLoading] = useState(false);
  const [foodPreviewArticles, setFoodPreviewArticles] = useState<Article[]>([]);
  const [isFoodPreviewLoading, setIsFoodPreviewLoading] = useState(false);
  const [sciencePreviewArticles, setSciencePreviewArticles] = useState<Article[]>([]);
  const [isSciencePreviewLoading, setIsSciencePreviewLoading] = useState(false);
  const [myNewsCategorySupplementalArticles, setMyNewsCategorySupplementalArticles] = useState<
    Record<string, Article[]>
  >({});
  const [myNewsCategorySupplementalVideos, setMyNewsCategorySupplementalVideos] = useState<
    Record<string, VideoItem[]>
  >({});
  const [myNewsCategoryArticleStatus, setMyNewsCategoryArticleStatus] = useState<
    Record<string, { loading: boolean; error: boolean }>
  >({});

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    console.log("TRENDING_FEATURED_PODCASTS_RENDERED", featuredTrendingPodcasts.length);

    let isCancelled = false;

    async function loadTrendingPodcasts() {
      try {
        const response = await apiFetch("/api/podcasts");

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          sections?: { featured?: TrendingPodcastCard[] };
        };

        if (isCancelled) {
          return;
        }

        const nextFeatured = (payload.sections?.featured ?? [])
          .slice(0, 10)
          .map((show) => ({
            id: show.id,
            slug: show.slug,
            title: show.title,
            publisher: show.publisher,
            category: show.category,
            image: show.image ?? null,
            artworkUrl600: show.artworkUrl600 ?? null,
            artworkUrl100: show.artworkUrl100 ?? null,
            artwork: show.artwork ?? null,
            podcastImage: show.podcastImage ?? null,
            feedImage: show.feedImage ?? null,
            itunesImage: show.itunesImage ?? null,
          }));

        if (nextFeatured.length > 0) {
          setFeaturedTrendingPodcasts(nextFeatured);
        }
      } catch (error) {
        console.error("Trending featured podcasts enrichment failed", error);
      }
    }

    void loadTrendingPodcasts();

    return () => {
      isCancelled = true;
    };
  }, [featuredTrendingPodcasts.length, sortMode]);
  const [myNewsCategoryVideoStatus, setMyNewsCategoryVideoStatus] = useState<
    Record<string, { loading: boolean; error: boolean }>
  >({});
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const trendingVideoFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const teamPickerPagesRef = useRef<HTMLDivElement | null>(null);
  const moreSportsVideosSectionRef = useRef<HTMLElement | null>(null);
  const foodRecipesSectionRef = useRef<HTMLElement | null>(null);
  const foodRecipeVideosSectionRef = useRef<HTMLElement | null>(null);
  const foodLatestSectionRef = useRef<HTMLElement | null>(null);
  const scienceSectionRef = useRef<HTMLElement | null>(null);
  const carsSectionRef = useRef<HTMLElement | null>(null);
  const trendingEntertainmentSectionRef = useRef<HTMLElement | null>(null);
  const topTabButtonRefs = useRef<Partial<Record<SwipeableSortMode, HTMLButtonElement | null>>>({});
  const articleLongPressTimerRef = useRef<number | null>(null);
  const [isMoreSportsVideosVisible, setIsMoreSportsVideosVisible] = useState(false);
  const teamPickerPanelRefs = useRef<Record<FavoriteLeagueKey, HTMLElement | null>>({
    MLB: null,
    NFL: null,
    NBA: null,
    MLS: null,
    NHL: null,
  });
  const isFetchingNextPageRef = useRef(false);
  const activeFeedRequestIdRef = useRef(0);
  const [replyTarget, setReplyTarget] = useState<{
    articleId: number;
    commentId: number;
    username: string | null;
  } | null>(null);

  useEffect(() => {
    console.log("APP RENDERED");
  }, []);

  const favoriteTeamsStorageKey = "favoriteSportsTeams";
  const weatherLocationStorageKey = "lastWeatherLocation";

  useEffect(() => {
    console.log(
      "SUPPORTED LOCAL CITIES",
      SUPPORTED_LOCAL_CITIES.map((city) => city.displayName)
    );
  }, []);

  useEffect(() => {
    console.log(
      "LOCAL CITY OPTIONS RENDERED",
      cityOptions.map((city) => city.displayName)
    );
  }, [cityOptions]);

  useEffect(() => {
    if (!isTeamPickerOpen) {
      return;
    }

    const panel = teamPickerPanelRefs.current[activeTeamLeague];

    if (!panel) {
      return;
    }

    window.requestAnimationFrame(() => {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    });
  }, [activeTeamLeague, isTeamPickerOpen]);

  useEffect(() => {
    let isMounted = true;

    async function loadSportsScores() {
      if (sortMode !== "sports" && sortMode !== "trending") {
        return;
      }

      setIsSportsScoresLoading(true);
      console.log("SPORTS SCORES FETCH START");

      try {
        console.log("SPORTS SCORES DATE USED", getTodayDayKey());
        const response = await apiFetch(`/api/sports-scores?ts=${Date.now()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          providerConfigured: boolean;
          leagues: Partial<Record<SportsScoreLeague, SportsScoreGame[]>>;
        };

        if (!isMounted) {
          return;
        }

        console.log("SPORTS SCORES RAW COUNT", {
          NFL: payload.leagues.NFL?.length ?? 0,
          NBA: payload.leagues.NBA?.length ?? 0,
          MLB: payload.leagues.MLB?.length ?? 0,
          NHL: payload.leagues.NHL?.length ?? 0,
          MLS: payload.leagues.MLS?.length ?? 0,
        });
        setAreSportsScoresAvailable(payload.providerConfigured);
        setSportsScoresByLeague({
          NFL: payload.leagues.NFL ?? [],
          NBA: payload.leagues.NBA ?? [],
          MLB: payload.leagues.MLB ?? [],
          NHL: payload.leagues.NHL ?? [],
          MLS: payload.leagues.MLS ?? [],
        });
      } catch (error) {
        console.error("SPORTS SCORES LOAD FAILED", error);
        console.log("SPORTS SCORES ERROR", error instanceof Error ? error.message : String(error));

        if (!isMounted) {
          return;
        }

        setAreSportsScoresAvailable(false);
        setSportsScoresByLeague({
          NFL: [],
          NBA: [],
          MLB: [],
          NHL: [],
          MLS: [],
        });
      } finally {
        if (isMounted) {
          setIsSportsScoresLoading(false);
        }
      }
    }

    void loadSportsScores();

    return () => {
      isMounted = false;
    };
  }, [sortMode]);

  const sportsScoresTodayByLeague = useMemo(() => {
    const filteredScores = {
      NFL: (sportsScoresByLeague.NFL ?? []).filter((game) => isSportsGameScheduledForToday(game)),
      NBA: (sportsScoresByLeague.NBA ?? []).filter((game) => isSportsGameScheduledForToday(game)),
      MLB: (sportsScoresByLeague.MLB ?? []).filter((game) => isSportsGameScheduledForToday(game)),
      NHL: (sportsScoresByLeague.NHL ?? []).filter((game) => isSportsGameScheduledForToday(game)),
      MLS: (sportsScoresByLeague.MLS ?? []).filter((game) => isSportsGameScheduledForToday(game)),
    } satisfies Record<SportsScoreLeague, SportsScoreGame[]>;

    console.log("SPORTS SCORE TODAY FILTERED COUNT", {
      NFL: filteredScores.NFL.length,
      NBA: filteredScores.NBA.length,
      MLB: filteredScores.MLB.length,
      NHL: filteredScores.NHL.length,
      MLS: filteredScores.MLS.length,
    });

    return filteredScores;
  }, [sportsScoresByLeague]);

  const sportsScoresDisplayByLeague = useMemo(() => {
    const displayScores = {
      NFL:
        sportsScoresTodayByLeague.NFL.length > 0 ? sportsScoresTodayByLeague.NFL : sportsScoresByLeague.NFL,
      NBA:
        sportsScoresTodayByLeague.NBA.length > 0 ? sportsScoresTodayByLeague.NBA : sportsScoresByLeague.NBA,
      MLB:
        sportsScoresTodayByLeague.MLB.length > 0 ? sportsScoresTodayByLeague.MLB : sportsScoresByLeague.MLB,
      NHL:
        sportsScoresTodayByLeague.NHL.length > 0 ? sportsScoresTodayByLeague.NHL : sportsScoresByLeague.NHL,
      MLS:
        sportsScoresTodayByLeague.MLS.length > 0 ? sportsScoresTodayByLeague.MLS : sportsScoresByLeague.MLS,
    } satisfies Record<SportsScoreLeague, SportsScoreGame[]>;

    console.log("SPORTS SCORES FINAL COUNT", {
      NFL: displayScores.NFL.length,
      NBA: displayScores.NBA.length,
      MLB: displayScores.MLB.length,
      NHL: displayScores.NHL.length,
      MLS: displayScores.MLS.length,
    });

    return displayScores;
  }, [sportsScoresByLeague, sportsScoresTodayByLeague]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("FOUND LOADING ARTICLES COMPONENT");
      console.log("CURRENT ROUTE", window.location.pathname);
    }
    console.log("TRENDING LOADING STATE", isLoading);
    console.log("ARTICLES COUNT", articles.length);
    console.log("LOADING STATE", isLoading);
  }, [articles.length, isLoading]);

  useEffect(() => {
    if (POLLS_DISABLED && sortMode === "polls") {
      setSortMode("trending");
    }
  }, [sortMode]);

  useEffect(() => {
    if (MY_NEWS_DISABLED && sortMode === "mynews") {
      setSortMode("trending");
    }
  }, [sortMode]);

  useEffect(() => {
    if (MY_NEWS_DISABLED) {
      console.log("MY_NEWS_DISABLED_ACTIVE", true);
    }
  }, []);

  useEffect(() => {
    if (TRENDING_AUTO_DISABLED) {
      console.log("TRENDING_AUTO_DISABLED_ACTIVE", true);
    }
    if (TRENDING_SPORTS_DISABLED) {
      console.log("TRENDING_SPORTS_DISABLED_ACTIVE", true);
    }
    if (TRENDING_SCORE_CARDS_DISABLED) {
      console.log("TRENDING_SCORE_CARDS_DISABLED_ACTIVE", true);
    }
  }, []);

  const articleDisplayImageCount = useMemo(
    () => articles.filter((article) => Boolean(getArticleDisplayImage(article).src)).length,
    [articles]
  );

  useEffect(() => {
    console.log("ARTICLE DISPLAY_IMAGE FINAL_COUNT", articleDisplayImageCount);
  }, [articleDisplayImageCount]);


  const feedMode:
    | "trending"
    | "latest"
    | "local"
    | "polls"
    | "sports"
    | "celebrity"
    | "weather"
    | "technology"
    | "travel"
    | "food"
    | "business" = useMemo(() => {
    if (sortMode === "mynews") {
      return "trending";
    }

    if (sortMode === "latest") {
      return "latest";
    }

    if (sortMode === "polls") {
      return "polls";
    }

    if (sortMode === "local") {
      return "local";
    }

    if (sortMode === "sports") {
      return "sports";
    }

    if (sortMode === "celebrity") {
      return "celebrity";
    }

    if (sortMode === "weather") {
      return "weather";
    }

    if (sortMode === "technology") {
      return "technology";
    }

    if (sortMode === "travel") {
      return "travel";
    }

    if (sortMode === "food") {
      return "food";
    }

    if (sortMode === "business") {
      return "business";
    }

    return "trending";
  }, [sortMode]);

  const categoryReloadKey = "__ignore-categories__";
  const isMyFeedWithoutCategories = false;
  const selectedLocalConfig = useMemo(() => {
    if (selectedLocalCityKey) {
      return getLocalCityConfigByKey(selectedLocalCityKey);
    }

    const resolvedCity = resolveSupportedMetroCity({
      label: localLocationLabel,
      city: localQueryDraft,
    });

    return resolvedCity ? getLocalCityConfigByName(resolvedCity) : null;
  }, [localLocationLabel, localQueryDraft, selectedLocalCityKey]);
  const selectedLocalCity = selectedLocalConfig?.displayName ?? null;
  const localEmptyStateHeadline = useMemo(() => {
    if (!selectedLocalCity) {
      return "Choose your city to see local stories.";
    }
    const cityLabel = selectedLocalCity ?? localLocationLabel;
    const cityName = cleanDisplayText(cityLabel).split(",")[0]?.trim();
    return cityName
      ? `No local stories found for ${cityName} yet.`
      : "No local stories found for this city yet.";
  }, [localLocationLabel, selectedLocalCity]);

  const loadFeedPage = useCallback(async (pageToLoad: number, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false;
    const requestId = activeFeedRequestIdRef.current + 1;
    const feedCacheKey = getFeedCacheKey(feedMode);
    const bypassDirectFeedCache =
      feedMode === "local" || feedMode === "weather" || feedMode === "trending";
    const activeFeedTimeoutMs = bypassDirectFeedCache
      ? DIRECT_ROUTE_TIMEOUT_MS
      : INITIAL_FEED_TIMEOUT_MS;
    const cachedFeed = replace && !bypassDirectFeedCache ? readCachedFeedPayload(feedCacheKey) : null;
    activeFeedRequestIdRef.current = requestId;

    const isCurrentRequest = () => activeFeedRequestIdRef.current === requestId;
    let hasLiveNewsResponse = false;
    let initialLoadTimeoutId: number | null = null;
    let initialLoadWarningTimeoutId: number | null = null;
    let articleFetchTimeoutId: number | null = null;

    if (!replace && isFetchingNextPageRef.current) {
      return;
    }

    if (feedMode === "polls") {
      if (replace) {
        setFeedLoadError(null);
        setArticles([]);
        setFeedPage(1);
        setHasMoreArticles(false);
        setIsInitialFeedLoading(false);
        setIsLoading(false);
        setIsLoadingMoreArticles(false);
      }
      return;
    }

      if (replace) {
        if (feedMode === "local") {
          setIsLocalAreaLoading(true);
          setFeedLoadError(null);
          setArticles([]);
        } else {
          setIsLoading(true);
          setFeedLoadError(null);
        }
        setIsInitialFeedLoading(feedMode === "trending" && pageToLoad === 1);
        if (typeof window !== "undefined") {
        initialLoadWarningTimeoutId = window.setTimeout(() => {
          if (!isCurrentRequest()) {
            return;
          }
        }, INITIAL_FEED_WARNING_MS);

        initialLoadTimeoutId = window.setTimeout(() => {
          if (!isCurrentRequest()) {
            return;
          }

          activeFeedRequestIdRef.current += 1;
          console.error("INITIAL APP LOAD FAILED", {
            reason: "timeout",
            feedMode,
            pageToLoad,
            timeoutMs: activeFeedTimeoutMs,
          });
          if (cachedFeed) {
            setFeedLoadError("Showing the last loaded stories while we retry.");
            setArticles(cachedFeed.articles);
            setHasMoreArticles(cachedFeed.hasMore);
            setFeedPage(cachedFeed.page);
          } else {
            setFeedLoadError(sortMode === "local" ? null : "Couldn’t load stories. Tap to retry.");
            setArticles([]);
            setHasMoreArticles(false);
            setFeedPage(1);
          }
          setIsInitialFeedLoading(false);
          isFetchingNextPageRef.current = false;
          setIsLocalAreaLoading(false);
          setIsLoading(false);
          setIsLoadingMoreArticles(false);
        }, activeFeedTimeoutMs);
      }
    } else {
      isFetchingNextPageRef.current = true;
      if (!replace) {
        setIsLoadingMoreArticles(true);
      }
    }

    try {
      let userData: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"] = {
        user: null,
      };

      try {
        const authResponse = await supabase.auth.getUser();
        userData = authResponse.data;
      } catch (error) {
        console.error("INITIAL APP LOAD FAILED", error);
        userData = { user: null };
      }

      if (!isCurrentRequest()) {
        return;
      }

      setUserId(userData.user?.id ?? null);
      setUserEmail(userData.user?.email ?? null);

      if (userData.user?.id) {
        let profile:
          | Awaited<ReturnType<typeof ensureProfileRow>>["data"]
          | null
          | undefined = null;
        let profileError: Awaited<ReturnType<typeof ensureProfileRow>>["error"] | null =
          null;

        try {
          const profileResponse = await ensureProfileRow({
            id: userData.user.id,
            email: userData.user.email ?? null,
          });
          profile = profileResponse.data;
          profileError = profileResponse.error;
        } catch (error) {
          console.error("INITIAL APP LOAD FAILED", error);
          profile = null;
          profileError = null;
        }

        if (profileError) {
          console.error("Error loading home profile:", profileError);
        }

        if (!isCurrentRequest()) {
          return;
        }

        setUsername(profile?.username ?? null);
        const nextCategories = normalizeSelectableCategories(profile?.categories ?? []);
        setCategories((prev) =>
          arraysShallowEqual(prev, nextCategories) ? prev : nextCategories
        );
        console.log("PROFILE LOCAL CITY", profile?.local_city ?? null, profile?.local_state ?? null);
        setSavedLocalCity(profile?.local_city ?? null);
        setSavedLocalState(profile?.local_state ?? null);
        setPreferredSources(profile?.preferred_sources ?? []);
        setShowLessSources(profile?.show_less_sources ?? []);
      } else {
        setUserEmail(null);
        setUsername(null);
        setCategories([]);
        setSavedLocalCity(null);
        setSavedLocalState(null);
        setPreferredSources([]);
        setShowLessSources([]);
      }

      let newsPath = "";
      let newsPayload: PaginatedNewsResponse | null = null;

      if (feedMode === "local") {
        console.log("LOCAL FETCH CITY", selectedLocalCity ?? localLocationLabel ?? DEFAULT_LOCAL_CITY);
        newsPath =
          selectedLocalCityKey === "new-york-ny"
            ? "/api/local/new-york"
            : selectedLocalCityKey === "los-angeles-ca"
              ? "/api/local/los-angeles"
                : selectedLocalCityKey === "chicago-il"
                  ? "/api/local/chicago"
                : selectedLocalCityKey === "houston-tx"
                  ? "/api/local/houston"
                  : selectedLocalCityKey === "austin-tx"
                    ? "/api/local/austin"
                  : selectedLocalCityKey === "jacksonville-fl"
                    ? "/api/local/jacksonville"
                  : selectedLocalCityKey === "dallas-tx"
                    ? "/api/local/dallas"
                  : selectedLocalCityKey === "phoenix-az"
                    ? "/api/local/phoenix"
                    : selectedLocalCityKey === "san-diego-ca"
                      ? "/api/local/san-diego"
                      : selectedLocalCityKey === "san-antonio-tx"
                        ? "/api/local/san-antonio"
                        : selectedLocalCityKey === "philadelphia-pa"
                          ? "/api/local/philadelphia"
                          : "/api/local/charlotte";
      } else {
        const params = new URLSearchParams({
          mode: feedMode,
          page: String(pageToLoad),
          pageSize: String(FEED_PAGE_SIZE),
        });

        if (feedMode === "sports") {
          params.set("query", SPORTS_UNIFIED_QUERY);
        } else if (feedMode === "celebrity") {
          params.set("query", CELEBRITY_FEED_QUERY);
        } else if (feedMode === "weather") {
          newsPath = "/api/weather-news";
        } else if (feedMode === "technology") {
          params.set("query", TECHNOLOGY_FEED_QUERY);
        } else if (feedMode === "travel") {
          params.set("query", TRAVEL_FEED_QUERY);
        } else if (feedMode === "food") {
          params.set("query", FOOD_FEED_QUERY);
        } else if (feedMode === "business") {
          params.set("query", BUSINESS_FEED_QUERY);
        }
        if (!newsPath) {
          newsPath = `/api/aggregated-news?${params.toString()}`;
        }
      }

      {
        const newsUrl = buildApiUrl(newsPath);
        console.log("TRENDING FETCH URL", newsUrl);

        const articleFetchController =
          replace && typeof AbortController !== "undefined" ? new AbortController() : null;

        if (replace && typeof window !== "undefined" && articleFetchController) {
          articleFetchTimeoutId = window.setTimeout(() => {
            articleFetchController.abort();
          }, activeFeedTimeoutMs);
        }

        const newsRes = await apiFetch(newsPath, {
          cache: bypassDirectFeedCache ? "no-store" : undefined,
          signal: articleFetchController?.signal,
        });

        if (!isCurrentRequest()) {
          return;
        }

        if (!newsRes.ok) {
          throw new Error(`Home feed request failed with status ${newsRes.status}`);
        }

        const rawNewsPayload = (await newsRes.json()) as FeedArticlePayload[] | PaginatedNewsResponse;
        newsPayload = normalizeNewsPayload(rawNewsPayload);
      }

      console.log("NEWS API DATA", newsPayload);
      console.log("TRENDING FETCH RESPONSE", newsPayload);

      if (!isCurrentRequest()) {
        return;
      }

      const newsData = newsPayload?.articles ?? [];
      hasLiveNewsResponse = true;
      if (feedMode === "sports") {
        console.log("SPORTS LOCAL FETCH COUNT", newsData.length);
      }
      if (feedMode === "local") {
        console.log("LOCAL FETCH ARTICLE COUNT", newsData.length);
      }
      console.log("NEWS API ARTICLE COUNT", newsData.length);
      console.log("FIRST ARTICLE IMAGE FIELDS", {
        title: newsData[0]?.title,
        image: newsData[0]?.image,
        imageUrl: newsData[0]?.imageUrl,
        urlToImage: newsData[0]?.urlToImage,
      });

      const receivedFallbackFeed =
        newsData.length > 0 && newsData.every((article) => isFallbackFeedArticle(article));

      if (replace && newsData.length === 0) {
        const emptyResponseError = new Error("Trending returned zero articles.");
        console.log("TRENDING FETCH ERROR", emptyResponseError);
        if (feedMode === "local") {
          console.error("LOCAL FETCH ERROR", emptyResponseError);
        }
        if (feedMode === "sports" && sportsPreviewArticles.length > 0) {
          setFeedLoadError(null);
          setIsInitialFeedLoading(false);
          return;
        }
        if (cachedFeed) {
          setFeedLoadError(
            sortMode === "local"
              ? localEmptyStateHeadline
              : "Showing the last loaded stories while we retry."
          );
          setArticles(cachedFeed.articles);
          setHasMoreArticles(cachedFeed.hasMore);
          setFeedPage(cachedFeed.page);
        } else {
          setFeedLoadError(sortMode === "local" ? null : "Couldn’t load stories. Tap to retry.");
          setArticles([]);
          setHasMoreArticles(false);
          setFeedPage(1);
        }
        setIsInitialFeedLoading(false);
        return;
      }

      const [
        likesResult,
        commentsResult,
        commentReactionsResult,
        commentRepliesResult,
        profilesResult,
        savedArticlesResult,
        blockedUsersResult,
        ownBlockedUsersResult,
      ] = await Promise.allSettled([
        supabase.from("likes").select("id, article_id, user_id"),
        supabase
          .from("comments")
          .select("id, article_id, article_key, text, username, user_id, created_at"),
        supabase
          .from("comment_reactions")
          .select("id, comment_id, user_id, reaction_type"),
        supabase
          .from("comment_replies")
          .select("id, comment_id, article_id, text, username, user_id, created_at"),
        supabase.from("profiles").select("id, avatar_url, username"),
        userData.user?.id
          ? supabase
              .from("saved_articles")
              .select("article_id")
              .eq("user_id", userData.user.id)
          : Promise.resolve({ data: [] as DbSavedArticle[], error: null }),
        userData.user?.id
          ? listMutuallyHiddenUserIds(supabase, userData.user.id)
          : Promise.resolve({ data: [] as string[], error: null }),
        userData.user?.id
          ? listBlockedUsers(supabase, userData.user.id)
          : Promise.resolve({ data: [] as DbBlockedUser[], error: null }),
      ]);

      if (!isCurrentRequest()) {
        return;
      }

      const readSettledData = <T,>(
        label: string,
        result: PromiseSettledResult<{ data: T; error: { message?: string } | null }>
      ): T => {
        if (result.status === "rejected") {
          console.error(`Error loading ${label}:`, result.reason);
          return ([] as unknown) as T;
        }

        if (result.value.error) {
          console.error(`Error loading ${label}:`, result.value.error);
        }

        return result.value.data;
      };

      const likes = (readSettledData("likes", likesResult) ?? []) as DbLike[];
      let comments = (readSettledData("comments", commentsResult) ?? []) as DbComment[];
      let commentsUseArticleKeyOnly = true;
      const commentsError =
        commentsResult.status === "fulfilled" ? commentsResult.value.error : null;
      if (
        commentsResult.status === "fulfilled" &&
        commentsError &&
        isMissingCommentKeyColumnError(commentsError.message)
      ) {
        commentsUseArticleKeyOnly = false;
        const legacyCommentsResult = await supabase
          .from("comments")
          .select("id, article_id, text, username, user_id, created_at");
        comments = ((legacyCommentsResult.data ?? []) as DbComment[]) ?? [];
      }
      const commentReactions = (readSettledData(
        "comment reactions",
        commentReactionsResult
      ) ?? []) as DbCommentReaction[];
      const commentReplies = (readSettledData(
        "comment replies",
        commentRepliesResult
      ) ?? []) as DbCommentReply[];
      const profiles = (readSettledData("profiles", profilesResult) ?? []) as DbProfile[];
      const blockedUsersData = (readSettledData(
        "blocked users",
        blockedUsersResult
      ) ?? []) as string[];
      const ownBlockedUsersData = (readSettledData(
        "own blocked users",
        ownBlockedUsersResult
      ) ?? []) as DbBlockedUser[];
      const savedArticlesData = (readSettledData(
        "saved articles",
        savedArticlesResult
      ) ?? []) as DbSavedArticle[];
      const blockedIds = new Set(blockedUsersData);
      const savedArticleIds = new Set(
        savedArticlesData.map((savedArticle) => savedArticle.article_id)
      );
      const avatarLookup = new Map(profiles.map((profile) => [profile.id, profile.avatar_url]));
      const usernameLookup = new Map(profiles.map((profile) => [profile.id, profile.username]));

      const mergedArticles: Article[] = newsData.map((item) => {
        const stableArticleKey = getStableArticleKey(item);
        const articleLikes = likes.filter((like) => like.article_id === item.id).length;
        const articleLikeUsers = likes
          .filter((like) => like.article_id === item.id)
          .map((like) => ({
            user_id: like.user_id,
            username: like.user_id ? usernameLookup.get(like.user_id) ?? null : null,
          }));
        const articleComments = comments
          .filter(
            (comment) =>
              (commentsUseArticleKeyOnly
                ? comment.article_key?.trim() === stableArticleKey
                : comment.article_id === item.id) &&
              (!comment.user_id || !blockedIds.has(comment.user_id))
          )
          .map((comment) => {
            const reactions = commentReactions.filter(
              (reaction) => reaction.comment_id === comment.id
            );
            const replies = commentReplies
              .filter(
                (reply) =>
                  reply.comment_id === comment.id &&
                  (!reply.user_id || !blockedIds.has(reply.user_id))
              )
              .map((reply) => ({
                id: reply.id,
                comment_id: reply.comment_id,
                article_id: reply.article_id,
                text: reply.text,
                username: reply.username,
                user_id: reply.user_id,
                created_at: reply.created_at,
                avatar_url: reply.user_id ? avatarLookup.get(reply.user_id) ?? null : null,
              }));

            return {
              id: comment.id,
              text: comment.text,
              username: comment.username,
              user_id: comment.user_id,
              avatar_url: comment.user_id ? avatarLookup.get(comment.user_id) ?? null : null,
              created_at: comment.created_at,
              likes: reactions.filter((reaction) => reaction.reaction_type === "like")
                .length,
              dislikes: reactions.filter(
                (reaction) => reaction.reaction_type === "dislike"
              ).length,
              currentUserReaction:
                reactions.find((reaction) => reaction.user_id === userData.user?.id)
                  ?.reaction_type ?? null,
              replies,
            };
          });

        return {
          ...item,
          likes: articleLikes,
          likeUsers: articleLikeUsers,
          likedByCurrentUser: articleLikeUsers.some(
            (likeUser) => likeUser.user_id === userData.user?.id
          ),
          comments: articleComments,
          saved: savedArticleIds.has(item.id),
        };
      });

      setBlockedUserIds(
        ownBlockedUsersData.map((blockedUser) => blockedUser.blocked_id)
      );
      setFeedLoadError(
          replace && receivedFallbackFeed && sortMode !== "local"
            ? "Showing the last loaded stories while we retry."
            : null
        );
      setHasMoreArticles(receivedFallbackFeed ? false : (newsPayload?.hasMore ?? false));
      setFeedPage(pageToLoad);
      setArticles((prev) => {
        const nextArticles =
          receivedFallbackFeed && replace
            ? cachedFeed?.articles ?? prev
            : replace
              ? mergedArticles
              : mergeArticlesByIdentity(prev, mergedArticles);
        if (feedMode === "sports" && replace && mergedArticles.length === 0 && prev.length > 0) {
          console.log("SPORTS STATE UPDATE SOURCE", "live-feed-empty-ignored");
          console.log("SPORTS STATE UPDATE COUNT", prev.length);
          return prev;
        }
        console.log("ARTICLES USED", nextArticles);
        console.log("TRENDING FINAL COUNT", nextArticles.length);
        if (feedMode === "sports") {
          console.log("SPORTS STATE UPDATE SOURCE", replace ? "live-feed-replace" : "live-feed-merge");
          console.log("SPORTS STATE UPDATE COUNT", nextArticles.length);
        }
        if (nextArticles.length > 0 && !bypassDirectFeedCache) {
          writeCachedFeedPayload(feedCacheKey, {
            articles: nextArticles,
            page: pageToLoad,
            hasMore: receivedFallbackFeed ? false : (newsPayload?.hasMore ?? false),
            savedAt: new Date().toISOString(),
          });
        }
        return nextArticles;
      });
      if (feedMode === "local") {
        console.log("LOCAL SELECTED CITY", selectedLocalCity ?? localLocationLabel);
        console.log("LOCAL ARTICLES COUNT", newsData.length);
      }
      if (replace) {
        setIsInitialFeedLoading(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      console.log("TRENDING FETCH ERROR", error);
      if (feedMode === "local") {
        console.error("LOCAL FETCH ERROR", error);
      }
      console.error("INITIAL APP LOAD FAILED", error);
      if (replace && !hasLiveNewsResponse) {
        if (cachedFeed) {
          setFeedLoadError(
            sortMode === "local" ? null : "Showing the last loaded stories while we retry."
          );
          setArticles(cachedFeed.articles);
          setHasMoreArticles(cachedFeed.hasMore);
          setFeedPage(cachedFeed.page);
        } else {
          setFeedLoadError(sortMode === "local" ? null : "Couldn’t load stories. Tap to retry.");
          setArticles([]);
          setHasMoreArticles(false);
          setFeedPage(1);
        }
        setIsInitialFeedLoading(false);
      } else {
        console.error("Home feed enrichment failed after live stories loaded", error);
      }
    } finally {
      if (initialLoadWarningTimeoutId) {
        window.clearTimeout(initialLoadWarningTimeoutId);
      }

      if (initialLoadTimeoutId) {
        window.clearTimeout(initialLoadTimeoutId);
      }

      if (articleFetchTimeoutId) {
        window.clearTimeout(articleFetchTimeoutId);
      }

      if (!isCurrentRequest()) {
        return;
      }

      isFetchingNextPageRef.current = false;
      setIsLocalAreaLoading(false);
      console.log("SETTING LOADING FALSE");
      setIsLoading(false);
      setIsLoadingMoreArticles(false);
    }
  }, [
    feedMode,
    localEmptyStateHeadline,
    localLocationLabel,
    selectedLocalCity,
    selectedLocalCityKey,
    sortMode,
  ]);

  useEffect(() => {
    async function loadPolls() {
      const { data: followRowsData, error: followRowsError } = userId
        ? await supabase
            .from("user_follows")
            .select("following_id")
            .eq("follower_id", userId)
        : { data: [], error: null };

      if (followRowsError) {
        console.error("Error loading follows for Polls tab:", followRowsError);
      }

      const pollUserIds = Array.from(
        new Set([
          ...(userId ? [userId] : []),
          ...(((followRowsData ?? []) as { following_id: string }[]).map(
            (followRow) => followRow.following_id
          )),
        ])
      );
      setPollFollowingIds(pollUserIds);

      const [followedPollsResult, recentPollsResult] = await Promise.all([
        pollUserIds.length
          ? supabase
              .from("polls")
              .select(
                "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
              )
              .eq("status", "active")
              .in("user_id", pollUserIds)
              .order("created_at", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] as PollRecord[], error: null }),
        supabase
          .from("polls")
          .select(
            "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
          )
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (followedPollsResult.error) {
        console.error("Error loading followed polls:", followedPollsResult.error);
      }

      if (recentPollsResult.error) {
        console.error("Error loading recent polls:", recentPollsResult.error);
      }

      const mergedPollRows = [
        ...(((followedPollsResult.data ?? []) as PollRecord[]) ?? []),
        ...(((recentPollsResult.data ?? []) as PollRecord[]) ?? []),
      ];
      const dedupedPollRows = Array.from(
        new Map(mergedPollRows.map((poll) => [poll.id, poll])).values()
      );
      const hydratedPolls = await hydratePolls(supabase, dedupedPollRows, userId);

      setMyFeedPolls(hydratedPolls);
    }

    void loadPolls();
  }, [userId]);

  useEffect(() => {
    async function loadTrendingVideos() {
      try {
        const [newsResponse, sportsResponse, celebrityResponse, weatherResponse] = await Promise.all([
          apiFetch("/api/videos?tab=news"),
          apiFetch("/api/videos?tab=sports"),
          apiFetch("/api/videos?tab=celebrity"),
          apiFetch("/api/videos?tab=weather"),
        ]);
        if (!newsResponse.ok) {
          const responseText = await newsResponse.text();
          throw new Error(`Trending news videos request failed (${newsResponse.status}): ${responseText}`);
        }

        if (!sportsResponse.ok) {
          const responseText = await sportsResponse.text();
          throw new Error(`Trending sports videos request failed (${sportsResponse.status}): ${responseText}`);
        }

        if (!celebrityResponse.ok) {
          const responseText = await celebrityResponse.text();
          throw new Error(`Trending celebrity videos request failed (${celebrityResponse.status}): ${responseText}`);
        }

        if (!weatherResponse.ok) {
          const responseText = await weatherResponse.text();
          throw new Error(`Trending weather videos request failed (${weatherResponse.status}): ${responseText}`);
        }

        const [newsData, sportsData, celebrityData, weatherData] = await Promise.all([
          newsResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
          sportsResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
          celebrityResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
          weatherResponse.json() as Promise<{
            videos?: VideoApiItem[];
            fallback?: boolean;
            message?: string;
          }>,
        ]);

        if (newsData.fallback) {
          console.error("Trending news videos fallback used", {
            message: newsData.message ?? "Unknown reason",
          });
        }

        if (sportsData.fallback) {
          console.error("Trending sports videos fallback used", {
            message: sportsData.message ?? "Unknown reason",
          });
        }

        if (celebrityData.fallback) {
          console.error("Trending celebrity videos fallback used", {
            message: celebrityData.message ?? "Unknown reason",
          });
        }

        if (weatherData.fallback) {
          console.error("Trending weather videos fallback used", {
            message: weatherData.message ?? "Unknown reason",
          });
        }

        const sortVerticalFirst = (items: VideoItem[]) =>
          items.sort((left, right) => {
            const leftHint = `${left.title} ${left.watchUrl} ${left.thumbnailUrl ?? ""}`.toLowerCase();
            const rightHint = `${right.title} ${right.watchUrl} ${right.thumbnailUrl ?? ""}`.toLowerCase();
            const leftVerticalScore =
              (left.orientation === "vertical" ? 2 : 0) + (/shorts?/i.test(leftHint) ? 1 : 0);
            const rightVerticalScore =
              (right.orientation === "vertical" ? 2 : 0) + (/shorts?/i.test(rightHint) ? 1 : 0);

            if (rightVerticalScore !== leftVerticalScore) {
              return rightVerticalScore - leftVerticalScore;
            }

            return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
          });

        const normalizedNewsVideos = sortVerticalFirst(normalizeVideoFeedItems(newsData.videos));
        const normalizedSportsVideos = sortVerticalFirst(normalizeVideoFeedItems(sportsData.videos));
        const normalizedCelebrityVideos = sortVerticalFirst(normalizeVideoFeedItems(celebrityData.videos));
        const normalizedWeatherVideos = sortVerticalFirst(normalizeVideoFeedItems(weatherData.videos));

        console.log("VIDEO FETCH COUNT", {
          news: normalizedNewsVideos.length,
          sports: normalizedSportsVideos.length,
          celebrity: normalizedCelebrityVideos.length,
          weather: normalizedWeatherVideos.length,
        });

        setVideos(normalizedNewsVideos);
        setSportsVideos(normalizedSportsVideos);
        setCelebrityVideos(normalizedCelebrityVideos);
        setWeatherVideos(normalizedWeatherVideos);
      } catch (error) {
        console.error("Error loading trending videos:", error);
        setVideos(normalizeVideoFeedItems());
        setSportsVideos(normalizeVideoFeedItems());
        setCelebrityVideos(normalizeVideoFeedItems());
        setWeatherVideos(normalizeVideoFeedItems());
      }
    }

    void loadTrendingVideos();
  }, []);

  useEffect(() => {
    async function loadLocalVideos() {
      const cityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
      const cityName = cityLabel.split(",")[0]?.trim();

      if (!cityName) {
        setLocalVideos([]);
        return;
      }

      const cityKey = cityName.toLowerCase();
      const queryHints = LOCAL_VIDEO_QUERY_HINTS[cityKey] ?? [
        `${cityName} local news`,
        `${cityName} weather`,
        `${cityName} sports`,
      ];
      const relaxedQueryHints = LOCAL_VIDEO_BROAD_FALLBACK_QUERY_HINTS[cityKey] ?? [
        `${cityName} news YouTube`,
        `${cityName} local video`,
        `${cityName} news`,
      ];

      try {
        console.log("LOCAL VIDEO CITY", cityLabel);

        const loadQueryBatch = async (queries: string[]) =>
          Promise.all(
            queries.map(async (query) => {
              const response = await apiFetch(`/api/videos?tab=news&q=${encodeURIComponent(query)}`);

              if (!response.ok) {
                const responseText = await response.text();
                throw new Error(
                  `Local videos request failed (${response.status}): ${responseText}`
                );
              }

              return response.json() as Promise<{
                videos?: VideoApiItem[];
                fallback?: boolean;
                message?: string;
              }>;
            })
          );

        const payloads = await loadQueryBatch(queryHints);
        let mergedVideos = dedupeVideosBySourceTitleAndUrl(
          payloads.flatMap((payload) => normalizeVideoFeedItems(payload.videos))
        );

        console.log("LOCAL VIDEO RAW COUNT", {
          city: cityLabel,
          queries: queryHints,
          count: mergedVideos.length,
        });
        if (cityKey === "charlotte") {
          console.log("CHARLOTTE LOCAL VIDEO RAW COUNT", mergedVideos.length);
        }

        if (mergedVideos.length === 0) {
          const relaxedPayloads = await loadQueryBatch(relaxedQueryHints);
          mergedVideos = dedupeVideosBySourceTitleAndUrl(
            relaxedPayloads.flatMap((payload) => normalizeVideoFeedItems(payload.videos))
          );
        }

        mergedVideos = mergedVideos.sort((left, right) => {
          const leftHint = `${left.title} ${left.watchUrl} ${left.thumbnailUrl ?? ""}`.toLowerCase();
          const rightHint = `${right.title} ${right.watchUrl} ${right.thumbnailUrl ?? ""}`.toLowerCase();
          const leftVerticalScore =
            (left.orientation === "vertical" ? 2 : 0) + (/shorts?/i.test(leftHint) ? 1 : 0);
          const rightVerticalScore =
            (right.orientation === "vertical" ? 2 : 0) + (/shorts?/i.test(rightHint) ? 1 : 0);

          if (rightVerticalScore !== leftVerticalScore) {
            return rightVerticalScore - leftVerticalScore;
          }

          return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
        });

        if (cityKey === "charlotte") {
          console.log("CHARLOTTE LOCAL VIDEO SAMPLE", mergedVideos.slice(0, 3).map((video) => ({
            title: video.title,
            creator: video.creator,
            category: video.category,
          })));
        }
        setLocalVideos(mergedVideos);
      } catch (error) {
        console.error("Error loading local videos:", error);
        setLocalVideos([]);
      }
    }

    void loadLocalVideos();
  }, [selectedLocalCity]);

  useEffect(() => {
    let cancelled = false;

    async function loadNationalWeatherMap() {
      setIsNationalWeatherMapLoading(true);

      try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");

        if (!response.ok) {
          throw new Error(`RainViewer request failed (${response.status})`);
        }

        const payload = (await response.json()) as RainViewerWeatherMapsResponse;
        const host = payload.host?.trim() ?? "";
        const pastFrames = (payload.radar?.past ?? [])
          .map((frame) => ({
            path: frame.path?.trim() ?? "",
            time: typeof frame.time === "number" ? frame.time : null,
          }))
          .filter((frame) => Boolean(frame.path) && typeof frame.time === "number")
          .slice(-6);
        const futureFrames = (payload.radar?.nowcast ?? [])
          .map((frame) => ({
            path: frame.path?.trim() ?? "",
            time: typeof frame.time === "number" ? frame.time : null,
          }))
          .filter((frame) => Boolean(frame.path) && typeof frame.time === "number")
          .slice(0, 3);
        const framePoints = [...pastFrames, ...futureFrames].map((frame, index) => ({
          tileUrl: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
          timestamp: frame.time as number,
          label: formatRadarTimeLabel(frame.time as number),
          isFuture: index >= pastFrames.length,
        }));

        if (!host || framePoints.length === 0) {
          throw new Error("RainViewer payload missing host or frame paths");
        }
        const embedHtml = buildNationalWeatherMapEmbedHtml(framePoints, pastFrames.length);
        const fullscreenEmbedHtml = buildNationalWeatherMapEmbedHtml(framePoints, pastFrames.length, {
          showSelectedTimeLabel: true,
          interactive: true,
        });

        if (!cancelled) {
          setNationalWeatherMapEmbedHtml(embedHtml);
          setNationalWeatherMapFullscreenHtml(fullscreenEmbedHtml);
        }
      } catch (error) {
        console.error("NATIONAL WEATHER MAP LOAD ERROR", error);

        if (!cancelled) {
          setNationalWeatherMapEmbedHtml(null);
          setNationalWeatherMapFullscreenHtml(null);
        }
      } finally {
        if (!cancelled) {
          setIsNationalWeatherMapLoading(false);
        }
      }
    }

    void loadNationalWeatherMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fallbackLocation =
      localStorage.getItem(weatherLocationStorageKey)?.trim() ||
      selectedLocalCity ||
      (savedLocalCity && savedLocalState ? `${savedLocalCity}, ${savedLocalState}` : "") ||
      localLocationLabel ||
      DEFAULT_LOCAL_CITY;

    setSelectedWeatherLocation(fallbackLocation);
    setWeatherSearchDraft(fallbackLocation);
  }, [localLocationLabel, savedLocalCity, savedLocalState, selectedLocalCity, weatherLocationStorageKey]);

  useEffect(() => {
    if (!selectedWeatherLocation.trim()) {
      return;
    }

    let cancelled = false;

    async function loadWeatherLocationData() {
      setIsWeatherPageLoading(true);

      try {
        const normalizedLocation = selectedWeatherLocation.trim();
        const supportedCityCoords = LOCAL_CITY_COORDINATES[normalizedLocation];

        let latitude = supportedCityCoords?.latitude ?? null;
        let longitude = supportedCityCoords?.longitude ?? null;
        let resolvedLabel = normalizedLocation;

        if (latitude === null || longitude === null) {
          const geocodeResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
              normalizedLocation
            )}&count=1&language=en&format=json`
          );

          if (!geocodeResponse.ok) {
            throw new Error(`Weather geocode request failed (${geocodeResponse.status})`);
          }

          const geocodePayload = (await geocodeResponse.json()) as {
            results?: Array<{
              name?: string;
              admin1?: string;
              country_code?: string;
              latitude?: number;
              longitude?: number;
            }>;
          };

          const firstResult = geocodePayload.results?.[0];

          if (
            typeof firstResult?.latitude !== "number" ||
            typeof firstResult?.longitude !== "number"
          ) {
            throw new Error("No weather geocoding result found");
          }

          latitude = firstResult.latitude;
          longitude = firstResult.longitude;
          resolvedLabel = [firstResult.name, firstResult.admin1, firstResult.country_code]
            .filter(Boolean)
            .join(", ");
        }

        const forecastResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=10`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!forecastResponse.ok) {
          throw new Error(`Weather forecast request failed (${forecastResponse.status})`);
        }

        const forecastPayload = (await forecastResponse.json()) as {
          current?: {
            temperature_2m?: number;
            weather_code?: number;
            wind_speed_10m?: number;
            relative_humidity_2m?: number;
          };
          daily?: {
            time?: string[];
            weather_code?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
          };
        };

        if (cancelled || typeof forecastPayload.current?.temperature_2m !== "number") {
          return;
        }

        const dailyTimes = forecastPayload.daily?.time ?? [];
        const dailyCodes = forecastPayload.daily?.weather_code ?? [];
        const dailyHighs = forecastPayload.daily?.temperature_2m_max ?? [];
        const dailyLows = forecastPayload.daily?.temperature_2m_min ?? [];

        const nextForecastDays = dailyTimes.slice(0, 10).map((date, index) => ({
          label: formatForecastDayLabel(date, index),
          dateLabel: formatForecastDateLabel(date),
          weatherLabel: getWeatherLabel(dailyCodes[index]),
          highTemp: typeof dailyHighs[index] === "number" ? dailyHighs[index] ?? null : null,
          lowTemp: typeof dailyLows[index] === "number" ? dailyLows[index] ?? null : null,
        }));

        const nextWeatherPageCard = {
          temperature: forecastPayload.current.temperature_2m,
          weatherLabel: getWeatherLabel(forecastPayload.current.weather_code),
          windMph: forecastPayload.current.wind_speed_10m ?? null,
          humidity: forecastPayload.current.relative_humidity_2m ?? null,
          highTemp: nextForecastDays[0]?.highTemp ?? null,
          lowTemp: nextForecastDays[0]?.lowTemp ?? null,
          cityLabel: resolvedLabel,
        };

        setWeatherPageCard(nextWeatherPageCard);
        setWeatherForecastError(null);

        if (nextForecastDays.length < 2) {
          console.error("10-DAY FORECAST INCOMPLETE", nextForecastDays);
          setWeatherForecastDays([]);
          setWeatherForecastError("10-day forecast unavailable right now.");
        } else {
          setWeatherForecastDays(nextForecastDays);
        }

        setSelectedWeatherLocation(resolvedLabel);
        setWeatherSearchDraft(resolvedLabel);
        localStorage.setItem(weatherLocationStorageKey, resolvedLabel);
      } catch (error) {
        console.error("WEATHER PAGE LOAD ERROR", error);

        if (!cancelled) {
          setWeatherPageCard(null);
          setWeatherForecastDays([]);
          setWeatherForecastError("10-day forecast unavailable right now.");
        }
      } finally {
        if (!cancelled) {
          setIsWeatherPageLoading(false);
        }
      }
    }

    void loadWeatherLocationData();

    return () => {
      cancelled = true;
    };
  }, [selectedWeatherLocation, weatherLocationStorageKey]);

  useEffect(() => {
    if (sortMode !== "local" || !selectedLocalCity) {
      return;
    }

    const normalizedLocalLocation = selectedLocalCity.trim();
    if (!normalizedLocalLocation || selectedWeatherLocation.trim() === normalizedLocalLocation) {
      return;
    }

    setSelectedWeatherLocation(normalizedLocalLocation);
    setWeatherSearchDraft(normalizedLocalLocation);
  }, [selectedLocalCity, selectedWeatherLocation, sortMode]);

  useEffect(() => {
    let isCancelled = false;

    async function loadCategorySection() {
      if (categories.length === 0) {
        if (!isCancelled) {
          setCategorySectionArticles([]);
          setIsCategorySectionLoading(false);
        }
        return;
      }

      setIsCategorySectionLoading(true);

      try {
        const responses = await Promise.allSettled(
          categories
            .slice(0, 8)
            .filter((category) => {
              const normalizedCategory = normalizeSelectedCategoryName(category);
              return normalizedCategory !== "Politics" && normalizedCategory !== "World";
            })
            .map(async (category) => {
            const response = await apiFetch(
              `/api/news?mode=myfeed&category=${encodeURIComponent(category)}&page=1&pageSize=8`
            );

            if (!response.ok) {
              throw new Error(`Category feed request failed (${response.status})`);
            }

            return hydrateFeedArticles(
              normalizeNewsPayload(
                (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            );
            })
        );

        if (isCancelled) {
          return;
        }

        const mergedArticles = responses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("Category section fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);
        const { filteredArticles, removedCount } = filterArticlesBySelectedCategories(
          mergedArticles,
          categories
        );

        console.log("MY NEWS SELECTED CATEGORIES", categories);
        console.log("MY NEWS FILTERED COUNT", filteredArticles.length);
        console.log("MY NEWS REMOVED UNSELECTED COUNT", removedCount);

        setCategorySectionArticles(filteredArticles);
      } catch (error) {
        console.error("Error loading category section:", error);
        if (!isCancelled) {
          setCategorySectionArticles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsCategorySectionLoading(false);
        }
      }
    }

    void loadCategorySection();

    return () => {
      isCancelled = true;
    };
  }, [categories]);

  useEffect(() => {
    let isCancelled = false;

    async function loadHomeSourceRankings() {
      setIsHomeSourceRankingsLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("source_ratings")
          .select("id, user_id, source_name, rating");

        if (error) {
          throw error;
        }

        const ratings = (data ?? []) as Array<{
          user_id: string;
          source_name: string;
          rating: "like" | "dislike";
        }>;
        const currentUserId = user?.id ?? null;
        const sourceMap = new Map<string, RankedSourceSummary>();

        ratings.forEach((rating) => {
          const current = sourceMap.get(rating.source_name) ?? {
            sourceName: rating.source_name,
            likes: 0,
            heartedByCurrentUser: false,
          };

          if (rating.rating === "like") {
            current.likes += 1;
          }

          if (currentUserId && rating.user_id === currentUserId && rating.rating === "like") {
            current.heartedByCurrentUser = true;
          }

          sourceMap.set(rating.source_name, current);
        });

        if (isCancelled) {
          return;
        }

        setHomeSourceRankings(
          [...sourceMap.values()]
            .filter((source) => source.likes > 0)
            .sort((left, right) => {
              if (right.likes !== left.likes) {
                return right.likes - left.likes;
              }

              return left.sourceName.localeCompare(right.sourceName);
            })
            .slice(0, 6)
        );
      } catch (error) {
        console.error("Error loading home source rankings:", error);
        if (!isCancelled) {
          setHomeSourceRankings([]);
        }
      } finally {
        if (!isCancelled) {
          setIsHomeSourceRankingsLoading(false);
        }
      }
    }

    void loadHomeSourceRankings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handlePromptSourceHeart = useCallback(
    (event: MouseEvent<HTMLButtonElement>, sourceName: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (!userId) {
        alert("Log in to heart sources.");
        return;
      }

      const targetSlug = slugifySourceName(sourceName);
      router.push(`/source/${targetSlug}/`);
    },
    [router, userId]
  );

  useEffect(() => {
    const city = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    let isCancelled = false;

    async function loadWeatherCard() {
      const weatherLocation = city;
      console.log("LOCAL WEATHER LOCATION", weatherLocation);
      const coords = LOCAL_CITY_COORDINATES[city];

      if (!coords) {
        if (!isCancelled) {
          setWeatherCard(null);
          setIsWeatherLoading(false);
        }
        return;
      }

      setIsWeatherLoading(true);

      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Weather request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          current?: {
            temperature_2m?: number;
            weather_code?: number;
            wind_speed_10m?: number;
          };
        };

        if (
          isCancelled ||
          typeof payload.current?.temperature_2m !== "number"
        ) {
          return;
        }

        setWeatherCard({
          temperature: payload.current.temperature_2m,
          weatherLabel: getWeatherLabel(payload.current.weather_code),
          windMph: payload.current.wind_speed_10m ?? null,
          cityLabel: city,
        });
      } catch (error) {
        console.error("LOCAL WEATHER ERROR", error);
        if (!isCancelled) {
          setWeatherCard(null);
        }
      } finally {
        if (!isCancelled) {
          setIsWeatherLoading(false);
        }
      }
    }

    void loadWeatherCard();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocalCity]);

  useEffect(() => {
    let isCancelled = false;
    const weatherFetchController =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      typeof window !== "undefined" && weatherFetchController
        ? window.setTimeout(() => {
            weatherFetchController.abort();
          }, DIRECT_ROUTE_TIMEOUT_MS)
        : null;

    async function loadWeatherNews() {
      setIsWeatherNewsLoading(true);

      try {
        const response = await apiFetch("/api/weather-news", {
          cache: "no-store",
          signal: weatherFetchController?.signal,
        });

        if (!response.ok) {
          throw new Error(`Weather news request failed (${response.status})`);
        }

        const payload = normalizeNewsPayload(
          (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
        );
        const matchingArticles = hydrateFeedArticles(payload.articles);

        if (!isCancelled) {
          setWeatherNewsArticles(matchingArticles.slice(0, 3));
        }
      } catch (error) {
        console.error("Error loading weather news:", error);
        if (!isCancelled) {
          setWeatherNewsArticles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsWeatherNewsLoading(false);
        }
      }
    }

    void loadWeatherNews();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      weatherFetchController?.abort();
    };
  }, [selectedLocalCity]);

  useEffect(() => {
    let isCancelled = false;

    async function loadTrendingPreviewSections() {
      if (sortMode !== "trending" && sortMode !== "sports") {
        setBreakingPreviewArticles([]);
        setSportsPreviewArticles([]);
        setCelebrityPreviewArticles([]);
        setTechnologyPreviewArticles([]);
        setBusinessPreviewArticles([]);
        setCarsPreviewArticles([]);
        setOpinionPreviewArticles([]);
        setCrimePreviewArticles([]);
        setFoodPreviewArticles([]);
        setSciencePreviewArticles([]);
        setIsBreakingPreviewLoading(false);
        setIsSportsPreviewLoading(false);
        setIsCelebrityPreviewLoading(false);
        setIsTechnologyPreviewLoading(false);
        setIsBusinessPreviewLoading(false);
        setIsCarsPreviewLoading(false);
        setIsOpinionPreviewLoading(false);
        setIsCrimePreviewLoading(false);
        setIsFoodPreviewLoading(false);
        setIsSciencePreviewLoading(false);
        return;
      }

      setIsSportsPreviewLoading(true);
      if (sortMode === "trending") {
        setIsBreakingPreviewLoading(true);
        setIsCelebrityPreviewLoading(true);
        setIsTechnologyPreviewLoading(true);
        setIsBusinessPreviewLoading(true);
        setIsCarsPreviewLoading(true);
        setIsOpinionPreviewLoading(true);
        setIsCrimePreviewLoading(true);
        setIsArtPreviewLoading(true);
        setIsFoodPreviewLoading(true);
        setIsSciencePreviewLoading(true);
      }

      try {
        const [
          breakingResponse,
          sportsResponse,
          celebrityResponse,
          technologyResponse,
          businessResponse,
          carsResponse,
          opinionResponse,
          crimeResponse,
          artResponse,
          foodResponse,
          scienceResponse,
        ] = await Promise.all([
          sortMode === "trending"
            ? fetch(
                `/api/news?mode=search&query=${encodeURIComponent(
                  BREAKING_NEWS_FEED_QUERY
                )}&pageSize=20`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json" },
                }
              )
            : Promise.resolve(null),
          fetch("/api/news?mode=sports&pageSize=25", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
          sortMode === "trending"
            ? fetch("/api/news?mode=celebrity&pageSize=25", {
                cache: "no-store",
                headers: { Accept: "application/json" },
              })
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch("/api/news?mode=technology&pageSize=25", {
                cache: "no-store",
                headers: { Accept: "application/json" },
              })
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch("/api/news?mode=business&pageSize=25", {
                cache: "no-store",
                headers: { Accept: "application/json" },
              })
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch(
                `/api/news?mode=search&query=${encodeURIComponent(AUTO_FEED_QUERY)}&pageSize=25`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json" },
                }
              )
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch(
                `/api/news?mode=search&query=${encodeURIComponent(OPINION_FEED_QUERY)}&pageSize=25`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json" },
                }
              )
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch(
                `/api/news?mode=search&query=${encodeURIComponent(CRIME_FEED_QUERY)}&pageSize=25`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json" },
                }
              )
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch(
                `/api/news?mode=search&query=${encodeURIComponent(ART_FEED_QUERY)}&pageSize=25`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json" },
                }
              )
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch("/api/news?mode=food&pageSize=25", {
              cache: "no-store",
              headers: { Accept: "application/json" },
            })
            : Promise.resolve(null),
          sortMode === "trending"
            ? fetch(
                `/api/news?mode=search&query=${encodeURIComponent(SCIENCE_FEED_QUERY)}&pageSize=25`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json" },
                }
              )
            : Promise.resolve(null),
        ]);

        const [
          breakingPayload,
          sportsPayload,
          celebrityPayload,
          technologyPayload,
          businessPayload,
          carsPayload,
          opinionPayload,
          crimePayload,
          artPayload,
          foodPayload,
          sciencePayload,
        ] = await Promise.all([
          breakingResponse && "ok" in breakingResponse && breakingResponse.ok
            ? breakingResponse.json().catch(() => null)
            : Promise.resolve(null),
          sportsResponse && "ok" in sportsResponse && sportsResponse.ok
            ? sportsResponse.json().catch(() => null)
            : Promise.resolve(null),
          celebrityResponse && "ok" in celebrityResponse && celebrityResponse.ok
            ? celebrityResponse.json().catch(() => null)
            : Promise.resolve(null),
          technologyResponse && "ok" in technologyResponse && technologyResponse.ok
            ? technologyResponse.json().catch(() => null)
            : Promise.resolve(null),
          businessResponse && "ok" in businessResponse && businessResponse.ok
            ? businessResponse.json().catch(() => null)
            : Promise.resolve(null),
          carsResponse && "ok" in carsResponse && carsResponse.ok
            ? carsResponse.json().catch(() => null)
            : Promise.resolve(null),
          opinionResponse && "ok" in opinionResponse && opinionResponse.ok
            ? opinionResponse.json().catch(() => null)
            : Promise.resolve(null),
          crimeResponse && "ok" in crimeResponse && crimeResponse.ok
            ? crimeResponse.json().catch(() => null)
            : Promise.resolve(null),
          artResponse && "ok" in artResponse && artResponse.ok
            ? artResponse.json().catch(() => null)
            : Promise.resolve(null),
          foodResponse && "ok" in foodResponse && foodResponse.ok
            ? foodResponse.json().catch(() => null)
            : Promise.resolve(null),
          scienceResponse && "ok" in scienceResponse && scienceResponse.ok
            ? scienceResponse.json().catch(() => null)
            : Promise.resolve(null),
        ]);

        if (isCancelled) {
          return;
        }

        const nextBreakingArticles = breakingPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                breakingPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextSportsArticles = sportsPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                sportsPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextCelebrityArticles = celebrityPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                celebrityPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextTechnologyArticles = technologyPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                technologyPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextBusinessArticles = businessPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                businessPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextCarsArticles = carsPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                carsPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            ).filter((article) => isStrictAutoArticle(article))
          : [];
        const nextOpinionArticles = opinionPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                opinionPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            ).filter(
              (article) => isStrictOpinionArticle(article) && !isLowInformationLiveStreamArticle(article)
            )
          : [];
        const nextCrimeArticles = crimePayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                crimePayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            ).filter(
              (article) => isStrictCrimeArticle(article) && !isLowInformationLiveStreamArticle(article)
            )
          : [];
        const nextArtArticles = artPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                artPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            ).filter(
              (article) => isStrictArtArticle(article) && !isLowInformationLiveStreamArticle(article)
            )
          : [];
        const nextFoodArticles = foodPayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                foodPayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            )
          : [];
        const nextScienceArticles = sciencePayload
          ? hydrateFeedArticles(
              normalizeNewsPayload(
                sciencePayload as FeedArticlePayload[] | PaginatedNewsResponse
              ).articles
            ).filter(
              (article) => isStrictScienceArticle(article) && !isLowInformationLiveStreamArticle(article)
            )
          : [];

        if (sortMode === "trending") {
          setBreakingPreviewArticles((prev) =>
            nextBreakingArticles.length > 0
              ? nextBreakingArticles.filter((article) => !isLowInformationLiveStreamArticle(article))
              : prev
          );
          setCelebrityPreviewArticles(nextCelebrityArticles);
          setTechnologyPreviewArticles(nextTechnologyArticles);
          setBusinessPreviewArticles(nextBusinessArticles);
          setCarsPreviewArticles(nextCarsArticles);
          setOpinionPreviewArticles((prev) => (nextOpinionArticles.length > 0 ? nextOpinionArticles : prev));
          setCrimePreviewArticles((prev) => (nextCrimeArticles.length > 0 ? nextCrimeArticles : prev));
          setArtPreviewArticles((prev) => (nextArtArticles.length > 0 ? nextArtArticles : prev));
          setFoodPreviewArticles(nextFoodArticles);
          setSciencePreviewArticles((prev) => (nextScienceArticles.length > 0 ? nextScienceArticles : prev));
        }
        console.log("SPORTS BROAD FETCH COUNT", nextSportsArticles.length);
        setSportsPreviewArticles((prev) => {
          const nextValue = nextSportsArticles.length > 0 ? nextSportsArticles : prev;
          console.log("SPORTS STATE UPDATE SOURCE", "broad-preview");
          console.log("SPORTS STATE UPDATE COUNT", nextValue.length);
          return nextValue;
        });
      } catch (error) {
        console.error("TRENDING SECTION PREVIEW LOAD FAILED", error);
      } finally {
        if (!isCancelled) {
          if (sortMode === "trending") {
            setIsBreakingPreviewLoading(false);
            setIsCelebrityPreviewLoading(false);
            setIsTechnologyPreviewLoading(false);
          setIsBusinessPreviewLoading(false);
          setIsCarsPreviewLoading(false);
          setIsOpinionPreviewLoading(false);
          setIsCrimePreviewLoading(false);
          setIsArtPreviewLoading(false);
          setIsFoodPreviewLoading(false);
          setIsSciencePreviewLoading(false);
          }
          setIsSportsPreviewLoading(false);
        }
      }
    }

    void loadTrendingPreviewSections();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPopularMusicAlbums() {
      if (sortMode !== "celebrity" && sortMode !== "trending") {
        setPopularMusicAlbums([]);
        return;
      }

      try {
        const response = await apiFetch("/api/music", {
          cache: "no-store",
        });

        if (!response.ok) {
          if (!isCancelled) {
            setPopularMusicAlbums([]);
          }
          return;
        }

        const payload = (await response.json()) as {
          albums?: PopularMusicAlbum[];
        };

        if (!isCancelled) {
          setPopularMusicAlbums(Array.isArray(payload.albums) ? payload.albums : []);
        }
      } catch (error) {
        console.error("Failed to load popular music albums", error);
        if (!isCancelled) {
          setPopularMusicAlbums([]);
        }
      }
    }

    void loadPopularMusicAlbums();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  useEffect(() => {
    let isCancelled = false;

    async function loadEntertainmentSectionVideos() {
      if (sortMode !== "celebrity") {
        setEntertainmentSectionVideos({
          gossip: [],
          music: [],
          tv: [],
          celebrity: [],
          movies: [],
        });
        return;
      }

      try {
        const [gossipVideos, musicVideos, tvVideos, celebritySectionVideos, movieVideos] =
          await Promise.all([
            fetchEntertainmentVideosForQueries(ENTERTAINMENT_SECTION_VIDEO_QUERIES.gossip),
            fetchEntertainmentVideosForQueries(ENTERTAINMENT_SECTION_VIDEO_QUERIES.music),
            fetchEntertainmentVideosForQueries(ENTERTAINMENT_SECTION_VIDEO_QUERIES.tv),
            fetchEntertainmentVideosForQueries(ENTERTAINMENT_SECTION_VIDEO_QUERIES.celebrity),
            fetchEntertainmentVideosForQueries(ENTERTAINMENT_SECTION_VIDEO_QUERIES.movies),
          ]);

        if (isCancelled) {
          return;
        }

        const buildSectionVideos = (
          section: "gossip" | "music" | "tv" | "celebrity" | "movies",
          inputVideos: VideoItem[],
          matcher: (video: VideoItem) => boolean
        ) => {
          const accepted = inputVideos.filter((video) => matcher(video));
          const rejected = inputVideos.filter((video) => !matcher(video));
          console.log(
            "ENTERTAINMENT SECTION VIDEO ACCEPTED",
            accepted.slice(0, 8).map((video) => ({ section, title: video.title, creator: video.creator }))
          );
          console.log(
            "ENTERTAINMENT SECTION VIDEO_REJECTED",
            rejected.slice(0, 8).map((video) => ({ section, title: video.title, creator: video.creator }))
          );
          const selected = selectSourceBalancedVideos(
            accepted.sort(
              (leftVideo, rightVideo) =>
                getPublishedAtTimestamp(rightVideo.publishedAt) -
                getPublishedAtTimestamp(leftVideo.publishedAt)
            ),
            1,
            1
          ).slice(0, 1);
          console.log("ENTERTAINMENT SECTION VIDEO FINAL", { section, count: selected.length });
          return selected;
        };

        setEntertainmentSectionVideos({
          gossip: buildSectionVideos("gossip", gossipVideos, isEntertainmentGossipVideo),
          music: buildSectionVideos("music", musicVideos, isEntertainmentMusicVideo),
          tv: buildSectionVideos("tv", tvVideos, isEntertainmentTvVideo),
          celebrity: buildSectionVideos("celebrity", celebritySectionVideos, isEntertainmentCelebrityVideo),
          movies: buildSectionVideos("movies", movieVideos, isEntertainmentMoviesVideo),
        });
      } catch (error) {
        console.error("Failed to load entertainment section videos", error);
        if (!isCancelled) {
          setEntertainmentSectionVideos({
            gossip: [],
            music: [],
            tv: [],
            celebrity: [],
            movies: [],
          });
        }
      }
    }

    void loadEntertainmentSectionVideos();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  const handleVoteOnPoll = async (pollId: string, optionId: string) => {
    if (!userId) {
      alert("Log in to vote in polls.");
      return;
    }

    const currentPoll = myFeedPolls.find((poll) => poll.id === pollId) ?? null;

    if (!currentPoll || currentPoll.userVoteOptionId) {
      return;
    }

    setActivePollVoteId(pollId);

    const { error } = await supabase.from("poll_votes").insert({
      poll_id: pollId,
      option_id: optionId,
      user_id: userId,
    });

    setActivePollVoteId(null);

    if (error) {
      console.error("Error saving poll vote:", error);
      alert(error.message ?? "Could not save your vote.");
      return;
    }

    setMyFeedPolls((prev) => applyPollVoteUpdate(prev, pollId, optionId));
  };

  const handleToggleVideoLike = (videoId: string) => {
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId
          ? {
              ...video,
              liked: !video.liked,
              likes: video.liked ? Math.max(0, video.likes - 1) : video.likes + 1,
            }
          : video
      );

    setVideos((prev) => updateVideos(prev));
    setSportsVideos((prev) => updateVideos(prev));
  };

  const handleToggleVideoSave = (videoId: string) => {
    const updateVideos = (items: VideoItem[]) =>
      items.map((video) =>
        video.id === videoId ? { ...video, saved: !video.saved } : video
      );

    setVideos((prev) => updateVideos(prev));
    setSportsVideos((prev) => updateVideos(prev));
  };

  const handleOpenFeedVideo = useCallback(
    (videoId: string, tab: SharedVideoTab) => {
      saveVideoReturnState({
        path: "/",
        scrollY: window.scrollY,
        sortMode,
        selectedLocalCity,
        localLocationLabel,
        tab,
        originLabel:
          sortMode === "sports"
            ? "Sports"
            : sortMode === "local"
              ? "Local"
              : "My News",
      });
      router.push(`/videos?tab=${tab}&video=${videoId}`);
    },
    [localLocationLabel, router, selectedLocalCity, sortMode]
  );

  const applyLocalCitySelection = useCallback((city: string) => {
    const nextConfig = getLocalCityConfigByName(city);
    const nextDisplayName = nextConfig?.displayName ?? city;

    setLocalQueryDraft(city);
    setLocalLocationLabel(nextDisplayName);
    setSelectedLocalCityKey(nextConfig?.cityKey ?? null);
    setLocalQuery(
      nextConfig ? buildLocalNewsQueryText(nextConfig) : buildLocalNewsQuery({ label: city })
    );
    setLocalSearchStatus(null);
    setFeedLoadError(null);
    setWeatherNewsArticles([]);
    if (sortMode === "local") {
      setArticles([]);
      setFeedPage(1);
      setHasMoreArticles(false);
      setIsLocalAreaLoading(true);
    }

    if (userId && nextConfig) {
      const currentCity = savedLocalCity?.trim() ?? "";
      const currentState = savedLocalState?.trim() ?? "";

      if (currentCity !== nextConfig.city || currentState !== nextConfig.state) {
        console.log("SAVING LOCAL CITY", nextConfig.city, nextConfig.state);
        void (async () => {
          const result = await saveProfilePatch(
            {
              id: userId,
              email: userEmail ?? null,
            },
            {
              local_city: nextConfig.city,
              local_state: nextConfig.state,
            }
          );

          if (result.error) {
            console.error("LOCAL CITY SAVE ERROR", result.error);
            return;
          }

          setSavedLocalCity(nextConfig.city);
          setSavedLocalState(nextConfig.state);
        })();
      }
    }
  }, [savedLocalCity, savedLocalState, sortMode, userEmail, userId]);

  useEffect(() => {
    if (isMyFeedWithoutCategories) {
      const timeoutId = window.setTimeout(() => {
        setArticles([]);
        setFeedPage(1);
        setHasMoreArticles(false);
        setFeedLoadError(null);
        setIsLoading(false);
        setIsInitialFeedLoading(false);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    if (sortMode === "local" && !selectedLocalCityKey && !localLocationLabel.trim()) {
      const savedCityLabel =
        savedLocalCity && savedLocalState ? `${savedLocalCity}, ${savedLocalState}` : "";
      const nextCityLabel = getLocalCityConfigByName(savedCityLabel)
        ? savedCityLabel
        : DEFAULT_LOCAL_CITY;

      console.log("LOCAL FETCH ON MOUNT", {
        initialized: false,
        city: nextCityLabel,
      });
      applyLocalCitySelection(nextCityLabel);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (sortMode === "local") {
        console.log("LOCAL FETCH ON MOUNT", {
          initialized: true,
          city: selectedLocalCity ?? localLocationLabel ?? DEFAULT_LOCAL_CITY,
        });
      }
      void loadFeedPage(1, { replace: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    applyLocalCitySelection,
    categoryReloadKey,
    isMyFeedWithoutCategories,
    loadFeedPage,
    localLocationLabel,
    savedLocalCity,
    savedLocalState,
    selectedLocalCity,
    selectedLocalCityKey,
    sortMode,
  ]);

  const handleUpdateWeatherLocation = useCallback(() => {
    const nextLocation = cleanDisplayText(weatherSearchDraft).trim();

    if (!nextLocation) {
      return;
    }

    setSelectedWeatherLocation(nextLocation);
  }, [weatherSearchDraft]);

  useEffect(() => {
    if (replyTarget) {
      commentInputRef.current?.focus();
    }
  }, [replyTarget]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;

    if (!sentinel || isLoading || isLoadingMoreArticles || !hasMoreArticles) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (
          !entry?.isIntersecting ||
          isLoadingMoreArticles ||
          isLoading ||
          !hasMoreArticles ||
          isFetchingNextPageRef.current
        ) {
          return;
        }

        void loadFeedPage(feedPage + 1);
      },
      {
        rootMargin: "320px 0px",
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [feedPage, hasMoreArticles, isLoading, isLoadingMoreArticles, loadFeedPage]);

  useEffect(() => {
    if (
      sortMode !== "trending" &&
      sortMode !== "mynews" &&
      sortMode !== "sports" &&
      sortMode !== "local" &&
      sortMode !== "celebrity" &&
      sortMode !== "weather" &&
      sortMode !== "food"
    ) {
      return;
    }

    const frameEntries = Object.entries(trendingVideoFrameRefs.current).filter(
      ([, node]) => Boolean(node)
    );

    if (frameEntries.length === 0) {
      return;
    }

    const visibilityMap = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoKey = (entry.target as HTMLDivElement).dataset.videoKey;

          if (!videoKey) {
            return;
          }

          visibilityMap.set(videoKey, entry.isIntersecting ? entry.intersectionRatio : 0);

          if (videoKey.startsWith("mynews-category-") && entry.isIntersecting && entry.intersectionRatio >= 0.3) {
            console.log("MY NEWS CATEGORY VIDEO AUTOPLAY ATTEMPT", videoKey);
          }

          if (
            videoKey.startsWith("mynews-category-tech:") &&
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.3
          ) {
            console.log("MY NEWS TECH VIDEO AUTOPLAY ATTEMPT", videoKey);
          }
        });

        const nextAutoplayKeys = Array.from(visibilityMap.entries())
          .filter(([, ratio]) => ratio >= 0.3)
          .sort((left, right) => right[1] - left[1])
          .map(([videoKey]) => videoKey);

        setAutoplayTrendingVideoKeys(nextAutoplayKeys);
      },
      {
        threshold: [0.16, 0.24, 0.3, 0.45, 0.65],
        rootMargin: "8% 0px -8% 0px",
      }
    );

    frameEntries.forEach(([videoKey, node]) => {
      if (node) {
        visibilityMap.set(videoKey, 0);
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [articles.length, celebrityVideos, sortMode, sportsVideos, videos, weatherVideos]);

  useEffect(() => {
    if (sortMode !== "mynews") {
      setActiveMyNewsTechVideoKey(null);
      return;
    }

    const techEntries = Object.entries(trendingVideoFrameRefs.current).filter(
      ([videoKey, node]) => videoKey.startsWith("mynews-category-tech:") && Boolean(node)
    ) as Array<[string, HTMLDivElement]>;

    if (techEntries.length === 0) {
      return;
    }

    const visibilityMap = new Map<string, number>();
    const techScrollParents = Array.from(
      new Set(
        techEntries
          .map(([, node]) => node.closest(".quick-watch-scroll"))
          .filter((node): node is HTMLElement => Boolean(node))
      )
    );

    const computeVisibilityRatio = (node: HTMLDivElement) => {
      const rect = node.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return 0;
      }

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const visibleArea = visibleWidth * visibleHeight;
      const totalArea = rect.width * rect.height;

      return totalArea > 0 ? visibleArea / totalArea : 0;
    };

    const syncTechAutoplayKeys = () => {
      techEntries.forEach(([videoKey, node]) => {
        visibilityMap.set(videoKey, computeVisibilityRatio(node));
      });

      const topVisibleTechKey = Array.from(visibilityMap.entries())
        .filter(([, ratio]) => ratio >= 0.55)
        .sort((left, right) => right[1] - left[1])[0]?.[0];

      setAutoplayTrendingVideoKeys((currentKeys) => {
        const nonTechKeys = currentKeys.filter((key) => !key.startsWith("mynews-category-tech:"));
        const nextKeys = topVisibleTechKey ? [...nonTechKeys, topVisibleTechKey] : nonTechKeys;
        const hasSameLength = nextKeys.length === currentKeys.length;
        const hasSameOrder = hasSameLength && nextKeys.every((key, index) => key === currentKeys[index]);

        if (hasSameOrder) {
          return currentKeys;
        }

        if (topVisibleTechKey) {
          console.log("MY NEWS TECH VIDEO AUTOPLAY ATTEMPT", topVisibleTechKey);
        }

        return nextKeys;
      });
      setActiveMyNewsTechVideoKey(topVisibleTechKey ?? null);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoKey = (entry.target as HTMLDivElement).dataset.videoKey;

          if (!videoKey?.startsWith("mynews-category-tech:")) {
            return;
          }

          visibilityMap.set(videoKey, entry.isIntersecting ? entry.intersectionRatio : 0);
        });

        syncTechAutoplayKeys();
      },
      {
        threshold: [0.55, 0.7, 0.85],
        rootMargin: "0px",
      }
    );

    techEntries.forEach(([videoKey, node]) => {
      visibilityMap.set(videoKey, 0);
      observer.observe(node);
    });

    const handleVisibilityRefresh = () => {
      window.requestAnimationFrame(syncTechAutoplayKeys);
    };

    handleVisibilityRefresh();
    window.addEventListener("scroll", handleVisibilityRefresh, { passive: true });
    window.addEventListener("resize", handleVisibilityRefresh);
    window.addEventListener("focus", handleVisibilityRefresh);
    window.addEventListener("pageshow", handleVisibilityRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    techScrollParents.forEach((node) => {
      node.addEventListener("scroll", handleVisibilityRefresh, { passive: true });
    });

    return () => {
      observer.disconnect();
      setActiveMyNewsTechVideoKey(null);
      window.removeEventListener("scroll", handleVisibilityRefresh);
      window.removeEventListener("resize", handleVisibilityRefresh);
      window.removeEventListener("focus", handleVisibilityRefresh);
      window.removeEventListener("pageshow", handleVisibilityRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      techScrollParents.forEach((node) => {
        node.removeEventListener("scroll", handleVisibilityRefresh);
      });
    };
  }, [categories, myNewsCategorySupplementalVideos, sortMode]);

  useEffect(() => {
    if (sortMode !== "local") {
      return;
    }

    if (selectedLocalCity || localQuery.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const savedCityLabel =
        savedLocalCity && savedLocalState ? `${savedLocalCity}, ${savedLocalState}` : "";
      const nextCityLabel = getLocalCityConfigByName(savedCityLabel)
        ? savedCityLabel
        : DEFAULT_LOCAL_CITY;

      console.log("LOCAL INITIAL CITY", nextCityLabel);
      applyLocalCitySelection(nextCityLabel);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    applyLocalCitySelection,
    localQuery,
    savedLocalCity,
    savedLocalState,
    selectedLocalCity,
    sortMode,
  ]);

  useEffect(() => {
    if (selectedLocalCityKey || localLocationLabel.trim() || localQuery.trim()) {
      return;
    }

    const savedCityLabel =
      savedLocalCity && savedLocalState ? `${savedLocalCity}, ${savedLocalState}` : "";
    const nextCityLabel = getLocalCityConfigByName(savedCityLabel)
      ? savedCityLabel
      : DEFAULT_LOCAL_CITY;

    console.log("LOCAL INITIAL CITY", nextCityLabel);
    applyLocalCitySelection(nextCityLabel);
  }, [
    applyLocalCitySelection,
    localLocationLabel,
    localQuery,
    savedLocalCity,
    savedLocalState,
    selectedLocalCityKey,
  ]);

  useEffect(() => {
    const pendingReturnState = consumePendingArticleReturnState();

    if (!pendingReturnState || pendingReturnState.path !== "/") {
      return;
    }

    const restoreFrameId = window.requestAnimationFrame(() => {
      if (pendingReturnState.sortMode) {
        setSortMode(pendingReturnState.sortMode);
      }

      if (pendingReturnState.sortMode === "local" && pendingReturnState.selectedLocalCity) {
        applyLocalCitySelection(pendingReturnState.selectedLocalCity);
      }

      window.scrollTo({
        top: pendingReturnState.scrollY ?? 0,
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(restoreFrameId);
    };
  }, [applyLocalCitySelection]);

  useEffect(() => {
    const pendingReturnState = consumePendingVideoReturnState();

    if (!pendingReturnState || pendingReturnState.path !== "/") {
      return;
    }

    const restoreFrameId = window.requestAnimationFrame(() => {
      if (pendingReturnState.sortMode) {
        setSortMode(pendingReturnState.sortMode);
      }

      if (
        pendingReturnState.sortMode === "local" &&
        pendingReturnState.selectedLocalCity
      ) {
        applyLocalCitySelection(pendingReturnState.selectedLocalCity);
      }

      window.scrollTo({
        top: pendingReturnState.scrollY ?? 0,
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(restoreFrameId);
    };
  }, [applyLocalCitySelection]);

  const handleUpdateLocalQuery = useCallback(async () => {
    const trimmedDraft = localQueryDraft.trim();
    const resolveSupportedCity = (value: string) => {
      const normalizedValue = cleanDisplayText(value).trim().toLowerCase();

      return (
        cityOptions.find(
          (city) => city.displayName.trim().toLowerCase() === normalizedValue
        )?.displayName ?? null
      );
    };

    if (!trimmedDraft) {
      setArticles([]);
      setLocalLocationLabel("");
      setLocalQuery("");
      setLocalSearchStatus("Choose your city to see local stories.");
      setIsLocalAreaLoading(false);
      return;
    }

    if (/^\d{5}$/.test(trimmedDraft)) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&postalcode=${encodeURIComponent(
            trimmedDraft
          )}&limit=1&addressdetails=1`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );
        const payload = (await response.json().catch(() => [])) as Array<{
          address?: {
            city?: string;
            town?: string;
            village?: string;
            state?: string;
          };
        }>;
        const firstMatch = payload[0];
        const city =
          firstMatch?.address?.city ??
          firstMatch?.address?.town ??
          firstMatch?.address?.village ??
          "";
        const state = firstMatch?.address?.state ?? "";
        const nextLabel = [city, state].filter(Boolean).join(", ");

        if (nextLabel) {
          const supportedCity =
            resolveSupportedCity(nextLabel) ??
            resolveSupportedMetroCity({ city, state, label: nextLabel });

          if (supportedCity) {
            applyLocalCitySelection(supportedCity);
            setLocalSearchStatus(null);
            return;
          }

          setLocalSearchStatus("Choose a nearby city.");
          return;
        }
      } catch (error) {
        console.error("Error resolving local zip code:", error);
      }
    }

    const supportedCity = resolveSupportedCity(trimmedDraft);

    if (!supportedCity) {
      setLocalSearchStatus("Choose a supported nearby city.");
      return;
    }

    applyLocalCitySelection(supportedCity);
    setLocalSearchStatus(null);
  }, [applyLocalCitySelection, cityOptions, localQueryDraft]);

  const createNotification = useCallback(
    async ({
      recipientUserId,
      type,
      articleId,
      commentId,
      replyId,
    }: {
      recipientUserId: string | null;
      type: "comment_like" | "comment_reply";
      articleId: number;
      commentId: number;
      replyId?: number | null;
    }) => {
      if (!userId || !recipientUserId || recipientUserId === userId) {
        return;
      }

      const { error } = await supabase.from("notifications").insert({
        recipient_user_id: recipientUserId,
        actor_user_id: userId,
        type,
        article_id: articleId,
        comment_id: commentId,
        reply_id: replyId ?? null,
      });

      if (error) {
        console.error("Error creating notification:", error);
      }
    },
    [userId]
  );

  const applyArticleUpdateAcrossCollections = useCallback(
    (articleId: number, updater: (article: Article) => Article) => {
      const updateArticles = (items: Article[]) =>
        items.map((article) => (article.id === articleId ? updater(article) : article));

      setArticles((prev) => updateArticles(prev));
      setCategorySectionArticles((prev) => updateArticles(prev));
      setWeatherNewsArticles((prev) => updateArticles(prev));
      setBreakingPreviewArticles((prev) => updateArticles(prev));
      setSportsPreviewArticles((prev) => updateArticles(prev));
      setCelebrityPreviewArticles((prev) => updateArticles(prev));
      setTechnologyPreviewArticles((prev) => updateArticles(prev));
      setBusinessPreviewArticles((prev) => updateArticles(prev));
      setFoodPreviewArticles((prev) => updateArticles(prev));
    },
    []
  );

  const handleLike = async (articleId: number) => {
    if (!userId) {
      alert("Log in to like posts");
      return;
    }

    const currentArticle = [
      ...articles,
      ...categorySectionArticles,
      ...weatherNewsArticles,
      ...breakingPreviewArticles,
      ...sportsPreviewArticles,
      ...celebrityPreviewArticles,
      ...technologyPreviewArticles,
    ].find((article) => article.id === articleId);

    const currentlyLiked = currentArticle?.likedByCurrentUser ?? false;
    const nextLiked = !currentlyLiked;

    applyArticleUpdateAcrossCollections(articleId, (article) => ({
      ...article,
      likes: nextLiked ? article.likes + 1 : Math.max(0, article.likes - 1),
      likeUsers: nextLiked
        ? article.likeUsers.some((likeUser) => likeUser.user_id === userId)
          ? article.likeUsers
          : [
              ...article.likeUsers,
              {
                user_id: userId,
                username,
              },
            ]
        : article.likeUsers.filter((likeUser) => likeUser.user_id !== userId),
      likedByCurrentUser: nextLiked,
    }));

    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Error removing like:", error);
        applyArticleUpdateAcrossCollections(articleId, (article) => ({
          ...article,
          likes: article.likes + 1,
          likeUsers: article.likeUsers.some((likeUser) => likeUser.user_id === userId)
            ? article.likeUsers
            : [
                ...article.likeUsers,
                {
                  user_id: userId,
                  username,
                },
              ],
          likedByCurrentUser: true,
        }));
        return;
      }
      return;
    }

    const { error } = await supabase.from("likes").insert({
      article_id: articleId,
      user_id: userId,
    });

    if (error) {
      console.error("Error saving like:", error);
      applyArticleUpdateAcrossCollections(articleId, (article) => ({
        ...article,
        likes: Math.max(0, article.likes - 1),
        likeUsers: article.likeUsers.filter((likeUser) => likeUser.user_id !== userId),
        likedByCurrentUser: false,
      }));
      return;
    }
  };

  const handleCardSave = useCallback(
    async (article: Article) => {
      if (!userId) {
        alert("Log in to save articles");
        return;
      }

      const targetArticleId = article.id;
      const nextSaved = !article.saved;

      applyArticleUpdateAcrossCollections(targetArticleId, (currentArticle) => ({
        ...currentArticle,
        saved: nextSaved,
      }));

      if (article.saved) {
        const { error } = await supabase
          .from("saved_articles")
          .delete()
          .eq("user_id", userId)
          .eq("article_id", targetArticleId);

        if (error) {
          console.error("Error removing saved article:", error);
          applyArticleUpdateAcrossCollections(targetArticleId, (currentArticle) => ({
            ...currentArticle,
            saved: true,
          }));
          return;
        }

        return;
      }

      const { error } = await supabase.from("saved_articles").upsert(
        {
          user_id: userId,
          article_id: targetArticleId,
          title: cleanDisplayText(article.title),
          source: article.source,
          category: article.category,
          time: article.time,
          url: article.url ?? null,
          image: getBestArticleImage(article).src,
          published_at: article.publishedAt ?? null,
        },
        {
          onConflict: "user_id,article_id",
        }
      );

      if (error) {
        console.error("Error saving article:", error);
        applyArticleUpdateAcrossCollections(targetArticleId, (currentArticle) => ({
          ...currentArticle,
          saved: false,
        }));
      }
    },
    [applyArticleUpdateAcrossCollections, userId]
  );

  const handleCardShare = useCallback(async (article: Article) => {
    const shareUrl =
      article.url?.trim() ||
      (typeof window !== "undefined" && typeof article.id === "number"
        ? `${window.location.origin}/article/${article.id}/`
        : "");

    if (!shareUrl) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: cleanDisplayText(article.title),
          text: cleanDisplayText(article.title),
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard.");
    } catch (error) {
      console.error("ARTICLE SHARE FAILED", error);
    }
  }, []);

  const openLongPressMenu = useCallback((article: Article) => {
    setLongPressMenuArticle(article);
  }, []);

  const clearArticleLongPressTimer = useCallback(() => {
    if (articleLongPressTimerRef.current !== null) {
      window.clearTimeout(articleLongPressTimerRef.current);
      articleLongPressTimerRef.current = null;
    }
  }, []);

  const handlePrimaryArticleOpen = useCallback(
    async (
      event: { preventDefault: () => void; stopPropagation?: () => void },
      article: Article
    ) => {
      await handleArticleCardActivation(
        event,
        {
          id: article.id,
          url: article.url,
          title: article.title,
          source: article.source,
          description: article.description ?? null,
          imageSrc: getBestArticleImage(article).src ?? null,
          publishedLabel: formatFreshnessTime(article.publishedAt, article.time),
          category: getCategoryLabel(getSafeCategoryLabel(article.category, article)),
        },
        () => {
        persistArticleMetadata(article);
        saveArticleReturnState({
          path: "/",
          scrollY: window.scrollY,
          source: "home",
          sortMode,
          selectedLocalCity,
          localLocationLabel,
        });
        }
      );
    },
    [localLocationLabel, selectedLocalCity, sortMode]
  );

  useEffect(() => () => clearArticleLongPressTimer(), [clearArticleLongPressTimer]);

  useEffect(() => {
    if (sortMode !== "sports") {
      setIsMoreSportsVideosVisible(false);
      return;
    }

    const node = moreSportsVideosSectionRef.current;

    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.28);

        if (isVisible) {
          console.log("MORE VIDEOS VERTICAL AUTOPLAY ATTEMPT");
        }

        setIsMoreSportsVideosVisible(isVisible);
      },
      {
        threshold: [0.16, 0.28, 0.45],
        rootMargin: "0px 0px -10% 0px",
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [sortMode, sportsVideos.length]);

  const handleCommentInputChange = (articleId: number, value: string) => {
    setCommentComposerStatus(null);
    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: value,
    }));
  };

  const handleAddComment = async (articleId: number) => {
    const text = commentInputs[articleId]?.trim();

    if (!text) {
      setCommentComposerStatus({
        type: "error",
        text: "Write a comment before sending.",
      });
      return;
    }

    if (!userId) {
      setCommentComposerStatus({
        type: "error",
        text: "Log in to comment.",
      });
      return;
    }

    if (!username) {
      setCommentComposerStatus({
        type: "error",
        text: "Set a username on your Profile page first.",
      });
      return;
    }

    if (!isCommentAllowed(text)) {
      setCommentComposerStatus({
        type: "error",
        text: "Please edit your comment before posting.",
      });
      return;
    }

    if (replyTarget && replyTarget.articleId === articleId) {
      const parentComment = articles
        .find((article) => article.id === articleId)
        ?.comments.find((comment) => comment.id === replyTarget.commentId);

      if (!parentComment) {
        setCommentComposerStatus({
          type: "error",
          text: "That comment is no longer available.",
        });
        setReplyTarget(null);
        return;
      }

      const { data, error } = await supabase
        .from("comment_replies")
        .insert({
          comment_id: replyTarget.commentId,
          article_id: articleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving reply:", error);
        setCommentComposerStatus({
          type: "error",
          text: error.message ?? "Could not save reply.",
        });
        return;
      }

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                comments: article.comments.map((comment) =>
                  comment.id === replyTarget.commentId
                    ? {
                        ...comment,
                        replies: [
                          ...comment.replies,
                          {
                            id: data.id,
                            comment_id: data.comment_id,
                            article_id: data.article_id,
                            text: data.text,
                            username: data.username,
                            user_id: data.user_id,
                            avatar_url: null,
                            created_at: data.created_at,
                          },
                        ],
                      }
                    : comment
                ),
              }
            : article
        )
      );

      void createNotification({
        recipientUserId: parentComment.user_id,
        type: "comment_reply",
        articleId,
        commentId: replyTarget.commentId,
        replyId: data.id,
      });

      setCommentInputs((prev) => ({
        ...prev,
        [articleId]: "",
      }));
      setReplyTarget(null);
      setCommentComposerStatus(null);
      return;
    }

    const targetArticle = articles.find((article) => article.id === articleId);
    const stableArticleKey = targetArticle ? getStableArticleKey(targetArticle) : `id:${articleId}`;

    const fullCommentPayload = {
      article_id: articleId,
      article_key: stableArticleKey,
      article_title: cleanDisplayText(targetArticle?.title ?? null) || null,
      article_source: targetArticle?.source ?? null,
      article_image: targetArticle ? getBestArticleImage(targetArticle).src : null,
      article_url: targetArticle?.url ?? null,
      text,
      user_id: userId,
      username,
    };

    let insertResponse = await supabase
      .from("comments")
      .insert(fullCommentPayload)
      .select()
      .single();

    if (
      insertResponse.error &&
      (isMissingCommentMetadataColumnError(insertResponse.error.message) ||
        isMissingCommentKeyColumnError(insertResponse.error.message))
    ) {
      console.error(
        "Comment insert failed with article metadata payload, retrying without optional columns:",
        insertResponse.error
      );

      insertResponse = await supabase
        .from("comments")
        .insert({
          article_id: articleId,
          text,
          user_id: userId,
          username,
        })
        .select()
        .single();
    }

    const { data, error } = insertResponse;

    if (error) {
      console.error("Error saving comment:", error);
      setCommentComposerStatus({
        type: "error",
        text: error.message ?? "Could not save comment.",
      });
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: [
                ...article.comments,
                {
                  id: data.id,
                  text: data.text,
                  username: data.username,
                  user_id: data.user_id,
                  avatar_url: null,
                  created_at: data.created_at,
                  likes: 0,
                  dislikes: 0,
                  currentUserReaction: null,
                  replies: [],
                },
              ],
            }
          : article
      )
    );

    setCommentInputs((prev) => ({
      ...prev,
      [articleId]: "",
    }));
    setReplyTarget(null);
    setCommentComposerStatus(null);
  };

  const handleDeleteComment = async (articleId: number, commentId: number) => {
    if (!userId) {
      alert("Log in to manage comments");
      return;
    }

    const targetComment = articles
      .find((article) => article.id === articleId)
      ?.comments.find((comment) => comment.id === commentId);

    if (!targetComment || targetComment.user_id !== userId) {
      alert("You can only delete your own comments");
      return;
    }

    setActiveCommentAction(`delete-${commentId}`);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", userId);

    setActiveCommentAction(null);

    if (error) {
      console.error("Error deleting comment:", error);
      alert("Could not delete comment");
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: article.comments.filter((comment) => comment.id !== commentId),
            }
          : article
      )
    );
  };

  const handleBlockUser = async (blockedUserId: string, blockedUsername?: string | null) => {
    if (!userId) {
      alert("Log in to block users");
      return;
    }

    if (blockedUserId === userId) {
      alert("You cannot block your own account");
      return;
    }

    if (blockedUserIds.includes(blockedUserId)) {
      alert("That user is already blocked");
      return;
    }

    setActiveCommentAction(`block-${blockedUserId}`);

    const { error, alreadyExists } = await createBlockedUser(
      supabase,
      userId,
      blockedUserId,
      blockedUsername ?? null
    );

    setActiveCommentAction(null);

    if (alreadyExists) {
      alert("User already blocked");
      setBlockedUserIds((prev) =>
        prev.includes(blockedUserId) ? prev : [...prev, blockedUserId]
      );
      return;
    }

    if (error) {
      console.error("Error blocking user:", error);
      alert("Could not block that user");
      return;
    }

    setBlockedUserIds((prev) => [...prev, blockedUserId]);
    setArticles((prev) =>
      prev.map((article) => ({
        ...article,
        comments: article.comments
          .filter((comment) => comment.user_id !== blockedUserId)
          .map((comment) => ({
            ...comment,
            replies: comment.replies.filter((reply) => reply.user_id !== blockedUserId),
          })),
      }))
    );
    alert(`Blocked ${blockedUsername ?? "this user"}. Their comments are now hidden.`);
  };

  const handleCommentReaction = async (
    articleId: number,
    commentId: number,
    reactionType: "like" | "dislike"
  ) => {
    if (!userId) {
      alert("Log in to react to comments");
      return;
    }

    const targetComment = articles
      .find((article) => article.id === articleId)
      ?.comments.find((comment) => comment.id === commentId);

    if (!targetComment) {
      return;
    }

    setActiveCommentAction(`reaction-${commentId}`);

    const { data: existingReaction } = await supabase
      .from("comment_reactions")
      .select("id, reaction_type")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingReaction?.reaction_type === reactionType) {
      const { error } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error removing comment reaction:", error);
        return;
      }

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                comments: article.comments.map((comment) =>
                  comment.id === commentId
                    ? {
                        ...comment,
                        likes:
                          reactionType === "like"
                            ? Math.max(0, comment.likes - 1)
                            : comment.likes,
                        dislikes:
                          reactionType === "dislike"
                            ? Math.max(0, comment.dislikes - 1)
                            : comment.dislikes,
                        currentUserReaction: null,
                      }
                    : comment
                ),
              }
            : article
        )
      );
      if (reactionType === "like" && existingReaction.reaction_type !== "like") {
        void createNotification({
          recipientUserId: targetComment.user_id,
          type: "comment_like",
          articleId,
          commentId,
        });
      }
      return;
    }

    if (existingReaction) {
      const { error } = await supabase
        .from("comment_reactions")
        .update({ reaction_type: reactionType })
        .eq("id", existingReaction.id)
        .eq("user_id", userId);

      setActiveCommentAction(null);

      if (error) {
        console.error("Error updating comment reaction:", error);
        return;
      }

      setArticles((prev) =>
        prev.map((article) =>
          article.id === articleId
            ? {
                ...article,
                comments: article.comments.map((comment) =>
                  comment.id === commentId
                    ? {
                        ...comment,
                        likes:
                          reactionType === "like"
                            ? comment.likes + 1
                            : Math.max(0, comment.likes - 1),
                        dislikes:
                          reactionType === "dislike"
                            ? comment.dislikes + 1
                            : Math.max(0, comment.dislikes - 1),
                        currentUserReaction: reactionType,
                      }
                    : comment
                ),
              }
            : article
        )
      );
      return;
    }

    const { error } = await supabase.from("comment_reactions").insert({
      comment_id: commentId,
      user_id: userId,
      reaction_type: reactionType,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error creating comment reaction:", error);
      return;
    }

    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              comments: article.comments.map((comment) =>
                comment.id === commentId
                  ? {
                      ...comment,
                      likes: reactionType === "like" ? comment.likes + 1 : comment.likes,
                      dislikes:
                        reactionType === "dislike"
                          ? comment.dislikes + 1
                          : comment.dislikes,
                      currentUserReaction: reactionType,
                    }
                  : comment
              ),
            }
          : article
      )
    );

    if (reactionType === "like") {
      void createNotification({
        recipientUserId: targetComment.user_id,
        type: "comment_like",
        articleId,
        commentId,
      });
    }
  };

  const openDeleteModal = (articleId: number, commentId: number) => {
    setDeleteTarget({ articleId, commentId });
  };

  const closeDeleteModal = () => {
    if (deleteTarget && activeCommentAction === `delete-${deleteTarget.commentId}`) {
      return;
    }

    setDeleteTarget(null);
  };

  const confirmDeleteComment = async () => {
    if (!deleteTarget) {
      return;
    }

    await handleDeleteComment(deleteTarget.articleId, deleteTarget.commentId);
    setDeleteTarget(null);
  };

  const openReportModal = (commentId: number) => {
    if (!userId) {
      alert("Log in to report comments");
      return;
    }

    setReportingCommentId(commentId);
    setReportReason("");
    setReportStatus(null);
  };

  const closeReportModal = () => {
    if (activeCommentAction?.startsWith("report-")) {
      return;
    }

    setReportingCommentId(null);
    setReportReason("");
    setReportStatus(null);
  };

  const handleSubmitReport = async () => {
    if (!userId || reportingCommentId === null) {
      alert("Log in to report comments");
      return;
    }

    const trimmedReason = reportReason.trim();

    if (!trimmedReason) {
      setReportStatus({
        type: "error",
        text: "Please enter a reason before submitting your report.",
      });
      return;
    }

    setActiveCommentAction(`report-${reportingCommentId}`);
    setReportStatus(null);

    const { error } = await supabase.from("reports").insert({
      comment_id: reportingCommentId,
      user_id: userId,
      reason: trimmedReason,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error reporting comment:", error);
      setReportStatus({
        type: "error",
        text: "Could not submit report. Please try again.",
      });
      return;
    }

    setReportStatus({
      type: "success",
      text: "Report submitted successfully.",
    });
    setReportReason("");
    window.setTimeout(() => {
      setReportingCommentId(null);
      setReportStatus(null);
    }, 1200);
  };

  const aggregatedArticles = useMemo(() => [...articles], [articles]);

  const displayedArticles = useMemo(() => {
    const copied = [...aggregatedArticles];

    if (sortMode === "latest") {
      return rankArticlesWithSourcePreferences(copied, {
        mode: "latest",
      });
    }

    if (sortMode === "trending" || sortMode === "sports") {
      return [...copied].sort((leftArticle, rightArticle) => {
        const scoreDifference =
          getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return (
          getPublishedAtTimestamp(rightArticle.publishedAt) -
          getPublishedAtTimestamp(leftArticle.publishedAt)
        );
      });
    }

    return copied;
  }, [
    aggregatedArticles,
    sortMode,
  ]);

  const activeCommentsArticle =
    activeCommentsArticleId === null
      ? null
      : aggregatedArticles.find((article) => article.id === activeCommentsArticleId) ?? null;

  const displayedBottomSheetComments = useMemo(() => {
    if (!activeCommentsArticle) {
      return [];
    }

    const copied = [...activeCommentsArticle.comments];

    if (commentSortMode === "newest") {
      return copied.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (commentSortMode === "controversial") {
      return copied.sort((a, b) => {
        if (b.dislikes === a.dislikes) {
          return b.likes - a.likes;
        }

        return b.dislikes - a.dislikes;
      });
    }

    return copied.sort((a, b) => {
      const scoreA = a.likes - a.dislikes;
      const scoreB = b.likes - b.dislikes;

      if (scoreB === scoreA) {
        return b.likes - a.likes;
      }

      return scoreB - scoreA;
    });
  }, [activeCommentsArticle, commentSortMode]);

  const openCategorySheet = useCallback(() => {
    setCategoryDraft(normalizeSelectableCategories(categories));
    setCategorySheetStatus(
      userId
        ? null
        : {
            type: "error",
            text: "Log in to customize categories.",
        }
    );
    setIsCategorySheetOpen(true);
  }, [categories, userId]);

  useEffect(() => {
    const handleOpenCategories = () => {
      openCategorySheet();
    };

    window.addEventListener("reflekt:open-categories", handleOpenCategories);

    return () => {
      window.removeEventListener("reflekt:open-categories", handleOpenCategories);
    };
  }, [openCategorySheet]);

  const handleToggleCategoryDraft = (category: string) => {
    const normalizedCategory = normalizeSelectedCategoryName(category);
    if (!CATEGORY_OPTIONS.includes(normalizedCategory as (typeof CATEGORY_OPTIONS)[number])) {
      return;
    }

    setCategoryDraft((prev) =>
      prev.includes(normalizedCategory)
        ? prev.filter((current) => current !== normalizedCategory)
        : [...prev, normalizedCategory]
    );
  };

  const handleSaveCategories = async () => {
    if (!userId) {
      setCategorySheetStatus({
        type: "error",
        text: "Log in to customize categories.",
      });
      return;
    }

    setIsSavingCategories(true);
    setCategorySheetStatus(null);

    const normalizedDraft = normalizeSelectableCategories(categoryDraft);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await saveProfilePatch(
      {
        id: userId,
        email: user?.email ?? null,
      },
      {
        id: userId,
        email: user?.email ?? null,
        username: username ?? null,
        categories: normalizedDraft,
        preferred_sources: preferredSources,
        show_less_sources: showLessSources,
      }
    );

    setIsSavingCategories(false);

    if (error) {
      console.error("Error saving categories:", error);
      setCategorySheetStatus({
        type: "error",
        text: error.message ?? "Could not save categories right now.",
      });
      return;
    }

    setCategories(normalizedDraft);
    setCategorySheetStatus({
      type: "success",
      text: "Categories updated.",
    });
    window.setTimeout(() => {
      setIsCategorySheetOpen(false);
      setCategorySheetStatus(null);
    }, 900);
  };

  const handleQuickToggleCategory = async (category: string) => {
    if (!userId) {
      alert("Log in to add categories.");
      return;
    }

    if (isSavingCategories) {
      return;
    }

    const normalizedCategory = normalizeSelectedCategoryName(category);
    if (!CATEGORY_OPTIONS.includes(normalizedCategory as (typeof CATEGORY_OPTIONS)[number])) {
      return;
    }

    const nextCategories = normalizeSelectableCategories(
      categories.includes(normalizedCategory)
        ? categories.filter((current) => current !== normalizedCategory)
        : [...categories, normalizedCategory]
    );
    const previousCategories = categories;

    setCategories(nextCategories);
    setIsSavingCategories(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await saveProfilePatch(
      {
        id: userId,
        email: user?.email ?? null,
      },
      {
        id: userId,
        email: user?.email ?? null,
        username: username ?? null,
        categories: nextCategories,
        preferred_sources: preferredSources,
        show_less_sources: showLessSources,
      }
    );

    setIsSavingCategories(false);

    if (error) {
      console.error("Error quick-saving categories:", error);
      setCategories(previousCategories);
      alert(error.message ?? "Could not save categories right now.");
      return;
    }
  };

  const balancedLocalArticles = useMemo(() => {
    if (sortMode !== "local") {
      return displayedArticles;
    }

    if (!selectedLocalCity) {
      return [] as Article[];
    }

    const locallyRelevantArticles = [...displayedArticles].filter((article) => {
      return scoreLocalArticle(article, localQuery, localLocationLabel) >= 110;
    });

    return locallyRelevantArticles.sort((leftArticle, rightArticle) => {
      const scoreDifference =
        scoreLocalArticle(rightArticle, localQuery, localLocationLabel) -
        scoreLocalArticle(leftArticle, localQuery, localLocationLabel);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const rightPublishedAt = rightArticle.publishedAt
        ? new Date(rightArticle.publishedAt).getTime()
        : 0;
      const leftPublishedAt = leftArticle.publishedAt
        ? new Date(leftArticle.publishedAt).getTime()
        : 0;

      return rightPublishedAt - leftPublishedAt;
    });
  }, [displayedArticles, localLocationLabel, localQuery, selectedLocalCity, sortMode]);

  const visibleArticles = useMemo(() => {
    const baseArticles = sortMode === "local" ? balancedLocalArticles : displayedArticles;
    return baseArticles;
  }, [balancedLocalArticles, displayedArticles, sortMode]);

  const sportsTabArticles = useMemo(() => {
    const rawSportsArticles =
      sortMode === "sports"
        ? dedupeArticlesByContent([
            ...sportsPreviewArticles.slice(0, 60),
            ...visibleArticles.slice(0, 90),
          ])
        : sortMode === "trending"
          ? sportsPreviewArticles.slice(0, 60)
          : ([] as Article[]);

    if (rawSportsArticles.length === 0) {
      return [] as Article[];
    }

    const filteredSportsArticles = rawSportsArticles.filter(
      (article) =>
        isBroadSportsArticle(article) &&
        !isSportsBettingAd(article) &&
        !isLowInformationLiveStreamArticle(article)
    );

    if (sortMode === "sports") {
      return selectSourceBalancedArticles(filteredSportsArticles, 42);
    }

    if (sortMode === "trending") {
      return selectSourceBalancedArticles(filteredSportsArticles, 25);
    }

    return [] as Article[];
  }, [sortMode, sportsPreviewArticles, visibleArticles]);

  const getSportsArtworkCacheKey = useCallback(
    (article: Pick<Article, "title" | "url" | "source">) => getArticleDeduplicationKey(article as Article),
    []
  );

  useEffect(() => {
    if (sortMode !== "trending" && sortMode !== "sports") {
      return;
    }

    const candidateArticles = dedupeArticlesByContent(sportsTabArticles).filter((article) => {
      if (!isBroadSportsArticle(article) || isSportsBettingAd(article)) {
        return false;
      }

      const selectedImage = getBestArticleImage(article);
      const hasRealImage =
        Boolean(selectedImage.src) &&
        isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src);

      if (hasRealImage) {
        return false;
      }

      const cacheKey = getSportsArtworkCacheKey(article);
      return !(cacheKey in sportsArtworkCache);
    });

    if (candidateArticles.length === 0) {
      return;
    }

    void Promise.allSettled(
      candidateArticles.slice(0, 24).map(async (article) => {
        const cacheKey = getSportsArtworkCacheKey(article);
        const response = await fetch(
          `/api/sports-artwork?q=${encodeURIComponent(
            `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`
          )}`
        );
        const payload = (await response.json()) as {
          imageUrl?: string | null;
          source?: string | null;
        };

        return {
          cacheKey,
          title: cleanDisplayText(article.title),
          imageUrl: payload.imageUrl?.trim() || null,
        };
      })
    ).then((results) => {
      setSportsArtworkCache((prev) => {
        const next = { ...prev };

        results.forEach((result) => {
          if (result.status !== "fulfilled") {
            return;
          }

          next[result.value.cacheKey] = result.value.imageUrl;

          if (result.value.imageUrl) {
            console.log("SPORTSDB IMAGE USED", {
              title: result.value.title,
              imageUrl: result.value.imageUrl,
            });
          }
        });

        return next;
      });
    });
  }, [getSportsArtworkCacheKey, sortMode, sportsArtworkCache, sportsTabArticles]);

  const getSportsCardVisual = useCallback(
    (article: Article, options?: { largeCard?: boolean }) => {
      const displayImage = getArticleDisplayImage(article, { largeCard: options?.largeCard });

      if (!displayImage.src || displayImage.kind !== "real") {
        return null;
      }

      const failureKey = displayImage.failureKey ?? `${article.id}:none`;

      if (failedArticleImages[failureKey]) {
        return null;
      }

      return {
        src: displayImage.src,
        kind: "real" as const,
        failureKey,
      };
    },
    [failedArticleImages]
  );

  const hasRenderableSportsVisual = useCallback(
    (article: Article, options?: { largeCard?: boolean }) =>
      Boolean(getSportsCardVisual(article, options)),
    [getSportsCardVisual]
  );

  const localSportsArticles = useMemo(() => {
    const candidateArticles =
      sortMode === "sports"
        ? dedupeArticlesByContent([
            ...visibleArticles.slice(0, 90),
            ...sportsPreviewArticles.slice(0, 60),
          ])
        : ([] as Article[]);

    if (candidateArticles.length === 0) {
      return [] as Article[];
    }

    return candidateArticles.filter((article) => {
      if (!isBroadSportsArticle(article) || isSportsBettingAd(article)) {
        return false;
      }

      return scoreLocalArticle(article, localQuery, localLocationLabel) >= 110;
    });
  }, [localLocationLabel, localQuery, sortMode, sportsPreviewArticles, visibleArticles]);

  const sportsImageDiagnostics = useMemo(() => {
    const sportsArticles = sportsTabArticles.filter(
      (article) => isBroadSportsArticle(article) && !isSportsBettingAd(article)
    );

    const diagnostics = sportsArticles.map((article) => {
      const selectedImage = getBestArticleImage(article);
      const hasRealImage =
        Boolean(selectedImage.src) &&
        isLikelyHighQualityArticleImage(selectedImage.source, selectedImage.src);
      const visual = getSportsCardVisual(article);
      const hasSourceBadgeFallback = !visual && hasMappedSourceLogo(getSafeSourceLabel(article.source));

      return {
        article,
        imageSource: visual?.kind ?? (hasSourceBadgeFallback ? "source-badge" : "none"),
        hasRealImage,
        hasFallbackImage: Boolean((visual && !hasRealImage) || hasSourceBadgeFallback),
      };
    });

    return {
      diagnostics,
      realImageCount: diagnostics.filter((entry) => entry.hasRealImage).length,
      fallbackImageCount: diagnostics.filter(
        (entry) => !entry.hasRealImage && entry.hasFallbackImage
      ).length,
      noImageCount: diagnostics.filter(
        (entry) => !entry.hasRealImage && !entry.hasFallbackImage
      ).length,
    };
  }, [getSportsCardVisual, sportsTabArticles]);

  useEffect(() => {
    if (sportsImageDiagnostics.diagnostics.length === 0) {
      return;
    }

    console.log("SPORTS IMAGE_ONLY RAW COUNT", sportsImageDiagnostics.diagnostics.length);
    console.log(
      "SPORTS IMAGE_ONLY FINAL COUNT",
      sportsImageDiagnostics.diagnostics.filter(
        (entry) => entry.hasRealImage || entry.hasFallbackImage
      ).length
    );
    console.log("SPORTS REAL IMAGE COUNT", sportsImageDiagnostics.realImageCount);
    console.log("SPORTS FALLBACK IMAGE COUNT", sportsImageDiagnostics.fallbackImageCount);
    console.log("SPORTS CARD REAL IMAGE COUNT", sportsImageDiagnostics.realImageCount);
    console.log("SPORTS CARD FALLBACK IMAGE COUNT", sportsImageDiagnostics.fallbackImageCount);
    console.log("SPORTS NO_IMAGE_COUNT", sportsImageDiagnostics.noImageCount);
  }, [sportsImageDiagnostics]);

  const celebrityTabArticles = useMemo(() => {
    if (sortMode === "celebrity") {
      const sectionFeedArticles = [
        ...entertainmentSectionFeeds.music,
        ...entertainmentSectionFeeds.tvShows,
        ...entertainmentSectionFeeds.gossip,
        ...entertainmentSectionFeeds.celebrity,
        ...entertainmentSectionFeeds.movies,
      ];
      const combinedArticles = dedupeArticlesByContent([
        ...sectionFeedArticles,
        ...entertainmentSectionArticles,
        ...visibleArticles.slice(0, 80),
        ...celebrityPreviewArticles.slice(0, 50),
      ]);
      return selectSourceBalancedArticles(
        combinedArticles.filter((article) => isEntertainmentRelevantArticle(article)),
        60
      );
    }

    if (sortMode === "trending") {
      return selectSourceBalancedArticles(celebrityPreviewArticles.slice(0, 40), 25);
    }

    return [] as Article[];
  }, [celebrityPreviewArticles, entertainmentSectionArticles, entertainmentSectionFeeds, sortMode, visibleArticles]);

  const weatherTabArticles = useMemo(() => {
    if (sortMode !== "weather") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, visibleArticles]);

  const weatherSectionContent = useMemo(() => {
    if (sortMode !== "weather") {
      return {
        severeWeather: [] as Article[],
        localWeather: [] as Article[],
        forecastRadar: [] as Article[],
        climateEnvironment: [] as Article[],
      };
    }

    const cityName =
      selectedLocalCity?.split(",")[0]?.trim().toLowerCase() ||
      localLocationLabel.split(",")[0]?.trim().toLowerCase() ||
      "";
    const usedKeys = new Set<string>();

    const pickSection = (pattern: RegExp, limit: number, options?: { requireCity?: boolean }) => {
      const matchingArticles = weatherTabArticles.filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);

        if (usedKeys.has(dedupeKey)) {
          return false;
        }

        const haystack =
          `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();

        if (!pattern.test(haystack)) {
          return false;
        }

        if (options?.requireCity && cityName) {
          return haystack.includes(cityName);
        }

        return true;
      });

      const selected = selectSourceBalancedArticles(matchingArticles, limit);
      selected.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));
      return selected;
    };

    const severeWeather = pickSection(
      /\b(severe weather|storm|tornado|hurricane|flood|flooding|wildfire|blizzard|heat wave|storm surge|weather alert)\b/i,
      6
    );
    const localWeather = pickSection(
      /\b(local weather|weather news|forecast|rain|snow|storm|temperature|radar)\b/i,
      6,
      { requireCity: true }
    );
    const forecastRadar = pickSection(
      /\b(forecast|radar|outlook|futurecast|conditions|storm tracker|doppler)\b/i,
      6
    );
    const climateEnvironment = pickSection(
      /\b(climate|environment|wildfire smoke|heat advisory|air quality|drought|el niño|la niña)\b/i,
      6
    );

    return {
      severeWeather,
      localWeather,
      forecastRadar,
      climateEnvironment,
    };
  }, [localLocationLabel, selectedLocalCity, sortMode, weatherTabArticles]);

  const sportsVideosForWeatherSection = useMemo(
    () =>
      selectSourceBalancedVideos(
        ensureMinimumVideoCount(
          sportsVideos.filter((video) => isSportsVideo(video) && !video.fallback),
          sportsVideos.filter((video) => isSportsVideo(video) && video.fallback),
          3
        ),
        8,
        2
      ),
    [sportsVideos]
  );

  const technologyTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(technologyPreviewArticles.slice(0, 40), 25);
    }

    if (sortMode !== "technology") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, technologyPreviewArticles, visibleArticles]);

  const businessTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(businessPreviewArticles.slice(0, 40), 25);
    }

    if (sortMode !== "business") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [businessPreviewArticles, sortMode, visibleArticles]);

  const opinionTabArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(opinionPreviewArticles.slice(0, 40), 12).filter(
      (article) => isStrictOpinionArticle(article) && !isLowInformationLiveStreamArticle(article)
    );
  }, [opinionPreviewArticles, sortMode]);

  const crimeTabArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(crimePreviewArticles.slice(0, 40), 12).filter(
      (article) => isStrictCrimeArticle(article) && !isLowInformationLiveStreamArticle(article)
    );
  }, [crimePreviewArticles, sortMode]);

  const artTabArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(artPreviewArticles.slice(0, 40), 12).filter(
      (article) => isStrictArtArticle(article) && !isLowInformationLiveStreamArticle(article)
    );
  }, [artPreviewArticles, sortMode]);

  const travelTabArticles = useMemo(() => {
    if (sortMode !== "travel") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [sortMode, visibleArticles]);

  const foodTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(foodPreviewArticles.slice(0, 40), 25).filter((article) =>
        articleMatchesSelectedCategory(
          {
            ...article,
            comments: article.comments ?? [],
            likeUsers: article.likeUsers ?? [],
            likedByCurrentUser: article.likedByCurrentUser ?? false,
            saved: article.saved ?? false,
            likes: article.likes ?? 0,
          } as Article,
          "Food"
        )
      );
    }

    if (sortMode !== "food") {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(visibleArticles.slice(0, 40), 25);
  }, [foodPreviewArticles, sortMode, visibleArticles]);

  const scienceTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      const combinedScienceArticles = dedupeArticlesByContent([
        ...sciencePreviewArticles.slice(0, 40),
        ...visibleArticles.slice(0, 80),
      ]).filter(
        (article) =>
          isStrictScienceArticle(article) && !isLowInformationLiveStreamArticle(article)
      );
      return selectSourceBalancedArticles(combinedScienceArticles, 25);
    }

    return [] as Article[];
  }, [sciencePreviewArticles, sortMode, visibleArticles]);

  const carsTabArticles = useMemo(() => {
    if (sortMode === "trending") {
      return selectSourceBalancedArticles(
        carsPreviewArticles.filter((article) => isStrictAutoArticle(article)).slice(0, 40),
        25
      );
    }

    return [] as Article[];
  }, [carsPreviewArticles, sortMode]);

  const autoTrendingVideos = useMemo(() => {
    if (sortMode !== "trending" || AUTO_VIDEOS_DISABLED) {
      console.log("AUTO VIDEOS DISABLED");
      return [] as VideoItem[];
    }

    const candidateVideos = selectRecentCategoryVideos(
      dedupeVideosBySourceTitleAndUrl([...videos, ...sportsVideos]).filter((video) =>
        isStrictCategoryMatch(
          "Auto",
          [video.title, video.creator, video.category, video.watchUrl, video.thumbnailUrl],
          "video"
        )
      ),
      3
    ).sort((left, right) => {
      const rightScore = getCategoryMatchScore("Auto", [
        right.title,
        right.creator,
        right.category,
        right.watchUrl,
        right.thumbnailUrl,
      ]);
      const leftScore = getCategoryMatchScore("Auto", [
        left.title,
        left.creator,
        left.category,
        left.watchUrl,
        left.thumbnailUrl,
      ]);

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
    });

    return selectSourceBalancedVideos(candidateVideos, 5, 1);
  }, [sortMode, sportsVideos, videos]);

  const foodSectionArticles = useMemo(() => {
    if (sortMode !== "food") {
      return {
        recipes: [] as Article[],
        latest: [] as Article[],
      };
    }

    const recipeArticles = selectSourceBalancedArticles(
      [...foodTabArticles.filter((article) => isRecipeArticle(article))].sort((left, right) => {
        const sourceDelta =
          getRecipeSourcePriority(right.source) - getRecipeSourcePriority(left.source);

        if (sourceDelta !== 0) {
          return sourceDelta;
        }

        const leftImage = getBestArticleImage(left);
        const rightImage = getBestArticleImage(right);
        const leftHasImage = isLikelyHighQualityArticleImage(leftImage.source, leftImage.src) ? 1 : 0;
        const rightHasImage = isLikelyHighQualityArticleImage(rightImage.source, rightImage.src) ? 1 : 0;

        if (rightHasImage !== leftHasImage) {
          return rightHasImage - leftHasImage;
        }

        return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
      }),
      10
    );
    const recipeKeys = new Set(recipeArticles.map((article) => getArticleDeduplicationKey(article)));
    const latestArticles = selectSourceBalancedArticles(
      foodTabArticles.filter((article) => !recipeKeys.has(getArticleDeduplicationKey(article))),
      18
    );

    return {
      recipes: recipeArticles,
      latest: latestArticles,
    };
  }, [foodTabArticles, sortMode]);

  const foodPageVideos = useMemo(() => {
    if (sortMode !== "food") {
      return [] as VideoItem[];
    }

    const foodVideos = dedupeVideosBySourceTitleAndUrl(
      videos.filter((video) => !isSportsVideo(video) && isRecipeVideo(video))
    ).sort((left, right) => {
      const sourceDelta =
        getRecipeSourcePriority(right.creator) - getRecipeSourcePriority(left.creator);

      if (sourceDelta !== 0) {
        return sourceDelta;
      }

      const leftVertical = left.orientation === "vertical" ? 1 : 0;
      const rightVertical = right.orientation === "vertical" ? 1 : 0;

      if (rightVertical !== leftVertical) {
        return rightVertical - leftVertical;
      }

      return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
    });

    return selectSourceBalancedVideos(foodVideos, 8, 2);
  }, [sortMode, videos]);

  const personalizedMyNewsArticles = useMemo(() => {
    if (categories.length === 0) {
      return [] as Article[];
    }

    return selectSourceBalancedArticles(categorySectionArticles.slice(0, 60), 25);
  }, [categories.length, categorySectionArticles]);

  const normalizedSelectedCategories = useMemo(
    () => categories.map((category) => normalizeSelectedCategoryName(category)),
    [categories]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const versionKey = "graffiti:mynews-category-cache-version";
      const storedVersion = window.localStorage.getItem(versionKey);

      window.localStorage.removeItem("graffiti:mynews:category:MLB");
      window.localStorage.removeItem("graffiti:mynews:category:Baseball");
      window.localStorage.removeItem("graffiti:mynews:category:Major League Baseball");
      window.localStorage.removeItem("graffiti:mynews:videos:MLB");
      window.localStorage.removeItem("graffiti:mynews:videos:Baseball");
      window.localStorage.removeItem("graffiti:mynews:videos:Major League Baseball");
      window.sessionStorage.removeItem("graffiti:mynews:category:MLB");
      window.sessionStorage.removeItem("graffiti:mynews:category:Baseball");
      window.sessionStorage.removeItem("graffiti:mynews:category:Major League Baseball");
      window.sessionStorage.removeItem("graffiti:mynews:videos:MLB");
      window.sessionStorage.removeItem("graffiti:mynews:videos:Baseball");
      window.sessionStorage.removeItem("graffiti:mynews:videos:Major League Baseball");
      console.log("FORCE MLB VIDEO CACHE CLEAR ON APP LOAD");

      if (storedVersion !== MY_NEWS_CATEGORY_CACHE_VERSION) {
        window.localStorage.removeItem("graffiti:last-feed:trending");
        window.localStorage.removeItem("graffiti:last-feed:mynews");
        console.log("FORCE MLB DEDICATED ROUTE ACTIVE");
        window.localStorage.setItem(versionKey, MY_NEWS_CATEGORY_CACHE_VERSION);
      }
    } catch (error) {
      console.error("Error refreshing My News category cache version:", error);
    }
  }, []);

  const myNewsCategorySections = useMemo(() => {
    if (normalizedSelectedCategories.length === 0) {
      return [] as Array<{ category: string; articles: Article[] }>;
    }

    const recommendedArticles = selectSourceBalancedArticles(categorySectionArticles.slice(0, 18), 8);
    const usedKeys = new Set<string>();

    const sections = normalizedSelectedCategories
      .map((category) => {
      const routeUsed = isDedicatedMlbCategory(category)
          ? "dedicated-mlb"
          : category === "NASCAR"
            ? "dedicated-nascar"
            : category === "Weather"
              ? "dedicated-weather"
            : category === "Travel"
              ? "dedicated-travel"
            : category === "NFL"
              ? "dedicated-nfl"
            : category === "NHL"
              ? "dedicated-nhl"
            : category === "MLS"
              ? "dedicated-mls"
            : category === "College Football"
              ? "dedicated-college-football"
            : category === "College Basketball"
              ? "dedicated-college-basketball"
            : category === "Golf"
              ? "dedicated-golf"
            : category === "Science"
              ? "dedicated-science"
            : category === "Sports"
              ? "dedicated-sports"
            : category === "World"
              ? "dedicated-world"
            : category === "Politics"
              ? "dedicated-politics"
            : "generic-category";
        console.log("MY NEWS CATEGORY ROUTE", { category, routeUsed });
        if (isDedicatedMlbCategory(category)) {
          console.log("FORCE MLB DEDICATED ROUTE ACTIVE");
        }
        const supplementalArticles = myNewsCategorySupplementalArticles[category] ?? [];
        const mergedCategoryArticles =
          category === "NASCAR" ||
          category === "Weather" ||
          category === "Travel" ||
          isDedicatedMlbCategory(category) ||
          category === "NFL" ||
          category === "NHL" ||
          category === "MLS" ||
          category === "College Football" ||
          category === "College Basketball" ||
          category === "Golf" ||
          category === "Science" ||
          category === "Sports" ||
          category === "Politics" ||
          category === "World"
            ? [...supplementalArticles]
            : dedupeArticlesByContent([
                ...categorySectionArticles,
                ...supplementalArticles,
              ]);
        const matchingArticles = mergedCategoryArticles.filter((article) => {
          const dedupeKey = getArticleDeduplicationKey(article);
          if (usedKeys.has(dedupeKey)) {
            return false;
          }

          return isDedicatedMlbCategory(category)
            ? isDedicatedMlbArticle(article, "article")
            : category === "NASCAR"
              ? articleMatchesSelectedCategory(article, "NASCAR")
            : category === "Weather"
              ? isStrictWeatherArticle(article)
            : category === "Travel"
              ? isStrictTravelArticle(article)
            : category === "NFL"
              ? isStrictNflArticle(article)
            : category === "NHL"
              ? isStrictNhlArticle(article)
            : category === "MLS"
              ? isStrictMlsArticle(article)
            : category === "College Football"
              ? isStrictCollegeFootballArticle(article)
            : category === "College Basketball"
              ? isStrictCollegeBasketballArticle(article)
            : category === "Golf"
              ? isStrictGolfArticle(article)
            : category === "Science"
              ? isStrictScienceArticle(article)
            : category === "Sports"
              ? isBroadSportsArticle(article) && !isSportsBettingAd(article)
            : category === "Auto"
              ? isStrictAutoArticle(article)
            : category === "Politics"
              ? isStrictPoliticsArticle(article)
            : category === "World"
              ? isStrictWorldArticle(article)
            : articleMatchesSelectedCategory(article, category);
        });

        const rankedArticles = [...matchingArticles].sort((leftArticle, rightArticle) => {
          const leftScore =
            getArticlePriorityScore(leftArticle) +
            (category === "Sports"
              ? (isBroadSportsArticle(leftArticle) && !isSportsBettingAd(leftArticle) ? 6 : 0)
              : category === "Weather"
                ? (isStrictWeatherArticle(leftArticle) ? 6 : 0)
              : category === "Travel"
                ? (isStrictTravelArticle(leftArticle) ? 6 : 0)
              : category === "NFL"
                ? (isStrictNflArticle(leftArticle) ? 6 : 0)
              : category === "NHL"
                ? (isStrictNhlArticle(leftArticle) ? 6 : 0)
              : category === "MLS"
                ? (isStrictMlsArticle(leftArticle) ? 6 : 0)
              : category === "College Football"
                ? (isStrictCollegeFootballArticle(leftArticle) ? 6 : 0)
              : category === "College Basketball"
                ? (isStrictCollegeBasketballArticle(leftArticle) ? 6 : 0)
              : category === "Golf"
                ? (isStrictGolfArticle(leftArticle) ? 6 : 0)
              : category === "Science"
                ? (isStrictScienceArticle(leftArticle) ? 6 : 0)
              : category === "Auto"
              ? (isStrictAutoArticle(leftArticle) ? 6 : 0)
              : category === "Politics"
              ? (isStrictPoliticsArticle(leftArticle) ? 6 : 0)
              : category === "World"
                ? (isStrictWorldArticle(leftArticle) ? 6 : 0)
              : getCategoryMatchScore(category, [
                  leftArticle.title,
                  leftArticle.description,
                  leftArticle.source,
                  leftArticle.category,
                  leftArticle.url,
                  leftArticle.content,
                ])) *
              20;
          const rightScore =
            getArticlePriorityScore(rightArticle) +
            (category === "Sports"
              ? (isBroadSportsArticle(rightArticle) && !isSportsBettingAd(rightArticle) ? 6 : 0)
              : category === "Weather"
                ? (isStrictWeatherArticle(rightArticle) ? 6 : 0)
              : category === "Travel"
                ? (isStrictTravelArticle(rightArticle) ? 6 : 0)
              : category === "NFL"
                ? (isStrictNflArticle(rightArticle) ? 6 : 0)
              : category === "NHL"
                ? (isStrictNhlArticle(rightArticle) ? 6 : 0)
              : category === "MLS"
                ? (isStrictMlsArticle(rightArticle) ? 6 : 0)
              : category === "College Football"
                ? (isStrictCollegeFootballArticle(rightArticle) ? 6 : 0)
              : category === "College Basketball"
                ? (isStrictCollegeBasketballArticle(rightArticle) ? 6 : 0)
              : category === "Golf"
                ? (isStrictGolfArticle(rightArticle) ? 6 : 0)
              : category === "Science"
                ? (isStrictScienceArticle(rightArticle) ? 6 : 0)
              : category === "Auto"
              ? (isStrictAutoArticle(rightArticle) ? 6 : 0)
              : category === "Politics"
              ? (isStrictPoliticsArticle(rightArticle) ? 6 : 0)
              : category === "World"
                ? (isStrictWorldArticle(rightArticle) ? 6 : 0)
              : getCategoryMatchScore(category, [
                  rightArticle.title,
                  rightArticle.description,
                  rightArticle.source,
                  rightArticle.category,
                  rightArticle.url,
                  rightArticle.content,
                ])) *
              20;
          return rightScore - leftScore;
        });

        const selectedArticles = selectSourceBalancedArticles(rankedArticles, 6);
        selectedArticles.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));

        return {
          category,
          articles: selectedArticles,
        };
      })
      .filter((section) => {
        if (section.articles.length > 0) {
          return true;
        }

        return (
          (section.category === "Auto" ||
            section.category === "NHL" ||
            section.category === "MLS" ||
            section.category === "College Football" ||
            section.category === "College Basketball" ||
            section.category === "Golf" ||
            section.category === "Science" ||
            section.category === "Weather" ||
            section.category === "Travel" ||
            section.category === "Sports" ||
            section.category === "Politics" ||
            section.category === "World") &&
          Boolean(
            myNewsCategoryArticleStatus[section.category]?.loading ||
              myNewsCategoryArticleStatus[section.category]?.error
          )
        );
      });

    return [
      ...sections,
      {
        category: "Recommended for You",
        articles: recommendedArticles.filter(
          (article) => !usedKeys.has(getArticleDeduplicationKey(article))
        ),
      },
    ];
  }, [
    categorySectionArticles,
    myNewsCategoryArticleStatus,
    myNewsCategorySupplementalArticles,
    normalizedSelectedCategories,
  ]);

  const myNewsCategorySourceSuggestions = useMemo(() => {
    const suggestions: Record<string, string[]> = {};

    normalizedSelectedCategories.forEach((category) => {
      const normalizedCategory = normalizeSelectedCategoryName(category);
      const taxonomy = CATEGORY_TAXONOMY[normalizedCategory];
      const discoveredSources = Array.from(
        new Set(
          categorySectionArticles
            .filter((article) => articleMatchesSelectedCategory(article, normalizedCategory))
            .map((article) => getSafeSourceLabel(article.source))
            .filter((sourceName) => sourceMatchesSelectedCategory(sourceName, normalizedCategory))
        )
      );

      suggestions[normalizedCategory] = Array.from(
        new Set([...(taxonomy?.suggestedSources ?? []), ...discoveredSources])
      ).slice(0, 5);
    });

    return suggestions;
  }, [categorySectionArticles, normalizedSelectedCategories]);

  useEffect(() => {
    const autoArticlePool = categorySectionArticles.filter((article) =>
      getCategoryMatchScore("Auto", [
        article.title,
        article.description,
        article.source,
        article.category,
        article.url,
        article.content,
      ]) > 0
    );
    const autoAccepted = autoArticlePool
      .filter((article) => isStrictAutoArticle(article))
      .slice(0, 6)
      .map((article) => article.title);
    const autoRejected = autoArticlePool
      .filter((article) => !isStrictAutoArticle(article))
      .slice(0, 6)
      .map((article) => article.title);

    console.log("AUTO ARTICLE RAW COUNT", autoArticlePool.length);
    console.log("AUTO ARTICLE FINAL COUNT", autoAccepted.length);
    console.log("AUTO ARTICLE ACCEPTED", autoAccepted);
    console.log("AUTO ARTICLE REJECTED", autoRejected);

    const nascarArticlePool = categorySectionArticles.filter((article) =>
      getCategoryMatchScore("NASCAR", [
        article.title,
        article.description,
        article.source,
        article.category,
        article.url,
        article.content,
      ]) > 0
    );
    const nascarAccepted = nascarArticlePool
      .filter((article) => articleMatchesSelectedCategory(article, "NASCAR"))
      .slice(0, 8)
      .map((article) => article.title);
    const nascarRejected = nascarArticlePool
      .filter((article) => !articleMatchesSelectedCategory(article, "NASCAR"))
      .slice(0, 8)
      .map((article) => article.title);

    console.log("NASCAR ARTICLE RAW COUNT", nascarArticlePool.length);
    console.log("NASCAR ARTICLE ACCEPTED", nascarAccepted);
    console.log("NASCAR ARTICLE REJECTED", nascarRejected);
  }, [categorySectionArticles]);

  const myNewsTrendingTopicsArticles = useMemo(() => {
    const sectionMap: Record<string, Article[]> = {};

    normalizedSelectedCategories.forEach((category) => {
      const normalizedCategory = normalizeSelectedCategoryName(category);
      const matchingArticles = categorySectionArticles.filter((article) =>
        articleMatchesSelectedCategory(article, normalizedCategory)
      );

      sectionMap[normalizedCategory] = selectSourceBalancedArticles(
        [...matchingArticles].sort(
          (leftArticle, rightArticle) =>
            getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle)
        ),
        3
      );
    });

    return sectionMap;
  }, [categorySectionArticles, normalizedSelectedCategories]);

  const myNewsCategoryLeadArticles = useMemo(() => {
    const leadMap: Record<string, { article: Article | null; imageSrcOverride?: string | null }> = {};

    normalizedSelectedCategories.forEach((category) => {
      const categoryPool =
        category === "NASCAR" ||
        category === "Weather" ||
        category === "Travel" ||
        isDedicatedMlbCategory(category) ||
        category === "NFL" ||
        category === "NHL" ||
        category === "MLS" ||
        category === "College Football" ||
        category === "College Basketball" ||
        category === "Golf" ||
        category === "Science" ||
        category === "Sports" ||
        category === "Politics" ||
        category === "World"
          ? (myNewsCategorySupplementalArticles[category] ?? []).filter((article) =>
              isDedicatedMlbCategory(category)
                ? isDedicatedMlbArticle(article, "lead")
                : category === "NASCAR"
                  ? articleMatchesSelectedCategory(article, "NASCAR")
                : category === "Weather"
                  ? isStrictWeatherArticle(article)
                : category === "Travel"
                  ? isStrictTravelArticle(article)
                : category === "NFL"
                  ? isStrictNflArticle(article)
                : category === "NHL"
                  ? isStrictNhlArticle(article)
                : category === "MLS"
                  ? isStrictMlsArticle(article)
                : category === "College Football"
                  ? isStrictCollegeFootballArticle(article)
                : category === "College Basketball"
                  ? isStrictCollegeBasketballArticle(article)
                : category === "Golf"
                  ? isStrictGolfArticle(article)
                : category === "Science"
                  ? isStrictScienceArticle(article)
                : category === "Sports"
                  ? isBroadSportsArticle(article) && !isSportsBettingAd(article)
                : category === "Business"
                  ? isStrictBusinessArticle(article)
                : category === "Politics"
                  ? isStrictPoliticsArticle(article)
                : category === "World"
                  ? isStrictWorldArticle(article)
                : articleMatchesSelectedCategory(article, category)
            )
          : dedupeArticlesByContent([
              ...categorySectionArticles,
              ...(myNewsCategorySupplementalArticles[category] ?? []),
            ]).filter((article) =>
              category === "Business"
                ? isStrictBusinessArticle(article)
              : category === "Weather"
                ? isStrictWeatherArticle(article)
              : category === "Travel"
                ? isStrictTravelArticle(article)
              : category === "NFL"
                ? isStrictNflArticle(article)
              : category === "NHL"
                ? isStrictNhlArticle(article)
              : category === "MLS"
                ? isStrictMlsArticle(article)
              : category === "College Football"
                ? isStrictCollegeFootballArticle(article)
              : category === "College Basketball"
                ? isStrictCollegeBasketballArticle(article)
              : category === "Golf"
                ? isStrictGolfArticle(article)
              : category === "Science"
                ? isStrictScienceArticle(article)
              : category === "Sports"
                ? isBroadSportsArticle(article) && !isSportsBettingAd(article)
              : category === "Politics"
                ? isStrictPoliticsArticle(article)
              : category === "World"
                ? isStrictWorldArticle(article)
                : articleMatchesSelectedCategory(article, category)
            );
      const visibleSectionArticles =
        myNewsCategorySections.find((section) => section.category === category)?.articles ?? [];

      if (category === "NASCAR") {
        const nascarSelection = getNascarLargeCardSelection(categoryPool);
        leadMap[category] = {
          article: nascarSelection?.article ?? null,
          imageSrcOverride: nascarSelection?.imageSrc ?? null,
        };
        return;
      }

      if (category === "Weather") {
        leadMap[category] = {
          article: getWeatherLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Travel") {
        leadMap[category] = {
          article: getTravelLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (isDedicatedMlbCategory(category)) {
        const mlbSelection = getMlbLargeCardSelection(categoryPool);
        leadMap[category] = {
          article: mlbSelection?.article ?? null,
          imageSrcOverride: mlbSelection?.imageSrc ?? null,
        };
        return;
      }

      if (category === "Tech") {
        leadMap[category] = {
          article: getTechLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Auto") {
        leadMap[category] = {
          article: getAutoLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "NFL") {
        leadMap[category] = {
          article: getNflLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "NHL") {
        leadMap[category] = {
          article: getNhlLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "MLS") {
        leadMap[category] = {
          article: getMlsLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "College Football") {
        leadMap[category] = {
          article: getCollegeFootballLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Sports") {
        leadMap[category] = {
          article: getSportsLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "College Basketball") {
        leadMap[category] = {
          article: getCollegeBasketballLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Golf") {
        leadMap[category] = {
          article: getGolfLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Science") {
        leadMap[category] = {
          article: getScienceLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Business") {
        leadMap[category] = {
          article: getBusinessLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      if (category === "Politics") {
        const politicsSelection = getPoliticsLargeCardSelection(categoryPool);
        leadMap[category] = {
          article: politicsSelection?.article ?? null,
          imageSrcOverride: politicsSelection?.imageSrc ?? null,
        };
        return;
      }

      if (category === "World") {
        leadMap[category] = {
          article: getWorldLargeCardSelection(categoryPool),
          imageSrcOverride: null,
        };
        return;
      }

      leadMap[category] = {
        article: getMyNewsCategoryLeadArticle(category, categoryPool, visibleSectionArticles),
        imageSrcOverride: null,
      };
    });

    return leadMap;
  }, [
    categorySectionArticles,
    myNewsCategorySections,
    myNewsCategorySupplementalArticles,
    normalizedSelectedCategories,
  ]);

  useEffect(() => {
    if (sortMode !== "mynews" || normalizedSelectedCategories.length === 0) {
      setMyNewsCategorySupplementalArticles({});
      setMyNewsCategoryArticleStatus({});
      setMyNewsCategorySupplementalVideos({});
      setMyNewsCategoryVideoStatus({});
      return;
    }

    let isCancelled = false;

    const loadSupplementalCategoryArticles = async () => {
      if (!isCancelled) {
        setMyNewsCategoryArticleStatus((prev) => ({
          ...prev,
          ...Object.fromEntries(
            normalizedSelectedCategories.map((category) => [
              category,
              {
                loading:
                  category === "Auto" ||
                  category === "Business" ||
                  category === "Weather" ||
                  category === "Travel" ||
                  category === "NHL" ||
                  category === "MLS" ||
                  category === "College Football" ||
                  category === "College Basketball" ||
                  category === "Golf" ||
                  category === "Science" ||
                  category === "Sports" ||
                  category === "Politics" ||
                  category === "World",
                error: false,
              },
            ])
          ),
        }));
      }
      if (
        !normalizedSelectedCategories.includes("Auto") &&
        !normalizedSelectedCategories.includes("Business") &&
        !normalizedSelectedCategories.includes("NASCAR") &&
        !normalizedSelectedCategories.includes("Weather") &&
        !normalizedSelectedCategories.includes("Travel") &&
        !normalizedSelectedCategories.includes("MLB") &&
        !normalizedSelectedCategories.includes("NHL") &&
        !normalizedSelectedCategories.includes("MLS") &&
        !normalizedSelectedCategories.includes("College Football") &&
        !normalizedSelectedCategories.includes("College Basketball") &&
        !normalizedSelectedCategories.includes("Golf") &&
        !normalizedSelectedCategories.includes("Science") &&
        !normalizedSelectedCategories.includes("Sports") &&
        !normalizedSelectedCategories.includes("Politics") &&
        !normalizedSelectedCategories.includes("World")
      ) {
        if (!isCancelled) {
          setMyNewsCategorySupplementalArticles({});
        }
        return;
      }

      try {
        if (isCancelled) {
          return;
        }
        const articleTasks: Array<Promise<readonly [string, Article[]]>> = [];

        if (normalizedSelectedCategories.includes("NASCAR")) {
          articleTasks.push(
            getNascarArticles().then((validNascarArticles) => {
              console.log("NASCAR ARTICLE RAW COUNT", validNascarArticles.length);
              console.log("NASCAR ARTICLE VALID COUNT", validNascarArticles.length);
              return ["NASCAR", validNascarArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Weather")) {
          articleTasks.push(
            getWeatherArticles().then((validWeatherArticles) => {
              return ["Weather", validWeatherArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Travel")) {
          articleTasks.push(
            getTravelArticles().then((validTravelArticles) => {
              return ["Travel", validTravelArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("MLB")) {
          articleTasks.push(
            getMlbArticles().then((validMlbArticles) => {
              console.log("FORCE MLB DEDICATED ROUTE ACTIVE");
              console.log("MY NEWS CATEGORY ROUTE", {
                category: "MLB",
                routeUsed: "dedicated-mlb",
              });
              return ["MLB", validMlbArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("NFL")) {
          articleTasks.push(
            getNflArticles().then((validNflArticles) => {
              return ["NFL", validNflArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("NHL")) {
          articleTasks.push(
            getNhlArticles().then((validNhlArticles) => {
              console.log("NHL ARTICLE FINAL COUNT", validNhlArticles.length);
              return ["NHL", validNhlArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("MLS")) {
          articleTasks.push(
            getMlsArticles().then((validMlsArticles) => {
              return ["MLS", validMlsArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("College Football")) {
          articleTasks.push(
            getCollegeFootballArticles().then((validCollegeFootballArticles) => {
              return ["College Football", validCollegeFootballArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("College Basketball")) {
          articleTasks.push(
            getCollegeBasketballArticles().then((validCollegeBasketballArticles) => {
              return ["College Basketball", validCollegeBasketballArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Golf")) {
          articleTasks.push(
            getGolfArticles().then((validGolfArticles) => {
              return ["Golf", validGolfArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Science")) {
          articleTasks.push(
            getScienceArticles().then((validScienceArticles) => {
              return ["Science", validScienceArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Business")) {
          articleTasks.push(
            getBusinessArticles().then((validBusinessArticles) => {
              return ["Business", validBusinessArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Auto")) {
          articleTasks.push(
            getAutoArticles().then((validAutoArticles) => {
              return ["Auto", validAutoArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Sports")) {
          articleTasks.push(
            getSportsMyNewsArticles().then((validSportsArticles) => {
              return ["Sports", validSportsArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("Politics")) {
          articleTasks.push(
            getPoliticsArticles().then((validPoliticsArticles) => {
              return ["Politics", validPoliticsArticles] as const;
            })
          );
        }

        if (normalizedSelectedCategories.includes("World")) {
          articleTasks.push(
            getWorldArticles().then((validWorldArticles) => {
              return ["World", validWorldArticles] as const;
            })
          );
        }

        const articleEntries = (
          await Promise.allSettled(articleTasks)
        ).flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

        setMyNewsCategorySupplementalArticles(Object.fromEntries(articleEntries));
        setMyNewsCategoryArticleStatus((prev) => ({
          ...prev,
          ...Object.fromEntries(
            articleEntries.map(([category]) => [category, { loading: false, error: false }])
          ),
        }));
      } catch (error) {
        console.error("MY NEWS DEDICATED ARTICLE SUPPLEMENT LOAD FAILED", error);

        if (!isCancelled) {
          setMyNewsCategorySupplementalArticles({});
          setMyNewsCategoryArticleStatus((prev) => ({
            ...prev,
            Auto: { loading: false, error: true },
            Politics: { loading: false, error: true },
            Business: { loading: false, error: true },
            Sports: { loading: false, error: true },
            World: { loading: false, error: true },
          }));
        }
      }
    };

    const loadSupplementalCategoryVideos = async () => {
      if (!isCancelled) {
        setMyNewsCategoryVideoStatus((prev) => ({
          ...prev,
          ...Object.fromEntries(
            normalizedSelectedCategories.map((category) => [category, { loading: true, error: false }])
          ),
        }));
      }
      // Articles usually arrive with stronger category/source metadata, but video feeds are noisier.
      // We compensate here with category-specific queries plus stricter title/source/url matching.
      const categoryVideoEntries = await Promise.all(
        normalizedSelectedCategories.map(async (category) => {
          const videoTab = resolveMyNewsCategoryVideoTab(category);
          console.log("VIDEO TAB USED FOR CATEGORY", { category, tab: videoTab });
          console.log("MY NEWS CATEGORY VIDEO SOURCE", {
            category,
            source: `/api/videos?tab=${videoTab}`,
          });

          if (category === "NASCAR") {
            const relevantVideos = await getNascarVideos();
            console.log("NASCAR VIDEO RAW COUNT", relevantVideos.length);
            console.log("NASCAR VIDEO VALID COUNT", relevantVideos.length);
            console.log(
              "NASCAR VIDEO SAMPLE",
              relevantVideos.slice(0, 6).map((video) => ({
                title: video.title,
                creator: video.creator,
                publishedAt: video.publishedAt,
              }))
            );
            return [category, relevantVideos] as const;
          }

          if (category === "MLB") {
            console.log("MLB VIDEOS DISABLED");
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          if (category === "NFL") {
            console.log("NFL VIDEOS DISABLED");
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          if (category === "Politics") {
            console.log("MY NEWS POLITICS FETCH START");
            const fetchStartedAt = Date.now();
            const politicsVideoResponse = await Promise.race([
              fetch(`/api/videos?tab=politics`),
              new Promise<Response | null>((resolve) => {
                window.setTimeout(() => resolve(null), 4500);
              }),
            ]);

            if (!politicsVideoResponse) {
              console.log("POLITICS FETCH TIME MS", Date.now() - fetchStartedAt);
              if (!isCancelled) {
                setMyNewsCategoryVideoStatus((prev) => ({
                  ...prev,
                  [category]: { loading: false, error: true },
                }));
              }
              return [category, [] as VideoItem[]] as const;
            }

            const response = politicsVideoResponse;

            if (!response.ok) {
              console.log("POLITICS FETCH TIME MS", Date.now() - fetchStartedAt);
              if (!isCancelled) {
                setMyNewsCategoryVideoStatus((prev) => ({
                  ...prev,
                  [category]: { loading: false, error: true },
                }));
              }
              return [category, [] as VideoItem[]] as const;
            }

            const data = (await response.json()) as {
              videos?: VideoItem[];
              fetchFailed?: boolean;
            };
            const mergedVideos = dedupeVideosBySourceTitleAndUrl(
              Array.isArray(data.videos) ? data.videos : []
            );
            const relevantVideos = selectRecentCategoryVideos(
              mergedVideos.filter((video) => isStrictPoliticsVideo(video)),
              4
            ).sort(
              (left, right) =>
                getPublishedAtTimestamp(right.publishedAt) -
                getPublishedAtTimestamp(left.publishedAt)
            );

            console.log("POLITICS VIDEO RAW COUNT", mergedVideos.length);
            console.log("POLITICS VIDEO FINAL COUNT", relevantVideos.length);
            console.log("POLITICS MY NEWS VIDEO COUNT", relevantVideos.length);
            console.log("POLITICS VIDEOS READY MS", Date.now() - fetchStartedAt);
            console.log("POLITICS FETCH TIME MS", Date.now() - fetchStartedAt);
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: Boolean(data.fetchFailed) },
              }));
            }
            return [category, relevantVideos] as const;
          }

          if (category === "World") {
            const response = await Promise.race([
              fetch(`/api/videos?tab=world`),
              new Promise<Response | null>((resolve) => {
                window.setTimeout(() => resolve(null), 4500);
              }),
            ]);

            if (!response || !response.ok) {
              if (!isCancelled) {
                setMyNewsCategoryVideoStatus((prev) => ({
                  ...prev,
                  [category]: { loading: false, error: true },
                }));
              }
              return [category, [] as VideoItem[]] as const;
            }

            const data = (await response.json()) as {
              videos?: VideoItem[];
              fetchFailed?: boolean;
            };
            const mergedVideos = dedupeVideosBySourceTitleAndUrl(
              Array.isArray(data.videos) ? data.videos : []
            );
            const relevantVideos = selectRecentCategoryVideos(
              mergedVideos.filter((video) => isStrictWorldVideo(video)),
              4
            ).sort(
              (left, right) =>
                getPublishedAtTimestamp(right.publishedAt) -
                getPublishedAtTimestamp(left.publishedAt)
            );

            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: Boolean(data.fetchFailed) },
              }));
            }

            console.log("MY NEWS WORLD VIDEO COUNT", relevantVideos.length);
            return [category, relevantVideos] as const;
          }

          if (category === "Sports") {
            const response = await fetch(`/api/videos?tab=sports`);

            if (!response.ok) {
              if (!isCancelled) {
                setMyNewsCategoryVideoStatus((prev) => ({
                  ...prev,
                  [category]: { loading: false, error: true },
                }));
              }
              return [category, [] as VideoItem[]] as const;
            }

            const data = (await response.json()) as {
              videos?: VideoItem[];
              fetchFailed?: boolean;
            };
            const mergedVideos = dedupeVideosBySourceTitleAndUrl(
              Array.isArray(data.videos) ? data.videos : []
            );
            const relevantVideos = selectRecentCategoryVideos(
              mergedVideos.filter((video) => isSportsVideo(video)),
              4
            ).sort(
              (left, right) =>
                getPublishedAtTimestamp(right.publishedAt) -
                getPublishedAtTimestamp(left.publishedAt)
            );

            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: Boolean(data.fetchFailed) },
              }));
            }

            console.log("SPORTS MY NEWS VIDEO COUNT", relevantVideos.length);
            return [category, relevantVideos] as const;
          }

          if (category === "Business") {
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          if (category === "Auto") {
            if (AUTO_VIDEOS_DISABLED) {
              console.log("AUTO VIDEOS DISABLED");
            }
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          if (category === "NHL") {
            if (NHL_VIDEOS_DISABLED) {
              console.log("NHL VIDEOS DISABLED");
            }
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          if (category === "MLS") {
            if (MLS_VIDEOS_DISABLED) {
              console.log("MLS VIDEOS DISABLED");
            }
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          if (category === "College Basketball") {
            if (COLLEGE_BASKETBALL_VIDEOS_DISABLED) {
              console.log("COLLEGE_BASKETBALL_VIDEOS_DISABLED");
            }
            if (!isCancelled) {
              setMyNewsCategoryVideoStatus((prev) => ({
                ...prev,
                [category]: { loading: false, error: false },
              }));
            }
            return [category, [] as VideoItem[]] as const;
          }

          const isTechnologyCategory = normalizeSelectedCategoryName(category) === "Tech";

          if (isTechnologyCategory) {
            if (TECH_VIDEOS_DISABLED) {
              return [category, [] as VideoItem[]] as const;
            }
            try {
              console.log("MY NEWS TECH FETCH START");
              console.log("MY NEWS TECH VIDEO FEED USED", "/api/videos?tab=technology");
              const response = await fetch(`/api/videos?tab=technology`);
              console.log("MY NEWS TECH API STATUS", response.status);
              if (!response.ok) {
                return [category, [] as VideoItem[]] as const;
              }

              const data = (await response.json()) as { videos?: VideoItem[] };
              const mergedVideos = dedupeVideosBySourceTitleAndUrl(
                Array.isArray(data.videos) ? data.videos : []
              );
              console.log("MY NEWS TECH RAW COUNT", mergedVideos.length);
              const relevantVideos = selectRecentCategoryVideos(
                mergedVideos.filter((video) => isStrictTechnologyVideo(video)),
                4
              ).sort(
                (left, right) =>
                  getPublishedAtTimestamp(right.publishedAt) -
                  getPublishedAtTimestamp(left.publishedAt)
              );
              const rejectedVideos = mergedVideos.filter((video) => !isStrictTechnologyVideo(video));
              console.log("MY NEWS TECH STRICT COUNT", relevantVideos.length);

              console.log("TECH VIDEO RAW COUNT", mergedVideos.length);
              console.log("TECH VIDEO ACCEPTED", relevantVideos.slice(0, 8).map((video) => video.title));
              console.log("TECH VIDEO REJECTED", rejectedVideos.slice(0, 8).map((video) => video.title));
              console.log("TECH VIDEO FINAL COUNT", relevantVideos.length);
              console.log("MY NEWS TECH VIDEO COUNT", relevantVideos.length);
              console.log("MY NEWS TECH VIDEO TITLES", relevantVideos.map((video) => video.title));
              console.log("MY NEWS TECH SET STATE COUNT", relevantVideos.length);

              return [category, relevantVideos] as const;
            } catch (error) {
              console.error("Failed to load Technology videos from shared tab feed", error);
              return [category, [] as VideoItem[]] as const;
            }
          }

          const isCelebrityCategory = normalizeSelectedCategoryName(category) === "Celebrity";

          if (isCelebrityCategory) {
            if (CELEBRITY_VIDEOS_DISABLED) {
              return [category, [] as VideoItem[]] as const;
            }
            try {
              const response = await fetch(`/api/videos?tab=celebrity`);
              if (!response.ok) {
                return [category, [] as VideoItem[]] as const;
              }

              const data = (await response.json()) as { videos?: VideoItem[]; fetchFailed?: boolean };
              const mergedVideos = dedupeVideosBySourceTitleAndUrl(
                Array.isArray(data.videos) ? data.videos : []
              );
              const relevantVideos = selectRecentCategoryVideos(mergedVideos, 4).sort(
                (left, right) =>
                  getPublishedAtTimestamp(right.publishedAt) -
                  getPublishedAtTimestamp(left.publishedAt)
              );

              if (!isCancelled) {
                setMyNewsCategoryVideoStatus((prev) => ({
                  ...prev,
                  [category]: { loading: false, error: Boolean(data.fetchFailed) },
                }));
              }

              return [category, relevantVideos] as const;
            } catch (error) {
              console.error("Failed to load Celebrity videos from shared tab feed", error);
              return [category, [] as VideoItem[]] as const;
            }
          }

          const queries = getMyNewsCategoryVideoQueries(category);

          const queryResults = await Promise.all(
            queries.map(async (query) => {
              console.log("CATEGORY VIDEO QUERY", category, query);
              try {
                const response = await fetch(
                  `/api/videos?tab=${encodeURIComponent(videoTab)}&q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`
                );
                if (!response.ok) {
                  return [] as VideoItem[];
                }

                const data = (await response.json()) as { videos?: VideoItem[] };
                return Array.isArray(data.videos) ? data.videos : [];
              } catch (error) {
                console.error(`Failed to load ${category} videos for query "${query}"`, error);
                return [] as VideoItem[];
              }
            })
          );

          const mergedVideos = dedupeVideosBySourceTitleAndUrl(queryResults.flat());
          const categoryVideoMatcher = (video: VideoItem) =>
            videoMatchesSelectedCategory(video, category);
          const rejectedVideos = mergedVideos.filter((video) => !categoryVideoMatcher(video));
          const relevantVideos = selectRecentCategoryVideos(
            mergedVideos.filter((video) => categoryVideoMatcher(video)),
            4
          ).sort(
            (left, right) => getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt)
          );
          console.log(
            "CATEGORY VIDEO RAW COUNT",
            category,
            mergedVideos.length
          );
          console.log(
            "CATEGORY VIDEO REJECTED COUNT",
            category,
            rejectedVideos.length
          );
          console.log(
            "CATEGORY VIDEO FINAL COUNT",
            category,
            relevantVideos.length
          );
          console.log(
            "CATEGORY VIDEO ACCEPTED",
            category,
            relevantVideos.slice(0, 4).map((video) => video.title)
          );
          console.log(
            "CATEGORY VIDEO REJECTED",
            category,
            rejectedVideos.slice(0, 4).map((video) => video.title)
          );
          if (category === "Auto") {
            console.log("AUTO VIDEO ACCEPTED", relevantVideos.slice(0, 5).map((video) => video.title));
            console.log("AUTO VIDEO REJECTED", rejectedVideos.slice(0, 5).map((video) => video.title));
          }
          if (category === "NHL") {
            console.log("NHL VIDEO ACCEPTED", relevantVideos.slice(0, 5).map((video) => video.title));
            console.log("NHL VIDEO REJECTED", rejectedVideos.slice(0, 5).map((video) => video.title));
          }

          return [category, relevantVideos] as const;
        })
      );

      if (isCancelled) {
        return;
      }

      setMyNewsCategorySupplementalVideos(Object.fromEntries(categoryVideoEntries));
      setMyNewsCategoryVideoStatus((prev) => ({
        ...prev,
        ...Object.fromEntries(
          categoryVideoEntries.map(([category]) => [
            category,
            prev[category]?.error ? prev[category] : { loading: false, error: false },
          ])
        ),
      }));
    };

    void loadSupplementalCategoryArticles();
    void loadSupplementalCategoryVideos();

    return () => {
      isCancelled = true;
    };
  }, [normalizedSelectedCategories, sortMode]);

  const myNewsCategoryVideoSections = useMemo(() => {
    if (normalizedSelectedCategories.length === 0) {
      return {} as Record<string, VideoItem[]>;
    }

    const candidateVideos = dedupeVideosBySourceTitleAndUrl([
      ...sportsVideos,
      ...celebrityVideos,
      ...weatherVideos,
      ...videos,
    ]);
    const usedVideoIds = new Set<string>();
    const sectionVideos: Record<string, VideoItem[]> = {};

    normalizedSelectedCategories.forEach((category) => {
      const supplementalVideos = myNewsCategorySupplementalVideos[category] ?? [];
      const mergedCategoryVideos =
        category === "NASCAR" ||
        isDedicatedMlbCategory(category) ||
        category === "Sports" ||
        category === "Politics" ||
        category === "World"
          ? [...supplementalVideos]
          : dedupeVideosBySourceTitleAndUrl([
              ...candidateVideos,
              ...supplementalVideos,
            ]);

      const matchingVideos = selectRecentCategoryVideos(
        mergedCategoryVideos.filter((video) => {
          if (usedVideoIds.has(video.id)) {
            return false;
          }

          return isDedicatedMlbCategory(category)
            ? isDedicatedMlbVideo(video)
            : category === "Sports"
              ? isSportsVideo(video)
            : category === "Politics"
              ? isStrictPoliticsVideo(video)
            : category === "World"
              ? isStrictWorldVideo(video)
            : videoMatchesSelectedCategory(video, category);
        }),
        4
      );

      const selectedVideos = selectSourceBalancedVideos(
        matchingVideos.sort((left, right) => {
          if (category === "Politics") {
            const preferredSourcePattern =
              /\b(pbs newshour|cnn|fox news|nbc news|abc news|cbs news|reuters|associated press|ap|politico)\b/i;
            const localCharlottePattern = /\b(wcnc charlotte|queen city news|charlotte)\b/i;
            const leftSource = `${left.creator} ${left.title}`;
            const rightSource = `${right.creator} ${right.title}`;
            const leftPreferred = preferredSourcePattern.test(leftSource) ? 1 : 0;
            const rightPreferred = preferredSourcePattern.test(rightSource) ? 1 : 0;

            if (rightPreferred !== leftPreferred) {
              return rightPreferred - leftPreferred;
            }

            const leftLocalCharlotte = localCharlottePattern.test(leftSource) ? 1 : 0;
            const rightLocalCharlotte = localCharlottePattern.test(rightSource) ? 1 : 0;

            if (leftLocalCharlotte !== rightLocalCharlotte) {
              return leftLocalCharlotte - rightLocalCharlotte;
            }
          }

          if (category === "World") {
            const preferredSourcePattern =
              /\b(bbc|reuters|associated press|ap|al jazeera|dw news|france 24|sky news|cnn international|united nations)\b/i;
            const leftPreferred = preferredSourcePattern.test(`${left.creator} ${left.title}`) ? 1 : 0;
            const rightPreferred = preferredSourcePattern.test(`${right.creator} ${right.title}`) ? 1 : 0;

            if (rightPreferred !== leftPreferred) {
              return rightPreferred - leftPreferred;
            }
          }

          const leftCategoryScore = getCategoryMatchScore(category, [
            left.title,
            left.creator,
            left.category,
            left.watchUrl,
            left.thumbnailUrl,
          ]);
          const rightCategoryScore = getCategoryMatchScore(category, [
            right.title,
            right.creator,
            right.category,
            right.watchUrl,
            right.thumbnailUrl,
          ]);

          if (rightCategoryScore !== leftCategoryScore) {
            return rightCategoryScore - leftCategoryScore;
          }

          const leftVerticalBoost = left.orientation === "vertical" ? 1 : 0;
          const rightVerticalBoost = right.orientation === "vertical" ? 1 : 0;

          if (rightVerticalBoost !== leftVerticalBoost) {
            return rightVerticalBoost - leftVerticalBoost;
          }

          return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
        }),
        5,
        1
      );

      if (isDedicatedMlbCategory(category)) {
        console.log("MLB VIDEOS RENDERED COUNT", selectedVideos.length);
      }

      if (category === "Politics") {
        console.log("POLITICS MY NEWS VIDEO COUNT", selectedVideos.length);
        console.log(
          "POLITICS VIDEO SOURCE BALANCE",
          selectedVideos.map((video) => video.creator)
        );
      }

      if (category === "World") {
        console.log("MY NEWS WORLD VIDEO COUNT", selectedVideos.length);
      }

      if (category === "Sports") {
        console.log("SPORTS MY NEWS VIDEO COUNT", selectedVideos.length);
      }

      selectedVideos.forEach((video) => usedVideoIds.add(video.id));
      sectionVideos[category] = selectedVideos;
    });

    return sectionVideos;
  }, [
    celebrityVideos,
    myNewsCategorySupplementalVideos,
    normalizedSelectedCategories,
    sportsVideos,
    videos,
    weatherVideos,
  ]);

  useEffect(() => {
    myNewsCategorySections
      .filter((section) => section.category !== "Recommended for You")
      .forEach((section) => {
        const leadSelection = myNewsCategoryLeadArticles[section.category] ?? {
          article: null,
          imageSrcOverride: null,
        };
        const leadArticle = leadSelection.article;
        console.log("CATEGORY NAME", section.category);
        console.log(
          "CATEGORY LARGE CARD CANDIDATE",
          section.category,
          section.articles
            .map((article) => ({
              title: article.title,
              score: getCategoryMatchScore(section.category, [
                article.title,
                article.description,
                article.source,
                article.category,
                article.url,
                article.content,
              ]),
            }))
            .slice(0, 5)
        );
        if (section.category === "NASCAR") {
          console.log(
            "NASCAR LARGE IMAGE CANDIDATES",
            section.articles
              .map((article) => ({
                title: article.title,
                hasImage: hasRealLargeImageCandidate(article),
                score: getCategoryMatchScore("NASCAR", [
                  article.title,
                  article.description,
                  article.source,
                  article.category,
                  article.url,
                  article.content,
                ]),
              }))
              .slice(0, 10)
          );
        }
        if (leadArticle) {
          console.log(
            "CATEGORY LARGE CARD ACCEPTED",
            section.category,
            leadArticle.title,
            getLargeImageCardImage(leadArticle)
          );
          if (section.category === "NASCAR") {
            console.log("NASCAR LARGE IMAGE SELECTED", leadArticle.title);
            console.log(
              "NASCAR RANKED COUNT",
              section.articles.filter(
                (article) =>
                  getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
              ).slice(0, 5).length
            );
          }
          if (section.category === "MLB") {
            console.log("MLB LARGE IMAGE SELECTED", leadArticle.title);
            console.log(
              "MLB RANKED COUNT",
              section.articles.filter(
                (article) =>
                  getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
              ).slice(0, 5).length
            );
          }
          if (section.category === "NHL") {
            console.log("NHL LARGE IMAGE ACCEPTED", leadArticle.title);
            console.log("NHL LARGE IMAGE FINAL", leadArticle.title);
          }
        } else {
          console.log(
            "CATEGORY LARGE CARD REJECTED",
            section.category,
            section.articles.map((article) => article.title).slice(0, 5)
          );
          if (section.category === "NHL") {
            console.log("NHL LARGE IMAGE REJECTED", section.articles.map((article) => article.title).slice(0, 5));
            console.log("NHL LARGE IMAGE FINAL", null);
          }
          if (section.category === "NASCAR") {
            console.log("NASCAR LARGE IMAGE SELECTED", null);
            console.log("NASCAR RANKED COUNT", section.articles.slice(0, 5).length);
          }
          if (section.category === "MLB") {
            console.log("MLB LARGE IMAGE SELECTED", null);
            console.log("MLB RANKED COUNT", section.articles.slice(0, 5).length);
          }
        }
      });
  }, [myNewsCategoryLeadArticles, myNewsCategorySections]);

  useEffect(() => {
    normalizedSelectedCategories.forEach((category) => {
      console.log("BECAUSE YOU FOLLOW CATEGORY", category);
      console.log("BECAUSE YOU FOLLOW SUGGESTIONS", category, myNewsCategorySourceSuggestions[category] ?? []);
      console.log(
        "TRENDING TOPICS ARTICLE COUNT",
        category,
        myNewsTrendingTopicsArticles[category]?.length ?? 0
      );
    });
  }, [myNewsCategorySourceSuggestions, myNewsTrendingTopicsArticles, normalizedSelectedCategories]);

  useEffect(() => {
    console.log("SELECTED CATEGORIES", normalizedSelectedCategories);
    console.log("CELEBRITY SELECTED", normalizedSelectedCategories.includes("Celebrity"));
    console.log(
      "CELEBRITY SECTION COUNT",
      myNewsCategorySections.find((section) => section.category === "Celebrity")?.articles.length ?? 0
    );
  }, [myNewsCategorySections, normalizedSelectedCategories]);

  useEffect(() => {
    if (sortMode === "sports") {
      console.log("SPORTS ARTICLE COUNT", sportsTabArticles.length);
      console.log("SPORTS PAGE ARTICLE COUNT", sportsTabArticles.length);
      console.log("SPORTS PAGE LOCAL COUNT", localSportsArticles.length);
      console.log("SPORTS PAGE BROAD COUNT", sportsTabArticles.length);
    }
  }, [localSportsArticles.length, sortMode, sportsTabArticles.length]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMlbSectionSupplements() {
      if (sortMode !== "sports") {
        if (!isCancelled) {
          setMlbSectionArticles([]);
          setMlbSectionVideos([]);
          setNhlSectionArticles([]);
          setNhlSectionVideos([]);
          setMlsSectionArticles([]);
          setNbaSectionArticles([]);
          setNbaSectionVideos([]);
          setNflSectionArticles([]);
          setNflSectionVideos([]);
          setFightingSectionArticles([]);
        }
        return;
      }

      try {
        const [
          mlbArticleResponses,
          mlbVideoResponses,
          nhlArticleResponses,
          nhlVideoResponses,
          mlsArticleResponses,
          nbaArticleResponses,
          nbaVideoResponses,
          nflArticleResponses,
          nflVideoResponses,
          fightingArticleResponses,
        ] = await Promise.all([
          Promise.allSettled(
            MLB_SECTION_ARTICLE_QUERIES.map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`MLB article request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          ),
          Promise.allSettled(
            MLB_SECTION_VIDEO_QUERIES.map(async (query) => {
              const response = await apiFetch(`/api/videos?tab=sports&q=${encodeURIComponent(query)}`);

              if (!response.ok) {
                throw new Error(`MLB video request failed (${response.status})`);
              }

              const payload = (await response.json()) as { videos?: VideoApiItem[] };
              return normalizeVideoFeedItems(payload.videos ?? []);
            })
          ),
          Promise.allSettled(
            NHL_SECTION_ARTICLE_QUERIES.map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`NHL article request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          ),
          Promise.allSettled(
            NHL_SECTION_VIDEO_QUERIES.map(async (query) => {
              const response = await apiFetch(`/api/videos?tab=sports&q=${encodeURIComponent(query)}`);

              if (!response.ok) {
                throw new Error(`NHL video request failed (${response.status})`);
              }

              const payload = (await response.json()) as { videos?: VideoApiItem[] };
              return normalizeVideoFeedItems(payload.videos ?? []);
            })
          ),
          Promise.allSettled(
            MLS_SECTION_ARTICLE_QUERIES.map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`MLS article request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          ),
          Promise.allSettled(
            NBA_SECTION_ARTICLE_QUERIES.map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`NBA article request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          ),
          Promise.allSettled(
            NBA_SECTION_VIDEO_QUERIES.map(async (query) => {
              const response = await apiFetch(`/api/videos?tab=sports&q=${encodeURIComponent(query)}`);

              if (!response.ok) {
                throw new Error(`NBA video request failed (${response.status})`);
              }

              const payload = (await response.json()) as { videos?: VideoApiItem[] };
              return normalizeVideoFeedItems(payload.videos ?? []);
            })
          ),
          Promise.allSettled(
            NFL_SECTION_ARTICLE_QUERIES.map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`NFL article request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          ),
          Promise.allSettled(
            NFL_SECTION_VIDEO_QUERIES.map(async (query) => {
              const response = await apiFetch(`/api/videos?tab=sports&q=${encodeURIComponent(query)}`);

              if (!response.ok) {
                throw new Error(`NFL video request failed (${response.status})`);
              }

              const payload = (await response.json()) as { videos?: VideoApiItem[] };
              return normalizeVideoFeedItems(payload.videos ?? []);
            })
          ),
          Promise.allSettled(
            FIGHTING_SECTION_ARTICLE_QUERIES.map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`Fighting article request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          ),
        ]);

        if (isCancelled) {
          return;
        }

        const mergedArticles = mlbArticleResponses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("MLB article fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        const filteredMlbArticles = selectSourceBalancedArticles(
          mergedArticles.filter(
            (article) =>
              matchesSportsSectionArticle(article, SPORTS_SECTION_CONFIGS.find((section) => section.key === "MLB")!) &&
              !isSportsBettingAd(article)
          ),
          14
        );

        const mergedVideos = mlbVideoResponses.reduce<VideoItem[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("MLB video fetch failed:", result.reason);
            return accumulator;
          }

          return dedupeVideosBySourceTitleAndUrl([...accumulator, ...result.value]);
        }, []);
        console.log("MLB VIDEO RAW COUNT", mergedVideos.length);

        const strictMlbVideos = mergedVideos.filter((video) => isStrictMlbVideo(video));
        const rejectedMlbVideos = mergedVideos.filter((video) => !isStrictMlbVideo(video));
        console.log("MLB VIDEO FILTERED COUNT", strictMlbVideos.length);
        const filteredMlbVideos = selectSourceBalancedVideos(strictMlbVideos, 10);
        rejectedMlbVideos.forEach((video) => {
          const reason = getStrictMlbVideoRejectionReason(video);
          console.log("MLB VIDEO REJECTED", {
            title: video.title,
            creator: video.creator,
            reason,
          });
        });
        console.log(
          "MLB PLAYABLE COUNT",
          filteredMlbVideos.filter((video) => !video.fallback && Boolean(video.youtubeId)).length
        );
        console.log(
          "MLB THUMBNAIL FALLBACK COUNT",
          filteredMlbVideos.filter((video) => video.fallback).length
        );
        console.log("MLB VIDEO FINAL COUNT", filteredMlbVideos.length);
        console.log(
          "MLB VIDEO SAMPLE",
          filteredMlbVideos.slice(0, 5).map((video) => ({
            id: video.id,
            title: video.title,
            creator: video.creator,
            fallback: video.fallback,
          }))
        );

        setMlbSectionArticles(filteredMlbArticles);
        setMlbSectionVideos(filteredMlbVideos);

        const mergedNhlArticles = nhlArticleResponses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("NHL article fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        const filteredNhlArticles = selectSourceBalancedArticles(
          mergedNhlArticles.filter(
            (article) =>
              matchesSportsSectionArticle(article, SPORTS_SECTION_CONFIGS.find((section) => section.key === "NHL")!) &&
              !isSportsBettingAd(article)
          ),
          14
        );

        const mergedNhlVideos = nhlVideoResponses.reduce<VideoItem[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("NHL video fetch failed:", result.reason);
            return accumulator;
          }

          return dedupeVideosBySourceTitleAndUrl([...accumulator, ...result.value]);
        }, []);
        console.log("NHL VIDEO RAW COUNT", mergedNhlVideos.length);

        const strictNhlVideos = mergedNhlVideos.filter((video) => isStrictNhlVideo(video));
        console.log("NHL VIDEO FILTERED COUNT", strictNhlVideos.length);
        const finalNhlVideos =
          strictNhlVideos.length > 0 ? selectSourceBalancedVideos(strictNhlVideos, 10) : [];
        console.log("NHL VIDEO FINAL COUNT", finalNhlVideos.length);

        setNhlSectionArticles(filteredNhlArticles);
        setNhlSectionVideos(finalNhlVideos);

        console.log(
          "NHL VIDEO REJECTED SAMPLE",
          mergedNhlVideos
            .filter((video) => !isStrictNhlVideo(video))
            .slice(0, 5)
            .map((video) => ({
              id: video.id,
              title: video.title,
              creator: video.creator,
            }))
        );

        const mergedMlsArticles = mlsArticleResponses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("MLS article fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        console.log("MLS ARTICLES RAW COUNT", mergedMlsArticles.length);
        const filteredMlsArticles = selectSourceBalancedArticles(
          mergedMlsArticles.filter(
            (article) =>
              matchesSportsSectionArticle(article, SPORTS_SECTION_CONFIGS.find((section) => section.key === "MLS")!) &&
              !isSportsBettingAd(article)
          ),
          14
        );
        console.log("MLS ARTICLES FINAL COUNT", filteredMlsArticles.length);
        console.log(
          "MLS ARTICLE SAMPLE",
          filteredMlsArticles.slice(0, 5).map((article) => ({
            title: article.title,
            source: article.source,
            category: article.category,
          }))
        );
        setMlsSectionArticles(filteredMlsArticles);

        const mergedNbaArticles = nbaArticleResponses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("NBA article fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        const filteredNbaArticles = selectSourceBalancedArticles(
          mergedNbaArticles.filter(
            (article) =>
              matchesSportsSectionArticle(article, SPORTS_SECTION_CONFIGS.find((section) => section.key === "NBA")!) &&
              !isSportsBettingAd(article)
          ),
          14
        );
        setNbaSectionArticles(filteredNbaArticles);

        const mergedNbaVideos = nbaVideoResponses.reduce<VideoItem[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("NBA video fetch failed:", result.reason);
            return accumulator;
          }

          return dedupeVideosBySourceTitleAndUrl([...accumulator, ...result.value]);
        }, []);
        const strictNbaVideos = mergedNbaVideos.filter((video) => isStrictNbaVideo(video));
        console.log(
          "NBA VIDEO REJECTED SAMPLE",
          mergedNbaVideos
            .filter((video) => !isStrictNbaVideo(video))
            .slice(0, 5)
            .map((video) => ({
              id: video.id,
              title: video.title,
              creator: video.creator,
            }))
        );
        console.log("NBA VIDEO FINAL COUNT", strictNbaVideos.length);
        setNbaSectionVideos(
          strictNbaVideos.length > 0 ? selectSourceBalancedVideos(strictNbaVideos, 10) : []
        );

        const mergedNflArticles = nflArticleResponses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("NFL article fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        const filteredNflArticles = selectSourceBalancedArticles(
          mergedNflArticles.filter(
            (article) =>
              matchesSportsSectionArticle(article, SPORTS_SECTION_CONFIGS.find((section) => section.key === "NFL")!) &&
              !isSportsBettingAd(article)
          ),
          14
        );

        const mergedNflVideos = nflVideoResponses.reduce<VideoItem[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("NFL video fetch failed:", result.reason);
            return accumulator;
          }

          return dedupeVideosBySourceTitleAndUrl([...accumulator, ...result.value]);
        }, []);
        const strictNflVideos = mergedNflVideos.filter((video) => isStrictNflVideo(video));
        const finalNflVideos =
          strictNflVideos.length > 0
            ? selectSourceBalancedVideos(strictNflVideos, 10)
            : buildNflFallbackVideos();

        setNflSectionArticles(filteredNflArticles);
        setNflSectionVideos(finalNflVideos);

        const mergedFightingArticles = fightingArticleResponses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("Fighting article fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        const filteredFightingArticles = selectSourceBalancedArticles(
          mergedFightingArticles.filter(
            (article) =>
              matchesSportsSectionArticle(article, SPORTS_SECTION_CONFIGS.find((section) => section.key === "MMA")!) &&
              !isSportsBettingAd(article)
          ),
          14
        );
        setFightingSectionArticles(filteredFightingArticles);
      } catch (error) {
        console.error("Error loading MLB section supplements:", error);
        if (!isCancelled) {
          setMlbSectionArticles([]);
          setMlbSectionVideos([]);
          setNhlSectionArticles([]);
          setNhlSectionVideos([]);
          setMlsSectionArticles([]);
          setNbaSectionArticles([]);
          setNbaSectionVideos([]);
          setNflSectionArticles([]);
          setNflSectionVideos([]);
          setFightingSectionArticles([]);
        }
      }
    }

    void loadMlbSectionSupplements();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  useEffect(() => {
    if (sortMode === "local") {
      console.log("LOCAL SELECTED CITY", selectedLocalCity ?? localLocationLabel);
      console.log(
        "LOCAL RESULTS CITY",
        selectedLocalCityKey,
        visibleArticles.map((article) => ({
          title: article.title,
          source: article.source,
        }))
      );
      console.log("LOCAL ARTICLES COUNT", visibleArticles.length);
    }
  }, [localLocationLabel, selectedLocalCity, selectedLocalCityKey, sortMode, visibleArticles]);

  useEffect(() => {
    let isCancelled = false;

    async function loadTeamSpecificNews() {
      if (favoriteTeams.length === 0) {
        if (!isCancelled) {
          setTeamSpecificNewsArticles([]);
        }
        return;
      }

      try {
        const responses = await Promise.allSettled(
          favoriteTeams.flatMap((team) =>
            buildFavoriteTeamNewsQueries(team).map(async (query) => {
              const response = await apiFetch(
                `/api/news?mode=sports&query=${encodeURIComponent(query)}&page=1&pageSize=6`
              );

              if (!response.ok) {
                throw new Error(`Favorite team news request failed (${response.status})`);
              }

              return hydrateFeedArticles(
                normalizeNewsPayload(
                  (await response.json()) as FeedArticlePayload[] | PaginatedNewsResponse
                ).articles
              );
            })
          )
        );

        if (isCancelled) {
          return;
        }

        const mergedArticles = responses.reduce<Article[]>((accumulator, result) => {
          if (result.status !== "fulfilled") {
            console.error("Favorite team news fetch failed:", result.reason);
            return accumulator;
          }

          return mergeArticlesByIdentity(accumulator, result.value);
        }, []);

        setTeamSpecificNewsArticles(mergedArticles);
      } catch (error) {
        console.error("Error loading favorite team news:", error);
        if (!isCancelled) {
          setTeamSpecificNewsArticles([]);
        }
      }
    }

    void loadTeamSpecificNews();

    return () => {
      isCancelled = true;
    };
  }, [favoriteTeams]);

  useEffect(() => {
    topTabsRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (sortMode === "trending") {
      topTabsRef.current?.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [sortMode]);

  useEffect(() => {
    if (!SWIPEABLE_SORT_MODES.includes(sortMode as SwipeableSortMode)) {
      return;
    }

    const activeButton = topTabButtonRefs.current[sortMode as SwipeableSortMode];
    activeButton?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [sortMode]);

  const localCitySuggestions = useMemo(() => {
    if (sortMode !== "local" && sortMode !== "trending") {
      return [] as string[];
    }

    const normalizedDraft = cleanDisplayText(localQueryDraft).trim().toLowerCase();

    if (normalizedDraft.length === 0) {
      return cityOptions.map((city) => city.displayName);
    }

    const startsWithMatches = cityOptions
      .map((city) => city.displayName)
      .filter((city) => city.toLowerCase().startsWith(normalizedDraft));

    const includesMatches = cityOptions
      .map((city) => city.displayName)
      .filter(
        (city) =>
          !startsWithMatches.includes(city) && city.toLowerCase().includes(normalizedDraft)
      );

    return [...startsWithMatches, ...includesMatches];
  }, [cityOptions, localQueryDraft, sortMode]);

  const weatherCitySuggestions = useMemo(() => {
    const suggestionPool = Array.from(
      new Set([
        ...MAJOR_WEATHER_CITY_SUGGESTIONS,
        ...cityOptions.map((city) => city.displayName),
      ])
    );
    const normalizedDraft = cleanDisplayText(weatherSearchDraft).trim().toLowerCase();

    if (normalizedDraft.length === 0) {
      return suggestionPool.slice(0, 8);
    }

    const startsWithMatches = suggestionPool.filter((city) =>
      city.toLowerCase().startsWith(normalizedDraft)
    );
    const includesMatches = suggestionPool.filter(
      (city) =>
        !startsWithMatches.includes(city) && city.toLowerCase().includes(normalizedDraft)
    );

    return [...startsWithMatches, ...includesMatches].slice(0, 8);
  }, [cityOptions, weatherSearchDraft]);

  const trendingWeatherSections = useMemo(() => {
    const normalizedCityName =
      (selectedWeatherLocation || selectedLocalCity || localLocationLabel)
        .split(",")[0]
        ?.trim()
        .toLowerCase() ?? "";

    const localStationPattern =
      /\b(weather|local|wbtv|wcnc|wsb-tv|khou|kxan|kvue|wfaa|fox \d+|abc \d+|nbc \d+|cbs \d+|queen city news|first coast news)\b/i;
    const nationalWeatherPattern =
      /\b(the weather channel|fox weather|accuweather|weathernation|national weather service|noaa|cnn weather|nbc weather)\b/i;

    const localWeather = selectSourceBalancedArticles(
      weatherNewsArticles.filter((article) => {
        if (isLowInformationLiveStreamArticle(article)) {
          return false;
        }
        const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
        return (
          (Boolean(normalizedCityName) && haystack.includes(normalizedCityName)) ||
          (localStationPattern.test(haystack) && !nationalWeatherPattern.test(haystack))
        );
      }),
      3
    );

    const localKeys = new Set(localWeather.map((article) => getArticleDeduplicationKey(article)));
    const nationalWeather = selectSourceBalancedArticles(
      weatherNewsArticles.filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        if (localKeys.has(dedupeKey)) {
          return false;
        }
        if (isLowInformationLiveStreamArticle(article)) {
          return false;
        }

        const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
        return WEATHER_LIKE_ARTICLE_PATTERN.test(haystack);
      }),
      3
    );

    return {
      localWeather,
      nationalWeather,
    };
  }, [localLocationLabel, selectedLocalCity, selectedWeatherLocation, weatherNewsArticles]);

  const balancedTrendingArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return visibleArticles;
    }

    const prioritizedArticles = visibleArticles.filter(
      (article) => !isLowInformationLiveStreamArticle(article)
    );
    const diversifiedTopArticles: Article[] = [];
    const selectedSourceUsage = new Map<string, number>();
    let lastSourceKey = "";
    let lastCategoryKey = "";

    while (diversifiedTopArticles.length < 25 && prioritizedArticles.length > 0) {
      let selectedIndex = -1;

      for (let index = 0; index < prioritizedArticles.length; index += 1) {
        const article = prioritizedArticles[index];
        const sourceKey = getSafeSourceLabel(article.source).trim().toLowerCase();
        const categoryKey = getSafeCategoryLabel(article.category, article).trim().toLowerCase();
        const sourceUseCount = selectedSourceUsage.get(sourceKey) ?? 0;

        const otherSourceAvailable = prioritizedArticles.some((candidate, candidateIndex) => {
          if (candidateIndex === index) {
            return false;
          }

          const candidateSourceKey = getSafeSourceLabel(candidate.source).trim().toLowerCase();
          return candidateSourceKey !== sourceKey && (selectedSourceUsage.get(candidateSourceKey) ?? 0) < 2;
        });

        const alternativeCategoryAvailable = prioritizedArticles.some(
          (candidate, candidateIndex) => {
            if (candidateIndex === index) {
              return false;
            }

            return getSafeCategoryLabel(candidate.category, candidate).trim().toLowerCase() !== categoryKey;
          }
        );

        if (sourceUseCount >= 2 && otherSourceAvailable) {
          continue;
        }

        if (sourceKey === lastSourceKey && otherSourceAvailable) {
          continue;
        }

        if (categoryKey === lastCategoryKey && alternativeCategoryAvailable) {
          continue;
        }

        if (selectedIndex === -1) {
          selectedIndex = index;
        }
      }

      const nextArticle = prioritizedArticles.splice(selectedIndex >= 0 ? selectedIndex : 0, 1)[0];
      diversifiedTopArticles.push(nextArticle);

      const sourceKey = getSafeSourceLabel(nextArticle.source).trim().toLowerCase();
      const categoryKey = getSafeCategoryLabel(nextArticle.category, nextArticle).trim().toLowerCase();
      lastSourceKey = sourceKey;
      lastCategoryKey = categoryKey;
      selectedSourceUsage.set(sourceKey, (selectedSourceUsage.get(sourceKey) ?? 0) + 1);
    }

    return [...diversifiedTopArticles, ...prioritizedArticles];
  }, [sortMode, visibleArticles]);

  const trendingRenderItems = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as TrendingFeedItem[];
    }

    const items: TrendingFeedItem[] = [];
    let insertedVideos = 0;
    let articleCount = 0;

    balancedTrendingArticles.forEach((article) => {
      items.push({
        type: "article",
        key: `article:${article.id}:${article.url ?? ""}`,
        article,
      });
      articleCount += 1;

      if (videos.length > insertedVideos && articleCount % 4 === 0) {
        const video = videos[insertedVideos];

        if (video?.id && video?.title && video?.creator) {
          items.push({
            type: "video",
            key: `video:${video.id}`,
            video,
          });
        }

        insertedVideos += 1;
      }
    });

    while (insertedVideos < videos.length) {
      const video = videos[insertedVideos];

      if (video?.id && video?.title && video?.creator) {
        items.push({
          type: "video",
          key: `video:${video.id}`,
          video,
        });
      }

      insertedVideos += 1;
    }

    return items;
  }, [balancedTrendingArticles, sortMode, videos]);

  const myNewsVideoPool = useMemo(() => {
    const playableVideos = videos.filter((video) => !isSportsVideo(video));
    const effectivePlayableVideos = ensureMinimumVideoCount(
      playableVideos.filter((video) => !video.fallback),
      playableVideos.filter((video) => video.fallback),
      5
    );
    const preferredVertical = effectivePlayableVideos.filter(
      (video) =>
        video.orientation === "vertical" ||
        /shorts?|reels?|vertical|portrait/i.test(
          `${video.title} ${video.watchUrl} ${video.thumbnailUrl ?? ""}`
        )
    );

    const mergedPreferredPool = dedupeVideosBySourceTitleAndUrl([
      ...preferredVertical,
      ...effectivePlayableVideos,
    ]);
    const finalPool = selectSourceBalancedVideos(prioritizeTopQuickWatchVideos(mergedPreferredPool), 24);
    console.log("VIDEO FINAL COUNT", { section: "my-news-pool", count: finalPool.length });
    return finalPool;
  }, [videos]);

  const myNewsQuickWatchVideos = useMemo(
    () => buildTopQuickWatchRow(myNewsVideoPool, 5),
    [myNewsVideoPool]
  );
  const myNewsFeaturedVideos = useMemo(
    () =>
      myNewsVideoPool.slice(
        myNewsQuickWatchVideos.length,
        myNewsQuickWatchVideos.length + 8
      ),
    [myNewsQuickWatchVideos.length, myNewsVideoPool]
  );
  const primaryNewsClipVideos = useMemo(
    () =>
      myNewsVideoPool.slice(
        myNewsQuickWatchVideos.length + myNewsFeaturedVideos.length,
        myNewsQuickWatchVideos.length + myNewsFeaturedVideos.length + 5
      ),
    [myNewsQuickWatchVideos.length, myNewsFeaturedVideos.length, myNewsVideoPool]
  );

  const trendingBreakingFeaturedVideos = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as VideoItem[];
    }

    const usedVideoIds = new Set(myNewsQuickWatchVideos.map((video) => video.id));
    const preferredGeneralNewsPattern =
      /\b(cnn|reuters|ap news|associated press|abc news|nbc news|cbs news|bbc|pbs|pbs newshour|al jazeera|fox news)\b/i;
    const rejectedSportsPattern =
      /\b(nhl|nba|nfl|mlb|mls|espn|sportscenter|hockey|football|basketball|baseball|soccer)\b/i;
    const rejectedNonNewsPattern =
      /\b(celebrity|tmz|page six|entertainment tonight|e! news|weather channel|fox weather|accuweather|recipe|cooking|food network|travel|gossip)\b/i;

    const candidateVideos = myNewsVideoPool
      .filter((video) => {
        if (usedVideoIds.has(video.id)) {
          return false;
        }

        const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`;
        return preferredGeneralNewsPattern.test(haystack) && !rejectedSportsPattern.test(haystack) && !rejectedNonNewsPattern.test(haystack);
      })
      .sort((left, right) => {
        const leftPreferred = preferredGeneralNewsPattern.test(
          `${left.title} ${left.creator} ${left.category} ${left.watchUrl}`
        )
          ? 1
          : 0;
        const rightPreferred = preferredGeneralNewsPattern.test(
          `${right.title} ${right.creator} ${right.category} ${right.watchUrl}`
        )
          ? 1
          : 0;

        if (rightPreferred !== leftPreferred) {
          return rightPreferred - leftPreferred;
        }

        const leftVertical = left.orientation === "vertical" ? 1 : 0;
        const rightVertical = right.orientation === "vertical" ? 1 : 0;

        if (rightVertical !== leftVertical) {
          return rightVertical - leftVertical;
        }

        return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
      });

    return selectSourceBalancedVideos(candidateVideos, 5, 1);
  }, [myNewsQuickWatchVideos, myNewsVideoPool, sortMode]);

  const trendingTallQuickWatchSections = useMemo(() => {
    if (sortMode !== "trending") {
      return {
        featuredSources: [] as VideoItem[],
        addCategories: [] as VideoItem[],
      };
    }

    const excludedIds = new Set([
      ...myNewsQuickWatchVideos.map((video) => video.id),
      ...trendingBreakingFeaturedVideos.map((video) => video.id),
    ]);

    const tallPool = selectSourceBalancedVideos(
      dedupeVideosBySourceTitleAndUrl(
        myNewsVideoPool.filter((video) => !excludedIds.has(video.id))
      ).sort((left, right) => {
        const leftVertical = left.orientation === "vertical" ? 1 : 0;
        const rightVertical = right.orientation === "vertical" ? 1 : 0;

        if (rightVertical !== leftVertical) {
          return rightVertical - leftVertical;
        }

        return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
      }),
      10,
      1
    );

    return {
      featuredSources: tallPool.slice(0, 5),
      addCategories: tallPool.slice(5, 10),
    };
  }, [myNewsQuickWatchVideos, myNewsVideoPool, sortMode, trendingBreakingFeaturedVideos]);

  const topFiveTrendingArticles = useMemo(
    () => balancedTrendingArticles.filter((article) => !isLowInformationLiveStreamArticle(article)).slice(0, 5),
    [balancedTrendingArticles]
  );

  const breakingNewsPreviewArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [];
    }

    const topTrendingKeys = new Set(
      topFiveTrendingArticles.map((article) => getArticleDeduplicationKey(article))
    );

    const trustedBreakingArticles = breakingPreviewArticles.filter((article) => {
      if (isLowInformationLiveStreamArticle(article)) {
        return false;
      }

      return (
        BREAKING_NEWS_TRUSTED_SOURCES.some((source) =>
          getSafeSourceLabel(article.source).toLowerCase().includes(source.toLowerCase())
        ) && isBreakingNewsEligible(article)
      );
    });
    const broaderBreakingArticles = dedupeArticlesByContent([
      ...breakingPreviewArticles,
      ...visibleArticles.slice(0, 80),
    ]).filter(
      (article) =>
        !isLowInformationLiveStreamArticle(article) &&
        (isBreakingNewsEligible(article) || isHighQualityBreakingRecentArticle(article))
    );
    const highSignalTrustedArticles = trustedBreakingArticles.filter((article) =>
      BREAKING_NEWS_REQUIRED_PATTERN.test(
        `${article.title} ${article.description ?? ""} ${article.content ?? ""} ${article.category}`
      )
    );
    const recentMajorTrustedArticles = trustedBreakingArticles.filter((article) =>
      isHighQualityBreakingRecentArticle(article)
    );

    const candidateArticles =
      highSignalTrustedArticles.length >= 3
        ? highSignalTrustedArticles
        : recentMajorTrustedArticles.length >= 3
          ? recentMajorTrustedArticles
        : trustedBreakingArticles.length >= 5
          ? trustedBreakingArticles
          : broaderBreakingArticles;

    const rankedBreakingCandidates = candidateArticles
      .filter((article) => {
        if (topTrendingKeys.has(getArticleDeduplicationKey(article))) {
          return false;
        }

        return getBreakingNewsRelevanceScore(article) > 0;
      })
      .sort((leftArticle, rightArticle) => {
        const relevanceDelta =
          getBreakingNewsRelevanceScore(rightArticle) - getBreakingNewsRelevanceScore(leftArticle);

        if (relevanceDelta !== 0) {
          return relevanceDelta;
        }

        const leftTime = leftArticle.publishedAt
          ? new Date(leftArticle.publishedAt).getTime()
          : 0;
        const rightTime = rightArticle.publishedAt
          ? new Date(rightArticle.publishedAt).getTime()
          : 0;
        return rightTime - leftTime;
      });

    const balancedBreakingArticles = selectSourceBalancedArticles(rankedBreakingCandidates, 12);
    const selectedBreakingArticles = selectArticlesWithPreferredSourceCap(
      balancedBreakingArticles,
      5,
      1
    ).slice(0, 5);
    const breakingSourceCounts = selectedBreakingArticles.reduce<Record<string, number>>((counts, article) => {
      const source = getSafeSourceLabel(article.source);
      counts[source] = (counts[source] ?? 0) + 1;
      return counts;
    }, {});

    console.log("BREAKING_SOURCE_DIVERSITY_APPLIED", true);
    console.log("BREAKING_SOURCE_COUNTS", breakingSourceCounts);
    console.log("BREAKING NEWS FINAL COUNT", selectedBreakingArticles.length);
    return selectedBreakingArticles;
  }, [breakingPreviewArticles, sortMode, topFiveTrendingArticles, visibleArticles]);

  const breakingNewsLeadSelection = useMemo(() => {
    for (const article of breakingNewsPreviewArticles) {
      const imageSrcOverride = getBreakingLeadCardImageOverride(article);

      if (!imageSrcOverride) {
        continue;
      }

      const imageFailureKey = `${article.id}:${imageSrcOverride}`;

      if (failedArticleImages[imageFailureKey]) {
        continue;
      }

      return {
        article,
        imageSrcOverride,
      };
    }

    return null;
  }, [breakingNewsPreviewArticles, failedArticleImages]);

  useEffect(() => {
    if (sortMode !== "trending") {
      setBreakingLeadCard(null);
      return;
    }

    setBreakingLeadCard((previousCard) => {
      if (breakingNewsLeadSelection) {
        if (
          previousCard &&
          getArticleDeduplicationKey(previousCard.article) ===
            getArticleDeduplicationKey(breakingNewsLeadSelection.article)
        ) {
          console.log("BREAKING LEAD CARD SELECTED", {
            title: previousCard.article.title,
            source: previousCard.article.source,
            image: previousCard.imageSrcOverride,
          });
          return previousCard;
        }

        console.log("BREAKING LEAD CARD SELECTED", {
          title: breakingNewsLeadSelection.article.title,
          source: breakingNewsLeadSelection.article.source,
          image: breakingNewsLeadSelection.imageSrcOverride,
        });
        return breakingNewsLeadSelection;
      }

      if (previousCard) {
        console.log("BREAKING LEAD CARD NULL_OVERWRITE_BLOCKED", {
          title: previousCard.article.title,
          source: previousCard.article.source,
          image: previousCard.imageSrcOverride,
        });
        return previousCard;
      }

      return null;
    });
  }, [breakingNewsLeadSelection, sortMode]);

  const topFiveTrendingLeadArticle = useMemo(() => {
    const firstArticle = topFiveTrendingArticles[0];

    if (!firstArticle) {
      return null;
    }

    const selectedImage = getLargeImageCardImageCandidate(firstArticle);

    if (!selectedImage?.src) {
      return null;
    }

    const imageFailureKey = `${firstArticle.id}:${selectedImage.src}`;
    return failedArticleImages[imageFailureKey] ? null : firstArticle;
  }, [failedArticleImages, topFiveTrendingArticles]);

  const myNewsFeaturedArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as Article[];
    }

    const usedKeys = new Set(
      [
        ...breakingNewsPreviewArticles,
        ...topFiveTrendingArticles,
      ].map((article) => getArticleDeduplicationKey(article))
    );

    const primaryFeaturedArticles = balancedTrendingArticles
      .filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        if (usedKeys.has(dedupeKey)) {
          return false;
        }

        if (isSportsFeaturedCandidate(article)) {
          return false;
        }

        const image = getBestArticleImage(article);
        return Boolean(image.src) && isLikelyHighQualityArticleImage(image.source, image.src);
      })
      .slice(0, 12);

    if (primaryFeaturedArticles.length >= 8) {
      return primaryFeaturedArticles;
    }

    primaryFeaturedArticles.forEach((article) => {
      usedKeys.add(getArticleDeduplicationKey(article));
    });

    const fallbackArticles = balancedTrendingArticles
      .concat(visibleArticles)
      .filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        if (usedKeys.has(dedupeKey)) {
          return false;
        }

        if (isSportsFeaturedCandidate(article)) {
          return false;
        }

        return isRenderableArticleRecord(article);
      })
      .sort(
        (leftArticle, rightArticle) =>
          getPublishedAtTimestamp(rightArticle.publishedAt) -
          getPublishedAtTimestamp(leftArticle.publishedAt)
      )
      .slice(0, Math.max(0, 12 - primaryFeaturedArticles.length));

    return [...primaryFeaturedArticles, ...fallbackArticles].slice(0, 12);
  }, [
    balancedTrendingArticles,
    breakingNewsPreviewArticles,
    sortMode,
    topFiveTrendingArticles,
    visibleArticles,
  ]);

  const sportsVideoPool = useMemo(
    () =>
      selectSourceBalancedVideos(
        ensureMinimumVideoCount(
          [...sportsVideos, ...videos]
          .filter((video) => {
            return (
              isSportsVideo(video) ||
              (video.fallback &&
                /\b(sports|football|basketball|baseball|hockey|soccer|highlights?|top plays)\b/i.test(
                  `${video.category} ${video.title} ${video.creator}`
                ))
            );
          })
          .sort((left, right) => {
            const scoreVideo = (video: VideoItem) => {
              const haystack = `${video.title} ${video.creator} ${video.category}`.toLowerCase();
              let score = 0;

              if (/(highlights|top plays|goals?|dunk|touchdown|home run|save|replay|buzzer beater|walk off|game winner|slam dunk)/.test(haystack)) {
                score += 140;
              }

              if (/(nfl network|nfl films|monday night football|sunday night football|espn nfl|cbs sports nfl|nbc sports nfl|fox sports nfl|bleacher report nfl)/.test(haystack)) {
                score += 120;
              }

              if (/(sportscenter|espn highlights|nfl highlights|nba highlights|mlb highlights|nhl highlights|mls highlights|soccer goals|cbs sports highlights|bleacher report highlights|fox sports highlights|formula 1 highlights|f1 highlights)/.test(haystack)) {
                score += 130;
              }

              if (/(espn|sportscenter|cbs sports|fox sports|nbc sports|bleacher report|sports illustrated|mlb|nfl|nba|nhl|mls|golf|nascar|formula 1|formula1|f1)/.test(haystack)) {
                score += 70;
              }

              if (video.orientation === "vertical") {
                score += 56;
              }

              if (/(debate|podcast|interview|reaction|preview|rumors)/.test(haystack)) {
                score -= 130;
              }

              return score;
            };

            return scoreVideo(right) - scoreVideo(left);
          }),
          [...sportsVideos, ...videos].filter((video) => video.fallback),
          3
        ),
        24
      ),
    [sportsVideos, videos]
  );

  const sportsStandardArticles = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Article[];
    }

    return sportsTabArticles;
  }, [sortMode, sportsTabArticles]);

  const sportsFeaturedArticles = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Article[];
    }

    const seenKeys = new Set<string>();

    return selectSourceBalancedArticles(
      sportsStandardArticles.filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);

        if (seenKeys.has(dedupeKey)) {
          return false;
        }

        seenKeys.add(dedupeKey);
        return true;
      }),
      8
    );
  }, [sortMode, sportsStandardArticles]);

  const groupedSportsArticleSections = useMemo(() => {
    const shouldBuild =
      (sortMode === "trending" || sortMode === "sports") && sportsTabArticles.length > 0;

    if (!shouldBuild) {
      return [] as Array<{
        key: string;
        label: string;
        leadArticle: Article | null;
        articles: Article[];
      }>;
    }

    const sectionConfigs: Array<{
      key: string;
      label: string;
      matcher: (article: Article) => boolean;
      getLead: (articles: Article[]) => Article | null;
    }> = [
      {
        key: "NFL",
        label: "NFL",
        matcher: (article) => isStrictNflArticle(article),
        getLead: (articles) => getNflLargeCardSelection(articles),
      },
      {
        key: "NBA",
        label: "NBA",
        matcher: (article) => isStrictNbaArticle(article),
        getLead: (articles) => {
          const selectedCandidate = articles
            .map((article) => ({
              article,
              image: getLargeImageCardImageCandidate(article),
            }))
            .find((candidate) => candidate.image);
          return selectedCandidate?.article ?? null;
        },
      },
      {
        key: "MLB",
        label: "MLB",
        matcher: (article) => isDedicatedMlbArticle(article, "article"),
        getLead: (articles) => {
          const selection = getMlbLargeCardSelection(articles);
          return selection && selection.imageSrc !== "/category-images/mlb.png" ? selection.article : null;
        },
      },
      {
        key: "NHL",
        label: "NHL",
        matcher: (article) => isStrictNhlArticle(article),
        getLead: (articles) => getNhlLargeCardSelection(articles),
      },
      {
        key: "MLS",
        label: "MLS",
        matcher: (article) => isStrictMlsArticle(article),
        getLead: (articles) => getMlsLargeCardSelection(articles),
      },
      {
        key: "COLLEGE_FOOTBALL",
        label: "College Football",
        matcher: (article) => isStrictCollegeFootballArticle(article),
        getLead: (articles) => getCollegeFootballLargeCardSelection(articles),
      },
      {
        key: "COLLEGE_BASKETBALL",
        label: "College Basketball",
        matcher: (article) => isStrictCollegeBasketballArticle(article),
        getLead: (articles) => getCollegeBasketballLargeCardSelection(articles),
      },
      {
        key: "GOLF",
        label: "Golf",
        matcher: (article) => isStrictGolfArticle(article),
        getLead: (articles) => getGolfLargeCardSelection(articles),
      },
      {
        key: "NASCAR",
        label: "NASCAR",
        matcher: (article) => articleMatchesSelectedCategory(article, "NASCAR") && !isSportsBettingAd(article),
        getLead: (articles) =>
          articles
            .map((article) => ({
              article,
              image: getLargeImageCardImageCandidate(article),
            }))
            .find((candidate) => candidate.image)?.article ?? null,
      },
      {
        key: "FIGHTING",
        label: "Fighting",
        matcher: (article) => isStrictFightingArticle(article),
        getLead: (articles) =>
          articles
            .map((article) => ({
              article,
              image: getLargeImageCardImageCandidate(article),
            }))
            .find((candidate) => candidate.image)?.article ?? null,
      },
    ];

    const sourcePool = dedupeArticlesByContent(sportsTabArticles).filter(
      (article) => isBroadSportsArticle(article) && !isSportsBettingAd(article)
    );
    const usedArticleKeys = new Set<string>();
    const usedDuplicateKeys = new Set<string>();

    const sections = sectionConfigs
      .map((section) => {
        const filteredArticles = sourcePool.filter((article) => {
          const articleKey = getArticleDeduplicationKey(article);

          if (usedArticleKeys.has(articleKey)) {
            console.log("SPORTS DUPLICATE ARTICLE REMOVED", {
              section: section.key,
              title: article.title,
              source: article.source,
              reason: "article_key",
            });
            return false;
          }

          const duplicateKeys = getSportsArticleDuplicateKeys(article);
          if (duplicateKeys.some((key) => usedDuplicateKeys.has(key))) {
            console.log("SPORTS DUPLICATE ARTICLE REMOVED", {
              section: section.key,
              title: article.title,
              source: article.source,
              reason: "duplicate_key",
            });
            return false;
          }

          return section.matcher(article);
        });

        const sortedArticles = [...filteredArticles].sort((leftArticle, rightArticle) => {
          const rightImageBoost = Number(Boolean(getLargeImageCardImageCandidate(rightArticle)));
          const leftImageBoost = Number(Boolean(getLargeImageCardImageCandidate(leftArticle)));

          if (rightImageBoost !== leftImageBoost) {
            return rightImageBoost - leftImageBoost;
          }

          return getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle);
        });

        const selectedArticles = selectSourceBalancedArticles(sortedArticles, 6).filter((article) => {
          const isRenderable = hasRenderableSportsVisual(article, {
            largeCard: false,
          });

          if (!isRenderable) {
            console.log("SPORTS ARTICLE HIDDEN_NO_IMAGE", {
              section: section.key,
              title: article.title,
              source: article.source,
            });
          }

          return isRenderable;
        });
        const leadArticle = section.getLead(selectedArticles);
        const articleKeysToReserve = new Set(
          selectedArticles.map((article) => getArticleDeduplicationKey(article))
        );

        if (leadArticle) {
          articleKeysToReserve.add(getArticleDeduplicationKey(leadArticle));
        }

        selectedArticles.forEach((article) => {
          usedArticleKeys.add(getArticleDeduplicationKey(article));
          getSportsArticleDuplicateKeys(article).forEach((key) => usedDuplicateKeys.add(key));
        });

        if (leadArticle) {
          usedArticleKeys.add(getArticleDeduplicationKey(leadArticle));
          getSportsArticleDuplicateKeys(leadArticle).forEach((key) => usedDuplicateKeys.add(key));
        }

        console.log("SPORTS GROUP ARTICLE COUNT", {
          section: section.label,
          count: selectedArticles.length,
        });
        console.log("SPORTS GROUP LARGE CARD SELECTED", {
          section: section.label,
          title: leadArticle?.title ?? null,
        });

        return {
          key: section.key,
          label: section.label,
          leadArticle,
          articles: selectedArticles.filter((article) =>
            articleKeysToReserve.has(getArticleDeduplicationKey(article))
          ),
        };
      })
      .filter((section) => section.articles.length > 0);

    console.log("SPORTS GROUPED SECTION COUNT", sections.length);
    return sections;
  }, [hasRenderableSportsVisual, sortMode, sportsTabArticles]);

  const favoriteTeamGames = useMemo(() => {
    const matchedGames: SportsScoreGame[] = [];
    const seenGameIds = new Set<string>();

    favoriteTeams.forEach((team) => {
      const leagueGames = sportsScoresDisplayByLeague[team.league] ?? [];
      const teamName = team.team_name.toLowerCase();
      const matchingGame = leagueGames.find(
        (game) =>
          game.homeTeam.name.toLowerCase() === teamName ||
          game.awayTeam.name.toLowerCase() === teamName
      );

      if (!matchingGame || seenGameIds.has(matchingGame.id)) {
        return;
      }

      seenGameIds.add(matchingGame.id);
      matchedGames.push(matchingGame);
    });

    return matchedGames;
  }, [favoriteTeams, sportsScoresDisplayByLeague]);

  const topSportsGames = useMemo(() => {
    return Object.values(sportsScoresDisplayByLeague)
      .flat()
      .sort((left, right) => {
        const statusRank = (game: SportsScoreGame) =>
          game.status === "Live" ? 3 : game.status === "Today" ? 2 : game.status === "Upcoming" ? 1 : 0;

        const statusDelta = statusRank(right) - statusRank(left);
        if (statusDelta !== 0) {
          return statusDelta;
        }

        const rightTime = right.scheduledAt ? new Date(right.scheduledAt).getTime() : 0;
        const leftTime = left.scheduledAt ? new Date(left.scheduledAt).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, 8);
  }, [sportsScoresDisplayByLeague]);

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    console.log("TRENDING SPORTS SCORE CARDS ENABLED", !TRENDING_SCORE_CARDS_DISABLED);
    console.log("TRENDING SPORTS SCORE RAW COUNT", {
      NFL: sportsScoresByLeague.NFL.length,
      NBA: sportsScoresByLeague.NBA.length,
      MLB: sportsScoresByLeague.MLB.length,
      NHL: sportsScoresByLeague.NHL.length,
      MLS: sportsScoresByLeague.MLS.length,
    });
    console.log("TRENDING SPORTS SCORE FINAL COUNT", topSportsGames.length);
    console.log("TRENDING SPORTS SCORE_RENDERED", !TRENDING_SCORE_CARDS_DISABLED && topSportsGames.length > 0);
  }, [sortMode, sportsScoresByLeague, topSportsGames]);

  const sportsLeagueSections = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as Array<{
        key: SportsSectionKey;
        label: string;
        scoreLeague?: SportsScoreLeague;
        scores: SportsScoreGame[];
        articles: Article[];
        videos: VideoItem[];
      }>;
    }

    const usedArticleKeys = new Set<string>();
    const usedSportsDuplicateKeys = new Set<string>();
    const usedVideoKeys = new Set<string>();

    sportsFeaturedArticles.forEach((article) => {
      usedArticleKeys.add(getArticleDeduplicationKey(article));
      getSportsArticleDuplicateKeys(article).forEach((key) => usedSportsDuplicateKeys.add(key));
    });

    return SPORTS_SECTION_CONFIGS.map((section) => {
      const favoriteLeagueTeams = isFavoriteLeagueSectionKey(section.key)
        ? favoriteTeams.filter((team) => team.league === section.key)
        : [];
      const supplementalArticles =
        section.key === "MLB"
          ? mlbSectionArticles
          : section.key === "NHL"
            ? nhlSectionArticles
            : section.key === "MLS"
              ? mlsSectionArticles
              : section.key === "NBA"
                ? nbaSectionArticles
            : section.key === "NFL"
              ? nflSectionArticles
              : section.key === "MMA"
                ? fightingSectionArticles
              : [];
      const supplementalVideos =
        section.key === "MLB"
          ? mlbSectionVideos
          : section.key === "NBA"
            ? nbaSectionVideos
          : section.key === "NHL"
            ? nhlSectionVideos
            : section.key === "NFL"
              ? nflSectionVideos
              : [];

      const candidateArticles = mergeArticlesByIdentity(sportsStandardArticles, supplementalArticles).filter((article) => {
        if (usedArticleKeys.has(getArticleDeduplicationKey(article))) {
          return false;
        }

        const duplicateKeys = getSportsArticleDuplicateKeys(article);
        if (duplicateKeys.some((key) => usedSportsDuplicateKeys.has(key))) {
          console.log("SPORTS DUPLICATE REMOVED", {
            section: section.key,
            title: article.title,
            source: article.source,
          });
          return false;
        }

        if (section.key === "MORE") {
          return !SPORTS_SECTION_CONFIGS.filter((candidate) => candidate.key !== "MORE").some(
            (candidate) => matchesSportsSectionArticle(article, candidate)
          );
        }

        return matchesSportsSectionArticle(article, section);
      });

      const sortedArticles = [...candidateArticles].sort((leftArticle, rightArticle) => {
        const leftText = `${leftArticle.title} ${leftArticle.description ?? ""}`.toLowerCase();
        const rightText = `${rightArticle.title} ${rightArticle.description ?? ""}`.toLowerCase();
        const leftFavoriteBoost = favoriteLeagueTeams.some((team) =>
          leftText.includes(team.team_name.toLowerCase())
        )
          ? 1
          : 0;
        const rightFavoriteBoost = favoriteLeagueTeams.some((team) =>
          rightText.includes(team.team_name.toLowerCase())
        )
          ? 1
          : 0;

        if (rightFavoriteBoost !== leftFavoriteBoost) {
          return rightFavoriteBoost - leftFavoriteBoost;
        }

        const leftImageBoost = Number(Boolean(getLargeImageCardImageCandidate(leftArticle)));
        const rightImageBoost = Number(Boolean(getLargeImageCardImageCandidate(rightArticle)));

        if (rightImageBoost !== leftImageBoost) {
          return rightImageBoost - leftImageBoost;
        }

        const leftBettingPenalty = Number(isSportsBettingAd(leftArticle));
        const rightBettingPenalty = Number(isSportsBettingAd(rightArticle));

        if (leftBettingPenalty !== rightBettingPenalty) {
          return leftBettingPenalty - rightBettingPenalty;
        }

        return getArticlePriorityScore(rightArticle) - getArticlePriorityScore(leftArticle);
      });

      const sectionArticleLimit = section.key === "NBA" || section.key === "MLS" ? 6 : 5;
      const selectedArticles = selectSourceBalancedArticles(sortedArticles, sectionArticleLimit).filter(
        (article) => {
          const isRenderable = hasRenderableSportsVisual(article);

          if (!isRenderable) {
            console.log("SPORTS ARTICLE HIDDEN_NO_IMAGE", {
              section: section.key,
              title: article.title,
              source: article.source,
            });
          }

          return isRenderable;
        }
      );
      console.log("SPORTS SECTION RANKED ARTICLES", {
        section: section.key,
        count: selectedArticles.length,
      });
      selectedArticles.forEach((article) => {
        usedArticleKeys.add(getArticleDeduplicationKey(article));
        getSportsArticleDuplicateKeys(article).forEach((key) => usedSportsDuplicateKeys.add(key));
      });

      const candidateVideos = dedupeVideosBySourceTitleAndUrl([
        ...sportsVideoPool,
        ...supplementalVideos,
      ]).filter((video) => {
        if (usedVideoKeys.has(video.id)) {
          return false;
        }

        if (section.key === "MORE") {
          return !SPORTS_SECTION_CONFIGS.filter((candidate) => candidate.key !== "MORE").some(
            (candidate) => matchesSportsSectionVideo(video, candidate)
          );
        }

        return matchesSportsSectionVideo(video, section);
      });

      const sectionVideoLimit =
        section.key === "NFL" ? 6 : section.key === "MLB" ? 6 : section.key === "MLS" ? 1 : 5;
      const selectedVideos = selectSourceBalancedVideos(candidateVideos, sectionVideoLimit);
      selectedVideos.forEach((video) => {
        usedVideoKeys.add(video.id);
      });
      const visibleVideos = section.key === "MORE" ? [] : selectedVideos;

      const scores = section.scoreLeague
        ? [...(sportsScoresDisplayByLeague[section.scoreLeague] ?? [])].sort((left, right) => {
            const normalizedFavoriteNames = new Set(
              favoriteLeagueTeams.map((team) => team.team_name.toLowerCase())
            );
            const leftFavoriteScore =
              Number(normalizedFavoriteNames.has(left.homeTeam.name.toLowerCase())) +
              Number(normalizedFavoriteNames.has(left.awayTeam.name.toLowerCase()));
            const rightFavoriteScore =
              Number(normalizedFavoriteNames.has(right.homeTeam.name.toLowerCase())) +
              Number(normalizedFavoriteNames.has(right.awayTeam.name.toLowerCase()));

            if (rightFavoriteScore !== leftFavoriteScore) {
              return rightFavoriteScore - leftFavoriteScore;
            }

            const statusRank = (game: SportsScoreGame) =>
              game.status === "Live" ? 3 : game.status === "Today" ? 2 : game.status === "Upcoming" ? 1 : 0;

            return statusRank(right) - statusRank(left);
          })
        : [];

      return {
        key: section.key,
        label: section.label,
        scoreLeague: section.scoreLeague,
        scores,
        articles: selectedArticles,
        videos: visibleVideos,
      };
    }).filter((section) => section.scores.length > 0 || section.articles.length > 0 || section.videos.length > 0);
  }, [favoriteTeams, fightingSectionArticles, hasRenderableSportsVisual, mlbSectionArticles, mlbSectionVideos, mlsSectionArticles, nbaSectionArticles, nbaSectionVideos, nflSectionArticles, nflSectionVideos, nhlSectionArticles, nhlSectionVideos, sortMode, sportsFeaturedArticles, sportsScoresDisplayByLeague, sportsStandardArticles, sportsVideoPool]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(favoriteTeamsStorageKey);
      const parsedValue = rawValue
        ? (JSON.parse(rawValue) as
            | FavoriteTeamOption[]
            | Array<{
                league?: string;
                teamName?: string;
                teamId?: string;
                logo?: string | null;
              }>)
        : [];
      const validTeamIds = new Set(
        TEAM_PICKER_LEAGUES.flatMap((league) =>
          FAVORITE_TEAMS_BY_LEAGUE[league].map((team) => team.team_id)
        )
      );

      setFavoriteTeams(
        parsedValue
          .map((team) => {
            if ("team_id" in team && team.team_id) {
              return team as FavoriteTeamOption;
            }

            if (!("teamId" in team) || !("teamName" in team)) {
              return null;
            }

            const league = TEAM_PICKER_LEAGUES.find(
              (candidate) => candidate === (team.league as FavoriteLeagueKey)
            );

            if (!league || !team.teamId || !team.teamName) {
              return null;
            }

            return {
              team_id: team.teamId,
              team_name: team.teamName,
              league,
              logo_url: team.logo ?? null,
            } satisfies FavoriteTeamOption;
          })
          .filter(
            (team): team is FavoriteTeamOption =>
              team !== null && Boolean(team.team_id) && validTeamIds.has(team.team_id)
          )
      );
    } catch (error) {
      console.error("FAVORITE TEAMS LOAD FAILED", error);
      setFavoriteTeams([]);
    } finally {
      setHasLoadedFavoriteTeams(true);
    }
  }, [favoriteTeamsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedFavoriteTeams) {
      return;
    }

    try {
      window.localStorage.setItem(
        favoriteTeamsStorageKey,
        JSON.stringify(
          favoriteTeams.map((team) => ({
            league: team.league,
            teamName: team.team_name,
            teamId: team.team_id,
            logo: team.logo_url,
          }))
        )
      );
    } catch (error) {
      console.error("FAVORITE TEAMS SAVE FAILED", error);
    }
  }, [favoriteTeams, favoriteTeamsStorageKey, hasLoadedFavoriteTeams]);

  const favoriteTeamUpdates = useMemo<FavoriteTeamUpdate[]>(() => {
    return favoriteTeams.map((team) => {
      const normalizedTeamName = team.team_name.toLowerCase();
      const game =
        (sportsScoresByLeague[team.league] ?? []).find((candidate) => {
          const homeTeam = candidate.homeTeam.name.toLowerCase();
          const awayTeam = candidate.awayTeam.name.toLowerCase();
          return homeTeam === normalizedTeamName || awayTeam === normalizedTeamName;
        }) ?? null;
      const article =
        teamSpecificNewsArticles.find((candidate) => {
          const haystack = `${candidate.title} ${candidate.description ?? ""} ${candidate.source}`.toLowerCase();
          return haystack.includes(normalizedTeamName);
        }) ??
        sportsTabArticles.find((candidate) => {
          const haystack = `${candidate.title} ${candidate.description ?? ""}`.toLowerCase();
          return haystack.includes(normalizedTeamName);
        }) ?? null;

      return {
        team,
        article,
        game,
      };
    });
  }, [favoriteTeams, sportsScoresByLeague, sportsTabArticles, teamSpecificNewsArticles]);

  const usedSportsSectionArticleKeys = useMemo(() => {
    const usedKeys = new Set<string>();

    sportsFeaturedArticles.forEach((article) => {
      usedKeys.add(getArticleDeduplicationKey(article));
    });

    sportsLeagueSections.forEach((section) => {
      section.articles.forEach((article) => {
        usedKeys.add(getArticleDeduplicationKey(article));
      });
    });

    return usedKeys;
  }, [sportsFeaturedArticles, sportsLeagueSections]);

  const featuredSportsArticleKeys = useMemo(() => {
    const usedKeys = new Set<string>();

    sportsFeaturedArticles.forEach((article) => {
      usedKeys.add(getArticleDeduplicationKey(article));
    });

    return usedKeys;
  }, [sportsFeaturedArticles]);

  const sportsSectionSeparatorArticles = useMemo(() => {
    if (sortMode !== "sports" || sportsLeagueSections.length === 0) {
      return {} as Partial<Record<SportsSectionKey, Article | null>>;
    }

    const usedKeys = new Set(featuredSportsArticleKeys);
    const separatorBySectionKey: Partial<Record<SportsSectionKey, Article | null>> = {};
    const candidates = [...sportsStandardArticles]
      .filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);

        return (
          !usedKeys.has(dedupeKey) &&
          isBroadSportsArticle(article) &&
          !isSportsBettingAd(article) &&
          Boolean(getLargeImageCardImageCandidate(article))
        );
      })
      .sort((leftArticle, rightArticle) => {
        const rightScore =
          getArticlePriorityScore(rightArticle) +
          Number(Boolean(getLargeImageCardImageCandidate(rightArticle))) * 80 +
          Math.floor(getPublishedAtTimestamp(rightArticle.publishedAt) / 3_600_000);
        const leftScore =
          getArticlePriorityScore(leftArticle) +
          Number(Boolean(getLargeImageCardImageCandidate(leftArticle))) * 80 +
          Math.floor(getPublishedAtTimestamp(leftArticle.publishedAt) / 3_600_000);

        return rightScore - leftScore;
      });

    sportsLeagueSections.forEach((section) => {
      const nextArticle = candidates.find((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        return !usedKeys.has(dedupeKey);
      });

      separatorBySectionKey[section.key] = nextArticle ?? null;

      if (nextArticle) {
        usedKeys.add(getArticleDeduplicationKey(nextArticle));
      }
    });

    return separatorBySectionKey;
  }, [featuredSportsArticleKeys, sortMode, sportsLeagueSections, sportsStandardArticles]);

  const sportsSectionSeparatorArticleKeys = useMemo(() => {
    const usedKeys = new Set<string>();

    Object.values(sportsSectionSeparatorArticles).forEach((article) => {
      if (article) {
        usedKeys.add(getArticleDeduplicationKey(article));
      }
    });

    return usedKeys;
  }, [sportsSectionSeparatorArticles]);

  const sportsTopSeparatorArticles = useMemo(() => {
    if (sortMode !== "sports" || sportsLeagueSections.length === 0) {
      return [] as Article[];
    }

    const excludedKeys = new Set<string>([
      ...featuredSportsArticleKeys,
      ...Array.from(sportsSectionSeparatorArticleKeys),
    ]);

    const candidates = sportsStandardArticles
      .filter((article) => {
        const dedupeKey = getArticleDeduplicationKey(article);
        return (
          !excludedKeys.has(dedupeKey) &&
          isBroadSportsArticle(article) &&
          !isSportsBettingAd(article) &&
          Boolean(getLargeImageCardImageCandidate(article))
        );
      })
      .sort((leftArticle, rightArticle) => {
        const rightScore =
          getArticlePriorityScore(rightArticle) +
          Number(Boolean(getLargeImageCardImageCandidate(rightArticle))) * 80 +
          Math.floor(getPublishedAtTimestamp(rightArticle.publishedAt) / 3_600_000);
        const leftScore =
          getArticlePriorityScore(leftArticle) +
          Number(Boolean(getLargeImageCardImageCandidate(leftArticle))) * 80 +
          Math.floor(getPublishedAtTimestamp(leftArticle.publishedAt) / 3_600_000);

        return rightScore - leftScore;
      });

    const selected = selectSourceBalancedArticles(candidates, 2).slice(0, 2);
    console.log(
      "SPORTS LARGE IMAGE SEPARATOR COUNT",
      Object.values(sportsSectionSeparatorArticles).filter(Boolean).length + selected.length
    );
    return selected;
  }, [
    featuredSportsArticleKeys,
    sortMode,
    sportsLeagueSections.length,
    sportsSectionSeparatorArticleKeys,
    sportsSectionSeparatorArticles,
    sportsStandardArticles,
  ]);

  const sportsTopSeparatorArticleKeys = useMemo(() => {
    const usedKeys = new Set<string>();

    sportsTopSeparatorArticles.forEach((article) => {
      usedKeys.add(getArticleDeduplicationKey(article));
    });

    return usedKeys;
  }, [sportsTopSeparatorArticles]);

  const sportsVerticalSeparatorVideos = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as VideoItem[];
    }

    const filteredVideos = sportsVideos.filter((video) => {
      const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
      const hasSportsContext =
        /\b(sports|espn|nba|nfl|mlb|nhl|mls|college football|college basketball|golf|nascar|playoffs|championship|highlights|game)\b/.test(
          haystack
        );
      const hasRejectedContext =
        /\b(politics?|celebrity|food|weather|crime|tech|business|world news|local news)\b/.test(
          haystack
        ) && !/\b(local sports|sports)\b/.test(haystack);

      return hasSportsContext && !hasRejectedContext;
    });

    const sortedVideos = [...filteredVideos].sort((leftVideo, rightVideo) => {
      const leftVerticalBoost = leftVideo.orientation === "vertical" ? 2 : 0;
      const rightVerticalBoost = rightVideo.orientation === "vertical" ? 2 : 0;

      if (rightVerticalBoost !== leftVerticalBoost) {
        return rightVerticalBoost - leftVerticalBoost;
      }

      return getPublishedAtTimestamp(rightVideo.publishedAt) - getPublishedAtTimestamp(leftVideo.publishedAt);
    });

    return selectSourceBalancedVideos(sortedVideos, 4, 1);
  }, [sortMode, sportsVideos]);

  const sportsHighlightsVideos = useMemo(() => {
    if (sortMode !== "sports") {
      return [] as VideoItem[];
    }

    const filteredVideos = sportsVideos.filter((video) => {
      const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
      const hasSportsContext =
        /\b(espn|sports|nba finals|nba playoffs|mlb highlights|nhl playoffs|nfl highlights|mls highlights|ufc highlights|boxing highlights|nascar highlights|college football highlights|college basketball highlights|playoffs|championship|highlights)\b/.test(
          haystack
        );
      const hasRejectedContext =
        /\b(politics?|celebrity|tech|business|food|weather|crime|world news|local news)\b/.test(
          haystack
        ) && !/\b(local sports|sports)\b/.test(haystack);

      return hasSportsContext && !hasRejectedContext;
    });

    const sortedVideos = [...filteredVideos].sort((leftVideo, rightVideo) => {
      const score = (video: VideoItem) => {
        const haystack = `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
        let value = 0;

        if (/\b(finals|playoffs|championship|highlights)\b/.test(haystack)) {
          value += 120;
        }
        if (/\b(espn|cbs sports|nbc sports|fox sports|bleacher report|ufc|mlb|nfl|nba|nhl|mls|nascar)\b/.test(haystack)) {
          value += 80;
        }
        if (video.orientation === "vertical") {
          value += 30;
        }

        return value;
      };

      return score(rightVideo) - score(leftVideo);
    });

    return selectSourceBalancedVideos(sortedVideos, 5, 1);
  }, [sortMode, sportsVideos]);

  const favoriteTeamNewsArticles = useMemo(() => {
    if (sortMode !== "sports" || favoriteTeams.length === 0) {
      return [] as Article[];
    }

    const selectedArticles = mergeArticlesByIdentity(
      teamSpecificNewsArticles,
      sportsStandardArticles
    ).filter((article) => {
      const dedupeKey = getArticleDeduplicationKey(article);
      if (usedSportsSectionArticleKeys.has(dedupeKey)) {
        return false;
      }

      const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
      return favoriteTeams.some((team) => haystack.includes(team.team_name.toLowerCase()));
    });

    return selectSourceBalancedArticles(selectedArticles, 8);
  }, [
    favoriteTeams,
    sortMode,
    sportsStandardArticles,
    teamSpecificNewsArticles,
    usedSportsSectionArticleKeys,
  ]);

  const featuredCelebrityArticles = useMemo(
    () => {
      const filteredArticles = celebrityTabArticles.filter((article) => isEntertainmentRelevantArticle(article));
      const rejectedArticles = celebrityTabArticles.filter((article) => !isEntertainmentRelevantArticle(article));
      console.log("ENTERTAINMENT FEATURED UPDATE SOURCE", {
        entertainmentSectionArticles: entertainmentSectionArticles.length,
        visibleArticles: visibleArticles.length,
        celebrityPreviewArticles: celebrityPreviewArticles.length,
      });
      console.log(
        "ENTERTAINMENT FEATURED REJECTED_NON_ENTERTAINMENT",
        rejectedArticles.slice(0, 8).map((article) => article.title)
      );
      const nextFeaturedArticles = selectSourceBalancedArticles(filteredArticles.slice(0, 20), 3);
      console.log("ENTERTAINMENT FEATURED FINAL COUNT", nextFeaturedArticles.length);
      return nextFeaturedArticles;
    },
    [celebrityPreviewArticles.length, celebrityTabArticles, entertainmentSectionArticles.length, visibleArticles.length]
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadEntertainmentSections() {
      if (sortMode !== "celebrity" && sortMode !== "trending") {
        setEntertainmentSectionArticles([]);
        setEntertainmentSectionFeeds({
          music: [],
          tvShows: [],
          gossip: [],
          celebrity: [],
          movies: [],
        });
        setIsEntertainmentSectionLoading(false);
        return;
      }

      setIsEntertainmentSectionLoading(true);

      try {
        const [baseArticles, musicArticles, tvArticles, celebrityArticles, gossipArticles, moviesArticles] =
          await Promise.all([
            fetchEntertainmentArticlesForQueries(ENTERTAINMENT_SECTION_ARTICLE_QUERIES),
            fetchEntertainmentArticlesForQueries(ENTERTAINMENT_MUSIC_QUERIES),
            fetchEntertainmentArticlesForQueries(ENTERTAINMENT_TV_QUERIES),
            fetchEntertainmentArticlesForQueries(ENTERTAINMENT_CELEBRITY_QUERIES),
            fetchEntertainmentArticlesForQueries(ENTERTAINMENT_GOSSIP_QUERIES),
            fetchEntertainmentArticlesForQueries(ENTERTAINMENT_MOVIES_QUERIES),
          ]);

        if (isCancelled) {
          return;
        }

        const sectionFeeds = {
          music: dedupeArticlesByContent(
            [...musicArticles, ...baseArticles].filter((article) => isEntertainmentMusicArticle(article))
          ),
          tvShows: dedupeArticlesByContent(
            [...tvArticles, ...baseArticles].filter((article) => isEntertainmentTvArticle(article))
          ),
          gossip: dedupeArticlesByContent(
            [...gossipArticles, ...celebrityArticles, ...baseArticles].filter((article) =>
              isEntertainmentGossipArticle(article)
            )
          ),
          celebrity: dedupeArticlesByContent(
            [...celebrityArticles, ...baseArticles].filter((article) => isEntertainmentCelebrityArticle(article))
          ),
          movies: dedupeArticlesByContent(
            [...moviesArticles, ...baseArticles].filter((article) => isEntertainmentMoviesArticle(article))
          ),
        };

        const nextArticles = dedupeArticlesByContent([
          ...baseArticles,
          ...sectionFeeds.music,
          ...sectionFeeds.tvShows,
          ...sectionFeeds.gossip,
          ...sectionFeeds.celebrity,
          ...sectionFeeds.movies,
        ]);

        const providerCounts = nextArticles.reduce<Record<string, number>>((counts, article) => {
          const provider = getArticleProviderLabel(article.provider).toLowerCase();
          counts[provider] = (counts[provider] ?? 0) + 1;
          return counts;
        }, {});

        console.log("ENTERTAINMENT_PROVIDER_COUNTS", providerCounts);

        setEntertainmentSectionFeeds(sectionFeeds);
        setEntertainmentSectionArticles(nextArticles);
      } catch (error) {
        console.error("Entertainment section fetch failed", error);
        if (!isCancelled) {
          setEntertainmentSectionArticles([]);
          setEntertainmentSectionFeeds({
            music: [],
            tvShows: [],
            gossip: [],
            celebrity: [],
            movies: [],
          });
        }
      } finally {
        if (!isCancelled) {
          setIsEntertainmentSectionLoading(false);
        }
      }
    }

    void loadEntertainmentSections();

    return () => {
      isCancelled = true;
    };
  }, [sortMode]);

  const buildEntertainmentSection = useCallback(
    (
      candidateArticles: Article[],
      matcher: (article: Article) => boolean,
      sourceTerms: readonly string[],
      kind: "music" | "tv" | "movies" | "gossip" | "celebrity",
      limit: number,
      usedKeys: Set<string>
    ) => {
      const matches = dedupeArticlesByContent([
        ...candidateArticles,
        ...celebrityTabArticles,
      ]).filter((article) => {
        return matcher(article) && !usedKeys.has(getArticleDeduplicationKey(article));
      });
      const sortedMatches = [...matches].sort(
        (leftArticle, rightArticle) =>
          scoreEntertainmentArticleBySources(rightArticle, sourceTerms, kind) -
          scoreEntertainmentArticleBySources(leftArticle, sourceTerms, kind)
      );
      const selected = selectSourceBalancedArticles(sortedMatches, limit);
      selected.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));
      return selected;
    },
    [celebrityTabArticles]
  );

  const entertainmentSectionContent = useMemo(() => {
    const usedKeys = new Set(
      featuredCelebrityArticles.map((article) => getArticleDeduplicationKey(article))
    );

    const music = buildEntertainmentSection(
      entertainmentSectionFeeds.music,
      isEntertainmentMusicArticle,
      ENTERTAINMENT_MUSIC_QUERIES,
      "music",
      12,
      usedKeys
    );
    const tvShows = buildEntertainmentSection(
      entertainmentSectionFeeds.tvShows,
      isEntertainmentTvArticle,
      ENTERTAINMENT_TV_QUERIES,
      "tv",
      12,
      usedKeys
    );
    const gossip = buildEntertainmentSection(
      entertainmentSectionFeeds.gossip,
      isEntertainmentGossipArticle,
      ENTERTAINMENT_CELEBRITY_QUERIES,
      "gossip",
      12,
      usedKeys
    );
    const celebrity = buildEntertainmentSection(
      entertainmentSectionFeeds.celebrity,
      isEntertainmentCelebrityArticle,
      ENTERTAINMENT_CELEBRITY_QUERIES,
      "celebrity",
      12,
      usedKeys
    );
    const movies = buildEntertainmentSection(
      entertainmentSectionFeeds.movies,
      isEntertainmentMoviesArticle,
      ENTERTAINMENT_MOVIES_QUERIES,
      "movies",
      10,
      usedKeys
    );

    console.log(
      "ENTERTAINMENT SOURCES COUNT",
      Array.from(new Set(celebrityTabArticles.map((article) => getSafeSourceLabel(article.source)))).length
    );
    console.log("ENTERTAINMENT MUSIC ARTICLE COUNT", music.length);
    console.log("ENTERTAINMENT MUSIC FINAL COUNT", music.length);
    console.log("ENTERTAINMENT TV ARTICLE COUNT", tvShows.length);
    console.log("ENTERTAINMENT TV FINAL COUNT", tvShows.length);
    console.log("ENTERTAINMENT MOVIES ARTICLE COUNT", movies.length);
    console.log("ENTERTAINMENT MOVIES FINAL COUNT", movies.length);
    console.log("ENTERTAINMENT GOSSIP ARTICLE COUNT", gossip.length);
    console.log("ENTERTAINMENT GOSSIP FINAL COUNT", gossip.length);
    console.log("ENTERTAINMENT CELEBRITY ARTICLE COUNT", celebrity.length);
    console.log("ENTERTAINMENT CELEBRITY FINAL COUNT", celebrity.length);
    console.log(
      "ENTERTAINMENT SOURCE DISTRIBUTION",
      Array.from(
        celebrityTabArticles.reduce((map, article) => {
          const source = getSafeSourceLabel(article.source);
          map.set(source, (map.get(source) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
      )
    );

    return { music, tvShows, movies, gossip, celebrity };
  }, [buildEntertainmentSection, celebrityTabArticles, entertainmentSectionFeeds, featuredCelebrityArticles]);

  const entertainmentMovieSliderArticles = useMemo(() => {
    const rawSliderArticles = dedupeArticlesByContent([
      ...entertainmentSectionFeeds.movies,
      ...entertainmentSectionContent.movies,
      ...celebrityTabArticles,
    ]);
    const sliderArticles = rawSliderArticles
      .filter(
        (article) =>
          isEntertainmentMoviesArticle(article) &&
          Boolean(getLargeImageCardImageCandidate(article)?.src || getTopicFallbackImage(article))
      )
      .sort(
        (leftArticle, rightArticle) =>
          scoreEntertainmentArticleBySources(rightArticle, ENTERTAINMENT_MOVIES_QUERIES, "movies") -
          scoreEntertainmentArticleBySources(leftArticle, ENTERTAINMENT_MOVIES_QUERIES, "movies")
      );
    console.log("MOVIES SLIDER RAW COUNT", rawSliderArticles.length);
    console.log("MOVIES SLIDER VALID_COUNT", sliderArticles.length);
    console.log("ENTERTAINMENT MOVIE SLIDER COUNT", sliderArticles.length);
    return sliderArticles.slice(0, 10);
  }, [celebrityTabArticles, entertainmentSectionContent.movies, entertainmentSectionFeeds.movies]);

  const popularMusicSliderArticles = useMemo(() => {
    const rawCandidates = dedupeArticlesByContent(
      sortMode === "trending"
        ? [...celebrityPreviewArticles, ...visibleArticles.slice(0, 60)]
        : [
            ...entertainmentSectionFeeds.music,
            ...entertainmentSectionContent.music,
            ...celebrityTabArticles,
          ]
    )
      .filter((article) => isEntertainmentMusicArticle(article))
      .sort(
        (leftArticle, rightArticle) =>
          scoreEntertainmentArticleBySources(rightArticle, ENTERTAINMENT_MUSIC_QUERIES, "music") -
          scoreEntertainmentArticleBySources(leftArticle, ENTERTAINMENT_MUSIC_QUERIES, "music")
      );

    const imageCandidates = rawCandidates.filter((article) =>
      Boolean(getLargeImageCardImageCandidate(article))
    );

    console.log("POPULAR MUSIC RAW COUNT", rawCandidates.length);
    console.log("POPULAR MUSIC IMAGE COUNT", imageCandidates.length);
    console.log("POPULAR MUSIC SLIDER_VISIBLE", imageCandidates.length >= 2);

    return imageCandidates.slice(0, 10);
  }, [
    celebrityPreviewArticles,
    celebrityTabArticles,
    entertainmentSectionContent.music,
    entertainmentSectionFeeds.music,
    sortMode,
    visibleArticles,
  ]);

  const trendingEntertainmentArticles = useMemo(() => {
    if (sortMode !== "trending") {
      return [] as Article[];
    }

    const filteredArticles = dedupeArticlesByContent([
      ...entertainmentSectionArticles,
      ...entertainmentSectionFeeds.gossip,
      ...entertainmentSectionFeeds.music,
      ...entertainmentSectionFeeds.tvShows,
      ...entertainmentSectionFeeds.celebrity,
      ...entertainmentSectionFeeds.movies,
      ...celebrityPreviewArticles,
      ...visibleArticles.slice(0, 80),
    ])
      .filter(
        (article) =>
          isEntertainmentRelevantArticle(article) && !isLowInformationLiveStreamArticle(article)
      )
      .sort(
        (leftArticle, rightArticle) =>
          scoreEntertainmentArticleBySources(rightArticle, ENTERTAINMENT_CELEBRITY_QUERIES, "celebrity") -
          scoreEntertainmentArticleBySources(leftArticle, ENTERTAINMENT_CELEBRITY_QUERIES, "celebrity")
      );

    const selectedArticles = selectSourceBalancedArticles(filteredArticles, 8);
    console.log("TRENDING ENTERTAINMENT ARTICLE COUNT", selectedArticles.length);
    return selectedArticles;
  }, [
    celebrityPreviewArticles,
    entertainmentSectionArticles,
    entertainmentSectionFeeds.celebrity,
    entertainmentSectionFeeds.gossip,
    entertainmentSectionFeeds.movies,
    entertainmentSectionFeeds.music,
    entertainmentSectionFeeds.tvShows,
    sortMode,
    visibleArticles,
  ]);

  const trendingEntertainmentLeadArticle = useMemo(() => {
    if (sortMode !== "trending") {
      return null;
    }

    const selectedArticle = getEntertainmentSectionLeadArticle(
      "celebrity",
      trendingEntertainmentArticles,
      ENTERTAINMENT_CELEBRITY_QUERIES,
      "celebrity"
    );

    console.log(
      "TRENDING ENTERTAINMENT LARGE CARD SELECTED",
      selectedArticle ? selectedArticle.title : null
    );
    return selectedArticle;
  }, [sortMode, trendingEntertainmentArticles]);

  useEffect(() => {
    if (sortMode === "celebrity") {
      console.log("ENTERTAINMENT SECTION ORDER", [
        "Featured Entertainment",
        "Gossip",
        "Music",
        "TV Shows",
        "Celebrity",
        "Movies",
      ]);
    }
  }, [sortMode]);

  useEffect(() => {
    if (sortMode !== "celebrity") {
      setEntertainmentLeadCards({
        gossip: null,
        music: null,
        tv: null,
        celebrity: null,
        movies: null,
      });
      return;
    }

    setEntertainmentLeadCards((previousState) => {
      const nextState = { ...previousState };
      let hasChanges = false;

      const sectionConfigs: Array<{
        key: EntertainmentSectionKey;
        articles: Article[];
        sourceTerms: readonly string[];
        kind: "music" | "tv" | "movies" | "gossip" | "celebrity";
        matcher: (article: Article) => boolean;
      }> = [
        {
          key: "gossip",
          articles: entertainmentSectionContent.gossip,
          sourceTerms: ENTERTAINMENT_CELEBRITY_QUERIES,
          kind: "gossip",
          matcher: isEntertainmentGossipArticle,
        },
        {
          key: "music",
          articles: entertainmentSectionContent.music,
          sourceTerms: ENTERTAINMENT_MUSIC_QUERIES,
          kind: "music",
          matcher: isEntertainmentMusicArticle,
        },
        {
          key: "tv",
          articles: entertainmentSectionContent.tvShows,
          sourceTerms: ENTERTAINMENT_TV_QUERIES,
          kind: "tv",
          matcher: isEntertainmentTvArticle,
        },
        {
          key: "celebrity",
          articles: entertainmentSectionContent.celebrity,
          sourceTerms: ENTERTAINMENT_CELEBRITY_QUERIES,
          kind: "celebrity",
          matcher: isEntertainmentCelebrityArticle,
        },
        {
          key: "movies",
          articles: entertainmentSectionContent.movies,
          sourceTerms: ENTERTAINMENT_MOVIES_QUERIES,
          kind: "movies",
          matcher: isEntertainmentMoviesArticle,
        },
      ];

      sectionConfigs.forEach(({ key, articles, sourceTerms, kind, matcher }) => {
        const nextCandidate = getEntertainmentSectionLeadArticle(key, articles, sourceTerms, kind);
        const previousArticle = previousState[key];
        const previousStillValid =
          Boolean(previousArticle) &&
          matcher(previousArticle as Article) &&
          Boolean(getLargeImageCardImageCandidate(previousArticle as Article));

        if (!previousArticle && nextCandidate) {
          nextState[key] = nextCandidate;
          hasChanges = true;
          console.log("ENTERTAINMENT LARGE CARD INITIAL", {
            section: key,
            title: nextCandidate.title,
          });
          if (key === "gossip") {
            console.log("GOSSIP LARGE CARD SELECTED", nextCandidate.title);
          }
          return;
        }

        if (previousArticle && previousStillValid) {
          if (!nextCandidate) {
            console.log("ENTERTAINMENT LARGE CARD OVERWRITE_BLOCKED", {
              section: key,
              kept: previousArticle.title,
              attempted: null,
            });
            console.log("ENTERTAINMENT LARGE CARD KEPT", {
              section: key,
              title: previousArticle.title,
            });
            return;
          }

          const previousScore = scoreEntertainmentArticleBySources(previousArticle, sourceTerms, kind);
          const nextScore = scoreEntertainmentArticleBySources(nextCandidate, sourceTerms, kind);

          if (nextScore > previousScore) {
            nextState[key] = nextCandidate;
            hasChanges = true;
            console.log("ENTERTAINMENT LARGE CARD INITIAL", {
              section: key,
              title: nextCandidate.title,
            });
            if (key === "gossip") {
              console.log("GOSSIP LARGE CARD SELECTED", nextCandidate.title);
            }
          } else {
            console.log("ENTERTAINMENT LARGE CARD OVERWRITE_BLOCKED", {
              section: key,
              kept: previousArticle.title,
              attempted: nextCandidate.title,
            });
            console.log("ENTERTAINMENT LARGE CARD KEPT", {
              section: key,
              title: previousArticle.title,
            });
          }
          return;
        }

        if (nextCandidate) {
          nextState[key] = nextCandidate;
          hasChanges = true;
          console.log("ENTERTAINMENT LARGE CARD INITIAL", {
            section: key,
            title: nextCandidate.title,
          });
          if (key === "gossip") {
            console.log("GOSSIP LARGE CARD SELECTED", nextCandidate.title);
          }
        }
      });

      return hasChanges ? nextState : previousState;
    });
  }, [entertainmentSectionContent, sortMode]);

  const localSectionArticles = useMemo(() => {
    if (sortMode !== "local") {
      return {
        localSports: [] as Article[],
        developmentBusiness: [] as Article[],
        eventsThingsToDo: [] as Article[],
        foodRestaurants: [] as Article[],
      };
    }

    const cityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const cityName = cityLabel.split(",")[0]?.trim().toLowerCase() ?? "";
    const usedTopLocalKeys = new Set(
      balancedLocalArticles
        .slice(0, 6)
        .map((article) => getArticleDeduplicationKey(article))
    );

    const cityAwareArticles = balancedLocalArticles.filter((article) => {
      const haystack = `${article.title} ${article.description ?? ""} ${article.source}`.toLowerCase();
      return cityName ? haystack.includes(cityName) || haystack.includes("local") : true;
    });

    const pickSection = (pattern: RegExp, limit: number) =>
      selectSourceBalancedArticles(
        cityAwareArticles.filter((article) => {
          const dedupeKey = getArticleDeduplicationKey(article);
          if (usedTopLocalKeys.has(dedupeKey)) {
            return false;
          }

          const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
          return pattern.test(haystack);
        }),
        limit
      );

    return {
      localSports: pickSection(
        /\b(sports?|game|match|playoffs?|team|athlete|baseball|football|basketball|soccer|hockey)\b/i,
        4
      ),
      developmentBusiness: pickSection(
        /\b(development|business|economy|downtown|housing|real estate|construction|retail|office|zoning|infrastructure)\b/i,
        4
      ),
      eventsThingsToDo: pickSection(
        /\b(events?|things to do|festival|concert|weekend|arts|museum|show|fair|community event)\b/i,
        4
      ),
      foodRestaurants: pickSection(
        /\b(food|restaurant|restaurants|dining|chef|bar|cafe|eatery|menu|brunch)\b/i,
        4
      ),
    };
  }, [balancedLocalArticles, selectedLocalCity, sortMode]);

  const localLifestyleSections = useMemo(() => {
    if (sortMode !== "local") {
      return {
        bestRestaurants: [] as Article[],
        thingsToDo: [] as Article[],
        localEvents: [] as Article[],
        neighborhoods: [] as Article[],
        foodDrink: [] as Article[],
      };
    }

    const cityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const cityName = cityLabel.split(",")[0]?.trim().toLowerCase() ?? "";
    const cityAwareArticles = balancedLocalArticles.filter((article) => {
      const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
      return cityName ? haystack.includes(cityName) || haystack.includes("local") : true;
    });
    const usedKeys = new Set<string>();

    const pickSection = (pattern: RegExp, limit: number) => {
      const selected = selectSourceBalancedArticles(
        cityAwareArticles.filter((article) => {
          const dedupeKey = getArticleDeduplicationKey(article);
          if (usedKeys.has(dedupeKey)) {
            return false;
          }

          const haystack = `${article.title} ${article.description ?? ""} ${article.source} ${article.category}`.toLowerCase();
          return pattern.test(haystack);
        }),
        limit
      );

      selected.forEach((article) => usedKeys.add(getArticleDeduplicationKey(article)));
      return selected;
    };

    return {
      bestRestaurants: pickSection(
        /\b(best restaurants?|restaurants?|food scene|chef|dining|eater|axios charlotte|charlotte observer restaurants|queen city nerve food|food and drink|bar|brunch|cafe)\b/i,
        8
      ),
      thingsToDo: pickSection(
        /\b(things to do|weekend|tonight|arts|museum|show|festival|concert|market|family fun|date night)\b/i,
        5
      ),
      localEvents: pickSection(
        /\b(events?|festival|concert|fair|community event|market|parade|game day)\b/i,
        5
      ),
      neighborhoods: pickSection(
        /\b(neighborhood|neighborhoods|uptown|south end|plaza midwood|noDa|dilworth|ballantyne|optimist park)\b/i,
        4
      ),
      foodDrink: pickSection(
        /\b(food and drink|cocktail|brewery|coffee|dessert|menu|restaurant opening|food hall|wine|beer)\b/i,
        4
      ),
    };
  }, [balancedLocalArticles, selectedLocalCity, sortMode]);

  const localVideoItems = useMemo(() => {
    if (sortMode !== "local") {
      return [] as VideoItem[];
    }

    const cityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const cityMatcher = buildSelectedCityVideoMatcher(cityLabel);
    if (!cityLabel.trim()) {
      return [] as VideoItem[];
    }

    const trendingLocalCandidatePool = dedupeVideosBySourceTitleAndUrl([...videos, ...weatherVideos]).filter(
      (video) => cityMatcher(video)
    );
    console.log("TRENDING LOCAL VIDEO COUNT", {
      city: cityLabel,
      count: trendingLocalCandidatePool.length,
    });

    const combinedVideoPool = dedupeVideosBySourceTitleAndUrl([
      ...localVideos,
      ...videos,
      ...weatherVideos,
    ]);
    const localMatches = combinedVideoPool.filter((video) => cityMatcher(video)).sort((left, right) => {
      const scoreVideo = (video: VideoItem) => {
        const haystack =
          `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`.toLowerCase();
        let score = 0;

        if (LOCAL_VIDEO_SOURCE_HINTS[cityLabel.split(",")[0]?.trim().toLowerCase() ?? ""]?.test(haystack)) {
          score += 220;
        }

        if (cityMatcher(video)) {
          score += 140;
        }

        if (/\b(local news|breaking news|weather|forecast|storm|traffic|sports|community|latest)\b/i.test(haystack)) {
          score += 60;
        }

        if (video.orientation === "vertical") {
          score += 12;
        }

        return score;
      };

      const scoreDelta = scoreVideo(right) - scoreVideo(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return getPublishedAtTimestamp(right.publishedAt) - getPublishedAtTimestamp(left.publishedAt);
    });

    console.log("LOCAL VIDEO QUERY", {
      city: cityLabel,
      supplementalCount: localVideos.length,
    });
    console.log("LOCAL VIDEO RAW COUNT", {
      city: cityLabel,
      count: combinedVideoPool.length,
    });

    const finalLocalVideos = selectSourceBalancedVideos(localMatches, 16, 2);

    console.log("LOCAL VIDEO FINAL COUNT", {
      city: cityLabel,
      count: finalLocalVideos.length,
    });
    console.log(
      "LOCAL VIDEO SAMPLE",
      finalLocalVideos.slice(0, 3).map((video) => ({
        title: video.title,
        creator: video.creator,
        category: video.category,
      }))
    );
    if (cityLabel.toLowerCase().startsWith("charlotte")) {
      console.log("CHARLOTTE LOCAL VIDEO FINAL COUNT", finalLocalVideos.length);
      console.log(
        "CHARLOTTE LOCAL VIDEO SAMPLE",
        finalLocalVideos.slice(0, 3).map((video) => ({
          title: video.title,
          creator: video.creator,
          category: video.category,
        }))
      );
    }

    return finalLocalVideos;
  }, [localVideos, selectedLocalCity, sortMode, videos, weatherVideos]);

  const localVideoRows = useMemo(() => {
    if (sortMode !== "local" || localVideoItems.length === 0) {
      return [] as VideoItem[][];
    }

    const rows: VideoItem[][] = [];
    for (let index = 0; index < localVideoItems.length; index += 4) {
      const nextRow = localVideoItems.slice(index, index + 4);
      if (nextRow.length > 0) {
        rows.push(nextRow);
      }
    }

    return rows;
  }, [localVideoItems, sortMode]);

  const myNewsImageCount = useMemo(() => {
    const sampleArticles = [
      ...breakingNewsPreviewArticles,
      ...topFiveTrendingArticles,
      ...myNewsFeaturedArticles,
    ];

    return sampleArticles.filter((article) => Boolean(getArticleDisplayImage(article).src)).length;
  }, [breakingNewsPreviewArticles, myNewsFeaturedArticles, topFiveTrendingArticles]);

  const sportsImageCount = useMemo(
    () =>
      sportsTabArticles.filter((article) => {
        return hasRenderableSportsVisual(article);
      }).length,
    [hasRenderableSportsVisual, sportsTabArticles]
  );

  useEffect(() => {
    if (sortMode === "trending") {
      console.log("MY NEWS FEATURED ARTICLES COUNT", myNewsFeaturedArticles.length);
      console.log("MY NEWS FEATURED VIDEOS COUNT", myNewsFeaturedVideos.length);
      console.log("MY NEWS IMAGE COUNT", myNewsImageCount);
    }

    if (sortMode === "sports") {
      console.log("SPORTS VIDEO COUNT", sportsVideoPool.length);
      console.log(
        "SPORTS LEAGUE SECTION COUNTS",
        sportsLeagueSections.map((section) => ({
          key: section.key,
          articleCount: section.articles.length,
          videoCount: section.videos.length,
          scoreCount: section.scores.length,
        }))
      );
      console.log("SPORTS IMAGE COUNT", sportsImageCount);
    }
  }, [
    myNewsImageCount,
    myNewsFeaturedArticles.length,
    myNewsFeaturedVideos.length,
    sportsImageCount,
    sportsLeagueSections,
    sportsVideoPool.length,
    sortMode,
  ]);

  useEffect(() => {
    console.log("RECTANGLE LOGOS SYNCED");
  }, []);

  const topPollsSection = useMemo(
    () =>
      [...myFeedPolls]
        .sort((left, right) => {
          const scoreDifference = getPollFeedScore(right) - getPollFeedScore(left);

          if (scoreDifference !== 0) {
            return scoreDifference;
          }

          return getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at);
        })
        .slice(0, 3),
    [myFeedPolls]
  );

  const featuredSources = useMemo<RankedSourceSummary[]>(() => {
    const featuredSourceMap = new Map<string, RankedSourceSummary>();

    homeSourceRankings.forEach((source) => {
      if (hasMappedSourceLogo(source.sourceName)) {
        featuredSourceMap.set(source.sourceName, source);
      }
    });

    FEATURED_SOURCE_NAMES.forEach((sourceName) => {
      if (!featuredSourceMap.has(sourceName) && hasMappedSourceLogo(sourceName)) {
        featuredSourceMap.set(sourceName, {
          sourceName,
          likes: 0,
          heartedByCurrentUser: false,
        });
      }
    });

    return [...featuredSourceMap.values()]
      .sort((left, right) => {
        if (right.likes !== left.likes) {
          return right.likes - left.likes;
        }

        const leftCuratedIndex = FEATURED_SOURCE_NAMES.indexOf(
          left.sourceName as (typeof FEATURED_SOURCE_NAMES)[number]
        );
        const rightCuratedIndex = FEATURED_SOURCE_NAMES.indexOf(
          right.sourceName as (typeof FEATURED_SOURCE_NAMES)[number]
        );
        const normalizedLeftIndex =
          leftCuratedIndex === -1 ? FEATURED_SOURCE_NAMES.length : leftCuratedIndex;
        const normalizedRightIndex =
          rightCuratedIndex === -1 ? FEATURED_SOURCE_NAMES.length : rightCuratedIndex;

        if (normalizedLeftIndex !== normalizedRightIndex) {
          return normalizedLeftIndex - normalizedRightIndex;
        }

        return left.sourceName.localeCompare(right.sourceName);
      })
      .slice(0, 12);
  }, [homeSourceRankings]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const getCategorySwipeArtStyle = useCallback(
    (category: string, index: number) => {
      const imageUrl = getCategoryImageUrl(category);

      return {
        backgroundImage: imageUrl
          ? `linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.02)), url(${imageUrl})`
          : undefined,
        backgroundSize: imageUrl ? "contain" : "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundColor: imageUrl ? undefined : undefined,
      } as const;
    },
    []
  );

  const topLocalStories = useMemo(() => {
    if (sortMode !== "local" || !selectedLocalCity) {
      return [];
    }

    return balancedLocalArticles.slice(0, 6);
  }, [balancedLocalArticles, selectedLocalCity, sortMode]);

  const navigableTopLocalStories = useMemo(
    () => topLocalStories.filter((article) => getArticleRouteId(article) !== null),
    [topLocalStories]
  );

  const myFeedRenderItems = useMemo(() => {
    if (sortMode !== "polls") {
      return [];
    }

    const sortedPolls = [...myFeedPolls]
      .filter((poll) =>
        pollFilter === "following" ? pollFollowingIds.includes(poll.user_id) : true
      )
      .sort((left, right) => {
        if (pollFilter === "trending") {
          return getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at);
        }

        if (pollFilter === "following") {
          const rightRecent = getPublishedAtTimestamp(right.created_at);
          const leftRecent = getPublishedAtTimestamp(left.created_at);

          if (rightRecent !== leftRecent) {
            return rightRecent - leftRecent;
          }
        }

        const scoreDifference = getPollFeedScore(right) - getPollFeedScore(left);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return getPublishedAtTimestamp(right.created_at) - getPublishedAtTimestamp(left.created_at);
      });

    return sortedPolls.map((poll) => ({
      type: "poll" as const,
      key: `poll:${poll.id}`,
      poll,
    }));
  }, [myFeedPolls, pollFilter, pollFollowingIds, sortMode]);

  useEffect(() => {
    console.log(
      "TRENDING RENDER COUNT",
      sortMode === "trending" ? trendingRenderItems.length : visibleArticles.length
    );
    if (sortMode === "trending") {
      console.log("TRENDING ITEMS COUNT", trendingRenderItems.length);
    }
  }, [sortMode, trendingRenderItems.length, visibleArticles.length]);

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    balancedTrendingArticles
      .slice(0, 10)
      .forEach((article) => {
        const selectedImage = getArticleDisplayImage(article);
        console.log("TRENDING IMAGE SELECTED", {
          title: article.title,
          source: article.source,
          imageUrl: selectedImage.src,
          selectedFrom: selectedImage.kind,
        });
      });
  }, [balancedTrendingArticles, sortMode]);

  useEffect(() => {
    console.log("SECTION IMAGE_ONLY_FINAL_COUNT", {
      section: "Trending",
      count: balancedTrendingArticles.filter((article) => Boolean(getArticleDisplayImage(article).src)).length,
    });
    console.log("SECTION IMAGE_ONLY_FINAL_COUNT", {
      section: "Breaking News",
      count: breakingNewsPreviewArticles.filter((article) => Boolean(getArticleDisplayImage(article).src)).length,
    });
  }, [balancedTrendingArticles, breakingNewsPreviewArticles]);

  useEffect(() => {
    console.log("GLOBAL IMAGE_ONLY_ACTIVE", true);
  }, []);

  useEffect(() => {
    if (sortMode !== "local") {
      return;
    }

    const imagelessCount = balancedLocalArticles.filter(
      (article) => !getArticleDisplayImage(article).src
    ).length;

    console.log("LOCAL NEWS IMAGELESS_ALLOWED", true);
    console.log("LOCAL NEWS IMAGELESS_COUNT", imagelessCount);
  }, [balancedLocalArticles, sortMode]);

  const renderLocalTextOnlyArticleCard = (
    article: Article,
    options?: {
      rankLabel?: string | null;
      sectionLabel?: string | null;
      compact?: boolean;
    }
  ) => {
    const articleRouteId = getArticleRouteId(article);

    if (!articleRouteId || !isRenderableArticleRecord(article)) {
      return null;
    }

    const safeSourceName = getSafeSourceLabel(article.source);
    const safeCategoryName = getSafeCategoryLabel(article.category, article);
    const displaySectionLabel = options?.sectionLabel ?? getCategoryLabel(safeCategoryName);
    const publishedLabel = formatPublishedDate(article.publishedAt, article.time);

    return (
      <article
        className={`news-card local-text-only-card ${options?.compact ? "local-text-only-card-compact" : ""} ${
          options?.rankLabel ? "news-card-has-rank" : ""
        }`}
        onContextMenu={(event) => {
          event.preventDefault();
          openLongPressMenu(article);
        }}
        onTouchStart={() => {
          clearArticleLongPressTimer();
          articleLongPressTimerRef.current = window.setTimeout(() => {
            openLongPressMenu(article);
          }, 420);
        }}
        onTouchEnd={clearArticleLongPressTimer}
        onTouchCancel={clearArticleLongPressTimer}
        onTouchMove={clearArticleLongPressTimer}
      >
        <div className="news-card-top-row news-card-top-row-brand">
          <div className="trending-source-stack trending-source-stack-primary">
            <div className="trending-source-brand trending-source-brand-static">
              <SourceHeaderMark
                sourceName={safeSourceName}
                className="trending-source-header-mark"
                fallbackMode="text"
              />
              <span className="trending-source-category-separator" aria-hidden="true">
                ·
              </span>
              <span className="trending-source-category-inline">{displaySectionLabel}</span>
              <span className="trending-source-category-separator" aria-hidden="true">
                ·
              </span>
              <span className="trending-source-category-inline">
                {selectedLocalCity ?? DEFAULT_LOCAL_CITY}
              </span>
            </div>
          </div>
          <div className="trending-card-top-meta">
            {options?.rankLabel ? (
              <span className="chip trending-rank-badge news-card-rank-badge">
                {options.rankLabel}
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href={`/article/${articleRouteId}/`}
          className="article-link"
          onClick={(event) => {
            void handlePrimaryArticleOpen(event, article);
          }}
        >
          <div className="news-card-body news-card-body-text-only">
            <div className="news-card-copy">
              <div className="trending-title-row">
                <h3 className="trending-article-title">{cleanDisplayText(article.title)}</h3>
              </div>
              {article.description ? (
                <p className="article-card-summary">
                  {cleanDisplayText(article.description)
                    .split(/(?<=[.!?])\s+/)
                    .slice(0, 2)
                    .join(" ")
                    .trim()}
                </p>
              ) : null}
            </div>
          </div>
        </Link>
        <div className="news-card-footer">
          <span className="trending-published-date news-card-footer-date feed-meta-inline">
            <span>{publishedLabel}</span>
            <span className="feed-meta-inline-group">
              <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
              </svg>
              <span>{article.likes}</span>
            </span>
            <span className="feed-meta-inline-group">
              <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
              </svg>
              <span>{article.comments.length}</span>
            </span>
            <span className="feed-meta-inline-group">
              <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                <path d="M6 4.5h12A1.5 1.5 0 0 1 19.5 6v14l-7.5-4-7.5 4V6A1.5 1.5 0 0 1 6 4.5Z" />
              </svg>
              <span>{article.saved ? "Saved" : "Save"}</span>
            </span>
          </span>
        </div>
      </article>
    );
  };

  const renderArticleFeedCard = (
    article: Article,
    options?: {
      rankLabel?: string | null;
      showFreshnessTime?: boolean;
      categoryLabelOverride?: string | null;
    }
  ) => {
    try {
      const articleRouteId = getArticleRouteId(article);

      if (!articleRouteId || !isRenderableArticleRecord(article)) {
        return null;
      }

      const safeSourceName = getSafeSourceLabel(article.source);
      const safeCategoryName = getSafeCategoryLabel(article.category, article);
      const displayCategoryLabel =
        options?.categoryLabelOverride ?? getCategoryLabel(safeCategoryName);
      const displayImage = getArticleDisplayImage(article);
      const imageSrc = displayImage.src;
      const imageFailureKey = displayImage.failureKey ?? `${article.id}:none`;

      if (!imageSrc) {
        if (sortMode === "local") {
          return renderLocalTextOnlyArticleCard(article, {
            rankLabel: options?.rankLabel ?? null,
            sectionLabel: options?.categoryLabelOverride ?? safeCategoryName,
          });
        }
        console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
          section: options?.categoryLabelOverride ?? safeCategoryName,
          title: article.title,
          source: article.source,
        });
        if (isBroadSportsArticle(article)) {
          console.log("SPORTS CARD HIDDEN NO IMAGE", {
            section: options?.categoryLabelOverride ?? safeCategoryName,
            title: article.title,
            source: article.source,
          });
        }
        return null;
      }

      const hasFailedImage = Boolean(failedArticleImages[imageFailureKey]);

      if (hasFailedImage) {
        if (sortMode === "local") {
          return renderLocalTextOnlyArticleCard(article, {
            rankLabel: options?.rankLabel ?? null,
            sectionLabel: options?.categoryLabelOverride ?? safeCategoryName,
          });
        }
        console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
          section: options?.categoryLabelOverride ?? safeCategoryName,
          title: article.title,
          source: article.source,
        });
        if (isBroadSportsArticle(article)) {
          console.log("SPORTS CARD HIDDEN NO IMAGE", {
            section: options?.categoryLabelOverride ?? safeCategoryName,
            title: article.title,
            source: article.source,
          });
        }
        return null;
      }

      const publishedLabel = options?.showFreshnessTime
        ? formatFreshnessTime(article.publishedAt, article.time)
        : formatPublishedDate(article.publishedAt, article.time);
      if (isBroadSportsArticle(article) && !isSportsBettingAd(article)) {
        console.log("SPORTS CARD IMAGE SRC", {
          title: cleanDisplayText(article.title),
          source: safeSourceName,
          imageSrc,
        });
      }

      const visualBoxNode = (
        <div className="article-thumb-shell article-card-visual-shell" aria-hidden="true">
          <img
            src={imageSrc}
            alt={cleanDisplayText(article.title)}
            className="article-thumb-image article-card-visual-image"
            loading="lazy"
            decoding="async"
            onError={() => {
              setFailedArticleImages((prev) => {
                if (prev[imageFailureKey]) {
                  return prev;
                }

                return {
                  ...prev,
                  [imageFailureKey]: true,
                };
              });
            }}
          />
        </div>
      );

      return (
        <article
          className={`news-card ${options?.rankLabel ? "news-card-has-rank" : ""}`}
          onContextMenu={(event) => {
            event.preventDefault();
            openLongPressMenu(article);
          }}
          onTouchStart={() => {
            clearArticleLongPressTimer();
            articleLongPressTimerRef.current = window.setTimeout(() => {
              openLongPressMenu(article);
            }, 420);
          }}
          onTouchEnd={clearArticleLongPressTimer}
          onTouchCancel={clearArticleLongPressTimer}
          onTouchMove={clearArticleLongPressTimer}
        >
          <div className="news-card-top-row news-card-top-row-brand">
            <div className="trending-source-stack trending-source-stack-primary">
              {sortMode === "local" ? (
                <div className="trending-source-brand trending-source-brand-static">
                  <SourceHeaderMark
                    sourceName={safeSourceName}
                    className="trending-source-header-mark"
                    fallbackMode="text"
                  />
                  <span className="trending-source-category-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="trending-source-category-inline">
                    {displayCategoryLabel}
                  </span>
                </div>
              ) : (
                <Link
                  href={`/source/${slugifySourceName(safeSourceName)}/`}
                  className="source-trigger source-trigger-tight trending-source-button"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <div className="trending-source-brand">
                    <SourceHeaderMark
                      sourceName={safeSourceName}
                      className="trending-source-header-mark"
                      fallbackMode="text"
                    />
                    <span className="trending-source-category-separator" aria-hidden="true">
                      ·
                    </span>
                    <span className="trending-source-category-inline">
                      {displayCategoryLabel}
                    </span>
                  </div>
                </Link>
              )}
            </div>
            <div className="trending-card-top-meta">
              {options?.rankLabel ? (
                <span className="chip trending-rank-badge news-card-rank-badge">
                  {options.rankLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={`/article/${articleRouteId}/`}
            className="article-link"
            onClick={(event) => {
              void handlePrimaryArticleOpen(event, article);
            }}
          >
            <div className="news-card-body news-card-body-with-thumb news-card-body-compact">
              <div className="news-card-copy">
                <div className="trending-title-row">
                  <h3 className="trending-article-title">
                    {cleanDisplayText(article.title)}
                  </h3>
                </div>
                {article.description ? (
                  <p className="article-card-summary">
                    {cleanDisplayText(article.description)
                      .split(/(?<=[.!?])\s+/)
                      .slice(0, 2)
                      .join(" ")
                      .trim()}
                  </p>
                ) : null}
              </div>
              {visualBoxNode}
            </div>
          </Link>
          <div className="news-card-footer">
            <span className="trending-published-date news-card-footer-date feed-meta-inline">
              <span>{publishedLabel}</span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                </svg>
                <span>{article.likes}</span>
              </span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                </svg>
                <span>{article.comments.length}</span>
              </span>
            </span>
          </div>
        </article>
      );
    } catch (error) {
      console.error("TRENDING CARD RENDER ERROR", error);

      return (
        <article className={`news-card ${options?.rankLabel ? "news-card-has-rank" : ""}`}>
          <div className="news-card-top-row news-card-top-row-brand">
            <div className="trending-source-stack trending-source-stack-primary">
              <div className="trending-source-brand">
                <SourceBadge sourceName={getSafeSourceLabel(article.source)} />
                <span className="trending-source-name">{getDisplaySourceLabel(article)}</span>
              </div>
            </div>
            <div className="trending-card-top-meta">
              {options?.rankLabel ? (
                <span className="chip trending-rank-badge news-card-rank-badge">
                  {options.rankLabel}
                </span>
              ) : null}
              <span className="chip chip-accent trending-category-pill trending-category-pill-top">
                {getCategoryLabel(getSafeCategoryLabel(article.category, article))}
              </span>
            </div>
          </div>
          <Link
            href={`/article/${article.id}/`}
            className="article-link"
            onClick={(event) => {
              void handlePrimaryArticleOpen(event, article);
            }}
          >
            <div className="news-card-body news-card-body-text-only">
              <div className="news-card-copy">
                <h3 className="trending-article-title">{cleanDisplayText(article.title)}</h3>
              </div>
            </div>
          </Link>
          <div className="news-card-footer">
            <span className="trending-published-date feed-meta-inline">
              <span>
                {options?.showFreshnessTime
                  ? formatFreshnessTime(article.publishedAt, article.time)
                  : formatPublishedDate(article.publishedAt, article.time)}
              </span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                </svg>
                <span>{article.likes}</span>
              </span>
              <span className="feed-meta-inline-group">
                <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                  <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                </svg>
                <span>{article.comments.length}</span>
              </span>
            </span>
          </div>
        </article>
      );
    }
  };

  const getLargeImageCardImage = (article: Article) => {
    const displayImage = getArticleDisplayImage(article, { largeCard: true });

    if (!displayImage.src || !displayImage.kind) {
      return null;
    }

    const failureKey = displayImage.failureKey ?? `${article.id}:none`;
    const hasFailedImage =
      displayImage.kind === "real"
        ? Boolean(failedArticleImages[failureKey])
        : Boolean(failedArticleBoxImages[failureKey]);

    if (hasFailedImage) {
      return null;
    }

    return {
      src: displayImage.src,
      failureKey,
      kind: displayImage.kind,
    };
  };

  const renderLargeImageArticleCard = (
    article: Article,
    options?: { imageSrcOverride?: string | null }
  ) => {
    const articleRouteId = getArticleRouteId(article);

    if (!articleRouteId || !isRenderableArticleRecord(article)) {
      return null;
    }

    const realImage = options?.imageSrcOverride
      ? {
          src: options.imageSrcOverride,
          failureKey: `${article.id}:override:${options.imageSrcOverride}`,
          kind: "real" as const,
        }
      : getLargeImageCardImage(article);

    if (!realImage) {
      return null;
    }

    const safeSourceName = getSafeSourceLabel(article.source);
    const summaryText = article.description
      ? cleanDisplayText(article.description)
          .split(/(?<=[.!?])\s+/)
          .slice(0, 3)
          .join(" ")
          .trim()
      : null;

    return (
      <LargeImageArticleCard
        href={`/article/${articleRouteId}/`}
        sourceContent={
          <Link
            href={`/source/${slugifySourceName(safeSourceName)}/`}
            className="source-trigger source-trigger-tight large-image-article-card-source-link"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <SourceHeaderMark sourceName={safeSourceName} fallbackMode="text" />
          </Link>
        }
        publishedLabel={formatFreshnessTime(article.publishedAt, article.time)}
        title={cleanDisplayText(article.title)}
        summary={summaryText}
        imageSrc={realImage.src}
        imageAlt={cleanDisplayText(article.title)}
        likes={article.likes}
        commentsCount={article.comments.length}
        onOpen={(event) => {
          void handlePrimaryArticleOpen(event, article);
        }}
        onImageError={() => {
          if (realImage.kind === "real") {
            setFailedArticleImages((prev) => {
              if (prev[realImage.failureKey]) {
                return prev;
              }

              return {
                ...prev,
                [realImage.failureKey]: true,
              };
            });
            return;
          }

          setFailedArticleBoxImages((prev) => {
            if (prev[realImage.failureKey]) {
              return prev;
            }

            return {
              ...prev,
              [realImage.failureKey]: true,
            };
          });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openLongPressMenu(article);
        }}
        onTouchStart={() => {
          clearArticleLongPressTimer();
          articleLongPressTimerRef.current = window.setTimeout(() => {
            openLongPressMenu(article);
          }, 420);
        }}
        onTouchEnd={clearArticleLongPressTimer}
        onTouchCancel={clearArticleLongPressTimer}
        onTouchMove={clearArticleLongPressTimer}
      />
    );
  };

  const renderArticleSectionWithLargeLead = (
    articles: Article[],
    options?: {
      limit?: number;
      showFreshnessTime?: boolean;
      categoryLabelOverride?: string | null;
      excludeLeadArticleKey?: string | null;
    }
  ) => {
    const filteredArticles = articles
      .filter((article) =>
        options?.excludeLeadArticleKey
          ? getArticleDeduplicationKey(article) !== options.excludeLeadArticleKey
          : true
      );
    const limitedArticles = filteredArticles.slice(0, options?.limit ?? 6);
    const leadArticle = filteredArticles.find((article) => Boolean(getLargeImageCardImage(article))) ?? null;
    const remainingArticles = leadArticle
      ? limitedArticles.filter(
          (article) => getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
        )
      : limitedArticles;

    return (
      <div className="stack home-section-list" role="list">
        {leadArticle ? (
          <div key={`large-${leadArticle.id || leadArticle.url || getArticleDeduplicationKey(leadArticle)}`} role="listitem">
            {renderLargeImageArticleCard(leadArticle)}
          </div>
        ) : null}
        {remainingArticles.map((article) => (
          <div key={article.id || article.url || getArticleDeduplicationKey(article)} role="listitem">
            {renderArticleFeedCard(article, {
              showFreshnessTime: options?.showFreshnessTime,
              categoryLabelOverride: options?.categoryLabelOverride,
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderStandardArticleSection = (
    articles: Article[],
    options?: {
      limit?: number;
      showFreshnessTime?: boolean;
      categoryLabelOverride?: string | null;
      excludeArticleKey?: string | null;
    }
  ) => {
    const limitedArticles = articles
      .filter((article) =>
        options?.excludeArticleKey
          ? getArticleDeduplicationKey(article) !== options.excludeArticleKey
          : true
      )
      .slice(0, options?.limit ?? 6);

    return (
      <div className="stack home-section-list" role="list">
        {limitedArticles.map((article) => (
          <div key={article.id || article.url || getArticleDeduplicationKey(article)} role="listitem">
            {renderArticleFeedCard(article, {
              showFreshnessTime: options?.showFreshnessTime,
              categoryLabelOverride: options?.categoryLabelOverride,
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderRankedCompactArticleSection = (
    articles: Article[],
    options?: {
      limit?: number;
      excludeArticleKey?: string | null;
    }
  ) => {
    const limitedArticles = articles
      .filter((article) =>
        options?.excludeArticleKey
          ? getArticleDeduplicationKey(article) !== options.excludeArticleKey
          : true
      )
      .slice(0, options?.limit ?? 5);

    return (
      <div className="stack home-section-list top-trending-card-rail top-trending-list-rail" role="list">
        {limitedArticles.map((article, index) => (
          <div key={article.id || article.url || getArticleDeduplicationKey(article)} role="listitem">
            {renderCompactSideImageArticle(article, { showRank: index + 1 })}
          </div>
        ))}
      </div>
    );
  };

  const renderGroupedSportsArticleSections = (
    sections: Array<{
      key: string;
      label: string;
      leadArticle: Article | null;
      articles: Article[];
    }>
  ) => {
    if (sections.length === 0) {
      return null;
    }

    return (
      <div className="stack home-section-list" style={{ gap: "18px" }}>
        {sections.map((section) => {
          const leadArticleKey = section.leadArticle
            ? getArticleDeduplicationKey(section.leadArticle)
            : null;

          return (
            <section
              key={`sports-grouped-${section.key}`}
              className="home-section-block home-section-plain"
            >
              <div className="home-section-header">
                <div className="stack" style={{ gap: "4px" }}>
                  <strong className="profile-section-title sports-subsection-title">
                    {section.label}
                  </strong>
                </div>
              </div>

              <div className="stack home-section-list top-trending-card-rail">
                {section.leadArticle ? renderLargeImageArticleCard(section.leadArticle) : null}
                {renderRankedCompactArticleSection(section.articles, {
                  limit: 5,
                  excludeArticleKey: leadArticleKey,
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderQuickWatchRow = (
    compact = false,
    useUniformTallFrame = false,
    useUniformWideFrame = false,
    title = "Quick Watch"
  ) => {
    if (title === todayLabel) {
      console.log("TRENDING_DATE_LABEL_RENDERED", title);
    }

    if (myNewsQuickWatchVideos.length === 0) {
      return (
        <section
          className={`home-section-block home-section-plain quick-watch-row ${
            compact ? "quick-watch-row-compact" : ""
          }`.trim()}
        >
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">{title}</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
    }

    return (
      <section
        className={`home-section-block home-section-plain quick-watch-row ${
          compact ? "quick-watch-row-compact" : ""
        }`.trim()}
      >
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">{title}</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label={title}>
          {myNewsQuickWatchVideos.map((video) => (
            <div
              key={video.id}
              className={`quick-watch-item ${compact ? "quick-watch-item-compact" : ""}`.trim()}
              role="listitem"
            >
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`quickwatch:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`quickwatch:${video.id}`] = node;
                }}
                autoplayKey={`quickwatch:${video.id}`}
                previewDurationMs={compact ? null : 4000}
                label={title}
                hideActions
                useRelativeTime
                className={`video-card-inline quick-watch-video-card ${
                  useUniformTallFrame ? "quick-watch-video-card-unified" : ""
                } ${
                  compact ? "quick-watch-video-card-compact" : ""
                }`.trim()}
                useUniformTallFrame={useUniformTallFrame}
                useUniformWideFrame={useUniformWideFrame}
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderMyNewsCategoryVideosRow = (
    category: string,
    categoryVideos: VideoItem[]
  ) => {
    const isTechnologyRow = normalizeSelectedCategoryName(category) === "Tech";
    const isBusinessRow = normalizeSelectedCategoryName(category) === "Business";
    const isAutoRow = normalizeSelectedCategoryName(category) === "Auto";
    const isMlbRow = normalizeSelectedCategoryName(category) === "MLB";
    const isNflRow = normalizeSelectedCategoryName(category) === "NFL";
    const isNhlRow = normalizeSelectedCategoryName(category) === "NHL";
    const isMlsRow = normalizeSelectedCategoryName(category) === "MLS";
    const isCollegeBasketballRow = normalizeSelectedCategoryName(category) === "College Basketball";
    const isNascarRow = normalizeSelectedCategoryName(category) === "NASCAR";
    const isCelebrityRow = normalizeSelectedCategoryName(category) === "Celebrity";
    const isPoliticsRow = normalizeSelectedCategoryName(category) === "Politics";
    const isWorldRow = normalizeSelectedCategoryName(category) === "World";
    if (TECH_VIDEOS_DISABLED && isTechnologyRow) {
      return null;
    }
    if (CELEBRITY_VIDEOS_DISABLED && isCelebrityRow) {
      return null;
    }
    if (isNascarRow && NASCAR_VIDEOS_DISABLED) {
      console.log("NASCAR VIDEOS DISABLED");
      return null;
    }
    if (isMlbRow && MLB_VIDEOS_DISABLED) {
      console.log("MLB VIDEOS DISABLED");
      return null;
    }
    if (isNflRow && NFL_VIDEOS_DISABLED) {
      console.log("NFL VIDEOS DISABLED");
      return null;
    }
    if (isNhlRow && NHL_VIDEOS_DISABLED) {
      console.log("NHL VIDEOS DISABLED");
      return null;
    }
    if (isMlsRow && MLS_VIDEOS_DISABLED) {
      console.log("MLS VIDEOS DISABLED");
      return null;
    }
    if (isCollegeBasketballRow && COLLEGE_BASKETBALL_VIDEOS_DISABLED) {
      console.log("COLLEGE_BASKETBALL_VIDEOS_DISABLED");
      return null;
    }
    if (isBusinessRow || (AUTO_VIDEOS_DISABLED && isAutoRow)) {
      if (isAutoRow) {
        console.log("AUTO VIDEOS DISABLED");
      }
      return null;
    }
    const videosToRender = isDedicatedMlbCategory(category)
      ? categoryVideos.filter((video) => isDedicatedMlbVideo(video))
      : isTechnologyRow
        ? categoryVideos.filter((video) => isStrictTechnologyVideo(video))
      : isPoliticsRow
        ? categoryVideos.filter((video) => isStrictPoliticsVideo(video))
      : isWorldRow
        ? categoryVideos.filter((video) => isStrictWorldVideo(video))
      : categoryVideos;

    if (!isTechnologyRow && !isPoliticsRow && !isWorldRow && videosToRender.length === 0) {
      return null;
    }

    return (
      <CategoryVideoRow
        category={category}
        videos={videosToRender}
        videoStatus={myNewsCategoryVideoStatus[category]}
        activeTechnologyVideoKey={activeMyNewsTechVideoKey}
        autoplayTrendingVideoKeys={autoplayTrendingVideoKeys}
        onToggleLike={handleToggleVideoLike}
        onToggleSave={handleToggleVideoSave}
        onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
        onOpenPlayer={(videoId, nextCategory) =>
          handleOpenFeedVideo(videoId, resolveMyNewsCategoryVideoTab(nextCategory))
        }
        setFrameRef={(autoplayKey, node) => {
          trendingVideoFrameRefs.current[autoplayKey] = node;
        }}
      />
    );
  };

  const scrollSectionIntoView = (sectionRef: RefObject<HTMLElement | null>) => {
    sectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const renderAddMoreCategoriesRow = () => {
    const availableCategories = CATEGORY_OPTIONS.filter((category) => !categories.includes(category)).slice(
      0,
      10
    );

    if (availableCategories.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Add More Categories</strong>
            <span className="muted">Tap categories to expand your personalized feed.</span>
          </div>
        </div>

        <div className="category-swipe-row" role="list" aria-label="Add more categories">
          {availableCategories.map((category, index) => (
            <button
              key={`mynews-extra-${category}`}
              type="button"
              role="listitem"
              className="category-swipe-card"
              onClick={() => void handleQuickToggleCategory(category)}
              disabled={isSavingCategories}
            >
              <span
                className={`category-swipe-card-art category-art-${index % 8}`}
                style={getCategorySwipeArtStyle(category, index)}
                aria-hidden="true"
              />
              <span className="category-swipe-card-label">{getCategoryLabel(category)}</span>
              <span className="category-swipe-card-meta">
                {userId ? "Tap to add" : "Log in to add"}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderMyNewsCategorySeparator = (index: number, category: string) => {
    const separatorCycle = index % 3;
    const categorySuggestions = myNewsCategorySourceSuggestions[category] ?? [];
    const trendingTopicArticles = myNewsTrendingTopicsArticles[category] ?? [];

    if (separatorCycle === 0) {
      return renderAddMoreCategoriesRow();
    }

    if (separatorCycle === 1 && categorySuggestions.length > 0) {
      return (
        <section className="home-section-block home-section-plain mynews-separator-section">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">
                Because You Follow {getCategoryLabel(category)}
              </strong>
              <span className="muted">Recommended sources connected to your topics.</span>
            </div>
          </div>
          <div className="source-rankings-carousel" role="list" aria-label="Recommended sources">
            {categorySuggestions.map((sourceName, sourceIndex) => (
              <Link
                key={`mynews-separator-source-${category}-${sourceName}`}
                href={`/source/${slugifySourceName(sourceName)}/`}
                className="source-rankings-card"
                role="listitem"
              >
                <div className="source-rankings-card-art-shell">
                  <SourceBadge sourceName={sourceName} className="source-rankings-card-art" />
                </div>
                <div className="source-rankings-card-copy">
                  <span className="source-rankings-rank">#{sourceIndex + 1}</span>
                  <span className="source-rankings-name">{sourceName}</span>
                  <span className="source-rankings-card-meta">Recommended Source</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      );
    }

    if (trendingTopicArticles.length > 0) {
      return (
        <section className="home-section-block home-section-plain mynews-separator-section">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Trending in Your Topics</strong>
              <span className="muted">Fresh stories tied to what you follow.</span>
            </div>
          </div>
          <div className="stack home-section-list top-trending-card-rail top-trending-list-rail">
            {trendingTopicArticles.map((article, articleIndex) => (
              <div
                key={`mynews-topics-${category}-${article.id || article.url || getArticleDeduplicationKey(article)}`}
              >
                {renderCompactSideImageArticle(article, { showRank: articleIndex + 1 })}
              </div>
            ))}
          </div>
        </section>
      );
    }

    return null;
  };

  const renderFeaturedStoriesRow = () => {
    const rowArticles = myNewsFeaturedArticles;

    if (rowArticles.length === 0) {
      return null;
    }

    const usedImageSources = new Set<string>();

    return (
      <section className="home-section-block home-section-plain featured-stories-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Featured Articles</strong>
          </div>
        </div>
        <div className="featured-stories-scroll" role="list" aria-label="Featured articles">
          {rowArticles.map((article) => {
            const displayImage = getArticleDisplayImage(article);
            const imageSrc =
              displayImage.src && !usedImageSources.has(displayImage.src)
                ? displayImage.src
                : null;

            if (imageSrc) {
              usedImageSources.add(imageSrc);
            } else {
              console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
                section: "Featured Articles",
                title: article.title,
                source: article.source,
              });
            }

            return renderFeaturedStoryTile(article, {
              keyPrefix: "featured",
            });
          })}
        </div>
      </section>
    );
  };

  const renderBreakingNewsRow = () => {
    if (breakingNewsPreviewArticles.length === 0) {
      return null;
    }

    const leadBreakingArticle = breakingLeadCard?.article ?? null;
    const leadBreakingImageOverride = breakingLeadCard?.imageSrcOverride ?? null;
    const rankedBreakingArticles = leadBreakingArticle
      ? breakingNewsPreviewArticles
          .filter(
            (article) =>
              getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadBreakingArticle)
          )
          .slice(0, 4)
      : breakingNewsPreviewArticles.slice(0, 5);

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title breaking-news-title">
              Breaking News
            </strong>
          </div>
        </div>
        <div className="stack home-section-list top-trending-card-rail top-trending-list-rail">
          {leadBreakingArticle
            ? renderLargeImageArticleCard(leadBreakingArticle, {
                imageSrcOverride: leadBreakingImageOverride,
              })
            : null}
          {rankedBreakingArticles.map((article, index) => (
            <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
              {renderCompactSideImageArticle(article, {
                showRank: leadBreakingArticle ? index + 2 : index + 1,
              })}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderNewsClipsRow = () => {
    if (primaryNewsClipVideos.length === 0) {
      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">News Clips</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">News Clips</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="News clips">
          {primaryNewsClipVideos.map((video) => (
            <div key={`news-clips-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`news-clips:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`news-clips:${video.id}`] = node;
                }}
                autoplayKey={`news-clips:${video.id}`}
                previewDurationMs={4000}
                label="News Clip"
                className="video-card-inline quick-watch-video-card"
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderFeaturedStoryTile = (
    article: Article,
    options?: {
      keyPrefix?: string;
      className?: string;
    }
  ) => {
    const articleRouteId = getArticleRouteId(article);
    const imageSrc = getArticleDisplayImage(article).src;
    const safeSourceName = getSafeSourceLabel(article.source);

    if (!articleRouteId || !imageSrc) {
      console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
        section: "Featured Stories",
        title: article.title,
        source: article.source,
      });
      return null;
    }

    return (
      <Link
        key={`${options?.keyPrefix ?? "featured"}-${article.id || article.url || getArticleDeduplicationKey(article)}`}
        href={`/article/${articleRouteId}/`}
        className={`featured-story-card ${options?.className ?? ""}`.trim()}
        role="listitem"
        onClick={(event) => {
          void handlePrimaryArticleOpen(event, article);
        }}
      >
        <img
          src={imageSrc}
          alt={cleanDisplayText(article.title)}
          className="featured-story-image"
          loading="lazy"
          decoding="async"
        />
        <div className="featured-story-overlay" />
        <div className="featured-story-copy">
          <span className="featured-story-source">{safeSourceName}</span>
          <h3 className="featured-story-title">{cleanDisplayText(article.title)}</h3>
        </div>
      </Link>
    );
  };

  const renderSourceRankingArt = (sourceName: string, rank: number) => {
    const boxLogoUrl = getSourceBoxLogoUrl(sourceName);
    const boxLogoFailureKey = boxLogoUrl ? `${sourceName}:source-ranking:${boxLogoUrl}` : `${sourceName}:source-ranking:none`;
    const shouldUseBoxLogo = Boolean(boxLogoUrl) && !failedArticleBoxImages[boxLogoFailureKey];

    return (
      <>
        <div className="source-rankings-card-art-shell">
          {shouldUseBoxLogo && boxLogoUrl ? (
            <div className="source-rankings-card-art-logo-wrap">
              <img
                src={boxLogoUrl}
                alt={`${sourceName} logo`}
                className="source-rankings-card-art-logo"
                loading="lazy"
                decoding="async"
                onError={() => {
                  setFailedArticleBoxImages((prev) => {
                    if (prev[boxLogoFailureKey]) {
                      return prev;
                    }

                    return {
                      ...prev,
                      [boxLogoFailureKey]: true,
                    };
                  });
                }}
              />
            </div>
          ) : (
            <SourceBadge sourceName={sourceName} className="source-rankings-card-art" />
          )}
        </div>
        <span className="source-rankings-rank">#{rank}</span>
      </>
    );
  };

  const renderEntertainmentMovieSlider = (
    movieItems: TheaterMovieItem[],
    fallbackArticles: Article[]
  ) => {
    const useMovieItems = movieItems.length >= 2;
    const cards = useMovieItems ? movieItems : fallbackArticles;

    if (cards.length < 2) {
      console.log("MOVIES SLIDER RENDERED", false);
      return null;
    }

    console.log("MOVIES SLIDER RENDERED", true);

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Movies In Theaters</strong>
          </div>
        </div>
        <div className="popular-music-scroll" role="list" aria-label="Movies in theaters">
          {useMovieItems
            ? movieItems.map((movie) => {
                const score = getTheaterMovieScore(movie);

                return (
                  <div
                    key={`ent-movie-slider-${movie.id}`}
                    className="popular-music-card"
                    role="listitem"
                  >
                    <div className="popular-music-card-art-shell">
                      <img
                        src={movie.imageUrl}
                        alt={movie.title}
                        className="popular-music-card-art"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="popular-music-rank">#{movie.rank}</span>
                    </div>
                    <div className="popular-music-card-copy">
                      <strong className="popular-music-card-title">{movie.title}</strong>
                      <span className="popular-music-card-artist">
                        {movie.releaseDate ? `${movie.releaseDate.slice(0, 4)} · ${movie.sourceLabel}` : movie.sourceLabel}
                      </span>
                      {score ? (
                        <span
                          className="chip chip-accent"
                          style={{ width: "fit-content", marginTop: "6px" }}
                        >
                          {score.label}: {score.value}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            : fallbackArticles.map((article, index) => {
                const articleRouteId = getArticleRouteId(article);
                const imageSrc = getArticleDisplayImage(article).src;
                const score = getEntertainmentMovieScore(article);

                if (!articleRouteId || !imageSrc) {
                  console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
                    section: "Movies In Theaters",
                    title: article.title,
                    source: article.source,
                  });
                  return null;
                }

                return (
                  <Link
                    key={`ent-movie-slider-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                    href={`/article/${articleRouteId}/`}
                    className="popular-music-card"
                    role="listitem"
                    onClick={(event) => {
                      void handlePrimaryArticleOpen(event, article);
                    }}
                  >
                    <div className="popular-music-card-art-shell">
                      <img
                        src={imageSrc}
                        alt={cleanDisplayText(article.title)}
                        className="popular-music-card-art"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="popular-music-rank">#{index + 1}</span>
                    </div>
                    <div className="popular-music-card-copy">
                      <strong className="popular-music-card-title">{cleanDisplayText(article.title)}</strong>
                      <span className="popular-music-card-artist">{getSafeSourceLabel(article.source)}</span>
                      {score ? (
                        <span
                          className="chip chip-accent"
                          style={{ width: "fit-content", marginTop: "6px" }}
                        >
                          {score.label}: {score.value}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
        </div>
      </section>
    );
  };

  const renderPopularMusicSlider = (
    albumItems: PopularMusicAlbum[],
    fallbackArticles: Article[]
  ) => {
    const useAlbumItems = albumItems.length >= 3;
    const cards = useAlbumItems ? albumItems : fallbackArticles;

    if (cards.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Popular Music</strong>
          </div>
        </div>
        <div className="popular-music-scroll" role="list" aria-label="Popular music">
          {useAlbumItems
            ? albumItems.map((album) => (
                <a
                  key={`popular-music-album-${album.id}`}
                  href={album.url ?? "#"}
                  className="popular-music-card"
                  role="listitem"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="popular-music-card-art-shell">
                    <img
                      src={album.imageUrl}
                      alt={album.title}
                      className="popular-music-card-art"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="popular-music-rank">#{album.rank}</span>
                  </div>
                  <div className="popular-music-card-copy">
                    <strong className="popular-music-card-title">{album.title}</strong>
                    <span className="popular-music-card-artist">{album.artist}</span>
                  </div>
                </a>
              ))
            : fallbackArticles.map((article, index) => {
                const articleRouteId = getArticleRouteId(article);
                const imageSrc = getArticleDisplayImage(article).src;
                const musicMeta = getEntertainmentPopularMusicCardMeta(article);

                if (!articleRouteId || !imageSrc) {
                  console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
                    section: "Popular Music",
                    title: article.title,
                    source: article.source,
                  });
                  return null;
                }

                return (
                  <Link
                    key={`popular-music-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                    href={`/article/${articleRouteId}/`}
                    className="popular-music-card"
                    role="listitem"
                    onClick={(event) => {
                      void handlePrimaryArticleOpen(event, article);
                    }}
                  >
                    <div className="popular-music-card-art-shell">
                      <img
                        src={imageSrc}
                        alt={musicMeta.title}
                        className="popular-music-card-art"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="popular-music-rank">#{index + 1}</span>
                    </div>
                    <div className="popular-music-card-copy">
                      <strong className="popular-music-card-title">{musicMeta.title}</strong>
                      <span className="popular-music-card-artist">{musicMeta.artist}</span>
                    </div>
                  </Link>
                );
              })}
        </div>
      </section>
    );
  };

  const renderFeaturedPodcastsSlider = (shows: TrendingPodcastCard[]) => {
    if (shows.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Featured Podcasts</strong>
          </div>
        </div>
        <div className="popular-music-scroll" role="list" aria-label="Featured podcasts">
          {shows.map((show) => {
            const imageCandidates = getTrendingPodcastImageCandidates(show);
            const imageUrl =
              imageCandidates.find(
                (candidate) => !failedTrendingPodcastImages[`${show.slug}:${candidate}`]
              ) ?? null;

            if (imageUrl?.startsWith("/podcast-covers/")) {
              console.log("PODCAST_LOCAL_COVER_USED", {
                slug: show.slug,
                imageUrl,
              });
            } else if (imageUrl) {
              console.log("PODCAST_REMOTE_COVER_USED", {
                slug: show.slug,
                imageUrl,
              });
            } else {
              console.log("PODCAST_COVER_MISSING", { slug: show.slug });
            }

            return (
              <Link
                key={`trending-podcast-${show.slug}`}
                href={`/podcasts/${show.slug}/`}
                className="popular-music-card"
                role="listitem"
              >
                <div className="popular-music-card-art-shell">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={show.title}
                      className="popular-music-card-art"
                      loading="lazy"
                      decoding="async"
                      onError={() => {
                        setFailedTrendingPodcastImages((prev) => ({
                          ...prev,
                          [`${show.slug}:${imageUrl}`]: true,
                        }));
                      }}
                    />
                  ) : (
                    <div className="podcast-card-art podcast-card-art-fallback popular-music-card-art">
                      <span>{show.title.slice(0, 1).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div className="popular-music-card-copy">
                  <strong className="popular-music-card-title">{show.title}</strong>
                  <span className="popular-music-card-artist">{show.publisher}</span>
                  <span className="popular-music-card-artist">{show.category}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  const renderBusinessStockTicker = () => {
    if (BUSINESS_STOCK_TICKER_DISABLED) {
      return null;
    }

    const tickerItems = businessTickerItems.filter(
      (item) => item.price !== null && Number.isFinite(item.price)
    );

    console.log("BUSINESS STOCK TICKER_ITEM_COUNT", tickerItems.length);
    console.log("BUSINESS TICKER FINAL COUNT", tickerItems.length);
    console.log("BUSINESS STOCK FALLBACK USED", false);
    console.log("BUSINESS STOCK ITEMS RENDERED", tickerItems);
    console.log("BUSINESS STOCK RENDERING", {
      count: tickerItems.length,
    });
    console.log("BUSINESS STOCK RENDER SUCCESS", tickerItems.length > 0);
    console.log("STOCK TICKER ITEMS COUNT", tickerItems.length);

    if (tickerItems.length === 0) {
      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Stock Market</strong>
            </div>
          </div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            API returned zero stock items
          </div>
          <div className="muted" style={{ fontSize: "0.74rem", marginTop: "6px" }}>
            STOCK ITEMS RENDERED: 0
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Stock Market</strong>
          </div>
        </div>
        <div className="popular-music-scroll" role="list" aria-label="Business stock ticker">
          {tickerItems.map((item) => {
            const isPositive = (item.change ?? 0) >= 0;
            const logoUrl = getBusinessTickerLogoUrl(item.symbol);
            const logoFailureKey = logoUrl ? `stock:${item.symbol}:${logoUrl}` : `stock:${item.symbol}:none`;
            const showLogo = Boolean(logoUrl) && !failedArticleBoxImages[logoFailureKey];

            console.log("STOCK LOGO LOAD ATTEMPT", {
              symbol: item.symbol,
              logoUrl,
              showLogo,
            });
            console.log("STOCK LOGO FILE USED", {
              symbol: item.symbol,
              logoUrl,
            });
            if (!showLogo) {
              console.log("STOCK LOGO FALLBACK_INITIALS_USED", item.symbol);
            }

            return (
              <div
                key={`stock-${item.symbol}`}
                className="popular-music-card"
                role="listitem"
              >
                <div className="popular-music-card-art-shell stock-ticker-logo-shell">
                  {showLogo && logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${item.symbol} logo`}
                      className="stock-ticker-logo-image"
                      loading="lazy"
                      decoding="async"
                      onError={() => {
                        setFailedArticleBoxImages((prev) => {
                          if (prev[logoFailureKey]) {
                            return prev;
                          }

                          return {
                            ...prev,
                            [logoFailureKey]: true,
                          };
                        });
                      }}
                    />
                  ) : (
                    <span className="stock-ticker-logo-fallback">
                      {getBusinessTickerInitials(item.symbol)}
                    </span>
                  )}
                </div>
                <div className="popular-music-card-copy">
                  <strong className="popular-music-card-title">{item.label}</strong>
                  <span className="popular-music-card-artist">{item.symbol}</span>
                  <strong className="popular-music-card-title">
                    ${Number(item.price ?? 0).toFixed(2)}
                  </strong>
                  <span
                    className="popular-music-card-artist"
                    style={{ color: isPositive ? "#16a34a" : "#dc2626" }}
                  >
                    {item.change !== null && item.percentChange !== null
                      ? `${isPositive ? "+" : ""}${item.change.toFixed(2)} (${isPositive ? "+" : ""}${item.percentChange.toFixed(2)}%)`
                      : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: "0.74rem", marginTop: "6px" }}>
          {`STOCK ITEMS RENDERED: ${tickerItems.length}`}
        </div>
      </section>
    );
  };

  const renderEntertainmentSectionVideo = (
    section: "gossip" | "music" | "tv" | "celebrity" | "movies",
    title: string,
    videosForSection: VideoItem[]
  ) => {
    const video = videosForSection[0];

    if (!video) {
      return null;
    }

    return (
      <div className="quick-watch-item" role="listitem" style={{ alignSelf: "center" }}>
        <VideoFeedCard
          video={video}
          isAutoplaying={
            autoplayTrendingVideoKeys.includes(`entertainment-${section}:${video.id}`) && !video.fallback
          }
          onToggleLike={handleToggleVideoLike}
          onToggleSave={handleToggleVideoSave}
          onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
          onOpenPlayer={(videoId) => router.push(`/video/${videoId}`)}
          frameRef={(node) => {
            trendingVideoFrameRefs.current[`entertainment-${section}:${video.id}`] = node;
          }}
          autoplayKey={`entertainment-${section}:${video.id}`}
          previewDurationMs={null}
          label={title}
          className="video-card-inline quick-watch-video-card"
          useUniformTallFrame
          variant="article"
        />
      </div>
    );
  };

  const trendingWeatherLeadArticle = useMemo(() => {
    const candidateArticles = [...trendingWeatherSections.nationalWeather]
      .filter((article) => isStrictWeatherArticle(article))
      .sort((leftArticle, rightArticle) => {
        const rightScore =
          Number(Boolean(getLargeImageCardImage(rightArticle))) * 100 +
          getPublishedAtTimestamp(rightArticle.publishedAt);
        const leftScore =
          Number(Boolean(getLargeImageCardImage(leftArticle))) * 100 +
          getPublishedAtTimestamp(leftArticle.publishedAt);
        return rightScore - leftScore;
      });

    return candidateArticles.find((article) => Boolean(getLargeImageCardImage(article))) ?? null;
  }, [trendingWeatherSections.nationalWeather]);

  useEffect(() => {
    console.log(
      "WEATHER GLOBAL LARGE CARD SELECTED",
      trendingWeatherLeadArticle
        ? {
            title: trendingWeatherLeadArticle.title,
            source: trendingWeatherLeadArticle.source,
          }
        : null
    );
  }, [trendingWeatherLeadArticle]);

  const trendingSportsLeadArticle = useMemo(() => {
    const candidateArticles = sportsTabArticles
      .filter((article) => isBroadSportsArticle(article) && !isSportsBettingAd(article))
      .sort((leftArticle, rightArticle) => {
        const rightScore =
          getArticlePriorityScore(rightArticle) +
          Number(Boolean(getLargeImageCardImage(rightArticle))) * 80 +
          getPublishedAtTimestamp(rightArticle.publishedAt);
        const leftScore =
          getArticlePriorityScore(leftArticle) +
          Number(Boolean(getLargeImageCardImage(leftArticle))) * 80 +
          getPublishedAtTimestamp(leftArticle.publishedAt);
        return rightScore - leftScore;
      });

    return candidateArticles.find((article) => Boolean(getLargeImageCardImage(article))) ?? null;
  }, [sportsTabArticles]);

  const trendingOpinionLeadArticle = useMemo(() => {
    const selectedArticle = getOpinionLargeCardSelection(opinionTabArticles)?.article ?? null;
    console.log(
      "OPINION LARGE CARD SELECTED",
      selectedArticle
        ? {
            title: selectedArticle.title,
            source: selectedArticle.source,
          }
        : null
    );
    return selectedArticle;
  }, [opinionTabArticles]);

  const trendingCrimeLeadArticle = useMemo(() => {
    const selectedArticle = getCrimeLargeCardSelection(crimeTabArticles)?.article ?? null;
    console.log(
      "TRENDING_CRIME_LARGE_CARD_SELECTED",
      selectedArticle
        ? {
            title: selectedArticle.title,
            source: selectedArticle.source,
          }
        : null
    );
    return selectedArticle;
  }, [crimeTabArticles]);

  const trendingArtLeadArticle = useMemo(() => {
    const selectedArticle = getArtLargeCardSelection(artTabArticles)?.article ?? null;
    console.log(
      "TRENDING_ART_SECTION_RENDERED",
      selectedArticle
        ? {
            title: selectedArticle.title,
            source: selectedArticle.source,
            count: artTabArticles.length,
          }
        : { title: null, source: null, count: artTabArticles.length }
    );
    return selectedArticle;
  }, [artTabArticles]);

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    console.log("OPINION ARTICLE COUNT", opinionTabArticles.length);
  }, [opinionTabArticles.length, sortMode]);

  useEffect(() => {
    if (sortMode !== "trending") {
      return;
    }

    console.log("TRENDING_CRIME_ARTICLE_COUNT", crimeTabArticles.length);
  }, [crimeTabArticles.length, sortMode]);

  useEffect(() => {
    const realLargeCardCount = sportsTabArticles.filter(
      (article) =>
        isBroadSportsArticle(article) &&
        !isSportsBettingAd(article) &&
        Boolean(getLargeImageCardImageCandidate(article))
    ).length;

    console.log("SPORTS LARGE CARD REAL IMAGE COUNT", realLargeCardCount);
  }, [sportsTabArticles]);

  const renderBreakingFeaturedVideosRow = () => {
    if (trendingBreakingFeaturedVideos.length === 0) {
      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Featured Videos</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Featured Videos</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="Featured videos under breaking news">
          {trendingBreakingFeaturedVideos.map((video) => (
            <div key={`breaking-featured-videos-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`breaking-featured-videos:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`breaking-featured-videos:${video.id}`] = node;
                }}
                autoplayKey={`breaking-featured-videos:${video.id}`}
                previewDurationMs={null}
                label="Featured Video"
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card quick-watch-video-card-unified"
                useUniformTallFrame
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderTallTrendingQuickWatchRow = (
    title: string,
    videosForRow: VideoItem[],
    keyPrefix: string,
    playerTab: "news" | "sports" = "news"
  ) => {
    if (title === todayLabel) {
      console.log("TRENDING_DATE_LABEL_RENDERED", title);
    }

    if (videosForRow.length === 0) {
      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">{title}</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">{title}</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label={title}>
          {videosForRow.map((video) => (
            <div key={`${keyPrefix}-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`${keyPrefix}:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, playerTab)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`${keyPrefix}:${video.id}`] = node;
                }}
                autoplayKey={`${keyPrefix}:${video.id}`}
                previewDurationMs={null}
                label={title}
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card quick-watch-video-card-unified"
                useUniformTallFrame
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderFeaturedVideosBreak = (
    options?: {
      title?: string;
      keyPrefix?: string;
      playerTab?: "news" | "sports";
    }
  ) => {
    const title = options?.title ?? "Featured Videos";
    const keyPrefix = options?.keyPrefix ?? "featured-videos";
    const playerTab = options?.playerTab ?? "news";

    if (myNewsFeaturedVideos.length === 0) {
      return (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">{title}</strong>
            </div>
          </div>
          <div className="empty-state compact-empty-state">
            <strong>Videos loading…</strong>
          </div>
        </section>
      );
    }

    if (myNewsFeaturedVideos.length < 3) {
      const video = myNewsFeaturedVideos[0];

      if (!video) {
        return null;
      }

      return (
        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">{title}</strong>
            </div>
          </div>
          <div className="stack home-section-list">
            <div>
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`${keyPrefix}:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, playerTab)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`${keyPrefix}:${video.id}`] = node;
                }}
                autoplayKey={`${keyPrefix}:${video.id}`}
                previewDurationMs={null}
                label={title}
                className="video-card-inline featured-video-single-card quick-watch-video-card-unified"
                useUniformTallFrame
                variant="article"
              />
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">{title}</strong>
          </div>
        </div>
        <div className="quick-watch-scroll" role="list" aria-label="Featured videos">
          {myNewsFeaturedVideos.map((video) => (
            <div key={`${keyPrefix}-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`${keyPrefix}:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, playerTab)}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`${keyPrefix}:${video.id}`] = node;
                }}
                autoplayKey={`${keyPrefix}:${video.id}`}
                previewDurationMs={null}
                label={title}
                className="video-card-inline quick-watch-video-card quick-watch-video-card-unified"
                useUniformTallFrame
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderWeatherConditionIcon = (condition: string | null | undefined) => {
    const icon = getWeatherConditionIconLabel(condition);

    if (icon === "sun") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.55 5.45l-1.7 1.7M7.15 16.85l-1.7 1.7M18.55 18.55l-1.7-1.7M7.15 7.15l-1.7-1.7" />
        </svg>
      );
    }

    if (icon === "rain") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M7 18.2a4.2 4.2 0 1 1 .7-8.35A5.7 5.7 0 0 1 18.5 11a3.4 3.4 0 0 1-.3 6.8H7Z" />
          <path d="M8.5 19.3 7.4 21M12.1 19.3 11 21M15.7 19.3 14.6 21" />
        </svg>
      );
    }

    if (icon === "snow") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M7 17.8a4.1 4.1 0 1 1 .65-8.15A5.6 5.6 0 0 1 18.4 10.8a3.3 3.3 0 0 1-.25 6.6H7Z" />
          <path d="M9 19.2h0M12 20.4h0M15 19.2h0" />
        </svg>
      );
    }

    if (icon === "storm") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M7 17.7a4.1 4.1 0 1 1 .65-8.15A5.6 5.6 0 0 1 18.45 10.7a3.3 3.3 0 0 1-.25 6.6H7Z" />
          <path d="m11.2 18.1-1.1 2.5 2.15-.2-1.2 2.8 3.1-4.3-2.2.15 1.15-1.95" />
        </svg>
      );
    }

    if (icon === "wind") {
      return (
        <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
          <path d="M3 9.2h11.5a2.3 2.3 0 1 0-2.3-2.3" />
          <path d="M3 13.2h15.7a2.1 2.1 0 1 1-2.1 2.1" />
          <path d="M3 17.2h9.8a1.9 1.9 0 1 0-1.9 1.9" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24" className="weather-condition-icon" aria-hidden="true">
        <path d="M7.2 18.2a4.2 4.2 0 1 1 .7-8.35A5.7 5.7 0 0 1 18.7 11a3.5 3.5 0 0 1-.3 7.1H7.2Z" />
      </svg>
    );
  };

  const getFavoriteTeamInitials = (teamName: string) =>
    teamName
      .split(/\s+/)
      .filter((word) => !["fc", "cf", "sc", "city"].includes(word.toLowerCase()))
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");

  const handleToggleFavoriteTeam = (team: FavoriteTeamOption) => {
    if (!userId) {
      alert("Log in to save favorite teams.");
      return;
    }

    setFavoriteTeams((current) => {
      const alreadyFollowed = current.some((savedTeam) => savedTeam.team_id === team.team_id);

      if (alreadyFollowed) {
        return current.filter((savedTeam) => savedTeam.team_id !== team.team_id);
      }

      return [...current, team];
    });
  };

  const handleTeamLeagueSelect = (league: FavoriteLeagueKey) => {
    setActiveTeamLeague(league);
  };

  const renderFavoriteTeamBadge = (team: FavoriteTeamOption) => (
    <span className="favorite-team-logo-shell" aria-hidden="true">
      {team.logo_url ? (
        <img
          src={team.logo_url}
          alt={team.team_name}
          className="favorite-team-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="favorite-team-logo-fallback">{getFavoriteTeamInitials(team.team_name)}</span>
      )}
    </span>
  );

  const renderScoreTeamMark = (
    team: { name: string; logoUrl: string | null },
    className = ""
  ) => (
    <span className={`sports-score-team-mark ${className}`.trim()} aria-hidden="true">
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="sports-score-team-logo"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className="sports-score-team-fallback">{getFavoriteTeamInitials(team.name)}</span>
      )}
    </span>
  );

  const renderSportsScoreCard = (
    game: SportsScoreGame,
    options?: {
      role?: string;
      className?: string;
      layout?: "row" | "list";
    }
  ) => {
    const isInteractive = Boolean(game.boxScoreAvailable || game.playByPlayAvailable);
    const cardClassName = [
      "sports-score-card",
      options?.layout === "list" ? "sports-score-card-list" : "",
      isInteractive ? "sports-score-card-button" : "sports-score-card-static",
      options?.className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    const cardContent = (
      <>
        <div className="sports-score-card-top">
          <span className="sports-score-league">{game.league}</span>
          <span className={`sports-score-status sports-score-status-${game.status.toLowerCase()}`}>
            {getSportsScoreStatusLabel(game)}
          </span>
        </div>
        <div className="sports-score-team-row">
          <div className="sports-score-team-copy">
            {renderScoreTeamMark(game.awayTeam)}
            <span className="sports-score-team-name">{game.awayTeam.name}</span>
          </div>
          <strong className="sports-score-points">{game.awayTeam.score ?? "—"}</strong>
        </div>
        <div className="sports-score-team-row">
          <div className="sports-score-team-copy">
            {renderScoreTeamMark(game.homeTeam)}
            <span className="sports-score-team-name">{game.homeTeam.name}</span>
          </div>
          <strong className="sports-score-points">{game.homeTeam.score ?? "—"}</strong>
        </div>
        <div className="sports-score-meta">
          <span>{getSportsScoreMetaLabel(game)}</span>
        </div>
      </>
    );

    if (!isInteractive) {
      return (
        <article key={game.id} className={cardClassName} role={options?.role ?? "listitem"}>
          {cardContent}
        </article>
      );
    }

    return (
      <button
        key={game.id}
        type="button"
        className={cardClassName}
        role={options?.role ?? "listitem"}
        onClick={() => setSelectedSportsGame(game)}
      >
        {cardContent}
      </button>
    );
  };

  const renderSportsScoreRow = (
    games: SportsScoreGame[],
    leagueLabel: string,
    emptyLabel = "No games today"
  ) => {
    console.log("SPORTS SCORE CARD COUNT", {
      leagueLabel,
      count: games.length,
    });
    console.log(
      "SPORTS SCORE STATUS",
      games.map((game) => ({
        league: game.league,
        teams: `${game.awayTeam.name} at ${game.homeTeam.name}`,
        status: getSportsScoreStatusLabel(game),
        meta: getSportsScoreMetaLabel(game),
      }))
    );

    if (games.length === 0) {
      return (
        <div className="empty-state compact-empty-state">
          <strong>{emptyLabel}</strong>
          <span>Check back later for live or scheduled games.</span>
        </div>
      );
    }

    return (
      <div className="sports-scores-scroll" role="list" aria-label={`${leagueLabel} scores`}>
        {games.map((game) => renderSportsScoreCard(game))}
      </div>
    );
  };

  const renderExpandedScoresPage = () => {
    if (!expandedScoresLeague) {
      return null;
    }

    const leagueGames = sportsScoresDisplayByLeague[expandedScoresLeague] ?? [];
    const groupedGames = leagueGames.reduce<Record<string, SportsScoreGame[]>>((accumulator, game) => {
      const dateKey = game.scheduledAt
        ? new Intl.DateTimeFormat("en-US", {
            timeZone: APP_TIME_ZONE,
            weekday: "long",
            month: "short",
            day: "numeric",
          }).format(new Date(game.scheduledAt))
        : "Schedule";
      accumulator[dateKey] = [...(accumulator[dateKey] ?? []), game];
      return accumulator;
    }, {});

    return (
      <div
        className="favorite-teams-page-shell sports-scores-page-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scores-page-title"
      >
        <div className="favorite-teams-page favorite-teams-page-full">
        <div className="favorite-teams-page-header">
          <button
            type="button"
            className="icon-button favorite-teams-close"
            onClick={() => setExpandedScoresLeague(null)}
            aria-label="Close scores page"
          >
            ×
          </button>
          <strong id="scores-page-title" className="bottom-sheet-title favorite-teams-title">
            {expandedScoresLeague} Scores
          </strong>
          <span aria-hidden="true" className="favorite-teams-header-spacer" />
        </div>

        <div className="favorite-teams-page-content sports-scores-page-content">
          {Object.entries(groupedGames).map(([dateLabel, dateGames]) => (
            <section key={`${expandedScoresLeague}-${dateLabel}`} className="stack" style={{ gap: "12px" }}>
              <strong className="profile-section-title-sm">{dateLabel}</strong>
              <div className="sports-score-list" role="list" aria-label={`${dateLabel} ${expandedScoresLeague} games`}>
                {dateGames.map((game) =>
                  renderSportsScoreCard(game, {
                    layout: "list",
                  })
                )}
              </div>
            </section>
          ))}
        </div>
        </div>
      </div>
    );
  };

  const renderSportsGameDetailModal = () => {
    if (!selectedSportsGame) {
      return null;
    }

    return (
      <div
        className="source-sheet-overlay"
        role="presentation"
        onClick={() => setSelectedSportsGame(null)}
      >
        <div
          className="bottom-sheet source-sheet sports-game-detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sports-game-detail-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-handle" />
          <div className="bottom-sheet-header source-sheet-header">
            <div className="stack" style={{ gap: "6px" }}>
              <strong id="sports-game-detail-title" className="bottom-sheet-title">
                {selectedSportsGame.awayTeam.name} at {selectedSportsGame.homeTeam.name}
              </strong>
              <span className="muted">{selectedSportsGame.league} game detail</span>
            </div>
            <button
              type="button"
              className="icon-button source-sheet-close"
              onClick={() => setSelectedSportsGame(null)}
              aria-label="Close game detail"
            >
              ×
            </button>
          </div>

          <div className="sports-game-detail-scoreboard">
            <div className="sports-game-detail-team-row">
              <div className="sports-game-detail-team-copy">
                {renderScoreTeamMark(selectedSportsGame.awayTeam, "sports-game-detail-team-mark")}
                <strong>{selectedSportsGame.awayTeam.name}</strong>
              </div>
              <strong className="sports-game-detail-score">{selectedSportsGame.awayTeam.score ?? "—"}</strong>
            </div>
            <div className="sports-game-detail-team-row">
              <div className="sports-game-detail-team-copy">
                {renderScoreTeamMark(selectedSportsGame.homeTeam, "sports-game-detail-team-mark")}
                <strong>{selectedSportsGame.homeTeam.name}</strong>
              </div>
              <strong className="sports-game-detail-score">{selectedSportsGame.homeTeam.score ?? "—"}</strong>
            </div>
          </div>

          <div className="sports-game-detail-meta">
            <span className={`sports-score-status sports-score-status-${selectedSportsGame.status.toLowerCase()}`}>
              {selectedSportsGame.status}
            </span>
            <span>{selectedSportsGame.statusDetail ?? selectedSportsGame.shortDetail ?? "Status unavailable"}</span>
            <span>
              {selectedSportsGame.scheduledAt
                ? formatSportsGameTimeLabel(selectedSportsGame.scheduledAt)
                : "Scheduled time unavailable"}
            </span>
            {selectedSportsGame.venue ? <span>{selectedSportsGame.venue}</span> : null}
          </div>

          <div className="sports-game-detail-section">
            <strong>Box Score</strong>
            <span>
              {selectedSportsGame.boxScoreAvailable
                ? "Box score available."
                : "Box score/play-by-play unavailable for this game."}
            </span>
          </div>
          <div className="sports-game-detail-section">
            <strong>Play-by-Play</strong>
            <span>
              {selectedSportsGame.playByPlayAvailable
                ? "Play-by-play available."
                : "Box score/play-by-play unavailable for this game."}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const getSportsLeagueLargeCardArticle = (
    sectionKey: SportsSectionKey,
    sectionArticles: Article[]
  ) => {
    if (sectionArticles.length === 0) {
      if (["MLB", "NFL", "NHL", "MLS", "NBA", "COLLEGE_FOOTBALL", "COLLEGE_BASKETBALL", "MOTORSPORTS", "MMA", "MORE"].includes(sectionKey)) {
        console.log(`SPORTS LARGE CARD SELECTED ${sectionKey}`, null);
      }
      return null;
    }

    const mlbLargeCardSelection =
      sectionKey === "MLB" ? getMlbLargeCardSelection(sectionArticles) : null;
    const selectedArticle =
      sectionKey === "MLB"
        ? mlbLargeCardSelection && mlbLargeCardSelection.imageSrc !== "/category-images/mlb.png"
          ? mlbLargeCardSelection.article
          : null
        : sectionKey === "NFL"
          ? getNflLargeCardSelection(sectionArticles)
          : sectionKey === "NHL"
            ? getNhlLargeCardSelection(sectionArticles)
            : sectionKey === "MLS"
              ? getMlsLargeCardSelection(sectionArticles)
              : sectionKey === "NBA"
                ? sectionArticles
                    .map((article) => ({
                      article,
                      image: getLargeImageCardImageCandidate(article),
                      matches: matchesSportsSectionArticle(
                        article,
                        SPORTS_SECTION_CONFIGS.find((section) => section.key === "NBA")!
                      ),
                    }))
                    .find((candidate) => candidate.matches && candidate.image && !isSportsBettingAd(candidate.article))
                    ?.article ?? null
                : sectionKey === "COLLEGE_FOOTBALL"
                  ? getCollegeFootballLargeCardSelection(sectionArticles)
                  : sectionKey === "COLLEGE_BASKETBALL"
                    ? getCollegeBasketballLargeCardSelection(sectionArticles)
                    : sectionKey === "MOTORSPORTS"
                      ? getNascarLargeCardSelection(sectionArticles)
                      : sectionKey === "MMA"
                        ? sectionArticles
                            .map((article) => ({
                              article,
                              image: getLargeImageCardImageCandidate(article),
                              matches: isStrictFightingArticle(article),
                            }))
                            .find((candidate) => candidate.matches && candidate.image && !isSportsBettingAd(candidate.article))
                            ?.article ?? null
                        : sectionKey === "MORE"
                          ? getSportsLargeCardSelection(sectionArticles)
                          : null;
    const resolvedSelectedArticle =
      selectedArticle && "article" in selectedArticle ? selectedArticle.article : selectedArticle;

    if (["MLB", "NFL", "NHL", "MLS", "NBA", "COLLEGE_FOOTBALL", "COLLEGE_BASKETBALL", "MOTORSPORTS", "MMA", "MORE"].includes(sectionKey)) {
      console.log(`SPORTS LARGE CARD SELECTED ${sectionKey}`, resolvedSelectedArticle?.title ?? null);
    }

    return resolvedSelectedArticle;
  };

  const renderSportsLeagueVideos = (
    sectionKey: SportsSectionKey,
    label: string,
    leagueVideos: VideoItem[]
  ) => {
    if (sectionKey === "NHL") {
      console.log("NHL QUICK WATCH DISABLED");
      return null;
    }

    if (sectionKey === "NFL") {
      console.log("NFL QUICK WATCH DISABLED");
      return null;
    }

    if (sectionKey === "COLLEGE_FOOTBALL") {
      console.log("COLLEGE FOOTBALL QUICK WATCH REMOVED");
      return null;
    }

    const nbaRejectedWnbaCount =
      sectionKey === "NBA"
        ? leagueVideos.filter((video) =>
            /\b(wnba|women'?s basketball|college basketball|ncaa|high school basketball)\b/i.test(
              `${video.title} ${video.creator} ${video.category} ${video.watchUrl}`
            )
          ).length
        : 0;
    const filteredLeagueVideos =
      sectionKey === "MLB"
        ? leagueVideos.filter((video) => isStrictMlbVideo(video))
        : sectionKey === "NBA"
          ? leagueVideos.filter((video) => isStrictNbaVideo(video))
          : sectionKey === "MLS"
            ? leagueVideos.filter((video) => isStrictMlsVideo(video)).slice(0, 1)
            : leagueVideos;
    const shouldCenterMlbQuickWatch =
      sectionKey === "MLB" && filteredLeagueVideos.length > 0 && filteredLeagueVideos.length <= 2;
    const shouldCenterNbaQuickWatch =
      sectionKey === "NBA" && filteredLeagueVideos.length > 0 && filteredLeagueVideos.length <= 2;
    const shouldCenterFightingQuickWatch =
      sectionKey === "MMA" && filteredLeagueVideos.length > 0 && filteredLeagueVideos.length <= 2;

    if (sectionKey === "NBA") {
      console.log("NBA QUICK WATCH VALID COUNT", filteredLeagueVideos.length);
      console.log("NBA QUICK WATCH REMOVED WNBA", nbaRejectedWnbaCount);
    }

    if (sectionKey === "MLS") {
      console.log("MLS VIDEO VALID COUNT", filteredLeagueVideos.length);
      if (filteredLeagueVideos.length === 0) {
        console.log("MLS VIDEO SECTION HIDDEN");
        return null;
      }
    }

    if (shouldCenterMlbQuickWatch) {
      console.log("SPORTS MLB QUICK WATCH CENTERED", {
        count: filteredLeagueVideos.length,
      });
    }

    if (shouldCenterNbaQuickWatch) {
      console.log("NBA QUICK WATCH CENTERED", {
        count: filteredLeagueVideos.length,
      });
    }

    if (shouldCenterFightingQuickWatch) {
      console.log("FIGHTING QUICK WATCH CENTERED", {
        count: filteredLeagueVideos.length,
      });
    }

    if (filteredLeagueVideos.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">{label}</strong>
          </div>
        </div>
        <div
          className={`quick-watch-scroll ${
            shouldCenterMlbQuickWatch || shouldCenterNbaQuickWatch || shouldCenterFightingQuickWatch
              ? "quick-watch-scroll-centered"
              : ""
          }`.trim()}
          role="list"
          aria-label={`${label} videos`}
        >
          {filteredLeagueVideos.map((video, index) => (
            <div key={`${sectionKey}-video-${video.id}`} className="quick-watch-item" role="listitem">
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  (autoplayTrendingVideoKeys.includes(
                    `sports-${sectionKey.toLowerCase()}-quickwatch:${video.id}`
                  ) ||
                    (sectionKey === "MORE" && isMoreSportsVideosVisible && index === 0)) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "sports")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`sports-${sectionKey.toLowerCase()}-quickwatch:${video.id}`] = node;
                }}
                autoplayKey={`sports-${sectionKey.toLowerCase()}-quickwatch:${video.id}`}
                previewDurationMs={null}
                label={label}
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card"
                useUniformWideFrame
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderSportsHighlightsSection = () => {
    if (sportsHighlightsVideos.length === 0) {
      return null;
    }

    return (
      <section className="home-section-block home-section-plain quick-watch-row">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Quick Watch</strong>
          </div>
        </div>
        <div
          className="quick-watch-scroll quick-watch-scroll-centered"
          role="list"
          aria-label="Sports quick watch"
        >
          {sportsHighlightsVideos.map((video) => (
            <div
              key={`sports-highlights-${video.id}`}
              className="quick-watch-item quick-watch-item-compact"
              role="listitem"
            >
              <VideoFeedCard
                video={video}
                isAutoplaying={
                  autoplayTrendingVideoKeys.includes(`sports-highlights:${video.id}`) &&
                  !video.fallback
                }
                onToggleLike={handleToggleVideoLike}
                onToggleSave={handleToggleVideoSave}
                onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "sports")}
                frameRef={(node) => {
                  trendingVideoFrameRefs.current[`sports-highlights:${video.id}`] = node;
                }}
                autoplayKey={`sports-highlights:${video.id}`}
                previewDurationMs={null}
                label="Quick Watch"
                hideActions
                useRelativeTime
                className="video-card-inline quick-watch-video-card quick-watch-video-card-unified quick-watch-video-card-compact"
                useUniformTallFrame
                variant="article"
              />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderTeamPickerModal = () => {
    if (!isTeamPickerOpen) {
      return null;
    }

    return (
      <div
        className="favorite-teams-page-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorite-teams-picker-title"
      >
        <div className="favorite-teams-page">
          <div className="favorite-teams-page-header">
            <button
              type="button"
              className="favorite-teams-close"
              onClick={() => setIsTeamPickerOpen(false)}
              aria-label="Close favorite teams"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
            <h3 id="favorite-teams-picker-title" className="favorite-teams-page-title">
              Favorite Teams
            </h3>
            <span className="favorite-teams-header-spacer" aria-hidden="true" />
          </div>

          <div className="favorite-teams-tabs" role="tablist" aria-label="Favorite team leagues">
            {TEAM_PICKER_LEAGUES.map((league) => (
              <button
                key={league}
                type="button"
                role="tab"
                aria-selected={activeTeamLeague === league}
                className={`favorite-teams-tab ${
                  activeTeamLeague === league ? "favorite-teams-tab-active" : ""
                }`}
                onClick={() => handleTeamLeagueSelect(league)}
              >
                {league}
              </button>
            ))}
          </div>

          <div
            ref={teamPickerPagesRef}
            className="favorite-teams-pages"
            onScroll={(event) => {
              const target = event.currentTarget;
              const pageWidth = target.clientWidth || 1;
              const nextIndex = Math.round(target.scrollLeft / pageWidth);
              const nextLeague = TEAM_PICKER_LEAGUES[nextIndex];

              if (nextLeague && nextLeague !== activeTeamLeague) {
                setActiveTeamLeague(nextLeague);
              }
            }}
          >
            {TEAM_PICKER_LEAGUES.map((league) => (
              <section
                key={league}
                ref={(node) => {
                  teamPickerPanelRefs.current[league] = node;
                }}
                className="favorite-teams-page-panel"
                role="tabpanel"
                aria-label={`${league} teams`}
              >
                <div className="favorite-teams-grid">
                  {FAVORITE_TEAMS_BY_LEAGUE[league].map((team) => {
                    const isSelected = favoriteTeams.some(
                      (savedTeam) => savedTeam.team_id === team.team_id
                    );

                    return (
                      <button
                        key={team.team_id}
                        type="button"
                        className={`favorite-team-card ${
                          isSelected ? "favorite-team-card-selected" : ""
                        }`}
                        onClick={() => handleToggleFavoriteTeam(team)}
                      >
                        {renderFavoriteTeamBadge(team)}
                        <span className="favorite-team-name">{team.team_name}</span>
                        <span className="favorite-team-meta">
                          {isSelected ? "Selected" : "Tap to follow"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTopTrendingListItem = (article: Article, rank: number) => {
    const articleRouteId = getArticleRouteId(article);

    if (!articleRouteId || !isRenderableArticleRecord(article)) {
      return null;
    }

    const safeSourceName = getSafeSourceLabel(article.source);
    const displayImage = getArticleDisplayImage(article);
    const imageFailureKey = displayImage.failureKey ?? `${article.id}:none`;

    if (!displayImage.src) {
      console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
        section: "Top 10 Trending",
        title: article.title,
        source: article.source,
      });
      return null;
    }

    return (
      <article
        className="top-trending-list-card"
        onContextMenu={(event) => {
          event.preventDefault();
          openLongPressMenu(article);
        }}
        onTouchStart={() => {
          clearArticleLongPressTimer();
          articleLongPressTimerRef.current = window.setTimeout(() => {
            openLongPressMenu(article);
          }, 420);
        }}
        onTouchEnd={clearArticleLongPressTimer}
        onTouchCancel={clearArticleLongPressTimer}
        onTouchMove={clearArticleLongPressTimer}
      >
        <Link
          href={`/article/${articleRouteId}/`}
          className="top-trending-list-link"
          onClick={(event) => {
            void handlePrimaryArticleOpen(event, article);
          }}
        >
          <div className="top-trending-list-rank" aria-hidden="true">
            {rank}
          </div>
          <div className="top-trending-list-copy">
            <div className="top-trending-list-meta">
              <SourceHeaderMark
                sourceName={safeSourceName}
                className="top-trending-list-source-mark"
                fallbackMode="text"
              />
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                {formatPublishedDate(article.publishedAt, article.time)}
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                  </svg>
                  <span>{article.likes}</span>
                </span>
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                  </svg>
                  <span>{article.comments.length}</span>
                </span>
              </span>
            </div>
            <h3 className="top-trending-list-title">{cleanDisplayText(article.title)}</h3>
          </div>
          <div className="top-trending-list-media" aria-hidden="true">
            {displayImage.src ? (
              <img
                src={displayImage.src}
                alt={cleanDisplayText(article.title)}
                className="top-trending-list-image"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
        </Link>
      </article>
    );
  };

  const renderCompactSideImageArticle = (
    article: Article,
    options?: {
      showRank?: number | null;
      imageFallbackLabel?: string | null;
      className?: string;
    }
  ) => {
    const articleRouteId = getArticleRouteId(article);

    if (!articleRouteId || !isRenderableArticleRecord(article)) {
      return null;
    }

    const safeSourceName = getSafeSourceLabel(article.source);
    const safeCategoryName = getSafeCategoryLabel(article.category, article);
    const displayImage = getArticleDisplayImage(article);
    const imageFailureKey = displayImage.failureKey ?? `${article.id}:none`;

    if (!displayImage.src) {
      if (sortMode === "local") {
        return renderLocalTextOnlyArticleCard(article, {
          rankLabel: options?.showRank ? String(options.showRank) : null,
          sectionLabel: options?.imageFallbackLabel ?? safeCategoryName,
          compact: true,
        });
      }
      console.log("ARTICLE HIDDEN_NO_REAL_IMAGE", {
        section: options?.imageFallbackLabel ?? safeCategoryName,
        title: article.title,
        source: article.source,
      });
      if (isBroadSportsArticle(article)) {
        console.log("SPORTS CARD HIDDEN NO IMAGE", {
          section: options?.imageFallbackLabel ?? safeCategoryName,
          title: article.title,
          source: article.source,
        });
      }
      return null;
    }

    if (isBroadSportsArticle(article) && !isSportsBettingAd(article)) {
      console.log("SPORTS CARD IMAGE SRC", {
        title: cleanDisplayText(article.title),
        source: safeSourceName,
        imageSrc: displayImage.src,
      });
      console.log("SPORTS IMAGE SOURCE USED", {
        title: cleanDisplayText(article.title),
        source: safeSourceName,
        imageSource: displayImage.kind ?? "none",
      });
    }

    return (
      <article
        className={`top-trending-list-card ${
          typeof options?.showRank === "number" ? "top-trending-list-card-ranked" : ""
        } ${options?.className ?? ""}`.trim()}
        onContextMenu={(event) => {
          event.preventDefault();
          openLongPressMenu(article);
        }}
        onTouchStart={() => {
          clearArticleLongPressTimer();
          articleLongPressTimerRef.current = window.setTimeout(() => {
            openLongPressMenu(article);
          }, 420);
        }}
        onTouchEnd={clearArticleLongPressTimer}
        onTouchCancel={clearArticleLongPressTimer}
        onTouchMove={clearArticleLongPressTimer}
      >
        <Link
          href={`/article/${articleRouteId}/`}
          className="top-trending-list-link"
          onClick={(event) => {
            void handlePrimaryArticleOpen(event, article);
          }}
        >
          {typeof options?.showRank === "number" ? (
            <div className="top-trending-list-rank" aria-hidden="true">
              {options.showRank}
            </div>
          ) : null}
          <div className="top-trending-list-copy">
            <div className="top-trending-list-meta">
              <SourceHeaderMark
                sourceName={safeSourceName}
                className="top-trending-list-source-mark"
                fallbackMode="text"
              />
              <span className="top-trending-list-date">
                {formatPublishedDate(article.publishedAt, article.time)}
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
                  </svg>
                  <span>{article.likes}</span>
                </span>
              </span>
              <span className="top-trending-list-separator" aria-hidden="true">
                ·
              </span>
              <span className="top-trending-list-date">
                <span className="feed-meta-inline-group">
                  <svg {...FEED_META_ICON_PROPS} className="feed-meta-inline-icon">
                    <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
                  </svg>
                  <span>{article.comments.length}</span>
                </span>
              </span>
            </div>
            <h3 className="top-trending-list-title">{cleanDisplayText(article.title)}</h3>
          </div>
          <div className="top-trending-list-media" aria-hidden="true">
            {displayImage.src ? (
              <img
                src={displayImage.src}
                alt={cleanDisplayText(article.title)}
                className="top-trending-list-image"
                loading="lazy"
                decoding="async"
                onError={() => {
                  if (!displayImage.failureKey) {
                    return;
                  }

                  if (displayImage.kind === "real") {
                    setFailedArticleImages((prev) => {
                      if (prev[imageFailureKey]) {
                        return prev;
                      }

                      return {
                        ...prev,
                        [imageFailureKey]: true,
                      };
                    });
                    return;
                  }

                  setFailedArticleBoxImages((prev) => {
                    if (prev[imageFailureKey]) {
                      return prev;
                    }

                    return {
                      ...prev,
                      [imageFailureKey]: true,
                    };
                  });
                }}
              />
            ) : null}
          </div>
        </Link>
      </article>
    );
  };

  const renderHomeTopNavigation = (
    activeMode:
      | "trending"
      | "mynews"
      | "local"
      | "sports"
      | "celebrity"
      | "weather"
      | "technology"
      | "travel"
      | "food"
      | "business"
  ) => (
    <div ref={topTabsRef} className="trending-tabs-wrap home-sections-nav">
      <div className="toolbar toolbar-centered">
        <button
          ref={(node) => {
            topTabButtonRefs.current.trending = node;
          }}
          className={`toolbar-pill ${activeMode === "trending" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("trending")}
        >
          Trending
        </button>
        {!MY_NEWS_DISABLED ? (
          <button
            ref={(node) => {
              topTabButtonRefs.current.mynews = node;
            }}
            className={`toolbar-pill ${activeMode === "mynews" ? "toolbar-pill-active" : ""}`}
            type="button"
            onClick={() => setSortMode("mynews")}
          >
            My News
          </button>
        ) : null}
        <button
          ref={(node) => {
            topTabButtonRefs.current.local = node;
          }}
          className={`toolbar-pill ${activeMode === "local" ? "toolbar-pill-active" : ""}`}
          type="button"
          onClick={() => setSortMode("local")}
        >
          Local
        </button>
      </div>
    </div>
  );

  if (
    (sortMode === "trending" ||
      sortMode === "mynews" ||
      sortMode === "local" ||
      sortMode === "sports" ||
      sortMode === "celebrity" ||
      sortMode === "weather" ||
      sortMode === "technology" ||
      sortMode === "travel" ||
      sortMode === "food" ||
      sortMode === "business") &&
    isInitialFeedLoading &&
    visibleArticles.length === 0 &&
    !feedLoadError
  ) {
    console.log(
      "REMOVED IN-APP LOADING SCREEN FROM:",
      "/Users/erniewilson/my-news-app/app/page.tsx"
    );
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation(
          sortMode === "local"
            ? "local"
            : sortMode === "mynews"
              ? "mynews"
            : sortMode === "sports"
              ? "sports"
              : sortMode === "celebrity"
                ? "celebrity"
                : sortMode === "weather"
                  ? "weather"
                  : sortMode === "technology"
                    ? "technology"
                    : sortMode === "travel"
                      ? "travel"
                      : sortMode === "food"
                        ? "food"
                        : sortMode === "business"
                          ? "business"
                        : "trending"
        )}
        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">
                {sortMode === "local"
                  ? "Local"
                  : sortMode === "mynews"
                    ? "My News"
                  : sortMode === "sports"
                    ? "Sports"
                  : sortMode === "celebrity"
                      ? "Entertainment"
                      : sortMode === "weather"
                        ? "Weather"
                        : sortMode === "technology"
                          ? "Technology"
                          : sortMode === "travel"
                            ? "Travel"
                            : sortMode === "food"
                              ? "Food"
                              : sortMode === "business"
                                ? "Business"
                              : "Top 10 Trending"}
              </strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>
          <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-screen-inline">
              <span className="loading-screen-spinner" aria-hidden="true" />
              <span className="loading-screen-text">Loading stories...</span>
            </div>
            <div className="skeleton-card">
              <div className="skeleton-line" style={{ height: "190px", borderRadius: "24px" }} />
              <div className="skeleton-line" style={{ height: "18px", width: "72%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "92%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "84%" }} />
            </div>
            <div className="skeleton-card">
              <div className="skeleton-line" style={{ height: "18px", width: "68%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "90%" }} />
              <div className="skeleton-line" style={{ height: "14px", width: "80%" }} />
            </div>
          </div>
        </section>
      </section>
    );
  }

  if (sortMode === "trending") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("trending")}

        {renderQuickWatchRow(false, false, true, todayLabel)}

        {renderBreakingNewsRow()}

        {renderBreakingFeaturedVideosRow()}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Trending Top 5</strong>
            </div>
          </div>
          <div className="stack home-section-list top-trending-card-rail top-trending-list-rail">
            {(() => {
              console.log("TRENDING_TOP_5_RENDERED", true);
              return null;
            })()}
            {topFiveTrendingLeadArticle ? renderLargeImageArticleCard(topFiveTrendingLeadArticle) : null}
            {(topFiveTrendingLeadArticle
              ? topFiveTrendingArticles.filter(
                  (article) =>
                    getArticleDeduplicationKey(article) !==
                    getArticleDeduplicationKey(topFiveTrendingLeadArticle)
                )
              : topFiveTrendingArticles
            ).map((article, index) => (
              <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                {renderCompactSideImageArticle(article, {
                  showRank: topFiveTrendingLeadArticle ? index + 2 : index + 1,
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Source Rankings</strong>
              <span className="muted">News companies people are hearting right now.</span>
            </div>
            <Link href="/source-rankings/" className="button button-secondary">
              See all
            </Link>
          </div>

          {isHomeSourceRankingsLoading ? (
            <div className="muted">Loading source rankings...</div>
          ) : homeSourceRankings.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No source hearts yet</strong>
              <span>Heart a source from Search or its profile to build the rankings.</span>
            </div>
          ) : (
            <div className="source-rankings-carousel" role="list" aria-label="Source rankings">
              {homeSourceRankings.map((source, index) => (
                <Link
                  key={source.sourceName}
                  href={`/source/${slugifySourceName(source.sourceName)}/`}
                  className="source-rankings-card"
                  role="listitem"
                >
                  {renderSourceRankingArt(source.sourceName, index + 1)}
                  <div className="source-rankings-card-copy">
                    <span className="source-rankings-name">{source.sourceName}</span>
                    <span className="source-rankings-card-meta">News Source</span>
                  </div>
                  <div className="source-rankings-card-actions">
                    <button
                      type="button"
                      className={`icon-action-pill icon-action-pill-icon-only ${
                        source.heartedByCurrentUser ? "icon-action-pill-active" : ""
                      }`}
                      aria-label={
                        userId ? `Open ${source.sourceName} source profile` : "Log in to heart sources"
                      }
                      onClick={(event) => handlePromptSourceHeart(event, source.sourceName)}
                    >
                      <span className="icon-action-glyph" aria-hidden="true">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill={source.heartedByCurrentUser ? "currentColor" : "none"}
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m12 20.5-1.3-1.2C5.2 14.3 2 11.4 2 7.8 2 5.1 4.2 3 6.9 3c1.5 0 3 .7 4.1 1.9C12.1 3.7 13.6 3 15.1 3 17.8 3 20 5.1 20 7.8c0 3.6-3.2 6.5-8.7 11.5L12 20.5Z" />
                        </svg>
                      </span>
                    </button>
                    <strong>{source.likes}</strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {renderFeaturedVideosBreak({
          title: "Featured Videos",
          keyPrefix: "featured-videos-above-weather",
          playerTab: "news",
        })}

        <section ref={trendingEntertainmentSectionRef} className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Entertainment</strong>
            </div>
          </div>
          {trendingEntertainmentArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No entertainment stories yet</strong>
              <span>Check back shortly for fresh entertainment coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list top-trending-card-rail">
              {trendingEntertainmentLeadArticle ? renderLargeImageArticleCard(trendingEntertainmentLeadArticle) : null}
              {trendingEntertainmentArticles
                .filter((article) =>
                  trendingEntertainmentLeadArticle
                    ? getArticleDeduplicationKey(article) !==
                      getArticleDeduplicationKey(trendingEntertainmentLeadArticle)
                    : true
                )
                .slice(0, 5)
                .map((article, index) => (
                  <div
                    key={`trending-entertainment-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                  >
                    {renderCompactSideImageArticle(article, {
                      imageFallbackLabel: "Entertainment",
                      showRank: index + 1,
                    })}
                  </div>
                ))}
              {popularMusicAlbums.length >= 3 || popularMusicSliderArticles.length >= 2
                ? renderPopularMusicSlider(popularMusicAlbums, popularMusicSliderArticles)
                : null}
            </div>
          )}
          {(() => {
            console.log("TRENDING ENTERTAINMENT MUSIC SLIDER COUNT", Math.max(popularMusicAlbums.length, popularMusicSliderArticles.length));
            console.log("TRENDING ENTERTAINMENT SECTION_RENDERED", true);
            return null;
          })()}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
              <span className="muted">Forecast and weather-related stories for your selected city.</span>
            </div>
          </div>

          <div className="stack local-feed-shell">
            <div className="home-weather-card">
              <div className="stack" style={{ gap: "4px" }}>
                <span className="home-weather-city">
                  {weatherPageCard?.cityLabel ?? selectedWeatherLocation ?? selectedLocalCity ?? localLocationLabel}
                </span>
                <div className="home-weather-temp-row">
                  <span className="home-weather-icon-shell">
                    {renderWeatherConditionIcon((weatherPageCard ?? weatherCard)?.weatherLabel)}
                  </span>
                  <strong className="home-weather-temp">
                    {weatherPageCard ?? weatherCard
                      ? `${Math.round((weatherPageCard ?? weatherCard)?.temperature ?? 0)}°`
                      : "—"}
                  </strong>
                </div>
                <span className="muted">
                  {weatherPageCard ?? weatherCard
                    ? (weatherPageCard ?? weatherCard)?.weatherLabel
                    : isWeatherPageLoading || isWeatherLoading
                      ? "Loading forecast..."
                      : "Forecast unavailable"}
                </span>
              </div>
              <div className="stack home-weather-meta" style={{ gap: "6px" }}>
                <span className="muted">
                  {(weatherPageCard ?? weatherCard)?.windMph
                    ? `Wind ${Math.round((weatherPageCard ?? weatherCard)?.windMph ?? 0)} mph`
                    : "Local outlook"}
                </span>
              </div>
            </div>

            <div className="local-feed-controls">
              <div className="local-feed-input-shell">
                <input
                  className="search-input local-feed-input"
                  type="text"
                  placeholder="Enter a major city"
                  value={weatherSearchDraft}
                  onFocus={() => setIsLocalAutocompleteOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setIsLocalAutocompleteOpen(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setWeatherSearchDraft(event.target.value);
                    setIsLocalAutocompleteOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setIsLocalAutocompleteOpen(false);
                      handleUpdateWeatherLocation();
                    }
                  }}
                />
                {isLocalAutocompleteOpen && weatherCitySuggestions.length > 0 ? (
                  <div
                    className="local-city-dropdown"
                    role="listbox"
                    aria-label="Suggested cities"
                  >
                    {weatherCitySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className="local-city-dropdown-item"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setWeatherSearchDraft(city);
                          setSelectedWeatherLocation(city);
                          setIsLocalAutocompleteOpen(false);
                        }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="button button-secondary local-feed-button"
                onClick={() => {
                  setIsLocalAutocompleteOpen(false);
                  handleUpdateWeatherLocation();
                }}
              >
                Update
              </button>
            </div>

            {weatherForecastDays.length > 0 ? (
              <div className="quick-watch-row">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">10-Day Forecast</strong>
                  </div>
                </div>
                <div className="weather-forecast-scroll" role="list" aria-label="10-day weather forecast">
                  {weatherForecastDays.map((day) => (
                    <div
                      key={`trending-forecast-${day.label}-${day.dateLabel}`}
                      className="weather-forecast-item"
                      role="listitem"
                    >
                      <article className="section-card weather-forecast-card">
                        <div className="stack" style={{ gap: "4px", alignItems: "center", textAlign: "center" }}>
                          <strong>{day.label}</strong>
                          <span className="muted">{day.dateLabel}</span>
                          <span className="home-weather-icon-shell weather-forecast-icon">
                            {renderWeatherConditionIcon(day.weatherLabel)}
                          </span>
                          <strong>{day.highTemp !== null ? `${Math.round(day.highTemp)}°` : "—"}</strong>
                          <span className="muted">
                            {day.lowTemp !== null ? `${Math.round(day.lowTemp)}° low` : "Low unavailable"}
                          </span>
                          <span className="muted weather-forecast-label">{day.weatherLabel}</span>
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {trendingWeatherLeadArticle ? (
              <div className="stack" style={{ gap: "10px", marginBottom: "8px" }}>
                <strong className="profile-section-title home-section-title">Weather Around the World</strong>
                {renderLargeImageArticleCard(trendingWeatherLeadArticle)}
              </div>
            ) : null}

            {isWeatherNewsLoading ? <p className="settings-detail-note">Loading weather stories...</p> : null}

            {weatherNewsArticles.length === 0 && !isWeatherNewsLoading ? (
              <div className="empty-state compact-empty-state">
                <strong>No weather stories for {selectedLocalCity ?? "this city"} right now.</strong>
                <span>Try another supported city or check back shortly.</span>
              </div>
            ) : (
              <div className="stack" style={{ gap: "18px" }}>
                {trendingWeatherSections.localWeather.length > 0
                  ? (() => {
                      console.log("TRENDING LOCAL WEATHER HIDDEN", {
                        count: trendingWeatherSections.localWeather.length,
                      });
                      return null;
                    })()
                  : null}

                {trendingWeatherSections.nationalWeather.length > 0 ? (
                  <section className="home-section-block home-section-plain">
                    <div className="home-section-header">
                      <div className="stack" style={{ gap: "4px" }}>
                        <strong className="profile-section-title home-section-title">National Weather</strong>
                      </div>
                    </div>
                    {renderStandardArticleSection(trendingWeatherSections.nationalWeather, {
                      limit: 6,
                      excludeArticleKey: trendingWeatherLeadArticle
                        ? getArticleDeduplicationKey(trendingWeatherLeadArticle)
                        : null,
                    })}
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {!POLLS_DISABLED ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Polls</strong>
                <span className="muted">Top questions people are reacting to right now.</span>
              </div>
            </div>

            {topPollsSection.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>No polls yet</strong>
                <span>Create the first one from the plus button.</span>
              </div>
            ) : (
              <div className="polls-carousel" role="list" aria-label="Top polls">
                {topPollsSection.map((poll, index) => (
                  <div key={poll.id} className="polls-carousel-item" role="listitem">
                    <PollCard
                      poll={poll}
                      onVote={handleVoteOnPoll}
                      isVoting={activePollVoteId === poll.id}
                      rankLabel={formatTopRankLabel(index + 1)}
                      className="poll-card-featured"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {renderTallTrendingQuickWatchRow(
          todayLabel,
          trendingTallQuickWatchSections.featuredSources,
          "featured-sources-quickwatch"
        )}

        {!TRENDING_SPORTS_DISABLED ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Sports</strong>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSortMode("sports")}
              >
                More
              </button>
            </div>

            {!TRENDING_SCORE_CARDS_DISABLED
              ? isSportsScoresLoading
                ? <div className="muted">Loading score cards...</div>
                : topSportsGames.length > 0
                  ? renderSportsScoreRow(
                      topSportsGames,
                      "Trending sports scores",
                      "Scores unavailable right now."
                    )
                  : null
              : null}

            {sportsTabArticles.length === 0 ? (
              isSportsPreviewLoading ? (
                <div className="muted">Loading sports stories...</div>
              ) : (
                <div className="empty-state compact-empty-state">
                  <strong>No sports stories yet</strong>
                  <span>Check back shortly for fresh sports coverage.</span>
                </div>
              )
            ) : (
              renderGroupedSportsArticleSections(groupedSportsArticleSections) ?? (
                <div className="stack home-section-list top-trending-card-rail">
                  {trendingSportsLeadArticle ? renderLargeImageArticleCard(trendingSportsLeadArticle) : null}
                  {sportsTabArticles
                    .filter((article) =>
                      trendingSportsLeadArticle
                        ? getArticleDeduplicationKey(article) !==
                          getArticleDeduplicationKey(trendingSportsLeadArticle)
                        : true
                    )
                    .filter((article) => isBroadSportsArticle(article) && !isSportsBettingAd(article))
                    .slice(0, 5)
                    .map((article, index) => (
                      <div
                        key={`trending-sports-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                      >
                        {renderCompactSideImageArticle(article, {
                          imageFallbackLabel: "Sports",
                          showRank: index + 1,
                        })}
                      </div>
                    ))}
                </div>
              )
            )}
          </section>
        ) : null}

        {!MY_NEWS_DISABLED ? (
          <>
            <section className="home-section-block home-section-plain">
              <div className="home-section-header">
                <div className="stack" style={{ gap: "4px" }}>
                  <strong className="profile-section-title home-section-title">Suggested Categories</strong>
                  <span className="muted">Swipe through official topics to shape your feed.</span>
                </div>
                {userId ? (
                  <Link href="/profile/categories/" className="button button-secondary">
                    Edit all
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => alert("Log in to customize categories.")}
                  >
                    Log in
                  </button>
                )}
              </div>

              <div className="category-swipe-row" role="list" aria-label="Suggested categories">
                {CATEGORY_OPTIONS.map((category, index) => {
                  const isSelected = categories.includes(category);
                  const label = getCategoryLabel(category);

                  return (
                    <button
                      key={category}
                      type="button"
                      role="listitem"
                      className={`category-swipe-card ${
                        isSelected ? "category-swipe-card-active" : ""
                      }`}
                      onClick={() => void handleQuickToggleCategory(category)}
                      disabled={isSavingCategories}
                    >
                      <span
                        className={`category-swipe-card-art category-art-${index % 8} ${
                          isSelected ? "category-swipe-card-art-active" : ""
                        }`}
                        style={getCategorySwipeArtStyle(category, index)}
                        aria-hidden="true"
                      />
                      <span className="category-swipe-card-label">{label}</span>
                      <span className="category-swipe-card-meta">
                        {isSelected ? "Added" : userId ? "Tap to add" : "Log in to add"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

          </>
        ) : (
          (() => {
            console.log("TRENDING_SUGGESTED_CATEGORIES_HIDDEN", true);
            return null;
          })()
        )}

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Technology</strong>
            </div>
          </div>

          {technologyTabArticles.length === 0 ? (
            isTechnologyPreviewLoading ? (
              <div className="muted">Loading technology stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No technology stories yet</strong>
                <span>Check back shortly for fresh technology coverage.</span>
              </div>
            )
          ) : (
            renderArticleSectionWithLargeLead(technologyTabArticles, { limit: 6 })
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Food</strong>
            </div>
          </div>

          {foodTabArticles.length === 0 ? (
            isFoodPreviewLoading ? (
              <div className="muted">Loading food stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No food stories yet</strong>
                <span>Check back shortly for fresh food coverage.</span>
              </div>
            )
          ) : (
            renderArticleSectionWithLargeLead(foodTabArticles, { limit: 6 })
          )}
        </section>

        {(() => {
          console.log("QUICK_WATCH_MOVED_BETWEEN_FOOD_BUSINESS", true);
          return renderTallTrendingQuickWatchRow(
            "Quick Watch",
            trendingTallQuickWatchSections.addCategories,
            "add-categories-quickwatch"
          );
        })()}

        {renderFeaturedVideosBreak()}

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Business</strong>
            </div>
          </div>

          {renderBusinessStockTicker()}

          {businessTabArticles.length === 0 ? (
            isBusinessPreviewLoading ? (
              <div className="muted">Loading business stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No business stories yet</strong>
                <span>Check back shortly for fresh business and finance coverage.</span>
              </div>
            )
          ) : (
            renderArticleSectionWithLargeLead(businessTabArticles, { limit: 6 })
          )}
        </section>

        {renderNewsClipsRow()}

        <section ref={scienceSectionRef} className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Science</strong>
            </div>
          </div>

          {scienceTabArticles.length === 0 ? (
            isSciencePreviewLoading ? (
              <div className="muted">Loading science stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No science stories yet</strong>
                <span>Check back shortly for fresh science coverage.</span>
              </div>
            )
          ) : (
            renderArticleSectionWithLargeLead(scienceTabArticles, { limit: 6 })
          )}
        </section>

        {!TRENDING_AUTO_DISABLED ? (
          <>
            <section ref={carsSectionRef} className="home-section-block home-section-plain">
              <div className="home-section-header">
                <div className="stack" style={{ gap: "4px" }}>
                  <strong className="profile-section-title home-section-title">Auto</strong>
                </div>
              </div>

              {carsTabArticles.length === 0 ? (
                isCarsPreviewLoading ? (
                  <div className="muted">Loading auto stories...</div>
                ) : (
                  <div className="empty-state compact-empty-state">
                    <strong>No auto stories yet</strong>
                    <span>Check back shortly for fresh auto and EV coverage.</span>
                  </div>
                )
              ) : (
                renderArticleSectionWithLargeLead(carsTabArticles, { limit: 6 })
              )}
            </section>

            {autoTrendingVideos.length > 0
              ? renderTallTrendingQuickWatchRow("Auto Videos", autoTrendingVideos, "auto-trending-videos")
              : null}
          </>
        ) : null}

        {renderFeaturedPodcastsSlider(featuredTrendingPodcasts)}

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Opinion</strong>
            </div>
          </div>

          {opinionTabArticles.length === 0 ? (
            isOpinionPreviewLoading ? (
              <div className="muted">Loading opinion stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No opinion stories yet</strong>
                <span>Check back shortly for fresh analysis and commentary.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list top-trending-card-rail">
              {trendingOpinionLeadArticle ? renderLargeImageArticleCard(trendingOpinionLeadArticle) : null}
              {opinionTabArticles
                .filter((article) =>
                  trendingOpinionLeadArticle
                    ? getArticleDeduplicationKey(article) !==
                      getArticleDeduplicationKey(trendingOpinionLeadArticle)
                    : true
                )
                .slice(0, 5)
                .map((article, index) => (
                  <div
                    key={`trending-opinion-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                  >
                    {renderCompactSideImageArticle(article, {
                      imageFallbackLabel: "Opinion",
                      showRank: index + 1,
                    })}
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Crime</strong>
            </div>
          </div>

          {crimeTabArticles.length === 0 ? (
            isCrimePreviewLoading ? (
              <div className="muted">Loading crime stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No crime stories yet</strong>
                <span>Check back shortly for fresh crime and public safety coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list top-trending-card-rail">
              {trendingCrimeLeadArticle ? renderLargeImageArticleCard(trendingCrimeLeadArticle) : null}
              {crimeTabArticles
                .filter((article) =>
                  trendingCrimeLeadArticle
                    ? getArticleDeduplicationKey(article) !==
                      getArticleDeduplicationKey(trendingCrimeLeadArticle)
                    : true
                )
                .slice(0, 5)
                .map((article, index) => (
                  <div
                    key={`trending-crime-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                  >
                    {renderCompactSideImageArticle(article, {
                      imageFallbackLabel: "Crime",
                      showRank: index + 1,
                    })}
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Art</strong>
            </div>
          </div>

          {artTabArticles.length === 0 ? (
            isArtPreviewLoading ? (
              <div className="muted">Loading art stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No art stories yet</strong>
                <span>Check back shortly for fresh arts and culture coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list top-trending-card-rail">
              {trendingArtLeadArticle ? renderLargeImageArticleCard(trendingArtLeadArticle) : null}
              {artTabArticles
                .filter((article) =>
                  trendingArtLeadArticle
                    ? getArticleDeduplicationKey(article) !==
                      getArticleDeduplicationKey(trendingArtLeadArticle)
                    : true
                )
                .slice(0, 5)
                .map((article, index) => (
                  <div
                    key={`trending-art-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                  >
                    {renderCompactSideImageArticle(article, {
                      imageFallbackLabel: "Art",
                      showRank: index + 1,
                    })}
                  </div>
                ))}
            </div>
          )}
        </section>

        {isCategorySheetOpen ? (
          <div
            className="bottom-sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-sheet-title"
          >
            <div className="bottom-sheet">
              <div className="bottom-sheet-handle" aria-hidden="true" />
              <div className="bottom-sheet-header">
                <div className="stack" style={{ gap: "6px" }}>
                  <h3 id="category-sheet-title" className="modal-title">
                    Customize feed
                  </h3>
                  <p className="muted bottom-sheet-title">
                    Choose categories to shape your Graffiti feed.
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    if (isSavingCategories) {
                      return;
                    }

                    setIsCategorySheetOpen(false);
                    setCategorySheetStatus(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="category-sheet-grid">
                {CATEGORY_OPTIONS.map((category) => (
                  <button
                    key={category}
                    className={`category-pill ${
                      categoryDraft.includes(category) ? "category-pill-active" : ""
                    }`}
                    onClick={() => handleToggleCategoryDraft(category)}
                  >
                    {getCategoryImageUrl(category) ? (
                      <span
                        className="category-pill-icon"
                        style={{ backgroundImage: `url(${getCategoryImageUrl(category)})` }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{getCategoryLabel(category)}</span>
                  </button>
                ))}
              </div>

              {categorySheetStatus ? (
                <div
                  className={`status-message ${
                    categorySheetStatus.type === "success"
                      ? "status-success"
                      : "status-error"
                  }`}
                >
                  {categorySheetStatus.text}
                </div>
              ) : null}

              <div className="modal-actions">
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setCategoryDraft(categories);
                    setCategorySheetStatus(null);
                  }}
                  disabled={isSavingCategories}
                >
                  Reset
                </button>
                <button
                  className="button button-accent"
                  onClick={handleSaveCategories}
                  disabled={isSavingCategories || !userId}
                >
                  {isSavingCategories ? "Saving..." : "Save categories"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (sortMode === "mynews") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("mynews")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">My News</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {!userId ? (
            <div className="empty-state compact-empty-state">
              <strong>Log in to personalize My News</strong>
              <span>Follow categories and sources to build your own feed here.</span>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSortMode("trending")}
              >
                Browse Trending
              </button>
            </div>
          ) : categories.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>Choose categories for My News</strong>
              <span>Add categories to build a personalized feed, or keep Trending for a balanced mix.</span>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={openCategorySheet}>
                  Add categories
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setSortMode("trending")}
                >
                  See Trending
                </button>
              </div>
            </div>
          ) : isCategorySectionLoading ? (
            <div className="muted">Loading your selected categories...</div>
          ) : myNewsCategorySections.filter(
              (section) =>
                section.category !== "Recommended for You" &&
                (section.articles.length > 0 ||
                  Boolean(
                    myNewsCategoryArticleStatus[section.category]?.loading ||
                      myNewsCategoryArticleStatus[section.category]?.error
                  ))
            ).length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No stories matched your selected categories yet.</strong>
              <span>Try adding more categories or check back shortly.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: "22px" }}>
              {myNewsCategorySections
                .filter((section) => section.category !== "Recommended for You")
                .map((section, index, filteredSections) => {
                  const isDedicatedMlbSection = isDedicatedMlbCategory(section.category);
                  const isAutoSection = section.category === "Auto";
                  const isNhlSection = section.category === "NHL";
                  const isMlsSection = section.category === "MLS";
                  const isCollegeFootballSection = section.category === "College Football";
                  const isCollegeBasketballSection = section.category === "College Basketball";
                  const isGolfSection = section.category === "Golf";
                  const isScienceSection = section.category === "Science";
                  const isWeatherSection = section.category === "Weather";
                  const isTravelSection = section.category === "Travel";
                  const isSportsSection = section.category === "Sports";
                  const isPoliticsSection = section.category === "Politics";
                  const isWorldSection = section.category === "World";
                  const categoryArticleStatus = myNewsCategoryArticleStatus[section.category] ?? {
                    loading: false,
                    error: false,
                  };
                  const dedicatedMlbArticles = isDedicatedMlbSection
                    ? selectSourceBalancedArticles(
                        (myNewsCategorySupplementalArticles[section.category] ?? [])
                          .filter((article) => isDedicatedMlbArticle(article, "article"))
                          .sort((leftArticle, rightArticle) => {
                            const leftScore =
                              getArticlePriorityScore(leftArticle) +
                              getCategoryMatchScore("MLB", [
                                leftArticle.title,
                                leftArticle.description,
                                leftArticle.source,
                                leftArticle.category,
                                leftArticle.url,
                                leftArticle.content,
                              ]) *
                                20;
                            const rightScore =
                              getArticlePriorityScore(rightArticle) +
                              getCategoryMatchScore("MLB", [
                                rightArticle.title,
                                rightArticle.description,
                                rightArticle.source,
                                rightArticle.category,
                                rightArticle.url,
                                rightArticle.content,
                              ]) *
                                20;
                            return rightScore - leftScore;
                          }),
                        6
                      )
                    : section.articles;
                  const dedicatedMlbVideos = isDedicatedMlbSection
                    ? (myNewsCategorySupplementalVideos[section.category] ?? []).filter((video) =>
                        isDedicatedMlbVideo(video)
                      )
                    : myNewsCategoryVideoSections[section.category] ?? [];

                  return (
                    <div key={`mynews-section-wrap-${section.category}`} className="stack" style={{ gap: "18px" }}>
                      <section
                        key={`mynews-section-${section.category}`}
                        className="home-section-block home-section-plain"
                      >
                        {isDedicatedMlbSection
                          ? (() => {
                              console.log("RENDERING MLB SECTION FROM THIS FILE");
                              return null;
                            })()
                          : null}
                        <div className="home-section-header">
                          <div className="stack" style={{ gap: "4px" }}>
                            <strong className="profile-section-title home-section-title">
                              {getCategoryLabel(section.category)}
                            </strong>
                          </div>
                        </div>
                    {(() => {
                          const leadSelection = myNewsCategoryLeadArticles[section.category] ?? {
                                article: null,
                                imageSrcOverride: null,
                              };
                          const leadArticle = leadSelection.article;
                          const rawLeadImageOverride =
                            "imageSrc" in leadSelection
                              ? leadSelection.imageSrc
                              : leadSelection.imageSrcOverride;
                          const leadImageOverride: string | null =
                            typeof rawLeadImageOverride === "string" ? rawLeadImageOverride : null;
                          if (isDedicatedMlbSection) {
                            const supplementalMlbArticles =
                              myNewsCategorySupplementalArticles[section.category] ?? [];
                            const validMlbArticles = supplementalMlbArticles.filter((article) =>
                              isDedicatedMlbArticle(article, "lead")
                            );
                            const realImageMlbArticles = validMlbArticles.filter((article) =>
                              Boolean(getLargeImageCardImage(article))
                            );

                            console.log("FORCE MLB DEDICATED ROUTE ACTIVE");
                            console.log(
                              "RENDERING MLB LARGE CARD",
                              {
                                exists: Boolean(leadArticle),
                                title: leadArticle?.title ?? null,
                                image:
                                  leadImageOverride ??
                                  (leadArticle ? getLargeImageCardImage(leadArticle)?.src ?? null : null),
                              }
                            );
                            console.log("MLB LARGE CARD ARTICLE TITLE", leadArticle?.title ?? null);
                            console.log(
                              "MLB LARGE CARD IMAGE URL",
                              leadImageOverride ??
                                (leadArticle ? getLargeImageCardImage(leadArticle)?.src ?? null : null)
                            );
                            if (leadArticle) {
                              console.log("MLB LARGE CARD RENDER TRUE/FALSE", true);
                              console.log("MLB LARGE CARD RENDERED", {
                                title: leadArticle.title,
                                source: leadArticle.source,
                              });
                            } else if (supplementalMlbArticles.length === 0) {
                              console.log("MLB LARGE CARD RENDER TRUE/FALSE", false);
                              console.log("MLB LARGE CARD RENDERED", {
                                rendered: false,
                                reason: "render path not used",
                              });
                            } else if (validMlbArticles.length === 0) {
                              console.log("MLB LARGE CARD RENDER TRUE/FALSE", false);
                              console.log("MLB LARGE CARD RENDERED", {
                                rendered: false,
                                reason: "no valid MLB article",
                              });
                            } else if (realImageMlbArticles.length === 0) {
                              console.log("MLB LARGE CARD RENDER TRUE/FALSE", false);
                              console.log("MLB LARGE CARD RENDERED", {
                                rendered: false,
                                reason: "no real image",
                              });
                            } else {
                              console.log("MLB LARGE CARD RENDER TRUE/FALSE", false);
                              console.log("MLB LARGE CARD RENDERED", {
                                rendered: false,
                                reason: "wrong category",
                              });
                            }
                          }
                          const leadArticleKey = leadArticle
                            ? getArticleDeduplicationKey(leadArticle)
                            : null;

                          return (
                            <div className="stack" style={{ gap: "18px" }}>
                              {leadArticle ? (
                                <div
                                  key={`mynews-large-${leadArticle.id || leadArticle.url || leadArticleKey}`}
                                >
                                  {renderLargeImageArticleCard(leadArticle, {
                                    imageSrcOverride: leadImageOverride ?? null,
                                  })}
                                </div>
                              ) : null}
                              {renderRankedCompactArticleSection(
                                isDedicatedMlbSection ? dedicatedMlbArticles : section.articles,
                                {
                                  limit: 5,
                                  excludeArticleKey: leadArticleKey,
                                }
                              )}
                              {(isAutoSection ||
                                isNhlSection ||
                                isMlsSection ||
                                isCollegeFootballSection ||
                                isCollegeBasketballSection ||
                                isGolfSection ||
                                isScienceSection ||
                                isWeatherSection ||
                                isTravelSection ||
                                isSportsSection ||
                                isPoliticsSection ||
                                isWorldSection) &&
                              !leadArticle &&
                              section.articles.length === 0 &&
                              categoryArticleStatus.loading ? (
                                <div className="muted" style={{ padding: "4px 0 0" }}>
                                  {isAutoSection
                                    ? "Loading auto stories..."
                                    : isNhlSection
                                      ? "Loading NHL stories..."
                                      : isMlsSection
                                        ? "Loading MLS stories..."
                                        : isCollegeFootballSection
                                          ? "Loading college football stories..."
                                          : isCollegeBasketballSection
                                            ? "Loading college basketball stories..."
                                            : isGolfSection
                                              ? "Loading golf stories..."
                                              : isScienceSection
                                                ? "Loading science stories..."
                                                : isWeatherSection
                                                  ? "Loading weather stories..."
                                                  : isTravelSection
                                                    ? "Loading travel stories..."
                                    : isSportsSection
                                      ? "Loading sports stories..."
                                      : isWorldSection
                                        ? "Loading world stories..."
                                        : "Loading politics stories..."}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </section>

                      {renderMyNewsCategoryVideosRow(
                        section.category,
                        isDedicatedMlbSection
                          ? dedicatedMlbVideos
                          : myNewsCategoryVideoSections[section.category] ?? []
                      )}

                      {index < filteredSections.length - 1
                        ? renderMyNewsCategorySeparator(index, section.category)
                        : null}
                    </div>
                  );
                })}

              {myNewsCategorySections.find((section) => section.category === "Recommended for You")?.articles
                .length ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">
                        Recommended for You
                      </strong>
                    </div>
                  </div>
                  <div className="stack home-section-list">
                    {(
                      myNewsCategorySections.find(
                        (section) => section.category === "Recommended for You"
                      )?.articles ?? []
                    ).map((article) => (
                      <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                        {renderArticleFeedCard(article)}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </section>

      </section>
    );
  }

  if (sortMode === "sports") {
    const showSportsEmptyState =
      sportsTabArticles.length === 0 &&
      localSportsArticles.length === 0 &&
      !isLoading &&
      !isSportsPreviewLoading;

    if (showSportsEmptyState) {
      console.log("SPORTS EMPTY MESSAGE SHOWN", true);
    }

    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("sports")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title sports-page-title">
                Sports
              </strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {showSportsEmptyState ? (
            <div className="empty-state compact-empty-state">
              <strong>No sports stories yet</strong>
              <span>Check back shortly for fresh sports coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title sports-subsection-title">
                      Your Teams
                    </strong>
                    <span className="muted">Follow your favorite teams for updates.</span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setIsTeamPickerOpen(true)}
                  >
                    Add Teams
                  </button>
                </div>

                {favoriteTeamUpdates.length === 0 ? (
                  <div className="empty-state compact-empty-state">
                    <strong>Follow your favorite teams for updates.</strong>
                    <span>No updates yet for your teams.</span>
                  </div>
                ) : (
                  <div className="favorite-team-updates-row" role="list" aria-label="Favorite team updates">
                    {favoriteTeamUpdates.map(({ team, article, game }) => (
                      <article
                        key={`favorite-team-update-${team.team_id}`}
                        className="favorite-team-update-card"
                        role="listitem"
                      >
                        <div className="favorite-team-update-top">
                          {renderFavoriteTeamBadge(team)}
                          <div className="favorite-team-update-copy">
                            <strong>{team.team_name}</strong>
                            <span>{team.league} Team</span>
                          </div>
                        </div>
                        <p className="favorite-team-update-headline">
                          {article
                            ? cleanDisplayText(article.title)
                            : game
                              ? `${game.awayTeam.name} ${game.awayTeam.score ?? "—"} at ${game.homeTeam.name} ${game.homeTeam.score ?? "—"}`
                              : "No updates yet for your teams."}
                        </p>
                        {game ? (
                          <span className="favorite-team-update-meta">
                            {game.status} · {getSportsScoreMetaLabel(game)}
                          </span>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {!SPORTS_SCORE_CARDS_DISABLED ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Current Games</strong>
                      <span className="muted">Live and upcoming matchups for the leagues you follow.</span>
                    </div>
                  </div>

                  {isSportsScoresLoading ? (
                    <div className="muted">Loading current games...</div>
                  ) : (
                    renderSportsScoreRow(
                      favoriteTeamGames.length > 0 ? favoriteTeamGames : topSportsGames,
                      "Favorite team current games",
                      "Scores unavailable right now."
                    )
                  )}
                </section>
              ) : null}

              {!FEATURED_SPORTS_DISABLED && sportsFeaturedArticles.length > 0 ? (
                <section className="home-section-block home-section-plain featured-stories-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Featured Sports</strong>
                    </div>
                  </div>
                  <div className="featured-stories-scroll" role="list" aria-label="Featured sports stories">
                    {sportsFeaturedArticles.map((article) =>
                      renderFeaturedStoryTile(article, {
                        keyPrefix: "featured-sports",
                      })
                    )}
                  </div>
                </section>
              ) : null}

              {renderSportsHighlightsSection()}
              {sportsTopSeparatorArticles[0] ? renderLargeImageArticleCard(sportsTopSeparatorArticles[0]) : null}

              {sportsLeagueSections.map((section) => (
                <Fragment key={`sports-section-group-${section.key}`}>
                  <section
                    key={`sports-section-${section.key}`}
                    className="home-section-block home-section-plain"
                  >
                    <div className="home-section-header">
                      <div className="stack" style={{ gap: "4px" }}>
                        <strong
                          className={`profile-section-title ${
                            section.key === "MORE"
                              ? "home-section-title sports-more-title"
                              : "sports-subsection-title"
                          }`}
                        >
                          {section.label}
                        </strong>
                      </div>
                      {section.scoreLeague === "MLB" && section.scores.length > 10 ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setExpandedScoresLeague("MLB")}
                        >
                          More
                        </button>
                      ) : null}
                    </div>

                    {section.scoreLeague ? (
                      isSportsScoresLoading ? (
                        <div className="muted">Loading {section.label} scores...</div>
                      ) : (
                        renderSportsScoreRow(
                          section.scores.slice(0, section.scoreLeague === "MLB" ? 10 : 6),
                          `${section.label} scores`
                        )
                      )
                    ) : null}

                    {(() => {
                      const separatorArticle = sportsSectionSeparatorArticles[section.key] ?? null;
                      const largeCardArticle = getSportsLeagueLargeCardArticle(section.key, section.articles);
                      const shouldRenderSeparatorArticle =
                        separatorArticle &&
                        getArticleDeduplicationKey(separatorArticle) !==
                          (largeCardArticle ? getArticleDeduplicationKey(largeCardArticle) : "");
                      const compactArticles = largeCardArticle
                        ? section.articles.filter(
                            (article) =>
                              getArticleDeduplicationKey(article) !==
                              getArticleDeduplicationKey(largeCardArticle)
                          )
                        : section.articles;
                      const dedupedCompactArticles = compactArticles.filter(
                        (article) =>
                          !sportsSectionSeparatorArticleKeys.has(getArticleDeduplicationKey(article)) &&
                          !sportsTopSeparatorArticleKeys.has(getArticleDeduplicationKey(article))
                      );

                      return (
                        <>
                          {shouldRenderSeparatorArticle
                            ? renderLargeImageArticleCard(separatorArticle)
                            : null}
                          {largeCardArticle ? renderLargeImageArticleCard(largeCardArticle) : null}
                          {dedupedCompactArticles.length > 0 ? (
                            <div className="stack home-section-list top-trending-card-rail sports-league-compact-list">
                              {dedupedCompactArticles.map((article, index) => (
                                <div
                                  key={`sports-section-article-${section.key}-${
                                    article.id || article.url || getArticleDeduplicationKey(article)
                                  }`}
                                >
                                  {renderCompactSideImageArticle(article, {
                                    showRank: index + 1,
                                    className: "sports-league-compact-card",
                                    imageFallbackLabel: section.label,
                                  })}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}

                    {renderSportsLeagueVideos(
                      section.key,
                      section.key === "NFL"
                        ? "Quick Watch"
                        : section.key === "MORE"
                          ? "More Videos"
                          : `${section.label} Quick Watch`,
                      section.videos
                    )}
                  </section>
                </Fragment>
              ))}

              {sportsTopSeparatorArticles[1] ? renderLargeImageArticleCard(sportsTopSeparatorArticles[1]) : null}

              {favoriteTeams.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Your Team News</strong>
                    </div>
                  </div>
                  {favoriteTeamNewsArticles.length === 0 ? (
                    <div className="empty-state compact-empty-state">
                      <strong>No updates yet for your teams.</strong>
                    </div>
                  ) : (
                    <div className="stack home-section-list top-trending-card-rail sports-league-compact-list">
                      {favoriteTeamNewsArticles.map((article) => (
                        <div
                          key={`favorite-team-news-${article.id || article.url || getArticleDeduplicationKey(article)}`}
                        >
                          {renderCompactSideImageArticle(article, {
                            className: "sports-league-compact-card",
                            imageFallbackLabel: "Your Team",
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          )}
        </section>
        {renderSportsGameDetailModal()}
        {renderExpandedScoresPage()}
        {renderTeamPickerModal()}
      </section>
    );
  }

  if (sortMode === "celebrity") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("celebrity")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Entertainment</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {celebrityTabArticles.length === 0 ? (
            isEntertainmentSectionLoading || isCelebrityPreviewLoading ? (
              <div className="muted">Loading entertainment stories...</div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No entertainment stories yet</strong>
                <span>Check back shortly for fresh entertainment coverage.</span>
              </div>
            )
          ) : (
            <div className="stack home-section-list">
              {featuredCelebrityArticles.length > 0 ? (
                <section className="home-section-block home-section-plain featured-stories-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">
                        Featured Entertainment
                      </strong>
                    </div>
                  </div>
                  <div className="featured-stories-scroll" role="list" aria-label="Featured entertainment stories">
                    {featuredCelebrityArticles.map((article) =>
                      renderFeaturedStoryTile(article, {
                        keyPrefix: "featured-entertainment",
                      })
                    )}
                  </div>
                </section>
              ) : null}

              {entertainmentSectionContent.gossip.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Gossip</strong>
                  </div>
                  {(() => {
                    const leadArticle = entertainmentLeadCards.gossip;
                    const rankedArticles = leadArticle
                      ? entertainmentSectionContent.gossip.filter(
                          (article) =>
                            getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
                        )
                      : entertainmentSectionContent.gossip;

                    return (
                      <div className="stack home-section-list top-trending-card-rail">
                        {leadArticle ? renderLargeImageArticleCard(leadArticle) : null}
                        {rankedArticles.slice(0, 5).map((article, index) => (
                          <div key={`ent-gossip-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                            {renderCompactSideImageArticle(article, {
                              imageFallbackLabel: "Gossip",
                              showRank: index + 1,
                            })}
                          </div>
                        ))}
                        {renderEntertainmentSectionVideo("gossip", "Gossip Video", entertainmentSectionVideos.gossip)}
                      </div>
                    );
                  })()}
                </section>
              ) : null}

              {popularMusicAlbums.length >= 3 || popularMusicSliderArticles.length >= 2
                ? renderPopularMusicSlider(popularMusicAlbums, popularMusicSliderArticles)
                : null}

              {entertainmentSectionContent.music.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Music</strong>
                  </div>
                  {(() => {
                    const leadArticle = entertainmentLeadCards.music;
                    const rankedArticles = leadArticle
                      ? entertainmentSectionContent.music.filter(
                          (article) =>
                            getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
                        )
                      : entertainmentSectionContent.music;

                    return (
                      <div className="stack home-section-list top-trending-card-rail">
                        {leadArticle ? renderLargeImageArticleCard(leadArticle) : null}
                        {rankedArticles.slice(0, 5).map((article, index) => (
                          <div key={`ent-music-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                            {renderCompactSideImageArticle(article, {
                              imageFallbackLabel: "Music",
                              showRank: index + 1,
                            })}
                          </div>
                        ))}
                        {renderEntertainmentSectionVideo("music", "Music Video", entertainmentSectionVideos.music)}
                      </div>
                    );
                  })()}
                </section>
              ) : null}

              {entertainmentSectionContent.tvShows.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">TV Shows</strong>
                  </div>
                  {(() => {
                    const leadArticle = entertainmentLeadCards.tv;
                    const rankedArticles = leadArticle
                      ? entertainmentSectionContent.tvShows.filter(
                          (article) =>
                            getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
                        )
                      : entertainmentSectionContent.tvShows;

                    return (
                      <div className="stack home-section-list top-trending-card-rail">
                        {leadArticle ? renderLargeImageArticleCard(leadArticle) : null}
                        {rankedArticles.slice(0, 5).map((article, index) => (
                          <div key={`ent-tv-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                            {renderCompactSideImageArticle(article, {
                              imageFallbackLabel: "TV Shows",
                              showRank: index + 1,
                            })}
                          </div>
                        ))}
                        {renderEntertainmentSectionVideo("tv", "TV Video", entertainmentSectionVideos.tv)}
                      </div>
                    );
                  })()}
                </section>
              ) : null}

              {entertainmentSectionContent.celebrity.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Celebrity</strong>
                  </div>
                  {(() => {
                    const leadArticle = entertainmentLeadCards.celebrity;
                    const rankedArticles = leadArticle
                      ? entertainmentSectionContent.celebrity.filter(
                          (article) =>
                            getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
                        )
                      : entertainmentSectionContent.celebrity;

                    return (
                      <div className="stack home-section-list top-trending-card-rail">
                        {leadArticle ? renderLargeImageArticleCard(leadArticle) : null}
                        {rankedArticles.slice(0, 5).map((article, index) => (
                          <div key={`ent-celebrity-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                            {renderCompactSideImageArticle(article, {
                              imageFallbackLabel: "Celebrity",
                              showRank: index + 1,
                            })}
                          </div>
                        ))}
                        {renderEntertainmentSectionVideo(
                          "celebrity",
                          "Celebrity Video",
                          entertainmentSectionVideos.celebrity
                        )}
                      </div>
                    );
                  })()}
                </section>
              ) : null}

              {entertainmentSectionContent.movies.length > 0 || entertainmentMovieSliderArticles.length >= 2 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <strong className="profile-section-title home-section-title">Movies</strong>
                  </div>
                  {(() => {
                    const leadArticle = entertainmentLeadCards.movies;
                    const rankedArticles = leadArticle
                      ? entertainmentSectionContent.movies.filter(
                          (article) =>
                            getArticleDeduplicationKey(article) !== getArticleDeduplicationKey(leadArticle)
                        )
                      : entertainmentSectionContent.movies;

                    return (
                      <div className="stack home-section-list top-trending-card-rail">
                        {renderEntertainmentMovieSlider(theaterMovies, entertainmentMovieSliderArticles)}
                        {leadArticle ? renderLargeImageArticleCard(leadArticle) : null}
                        {rankedArticles.slice(0, 5).map((article, index) => (
                          <div key={`ent-movies-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                            {renderCompactSideImageArticle(article, {
                              imageFallbackLabel: "Movies",
                              showRank: index + 1,
                            })}
                          </div>
                        ))}
                        {renderEntertainmentSectionVideo("movies", "Movie Video", entertainmentSectionVideos.movies)}
                      </div>
                    );
                  })()}
                </section>
              ) : null}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "weather") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("weather")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          <div className="section-card stack local-feed-shell local-search-card">
            <div className="local-feed-top-row">
              <span className="local-feed-selected-label">
                {(weatherPageCard?.cityLabel ?? selectedWeatherLocation) || "Weather search"}
              </span>
            </div>
            <div className="local-feed-controls">
              <div className="local-feed-input-shell">
                <input
                  className="search-input local-feed-input"
                  type="text"
                  placeholder="Search city or zip"
                  value={weatherSearchDraft}
                  onChange={(event) => setWeatherSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleUpdateWeatherLocation();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="button button-secondary local-feed-button"
                onClick={handleUpdateWeatherLocation}
              >
                Update
              </button>
            </div>
            <div className="home-weather-card">
              <div className="stack" style={{ gap: "4px" }}>
                <span className="home-weather-city">
                  {(weatherPageCard?.cityLabel ?? selectedWeatherLocation) || "Weather"}
                </span>
                <div className="home-weather-temp-row">
                  <span className="home-weather-icon-shell">
                    {renderWeatherConditionIcon(weatherPageCard?.weatherLabel)}
                  </span>
                  <strong className="home-weather-temp">
                    {weatherPageCard ? `${Math.round(weatherPageCard.temperature)}°` : "—"}
                  </strong>
                </div>
                <span className="muted">
                  {weatherPageCard
                    ? weatherPageCard.weatherLabel
                    : isWeatherPageLoading
                    ? "Loading current conditions..."
                    : "Forecast unavailable"}
                </span>
              </div>
              <div className="stack home-weather-meta" style={{ gap: "6px" }}>
                <span className="muted">
                  {weatherPageCard &&
                  weatherPageCard.highTemp !== null &&
                  weatherPageCard.highTemp !== undefined &&
                  weatherPageCard.lowTemp !== null &&
                  weatherPageCard.lowTemp !== undefined
                    ? `H ${Math.round(weatherPageCard.highTemp ?? 0)}° / L ${Math.round(
                        weatherPageCard.lowTemp ?? 0
                      )}°`
                    : "Daily outlook"}
                </span>
                <span className="muted">
                  {weatherPageCard?.windMph ? `Wind ${Math.round(weatherPageCard.windMph)} mph` : "Wind unavailable"}
                </span>
                <span className="muted">
                  {weatherPageCard?.humidity !== null && weatherPageCard?.humidity !== undefined
                    ? `Humidity ${Math.round(weatherPageCard.humidity)}%`
                    : "Humidity unavailable"}
                </span>
              </div>
            </div>

            {weatherForecastDays.length > 0 ? (
              <div className="quick-watch-row">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">10-Day Forecast</strong>
                  </div>
                </div>
                <div className="weather-forecast-scroll" role="list" aria-label="10-day weather forecast">
                  {weatherForecastDays.map((day) => (
                    <div
                      key={`forecast-${day.label}-${day.dateLabel}`}
                      className="weather-forecast-item"
                      role="listitem"
                    >
                      <article className="section-card weather-forecast-card">
                        <div className="stack" style={{ gap: "4px", alignItems: "center", textAlign: "center" }}>
                          <strong>{day.label}</strong>
                          <span className="muted">{day.dateLabel}</span>
                          <span className="home-weather-icon-shell weather-forecast-icon">
                            {renderWeatherConditionIcon(day.weatherLabel)}
                          </span>
                          <strong>{day.highTemp !== null ? `${Math.round(day.highTemp)}°` : "—"}</strong>
                          <span className="muted">
                            {day.lowTemp !== null ? `${Math.round(day.lowTemp)}° low` : "Low unavailable"}
                          </span>
                          <span className="muted weather-forecast-label">{day.weatherLabel}</span>
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
              </div>
            ) : weatherForecastError && !isWeatherPageLoading ? (
              <div className="status-message status-error">{weatherForecastError}</div>
            ) : null}
          </div>

          {weatherTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No weather stories yet</strong>
              <span>Check back shortly for fresh weather coverage.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: "20px" }}>
              {weatherSectionContent.severeWeather.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Severe Weather</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.severeWeather.map((article) => (
                      <div key={`weather-severe-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Severe",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {weatherSectionContent.localWeather.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Local Weather</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.localWeather.map((article) => (
                      <div key={`weather-local-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Local Weather",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="home-section-block home-section-plain">
                <div className="home-section-header">
                  <div className="stack" style={{ gap: "4px" }}>
                    <strong className="profile-section-title home-section-title">National Weather Map</strong>
                  </div>
                </div>
                <div
                  className="section-card stack weather-map-placeholder-card weather-map-launch-surface"
                  role={nationalWeatherMapEmbedHtml ? "button" : undefined}
                  tabIndex={nationalWeatherMapEmbedHtml ? 0 : -1}
                  onClick={() => {
                    if (nationalWeatherMapFullscreenHtml) {
                      setIsWeatherRadarOpen(true);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!nationalWeatherMapFullscreenHtml) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setIsWeatherRadarOpen(true);
                    }
                  }}
                >
                  {nationalWeatherMapEmbedHtml ? (
                    <>
                      <iframe
                        title="National U.S. weather radar map"
                        srcDoc={nationalWeatherMapEmbedHtml}
                        className="national-weather-map-frame"
                        loading="lazy"
                        sandbox="allow-scripts allow-same-origin"
                      />
                      <div className="stack" style={{ gap: "4px" }}>
                        <strong>Current U.S. radar</strong>
                        <span className="muted">
                          Dark basemap with live RainViewer radar overlay across the U.S.
                        </span>
                        <span className="muted weather-map-card-hint">Tap to open fullscreen radar</span>
                      </div>
                      <a
                        href="https://radar.weather.gov/"
                        target="_blank"
                        rel="noreferrer"
                        className="button button-secondary"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open NWS Radar
                      </a>
                    </>
                  ) : isNationalWeatherMapLoading ? (
                    <>
                      <strong>Loading national radar...</strong>
                      <span className="muted">
                        Pulling the latest U.S. radar frame.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Radar coming soon</strong>
                      <span className="muted">
                        RainViewer is unavailable right now. Open the national radar map from the National Weather Service.
                      </span>
                      <a
                        href="https://radar.weather.gov/"
                        target="_blank"
                        rel="noreferrer"
                        className="button button-secondary"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open NWS Radar
                      </a>
                    </>
                  )}
                </div>
              </section>

              {weatherSectionContent.forecastRadar.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Forecast & Radar</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.forecastRadar.map((article) => (
                      <div key={`weather-forecast-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Forecast",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {weatherSectionContent.climateEnvironment.length > 0 ? (
                <section className="home-section-block home-section-plain">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Climate & Environment</strong>
                    </div>
                  </div>
                  <div className="stack home-section-list top-trending-card-rail weather-story-list">
                    {weatherSectionContent.climateEnvironment.map((article) => (
                      <div key={`weather-climate-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                        {renderCompactSideImageArticle(article, {
                          className: "weather-compact-card",
                          imageFallbackLabel: "Climate",
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {(() => {
                console.log(
                  "WEATHER_VIDEO_SECTION_REPLACED_WITH_SPORTS",
                  sportsVideosForWeatherSection.length > 0
                );
                return null;
              })()}
              {sportsVideosForWeatherSection.length > 0 ? (
                <section className="home-section-block home-section-plain quick-watch-row">
                  <div className="home-section-header">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong className="profile-section-title home-section-title">Sports Videos</strong>
                    </div>
                  </div>
                  <div className="quick-watch-scroll" role="list" aria-label="Sports videos">
                    {sportsVideosForWeatherSection.map((video) => (
                      <div key={`weather-sports-video-${video.id}`} className="quick-watch-item" role="listitem">
                        <VideoFeedCard
                          video={video}
                          isAutoplaying={
                            autoplayTrendingVideoKeys.includes(`weather-sports-videos:${video.id}`) && !video.fallback
                          }
                          onToggleLike={handleToggleVideoLike}
                          onToggleSave={handleToggleVideoSave}
                          onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                          onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "sports")}
                          frameRef={(node) => {
                            trendingVideoFrameRefs.current[`weather-sports-videos:${video.id}`] = node;
                          }}
                          autoplayKey={`weather-sports-videos:${video.id}`}
                          previewDurationMs={null}
                          label="Sports Video"
                          hideActions
                          useRelativeTime
                          className="video-card-inline quick-watch-video-card quick-watch-video-card-unified"
                          useUniformTallFrame
                          variant="article"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "technology") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("technology")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Technology</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {technologyTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No technology stories yet</strong>
              <span>Check back shortly for fresh tech coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {technologyTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "travel") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("travel")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Travel</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {travelTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No travel stories yet</strong>
              <span>Check back shortly for fresh travel coverage.</span>
            </div>
          ) : (
            <div className="stack home-section-list">
              {travelTabArticles.map((article) => (
                <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                  {renderArticleFeedCard(article)}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "food") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("food")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Food</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>
          <div className="category-swipe-row food-section-nav-row" role="list" aria-label="Food sections">
            {[
              {
                key: "recipes",
                label: "Recipes",
                meta: "Cooking picks",
                onClick: () => scrollSectionIntoView(foodRecipesSectionRef),
              },
              {
                key: "videos",
                label: "Recipe Videos",
                meta: "Watch & cook",
                onClick: () => scrollSectionIntoView(foodRecipeVideosSectionRef),
              },
              {
                key: "latest",
                label: "Food News",
                meta: "Latest stories",
                onClick: () => scrollSectionIntoView(foodLatestSectionRef),
              },
            ].map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="listitem"
                className="category-swipe-card food-section-nav-card"
                onClick={item.onClick}
              >
                <span
                  className={`category-swipe-card-art category-art-${index % 8}`}
                  style={getCategorySwipeArtStyle(item.label, index)}
                  aria-hidden="true"
                />
                <span className="category-swipe-card-label">{item.label}</span>
                <span className="category-swipe-card-meta">{item.meta}</span>
              </button>
            ))}
          </div>

          <section
            ref={foodRecipesSectionRef}
            className="home-section-block home-section-plain featured-stories-row food-recipes-row"
          >
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Recipes</strong>
                <span className="muted">Recipe-focused picks from cooking sources you know.</span>
              </div>
            </div>

            {foodSectionArticles.recipes.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>Recipes loading…</strong>
              </div>
            ) : (
              <div className="featured-stories-scroll" role="list" aria-label="Recipes">
                {foodSectionArticles.recipes.map((article) =>
                  renderFeaturedStoryTile(article, {
                    keyPrefix: "recipe",
                    className: "food-recipe-card",
                  })
                )}
              </div>
            )}
          </section>

          <section
            ref={foodRecipeVideosSectionRef}
            className="home-section-block home-section-plain quick-watch-row"
          >
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Recipe Videos</strong>
              </div>
            </div>
            {foodPageVideos.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>Videos loading…</strong>
              </div>
            ) : (
              <div className="quick-watch-scroll" role="list" aria-label="Recipe videos">
                {foodPageVideos.map((video) => (
                  <div key={`food-videos-${video.id}`} className="quick-watch-item" role="listitem">
                    <VideoFeedCard
                      video={video}
                      isAutoplaying={
                        autoplayTrendingVideoKeys.includes(`food-recipes:${video.id}`) &&
                        !video.fallback
                      }
                      onToggleLike={handleToggleVideoLike}
                      onToggleSave={handleToggleVideoSave}
                      onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                      onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                      frameRef={(node) => {
                        trendingVideoFrameRefs.current[`food-recipes:${video.id}`] = node;
                      }}
                      autoplayKey={`food-recipes:${video.id}`}
                      previewDurationMs={null}
                      label="Recipe Video"
                      hideActions
                      useRelativeTime
                      className="video-card-inline quick-watch-video-card"
                      variant="article"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section ref={foodLatestSectionRef} className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Food News</strong>
              </div>
            </div>

            {foodSectionArticles.latest.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>No food stories yet</strong>
                <span>Check back shortly for fresh food coverage.</span>
              </div>
            ) : (
              <div className="stack home-section-list">
                {foodSectionArticles.latest.map((article) => (
                  <div key={article.id || article.url || getArticleDeduplicationKey(article)}>
                    {renderArticleFeedCard(article)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    );
  }

  if (sortMode === "business") {
    return (
      <section className="page-shell home-sections-shell">
        {renderHomeTopNavigation("business")}

        <section className="home-section-block home-section-plain home-top-trending-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Business</strong>
              <span className="home-section-date">{todayLabel}</span>
            </div>
          </div>

          {renderBusinessStockTicker()}

          {businessTabArticles.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No business stories yet</strong>
              <span>Check back shortly for fresh business and finance coverage.</span>
            </div>
          ) : (
            (() => {
              const leadArticle = getBusinessLargeCardSelection(businessTabArticles);
              const leadArticleKey = leadArticle ? getArticleDeduplicationKey(leadArticle) : null;

              return (
                <div className="stack home-section-list top-trending-card-rail">
                  {leadArticle ? renderLargeImageArticleCard(leadArticle) : null}
                  {renderRankedCompactArticleSection(businessTabArticles, {
                    limit: 5,
                    excludeArticleKey: leadArticleKey,
                  })}
                </div>
              );
            })()
          )}
        </section>
      </section>
    );
  }

  if (sortMode === "local") {
    const localCityLabel = selectedLocalCity ?? DEFAULT_LOCAL_CITY;
    const localEmptyLabel = localCityLabel.split(",")[0]?.trim() || "Charlotte";
    const renderLocalVideoRow = (rowIndex: number) => {
      const videoRow = localVideoRows[rowIndex];

      if (!videoRow || videoRow.length === 0) {
        return null;
      }

      return (
        <section className="home-section-block home-section-plain quick-watch-row">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Local Videos</strong>
            </div>
          </div>
          <div className="quick-watch-scroll" role="list" aria-label="Local videos">
            {videoRow.map((video) => (
              <div key={`local-video-${rowIndex}-${video.id}`} className="quick-watch-item" role="listitem">
                <VideoFeedCard
                  video={video}
                  isAutoplaying={
                    autoplayTrendingVideoKeys.includes(`local-videos:${rowIndex}:${video.id}`) &&
                    !video.fallback
                  }
                  onToggleLike={handleToggleVideoLike}
                  onToggleSave={handleToggleVideoSave}
                  onOpenComments={(videoId) => router.push(`/video/${videoId}/#comments`)}
                  onOpenPlayer={(videoId) => handleOpenFeedVideo(videoId, "news")}
                  frameRef={(node) => {
                    trendingVideoFrameRefs.current[`local-videos:${rowIndex}:${video.id}`] = node;
                  }}
                  autoplayKey={`local-videos:${rowIndex}:${video.id}`}
                  previewDurationMs={null}
                  label="Local Videos"
                  hideActions
                  useRelativeTime
                  className="video-card-inline quick-watch-video-card"
                  variant="article"
                />
              </div>
            ))}
          </div>
        </section>
      );
    };

    return (
      <section className="page-shell home-sections-shell local-page-shell">
        {renderHomeTopNavigation("local")}

        <section className="home-section-block home-section-plain local-page-hero">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Local</strong>
            </div>
          </div>

          <div className="section-card stack local-feed-shell local-search-card">
            <div className="local-feed-top-row">
              <span className="local-feed-selected-label">{localCityLabel}</span>
            </div>
            <div className="local-feed-controls">
              <div className="local-feed-input-shell">
                <input
                  className="search-input local-feed-input"
                  type="text"
                  placeholder="Search supported cities"
                  value={localQueryDraft}
                  onFocus={() => setIsLocalAutocompleteOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setIsLocalAutocompleteOpen(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setLocalQueryDraft(event.target.value);
                    setLocalSearchStatus(null);
                    setIsLocalAutocompleteOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setIsLocalAutocompleteOpen(false);
                      void handleUpdateLocalQuery();
                    }
                  }}
                />
                {isLocalAutocompleteOpen && localCitySuggestions.length > 0 ? (
                  <div
                    className="local-city-dropdown"
                    role="listbox"
                    aria-label="Suggested local cities"
                  >
                    {localCitySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className={`local-city-dropdown-item ${
                          localCityLabel === city ? "local-city-dropdown-item-active" : ""
                        }`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyLocalCitySelection(city);
                          setIsLocalAutocompleteOpen(false);
                        }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {isLocalAreaLoading && navigableTopLocalStories.length === 0 ? (
              <div className="search-inline-loading local-inline-loading" role="status" aria-live="polite">
                Loading local stories...
              </div>
            ) : null}
          </div>
        </section>

        <section className="section-card home-section-block">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Weather</strong>
            </div>
          </div>

          <div className="home-weather-card">
            <div className="stack" style={{ gap: "4px" }}>
              <span className="home-weather-city">{localCityLabel}</span>
              <div className="home-weather-temp-row">
                <span className="home-weather-icon-shell">
                  {renderWeatherConditionIcon(weatherCard?.weatherLabel)}
                </span>
                <strong className="home-weather-temp">
                  {weatherCard ? `${Math.round(weatherCard.temperature)}°` : "—"}
                </strong>
              </div>
              <span className="muted">
                {weatherCard
                  ? weatherCard.weatherLabel
                  : isWeatherLoading
                  ? "Loading forecast..."
                  : "Forecast unavailable"}
              </span>
            </div>
            <div className="stack home-weather-meta" style={{ gap: "6px" }}>
              <span className="muted">
                {weatherCard?.windMph ? `Wind ${Math.round(weatherCard.windMph)} mph` : "Local outlook"}
              </span>
            </div>
          </div>

          {weatherForecastDays.length > 0 ? (
            <div className="weather-forecast-scroll" role="list" aria-label="Local 10-day weather forecast">
              {weatherForecastDays.map((day) => (
                <div
                  key={`local-forecast-${day.label}-${day.dateLabel}`}
                  className="weather-forecast-item"
                  role="listitem"
                >
                  <article className="section-card weather-forecast-card">
                    <div className="stack" style={{ gap: "10px" }}>
                      <div className="stack" style={{ gap: "2px" }}>
                        <strong>{day.label}</strong>
                        <span className="muted">{day.dateLabel}</span>
                      </div>
                      <div className="home-weather-temp-row">
                        <span className="home-weather-icon-shell weather-forecast-icon">
                          {renderWeatherConditionIcon(day.weatherLabel)}
                        </span>
                        <strong>{`H ${Math.round(day.highTemp ?? 0)}° / L ${Math.round(
                          day.lowTemp ?? 0
                        )}°`}</strong>
                      </div>
                      <span className="muted weather-forecast-label">{day.weatherLabel}</span>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          ) : weatherForecastError ? (
            <div className="muted local-inline-placeholder">{weatherForecastError}</div>
          ) : null}
        </section>

        <section className="home-section-block home-section-plain">
          <div className="home-section-header">
            <div className="stack" style={{ gap: "4px" }}>
              <strong className="profile-section-title home-section-title">Top Local Stories</strong>
            </div>
          </div>

          {isLocalAreaLoading && navigableTopLocalStories.length === 0 ? (
            <div className="muted local-inline-placeholder">Updating stories...</div>
          ) : navigableTopLocalStories.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>No {localEmptyLabel} stories found yet.</strong>
            </div>
          ) : (
            <div className="stack home-section-list">
              {navigableTopLocalStories.map((article) => {
                const articleKey =
                  article.id || article.url || getArticleDeduplicationKey(article);
                return (
                  <div key={articleKey}>
                    {renderArticleFeedCard(article)}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {renderLocalVideoRow(0)}

        {localSectionArticles.localSports.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Local Sports</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.localSports.map((article) => (
                <div key={`local-sports-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Local Sports",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {renderLocalVideoRow(1)}

        {localSectionArticles.developmentBusiness.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Development & Business</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.developmentBusiness.map((article) => (
                <div key={`local-development-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Business",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {renderLocalVideoRow(2)}

        {localSectionArticles.eventsThingsToDo.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Events & Things To Do</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.eventsThingsToDo.map((article) => (
                <div key={`local-events-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Events",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {renderLocalVideoRow(3)}

        {localLifestyleSections.bestRestaurants.length > 0 ? (
          <section className="home-section-block home-section-plain featured-stories-row">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Best Restaurants</strong>
              </div>
            </div>

            <div className="featured-stories-scroll" role="list" aria-label="Best restaurants">
              {localLifestyleSections.bestRestaurants.map((article) =>
                renderFeaturedStoryTile(article, {
                  keyPrefix: "local-restaurant",
                  className: "food-recipe-card",
                })
              )}
            </div>
          </section>
        ) : null}

        {localLifestyleSections.thingsToDo.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Things To Do</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localLifestyleSections.thingsToDo.map((article) => (
                <div key={`local-things-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Things To Do",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localLifestyleSections.localEvents.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Local Events</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localLifestyleSections.localEvents.map((article) => (
                <div key={`local-lifestyle-events-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Events",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localLifestyleSections.neighborhoods.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Neighborhoods</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localLifestyleSections.neighborhoods.map((article) => (
                <div key={`local-neighborhoods-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Neighborhoods",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localLifestyleSections.foodDrink.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Food & Drink</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localLifestyleSections.foodDrink.map((article) => (
                <div key={`local-food-drink-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Food & Drink",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {localSectionArticles.foodRestaurants.length > 0 ? (
          <section className="home-section-block home-section-plain">
            <div className="home-section-header">
              <div className="stack" style={{ gap: "4px" }}>
                <strong className="profile-section-title home-section-title">Food & Restaurants</strong>
              </div>
            </div>
            <div className="stack home-section-list top-trending-card-rail">
              {localSectionArticles.foodRestaurants.map((article) => (
                <div key={`local-food-${article.id || article.url || getArticleDeduplicationKey(article)}`}>
                  {renderCompactSideImageArticle(article, {
                    className: "sports-league-compact-card",
                    imageFallbackLabel: "Food",
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {isCategorySheetOpen ? (
          <div
            className="bottom-sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-sheet-title"
          >
            <div className="bottom-sheet">
              <div className="bottom-sheet-handle" aria-hidden="true" />
              <div className="bottom-sheet-header">
                <div className="stack" style={{ gap: "6px" }}>
                  <h3 id="category-sheet-title" className="modal-title">
                    Customize feed
                  </h3>
                  <p className="muted bottom-sheet-title">
                    Choose categories to shape your Graffiti feed.
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    if (isSavingCategories) {
                      return;
                    }

                    setIsCategorySheetOpen(false);
                    setCategorySheetStatus(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="category-sheet-grid">
                {CATEGORY_OPTIONS.map((category) => (
                  <button
                    key={category}
                    className={`category-pill ${
                      categoryDraft.includes(category) ? "category-pill-active" : ""
                    }`}
                    onClick={() => handleToggleCategoryDraft(category)}
                  >
                    {getCategoryImageUrl(category) ? (
                      <span
                        className="category-pill-icon"
                        style={{ backgroundImage: `url(${getCategoryImageUrl(category)})` }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{getCategoryLabel(category)}</span>
                  </button>
                ))}
              </div>

              {categorySheetStatus ? (
                <div
                  className={`status-message ${
                    categorySheetStatus.type === "success"
                      ? "status-success"
                      : "status-error"
                  }`}
                >
                  {categorySheetStatus.text}
                </div>
              ) : null}

              <div className="modal-actions">
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setCategoryDraft(categories);
                    setCategorySheetStatus(null);
                  }}
                  disabled={isSavingCategories}
                >
                  Reset
                </button>
                <button
                  className="button button-accent"
                  onClick={handleSaveCategories}
                  disabled={isSavingCategories || !userId}
                >
                  {isSavingCategories ? "Saving..." : "Save categories"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="page-shell">
      <div className="page-hero">
        <div className="page-title-row">
          <div className="trending-tabs-wrap">
            <div className="toolbar toolbar-centered">
              <button
                className="toolbar-pill"
                onClick={() => setSortMode("trending")}
              >
                Trending
              </button>
              {!POLLS_DISABLED ? (
                <button
                  className={`toolbar-pill ${
                    sortMode === "polls" ? "toolbar-pill-active" : ""
                  }`}
                  onClick={() => setSortMode("polls")}
                >
                  Polls
                </button>
              ) : null}
              <button
                className={`toolbar-pill ${
                  sortMode === "latest" ? "toolbar-pill-active" : ""
                }`}
                onClick={() => setSortMode("latest")}
              >
                Latest
              </button>
            </div>
          </div>
        </div>
      </div>

      {!POLLS_DISABLED && sortMode === "polls" ? (
        <div className="polls-filter-toolbar">
          <label className="polls-filter-select-wrap">
            <span className="polls-filter-select-label">Filter</span>
            <select
              className="polls-filter-select"
              value={pollFilter}
              onChange={(event) =>
                setPollFilter(event.target.value as "top" | "following" | "trending")
              }
              aria-label="Poll feed filter"
            >
              <option value="top">Top Polls</option>
              <option value="following">Following</option>
              <option value="trending">Trending</option>
            </select>
          </label>
        </div>
      ) : null}

      {!POLLS_DISABLED && sortMode === "polls" && myFeedRenderItems.length === 0 ? (
        <div className="empty-state">
          <strong>{pollFilter === "following" ? "No followed-user polls yet" : "No polls yet"}</strong>
          <span>
            {pollFilter === "following"
              ? "Follow more people or create your own poll."
              : "Create the first one."}
          </span>
        </div>
      ) : visibleArticles.length === 0 &&
        !(!POLLS_DISABLED && sortMode === "polls" && myFeedRenderItems.length > 0) ? (
        <div className="empty-state">
          <strong>
            {feedLoadError
              ? "Couldn’t load stories."
              : !POLLS_DISABLED && sortMode === "polls"
              ? "No polls yet"
              : "No stories yet"}
          </strong>
          <span>
            {feedLoadError
              ? "Tap to retry."
              : !POLLS_DISABLED && sortMode === "polls"
              ? "Create the first one."
              : "Check back in a moment for fresh stories."}
          </span>
        </div>
      ) : (
        <div className="stack feed-results-stack">
          {feedLoadError ? (
            <div className="feed-inline-error" role="status" aria-live="polite">
              <div className="stack" style={{ gap: "10px" }}>
                <span>{feedLoadError}</span>
              </div>
            </div>
          ) : null}
          {!POLLS_DISABLED && sortMode === "polls"
            ? myFeedRenderItems.map((item) => (
                <div key={item.key} className="stack">
                  <PollCard
                    poll={item.poll}
                    onVote={handleVoteOnPoll}
                    isVoting={activePollVoteId === item.poll.id}
                  />
                </div>
              ))
            : visibleArticles.map((article) => {
                const articleKey =
                  article.id || article.url || getArticleDeduplicationKey(article);

                return (
                  <div key={articleKey} className="stack">
                    {renderArticleFeedCard(article, {
                      showFreshnessTime: sortMode === "latest",
                    })}
                  </div>
                );
              })}
          {isLoadingMoreArticles ? (
            <div className="feed-inline-loading" role="status" aria-live="polite">
              Loading more stories...
            </div>
          ) : null}
          {!isLoading && !isLoadingMoreArticles && !hasMoreArticles ? (
            <div className="feed-inline-end" role="status" aria-live="polite">
              You&apos;re caught up.
            </div>
          ) : null}
          {!isLoading && hasMoreArticles ? (
            <div ref={loadMoreSentinelRef} className="feed-load-sentinel" aria-hidden="true" />
          ) : null}
        </div>
      )}

      {isCategorySheetOpen ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-sheet-title"
        >
          <div className="bottom-sheet">
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 id="category-sheet-title" className="modal-title">
                  Customize feed
                </h3>
                <p className="muted bottom-sheet-title">
                  Choose categories to shape your Graffiti feed.
                </p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => {
                  if (isSavingCategories) {
                    return;
                  }

                  setIsCategorySheetOpen(false);
                  setCategorySheetStatus(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="category-sheet-grid">
              {CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category}
                  className={`category-pill ${
                    categoryDraft.includes(category) ? "category-pill-active" : ""
                  }`}
                  onClick={() => handleToggleCategoryDraft(category)}
                >
                  {getCategoryImageUrl(category) ? (
                    <span
                      className="category-pill-icon"
                      style={{ backgroundImage: `url(${getCategoryImageUrl(category)})` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{getCategoryLabel(category)}</span>
                </button>
              ))}
            </div>

            {categorySheetStatus ? (
              <div
                className={`status-message ${
                  categorySheetStatus.type === "success"
                    ? "status-success"
                    : "status-error"
                }`}
              >
                {categorySheetStatus.text}
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setCategoryDraft(categories);
                  setCategorySheetStatus(null);
                }}
                disabled={isSavingCategories}
              >
                Reset
              </button>
              <button
                className="button button-accent"
                onClick={handleSaveCategories}
                disabled={isSavingCategories || !userId}
              >
                {isSavingCategories ? "Saving..." : "Save categories"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isWeatherRadarOpen && nationalWeatherMapFullscreenHtml ? (
        <div
          className="weather-radar-fullscreen-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="National weather radar"
        >
          <div className="weather-radar-fullscreen">
            <div className="weather-radar-fullscreen-header">
              <button
                type="button"
                className="header-icon-button"
                onClick={() => setIsWeatherRadarOpen(false)}
                aria-label="Close radar"
              >
                <span className="header-icon-glyph" aria-hidden="true">
                  ✕
                </span>
              </button>
              <strong className="profile-section-title home-section-title">National Weather Map</strong>
              <div className="app-header-side-spacer" aria-hidden="true" />
            </div>
            <iframe
              title="Fullscreen national U.S. weather radar map"
              srcDoc={nationalWeatherMapFullscreenHtml}
              className="weather-radar-fullscreen-frame"
              loading="eager"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      ) : null}

      {longPressMenuArticle ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Article actions"
          onClick={() => setLongPressMenuArticle(null)}
        >
          <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-handle" aria-hidden="true" />
            <div className="bottom-sheet-header">
              <div className="stack" style={{ gap: "6px" }}>
                <h3 className="modal-title">Article actions</h3>
                <p className="muted bottom-sheet-title">
                  {cleanDisplayText(longPressMenuArticle.title)}
                </p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => setLongPressMenuArticle(null)}
              >
                Close
              </button>
            </div>

            <div className="stack" style={{ gap: "12px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={async () => {
                  await handleCardShare(longPressMenuArticle);
                  setLongPressMenuArticle(null);
                }}
              >
                Share
              </button>
              <button
                type="button"
                className="button button-accent"
                onClick={async () => {
                  await handleCardSave(longPressMenuArticle);
                  setLongPressMenuArticle(null);
                }}
              >
                {longPressMenuArticle.saved ? "Remove bookmark" : "Bookmark / Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeCommentsArticle ? (
        <div
          className="bottom-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comments"
          onClick={() => {
            setActiveCommentsArticleId(null);
            setReplyTarget(null);
            setIsCommentSortMenuOpen(false);
          }}
        >
          <div
            className="bottom-sheet comment-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-handle" aria-hidden="true" />

            <div className="comment-sheet-topbar">
              <div className="comment-sort-menu">
                <button
                  className="comment-sort-trigger"
                  type="button"
                  onClick={() =>
                    setIsCommentSortMenuOpen((current) => !current)
                  }
                  aria-expanded={isCommentSortMenuOpen}
                  aria-haspopup="menu"
                >
                  <span>
                    {commentSortMode === "top"
                      ? "Top comments"
                      : commentSortMode === "controversial"
                        ? "Controversial"
                        : "Newest"}
                  </span>
                  <span className="comment-sort-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {isCommentSortMenuOpen ? (
                  <div className="comment-sort-dropdown" role="menu">
                    <button
                      className="comment-sort-option"
                      type="button"
                      onClick={() => {
                        setCommentSortMode("controversial");
                        setIsCommentSortMenuOpen(false);
                      }}
                    >
                      Controversial
                    </button>
                    <button
                      className="comment-sort-option"
                      type="button"
                      onClick={() => {
                        setCommentSortMode("newest");
                        setIsCommentSortMenuOpen(false);
                      }}
                    >
                      Newest
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="bottom-sheet-comments">
              {displayedBottomSheetComments.length === 0 ? (
                <div className="empty-state">
                  <strong>No comments yet</strong>
                  <span>Start the conversation on this story.</span>
                </div>
              ) : (
                <div className="comment-list">
                  {displayedBottomSheetComments.map((comment) => (
                    <div key={comment.id} className="comment-card">
                      <div className="comment-header">
                        {comment.user_id ? (
                          <Link
                            href={`/user/${comment.user_id}/`}
                            className="comment-user-link"
                          >
                            <span className="comment-user-avatar">
                              {comment.avatar_url ? (
                                <Image
                                  src={comment.avatar_url}
                                  alt={comment.username ?? "User avatar"}
                                  width={34}
                                  height={34}
                                  unoptimized
                                />
                              ) : (
                                (comment.username ?? "U").charAt(0).toUpperCase()
                              )}
                            </span>
                            <span className="comment-username">
                              {comment.username ?? "Unknown"}
                            </span>
                          </Link>
                        ) : (
                          <strong>{comment.username ?? "Unknown"}</strong>
                        )}
                        {comment.user_id === userId ? (
                          <span className="chip">Your comment</span>
                        ) : null}
                      </div>
                      <div className="comment-body">{comment.text}</div>
                      <div className="comment-meta">
                        {formatRelativeTime(comment.created_at)}
                      </div>
                      {comment.replies.length > 0 ? (
                        <div className="comment-replies">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="comment-reply-card">
                              <div className="comment-header">
                                {reply.user_id ? (
                                  <Link
                                    href={`/user/${reply.user_id}/`}
                                    className="comment-user-link"
                                  >
                                    <span className="comment-user-avatar">
                                      {reply.avatar_url ? (
                                        <Image
                                          src={reply.avatar_url}
                                          alt={reply.username ?? "User avatar"}
                                          width={34}
                                          height={34}
                                          unoptimized
                                        />
                                      ) : (
                                        (reply.username ?? "U").charAt(0).toUpperCase()
                                      )}
                                    </span>
                                    <span className="comment-username">
                                      {reply.username ?? "Unknown"}
                                    </span>
                                  </Link>
                                ) : (
                                  <strong>{reply.username ?? "Unknown"}</strong>
                                )}
                              </div>
                              <div className="comment-body">{reply.text}</div>
                              <div className="comment-meta">
                                {formatRelativeTime(reply.created_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="comment-reaction-row">
                        <button
                          className={`comment-reaction-pill ${
                            comment.currentUserReaction === "like"
                              ? "comment-reaction-pill-active"
                              : ""
                          }`}
                          onClick={() =>
                            handleCommentReaction(
                              activeCommentsArticle.id,
                              comment.id,
                              "like"
                            )
                          }
                          disabled={activeCommentAction === `reaction-${comment.id}`}
                        >
                          <span aria-hidden="true">♥</span>
                          <span>{comment.likes}</span>
                        </button>
                        <button
                          className={`comment-reaction-pill ${
                            comment.currentUserReaction === "dislike"
                              ? "comment-reaction-pill-active"
                              : ""
                          }`}
                          onClick={() =>
                            handleCommentReaction(
                              activeCommentsArticle.id,
                              comment.id,
                              "dislike"
                            )
                          }
                          disabled={activeCommentAction === `reaction-${comment.id}`}
                        >
                          <span aria-hidden="true">👎</span>
                          <span>{comment.dislikes}</span>
                        </button>
                      </div>
                      <div className="comment-actions">
                        <button
                          className="comment-action"
                          onClick={() => {
                            setReplyTarget({
                              articleId: activeCommentsArticle.id,
                              commentId: comment.id,
                              username: comment.username,
                            });
                          }}
                          type="button"
                        >
                          Reply
                        </button>
                        <button
                          className="comment-action"
                          onClick={() => openReportModal(comment.id)}
                          disabled={activeCommentAction === `report-${comment.id}`}
                        >
                          {activeCommentAction === `report-${comment.id}`
                            ? "Reporting..."
                            : "Report"}
                        </button>

                        {comment.user_id === userId ? (
                          <button
                            className="comment-action comment-action-danger"
                            onClick={() =>
                              openDeleteModal(activeCommentsArticle.id, comment.id)
                            }
                            disabled={activeCommentAction === `delete-${comment.id}`}
                          >
                            {activeCommentAction === `delete-${comment.id}`
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        ) : comment.user_id ? (
                          <button
                            className="comment-action"
                            onClick={() =>
                              handleBlockUser(comment.user_id!, comment.username)
                            }
                            disabled={activeCommentAction === `block-${comment.user_id}`}
                          >
                            {activeCommentAction === `block-${comment.user_id}`
                              ? "Blocking..."
                              : "Block"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="comment-sheet-composer">
              {replyTarget && replyTarget.articleId === activeCommentsArticle.id ? (
                <div className="comment-reply-banner">
                  <span>
                    Replying to <strong>{replyTarget.username ?? "this comment"}</strong>
                  </span>
                  <button
                    className="comment-action"
                    onClick={() => setReplyTarget(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              <div className="input-row bottom-sheet-input-row">
                <input
                  ref={commentInputRef}
                  className="input"
                  type="text"
                  placeholder={
                    replyTarget && replyTarget.articleId === activeCommentsArticle.id
                      ? "Write a reply..."
                      : "Write a comment..."
                  }
                  value={commentInputs[activeCommentsArticle.id] || ""}
                  onChange={(e) =>
                    handleCommentInputChange(activeCommentsArticle.id, e.target.value)
                  }
                />
                <button
                  className="button button-secondary"
                  onClick={() => handleAddComment(activeCommentsArticle.id)}
                >
                  {replyTarget && replyTarget.articleId === activeCommentsArticle.id
                    ? "Reply"
                    : "Send"}
                </button>
              </div>
              {commentComposerStatus ? (
                <div
                  className={`status-message ${
                    commentComposerStatus.type === "success"
                      ? "status-success"
                      : "status-error"
                  }`}
                >
                  {commentComposerStatus.text}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {reportingCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="report-title" className="modal-title">
                Report comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Tell us why this comment should be reviewed.
              </p>
            </div>

            <textarea
              className="textarea"
              placeholder="Add a reason for this report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              disabled={activeCommentAction === `report-${reportingCommentId}`}
            />

            {reportStatus ? (
              <div
                className={`status-message ${
                  reportStatus.type === "success" ? "status-success" : "status-error"
                }`}
              >
                {reportStatus.text}
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={closeReportModal}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                Cancel
              </button>
              <button
                className="button button-accent"
                onClick={handleSubmitReport}
                disabled={activeCommentAction === `report-${reportingCommentId}`}
              >
                {activeCommentAction === `report-${reportingCommentId}`
                  ? "Submitting..."
                  : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="delete-title" className="modal-title">
                Delete comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Are you sure you want to delete this comment?
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={closeDeleteModal}
                disabled={activeCommentAction === `delete-${deleteTarget.commentId}`}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger"
                onClick={confirmDeleteComment}
                disabled={activeCommentAction === `delete-${deleteTarget.commentId}`}
              >
                {activeCommentAction === `delete-${deleteTarget.commentId}`
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
