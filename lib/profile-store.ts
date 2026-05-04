import { supabase } from "./supabase";

type ProfileUserRef = {
  id: string;
  email?: string | null;
};

export const PROFILE_SELECT_FIELDS = [
  "id",
  "email",
  "username",
  "contact_email",
  "bio",
  "avatar_url",
  "categories",
  "preferred_sources",
  "show_less_sources",
  "username_last_changed_at",
].join(", ");

const PROFILE_SELECT_FIELDS_FALLBACK = [
  "id",
  "email",
  "username",
  "bio",
  "avatar_url",
  "categories",
  "preferred_sources",
  "show_less_sources",
  "username_last_changed_at",
].join(", ");

export type AppProfileRecord = {
  id: string;
  email: string | null;
  username: string | null;
  contact_email: string | null;
  bio: string | null;
  avatar_url: string | null;
  categories: string[] | null;
  preferred_sources: string[] | null;
  show_less_sources: string[] | null;
  username_last_changed_at: string | null;
};

export function getDefaultProfileRecord(user: ProfileUserRef): AppProfileRecord {
  return {
    id: user.id,
    email: user.email ?? null,
    username: null,
    contact_email: null,
    bio: null,
    avatar_url: null,
    categories: [],
    preferred_sources: [],
    show_less_sources: [],
    username_last_changed_at: null,
  };
}

function isMissingContactEmailColumnError(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("contact_email"));
}

async function selectProfileRow(user: ProfileUserRef) {
  const primaryResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (!isMissingContactEmailColumnError(primaryResult.error)) {
    return primaryResult;
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS_FALLBACK)
    .eq("id", user.id)
    .maybeSingle();

  const fallbackData =
    fallbackResult.data && typeof fallbackResult.data === "object"
      ? (fallbackResult.data as Omit<AppProfileRecord, "contact_email">)
      : null;

  return {
    data: fallbackData
      ? {
          ...fallbackData,
          contact_email: null,
        }
      : null,
    error: fallbackResult.error,
  };
}

export async function ensureProfileRow(user: ProfileUserRef) {
  const seed = {
    id: user.id,
    email: user.email ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(seed, { onConflict: "id" });

  if (upsertError) {
    return {
      data: null as AppProfileRecord | null,
      error: upsertError,
    };
  }

  const { data, error } = await selectProfileRow(user);

  return {
    data: (data as AppProfileRecord | null) ?? getDefaultProfileRecord(user),
    error,
  };
}

export async function saveProfilePatch(user: ProfileUserRef, updates: Partial<AppProfileRecord>) {
  const ensured = await ensureProfileRow(user);

  if (ensured.error || !ensured.data) {
    return {
      data: null as AppProfileRecord | null,
      error: ensured.error ?? new Error("Could not load profile."),
    };
  }

  const current = ensured.data;
  const payload = {
    ...current,
    ...updates,
    id: user.id,
    email: updates.email ?? user.email ?? current.email ?? null,
    categories: updates.categories ?? current.categories ?? [],
    preferred_sources: updates.preferred_sources ?? current.preferred_sources ?? [],
    show_less_sources: updates.show_less_sources ?? current.show_less_sources ?? [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    return {
      data: null as AppProfileRecord | null,
      error,
    };
  }

  const refreshed = await selectProfileRow(user);

  if (refreshed.error) {
    return {
      data: null as AppProfileRecord | null,
      error: refreshed.error,
    };
  }

  return {
    data: (refreshed.data as AppProfileRecord | null) ?? getDefaultProfileRecord(user),
    error: null,
  };
}
