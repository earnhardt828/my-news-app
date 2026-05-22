"use client";

import AdSlot from "../components/ad-slot";
import ArticleReaderButton from "../components/article-reader-button";
import PollCard from "../components/poll-card";
import SourceBadge from "../components/source-badge";
import SourcePreferenceSheet from "../components/source-preference-sheet";
import Link from "next/link";
import { useEffect, useState } from "react";
import ShareButton from "../components/share-button";
import {
  getBestArticleImage,
  isLikelyHighQualityArticleImage,
  shouldUseLargeArticleImage,
  shouldSuppressLowQualityArticleImage,
} from "../../lib/article-images";
import { getCategoryLabel } from "../../lib/categories";
import { cleanDisplayText } from "../../lib/display-text";
import {
  applyPollVoteUpdate,
  getPollTrendingScore,
  hydratePolls,
  type PollRecord,
  type PollWithResults,
} from "../../lib/polls";
import { ensureProfileRow, saveProfilePatch } from "../../lib/profile-store";
import { formatRelativeTimestamp } from "../../lib/relative-time";
import { slugifySourceName } from "../../lib/source-logos";
import { supabase } from "../../lib/supabase";

type FeedArticle = {
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
  thumbnail?: string | null;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  saved: boolean;
};

export default function MyFeed() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [showLessSources, setShowLessSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeSaveArticleId, setActiveSaveArticleId] = useState<number | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string | null>(null);
  const [isSavingSourcePreference, setIsSavingSourcePreference] = useState(false);
  const [followedPolls, setFollowedPolls] = useState<PollWithResults[]>([]);
  const [activePollVoteId, setActivePollVoteId] = useState<string | null>(null);
  const [failedArticleImages, setFailedArticleImages] = useState<Record<string, boolean>>({});
  const [lowQualityArticleImages, setLowQualityArticleImages] = useState<Record<string, boolean>>(
    {}
  );
  const [sourcePreferenceStatus, setSourcePreferenceStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadFeed() {
      setIsLoading(true);

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.id) {
        setUserId(null);
        setUserEmail(null);
        setArticles([]);
        setFollowedPolls([]);
        setCategories([]);
        setPreferredSources([]);
        setShowLessSources([]);
        setIsLoading(false);
        return;
      }

      setUserId(userData.user.id);
      setUserEmail(userData.user.email ?? null);

      const { data: profile, error: profileError } = await ensureProfileRow({
        id: userData.user.id,
        email: userData.user.email ?? null,
      });

      if (profileError) {
        console.error("Error loading My Feed profile:", profileError);
      }

      const userCategories = profile?.categories ?? [];
      setCategories(userCategories);
      setPreferredSources(profile?.preferred_sources ?? []);
      setShowLessSources(profile?.show_less_sources ?? []);
      console.log("MY FEED CATEGORIES", userCategories);

      const [
        { data: followRowsData },
        recentPollsResult,
      ] = await Promise.all([
        supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", userData.user.id),
        supabase
          .from("polls")
          .select(
            "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
          )
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      const followedUserIds = Array.from(
        new Set([
          userData.user.id,
          ...(((followRowsData ?? []) as { following_id: string }[]).map(
            (followRow) => followRow.following_id
          )),
        ])
      );

      const { data: pollsData, error: pollsError } = followedUserIds.length
        ? await supabase
            .from("polls")
            .select(
              "id, user_id, username, question, category, related_article_id, related_article_title, related_source, status, created_at"
            )
            .eq("status", "active")
            .in("user_id", followedUserIds)
            .order("created_at", { ascending: false })
            .limit(24)
        : { data: [], error: null };

      if (pollsError || recentPollsResult.error) {
        console.error("Error loading Polls page polls:", pollsError ?? recentPollsResult.error);
        setFollowedPolls([]);
      } else {
        const mergedPollRows = [
          ...(((pollsData ?? []) as PollRecord[]) ?? []),
          ...(((recentPollsResult.data ?? []) as PollRecord[]) ?? []),
        ];
        const dedupedPollRows = Array.from(
          new Map(mergedPollRows.map((poll) => [poll.id, poll])).values()
        );
        const hydratedPolls = await hydratePolls(
          supabase,
          dedupedPollRows,
          userData.user.id
        );
        setFollowedPolls(
          [...hydratedPolls].sort((left, right) => {
            const recentDifference =
              new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();

            if (recentDifference !== 0) {
              return recentDifference;
            }

            return getPollTrendingScore(right) - getPollTrendingScore(left);
          })
        );
      }
      setArticles([]);
      console.log("MY FEED ARTICLES COUNT", 0);
      setIsLoading(false);
    }

    loadFeed();
  }, []);

  const handleToggleSaveArticle = async (article: FeedArticle) => {
    if (!userId) {
      alert("Log in to save articles");
      return;
    }

    setActiveSaveArticleId(article.id);

    if (article.saved) {
      const { error } = await supabase
        .from("saved_articles")
        .delete()
        .eq("user_id", userId)
        .eq("article_id", article.id);

      setActiveSaveArticleId(null);

      if (error) {
        console.error("Error removing saved article:", error);
        alert(error.message ?? "Could not remove saved article");
        return;
      }

      setArticles((prev) =>
        prev.map((currentArticle) =>
          currentArticle.id === article.id
            ? { ...currentArticle, saved: false }
            : currentArticle
        )
      );

      return;
    }

    const { error } = await supabase.from("saved_articles").upsert(
      {
        user_id: userId,
        article_id: article.id,
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

    setActiveSaveArticleId(null);

    if (error) {
      console.error("Error saving article:", error);
      alert(error.message ?? "Could not save article");
      return;
    }

    setArticles((prev) =>
      prev.map((currentArticle) =>
        currentArticle.id === article.id
          ? { ...currentArticle, saved: true }
          : currentArticle
      )
    );
  };

  const handleVoteOnPoll = async (pollId: string, optionId: string) => {
    if (!userId) {
      alert("Log in to vote in polls.");
      return;
    }

    const targetPoll = followedPolls.find((poll) => poll.id === pollId);

    if (!targetPoll || targetPoll.userVoteOptionId) {
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

    setFollowedPolls((prev) => applyPollVoteUpdate(prev, pollId, optionId));
  };

  const handleSaveSourcePreference = async (sourceName: string, mode: "prefer" | "show-less") => {
    if (!userId) {
      setSourcePreferenceStatus({
        type: "error",
        text: "Log in to customize sources.",
      });
      return;
    }

    const nextPreferredSources =
      mode === "prefer"
        ? preferredSources.includes(sourceName)
          ? preferredSources.filter((current) => current !== sourceName)
          : [...preferredSources, sourceName]
        : preferredSources.filter((current) => current !== sourceName);
    const nextShowLessSources =
      mode === "show-less"
        ? showLessSources.includes(sourceName)
          ? showLessSources.filter((current) => current !== sourceName)
          : [...showLessSources, sourceName]
        : showLessSources.filter((current) => current !== sourceName);

    setIsSavingSourcePreference(true);
    setSourcePreferenceStatus(null);

    const { error } = await saveProfilePatch(
      {
        id: userId,
        email: userEmail,
      },
      {
        id: userId,
        email: userEmail,
        categories,
        preferred_sources: nextPreferredSources,
        show_less_sources: nextShowLessSources,
      }
    );

    setIsSavingSourcePreference(false);

    if (error) {
      console.error("Error saving source preference:", error);
      setSourcePreferenceStatus({
        type: "error",
        text: error.message ?? "Could not save source preference.",
      });
      return;
    }

    setPreferredSources(nextPreferredSources);
    setShowLessSources(nextShowLessSources);
    setSourcePreferenceStatus({
      type: "success",
      text: "Source preference updated.",
    });
  };

  const myFeedItems: Array<
    | { type: "article"; key: string; article: FeedArticle }
    | { type: "poll"; key: string; poll: PollWithResults }
  > = articles.map((article) => ({
    type: "article" as const,
    key: `article:${article.id}`,
    article,
  }));

  followedPolls.forEach((poll, index) => {
    myFeedItems.splice(Math.min(myFeedItems.length, 2 + index * 5), 0, {
      type: "poll" as const,
      key: `poll:${poll.id}`,
      poll,
    });
  });

  return (
    <section className="page-shell">
      {isLoading ? (
        <div className="loading-state">
          <strong>Loading polls...</strong>
          <span>Pulling in recent community polls.</span>
        </div>
      ) : articles.length === 0 && followedPolls.length === 0 ? (
        <div className="empty-state">
          <strong>No polls yet</strong>
          <span>Create the first one.</span>
        </div>
      ) : (
        <div className="stack">
          {myFeedItems.map((item, index) => (
            <div key={item.key} className="stack">
              {item.type === "poll" ? (
                <PollCard
                  poll={item.poll}
                  onVote={handleVoteOnPoll}
                  isVoting={activePollVoteId === item.poll.id}
                />
              ) : (() => {
                const article = item.article;
                const selectedImage = getBestArticleImage(article);
                const imageSrc = selectedImage.src;
                const imageFailureKey = imageSrc
                  ? `${article.id}:${imageSrc}`
                  : `${article.id}:none`;
                const hasFailedImage = Boolean(failedArticleImages[imageFailureKey]);
                const isLowQualityImage = Boolean(lowQualityArticleImages[imageFailureKey]);
                const hasUsableImage = Boolean(imageSrc) && !hasFailedImage;
                const shouldUseHeroImage =
                  hasUsableImage &&
                  !isLowQualityImage &&
                  isLikelyHighQualityArticleImage(selectedImage.source, imageSrc);
                const shouldUseThumbnail = hasUsableImage && !shouldUseHeroImage;

                return (
                  <article className="news-card">
                    <Link
                      href={`/source/${slugifySourceName(article.source)}/`}
                      className="source-trigger source-trigger-tight my-feed-source-trigger"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <div className="trending-source-brand">
                        <SourceBadge sourceName={article.source} />
                        <span className="trending-source-name">{article.source}</span>
                      </div>
                    </Link>
                    <Link href={`/article/${article.id}/`} className="article-link">
                      <div
                        className={`news-card-body ${
                          shouldUseHeroImage
                            ? "news-card-body-with-hero"
                            : shouldUseThumbnail
                              ? "news-card-body-with-thumb"
                              : "news-card-body-text-only"
                        }`}
                      >
                        <div className="news-card-copy">
                          <div className="news-card-header">
                            <div className="news-meta">
                              <span>{formatRelativeTimestamp(article.publishedAt, article.time)}</span>
                            </div>
                          </div>

                          <span className="chip chip-accent trending-category-pill trending-category-pill-inline">
                            {getCategoryLabel(article.category)}
                          </span>

                          <h3 className="article-title">{cleanDisplayText(article.title)}</h3>

                          {shouldUseHeroImage ? (
                            <div className="article-hero-shell">
                              <img
                                src={imageSrc as string}
                                alt={cleanDisplayText(article.title)}
                                className="article-image article-image-hero"
                                loading="lazy"
                                decoding="async"
                                onLoad={(event) => {
                                  const target = event.currentTarget;

                                  if (
                                    !shouldUseLargeArticleImage(
                                      target.naturalWidth,
                                      target.naturalHeight
                                    )
                                  ) {
                                    setLowQualityArticleImages((prev) => {
                                      if (prev[imageFailureKey]) {
                                        return prev;
                                      }

                                      return {
                                        ...prev,
                                        [imageFailureKey]: true,
                                      };
                                    });
                                  }
                                }}
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
                          ) : null}
                        </div>

                        {shouldUseThumbnail ? (
                          <div className="article-thumb-shell">
                            <img
                              src={imageSrc as string}
                              alt={cleanDisplayText(article.title)}
                              className="article-thumb-image"
                              loading="lazy"
                              decoding="async"
                              onLoad={(event) => {
                                const target = event.currentTarget;

                                if (
                                  shouldSuppressLowQualityArticleImage(
                                    selectedImage.source,
                                    target.naturalWidth,
                                    target.naturalHeight
                                  )
                                ) {
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

                                if (
                                  !shouldUseLargeArticleImage(
                                    target.naturalWidth,
                                    target.naturalHeight
                                  )
                                ) {
                                  setLowQualityArticleImages((prev) => {
                                    if (prev[imageFailureKey]) {
                                      return prev;
                                    }

                                    return {
                                      ...prev,
                                      [imageFailureKey]: true,
                                    };
                                  });
                                }
                              }}
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
                        ) : null}
                      </div>
                    </Link>

                    <div className="engagement-row">
                      <ArticleReaderButton
                        title={cleanDisplayText(article.title)}
                        url={article.url}
                      />
                      <ShareButton
                        path={`/article/${article.id}`}
                        title={cleanDisplayText(article.title)}
                        url={article.url}
                      />
                      <button
                        className="button button-secondary"
                        onClick={() => handleToggleSaveArticle(article)}
                        disabled={activeSaveArticleId === article.id}
                      >
                        {activeSaveArticleId === article.id
                          ? "Saving..."
                          : article.saved
                            ? "Unsave"
                            : "Save"}
                      </button>
                    </div>
                  </article>
                );
              })()}

              {(index + 1) % 3 === 0 ? (
                <AdSlot
                  title="Sponsored placement"
                  copy="Personalized feed ad placeholder that keeps the layout balanced on mobile."
                  cta="Featured placement"
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      <SourcePreferenceSheet
        sourceName={activeSourceName}
        isOpen={activeSourceName !== null}
        isPreferred={activeSourceName ? preferredSources.includes(activeSourceName) : false}
        isShowLess={activeSourceName ? showLessSources.includes(activeSourceName) : false}
        isSaving={isSavingSourcePreference}
        status={sourcePreferenceStatus}
        onPrefer={() => {
          if (activeSourceName) {
            void handleSaveSourcePreference(activeSourceName, "prefer");
          }
        }}
        onShowLess={() => {
          if (activeSourceName) {
            void handleSaveSourcePreference(activeSourceName, "show-less");
          }
        }}
        onClose={() => {
          if (isSavingSourcePreference) {
            return;
          }

          setActiveSourceName(null);
          setSourcePreferenceStatus(null);
        }}
      />

    </section>
  );
}
