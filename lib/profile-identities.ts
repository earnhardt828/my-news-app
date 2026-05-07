import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileIdentityRecord = {
  id: string;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

type ProfileQueryResult<T extends ProfileIdentityRecord> = {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
};

function ensureUserIdColumn(columns: string) {
  return columns.includes("user_id") ? columns : columns.replace(/\bid\b/, "id, user_id");
}

function isMissingUserIdColumnError(error: { code?: string } | null) {
  return error?.code === "42703";
}

export function getProfileIdentity<T extends ProfileIdentityRecord>(profile: T | null | undefined) {
  if (!profile) {
    return null;
  }

  return profile.user_id ?? profile.id;
}

export async function fetchProfilesByIdentity<T extends ProfileIdentityRecord>(
  supabaseClient: SupabaseClient,
  identities: string[],
  columns: string
): Promise<ProfileQueryResult<T>> {
  if (identities.length === 0) {
    return { data: [], error: null };
  }

  const columnsWithUserId = ensureUserIdColumn(columns);
  const initialResult = await supabaseClient
    .from("profiles")
    .select(columnsWithUserId)
    .in("id", identities);

  if (isMissingUserIdColumnError(initialResult.error)) {
    const fallbackResult = await supabaseClient
      .from("profiles")
      .select(columns)
      .in("id", identities);

    return {
      data: (((fallbackResult.data ?? []) as unknown) as T[]) ?? null,
      error: fallbackResult.error,
    };
  }

  if (initialResult.error) {
    return {
      data: (((initialResult.data ?? []) as unknown) as T[]) ?? null,
      error: initialResult.error,
    };
  }

  const initialRows = (((initialResult.data ?? []) as unknown) as T[]) ?? [];
  const matchedIds = new Set<string>();

  initialRows.forEach((row) => {
    matchedIds.add(row.id);
    const identity = getProfileIdentity(row);
    if (identity) {
      matchedIds.add(identity);
    }
  });

  const missingIds = identities.filter((identity) => !matchedIds.has(identity));

  if (missingIds.length === 0) {
    return { data: initialRows, error: null };
  }

  const secondaryResult = await supabaseClient
    .from("profiles")
    .select(columnsWithUserId)
    .in("user_id", missingIds);

  if (secondaryResult.error) {
    return { data: initialRows, error: secondaryResult.error };
  }

  const mergedRows = new Map<string, T>();

  [...initialRows, ...((((secondaryResult.data ?? []) as unknown) as T[]) ?? [])].forEach(
    (row) => {
    const identity = getProfileIdentity(row) ?? row.id;
    mergedRows.set(identity, row);
    }
  );

  return {
    data: Array.from(mergedRows.values()),
    error: null,
  };
}

export async function searchProfilesByUsername<T extends ProfileIdentityRecord>(
  supabaseClient: SupabaseClient,
  query: string,
  columns: string,
  limit = 8
): Promise<ProfileQueryResult<T>> {
  const columnsWithUserId = ensureUserIdColumn(columns);
  const initialResult = await supabaseClient
    .from("profiles")
    .select(columnsWithUserId)
    .ilike("username", query)
    .limit(limit);

  if (isMissingUserIdColumnError(initialResult.error)) {
    const fallbackResult = await supabaseClient
      .from("profiles")
      .select(columns)
      .ilike("username", query)
      .limit(limit);

    return {
      data: (((fallbackResult.data ?? []) as unknown) as T[]) ?? null,
      error: fallbackResult.error,
    };
  }

  return {
    data: (((initialResult.data ?? []) as unknown) as T[]) ?? null,
    error: initialResult.error,
  };
}

export async function fetchProfileByUsernameOrId<T extends ProfileIdentityRecord>(
  supabaseClient: SupabaseClient,
  identifier: string,
  columns: string
): Promise<{ data: T | null; error: { message?: string; code?: string } | null }> {
  const columnsWithUserId = ensureUserIdColumn(columns);

  const usernameResult = await supabaseClient
    .from("profiles")
    .select(columnsWithUserId)
    .ilike("username", identifier)
    .maybeSingle();

  if (!isMissingUserIdColumnError(usernameResult.error)) {
    const usernameData = ((usernameResult.data as unknown) as T | null) ?? null;
    if (usernameData || usernameResult.error) {
      return { data: usernameData, error: usernameResult.error };
    }
  }

  const fallbackUsernameResult = isMissingUserIdColumnError(usernameResult.error)
    ? await supabaseClient
        .from("profiles")
        .select(columns)
        .ilike("username", identifier)
        .maybeSingle()
    : null;

  const resolvedUsernameData =
    ((fallbackUsernameResult?.data as unknown) as T | null) ?? null;
  if (resolvedUsernameData || fallbackUsernameResult?.error) {
    return {
      data: resolvedUsernameData,
      error: fallbackUsernameResult?.error ?? null,
    };
  }

  const idResult = await supabaseClient
    .from("profiles")
    .select(columnsWithUserId)
    .eq("id", identifier)
    .maybeSingle();

  if (isMissingUserIdColumnError(idResult.error)) {
    const fallbackIdResult = await supabaseClient
      .from("profiles")
      .select(columns)
      .eq("id", identifier)
      .maybeSingle();

    return {
      data: ((fallbackIdResult.data as unknown) as T | null) ?? null,
      error: fallbackIdResult.error,
    };
  }

  if (idResult.data || idResult.error) {
    return {
      data: ((idResult.data as unknown) as T | null) ?? null,
      error: idResult.error,
    };
  }

  const userIdResult = await supabaseClient
    .from("profiles")
    .select(columnsWithUserId)
    .eq("user_id", identifier)
    .maybeSingle();

  return {
    data: ((userIdResult.data as unknown) as T | null) ?? null,
    error: userIdResult.error,
  };
}
