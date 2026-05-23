export type PodcastFeedCategory = "News" | "Sports" | "Business" | "Technology";

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
    category: "News",
    featured: true,
    feedUrl: "https://feeds.npr.org/500005/podcast.xml",
  },
  {
    slug: "the-daily",
    title: "The Daily",
    publisher: "The New York Times",
    category: "News",
    featured: true,
    feedUrl: "https://feeds.simplecast.com/54nAGcIl",
  },
  {
    slug: "up-first",
    title: "Up First",
    publisher: "NPR",
    category: "News",
    featured: true,
    feedUrl: "https://feeds.npr.org/510318/podcast.xml",
  },
  {
    slug: "cnn-5-things",
    title: "CNN 5 Things",
    publisher: "CNN",
    category: "News",
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
];
