"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "../components/loading-screen";
import SourceBadge from "../components/source-badge";
import { slugifySourceName } from "../../lib/source-logos";
import { supabase } from "../../lib/supabase";

type SourceRatingRow = {
  id: string;
  user_id: string;
  source_name: string;
  rating: "like" | "dislike";
};

type RankedSource = {
  sourceName: string;
  likes: number;
};

export default function SourceRankingsPage() {
  const [ratings, setRatings] = useState<SourceRatingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadRatings() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);

      const { data, error } = await supabase
        .from("source_ratings")
        .select("id, user_id, source_name, rating");

      if (error) {
        console.error("Error loading source rankings:", error);
        setRatings([]);
        setIsLoading(false);
        return;
      }

      setRatings((data ?? []) as SourceRatingRow[]);
      setIsLoading(false);
    }

    void loadRatings();
  }, []);

  const rankedSources = useMemo(() => {
    const map = new Map<string, RankedSource>();

    ratings.forEach((rating) => {
      const current = map.get(rating.source_name) ?? {
        sourceName: rating.source_name,
        likes: 0,
      };

      if (rating.rating === "like") {
        current.likes += 1;
      }

      map.set(rating.source_name, current);
    });

    return [...map.values()]
      .filter((source) => source.likes > 0)
      .sort((a, b) => {
        if (b.likes !== a.likes) {
          return b.likes - a.likes;
        }

        return a.sourceName.localeCompare(b.sourceName);
      });
  }, [ratings]);

  const handleToggleHeart = async (sourceName: string) => {
    if (!currentUserId) {
      alert("Log in to heart sources.");
      return;
    }

    const existingRating = ratings.find(
      (rating) => rating.user_id === currentUserId && rating.source_name === sourceName
    );

    if (existingRating?.rating === "like") {
      const { error } = await supabase
        .from("source_ratings")
        .delete()
        .eq("id", existingRating.id)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("Error clearing source heart:", error);
        return;
      }

      setRatings((prev) => prev.filter((rating) => rating.id !== existingRating.id));
      return;
    }

    const { data, error } = await supabase
      .from("source_ratings")
      .upsert(
        {
          user_id: currentUserId,
          source_name: sourceName,
          rating: "like",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source_name" }
      )
      .select("id, user_id, source_name, rating")
      .single();

    if (error) {
      console.error("Error saving source heart:", error);
      return;
    }

    setRatings((prev) => {
      const next = prev.filter(
        (rating) => !(rating.user_id === currentUserId && rating.source_name === sourceName)
      );
      return [...next, data as SourceRatingRow];
    });
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen label="Loading source rankings" />
      ) : rankedSources.length === 0 ? (
        <div className="empty-state">
          <strong>No source ratings yet</strong>
          <span>Rate news sources from their profile pages to build the rankings.</span>
        </div>
      ) : (
        <div className="source-rankings-list">
          {rankedSources.map((source, index) => (
            <Link
              key={source.sourceName}
              href={`/source/${slugifySourceName(source.sourceName)}`}
              className="source-rankings-row"
            >
              <span className="source-rankings-rank">#{index + 1}</span>
              <div className="source-rankings-brand">
                <SourceBadge sourceName={source.sourceName} />
                <span className="source-rankings-name">{source.sourceName}</span>
              </div>
              <div className="source-rankings-metrics">
                <button
                  type="button"
                  className={`icon-action-pill icon-action-pill-icon-only ${
                    ratings.find(
                      (rating) =>
                        rating.user_id === currentUserId &&
                        rating.source_name === source.sourceName &&
                        rating.rating === "like"
                    )
                      ? "icon-action-pill-active"
                      : ""
                  }`}
                  aria-label="Heart source"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleToggleHeart(source.sourceName);
                  }}
                >
                  <span className="icon-action-glyph" aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill={
                        ratings.find(
                          (rating) =>
                            rating.user_id === currentUserId &&
                            rating.source_name === source.sourceName &&
                            rating.rating === "like"
                        )
                          ? "currentColor"
                          : "none"
                      }
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
  );
}
