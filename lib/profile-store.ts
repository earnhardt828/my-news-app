import { supabase } from "./supabase";

type ProfileUserRef = {
  id: string;
  email?: string | null;
};

export const PROFILE_SELECT_FIELDS = [
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
    bio: null,
    avatar_url: null,
    categories: [],
    preferred_sources: [],
    show_less_sources: [],
    username_last_changed_at: null,
  };
}

export async function ensureProfileRow(user: ProfileUserRef) {
  const seed = {
    id: user.id,
    email: user.email ?? null,
  };

  const { error: upsertError } = await supabase.from("profiles").upsert(seed);

  if (upsertError) {
    return {
      data: null as AppProfileRecord | null,
      error: upsertError,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

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
  const payload: AppProfileRecord = {
    ...current,
    ...updates,
    id: user.id,
    email: updates.email ?? user.email ?? current.email ?? null,
    categories: updates.categories ?? current.categories ?? [],
    preferred_sources: updates.preferred_sources ?? current.preferred_sources ?? [],
    show_less_sources: updates.show_less_sources ?? current.show_less_sources ?? [],
  };

  const { error } = await supabase.from("profiles").upsert(payload);

  if (error) {
    return {
      data: null as AppProfileRecord | null,
      error,
    };
  }

  return {
    data: payload,
    error: null,
  };
}
