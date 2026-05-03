"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import LoadingScreen from "../components/loading-screen";
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
  likes: number;
  dislikes: number;
};

type RawProfileComment = Omit<MyComment, "likes" | "dislikes" | "article_title"> & {
  article_title?: string | null;
};

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
    article_id: number;
    article_title?: string | null;
  },
  articleTitleLookup: Map<number, string>
) {
  return (
    comment.article_title?.trim() ||
    articleTitleLookup.get(comment.article_id) ||
    "Article unavailable"
  );
}

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
  const router = useRouter();
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
  const [activeCommentAction, setActiveCommentAction] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [openCommentMenuId, setOpenCommentMenuId] = useState<number | null>(null);
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
      fetch("/api/news"),
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
          article_title: resolveCommentArticleTitle(comment, new Map()),
          likes: 0,
          dislikes: 0,
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
          article_title: resolveCommentArticleTitle(comment, new Map()),
          likes: 0,
          dislikes: 0,
        }))
      );
      return;
    }

    const newsArticles =
      newsRes.status === "fulfilled" && newsRes.value.ok
        ? ((((await newsRes.value.json()) as { id: number; title: string }[]) ?? []))
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
      newsArticles.map((article) => [article.id, article.title])
    );
    const reactions = reactionsRes.value.data ?? [];

    const enrichedComments = ((commentsRes.value.data ?? []) as RawProfileComment[])
      .map((comment) => ({
        ...comment,
        article_title: resolveCommentArticleTitle(comment, articleTitleLookup),
        likes: reactions.filter(
          (reaction) =>
            reaction.comment_id === comment.id && reaction.reaction_type === "like"
        ).length,
        dislikes: reactions.filter(
          (reaction) =>
            reaction.comment_id === comment.id && reaction.reaction_type === "dislike"
        ).length,
      }));

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
      setMessage("Username already taken.");
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
    setOpenCommentMenuId(null);
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
    setOpenCommentMenuId(null);
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

  useEffect(() => {
    if (openCommentMenuId === null) {
      return;
    }

    const closeMenu = () => {
      setOpenCommentMenuId(null);
    };

    window.addEventListener("click", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
    };
  }, [openCommentMenuId]);

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : !isSignedIn ? (
        <div className="profile-auth-shell">
          <section className="section-card stack profile-auth-card">
            <div className="stack" style={{ gap: "8px" }}>
              <Image
                src="/reflekt-logo.png"
                alt="Reflekt"
                width={96}
                height={96}
                className="profile-auth-logo"
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

            <section className="section-card stack">
              <div className="profile-section-row">
                <h3 className="profile-section-title">My Comments</h3>
                <Link
                  href="/profile/comments"
                  className="profile-section-icon-button"
                  aria-label="Open all comments"
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

              {myComments.length === 0 ? (
                <div className="empty-state">
                  <strong>No comments yet</strong>
                  <span>Your comments on articles will show up here.</span>
                </div>
              ) : (
                <div className="comment-list">
                  {myComments.slice(0, 3).map((comment) => (
                    <div
                      key={comment.id}
                      className="comment-card profile-comment-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setOpenCommentMenuId(null);
                        router.push(`/article/${comment.article_id}#comment-${comment.id}`);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOpenCommentMenuId(null);
                          router.push(`/article/${comment.article_id}#comment-${comment.id}`);
                        }
                      }}
                    >
                      <div className="profile-comment-toprow">
                        <strong className="profile-comment-article-title">
                          {comment.article_title}
                        </strong>
                        <div className="profile-comment-menu-wrap">
                          <button
                            type="button"
                            className="profile-comment-menu-button"
                            aria-label="Open comment actions"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenCommentMenuId((current) =>
                                current === comment.id ? null : comment.id
                              );
                            }}
                          >
                            <span aria-hidden="true">⋯</span>
                          </button>
                          {openCommentMenuId === comment.id ? (
                            <div
                              className="profile-comment-menu"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                className="profile-comment-menu-item"
                                type="button"
                                onClick={() => openReportModal(comment.id)}
                              >
                                Report
                              </button>
                              {comment.user_id === currentUserId ? (
                                <button
                                  className="profile-comment-menu-item profile-comment-menu-item-danger"
                                  type="button"
                                  onClick={() => openDeleteModal(comment.id)}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="comment-body">
                        <strong>{comment.username ?? "You"}</strong>{" "}
                        <span className="muted">{comment.text}</span>
                      </div>
                      <div className="profile-comment-footer">
                        <div className="comment-meta">
                          {formatRelativeTime(comment.created_at)}
                        </div>
                        <div className="profile-comment-reaction-summary">
                          <span className="profile-comment-reaction-item">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M7 11v8" />
                              <path d="M11 19h6.2a2 2 0 0 0 1.9-1.4l1.2-4a2 2 0 0 0-1.9-2.6H14V6.8c0-1-.8-1.8-1.8-1.8-.6 0-1.1.3-1.5.8L7 11Z" />
                            </svg>
                            <span>{comment.likes}</span>
                          </span>
                          <span className="profile-comment-reaction-item">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M17 13V5" />
                              <path d="M13 5H6.8a2 2 0 0 0-1.9 1.4l-1.2 4a2 2 0 0 0 1.9 2.6H10v4.2c0 1 .8 1.8 1.8 1.8.6 0 1.1-.3 1.5-.8L17 13Z" />
                            </svg>
                            <span>{comment.dislikes}</span>
                          </span>
                        </div>
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
