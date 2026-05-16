import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanDisplayText } from "./display-text";

export type PollRecord = {
  id: string;
  user_id: string;
  username: string | null;
  question: string;
  category: string;
  related_article_id: string | null;
  related_article_title: string | null;
  related_source: string | null;
  status: string;
  created_at: string | null;
};

export type PollOptionRecord = {
  id: string;
  poll_id: string;
  option_text: string;
  created_at: string | null;
};

export type PollVoteRecord = {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at: string | null;
};

export type PollOptionResult = {
  id: string;
  optionText: string;
  voteCount: number;
  percentage: number;
};

export type PollWithResults = PollRecord & {
  options: PollOptionResult[];
  totalVotes: number;
  userVoteOptionId: string | null;
  creatorAvatarUrl: string | null;
  heartCount: number;
  userHasHearted: boolean;
  commentCount: number;
};

const POLL_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "should",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
]);

const POLL_NEWS_KEYWORDS = [
  "bill",
  "border",
  "budget",
  "campaign",
  "ceasefire",
  "climate",
  "congress",
  "court",
  "crime",
  "economy",
  "election",
  "federal",
  "government",
  "health",
  "housing",
  "immigration",
  "inflation",
  "justice",
  "law",
  "market",
  "mayor",
  "military",
  "policy",
  "president",
  "prime minister",
  "public",
  "regulation",
  "sanctions",
  "school",
  "senate",
  "strike",
  "supreme court",
  "tariff",
  "tax",
  "trade",
  "treaty",
  "vote",
  "war",
  "white house",
];

export function normalizePollQuestion(value: string) {
  return cleanDisplayText(value).replace(/\s+/g, " ").trim();
}

export function getPollKeywords(value: string) {
  return normalizePollQuestion(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !POLL_STOP_WORDS.has(token));
}

export function getPollFeedScore(poll: PollWithResults) {
  const createdAtTimestamp = poll.created_at ? new Date(poll.created_at).getTime() : 0;
  const ageHours = createdAtTimestamp
    ? Math.max(0, (Date.now() - createdAtTimestamp) / (1000 * 60 * 60))
    : 999;
  const recencyBoost = Math.max(0, 120 - ageHours) / 120;

  return (
    poll.heartCount * 5 +
    poll.commentCount * 4 +
    poll.totalVotes * 3 +
    recencyBoost * 6
  );
}

export function isNewsRelatedPoll(
  question: string,
  category: string,
  relatedArticleTitle?: string | null
) {
  if (relatedArticleTitle?.trim()) {
    return true;
  }

  const normalizedQuestion = normalizePollQuestion(question).toLowerCase();
  const normalizedCategory = category.trim().toLowerCase();
  const keywords = getPollKeywords(normalizedQuestion);

  return (
    keywords.length >= 3 ||
    POLL_NEWS_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword)) ||
    Boolean(normalizedCategory)
  );
}

export function validatePollDraft(input: {
  question: string;
  options: string[];
  category: string;
  relatedArticleTitle?: string | null;
}) {
  const question = normalizePollQuestion(input.question);
  const category = input.category.trim();
  const options = input.options
    .map((option) => cleanDisplayText(option).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!category) {
    return "Choose a category for your poll.";
  }

  if (question.length < 12) {
    return "Write a fuller question for your poll.";
  }

  if (options.length < 2) {
    return "Add at least two answer options.";
  }

  if (options.length > 4) {
    return "Use between two and four answer options.";
  }

  if (!isNewsRelatedPoll(question, category, input.relatedArticleTitle)) {
    return "Polls should be related to news, current events, or public issues.";
  }

  return null;
}

export function isPollSchemaMissingError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /relation .*polls.* does not exist|relation .*poll_options.* does not exist|relation .*poll_votes.* does not exist|relation .*poll_hearts.* does not exist|relation .*poll_comments.* does not exist|Could not find the table .*polls|Could not find the table .*poll_options|Could not find the table .*poll_votes|Could not find the table .*poll_hearts|Could not find the table .*poll_comments/i.test(
    message
  );
}

export function getPollSchemaSetupMessage() {
  return "Polls are not set up in Supabase yet. Run the polls migration, then try again.";
}

