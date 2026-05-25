export type PodcastFeedCategory =
  | "World News"
  | "Sports"
  | "Celebrity"
  | "Music"
  | "Movies"
  | "Business"
  | "Technology"
  | "Food"
  | "Travel";

export type PodcastFeedConfig = {
  slug: string;
  title: string;
  publisher: string;
  category: PodcastFeedCategory;
  featured?: boolean;
  feedUrl: string;
};

export const PODCAST_FEEDS: PodcastFeedConfig[] = [
  {
    slug: "npr-news-now",
    title: "NPR News Now",
    publisher: "NPR",
    category: "World News",
    featured: true,
    feedUrl: "https://feeds.npr.org/500005/podcast.xml",
  },
  {
    slug: "the-daily",
    title: "The Daily",
    publisher: "The New York Times",
    category: "World News",
    featured: true,
    feedUrl: "https://feeds.simplecast.com/54nAGcIl",
  },
  {
    slug: "up-first",
    title: "Up First",
    publisher: "NPR",
    category: "World News",
    featured: true,
    feedUrl: "https://feeds.npr.org/510318/podcast.xml",
  },
  {
    slug: "cnn-5-things",
    title: "CNN 5 Things",
    publisher: "CNN",
    category: "World News",
    featured: true,
    feedUrl: "https://feeds.megaphone.fm/CNN2095528734",
  },
  {
    slug: "marketplace",
    title: "Marketplace",
    publisher: "Marketplace",
    category: "Business",
    featured: true,
    feedUrl: "https://feeds.publicradio.org/public_feeds/marketplace/podcast.xml",
  },
  {
    slug: "espn-daily",
    title: "ESPN Daily",
    publisher: "ESPN",
    category: "Sports",
    featured: true,
    feedUrl: "https://feeds.megaphone.fm/ESP9794872487",
  },
  {
    slug: "the-bill-simmons-podcast",
    title: "The Bill Simmons Podcast",
    publisher: "The Ringer",
    category: "Sports",
    featured: true,
    feedUrl: "https://feeds.megaphone.fm/the-bill-simmons-podcast",
  },
  {
    slug: "pivot",
    title: "Pivot",
    publisher: "Vox Media",
    category: "Business",
    featured: true,
    feedUrl: "https://feeds.megaphone.fm/pivot",
  },
  {
    slug: "hard-fork",
    title: "Hard Fork",
    publisher: "The New York Times",
    category: "Technology",
    featured: true,
    feedUrl: "https://feeds.simplecast.com/7n5KTGdu",
  },
  {
    slug: "the-rewatchables",
    title: "The Rewatchables",
    publisher: "The Ringer",
    category: "Movies",
    feedUrl: "https://feeds.megaphone.fm/the-rewatchables",
  },
  {
    slug: "pop-culture-happy-hour",
    title: "Pop Culture Happy Hour",
    publisher: "NPR",
    category: "Celebrity",
    feedUrl: "https://feeds.npr.org/510282/podcast.xml",
  },
  {
    slug: "rolling-stone-music-now",
    title: "Rolling Stone Music Now",
    publisher: "Rolling Stone",
    category: "Music",
    feedUrl: "https://feeds.megaphone.fm/rollingstonemusicnow",
  },
  {
    slug: "all-songs-considered",
    title: "All Songs Considered",
    publisher: "NPR",
    category: "Music",
    feedUrl: "https://feeds.npr.org/510019/podcast.xml",
  },
  {
    slug: "the-town",
    title: "The Town",
    publisher: "The Ringer",
    category: "Celebrity",
    feedUrl: "https://feeds.megaphone.fm/the-town-with-matthew-belloni",
  },
  {
    slug: "the-journal",
    title: "The Journal.",
    publisher: "The Wall Street Journal",
    category: "Business",
    feedUrl: "https://feeds.megaphone.fm/the-journal",
  },
  {
    slug: "acquired",
    title: "Acquired",
    publisher: "Acquired",
    category: "Technology",
    feedUrl: "https://feeds.transistor.fm/acquired",
  },
  {
    slug: "the-splendid-table",
    title: "The Splendid Table",
    publisher: "American Public Media",
    category: "Food",
    feedUrl: "https://feeds.simplecast.com/4YGl7fCL",
  },
  {
    slug: "the-eater-upgrade",
    title: "The Eater Upsell",
    publisher: "Eater",
    category: "Food",
    feedUrl: "https://feeds.megaphone.fm/VMP5705694066",
  },
  {
    slug: "travel-with-rick-steves",
    title: "Travel with Rick Steves",
    publisher: "Rick Steves",
    category: "Travel",
    feedUrl: "https://feeds.megaphone.fm/travel-with-rick-steves",
  },
  {
    slug: "zero-to-travel",
    title: "Zero To Travel",
    publisher: "Zero To Travel",
    category: "Travel",
    feedUrl: "https://feeds.simplecast.com/Qvr0vR7v",
  },
];
