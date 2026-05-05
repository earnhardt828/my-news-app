import type { SupabaseClient } from "@supabase/supabase-js";

type BlockedUsersColumnPair = {
  blocker: string;
  blocked: string;
  username?: string | null;
};

type RawBlockedUserRow = {
  id: number;
  created_at: string;
  [key: string]: string | number;
};

export type NormalizedBlockedUserRow = {
  id: number;
  blocked_user_id: string;
  blocked_username: string | null;
  created_at: string;
};

const BLOCKED_USERS_COLUMN_PAIRS: BlockedUsersColumnPair[] = [
  { blocker: "blocker_id", blocked: "blocked_id", username: "blocked_username" },
  { blocker: "blocker_id", blocked: "blocked_user_id", username: "blocked_username" },
  { blocker: "blocker_id", blocked: "blocked_id" },
  { blocker: "blocker_id", blocked: "blocked_user_id" },
  { blocker: "blocker_user_id", blocked: "blocked_user_id" },
  { blocker: "blocker_user_id", blocked: "blocked_id" },
];

function isMissingBlockedUsersColumnError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("blocked_users") &&
    (message.includes("column") ||
      message.includes("schema cache") ||
      error?.code === "42703" ||
      error?.code === "PGRST204")
  );
}

function normalizeBlockedUsersRow(
  row: RawBlockedUserRow,
  blockedColumn: string,
  usernameColumn?: string | null
) {
  return {
    id: row.id,
    created_at: row.created_at,
    blocked_user_id: String(row[blockedColumn] ?? ""),
    blocked_username: usernameColumn ? String(row[usernameColumn] ?? "") || null : null,
  } satisfies NormalizedBlockedUserRow;
}

export async function listBlockedUsers(
  supabaseClient: SupabaseClient,
  blockerId: string
): Promise<{
  data: NormalizedBlockedUserRow[] | null;
  error: { message?: string; code?: string } | null;
}> {
  let lastError: { message?: string; code?: string } | null = null;

  for (const pair of BLOCKED_USERS_COLUMN_PAIRS) {
    const { data, error } = await supabaseClient
      .from("blocked_users")
      .select(
        pair.username
          ? `id, ${pair.blocked}, ${pair.username}, created_at`
          : `id, ${pair.blocked}, created_at`
      )
      .eq(pair.blocker, blockerId)
      .order("created_at", { ascending: false });

    if (!error) {
      return {
        data: ((data ?? []) as unknown as RawBlockedUserRow[]).map((row) =>
          normalizeBlockedUsersRow(row, pair.blocked, pair.username)
        ),
        error: null,
      };
    }

    if (!isMissingBlockedUsersColumnError(error)) {
      return { data: null, error };
    }

    lastError = error;
  }

  return { data: null, error: lastError };
}

export async function createBlockedUser(
  supabaseClient: SupabaseClient,
  blockerId: string,
  blockedUserId: string,
  blockedUsername?: string | null
): Promise<{ error: { message?: string; code?: string } | null }> {
  let lastError: { message?: string; code?: string } | null = null;

  for (const pair of BLOCKED_USERS_COLUMN_PAIRS) {
    const payload: Record<string, string> = {
      [pair.blocker]: blockerId,
      [pair.blocked]: blockedUserId,
    };

    if (pair.username && blockedUsername) {
      payload[pair.username] = blockedUsername;
    }

    const { error } = await supabaseClient.from("blocked_users").insert(payload);

    if (!error) {
      return { error: null };
    }

    if (!isMissingBlockedUsersColumnError(error)) {
      return { error };
    }

    lastError = error;
  }

  return { error: lastError };
}

export async function removeBlockedUser(
  supabaseClient: SupabaseClient,
  blockerId: string,
  blockedUserId: string
): Promise<{ error: { message?: string; code?: string } | null }> {
  let lastError: { message?: string; code?: string } | null = null;

  for (const pair of BLOCKED_USERS_COLUMN_PAIRS) {
    const { error } = await supabaseClient
      .from("blocked_users")
      .delete()
      .eq(pair.blocker, blockerId)
      .eq(pair.blocked, blockedUserId);

    if (!error) {
      return { error: null };
    }

    if (!isMissingBlockedUsersColumnError(error)) {
      return { error };
    }

    lastError = error;
  }

  return { error: lastError };
}
