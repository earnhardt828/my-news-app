"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
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
  created_at: string | null;
};

type SavedArticle = {
  id: number;
  article_id: number;
  title: string;
  source: string;
  category: string;
  time: string;
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

export default function Profile() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [message, setMessage] = useState("");
  const [signUpNotice, setSignUpNotice] = useState("");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [draftUsername, setDraftUsername] = useState("");
  const [isSavingInlineUsername, setIsSavingInlineUsername] = useState(false);
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const clearProfileState = useCallback(() => {
    setUsername("");
    setDraftUsername("");
    setIsEditingUsername(false);
    setAvatarUrl("");
    setCategories([]);
    setMyComments([]);
    setSavedArticles([]);
  }, []);

  const saveProfile = async (nextAvatarUrl?: string) => {
    if (!currentUser?.id) {
      return { error: new Error("Log in first.") };
    }

    return supabase.from("profiles").upsert({
      id: currentUser.id,
      email: currentUser.email,
      username: username.trim() || null,
      categories,
      avatar_url: nextAvatarUrl ?? avatarUrl,
    });
  };

  const loadProfileForUser = useCallback(async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, categories, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    setUsername(profile?.username ?? "");
    setDraftUsername(profile?.username ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setCategories(profile?.categories ?? []);

    const { data: comments } = await supabase
      .from("comments")
      .select("id, text, article_id, username, user_id, created_at")
      .eq("user_id", userId);

    const { data: saved } = await supabase
      .from("saved_articles")
      .select("id, article_id, title, source, category, time")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    setMyComments((comments ?? []) as MyComment[]);
    setSavedArticles((saved ?? []) as SavedArticle[]);
  }, []);

  const syncSignedInProfile = useCallback(async (user: User | null) => {
    if (!user?.id) {
      setCurrentUser(null);
      clearProfileState();
      return false;
    }

    setCurrentUser({
      id: user.id,
      email: user.email ?? null,
    });

    await loadProfileForUser(user.id);
    return true;
  }, [clearProfileState, loadProfileForUser]);

  const refreshCurrentUserSession = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    return syncSignedInProfile(user);
  }, [syncSignedInProfile]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [resendCooldown]);

  useEffect(() => {
    const signedOut = searchParams.get("signed_out");
    const accountDeleted = searchParams.get("account_deleted");

    if (signedOut === "1") {
      setMessage("Logged out.");
    } else if (accountDeleted === "1") {
      setMessage("Your account has been deleted.");
    }
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      setIsLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isMounted) {
          return;
        }

        await syncSignedInProfile(user);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null;

      void (async () => {
        if (!isMounted) {
          return;
        }

        setIsLoading(true);

        try {
          await syncSignedInProfile(authUser);
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncSignedInProfile]);

  const handleSignUp = async () => {
    setMessage("");
    setSignUpNotice("");
    setResendStatus(null);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.session) {
      await supabase.auth.signOut();
    }

    clearProfileState();
    setCurrentUser(null);
    setPassword("");
    setPendingConfirmationEmail(email.trim());
    setResendCooldown(45);
    setSignUpNotice("Check your email to confirm your account.");
  };

  const handleSignIn = async () => {
    setMessage("");
    setSignUpNotice("");
    setResendStatus(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      return;
    }

    setIsLoading(true);

    try {
      await refreshCurrentUserSession();
      setMessage("Signed in.");
    } finally {
      setIsLoading(false);
    }
  };

  const startUsernameEdit = () => {
    setDraftUsername(username);
    setIsEditingUsername(true);
    setMessage("");
  };

  const cancelUsernameEdit = () => {
    setDraftUsername(username);
    setIsEditingUsername(false);
  };

  const handleInlineUsernameSave = async () => {
    if (!currentUser?.id) {
      setMessage("Log in first.");
      return;
    }

    const trimmedUsername = draftUsername.trim();

    if (!trimmedUsername) {
      setMessage("Enter a username.");
      return;
    }

    setIsSavingInlineUsername(true);

    const { data: matchingProfiles, error: availabilityError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", trimmedUsername);

    if (availabilityError) {
      setIsSavingInlineUsername(false);
      setMessage("Could not check username availability.");
      return;
    }

    const isTaken = (matchingProfiles ?? []).some(
      (profile) => profile.id !== currentUser.id
    );

    if (isTaken) {
      setIsSavingInlineUsername(false);
      setMessage("Username already taken.");
      return;
    }

    const previousUsername = username;
    setUsername(trimmedUsername);

    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      email: currentUser.email,
      username: trimmedUsername,
      categories,
      avatar_url: avatarUrl || null,
    });

    setIsSavingInlineUsername(false);

    if (error) {
      setUsername(previousUsername);
      setDraftUsername(previousUsername);
      setMessage(error.message ?? "Could not save username.");
      return;
    }

    setDraftUsername(trimmedUsername);
    setIsEditingUsername(false);
    setMessage("Username updated.");
  };

  const handleUsernameKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await handleInlineUsernameSave();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelUsernameEdit();
    }
  };

  const handleResendConfirmation = async () => {
    if (!pendingConfirmationEmail) {
      setResendStatus({
        type: "error",
        text: "Add your email and sign up again so we know where to resend it.",
      });
      return;
    }

    setIsResendingConfirmation(true);
    setResendStatus(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingConfirmationEmail,
    });

    setIsResendingConfirmation(false);

    if (error) {
      setResendStatus({
        type: "error",
        text: error.message ?? "Could not resend the confirmation email.",
      });
      return;
    }

    setResendCooldown(45);
    setResendStatus({
      type: "success",
      text: "Confirmation email sent again.",
    });
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

    const { error } = await saveProfile();

    if (error) {
      setMessage(error.message ?? "Could not save profile.");
      return;
    }

    setMessage("Profile saved.");
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!currentUser?.id) {
      setMessage("Log in before uploading a profile image.");
      event.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }

    setIsUploadingAvatar(true);
    setMessage("");

    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const filePath = `${currentUser.id}/avatar-${Date.now()}-${safeFilename}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading avatar:", uploadError);
      setIsUploadingAvatar(false);
      setMessage("Could not upload image. Please try a different file.");
      event.target.value = "";
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    const { error: profileError } = await saveProfile(publicUrl);

    setIsUploadingAvatar(false);
    event.target.value = "";

    if (profileError) {
      console.error("Error saving avatar URL:", profileError);
      setMessage("Image uploaded, but we could not save it to your profile.");
      return;
    }

    setAvatarUrl(publicUrl);
    setMessage("Profile image uploaded.");
  };

  const handleAvatarPickerOpen = () => {
    avatarInputRef.current?.click();
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

  const openDeleteModal = (commentId: number) => {
    setDeleteCommentId(commentId);
  };

  const closeDeleteModal = () => {
    if (deleteCommentId && activeCommentAction === `delete-${deleteCommentId}`) {
      return;
    }

    setDeleteCommentId(null);
  };

  const confirmDeleteComment = async () => {
    if (deleteCommentId === null) {
      return;
    }

    await handleDeleteComment(deleteCommentId);
    setDeleteCommentId(null);
  };

  const openReportModal = (commentId: number) => {
    if (!currentUser?.id) {
      setMessage("Log in to report comments.");
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
    if (!currentUser?.id || reportingCommentId === null) {
      setMessage("Log in to report comments.");
      return;
    }

    const trimmedReason = reportReason.trim();

    if (!trimmedReason) {
      setReportStatus({
        type: "error",
        text: "Please add a reason before submitting your report.",
      });
      return;
    }

    setActiveCommentAction(`report-${reportingCommentId}`);
    setReportStatus(null);

    const { error } = await supabase.from("reports").insert({
      comment_id: reportingCommentId,
      user_id: currentUser.id,
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

    setMessage("Report submitted.");
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

  const initials = username.trim().charAt(0).toUpperCase() || "N";
  const isSignedIn = Boolean(currentUser?.id);
  const currentUserId = currentUser?.id ?? "";

  return (
    <section className="page-shell">
      {isLoading ? (
        <div className="loading-state">
          <strong>Loading profile</strong>
          <span>Fetching your account, categories, and comment history.</span>
        </div>
      ) : !isSignedIn ? (
        <div className="profile-auth-shell">
          <section className="section-card stack profile-auth-card">
            <div className="stack" style={{ gap: "8px" }}>
              <h2 className="profile-name">Welcome to Mirur</h2>
              <p className="muted profile-auth-helper">
                Create an account to save your profile, comments, and feed.
              </p>
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

            <div className="toolbar profile-auth-actions">
              <button className="button button-accent" onClick={handleSignUp}>
                Sign Up
              </button>
              <button className="button button-secondary" onClick={handleSignIn}>
                Log In
              </button>
            </div>

            {message ? <div className="chip chip-accent">{message}</div> : null}
            {signUpNotice ? (
              <div className="status-message status-success">
                <strong>Check your email to confirm your account.</strong>
                <span>Didn&apos;t receive it? Resend email</span>
                <div className="profile-resend-row">
                  <button
                    className="button button-link-accent"
                    onClick={handleResendConfirmation}
                    disabled={isResendingConfirmation || resendCooldown > 0}
                    type="button"
                  >
                    {isResendingConfirmation
                      ? "Sending..."
                      : resendCooldown > 0
                        ? `Resend email in ${resendCooldown}s`
                        : "Resend email"}
                  </button>
                </div>
                {resendStatus ? (
                  <div
                    className={`status-message ${
                      resendStatus.type === "success"
                        ? "status-success"
                        : "status-error"
                    }`}
                  >
                    {resendStatus.text}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="split-grid">
          <section className="section-card stack">
            <div className="profile-hero">
              <button
                type="button"
                className="avatar-button"
                onClick={handleAvatarPickerOpen}
                disabled={isUploadingAvatar}
                aria-label="Change profile image"
              >
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
              </button>

              <div className="profile-meta">
                {isEditingUsername ? (
                  <div className="profile-name-editor">
                    <input
                      className="input profile-name-input"
                      type="text"
                      value={draftUsername}
                      onChange={(e) => setDraftUsername(e.target.value)}
                      onKeyDown={handleUsernameKeyDown}
                      autoFocus
                      disabled={isSavingInlineUsername}
                      placeholder="Choose a username"
                    />
                    <div className="profile-name-actions">
                      <button
                        type="button"
                        className="button button-secondary profile-inline-button"
                        onClick={cancelUsernameEdit}
                        disabled={isSavingInlineUsername}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="profile-name-button"
                    onClick={startUsernameEdit}
                  >
                    <h3 className="profile-name">{username || "News Reader"}</h3>
                  </button>
                )}
                <div className="profile-meta-row">
                  <span className="chip">{categories.length} categories selected</span>
                  <Link href={`/user/${currentUserId}`} className="chip chip-accent">
                    View public profile
                  </Link>
                </div>
                {isUploadingAvatar ? (
                  <span className="muted">Uploading image...</span>
                ) : (
                  <span className="muted">Tap your avatar to change your profile photo.</span>
                )}
              </div>
            </div>

            <div className="stack">
              <strong>Favorite categories</strong>
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

            <div className="input-row profile-hidden-input-row">
              <input
                ref={avatarInputRef}
                className="input"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
                hidden
              />
            </div>

            <button className="button button-accent" onClick={handleSaveUsername}>
              Save Profile Changes
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

          <div className="stack">
            <section className="section-card stack">
              <div>
                <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                  Saved
                </p>
                <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                  Bookmarked articles
                </h3>
              </div>

              {savedArticles.length === 0 ? (
                <div className="empty-state">
                  <strong>No saved articles yet</strong>
                  <span>Save articles from the feed and they will appear here.</span>
                </div>
              ) : (
                <div className="comment-list">
                  {savedArticles.map((article) => (
                    <div key={article.id} className="comment-card">
                      <strong>{article.title}</strong>
                      <div className="comment-meta">
                        {article.category} · {article.source} · {article.time}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                      <div className="comment-meta">
                        {formatRelativeTime(comment.created_at)}
                      </div>
                      <div className="comment-actions">
                        <button
                          className="comment-action"
                          onClick={() => openReportModal(comment.id)}
                          disabled={activeCommentAction === `report-${comment.id}`}
                        >
                          {activeCommentAction === `report-${comment.id}`
                            ? "Reporting..."
                            : "Report"}
                        </button>
                        <button
                          className="comment-action comment-action-danger"
                          onClick={() => openDeleteModal(comment.id)}
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
        </div>
      )}

      {reportingCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-report-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="profile-report-title" className="modal-title">
                Report comment
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Share what happened so this comment can be reviewed.
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

      {deleteCommentId !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-delete-title">
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="profile-delete-title" className="modal-title">
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
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger"
                onClick={confirmDeleteComment}
                disabled={activeCommentAction === `delete-${deleteCommentId}`}
              >
                {activeCommentAction === `delete-${deleteCommentId}`
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