export async function hydratePolls(
  supabase: SupabaseClient,
  polls: PollRecord[],
  currentUserId?: string | null
) {
  if (polls.length === 0) {
    return [] as PollWithResults[];
  }

  const pollIds = polls.map((poll) => poll.id);

  const [
    { data: optionsData, error: optionsError },
    { data: votesData, error: votesError },
    { data: heartsData, error: heartsError },
    { data: commentsData, error: commentsError },
    { data: profilesData, error: profilesError },
  ] =
    await Promise.all([
      supabase
        .from("poll_options")
        .select("id, poll_id, option_text, created_at")
        .in("poll_id", pollIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("poll_votes")
        .select("id, poll_id, option_id, user_id, created_at")
        .in("poll_id", pollIds),
      supabase
        .from("poll_hearts")
        .select("id, poll_id, user_id, created_at")
        .in("poll_id", pollIds),
      supabase
        .from("poll_comments")
        .select("id, poll_id")
        .in("poll_id", pollIds),
      supabase
        .from("profiles")
        .select("id, avatar_url")
        .in(
          "id",
          Array.from(new Set(polls.map((poll) => poll.user_id).filter(Boolean) as string[]))
        ),
    ]);

  if (optionsError) {
    console.error("Error loading poll options:", optionsError);
  }

  if (votesError) {
    console.error("Error loading poll votes:", votesError);
  }

  if (heartsError && !isPollSchemaMissingError(heartsError.message)) {
    console.error("Error loading poll hearts:", heartsError);
  }

  if (commentsError && !isPollSchemaMissingError(commentsError.message)) {
    console.error("Error loading poll comments:", commentsError);
  }

  if (profilesError) {
    console.error("Error loading poll creator profiles:", profilesError);
  }

  const options = ((optionsData ?? []) as PollOptionRecord[]).reduce(
    (map, option) => {
      const pollOptions = map.get(option.poll_id) ?? [];
      pollOptions.push(option);
      map.set(option.poll_id, pollOptions);
      return map;
    },
    new Map<string, PollOptionRecord[]>()
  );

  const votes = ((votesData ?? []) as PollVoteRecord[]).reduce(
    (map, vote) => {
      const pollVotes = map.get(vote.poll_id) ?? [];
      pollVotes.push(vote);
      map.set(vote.poll_id, pollVotes);
      return map;
    },
    new Map<string, PollVoteRecord[]>()
  );

  const hearts = (((heartsData ?? []) as { poll_id: string; user_id: string | null }[]) ?? []).reduce(
    (map, heart) => {
      const pollHearts = map.get(heart.poll_id) ?? [];
      pollHearts.push(heart);
      map.set(heart.poll_id, pollHearts);
      return map;
    },
    new Map<string, { poll_id: string; user_id: string | null }[]>()
  );

  const commentCountByPoll = (((commentsData ?? []) as { poll_id: string }[]) ?? []).reduce(
    (map, comment) => {
      map.set(comment.poll_id, (map.get(comment.poll_id) ?? 0) + 1);
      return map;
    },
    new Map<string, number>()
  );

  const avatarByUserId = (((profilesData ?? []) as { id: string; avatar_url: string | null }[]) ?? []).reduce(
    (map, profile) => {
      map.set(profile.id, profile.avatar_url ?? null);
      return map;
    },
    new Map<string, string | null>()
  );

  return polls.map((poll) => {
    const pollOptions = options.get(poll.id) ?? [];
    const pollVotes = votes.get(poll.id) ?? [];
    const pollHearts = hearts.get(poll.id) ?? [];
    const totalVotes = pollVotes.length;
    const voteCountByOption = new Map<string, number>();

    pollVotes.forEach((vote) => {
      voteCountByOption.set(vote.option_id, (voteCountByOption.get(vote.option_id) ?? 0) + 1);
    });

    const userVoteOptionId =
      currentUserId
        ? pollVotes.find((vote) => vote.user_id === currentUserId)?.option_id ?? null
        : null;
    const heartCount = pollHearts.length;
    const userHasHearted = currentUserId
      ? pollHearts.some((heart) => heart.user_id === currentUserId)
      : false;

    return {
      ...poll,
      question: normalizePollQuestion(poll.question),
      creatorAvatarUrl: avatarByUserId.get(poll.user_id) ?? null,
      heartCount,
      userHasHearted,
      commentCount: commentCountByPoll.get(poll.id) ?? 0,
      options: pollOptions.map((option) => {
        const voteCount = voteCountByOption.get(option.id) ?? 0;

        return {
          id: option.id,
          optionText: cleanDisplayText(option.option_text),
          voteCount,
          percentage: totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0,
        };
      }),
      totalVotes,
      userVoteOptionId,
    } satisfies PollWithResults;
  });
}

export function applyPollVoteUpdate(
  polls: PollWithResults[],
  pollId: string,
  optionId: string
) {
  return polls.map((poll) => {
    if (poll.id !== pollId || poll.userVoteOptionId) {
      return poll;
    }

    const nextTotalVotes = poll.totalVotes + 1;

    return {
      ...poll,
      totalVotes: nextTotalVotes,
      userVoteOptionId: optionId,
      options: poll.options.map((option) => {
        const voteCount = option.id === optionId ? option.voteCount + 1 : option.voteCount;

        return {
          ...option,
          voteCount,
          percentage: nextTotalVotes > 0 ? Math.round((voteCount / nextTotalVotes) * 100) : 0,
        };
      }),
    };
  });
}

export function getPollTrendingScore(poll: PollWithResults) {
  const publishedAt = poll.created_at ? new Date(poll.created_at).getTime() : 0;
  const ageHours = publishedAt
    ? Math.max(0, (Date.now() - publishedAt) / (1000 * 60 * 60))
    : 120;
  const recencyScore =
    ageHours <= 24 ? 1 : ageHours <= 72 ? 0.75 : Math.max(0.18, 0.45 * Math.exp(-(ageHours - 72) / 120));

  return poll.totalVotes * 1.35 + poll.heartCount * 1.1 + recencyScore * 14;
}

export function formatPollTimestamp(timestamp?: string | null) {
  if (!timestamp) {
    return "Recent";
  }

  const parsed = new Date(timestamp).getTime();

  if (Number.isNaN(parsed)) {
    return "Recent";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed) / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
