"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "../components/loading-screen";
import SourceBadge from "../components/source-badge";
import { slugifySourceName } from "../../lib/source-logos";
import { supabase } from "../../lib/supabase";

type SourceRatingRow = {
  id: string;
  source_name: string;
  rating: "like" | "dislike";
};

type RankedSource = {
  sourceName: string;
  likes: number;
  dislikes: number;
  netScore: number;
};

export default function SourceRankingsPage() {
  const [ratings, setRatings] = useState<SourceRatingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadRatings() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setRatings([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("source_ratings")
        .select("id, source_name, rating");

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
        dislikes: 0,
        netScore: 0,
      };

      if (rating.rating === "like") {
        current.likes += 1;
      } else {
        current.dislikes += 1;
      }

      current.netScore = current.likes - current.dislikes;
      map.set(rating.source_name, current);
    });

    return [...map.values()].sort((a, b) => {
      if (b.netScore !== a.netScore) {
        return b.netScore - a.netScore;
      }

      if (b.likes !== a.likes) {
        return b.likes - a.likes;
      }

      return a.sourceName.localeCompare(b.sourceName);
    });
  }, [ratings]);

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
                <span>👍 {source.likes}</span>
                <span>👎 {source.dislikes}</span>
                <strong>{source.netScore >= 0 ? `+${source.netScore}` : source.netScore}</strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
