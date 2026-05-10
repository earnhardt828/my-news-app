"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { apiFetch } from "../../lib/api-base";
import {
  ensureProfileRow,
  saveProfilePatch,
  type AppProfileRecord,
} from "../../lib/profile-store";
import { getCategoryLabel } from "../../lib/categories";
import { isUsernameAllowed } from "../../lib/moderation";
import { supabase } from "../../lib/supabase";

type UserState = {
  id: string | null;
  email: string | null;
} | null;

type MyComment = {
  id: number;
  text: string;
  article_id: number;
  article_title: string;
  article_source?: string | null;
  article_image?: string | null;
  article_url?: string | null;
  username: string | null;
  user_id: string | null;
  created_at: string | null;
  hearts: number;
};

type RawProfileComment = Omit<MyComment, "hearts" | "article_title"> & {
  article_id: number | string;
  article_title?: string | null;
};

function normalizeArticleId(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

type SavedArticle = {
  id: number;
  article_id: number;
  title: string;
  source: string;
  category: string;
  time: string;
  url?: string | null;
  image?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

type ProfileRow = Omit<AppProfileRecord, "id" | "email">;
type ProfileUserRef = {
  id: string;
  email?: string | null;
};

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function resolveCommentArticleTitle(
  comment: {
    article_id: number | string;
    article_title?: string | null;
    article_url?: string | null;
  },
  articleTitleLookup: Map<number, string>,
  articleUrlLookup: Map<string, string>
) {
  const normalizedStoredTitle = comment.article_title?.replace(/\s+/g, " ").trim();
  const normalizedArticleUrl = comment.article_url?.trim() ?? "";
  const normalizedArticleId = normalizeArticleId(comment.article_id);

  return (
    normalizedStoredTitle ||
    (normalizedArticleId !== null ? articleTitleLookup.get(normalizedArticleId) : null) ||
    (normalizedArticleUrl ? articleUrlLookup.get(normalizedArticleUrl) : null) ||
    "Article"
  );
}

export default function Profile() {
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
  const [bio, setBio] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [draftUsername, setDraftUsername] = useState("");
  const [isSavingInlineUsername, setIsSavingInlineUsername] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [draftBio, setDraftBio] = useState("");
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const profileRef = useRef<ProfileRow>({
    username: null,
    contact_email: null,
    bio: null,
    categories: [],
    avatar_url: null,
    username_last_changed_at: null,
    preferred_sources: [],
    show_less_sources: [],
  });
  const authFlashMessage =
    typeof window !== "undefined"
      ? window.location.hash === "#signed-out"
        ? "Logged out."
        : window.location.hash === "#account-deleted"
          ? "Your account has been deleted."
          : ""
      : "";

  const clearProfileState = useCallback(() => {
    setUsername("");
    setDraftUsername("");
    setIsEditingUsername(false);
    setAvatarUrl("");
    setBio("");
    setDraftBio("");
    setIsEditingBio(false);
    setCategories([]);
    setMyComments([]);
    setSavedArticles([]);
    profileRef.current = {
      username: null,
      contact_email: null,
      bio: null,
      categories: [],
      avatar_url: null,
      username_last_changed_at: null,
      preferred_sources: [],
      show_less_sources: [],
    };
  }, []);

  const saveProfile = async (
    updates?: Partial<{
      username: string | null;
      bio: string | null;
      categories: string[];
      avatar_url: string | null;
      username_last_changed_at: string | null;
      preferred_sources: string[];
      show_less_sources: string[];
    }>
  ) => {
    if (!currentUser?.id) {
      return { error: new Error("Log in first.") };
    }

    const result = await saveProfilePatch(
      {
        id: currentUser.id,
        email: currentUser.email,
      },
      {
        id: currentUser.id,
        email: currentUser.email,
        username: updates?.username ?? (username.trim() || null),
        bio: updates?.bio ?? (bio.trim() || null),
        categories: updates?.categories ?? categories,
        avatar_url: updates?.avatar_url ?? (avatarUrl || null),
        username_last_changed_at:
          updates?.username_last_changed_at ?? profileRef.current.username_last_changed_at,
        preferred_sources:
          updates?.preferred_sources ?? profileRef.current.preferred_sources ?? [],
        show_less_sources:
          updates?.show_less_sources ?? profileRef.current.show_less_sources ?? [],
      }
    );

    if (!result.error && result.data) {
      const payload = result.data;
      setUsername(payload.username ?? "");
      setDraftUsername(payload.username ?? "");
      setBio(payload.bio ?? "");
      setDraftBio(payload.bio ?? "");
      setAvatarUrl(payload.avatar_url ?? "");
      setCategories(payload.categories ?? []);
      profileRef.current = {
        username: payload.username,
        contact_email: payload.contact_email,
        bio: payload.bio,
        categories: payload.categories ?? [],
        avatar_url: payload.avatar_url,
        username_last_changed_at: payload.username_last_changed_at,
        preferred_sources: payload.preferred_sources ?? [],
        show_less_sources: payload.show_less_sources ?? [],
      };
    }

    return result;
  };

  const loadProfileForUser = useCallback(async (user: ProfileUserRef) => {
    const { data: profile, error: profileError } = await ensureProfileRow(user);

    if (profileError || !profile) {
      console.error("Error loading profile row:", profileError);
      throw profileError ?? new Error("Could not load profile.");
    }

    setUsername(profile.username ?? "");
    setDraftUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setDraftBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setCategories(profile.categories ?? []);
    profileRef.current = {
      username: profile.username,
      contact_email: profile.contact_email,
      bio: profile.bio,
      categories: profile.categories ?? [],
      avatar_url: profile.avatar_url,
      username_last_changed_at: profile.username_last_changed_at,
      preferred_sources: profile.preferred_sources ?? [],
      show_less_sources: profile.show_less_sources ?? [],
    };

    const [commentsRes, savedRes, reactionsRes, newsRes] = await Promise.allSettled([
      (async () => {
        let response: {
          data: RawProfileComment[] | null;
          error: { message?: string | null } | null;
        } = await supabase
          .from("comments")
          .select(
            "id, text, article_id, article_title, article_source, article_image, article_url, username, user_id, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (
          response.error &&
          isMissingCommentMetadataColumnError(response.error.message)
        ) {
          console.error(
            "Profile comments metadata columns are missing, retrying with base columns:",
            response.error
          );

          response = await supabase
            .from("comments")
            .select("id, text, article_id, username, user_id, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
        }

        return response;
      })(),
      supabase
        .from("saved_articles")
        .select(
          "id, article_id, title, source, url, image, category, time, published_at, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("comment_reactions")
        .select("comment_id, reaction_type"),
      apiFetch("/api/news"),
    ]);

    if (savedRes.status === "rejected") {
      console.error("Error loading saved articles:", savedRes.reason);
      throw savedRes.reason;
    }

    if (savedRes.value.error) {
      console.error("Error loading saved articles:", savedRes.value.error);
      throw savedRes.value.error;
    }

    setSavedArticles((savedRes.value.data ?? []) as SavedArticle[]);

    if (commentsRes.status === "rejected") {
      console.error("Error loading profile comments:", commentsRes.reason);
      setMyComments([]);
      return;
    }

    if (commentsRes.value.error) {
      console.error("Error loading profile comments:", commentsRes.value.error);
      setMyComments([]);
      return;
    }

    if (reactionsRes.status === "rejected") {
      console.error("Error loading comment reactions:", reactionsRes.reason);
      setMyComments(
        ((commentsRes.value.data ?? []) as Omit<
          RawProfileComment,
          never
        >[]).map((comment) => ({
          ...comment,
          article_title: resolveCommentArticleTitle(comment, new Map(), new Map()),
          hearts: 0,
        }))
      );
      return;
    }

    if (reactionsRes.value.error) {
      console.error("Error loading comment reactions:", reactionsRes.value.error);
      setMyComments(
        ((commentsRes.value.data ?? []) as Omit<
          RawProfileComment,
          never
        >[]).map((comment) => ({
          ...comment,
          article_title: resolveCommentArticleTitle(comment, new Map(), new Map()),
          hearts: 0,
        }))
      );
      return;
    }

    const newsArticles =
      newsRes.status === "fulfilled" && newsRes.value.ok
        ? ((((await newsRes.value.json()) as {
            id: number;
            title: string;
            url?: string | null;
          }[]) ?? []))
        : [];

    if (newsRes.status === "rejected") {
      console.error("Error loading article titles for profile comments:", newsRes.reason);
    } else if (!newsRes.value.ok) {
      console.error("Error loading article titles for profile comments:", {
        status: newsRes.value.status,
        statusText: newsRes.value.statusText,
      });
    }

    const articleTitleLookup = new Map(
      newsArticles
        .map((article) => [normalizeArticleId(article.id), article.title] as const)
        .filter((entry): entry is [number, string] => entry[0] !== null)
    );
    const articleUrlLookup = new Map(
      newsArticles
        .filter(
          (article): article is { id: number; title: string; url: string } =>
            Boolean(article.url?.trim())
        )
        .map((article) => [article.url.trim(), article.title])
    );
    const reactions = reactionsRes.value.data ?? [];

    const enrichedComments = ((commentsRes.value.data ?? []) as RawProfileComment[])
      .map((comment) => {
        console.log("PROFILE COMMENT:", comment);

        // Older comments created before article metadata was stored can only be
        // backfilled when the current /api/news payload still contains a
        // matching article id or URL.
        return {
        ...comment,
        article_title: resolveCommentArticleTitle(
          comment,
          articleTitleLookup,
          articleUrlLookup
        ),
        hearts: reactions.filter(
          (reaction) =>
            reaction.comment_id === comment.id && reaction.reaction_type === "like"
        ).length,
      };
      });

    setMyComments(enrichedComments as MyComment[]);
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

    await loadProfileForUser({
      id: user.id,
      email: user.email ?? null,
    });
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

    if (!isUsernameAllowed(trimmedUsername)) {
      setMessage("That username is not available. Please choose another.");
      return;
    }

    setIsSavingInlineUsername(true);

    const ensuredProfile = await ensureProfileRow({
      id: currentUser.id,
      email: currentUser.email,
    });

    if (ensuredProfile.error || !ensuredProfile.data) {
      setIsSavingInlineUsername(false);
      setMessage(ensuredProfile.error?.message ?? "Could not prepare your profile.");
      return;
    }

    profileRef.current = {
      username: ensuredProfile.data.username,
      contact_email: ensuredProfile.data.contact_email,
      bio: ensuredProfile.data.bio,
      categories: ensuredProfile.data.categories ?? [],
      avatar_url: ensuredProfile.data.avatar_url,
      username_last_changed_at: ensuredProfile.data.username_last_changed_at,
      preferred_sources: ensuredProfile.data.preferred_sources ?? [],
      show_less_sources: ensuredProfile.data.show_less_sources ?? [],
    };

    const { data: matchingProfiles, error: availabilityError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", trimmedUsername);

    if (availabilityError) {
      setIsSavingInlineUsername(false);
      setMessage(availabilityError.message ?? "Could not check username availability.");
      return;
    }

    const isTaken = (matchingProfiles ?? []).some(
      (profile) => profile.id !== currentUser.id
    );

    if (isTaken) {
      setIsSavingInlineUsername(false);
      setMessage("That username is not available. Please choose another.");
      return;
    }

    const currentSavedUsername = profileRef.current.username?.trim() ?? "";
    const isRealUsernameChange =
      trimmedUsername.toLowerCase() !== currentSavedUsername.toLowerCase();
    const attemptedUsernameChangeAtIso = new Date().toISOString();

    if (isRealUsernameChange && profileRef.current.username_last_changed_at) {
      const lastChangedAt = new Date(profileRef.current.username_last_changed_at).getTime();
      const attemptedUsernameChangeAt = new Date(attemptedUsernameChangeAtIso).getTime();

      if (!Number.isNaN(lastChangedAt)) {
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;

        if (attemptedUsernameChangeAt - lastChangedAt < twentyFourHoursMs) {
          setIsSavingInlineUsername(false);
          setMessage("You can only change your username once per day.");
          return;
        }
      }
    }

    const previousUsername = username;
    setUsername(trimmedUsername);
    const nextUsernameChangedAt = isRealUsernameChange
      ? attemptedUsernameChangeAtIso
      : profileRef.current.username_last_changed_at;

    const { error } = await saveProfile({
      username: trimmedUsername,
      bio: profileRef.current.bio,
      categories: profileRef.current.categories ?? categories,
      avatar_url: profileRef.current.avatar_url,
      username_last_changed_at: nextUsernameChangedAt,
      preferred_sources: profileRef.current.preferred_sources ?? [],
      show_less_sources: profileRef.current.show_less_sources ?? [],
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

  const startBioEdit = () => {
    setDraftBio(bio);
    setIsEditingBio(true);
    setMessage("");
  };

  const cancelBioEdit = () => {
    setDraftBio(bio);
    setIsEditingBio(false);
  };

  const handleBioSave = async () => {
    if (!currentUser?.id) {
      setMessage("Log in first.");
      return;
    }

    setIsSavingBio(true);

    const nextBio = draftBio.trim();
    const previousBio = bio;
    setBio(nextBio);

    const { error } = await saveProfile({
      username: profileRef.current.username,
      bio: nextBio || null,
      categories: profileRef.current.categories ?? categories,
      avatar_url: profileRef.current.avatar_url,
      username_last_changed_at: profileRef.current.username_last_changed_at,
      preferred_sources: profileRef.current.preferred_sources ?? [],
      show_less_sources: profileRef.current.show_less_sources ?? [],
    });

    setIsSavingBio(false);

    if (error) {
      setBio(previousBio);
      setDraftBio(previousBio);
      setMessage(error.message ?? "Could not save bio.");
      return;
    }

    setIsEditingBio(false);
    setMessage("Bio updated.");
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
    const fileStamp = `${file.lastModified || "upload"}-${file.size}`;
    const filePath = `${currentUser.id}/avatar-${fileStamp}-${safeFilename}`;

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

    const { error: profileError } = await saveProfile({
      username: profileRef.current.username,
      bio: profileRef.current.bio,
      categories: profileRef.current.categories ?? categories,
      avatar_url: publicUrl,
      username_last_changed_at: profileRef.current.username_last_changed_at,
      preferred_sources: profileRef.current.preferred_sources ?? [],
      show_less_sources: profileRef.current.show_less_sources ?? [],
    });

    setIsUploadingAvatar(false);
    event.target.value = "";

    if (profileError) {
      console.error("Error saving avatar URL:", profileError);
      setMessage("Image uploaded, but we could not save it to your profile.");
      return;
    }

    setAvatarUrl(publicUrl);
    profileRef.current = {
      ...profileRef.current,
      avatar_url: publicUrl,
    };
    setMessage("Profile image uploaded.");
  };

  const handleAvatarPickerOpen = () => {
    avatarInputRef.current?.click();
  };

  const initials = username.trim().charAt(0).toUpperCase() || "N";
  const isSignedIn = Boolean(currentUser?.id);
  const currentUserId = currentUser?.id ?? "";
  const commentsCount = myComments.length;
  const likesReceivedCount = myComments.reduce(
    (sum, comment) => sum + comment.hearts,
    0
  );

  return (
    <section className="page-shell">
      {isLoading ? (
        <div className="loading-state">
          <strong>Loading profile...</strong>
          <span>Checking your account and saved activity.</span>
        </div>
      ) : !isSignedIn ? (
        <div className="profile-auth-shell">
          <section className="section-card stack profile-auth-card">
            <div className="stack" style={{ gap: "8px" }}>
              <Image
                src="/branding/graffiti-name-logo-transparent.png"
                alt="Graffiti"
                width={156}
                height={68}
                className="profile-auth-logo branding-image-light"
                priority
              />
              <Image
                src="/branding/graffiti-name-white-transparent.png"
                alt="Graffiti"
                width={156}
                height={68}
                className="profile-auth-logo branding-image-dark"
                priority
              />
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

            {message || authFlashMessage ? (
              <div className="chip chip-accent">{message || authFlashMessage}</div>
            ) : null}
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
                <div className="profile-stats-row" aria-label="Profile stats">
                  <div className="profile-stat-block">
                    <strong className="profile-stat-value">{commentsCount}</strong>
                    <span className="profile-stat-label">Comments</span>
                  </div>
                  <div className="profile-stat-block">
                    <strong className="profile-stat-value">{likesReceivedCount}</strong>
                    <span className="profile-stat-label">Likes Received</span>
                  </div>
                </div>
                <div className="profile-meta-row">
                  <span className="chip">{categories.length} categories selected</span>
                  <Link href={`/user/${currentUserId}`} className="chip chip-accent">
                    View public profile
                  </Link>
                </div>
                {isUploadingAvatar ? (
                  <span className="muted">Uploading image...</span>
                ) : isSavingInlineUsername ? (
                  <span className="muted">Saving username...</span>
                ) : null}
              </div>
            </div>

            <div className="stack">
              <div className="profile-bio-block">
                <span className="profile-section-label">Bio</span>
                {isEditingBio ? (
                  <div className="profile-bio-editor">
                    <textarea
                      className="input profile-bio-input"
                      value={draftBio}
                      onChange={(event) => setDraftBio(event.target.value)}
                      rows={3}
                      maxLength={220}
                      disabled={isSavingBio}
                      placeholder="Add a short bio"
                    />
                    <div className="profile-name-actions">
                      <button
                        type="button"
                        className="button button-secondary profile-inline-button"
                        onClick={cancelBioEdit}
                        disabled={isSavingBio}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button button-accent profile-inline-button"
                        onClick={handleBioSave}
                        disabled={isSavingBio}
                      >
                        {isSavingBio ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="profile-bio-button"
                    onClick={startBioEdit}
                  >
                    <p className={`profile-bio-text ${bio ? "" : "profile-bio-placeholder"}`}>
                      {bio || "Add a short bio"}
                    </p>
                  </button>
                )}
              </div>

              <div className="profile-divider" />

              <div className="profile-section-row">
                <strong className="profile-section-title-sm">Favorite categories</strong>
                <Link
                  href="/profile/categories"
                  className="profile-section-icon-button"
                  aria-label="Manage favorite categories"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </Link>
              </div>
              {categories.length === 0 ? (
                <div className="profile-categories-empty">No categories selected yet.</div>
              ) : (
                <div className="category-grid">
                  {categories.slice(0, 5).map((category) => (
                    <span key={category} className="category-pill category-pill-active">
                      {getCategoryLabel(category)}
                    </span>
                  ))}
                </div>
              )}
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

            {message ? <div className="chip chip-accent">{message}</div> : null}
          </section>

            <div className="stack">
              <section className="section-card stack">
              <div className="profile-section-row">
                <h3 className="profile-section-title">Bookmarked Articles</h3>
                <Link
                  href="/profile/bookmarks"
                  className="profile-section-icon-button"
                  aria-label="Open bookmarked articles"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </Link>
              </div>

              {savedArticles.length === 0 ? (
                <div className="empty-state">
                  <strong>No saved articles yet</strong>
                  <span>Save articles from the feed and they will appear here.</span>
                </div>
              ) : (
                <div className="comment-list">
                  {savedArticles.slice(0, 3).map((article) => (
                    <Link
                      key={article.id}
                      href={`/article/${article.article_id}`}
                      className="comment-card profile-saved-article-card"
                    >
                      <div className="profile-saved-article-copy">
                        <strong className="profile-saved-article-title">{article.title}</strong>
                        <div className="comment-meta">
                          {article.category} · {article.source} · {article.time}
                        </div>
                      </div>
                      {article.image ? (
                        <div
                          className="profile-saved-article-thumb"
                          role="img"
                          aria-label={article.title}
                          style={{ backgroundImage: `url(${article.image})` }}
                        />
                      ) : (
                        <div className="profile-saved-article-thumb profile-saved-article-thumb-placeholder">
                          {article.source.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      )}
    </section>
  );
}
