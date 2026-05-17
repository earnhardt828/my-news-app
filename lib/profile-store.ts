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
  "local_city",
  "local_state",
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
  local_city: string | null;
  local_state: string | null;
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
    local_city: null,
    local_state: null,
    bio: null,
    avatar_url: null,
    categories: [],
    preferred_sources: [],
    show_less_sources: [],
    username_last_changed_at: null,
  };
}

function hasMissingProfileColumnsError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return ["contact_email", "local_city", "local_state"].some((column) =>
    message.includes(column)
  );
}

async function upsertProfileRow(payload: Record<string, unknown>) {
  let response = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (hasMissingProfileColumnsError(response.error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.contact_email;
    delete fallbackPayload.local_city;
    delete fallbackPayload.local_state;

    response = await supabase
      .from("profiles")
      .upsert(fallbackPayload, { onConflict: "id" });
  }

  return response;
}

async function selectProfileRow(user: ProfileUserRef) {
  const primaryResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (!hasMissingProfileColumnsError(primaryResult.error)) {
    return primaryResult;
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS_FALLBACK)
    .eq("id", user.id)
    .maybeSingle();

  const fallbackData =
    fallbackResult.data && typeof fallbackResult.data === "object"
      ? (fallbackResult.data as Omit<AppProfileRecord, "contact_email" | "local_city" | "local_state">)
      : null;

  return {
    data: fallbackData
      ? {
          ...fallbackData,
          contact_email: null,
          local_city: null,
          local_state: null,
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

  const { error: upsertError } = await upsertProfileRow(seed);

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

  const { error } = await upsertProfileRow(payload);

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
