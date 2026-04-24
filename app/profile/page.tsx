"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type UserState = {
  id: string | null;
  email: string | null;
} | null;

type MyComment = {
  id: number;
  text: string;
  article_id: number;
  username: string | null;
  user_id: string | null;
};

const CATEGORY_OPTIONS = [
  "Business",
  "Tech",
  "Sports",
  "Politics",
  "Health",
  "Science",
  "Entertainment",
  "World",
];

export default function Profile() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);

  const loadProfileForUser = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, categories, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    setUsername(profile?.username ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setCategories(profile?.categories ?? []);

    const { data: comments } = await supabase
      .from("comments")
      .select("id, text, article_id, username, user_id")
      .eq("user_id", userId);

    setMyComments((comments ?? []) as MyComment[]);
  };

  useEffect(() => {
    async function loadUser() {
      setIsLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setCurrentUser({
        id: user?.id ?? null,
        email: user?.email ?? null,
      });

      if (!user?.id) {
        setUsername("");
        setAvatarUrl("");
        setCategories([]);
        setMyComments([]);
        setIsLoading(false);
        return;
      }

      await loadProfileForUser(user.id);
      setIsLoading(false);
    }

    loadUser();
  }, []);

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Sign-up successful.");
  };

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      return;
    }

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    setCurrentUser({
      id: user?.id ?? null,
      email: user?.email ?? null,
    });

    if (user?.id) {
      await loadProfileForUser(user.id);
    }

    setMessage("Signed in.");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUsername("");
    setAvatarUrl("");
    setCategories([]);
    setMyComments([]);
    setMessage("Signed out.");
  };

  const handleSaveUsername = async () => {
    if (!currentUser?.id) {
      setMessage("Log in first.");
      return;
    }

    if (!username.trim()) {
      setMessage("Enter a username.");
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      email: currentUser.email,
      username: username.trim(),
      categories,
      avatar_url: avatarUrl,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Profile saved.");
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!currentUser?.id) {
      setMessage("Log in to manage comments.");
      return;
    }

    setActiveCommentAction(`delete-${commentId}`);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", currentUser.id);

    setActiveCommentAction(null);

    if (error) {
      console.error("Error deleting comment:", error);
      setMessage("Could not delete comment.");
      return;
    }

    setMyComments((prev) => prev.filter((comment) => comment.id !== commentId));
    setMessage("Comment deleted.");
  };

  const handleReportComment = async (commentId: number) => {
    if (!currentUser?.id) {
      setMessage("Log in to report comments.");
      return;
    }

    const reason = window.prompt("Why are you reporting this comment?");

    if (reason === null) {
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setMessage("Please add a reason for the report.");
      return;
    }

    setActiveCommentAction(`report-${commentId}`);

    const { error } = await supabase.from("reports").insert({
      comment_id: commentId,
      user_id: currentUser.id,
      reason: trimmedReason,
    });

    setActiveCommentAction(null);

    if (error) {
      console.error("Error reporting comment:", error);
      setMessage("Could not submit report.");
      return;
    }

    setMessage("Report submitted.");
  };

  const initials = username.trim().charAt(0).toUpperCase() || "N";

  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Profile Studio</p>
        <h2 className="page-title">Shape your news identity.</h2>
        <p className="page-subtitle">
          Update your username, avatar, and favorite categories while keeping
          your comments and account details in one place.
        </p>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <strong>Loading profile</strong>
          <span>Fetching your account, categories, and comment history.</span>
        </div>
      ) : (
        <div className="split-grid">
          <section className="section-card stack">
            <div className="profile-hero">
              <div className="avatar-shell">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Profile"
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
                <h3 className="profile-name">{username || "News Reader"}</h3>
                <span className="muted">
                  {currentUser?.email ?? "Not signed in"}
                </span>
                <span className="chip">
                  {categories.length} categories selected
                </span>
              </div>
            </div>

            <div className="input-row">
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                className="input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="toolbar">
              <button className="button button-secondary" onClick={handleSignUp}>
                Sign Up
              </button>
              <button className="button button-accent" onClick={handleSignIn}>
                Log In
              </button>
              <button className="button button-secondary" onClick={handleSignOut}>
                Log Out
              </button>
            </div>

            <div className="input-row">
              <input
                className="input"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <input
                className="input"
                type="text"
                placeholder="Profile picture URL"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>

            <div className="stack">
              <strong>Selected categories</strong>
              <div className="category-grid">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    className={`category-pill ${
                      categories.includes(cat) ? "category-pill-active" : ""
                    }`}
                    onClick={() =>
                      setCategories((prev) =>
                        prev.includes(cat)
                          ? prev.filter((current) => current !== cat)
                          : [...prev, cat]
                      )
                    }
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <button className="button button-accent" onClick={handleSaveUsername}>
              Save Profile
            </button>

            {message ? <div className="chip chip-accent">{message}</div> : null}

            <div className="profile-grid">
              <div className="comment-card">
                <strong>Current user</strong>
                <div className="muted">{currentUser?.email ?? "Not signed in"}</div>
              </div>
              <div className="comment-card">
                <strong>Username</strong>
                <div className="muted">{username || "None"}</div>
              </div>
            </div>
          </section>

          <section className="section-card stack">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                My Comments
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Your conversation history
              </h3>
            </div>

            {myComments.length === 0 ? (
              <div className="empty-state">
                <strong>No comments yet</strong>
                <span>Your comments on articles will show up here.</span>
              </div>
            ) : (
              <div className="comment-list">
                {myComments.map((comment) => (
                  <div key={comment.id} className="comment-card">
                    <div className="comment-header">
                      <strong>Article #{comment.article_id}</strong>
                      <span className="chip">Your comment</span>
                    </div>
                    <div className="muted comment-body">
                      {comment.text}
                    </div>
                    <div className="comment-actions">
                      <button
                        className="comment-action"
                        onClick={() => handleReportComment(comment.id)}
                        disabled={activeCommentAction === `report-${comment.id}`}
                      >
                        {activeCommentAction === `report-${comment.id}`
                          ? "Reporting..."
                          : "Report"}
                      </button>
                      <button
                        className="comment-action comment-action-danger"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={activeCommentAction === `delete-${comment.id}`}
                      >
                        {activeCommentAction === `delete-${comment.id}`
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
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
