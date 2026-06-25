"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { apiFetch } from "../../lib/api-base";
import PollCard from "../components/poll-card";
import {
  ensureProfileRow,
  saveProfilePatch,
  type AppProfileRecord,
} from "../../lib/profile-store";
import {
  hydratePolls,
  POLL_PUBLIC_STATUSES,
  POLL_SELECT_BASE,
  POLL_SELECT_WITH_IMAGE,
  withPollImageColumnFallback,
  type PollRecord,
  type PollWithResults,
} from "../../lib/polls";
import { cleanDisplayText } from "../../lib/display-text";
import { SUPPORTED_LOCAL_CITIES } from "../../lib/local-news";
import { isUsernameAllowed } from "../../lib/moderation";
import { MY_NEWS_DISABLED, POLLS_DISABLED } from "../../lib/feature-flags";
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

type ProfileRow = Omit<AppProfileRecord, "id" | "email">;
type ProfileUserRef = {
  id: string;
  email?: string | null;
};

function splitSupportedCity(cityLabel: string) {
  const [city = "", state = ""] = cityLabel.split(",").map((value) => value.trim());
  return {
    city: city || null,
    state: state || null,
  };
}

function isMissingCommentMetadataColumnError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return /article_title|article_source|article_image|article_url/i.test(message);
}

