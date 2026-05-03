"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type ProfileRecord = {
  username: string | null;
  avatar_url: string | null;
};

type UserComment = {
  id: number;
  article_id: number;
  text: string;
  username: string | null;
};

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [comments, setComments] = useState<UserComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUserProfile() {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      const { data: commentData } = await supabase
        .from("comments")
        .select("id, article_id, text, username")
        .eq("user_id", userId);

      setProfile((profileData ?? null) as ProfileRecord | null);
      setComments((commentData ?? []) as UserComment[]);
      setIsLoading(false);
    }

    loadUserProfile();
  }, [userId]);

  const displayName = profile?.username || "Graffiti user";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">User Profile</p>
        <h2 className="page-title">{displayName}</h2>
        <p className="page-subtitle">
          Explore this user&apos;s profile and recent comments across Graffiti.
        </p>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <strong>Loading profile</strong>
          <span>Fetching profile details and comment history.</span>
        </div>
      ) : (
        <div className="split-grid">
          <section className="section-card stack">
            <div className="profile-hero">
              <div className="avatar-shell">
                {profile?.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={displayName}
                    width={84}
                    height={84}
                    unoptimized
                    style={{
                      width: "84px",
                      height: "84px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span className="avatar-fallback">{initials}</span>
                )}
              </div>

              <div className="profile-meta">
                <h3 className="profile-name">{displayName}</h3>
                <span className="muted">Public Graffiti profile</span>
                <span className="chip">{comments.length} comments</span>
              </div>
            </div>

            <div className="comment-card">
              <strong>Username</strong>
              <div className="muted" style={{ marginTop: "6px" }}>
                {profile?.username ?? "Not set"}
              </div>
            </div>

            <Link href="/" className="button button-secondary">
              Back to Trending
            </Link>
          </section>

          <section className="section-card stack">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                Comments
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Recent conversation
              </h3>
            </div>

            {comments.length === 0 ? (
              <div className="empty-state">
                <strong>No comments yet</strong>
                <span>This user has not posted any comments yet.</span>
              </div>
            ) : (
              <div className="comment-list">
                {comments.map((comment) => (
                  <div key={comment.id} className="comment-card">
                    <strong>Article #{comment.article_id}</strong>
                    <div className="muted comment-body">{comment.text}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
