"use client";

import Image from "next/image";
import Link from "next/link";
import { type ChangeEvent, useEffect, useState } from "react";
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
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);

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
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
              />
            </div>

            <div className="comment-card">
              <strong>Profile image</strong>
              <div className="muted" style={{ marginTop: "6px" }}>
                {isUploadingAvatar
                  ? "Uploading image..."
                  : "Choose an image file to upload it to Supabase Storage."}
              </div>
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

          <div className="stack">
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

            <section className="section-card stack">
              <div>
                <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                  Settings & Legal
                </p>
                <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                  Privacy, terms, and safety
                </h3>
              </div>

              <div className="comment-list">
                <Link href="/privacy" className="comment-card">
                  <strong>Privacy Policy</strong>
                  <div className="muted" style={{ marginTop: "6px" }}>
                    Review how account, comments, and profile data are handled.
                  </div>
                </Link>

                <Link href="/terms" className="comment-card">
                  <strong>Terms of Use</strong>
                  <div className="muted" style={{ marginTop: "6px" }}>
                    See the basic rules for using the app and posting content.
                  </div>
                </Link>

                <Link href="/community-guidelines" className="comment-card">
                  <strong>Community Guidelines</strong>
                  <div className="muted" style={{ marginTop: "6px" }}>
                    Learn what behavior is expected in comments and reports.
                  </div>
                </Link>
              </div>

              <div className="comment-card">
                <strong>Report abuse or safety issue</strong>
                <div className="muted" style={{ marginTop: "6px" }}>
                  Placeholder contact: support@mirur.app
                </div>
              </div>
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