function warnCommentReactionsLoad(error: unknown) {
  const reactionError = (error ?? {}) as {
    message?: string | null;
    code?: string | null;
    details?: string | null;
  };

  console.warn("COMMENT_REACTIONS_LOAD_WARNING", {
    message: reactionError.message ?? null,
    code: reactionError.code ?? null,
    details: reactionError.details ?? null,
  });
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
    cleanDisplayText(normalizedStoredTitle) ||
    cleanDisplayText(
      normalizedArticleId !== null ? articleTitleLookup.get(normalizedArticleId) : null
    ) ||
    cleanDisplayText(normalizedArticleUrl ? articleUrlLookup.get(normalizedArticleUrl) : null) ||
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
  const [localCityLabel, setLocalCityLabel] = useState("");
  const [selectedSignUpCity, setSelectedSignUpCity] = useState("");
  const [draftLocalCityLabel, setDraftLocalCityLabel] = useState("");
  const [isSavingLocalCity, setIsSavingLocalCity] = useState(false);
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
  const [myPolls, setMyPolls] = useState<PollWithResults[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const profileRef = useRef<ProfileRow>({
    username: null,
    contact_email: null,
    local_city: null,
    local_state: null,
    bio: null,
    categories: [],
    avatar_url: null,
    username_last_changed_at: null,
    preferred_sources: [],
    show_less_sources: [],
  });
  const authFlashMessage =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("message") === "create-poll-login"
        ? "Log in to create a poll."
        : window.location.hash === "#signed-out"
        ? "Logged out."
        : window.location.hash === "#account-deleted"
          ? "Your account has been deleted."
          : window.location.hash === "#create-poll-login"
            ? "Log in to create a poll."
          : ""
      : "";

  useEffect(() => {
    if (MY_NEWS_DISABLED) {
      console.log("PROFILE_MY_NEWS_CATEGORIES_HIDDEN", true);
    }
  }, []);

  const clearProfileState = useCallback(() => {
    setUsername("");
    setDraftUsername("");
    setIsEditingUsername(false);
    setAvatarUrl("");
    setBio("");
    setDraftBio("");
    setIsEditingBio(false);
    setCategories([]);
    setLocalCityLabel("");
    setDraftLocalCityLabel("");
    setMyComments([]);
    setMyPolls([]);
    profileRef.current = {
      username: null,
      contact_email: null,
      local_city: null,
      local_state: null,
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
      local_city: string | null;
      local_state: string | null;
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
        local_city: updates?.local_city ?? profileRef.current.local_city,
        local_state: updates?.local_state ?? profileRef.current.local_state,
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
      setLocalCityLabel(
        payload.local_city && payload.local_state
          ? `${payload.local_city}, ${payload.local_state}`
          : ""
      );
      setDraftLocalCityLabel(
        payload.local_city && payload.local_state
          ? `${payload.local_city}, ${payload.local_state}`
          : ""
      );
      profileRef.current = {
        username: payload.username,
        contact_email: payload.contact_email,
        local_city: payload.local_city,
        local_state: payload.local_state,
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
    setLocalCityLabel(
      profile.local_city && profile.local_state
        ? `${profile.local_city}, ${profile.local_state}`
        : ""
    );
    setDraftLocalCityLabel(
      profile.local_city && profile.local_state
        ? `${profile.local_city}, ${profile.local_state}`
        : ""
    );
    profileRef.current = {
      username: profile.username,
      contact_email: profile.contact_email,
      local_city: profile.local_city,
      local_state: profile.local_state,
      bio: profile.bio,
      categories: profile.categories ?? [],
      avatar_url: profile.avatar_url,
      username_last_changed_at: profile.username_last_changed_at,
      preferred_sources: profile.preferred_sources ?? [],
      show_less_sources: profile.show_less_sources ?? [],
    };

    const [commentsRes, pollsRes, reactionsRes, newsRes] = await Promise.allSettled([
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
      withPollImageColumnFallback(
        () =>
          supabase
            .from("polls")
            .select(POLL_SELECT_WITH_IMAGE)
            .eq("user_id", user.id)
            .in("status", [...POLL_PUBLIC_STATUSES])
            .order("created_at", { ascending: false })
            .limit(6),
        () =>
          supabase
            .from("polls")
            .select(POLL_SELECT_BASE)
            .eq("user_id", user.id)
            .in("status", [...POLL_PUBLIC_STATUSES])
            .order("created_at", { ascending: false })
            .limit(6)
      ),
      supabase
        .from("comment_reactions")
        .select("comment_id, reaction_type"),
      apiFetch("/api/news"),
    ]);

    if (pollsRes.status === "rejected") {
      console.error("Error loading profile polls:", pollsRes.reason);
      setMyPolls([]);
    } else if (pollsRes.value.error) {
      console.error("Error loading profile polls:", pollsRes.value.error);
      setMyPolls([]);
    } else {
      const hydratedPolls = await hydratePolls(
        supabase,
        ((pollsRes.value.data ?? []) as PollRecord[]),
        user.id
      );
      setMyPolls(hydratedPolls);
    }

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

    let commentReactions: { comment_id: number; reaction_type: string }[] = [];

    if (reactionsRes.status === "rejected") {
      warnCommentReactionsLoad(reactionsRes.reason);
    } else if (reactionsRes.value.error) {
      warnCommentReactionsLoad(reactionsRes.value.error);
    } else {
      commentReactions = reactionsRes.value.data ?? [];
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
    const reactions = commentReactions;

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

    const metadataCity =
      typeof user.user_metadata?.local_city === "string"
        ? user.user_metadata.local_city.trim()
        : "";
    const metadataState =
      typeof user.user_metadata?.local_state === "string"
        ? user.user_metadata.local_state.trim()
        : "";

    if (
      metadataCity &&
      metadataState &&
      (!profileRef.current.local_city || !profileRef.current.local_state)
    ) {
      const persistedProfile = await saveProfilePatch(
        {
          id: user.id,
          email: user.email ?? null,
        },
        {
          local_city: metadataCity,
          local_state: metadataState,
        }
      );

      if (!persistedProfile.error && persistedProfile.data) {
        const profile = persistedProfile.data;
        setLocalCityLabel(`${profile.local_city}, ${profile.local_state}`);
        setDraftLocalCityLabel(`${profile.local_city}, ${profile.local_state}`);
        profileRef.current = {
          username: profile.username,
          contact_email: profile.contact_email,
          local_city: profile.local_city,
          local_state: profile.local_state,
          bio: profile.bio,
          categories: profile.categories ?? [],
          avatar_url: profile.avatar_url,
          username_last_changed_at: profile.username_last_changed_at,
          preferred_sources: profile.preferred_sources ?? [],
          show_less_sources: profile.show_less_sources ?? [],
        };
      }
    }

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

    const trimmedIdentifier = email.trim();

    if (!trimmedIdentifier || !trimmedIdentifier.includes("@")) {
      setMessage("Enter a valid email to sign up.");
      return;
    }

    if (!selectedSignUpCity) {
      setMessage("Choose your city to finish signing up.");
      return;
    }

    const { city: localCity, state: localState } = splitSupportedCity(selectedSignUpCity);

    const { data, error } = await supabase.auth.signUp({
      email: trimmedIdentifier,
      password,
      options: {
        data: {
          local_city: localCity,
          local_state: localState,
        },
      },
    });

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
    setSelectedSignUpCity("");
    setPendingConfirmationEmail(trimmedIdentifier);
    setResendCooldown(45);
    setSignUpNotice("Check your email to confirm your account.");
  };

  const handleSignIn = async () => {
    setMessage("");
    setSignUpNotice("");
    setResendStatus(null);

    const trimmedIdentifier = email.trim();

    if (!trimmedIdentifier) {
      setMessage("Enter your email or username.");
      return;
    }

    let resolvedEmail = trimmedIdentifier;

    if (!trimmedIdentifier.includes("@")) {
      const { data: matchingProfiles, error: lookupError } = await supabase
        .from("profiles")
        .select("id, email, username")
        .ilike("username", trimmedIdentifier);

      if (lookupError) {
        setMessage(lookupError.message ?? "Could not look up that username.");
        return;
      }

      const matchedProfile = (matchingProfiles ?? []).find(
        (profile) =>
          (profile.username ?? "").trim().toLowerCase() ===
          trimmedIdentifier.toLowerCase()
      );

      if (!matchedProfile) {
        setMessage("Username not found.");
        return;
      }

      if (!matchedProfile.email) {
        setMessage("This username does not have a valid email on file.");
        return;
      }

      resolvedEmail = matchedProfile.email;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

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
      local_city: ensuredProfile.data.local_city,
      local_state: ensuredProfile.data.local_state,
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

  const handleLocalCitySave = async () => {
    if (!currentUser?.id) {
      setMessage("Log in first.");
      return;
    }

    if (!draftLocalCityLabel) {
      setMessage("Choose your city first.");
      return;
    }

    const { city, state } = splitSupportedCity(draftLocalCityLabel);

    if (!city || !state) {
      setMessage("Choose a supported city.");
      return;
    }

    setIsSavingLocalCity(true);

    const { error } = await saveProfile({
      username: profileRef.current.username,
      bio: profileRef.current.bio,
      categories: profileRef.current.categories ?? categories,
      avatar_url: profileRef.current.avatar_url,
      local_city: city,
      local_state: state,
      username_last_changed_at: profileRef.current.username_last_changed_at,
      preferred_sources: profileRef.current.preferred_sources ?? [],
      show_less_sources: profileRef.current.show_less_sources ?? [],
    });

    setIsSavingLocalCity(false);

    if (error) {
      setMessage(error.message ?? "Could not save your local city.");
      return;
    }

    setMessage("Local city updated.");
  };

  const initials = username.trim().charAt(0).toUpperCase() || "N";
  const isSignedIn = Boolean(currentUser?.id);
  const currentUserId = currentUser?.id ?? "";
  const totalPollLikesReceived = useMemo(
    () => myPolls.reduce((sum, poll) => sum + Math.max(0, poll.heartCount ?? 0), 0),
    [myPolls]
  );
  const totalCommentLikesReceived = useMemo(
    () => myComments.reduce((sum, comment) => sum + Math.max(0, comment.hearts ?? 0), 0),
    [myComments]
  );
  const totalLikesReceived = totalPollLikesReceived + totalCommentLikesReceived;

  return (
    <section className="page-shell profile-page-root">
      <div className="muted" style={{ padding: "8px 16px", textAlign: "center" }}>
        Profile page loaded
      </div>
      {isLoading ? (
        <div className="muted" style={{ padding: "8px 16px", textAlign: "center" }}>
          Checking your account and saved activity.
        </div>
      ) : null}
      {!isSignedIn ? (
        <div className="profile-auth-shell">
          <section className="section-card stack profile-auth-card">
            <div className="stack profile-auth-brand">
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
                type="text"
                placeholder="Email or username"
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

            <div className="input-row">
              <select
                className="input"
                value={selectedSignUpCity}
                onChange={(event) => setSelectedSignUpCity(event.target.value)}
              >
                <option value="">Choose your city</option>
                {SUPPORTED_LOCAL_CITIES.map((city) => (
                  <option key={city.displayName} value={city.displayName}>
                    {city.displayName}
                  </option>
                ))}
              </select>
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
              <div
                className={
                  (message || authFlashMessage) === "Username updated."
                    ? "profile-inline-note"
                    : "chip chip-accent"
                }
              >
                {message || authFlashMessage}
              </div>
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
        <div className="split-grid profile-page-shell">
          <section className="section-card stack profile-main-card">
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
                <div className="profile-meta-header">
                  <span className="profile-section-label">Profile</span>
                </div>
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
                  {!MY_NEWS_DISABLED ? <span className="chip">{categories.length} categories selected</span> : null}
                  <Link href={`/user/${currentUserId}/`} className="chip chip-accent">
                    View public profile
                  </Link>
                </div>
                <div className="profile-stats-row" aria-label="Profile stats">
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{myPolls.length}</span>
                    <span className="profile-stat-label">Polls</span>
                  </div>
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{myComments.length}</span>
                    <span className="profile-stat-label">Comments</span>
                  </div>
                  <div className="profile-stat-block">
                    <span className="profile-stat-value">{totalLikesReceived}</span>
                    <span className="profile-stat-label">Likes Received</span>
                  </div>
                </div>
                {isUploadingAvatar ? (
                  <span className="muted">Uploading image...</span>
                ) : isSavingInlineUsername ? (
                  <span className="muted">Saving username...</span>
                ) : null}
              </div>
            </div>

            <div className="stack profile-content-stack">
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

              <Link href="/profile/following/" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Following</strong>
                  <span>See who you follow and manage your list.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

              <div className="profile-divider" />

              <div className="settings-list-row settings-list-row-static">
                <div className="settings-list-copy">
                  <strong>Local City</strong>
                  <span>{localCityLabel || "Choose your city for Local news and weather."}</span>
                </div>
              </div>

              <div className="settings-inline-fields">
                <select
                  className="input"
                  value={draftLocalCityLabel}
                  onChange={(event) => setDraftLocalCityLabel(event.target.value)}
                  disabled={isSavingLocalCity}
                >
                  <option value="">Choose your city</option>
                  {SUPPORTED_LOCAL_CITIES.map((city) => (
                    <option key={city.displayName} value={city.displayName}>
                      {city.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleLocalCitySave}
                  disabled={isSavingLocalCity || !draftLocalCityLabel}
                >
                  {isSavingLocalCity ? "Saving..." : "Save city"}
                </button>
              </div>

              {!MY_NEWS_DISABLED ? (
                <>
                  <div className="profile-divider" />

                  <Link href="/profile/categories/" className="settings-list-row">
                    <div className="settings-list-copy">
                      <strong>My News Categories</strong>
                      <span>Add or edit the topics used for your personalized news section.</span>
                    </div>
                    <span className="settings-chevron" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                </>
              ) : null}

              <div className="profile-divider" />

              <Link href="/profile/comments/" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>My Comments</strong>
                  <span>Review and manage your recent comments.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

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

            {!POLLS_DISABLED ? (
              <div className="stack">
                <section className="section-card stack">
                  <div className="profile-section-row">
                    <h3 className="profile-section-title">Your Polls</h3>
                    <Link
                      href="/profile/polls/new/"
                      className="profile-section-icon-button"
                      aria-label="Create a poll"
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

                  <span className="muted">
                    Create news-related polls and see how people respond.
                  </span>

                  {myPolls.length === 0 ? (
                    <div className="empty-state">
                      <strong>No polls yet</strong>
                      <span>Start a poll tied to a current story, public issue, or debate.</span>
                    </div>
                  ) : (
                    <div className="stack">
                      {myPolls.map((poll) => (
                        <PollCard key={poll.id} poll={poll} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}
        </div>
      )}
    </section>
  );
}
